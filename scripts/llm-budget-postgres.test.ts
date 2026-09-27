import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { BudgetAttempt, BudgetLease } from "../lib/llm/budget";
import { PostgresAiBudget } from "../lib/llm/budget-postgres.server";

// Explicitly local synthetic lab. Never read a project .env or existing DB credentials.
const childEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: "/private/tmp", NODE_ENV: "test", OPENAI_MODEL: "gpt-5.6-sol", PERSISTENCE_MODE: "demo-memory", PAYMENTS_ENABLED: "false", ADMIN_CHAT_PASSWORD: "", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", TSX_DISABLE_CACHE: "1" };
const sql = (query: string) => {
  const r = spawnSync('docker', ['exec','-i','oneul-ledger-db-Gobauz','psql','-U','postgres','-d','oneul_ledger_test',"-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { env: childEnv, input: query, encoding: "utf8", timeout: 15000 });
  if (r.status !== 0) throw Error(r.stderr); return r.stdout.trim();
};
const secret = "local-ledger-fixture-only-not-a-live-secret";
function token(role: string) {
  const text = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url")].join(".");
  return text+"."+createHmac("sha256",secret).update(text).digest("base64url");
}
const auth = token("service_role");
const client = () => createClient("http://127.0.0.1:57430", auth, { auth: { persistSession:false, autoRefreshToken:false }, global:{fetch:(input,init)=>fetch(String(input).replace('/rest/v1/','/'),init)} });
const runId = randomUUID().slice(0,8);
const catalog = process.env.LEDGER_TEST_CATALOG ?? `fixture-${runId}`;
assert.match(catalog, /^fixture-[a-f0-9]{8}$/);
childEnv.LEDGER_TEST_CATALOG = catalog;
const req = (attempt=0): BudgetAttempt => ({provider:attempt ? "anthropic" : "openai",model:"fixture",attempt,inputBytes:100,maxOutputTokens:100,deadline:Date.now()+60000,requestFingerprint:"a".repeat(64)});
const usage = {provider:"openai" as const,model:"fixture",inputTokens:10,outputTokens:5};
const large = {...usage,inputTokens:100000,outputTokens:101};
const budget = (service:string,period="p1") => new PostgresAiBudget(client(),{service,period,catalog});
async function lease(b:PostgresAiBudget,job:string,a=req()):Promise<BudgetLease>{const l=await b.forJob(job)(a);assert(l&&typeof l!=="boolean");return l;}
const state=(service:string)=>JSON.parse(sql(`select coalesce(json_agg(r order by job,attempt),'[]'::json) from ai_budget_private.reservations r where service='${service}';`));
const provision=(name:string,cap=100000)=>{const id=runId+"-"+name;sql(`insert into ai_budget_private.services(id,period_id,cap_micro_usd) values('${id}','p1',${cap});`);return id;};
async function childMain(){
 const mode=process.argv[2],service=process.argv[3];
 if(mode==="reserve-child"){
  try {const l=await lease(budget(service),process.argv[4]);console.log(JSON.stringify({id:l.id}));}catch{console.log(JSON.stringify({denied:true}));}
 } else console.log(JSON.stringify(await budget(service).lookup(process.argv[4],0)));
}
async function subprocess(mode:string,service:string,job:string){
 return new Promise<Record<string,unknown>>((resolve,reject)=>{
  const c=spawn(process.execPath,["--require",join(process.cwd(),"scripts/ledger-test-runtime.cjs"),"--import",join(process.cwd(),"node_modules/tsx/dist/loader.mjs"),__filename,mode,service,job],{env:childEnv,stdio:["ignore","pipe","pipe"]});let out="",err="";
  const timer=setTimeout(()=>{c.kill();reject(Error("child timeout"));},20000);c.stdout.on("data",v=>out+=v);c.stderr.on("data",v=>err+=v);c.on("error",reject);c.on("exit",code=>{clearTimeout(timer);code===0?resolve(JSON.parse(out.trim())):reject(Error(err));});
 });
}
async function main(){
 assert.equal(sql("select current_database();"),"oneul_ledger_test");
 sql(`insert into ai_budget_private.prices values ('${catalog}','openai','fixture',1000000,1000000,200000,10000,'SYNTHETIC TEST ONLY',now()-interval '1 hour',now()+interval '1 day',true),('${catalog}','anthropic','fixture',1000000,1000000,200000,10000,'SYNTHETIC TEST ONLY',now()-interval '1 hour',now()+interval '1 day',true);`);
 const nativeFetch=globalThis.fetch;
 const sockets=new Set<import('node:net').Socket>();
 const proxy=createServer(socket=>{
  sockets.add(socket);const c=spawn('docker',['exec','-i','oneul-ledger-db-Gobauz','bash','-c','exec 4<&0; exec 3<>/dev/tcp/oneul-ledger-rest-Gobauz/3000; cat <&4 >&3 & cat <&3'],{env:childEnv});
  socket.pipe(c.stdin);c.stdout.pipe(socket);c.stdin.on('error',()=>socket.destroy());c.on('error',()=>socket.destroy());socket.on('error',()=>{});socket.on('close',()=>{sockets.delete(socket);c.kill();});
 });
 await new Promise<void>((resolve,reject)=>{proxy.once('error',reject);proxy.listen(57430,'127.0.0.1',resolve);});
 globalThis.fetch=async(input,init)=>{const url=String(input instanceof Request?input.url:input);if(!url.startsWith('http://127.0.0.1:57430/'))throw Error('EXTERNAL_NETWORK_BLOCKED');return nativeFetch(url.replace('/rest/v1/','/'),init);};
 const results:{name:string,status:string,error?:string}[]=[];
 async function check(name:string,run:()=>Promise<void>){try{await run();results.push({name,status:'passed'});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:String(error)});console.error('FAIL '+name,error);}}
 try{
 await check('two independent HTTP clients share cap across providers',async()=>{
  const service=provision('connections');const responses=await Promise.all(Array.from({length:8},(_,i)=>budget(service).forJob('job'+i)(req(i%2)).then(()=>true,()=>false)));
  assert.equal(responses.filter(Boolean).length,3);assert.equal(state(service).length,3);assert.equal(state(service).reduce((s:number,r:{charged:number})=>s+r.charged,0),99204);
 });
 await check('separate processes serialize same-service reservations',async()=>{
  const service=provision('processes');const values=await Promise.all(Array.from({length:6},(_,i)=>subprocess('reserve-child',service,'job'+i)));assert.equal(values.filter(v=>v.id).length,3);assert.equal(state(service).length,3);
 });
 await check('same job/attempt cannot reserve or dispatch twice; payload conflict blocked',async()=>{
  const service=provision('duplicate'),b=budget(service);const a=await lease(b,'same'),duplicate=await lease(b,'same');assert.equal(a.id,duplicate.id);assert(await a.begin());await assert.rejects(duplicate.begin());await duplicate.cancel();assert.equal(state(service)[0].state,'sent');await assert.rejects(b.forJob('same')({...req(),requestFingerprint:'b'.repeat(64)}));
 });
 await check('halt after reservation prevents begin on another connection',async()=>{
  const service=provision('halt'),a=await lease(budget(service),'A'),b=await lease(budget(service),'B');await a.begin();await a.settle(large);await assert.rejects(b.begin(),/service_halted/);assert.equal(state(service)[1].state,'reserved');await b.cancel();assert.equal(state(service)[0].charged,100101);assert.equal(state(service)[1].charged,0);
 });
 await check('unknown then first usage; identical no-op; conflicting/overrun immutable',async()=>{
  const service=provision('settle'),a=await lease(budget(service),'A');await a.begin();await a.settle(null);assert.equal(state(service)[0].charged,33068);await a.settle(usage);await a.settle(usage);assert.equal(state(service)[0].charged,15);await assert.rejects(a.settle({...usage,outputTokens:6}),/settlement_conflict/);
  const b=await lease(budget(service),'B');await b.begin();await b.settle(large);await b.settle(large);await b.settle(null);await assert.rejects(b.settle(usage),/settlement_conflict/);assert.equal(state(service)[1].charged,100101);assert.equal(state(service)[1].state,'uncertain');
 });
 await check('integer overflow preserves exact numeric cost and cannot be reduced',async()=>{
  const service=provision('integer'),a=await lease(budget(service),'A');await a.begin();const huge={...usage,inputTokens:Number.MAX_SAFE_INTEGER,outputTokens:Number.MAX_SAFE_INTEGER};
  await assert.rejects(a.settle(huge),/cost_integer_overflow/);assert.equal(sql(`select actual_micro_usd::text from ai_budget_private.reservations where service='${service}';`),'18014398509481982');
  await a.settle(huge);await assert.rejects(a.settle(usage),/settlement_conflict/);assert.equal(state(service)[0].charged,Number.MAX_SAFE_INTEGER);
 });
 await check('lost reserve response recovered by same ID; delayed response cancellation',async()=>{
  const service=provision('lost'),base=client();let drop=true;
  const unreliable={rpc:async(name:string,args:Record<string,unknown>)=>{const result=await base.rpc(name,args);if(drop){drop=false;throw Error('synthetic lost response');}return result;}};
  const b=new PostgresAiBudget(unreliable as unknown as Pick<ReturnType<typeof client>,'rpc'>,{service,period:'p1',catalog});
  await assert.rejects(b.forJob('lost')(req()),/ledger_unavailable/);const row=await budget(service).lookup('lost',0);const recovered=await lease(budget(service),'lost');assert.equal(row.id,recovered.id);assert.equal(state(service).length,1);await recovered.cancel();assert.equal(state(service)[0].charged,0);
  let release!:()=>void;const wait=new Promise<void>(r=>release=r);const delayed={rpc:async(name:string,args:Record<string,unknown>)=>{const result=await base.rpc(name,args);if(name==='ai_budget_reserve')await wait;return result;}};
  const pending=lease(new PostgresAiBudget(delayed as unknown as Pick<ReturnType<typeof client>,'rpc'>,{service,period:'p1',catalog}),'late');
  while(state(service).length<2)await new Promise(r=>setTimeout(r,5));release();await (await pending).cancel();assert.equal(state(service)[0].charged+state(service)[1].charged,0);
 });
 await check('new process reads persistent usage and period change does not refund unknown cost',async()=>{
  const service=provision('period'),a=await lease(budget(service),'A');await a.begin();await a.settle(null);const seen=await subprocess('inspect-child',service,'A');assert.equal(seen.state,'uncertain');assert.equal(seen.charged,33068);
  sql(`update ai_budget_private.services set period_id='p2' where id='${service}';update ai_budget_private.reservations set deadline=now()-interval '1 day' where service='${service}';`);
  await assert.rejects(budget(service,'p2').forJob('A')(req()),/reservation_already_used/);await lease(budget(service,'p2'),'B');await lease(budget(service,'p2'),'C');await assert.rejects(budget(service,'p2').forJob('D')(req()),/budget_exhausted/);assert.equal(state(service)[0].charged,33068);
 });
 await check('PUBLIC-only role, anon, authenticated cannot access tables or any ledger RPC',async()=>{
  for(const role of ['public_probe','anon','authenticated']){
   for(const query of ['select * from ai_budget_private.services','select * from ai_budget_private.prices','select * from ai_budget_private.reservations','select * from ai_budget_private.events',"select public.ai_budget_lookup('x','x',0)","select public.ai_budget_reserve('x','p','c','j',0,'{}')","select public.ai_budget_transition('x','00000000-0000-0000-0000-000000000000','begin',null,null)"]){assert.throws(()=>sql(`set role ${role};${query};`),/permission denied/);}
  }
  for(const role of ['anon','authenticated']){const c=createClient('http://127.0.0.1:57430',token(role),{auth:{persistSession:false}});const result=await c.rpc('ai_budget_lookup',{p_service:'x',p_job:'x',p_attempt:0});assert(result.error);}
 });
 await check('unknown/missing model price and ledger transport failure never approve',async()=>{
  const service=provision('denial');await assert.rejects(budget(service).forJob('x')({...req(),model:'unqualified'}),/model_price_unverified/);await assert.rejects(budget('no-such-service').forJob('x')(req()),/budget_not_configured/);
  const broken=new PostgresAiBudget({rpc:async()=>{throw Error('offline');}} as unknown as Pick<ReturnType<typeof client>,'rpc'>,{service,period:'p1',catalog});await assert.rejects(broken.forJob('x')(req()),/ledger_unavailable/);assert.equal(state(service).length,0);
 });
 // The actual two execution entry functions, with only Next's after scheduler replaced in Node.
 Object.assign(process.env,{NODE_ENV:'test',PERSISTENCE_MODE:'supabase',SUPABASE_URL:'http://127.0.0.1:57430',SUPABASE_SERVICE_ROLE_KEY:auth,PLAN_ACCOUNT_LINKING_ENABLED:'true',OPENAI_API_KEY:'synthetic',ANTHROPIC_API_KEY:'synthetic',PLANNING_MODEL:'fixture',ANTHROPIC_MODEL:'fixture',RATE_LIMIT_BACKEND:'memory',AI_BUDGET_PERIOD_ID:'p1',AI_BUDGET_PRICE_CATALOG:catalog});
 const callbacks:(()=>Promise<void>)[]=[];(globalThis as unknown as {__ledgerAfter:typeof callbacks}).__ledgerAfter=callbacks;
 const {dispatchIntakeJob}=await import('../lib/plan-builder/intake-http');
 const {callIntakeService,handlePlanSectionServiceRequest}=await import('../lib/plan-builder/section-service');
 const {saveIntakeCommand}=await import('../lib/plan-builder/intake-service');
 const {loadPlanState}=await import('../lib/plan-builder/plan-server-store');
 const {readIntake}=await import('../lib/plan-builder/intake-core');
 const {readCoach}=await import('../lib/plan-builder/coach');
 const policy=JSON.stringify({primary:'openai',fallback:'anthropic',totalTimeoutMs:20000,attemptTimeoutMs:10000,minRemainingMs:20,allowedErrors:['unavailable'],qualifiedModels:[{provider:'openai',model:'fixture'},{provider:'anthropic',model:'fixture'}]});
 const service=provision('intake',5000000);process.env.AI_SERVICE_BUDGET_ID=service;
 const invoke=async(path:string,request:Parameters<typeof dispatchIntakeJob>[0])=>{
  if(path==='after'){await dispatchIntakeJob(request);const callback=callbacks.shift();assert(callback);await callback();}
  else await callIntakeService({fetch:async(input:RequestInfo|URL,init?:RequestInit)=>{const result=await handlePlanSectionServiceRequest(new Request(input,init),{SUPABASE_SERVICE_ROLE_KEY:auth} as CloudflareEnv);assert(result);return result;}} as unknown as Fetcher,auth,request);
 };
 for(const path of ['after','signed'])for(const outcome of ['primary','fallback','failure','stale'])await check(`actual ${path} entry + PostgreSQL saved state: ${outcome}`,async()=>{
  process.env.AI_SERVICE_BUDGET_ID=service;process.env.AI_BUDGET_PERIOD_ID='p1';process.env.AI_BUDGET_PRICE_CATALOG=catalog;
  process.env.INTAKE_HELP_FAILOVER_POLICY=policy;
  const owner='pg-'+randomUUID();const started=await saveIntakeCommand(owner,{action:'start',mode:'startup',revision:0,requestId:randomUUID()});
  const queued=await saveIntakeCommand(owner,{action:'help',message:'합성 고객 질문',planId:started.plan.id,revision:started.snapshot.coach.revision,requestId:randomUUID()},{aiAvailable:true,aiAllowed:true});
  const request={ownerHash:owner,planId:started.plan.id,jobId:queued.job!.id};let calls=0,conditionChanged=false;
  globalThis.fetch=async(input,init)=>{
   const url=String(input instanceof Request?input.url:input);
   if(url.startsWith('http://127.0.0.1:57430/'))return nativeFetch(url.replace('/rest/v1/','/'),init);
   if(!url.startsWith('https://api.openai.com/')&&!url.startsWith('https://api.anthropic.com/'))throw Error('EXTERNAL_NETWORK_BLOCKED');
   calls++;
   if(outcome==='stale'){
    const current=(await loadPlanState(owner)).plans.find(p=>p.id===request.planId)!;
    await saveIntakeCommand(owner,{action:'resources',resourceLimits:{monthlyOperatingCost:'0원'},planId:request.planId,revision:readCoach(current.answers)!.revision,requestId:randomUUID()});conditionChanged=true;
   }
   if(outcome==='fallback'&&calls===1){process.env.AI_SERVICE_BUDGET_ID='changed-during-call';process.env.AI_BUDGET_PERIOD_ID='changed-period';process.env.AI_BUDGET_PRICE_CATALOG='changed-catalog';}
   if(outcome==='failure'||outcome==='fallback'&&calls===1)return Response.json({error:{type:'server_error'}},{status:503});
   return url.includes('anthropic')?Response.json({stop_reason:'end_turn',content:[{type:'text',text:'{"message":"합성 답변"}'}],usage:{input_tokens:10,output_tokens:5}}):Response.json({status:'completed',output_text:'{"message":"합성 답변"}',usage:{input_tokens:10,output_tokens:5}});
  };
  await invoke(path,request);
  const stored=(await loadPlanState(owner)).plans.find(p=>p.id===request.planId)!;const job=readIntake(stored.answers)!.job!;
  const rows=state(service).filter((r:{job:string})=>r.job===request.jobId);
  assert.equal(calls,outcome==='fallback'||outcome==='failure'?2:1);assert.equal(rows.length,calls);
  assert.equal(job.status,outcome==='failure'||outcome==='stale'?'failed':'complete');
  if(outcome==='primary'||outcome==='fallback')assert.equal(rows.at(-1).charged,15);
  if(outcome==='failure')assert(rows.every((r:{state:string;charged:number})=>r.state==='uncertain'&&r.charged>0));
  if(outcome==='stale'){assert(conditionChanged,'condition update must actually finish before valid response');assert.equal(rows[0].charged,15,'valid provider response and usage reached the service');assert.match(job.error!,/사업정보가 바뀌었/);assert.equal(job.reply,undefined);}
  await invoke(path,request);assert.equal(rows.length,state(service).filter((r:{job:string})=>r.job===request.jobId).length);assert.equal(calls,outcome==='fallback'||outcome==='failure'?2:1);
 });
 for(const feature of ['ideas','design','extract'] as const)await check(`${feature} uses the same service budget and persistent plan store`,async()=>{
  const key=`INTAKE_${feature.toUpperCase()}_FAILOVER_POLICY`;process.env[key]=policy;
  const owner='pg-'+randomUUID();let current=await saveIntakeCommand(owner,{action:'start',mode:feature==='ideas'?'exploring':'startup',questionId:feature==='design'?'business':undefined,value:feature==='design'?'온라인 사진 편집 서비스':undefined,revision:0,requestId:randomUUID()});
  if(feature==='extract')current=await saveIntakeCommand(owner,{action:'note',message:'직장인을 돕는 일을 해보고 싶어요',planId:current.plan.id,revision:current.snapshot.coach.revision,requestId:randomUUID()});
  const queued=await saveIntakeCommand(owner,{action:feature,message:feature==='ideas'?'새로운 방향으로 제안해줘':undefined,planId:current.plan.id,revision:current.snapshot.coach.revision,requestId:randomUUID()},{aiAvailable:true,aiAllowed:true});
  const idea=(n:number)=>({title:`합성 후보 ${n}`,description:`설명 ${n}`,customer:`고객 ${n}`,problem:`문제 ${n}`,offering:`제공 ${n}`,delivery:`방식 ${n}`,revenue:`대가 ${n}`,differences:`차이 ${n}`,unknowns:['실제 검증 필요'],structure:{payer:'b2b',offering:'service',delivery:'online',revenue:'project'}});
  const value=feature==='ideas'?{ideas:[idea(1),idea(2)]}:feature==='extract'?{candidates:[]}:{approach:'known-business',startingPlan:{scope:'합성 계획',connectionToVision:'합성 연결',whyThis:'합성 이유',notIncluded:['실제 검증']},alternatives:[{name:'합성 대안',scope:'합성 범위',tradeoff:'합성 차이'}],assumptions:[{statement:'합성 가정',howToCheck:'별도 검증'}],nextAction:{action:'합성 행동',doneWhen:'합성 완료',usableText:'합성 문구'}};
  let calls=0;globalThis.fetch=async(input,init)=>{const url=String(input instanceof Request?input.url:input);if(url.startsWith('http://127.0.0.1:57430/'))return nativeFetch(url.replace('/rest/v1/','/'),init);if(!url.startsWith('https://api.openai.com/'))throw Error('EXTERNAL_NETWORK_BLOCKED');calls++;return Response.json({status:'completed',output_text:JSON.stringify(value),usage:{input_tokens:10,output_tokens:5}});};
  assert(queued.job);await invoke('signed',{ownerHash:owner,planId:current.plan.id,jobId:queued.job.id});
  assert.equal(readIntake((await loadPlanState(owner)).plans.find(p=>p.id===current.plan.id)!.answers)!.job!.status,'complete');assert.equal(calls,1);
  assert.equal(state(service).filter((r:{job:string})=>r.job===queued.job!.id).length,1);delete process.env[key];
 });
 await check('policy absent preserves legacy; configured missing budget blocks and preserves request',async()=>{
  for(const configured of [false,true]){
   if(configured)process.env.INTAKE_HELP_FAILOVER_POLICY=policy;else delete process.env.INTAKE_HELP_FAILOVER_POLICY;
   delete process.env.AI_SERVICE_BUDGET_ID;
   const owner='pg-'+randomUUID(),started=await saveIntakeCommand(owner,{action:'start',mode:'startup',revision:0,requestId:randomUUID()});
   const queued=await saveIntakeCommand(owner,{action:'help',message:'보존해야 할 질문',planId:started.plan.id,revision:started.snapshot.coach.revision,requestId:randomUUID()},{aiAvailable:true,aiAllowed:true});let calls=0;
   globalThis.fetch=async(input,init)=>{const url=String(input instanceof Request?input.url:input);if(url.startsWith('http://127.0.0.1:57430/'))return nativeFetch(url.replace('/rest/v1/','/'),init);if(!url.startsWith('https://api.openai.com/')&&!url.startsWith('https://api.anthropic.com/'))throw Error('EXTERNAL_NETWORK_BLOCKED');calls++;return Response.json({status:'completed',output_text:'{"message":"합성 답변"}',usage:{input_tokens:10,output_tokens:5}});};
   await invoke('signed',{ownerHash:owner,planId:started.plan.id,jobId:queued.job!.id});
   const job=readIntake((await loadPlanState(owner)).plans.find(p=>p.id===started.plan.id)!.answers)!.job!;
   assert.equal(calls,configured?0:1);assert.equal(job.status,configured?'failed':'complete');if(configured){assert.match(job.error!,/budget_not_configured/);assert.equal(job.request,'보존해야 할 질문');}
  }
 });
 }finally{globalThis.fetch=nativeFetch;for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>proxy.close(()=>resolve()));}
 const evidence={runId,results,storage:'real PostgreSQL17 + PostgREST14 localhost dedicated containers',liveProviderCalls:0,customerCreditBilling:'NOT VERIFIED',nextAfter:'scheduler shim only; actual dispatch function executed',databaseRows:JSON.parse(sql(`select coalesce(json_agg(r),'[]'::json) from (select service,job,attempt,state,charged,input_tokens,output_tokens,period_id from ai_budget_private.reservations where service like '${runId}-%') r;`))};
 const output=process.env.LEDGER_TEST_OUTPUT??'/private/tmp/ledger-postgres-results.json';writeFileSync(output,JSON.stringify(evidence,null,2));console.log(JSON.stringify({total:results.length,failed:results.filter(r=>r.status==='failed').length,evidence:output}));process.exitCode=results.some(r=>r.status==='failed')?1:0;
}
(process.argv[2]?.endsWith('-child')?childMain():main()).catch(error=>{console.error(error);process.exitCode=1;});
