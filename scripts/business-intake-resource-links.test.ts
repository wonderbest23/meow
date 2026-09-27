import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseResourceLimit } from "../lib/plan-builder/intake-candidate-fit";
import { coachAmount } from "../lib/plan-builder/coach-feasibility";
import { saveIntakeCommand, executeIntakeJob } from "../lib/plan-builder/intake-service";
import { confirmedIntakeContext } from "../lib/plan-builder/intake-context";
import { currentBusinessDesign, readCoach } from "../lib/plan-builder/coach";
import { loadPlanState } from "../lib/plan-builder/plan-server-store";
import type { IntakeCommand } from "../lib/plan-builder/intake-types";

Object.assign(process.env,{NODE_ENV:"test",PERSISTENCE_MODE:"demo-memory",RATE_LIMIT_BACKEND:"memory",PLAN_ACCOUNT_LINKING_ENABLED:"false",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:"",OPENAI_API_KEY:"r01-dummy-only",ANTHROPIC_API_KEY:"",OPENAI_MODEL:"r01-links-fixture",PLANNING_MODEL:"r01-links-fixture"});
const context={variant:"synthetic delivery",region:"synthetic region",scale:"synthetic one operator"};
const design={approach:"known-business",startingPlan:{scope:"합성 사업안",connectionToVision:"합성 연결",whyThis:"합성 이유",notIncluded:["실제 검증"]},alternatives:[{name:"합성 대안",scope:"합성 범위",tradeoff:"합성 차이"}],assumptions:[{statement:"합성 가정",howToCheck:"별도 검증"}],nextAction:{action:"합성 행동",doneWhen:"합성 완료",usableText:"합성 문구"}};
let calls=0, failures=0, respond:()=>Promise<Response>=async()=>Response.json({status:"completed",output_text:JSON.stringify(design)}),captured="";
globalThis.fetch=async(url,init)=>{assert.equal(String(url),"https://api.openai.com/v1/responses");assert.equal(new Headers(init?.headers).get("authorization"),"Bearer r01-dummy-only");calls++;captured=String(init?.body);return respond();};
async function check(name:string,run:()=>unknown){try{await run();console.log("PASS "+name);}catch(e){failures++;console.error("FAIL "+name,e);}}
async function session(){const owner="r01-links-"+randomUUID();let saved=await saveIntakeCommand(owner,{action:"start",mode:"startup",questionId:"business",value:"합성 서비스",revision:0,requestId:randomUUID()});return {owner,get saved(){return saved;},async send(input:Omit<IntakeCommand,"revision"|"requestId"|"planId">){saved=await saveIntakeCommand(owner,{...input,planId:saved.plan.id,revision:saved.snapshot.coach.revision,requestId:randomUUID()},{aiAvailable:true,aiAllowed:true});return saved;}};}
async function main(){
 await check("money aliases, explicit zero, bounded ranges and invalid input",()=>{
  for(const [a,b,n]of [["3000만원","3천만원",30000000],["500만원","5백만원",5000000],["0원","0만원",0]] as const){assert.equal(coachAmount(a),n);assert.equal(coachAmount(b),n);for(const v of [a,b])assert.deepEqual(parseResourceLimit(v,"initialCost"),{status:"known",raw:v,lower:n,upper:n});}
  for(const raw of ["100~300만원","100만원~300만원","1백만원~3백만원"])assert.deepEqual(parseResourceLimit(raw,"initialCost"),{status:"known",raw,lower:1000000,upper:3000000});
  for(const raw of ["300만원~100만원","월 100만원","100시간","1,2,3만원","999x".repeat(10000)])assert.equal(parseResourceLimit(raw,"initialCost").status,"invalid");
  assert.equal(parseResourceLimit("미정","initialCost").status,"unknown");
 });
 await check("quote assumptions invalidate on structure changes, not notes; original retained",async()=>{
  const s=await session();await s.send({action:"resources",resourceLimits:{initialCost:"300원"},resourceQuote:{candidateId:"custom-business",metric:"initialCost",raw:"100~200원",context,reference:"SYNTHETIC quote",includedItems:"synthetic total",excludedItems:"",complete:true,expiresAt:"2099-01-01T00:00:00.000Z",confirmed:true}});
  assert.equal(s.saved.snapshot.resourceAssessment?.selected?.resourceFit?.metrics.initialCost.status,"fits",JSON.stringify(s.saved.snapshot.resourceAssessment?.selected));
  const original=structuredClone(s.saved.snapshot.intake.resourceQuotes),name=s.saved.snapshot.coach.business.name;
  await s.send({action:"note",message:"무관한 합성 메모"});assert.equal(s.saved.snapshot.resourceAssessment?.selected?.resourceFit?.metrics.initialCost.status,"fits");
  for(const structure of [{delivery:"online"},{revenue:"subscription"},{offering:"goods"}] as const){await s.send({action:"structure",structure});assert.equal(s.saved.snapshot.resourceAssessment?.selected?.resourceFit?.metrics.initialCost.status,"unknown");assert.match(s.saved.snapshot.resourceAssessment!.selected!.resourceFit!.metrics.initialCost.message,/재확인|가정/);}
  assert.deepEqual(s.saved.snapshot.intake.resourceQuotes,original);assert.equal(s.saved.snapshot.coach.business.name,name);
  await s.send({action:"resources",resourceQuote:{candidateId:"custom-business",metric:"initialCost",raw:"100~200원",context,reference:"SYNTHETIC reconfirmation",includedItems:"synthetic total",excludedItems:"",complete:true,expiresAt:"2099-01-01T00:00:00.000Z",confirmed:true}});
  assert.equal(s.saved.snapshot.resourceAssessment?.selected?.resourceFit?.metrics.initialCost.status,"fits");
  await s.send({action:"answer",questionId:"offer",value:"이전과 다른 합성 제공 항목"});assert.equal(s.saved.snapshot.resourceAssessment?.selected?.resourceFit?.metrics.initialCost.status,"unknown");
 });
 await check("saved four limits reach source context and actual mocked design prompt",async()=>{
  const s=await session();await s.send({action:"resources",resourceLimits:{initialCost:"100~300만원",monthlyOperatingCost:"0만원",preparationHours:"총 31~47시간",weeklyOperatingHours:"미정"}});
  await s.send({action:"resources",resourceQuote:{candidateId:"custom-business",metric:"initialCost",raw:"100~200만원",context,reference:"SYNTHETIC unverified user estimate",includedItems:"synthetic total",excludedItems:"",complete:true,expiresAt:"2099-01-01T00:00:00.000Z",confirmed:true}});
  const source=confirmedIntakeContext(s.saved.plan.answers);assert(source.includes("31~47시간"));assert(source.includes("0만원"));
  const queued=await s.send({action:"design"});captured="";respond=async()=>Response.json({status:"completed",output_text:JSON.stringify(design)});
  assert.equal((await executeIntakeJob({ownerHash:s.owner,planId:queued.plan.id,jobId:queued.job!.id})).ok,true);
  assert(captured.includes("31~47시간"));assert(captured.includes("0만원"));assert(captured.includes("100~300만원"));assert(captured.includes("미정"));assert.match(captured,/not actual|not independently verified|not verified/i);
  assert(captured.includes("user_attestation_not_independently_verified"));assert(captured.includes("user_limit_not_actual_cost_or_results"));
  console.log("MOCK_PROMPT_CAPTURE "+JSON.stringify(JSON.parse(captured).input));
  const state=await loadPlanState(s.owner);const current=readCoach(state.plans.find(p=>p.id===queued.plan.id)!.answers)!;assert(currentBusinessDesign(current));
  // Reload the current revision after the background completion before changing only the monthly limit.
  await saveIntakeCommand(s.owner,{action:"resources",resourceLimits:{monthlyOperatingCost:"12만원"},planId:queued.plan.id,revision:current.revision,requestId:randomUUID()});
  const next=readCoach((await loadPlanState(s.owner)).plans.find(p=>p.id===queued.plan.id)!.answers)!;assert.equal(currentBusinessDesign(next),undefined);
 });
 await check("in-flight design cannot save after preparation time changes",async()=>{
  const s=await session();await s.send({action:"resources",resourceLimits:{preparationHours:"10시간"}});const queued=await s.send({action:"design"});
  let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),seen=new Promise<void>(r=>started=r);
  respond=async()=>{started();await gate;return Response.json({status:"completed",output_text:JSON.stringify(design)});};
  const running=executeIntakeJob({ownerHash:s.owner,planId:queued.plan.id,jobId:queued.job!.id});await seen;
  await s.send({action:"resources",resourceLimits:{preparationHours:"20시간"}});release();assert.equal((await running).ok,false);
  const coach=readCoach((await loadPlanState(s.owner)).plans.find(p=>p.id===queued.plan.id)!.answers)!;assert.equal(currentBusinessDesign(coach),undefined);
 });
 console.log(JSON.stringify({failures,mockProviderCalls:calls,realExternalCalls:0}));process.exitCode=failures?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
