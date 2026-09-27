import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {saveIntakeCommand,executeIntakeJob} from "../lib/plan-builder/intake-service";
import {loadPlanState} from "../lib/plan-builder/plan-server-store";
import {readCoach,currentBusinessDesign} from "../lib/plan-builder/coach";
import {readIntake,intakeSnapshot} from "../lib/plan-builder/intake-core";
import {IDEA_CALL_TIMEOUT_MS,IDEA_RESULT_DEADLINE_MS,ideaReplySchema} from "../lib/plan-builder/intake-ideas";
import {typedEntryCommand,needsEntryConfirmation,previewIntakeAnswer} from "../app/plan/chat/intake-ui/model";
import type {IntakeCommand} from "../lib/plan-builder/intake-types";

Object.assign(process.env,{NODE_ENV:"test",PERSISTENCE_MODE:"demo-memory",RATE_LIMIT_BACKEND:"memory",PLAN_ACCOUNT_LINKING_ENABLED:"false",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:"",OPENAI_API_KEY:"ideas-dummy-only",ANTHROPIC_API_KEY:"",OPENAI_MODEL:"idea-fixture",PLANNING_MODEL:"idea-fixture"});
const fixture=(n:number)=>({title:`합성 미분류 사업 ${n}`,description:`목록 밖 합성 제공안 ${n}`,customer:`합성 고객 ${n}`,problem:`합성 문제 ${n}`,offering:`합성 제공 항목 ${n}`,delivery:`온라인 합성 방식 ${n}`,revenue:`프로젝트 합성 대가 ${n}`,differences:`고객과 제공 항목을 기존 제안과 다르게 구성 ${n}`,unknowns:["수요와 필요 자원 미검증"],structure:{payer:"b2b",offering:"service",delivery:"online",revenue:"project"}});
const reply=(n=1)=>({ideas:[fixture(n),fixture(n+1)]});
let calls=0,failures=0,nextReply:unknown=reply(),captures:string[]=[],response:()=>Promise<Response>=async()=>Response.json({status:"completed",output_text:JSON.stringify(nextReply)});
globalThis.fetch=async(url,init)=>{assert.equal(String(url),"https://api.openai.com/v1/responses");assert.equal(new Headers(init?.headers).get("authorization"),"Bearer ideas-dummy-only");calls++;captures.push(String(init?.body));return response();};
async function check(name:string,fn:()=>unknown){try{await fn();console.log("PASS "+name);}catch(e){failures++;console.error("FAIL "+name,e);}}
async function session(mode:"exploring"|"startup"|"operating"="exploring"){
 const owner="ideas-test-"+randomUUID();let saved=await saveIntakeCommand(owner,{action:"start",mode,revision:0,requestId:randomUUID()});
 const refresh=async()=>{const plan=(await loadPlanState(owner)).plans.find(p=>p.id===saved.plan.id)!;return {plan,snapshot:intakeSnapshot(plan,readCoach(plan.answers)!,readIntake(plan.answers)!)};};
 return {owner,get saved(){return saved;},refresh,async send(patch:Omit<IntakeCommand,"revision"|"requestId"|"planId">){const now=await refresh();saved=await saveIntakeCommand(owner,{...patch,planId:now.plan.id,revision:now.snapshot.coach.revision,requestId:randomUUID()},{aiAvailable:true,aiAllowed:true});return saved;},async generate(message="목록 밖 후보를 제안해줘",rejectIds:string[]=[]){const job=await this.send({action:"ideas",message,rejectIds});assert(job.job);const result=await executeIntakeJob({ownerHash:owner,planId:job.plan.id,jobId:job.job.id});return {...await refresh(),result};}};
}
async function main(){
 await check("existing entry modes and ambiguous free entry preserved",async()=>{
  for(const mode of ["exploring","startup","operating"] as const){const s=await session(mode);assert.equal(s.saved.snapshot.intake.mode,mode);assert(s.saved.snapshot.nextQuestion);if(mode!=="exploring"){const before=calls;await assert.rejects(s.send({action:"ideas",message:"새 사업"}),/탐색 대화/);assert.equal(calls,before);assert.equal((await s.refresh()).snapshot.intake.mode,mode);}}
  assert.equal(typedEntryCommand("아이디어가 없어요").mode,"exploring");assert.equal(typedEntryCommand("카페를 운영 중인데 아직 적자예요").mode,"operating");assert(needsEntryConfirmation("카페를 운영하고 있지는 않아요"));
 });
 await check("outside catalogue saved without confirming business; follow-up prompt preserves conditions and rejection history",async()=>{
  const s=await session();await s.send({action:"resources",resourceLimits:{initialCost:"0원",monthlyOperatingCost:"10~20만원",preparationHours:"미정",weeklyOperatingHours:"주당 5시간"}});
  await s.send({action:"note",message:"서울에서 3년간 디자인 업무를 했어요. 카페와 쇼핑몰은 제외해 주세요"});
  const before=await s.refresh();nextReply=reply(11);const generated=await s.generate("카페와 쇼핑몰 말고 다른 방향으로 제안해줘");assert(generated.result.ok);
  assert.equal(generated.snapshot.intake.generatedIdeas?.length,2);assert.deepEqual(generated.snapshot.coach.business,before.snapshot.coach.business);assert.deepEqual(generated.snapshot.coach.fields,before.snapshot.coach.fields);
  assert(generated.snapshot.candidateIdeas.some(i=>i.source==="ai-generated"));assert.equal(generated.snapshot.intake.generatedIdeas![0].planId,s.saved.plan.id);
  const first=generated.snapshot.intake.generatedIdeas![0];nextReply=reply(21);const revised=await s.generate("방금 후보와 다른 고객을 대상으로 생각해줘. 첫 후보는 매장 운영이 싫어서 제외해줘",[first.id]);assert(revised.result.ok);
  const prompt=captures.at(-1)!;for(const text of ["0원","10~20만원","미정","주당 5시간","서울","3년","카페와 쇼핑몰",first.id,first.customer,"매장 운영이 싫어서"])assert(prompt.includes(text),text);
  console.log("PROMPT_EXAMPLE "+JSON.stringify(JSON.parse(prompt).input));assert(revised.snapshot.intake.generatedIdeas!.find(i=>i.id===first.id)!.rejected);
  const stableIds=revised.snapshot.intake.generatedIdeas!.map(i=>i.id);assert.deepEqual((await s.refresh()).snapshot.intake.generatedIdeas!.map(i=>i.id),stableIds);
 });
 await check("combine, online delivery and unclassified follow-ups are requests, not automatic confirmation",async()=>{
  const s=await session();let n=31;for(const message of ["두 후보를 결합해줘","매장 없이 온라인으로 제공하는 방식으로 바꿔줘","아직 업종 이름이 없는 사업인데 구체화해줘"]){nextReply=reply(n);n+=2;assert((await s.generate(message)).result.ok);assert(captures.at(-1)!.includes(message));assert.equal((await s.refresh()).snapshot.coach.ready,false);}
  assert(captures.at(-1)!.includes("두 후보를 결합해줘"));assert.equal((await s.refresh()).snapshot.intake.generatedIdeas!.length,6);
 });
 await check("explicit selection connects canonical questions, R01 and existing design job",async()=>{
  const s=await session();nextReply=reply(51);const generated=await s.generate();const idea=generated.snapshot.intake.generatedIdeas![0];
  const selected=await s.send({action:"answer",questionId:"candidate",value:idea.id});assert.equal(selected.snapshot.coach.business.name,idea.title);assert.equal(selected.snapshot.intake.sector,"general");assert.equal(selected.snapshot.coach.business.industry,"");assert.equal(selected.snapshot.coach.ready,true);assert(selected.snapshot.nextQuestion);
  assert.equal(selected.snapshot.resourceAssessment!.selected!.resourceFit!.status,"unknown");assert.equal(selected.snapshot.intake.structure!.delivery,"online");assert.equal(selected.snapshot.coach.fields.find(f=>f.key==="customer")!.value,idea.customer);
  nextReply={approach:"known-business",startingPlan:{scope:"합성 계획",connectionToVision:"합성 연결",whyThis:"합성 이유",notIncluded:["실제 검증"]},alternatives:[{name:"합성 대안",scope:"합성 범위",tradeoff:"합성 차이"}],assumptions:[{statement:"합성 가정",howToCheck:"별도 검증"}],nextAction:{action:"합성 행동",doneWhen:"합성 완료",usableText:"합성 문구"}};
  const queued=await s.send({action:"design"});assert((await executeIntakeJob({ownerHash:s.owner,planId:queued.plan.id,jobId:queued.job!.id})).ok);assert(captures.at(-1)!.includes(idea.offering));assert(captures.at(-1)!.includes(idea.revenue));assert(currentBusinessDesign((await s.refresh()).snapshot.coach));
 });
 await check("ownership, cross-project IDs and stale selection rejected",async()=>{
  const s=await session(),other=await session();nextReply=reply(61);const generated=await s.generate(),idea=generated.snapshot.intake.generatedIdeas![0];
  await assert.rejects(saveIntakeCommand(other.owner,{action:"answer",planId:s.saved.plan.id,questionId:"candidate",value:idea.id,revision:generated.snapshot.coach.revision,requestId:randomUUID()}),/찾을 수/);
  await assert.rejects(other.send({action:"answer",questionId:"candidate",value:idea.id}),/이 사업에서/);
  await s.send({action:"resources",resourceLimits:{monthlyOperatingCost:"0원"}});await assert.rejects(s.send({action:"answer",questionId:"candidate",value:idea.id}),/조건이 바뀌/);
 });
 await check("idempotent request and duplicate job dispatch call once",async()=>{
  const s=await session(),now=await s.refresh();const command:IntakeCommand={action:"ideas",message:"새로운 제안",planId:now.plan.id,revision:now.snapshot.coach.revision,requestId:randomUUID()};
  const queued=await saveIntakeCommand(s.owner,command,{aiAvailable:true,aiAllowed:true});const duplicate=await saveIntakeCommand(s.owner,command,{aiAvailable:true,aiAllowed:true});assert(duplicate.duplicate);assert.equal(duplicate.job!.id,queued.job!.id);
  nextReply=reply(71);const before=calls;const request={ownerHash:s.owner,planId:now.plan.id,jobId:queued.job!.id};await executeIntakeJob(request);await executeIntakeJob(request);assert.equal(calls-before,1);assert.equal((await s.refresh()).snapshot.intake.generatedIdeas!.length,2);
 });
 await check("failure stores request without AI-success fallback; explicit retry succeeds",async()=>{
  const s=await session();nextReply={invalid:true};const before=calls;const failed=await s.generate("실패해도 이 요청을 유지해줘");assert.equal(failed.result.ok,false);assert.equal(calls-before,1);assert.equal(failed.snapshot.intake.generatedIdeas?.length??0,0);assert.equal(failed.snapshot.intake.job!.status,"failed");assert.equal(failed.snapshot.intake.ideaTurns![0].request,"실패해도 이 요청을 유지해줘");
  nextReply=reply(81);assert((await s.generate(failed.snapshot.intake.job!.request!)).result.ok);assert.equal((await s.refresh()).snapshot.intake.generatedIdeas!.length,2);
 });
 await check("title-only duplicates rejected without another provider call",async()=>{
  const s=await session();nextReply=reply(91);assert((await s.generate()).result.ok);nextReply={ideas:reply(91).ideas.map(i=>({...i,title:i.title+" 새 이름"}))};const before=calls;const failed=await s.generate("다른 후보");assert.equal(failed.result.ok,false);assert.equal(calls-before,1);assert.equal(failed.snapshot.intake.generatedIdeas!.length,2);
 });
 await check("input changes while queued/running prevent stale proposals and preserve modifications",async()=>{
  const s=await session();let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>started=r);nextReply=reply(101);response=async()=>{started();await gate;return Response.json({status:"completed",output_text:JSON.stringify(nextReply)});};
  const queued=await s.send({action:"ideas",message:"지연된 제안"});const task=executeIntakeJob({ownerHash:s.owner,planId:queued.plan.id,jobId:queued.job!.id});await seen;
  const changed=await s.send({action:"resources",resourceLimits:{preparationHours:"0시간"}});release();assert.equal((await task).ok,false);assert.equal((await s.refresh()).snapshot.intake.generatedIdeas?.length??0,0);assert.equal((await s.refresh()).snapshot.intake.answers["resource.preparationHours"].value,"0시간");
  response=async()=>Response.json({status:"completed",output_text:JSON.stringify(nextReply)});
  const q=await s.send({action:"ideas",message:"대기 중 변경"});await s.send({action:"note",message:"새로 확인한 제외 조건"});const before=calls;assert.equal((await executeIntakeJob({ownerHash:s.owner,planId:q.plan.id,jobId:q.job!.id})).ok,false);assert.equal(calls,before);
  const now=await s.refresh();const command:IntakeCommand={action:"resources",resourceLimits:{monthlyOperatingCost:"1만원"},planId:now.plan.id,revision:now.snapshot.coach.revision,requestId:randomUUID()};const preview=previewIntakeAnswer(now.snapshot,command)!;const saved=await saveIntakeCommand(s.owner,command);assert.equal(preview.intake.ideaInputRevision,saved.snapshot.intake.ideaInputRevision);assert(changed.snapshot.intake.ideaInputRevision);
 });
 await check("total deadline rejects queued work without any provider call",async()=>{
  const s=await session();const queued=await s.send({action:"ideas",message:"기한 검사"});const original=Date.now,before=calls;
  try{Date.now=()=>Date.parse(queued.job!.createdAt!)+IDEA_RESULT_DEADLINE_MS+1;assert.equal((await executeIntakeJob({ownerHash:s.owner,planId:queued.plan.id,jobId:queued.job!.id})).ok,false);}finally{Date.now=original;}
  assert.equal(calls,before);assert.equal((await s.refresh()).snapshot.intake.ideaTurns![0].status,"failed");
 });
 assert.equal(IDEA_CALL_TIMEOUT_MS,60000);assert.equal(IDEA_RESULT_DEADLINE_MS,120000);assert(ideaReplySchema.safeParse(reply()).success);
 console.log(JSON.stringify({failures,mockProviderCalls:calls,realExternalCalls:0,qualityValidated:false}));process.exitCode=failures?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
