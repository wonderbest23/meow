import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import {SqliteAiBudget,type BudgetPrice} from "../lib/llm/budget-sqlite";
import {completeJson,type LLMCompleteParams} from "../lib/llm/complete";
import type {BudgetAttempt,BudgetLease} from "../lib/llm/budget";
import {executeIntakeJob,saveIntakeCommand} from "../lib/plan-builder/intake-service";
import {randomUUID} from "node:crypto";
const prices:BudgetPrice[]=["openai","anthropic"].map(provider=>({provider:provider as "openai"|"anthropic",model:"fixture",source:"SYNTHETIC ONLY - not approved model pricing",checkedAt:0,expiresAt:4102444800000,inputMicrosPerMillion:1000000,outputMicrosPerMillion:1000000,maxInputTokens:200000,maxOutputTokens:10000}));
const input=(attempt=0):BudgetAttempt=>({provider:attempt?"anthropic":"openai",model:"fixture",attempt,inputBytes:100,maxOutputTokens:100,deadline:Date.now()+10000,requestFingerprint:"a".repeat(64)});
const childEnv: NodeJS.ProcessEnv = {PATH:process.env.PATH,HOME:"/private/tmp",NODE_OPTIONS:`--require=${join(process.cwd(),"scripts/ledger-test-runtime.cjs")}`,NODE_ENV:"test",TSX_DISABLE_CACHE:"1",OPENAI_MODEL:"gpt-5.6-sol",PERSISTENCE_MODE:"demo-memory",PAYMENTS_ENABLED:"false",ADMIN_CHAT_PASSWORD:"",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:""};
if(process.argv[2]==="child"){
 const ledger=new SqliteAiBudget(process.argv[3],prices);const run=async()=>{if(process.argv[4]==="__inspect__")console.log(JSON.stringify(ledger.snapshot("duplicates")));else{const lease=await ledger.forJob("shared",process.argv[4])(input(Number(process.argv[5])));console.log(!!lease);}ledger.close();};run().catch(e=>{console.error(e);process.exitCode=1;});
}else {const keepAlive=setInterval(()=>{},1000);main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearInterval(keepAlive));}
async function main(){
 Object.assign(process.env,{NODE_ENV:"test",PERSISTENCE_MODE:"demo-memory",RATE_LIMIT_BACKEND:"memory",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:"",OPENAI_API_KEY:"synthetic",ANTHROPIC_API_KEY:"synthetic",PLANNING_MODEL:"fixture",ANTHROPIC_MODEL:"fixture"});
 const dir=mkdtempSync(join(tmpdir(),"oneulstart-cost-ledger-")),file=join(dir,"ledger.sqlite");let ledger=new SqliteAiBudget(file,prices);let failures=0;
 const check=async(name:string,fn:()=>Promise<void>)=>{try{await fn();console.log("PASS "+name);}catch(e){failures++;console.error("FAIL "+name,e);}};
 const lease=async(service:string,job:string,a=input())=>{const value=await ledger.forJob(service,job)(a);assert(value && typeof value!=="boolean");return value;};
 await check("same service cap across providers and 8 concurrent processes",async()=>{
  ledger.provision("shared",100000);
  const values=await Promise.all(Array.from({length:8},(_,i)=>new Promise<boolean>((resolve,reject)=>{const child=spawn(process.execPath,["--import",join(process.cwd(),"node_modules/tsx/dist/loader.mjs"),"scripts/llm-budget.test.ts","child",file,"job-"+i,String(i%2)],{cwd:process.cwd(),env:childEnv});let output="",err="";child.stdout.on("data",b=>output+=b);child.stderr.on("data",b=>err+=b);child.on("error",reject);child.on("exit",code=>code===0?resolve(output.trim()==="true"):reject(Error(err)));})));
  assert.equal(values.filter(Boolean).length,3);const rows=ledger.snapshot("shared").reservations;assert.equal(rows.length,3);assert(rows.reduce((s,r)=>s+Number(r.charged),0)<=100000);
 });
 await check("duplicate reservation and dispatch claim prevent duplicate sends",async()=>{
  ledger.provision("duplicates",100000);const a=await lease("duplicates","same"),b=await lease("duplicates","same");assert.equal(a.id,b.id);assert(await a.begin());assert.equal(await b.begin(),false);await b.cancel();assert.equal(ledger.snapshot("duplicates").reservations[0].state,"sent");await a.settle(null);assert.equal(ledger.snapshot("duplicates").reservations.length,1);assert.equal(await ledger.forJob("duplicates","same")(input()),false);
 });
 await check("unknown failures persist across connection/process restart without refund",async()=>{
  const before=ledger.snapshot("duplicates").reservations[0];ledger.close();ledger=new SqliteAiBudget(file,prices);const after=ledger.snapshot("duplicates").reservations[0];assert.equal(after.state,"uncertain");assert.equal(after.charged,before.charged);assert.throws(()=>ledger.provision("duplicates",200000));
  const result=await new Promise<string>((resolve,reject)=>{const c=spawn(process.execPath,["--import",join(process.cwd(),"node_modules/tsx/dist/loader.mjs"),"scripts/llm-budget.test.ts","child",file,"__inspect__"],{env:childEnv});let output="";c.stdout.on("data",b=>output+=b);c.on("error",reject);c.on("exit",code=>code===0?resolve(output):reject(Error("child failed")));});const restored=JSON.parse(result);assert.equal(restored.reservations[0].state,"uncertain");assert.equal(restored.reservations[0].charged,before.charged);
 });
 await check("known usage settles once; over-bound usage freezes service",async()=>{
  ledger.provision("settle",100000);const a=await lease("settle","one");await a.begin();const usage={inputTokens:10,outputTokens:5,model:"fixture",provider:"openai" as const};await a.settle(usage);await a.settle(usage);assert.equal(ledger.snapshot("settle").reservations[0].charged,15);await assert.rejects(a.settle({...usage,outputTokens:6}));
  const b=await lease("settle","overflow");await b.begin();await b.settle({...usage,outputTokens:101});assert.equal(ledger.snapshot("settle").budget!.halted,1);assert.equal(await ledger.forJob("settle","blocked")(input()),false);
 });
 await check("known unsent cancellation and expired reservation reclaim only unsent cost",async()=>{
  ledger.provision("unsent",100000);const a=await lease("unsent","cancel");await a.cancel();assert.equal(ledger.snapshot("unsent").reservations[0].charged,0);
  const b=await lease("unsent","claimed");await b.begin();await b.cancel();assert.equal(ledger.snapshot("unsent").reservations.find(r=>r.job==="claimed")!.charged,0);
  const exp=await lease("unsent","expire",{...input(),deadline:Date.now()+5});await new Promise(r=>setTimeout(r,10));assert.equal(await exp.begin(),false);assert.equal(ledger.snapshot("unsent").reservations.find(r=>r.job==="expire")!.charged,0);
 });
 await check("missing/expired prices, missing budget and changed request fail closed",async()=>{
  assert.equal(await ledger.forJob("missing","none")(input()),false);ledger.provision("prices",100000);assert.equal(await ledger.forJob("prices","unknown")({...input(),model:"not-priced"}),false);await lease("prices","same");assert.equal(await ledger.forJob("prices","same")({...input(),requestFingerprint:"b".repeat(64)}),false);
  const expired=new SqliteAiBudget(join(dir,"expired.sqlite"),prices.map(p=>({...p,expiresAt:1})));expired.provision("x",100000);assert.equal(await expired.forJob("x","job")(input()),false);expired.close();
 });
 const params:LLMCompleteParams={system:"JSON",user:"synthetic",maxOutputTokens:100,validateJson:v=>v.ok===true};
 const policy=(job:string)=>({alternate:{provider:"anthropic" as const,model:"fixture",apiKey:"synthetic"},allowedErrors:["unavailable" as const,"timeout" as const],totalTimeoutMs:500,attemptTimeoutMs:200,minRemainingMs:5,compatible:true,reserve:ledger.forJob("calls",job)});
 const config={provider:"openai" as const,model:"fixture",apiKey:"synthetic"};
 await check("common implementation reserves both provider costs, settles known usage",async()=>{
  ledger.provision("calls",500000);let calls=0;globalThis.fetch=async()=>++calls===1?Response.json({error:{type:"server_error"}},{status:503}):Response.json({stop_reason:"end_turn",content:[{type:"text",text:'{"ok":true}'}],usage:{input_tokens:10,output_tokens:5}});assert(await completeJson(config,{...params,failover:policy("fallback")}));const rows=ledger.snapshot("calls").reservations;assert.equal(calls,2);assert.equal(rows[0].state,"uncertain");assert.equal(rows[1].state,"settled");assert.equal(rows[1].charged,15);
 });
 await check("late reservation after timeout is cancelled without API call or leak",async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error("Must not send");};const p=policy("late");assert.equal(await completeJson(config,{...params,failover:{...p,totalTimeoutMs:20,attemptTimeoutMs:10,minRemainingMs:2,reserve:async a=>{const value=await p.reserve(a);await new Promise(r=>setTimeout(r,40));return value;}}}),null);await new Promise(r=>setTimeout(r,60));assert.equal(calls,0);assert.equal(ledger.snapshot("calls").reservations.find(r=>r.job==="late")!.charged,0);
 });
 await check("cancellation during reservation is unsent, provider timeout remains charged",async()=>{
  const controller=new AbortController(),p=policy("abort");let calls=0;globalThis.fetch=async()=>{calls++;return new Promise<Response>(()=>{});};assert.equal(await completeJson(config,{...params,signal:controller.signal,failover:{...p,reserve:async a=>{const value=await p.reserve(a);controller.abort();return value;}}}),null);assert.equal(calls,0);assert.equal(ledger.snapshot("calls").reservations.find(r=>r.job==="abort")!.charged,0);
  assert.equal(await completeJson(config,{...params,failover:{...policy("timeout"),totalTimeoutMs:20,attemptTimeoutMs:20,minRemainingMs:2}}),null);const row=ledger.snapshot("calls").reservations.find(r=>r.job==="timeout")!;assert(Number(row.charged)>0);assert(["sent","uncertain"].includes(String(row.state)));
 });
 await check("actual intake service uses persistent lease, duplicate job adds no cost rows",async()=>{
  process.env.INTAKE_HELP_FAILOVER_POLICY=JSON.stringify({primary:"openai",fallback:"anthropic",totalTimeoutMs:1000,attemptTimeoutMs:400,minRemainingMs:5,allowedErrors:["unavailable"],qualifiedModels:[{provider:"openai",model:"fixture"},{provider:"anthropic",model:"fixture"}]});
  ledger.provision("intake",200000);const owner="ledger-"+randomUUID(),start=await saveIntakeCommand(owner,{action:"start",mode:"startup",revision:0,requestId:randomUUID()});const queued=await saveIntakeCommand(owner,{action:"help",message:"고객 항목 설명",planId:start.plan.id,revision:start.snapshot.coach.revision,requestId:randomUUID()},{aiAvailable:true,aiAllowed:true});const req={ownerHash:owner,planId:start.plan.id,jobId:queued.job!.id};let calls=0;globalThis.fetch=async()=>++calls===1?Response.json({error:{type:"server_error"}},{status:503}):Response.json({stop_reason:"end_turn",content:[{type:"text",text:'{"message":"합성 안내"}'}],usage:{input_tokens:20,output_tokens:5}});const reserveCost=ledger.forJob("intake",req.jobId);assert((await executeIntakeJob(req,{reserveCost})).ok);await executeIntakeJob(req,{reserveCost});assert.equal(calls,2);assert.equal(ledger.snapshot("intake").reservations.length,2);delete process.env.INTAKE_HELP_FAILOVER_POLICY;
 });
 await check("partial usage is unknown, never zero-cost settlement",async()=>{
  let observed=0;globalThis.fetch=async()=>Response.json({status:"completed",output_text:'{"ok":true}',usage:{input_tokens:10}});assert(await completeJson(config,{...params,failover:policy("partial-usage"),onAttemptUsage:()=>observed++}));assert.equal(observed,0);const row=ledger.snapshot("calls").reservations.find(r=>r.job==="partial-usage")!;assert.equal(row.state,"uncertain");assert.equal(row.charged,row.reserved);
 });
 await check("closed ledger and production boolean approval cannot send",async()=>{
  const closed=new SqliteAiBudget(join(dir,"closed.sqlite"),prices);closed.provision("x",100000);closed.close();let calls=0;globalThis.fetch=async()=>{calls++;throw Error("Must not send");};assert.equal(await completeJson(config,{...params,failover:{...policy("closed"),reserve:closed.forJob("x","job")}}),null);Object.assign(process.env,{NODE_ENV:"production"});try{assert.equal(await completeJson(config,{...params,failover:{...policy("boolean"),reserve:async()=>true}}),null);}finally{Object.assign(process.env,{NODE_ENV:"test"});}assert.equal(calls,0);
 });
 writeFileSync(join(dir,"evidence.json"),JSON.stringify({kind:"file-backed SQLite; synthetic prices; no live providers",shared:ledger.snapshot("shared"),calls:ledger.snapshot("calls"),intake:ledger.snapshot("intake")},null,2));ledger.close();console.log(JSON.stringify({failures,persistentEvidence:join(dir,"evidence.json"),database:file,realExternalCalls:0}));process.exitCode=failures?1:0;
}
