import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { SECTOR_DEFAULT_STRUCTURE } from "../lib/plan-builder/business-structure";
import { parseResourceLimit, evaluateCandidateResources } from "../lib/plan-builder/intake-candidate-fit";
import { loadResourceRecords, RESOURCE_UNITS, resourceBusinessAssumptions, type ResourceRecord, type ResourceKey } from "../lib/plan-builder/intake-candidate-resources";
import { createIntake, evaluateIntakeCandidates, ksicCandidateIdeas } from "../lib/plan-builder/intake-core";
import { intakeCandidates } from "../lib/plan-builder/intake-questions";
import { emptyCoach } from "../lib/plan-builder/coach-job";
import { saveIntakeCommand } from "../lib/plan-builder/intake-service";
import { loadPlanState } from "../lib/plan-builder/plan-server-store";
import { emptyDraft, parseDraft, previewIntakeAnswer, settleDraft, routeComposerInput } from "../app/plan/chat/intake-ui/model";
import { getIntakeQuestion } from "../lib/plan-builder/intake-questions";
import type { IntakeCommand } from "../lib/plan-builder/intake-types";

Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", RATE_LIMIT_BACKEND: "memory", PLAN_ACCOUNT_LINKING_ENABLED: "false", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" });
let external = 0; globalThis.fetch = async () => { external++; throw new Error("EXTERNAL_CALL_FORBIDDEN"); };
const at = "2030-01-01T00:00:00.000Z", context = { variant: "SYNTHETIC only", region: "SYNTHETIC region", scale: "SYNTHETIC scale" };
const fixture = (id: string, metric: ResourceKey = "initialCost", lower = 100, upper = 200): ResourceRecord => ({ schemaVersion: 1, candidateId: id, context, metric, unit: RESOURCE_UNITS[metric], lower, upper, complete: true, includedItems: ["SYNTHETIC complete fixture"], excludedItems: [], source: { kind: "user-confirmed", reference: "SYNTHETIC TEST ONLY - not product evidence", validFrom: "2029-01-01T00:00:00.000Z", reviewedAt: "2029-01-01T00:00:00.000Z", expiresAt: "2031-01-01T00:00:00.000Z" } });
let failed = 0;
async function check(name: string, fn: () => unknown) { try { await fn(); console.log("PASS "+name); } catch(e) { failed++; console.error("FAIL "+name,e); } }
async function main() {
 await check("four axes: missing/unknown/zero/ranges/units/periods", () => {
  assert.equal(parseResourceLimit(null,"initialCost").status,"missing"); assert.equal(parseResourceLimit("미정","initialCost").status,"unknown");
  for(const key of ["initialCost","monthlyOperatingCost","preparationHours","weeklyOperatingHours"] as const) assert.deepEqual(parseResourceLimit(0,key),{status:"known",raw:"0",lower:0,upper:0});
  assert.deepEqual(parseResourceLimit("100~300만원","initialCost"),{status:"known",raw:"100~300만원",lower:1000000,upper:3000000});
  assert.deepEqual(parseResourceLimit("주당 5~10시간","weeklyOperatingHours"),{status:"known",raw:"주당 5~10시간",lower:5,upper:10});
  for(const [value,key] of [["월 100만원","initialCost"],["주당 10시간","preparationHours"],["총 20시간","weeklyOperatingHours"],["300~100만원","initialCost"],["-1","initialCost"],["USD 30","initialCost"],["매일 5시간","weeklyOperatingHours"],["10만원","preparationHours"]] as const)assert.equal(parseResourceLimit(value,key).status,"invalid",value);
 });
 await check("unknown evidence, expiry, partial totals, conflicting sources and context",()=>{
  const f=fixture("x"),evaluate=(records:ResourceRecord[],asOf=at)=>evaluateCandidateResources("x",{initialCost:500},context,asOf,loadResourceRecords(records));
  assert.equal(evaluate([]).metrics.initialCost.status,"unknown");
  for(const f2 of [{...f,complete:false},{...f,excludedItems:["rent missing"]},{...f,context:{...context,region:"elsewhere"}},{...f,source:{...f.source,expiresAt:"2029-12-31T00:00:00.000Z"}}])assert.equal(evaluate([f2]).metrics.initialCost.status,"unknown");
  assert.equal(evaluate([f,fixture("x","initialCost",300,400)]).metrics.initialCost.status,"unknown");
  assert.equal(loadResourceRecords([{...f,source:{}}]).length,0);assert.equal(loadResourceRecords([{...f,unit:"hour"}]).length,0);
  assert.equal(evaluate([f],"2031-01-01T00:00:00.000Z").metrics.initialCost.status,"unknown");
 });
 await check("boundary, conditional range, partial coverage",()=>{
  for(const [budget,status]of [[0,"exceeded"],[99,"exceeded"],[100,"conditional"],[150,"conditional"],[200,"fits"],[201,"fits"]] as const){const fit=evaluateCandidateResources("x",{initialCost:budget},context,at,[fixture("x")]);assert.equal(fit.metrics.initialCost.status,status);assert.equal(fit.metrics.weeklyOperatingHours.status,"unknown");assert.equal(fit.checked,1);}
  assert.equal(evaluateCandidateResources("x",{initialCost:"50~250원"},context,at,[fixture("x")]).metrics.initialCost.status,"conditional");
 });
 await check("evaluate full template and KSIC pools before source limits; stable order",()=>{
  const coach=emptyCoach(),intake=createIntake(coach,"exploring",at);intake.resourceContext=context;intake.answers.budget={status:"answered",value:50,messageId:"budget",at};
  const templates=intakeCandidates({},Infinity);assert(templates.length>3);
  const boundFixture=(...args:Parameters<typeof fixture>)=>({...fixture(...args),structureAssumptions:{...SECTOR_DEFAULT_STRUCTURE.general},businessAssumptions:resourceBusinessAssumptions(coach)});
  const data=templates.slice(0,3).map(i=>boundFixture(i.id));data.push(boundFixture(templates[3].id,"initialCost",10,20));
  const result=evaluateIntakeCandidates(intake,coach,at,data);assert(result.ideas.some(i=>i.id===templates[3].id));assert.equal(result.assessment.excludedCount,3);
  intake.answers.budget.value=51;assert.deepEqual(evaluateIntakeCandidates(intake,coach,at,data).ideas.map(i=>i.id),result.ideas.map(i=>i.id));
  intake.answers.interest={status:"answered",value:["food_beverage"],messageId:"interest",at};const ksic=ksicCandidateIdeas(intake,coach,true);assert(ksic.length>5);
  const records=ksic.slice(0,5).map(i=>boundFixture(i.id));records.push(boundFixture(ksic[5].id,"initialCost",1,2));
  assert(evaluateIntakeCandidates(intake,coach,at,records).ideas.some(i=>i.id===ksic[5].id));
  const unknown=evaluateIntakeCandidates(intake,coach,at,[]);assert.equal(unknown.assessment.allUnknown,true);assert(unknown.ideas.length>0);
  intake.answers.conditions={status:"answered",value:["무점포로 시작","매장·공간에서 제공"],messageId:"conditions",at};assert.equal(evaluateIntakeCandidates(intake,coach,at,[]).ideas.length,0);
 });
 await check("real service: confirmed quote, limits, selected business, preview, retries and conflicts",async()=>{
  const owner="r01-"+randomUUID();let result=await saveIntakeCommand(owner,{action:"start",mode:"exploring",revision:0,requestId:randomUUID()});
  const send=async(input:Partial<IntakeCommand>&Pick<IntakeCommand,"action">)=>{const command={...input,planId:result.plan.id,revision:result.snapshot.coach.revision,requestId:randomUUID()};result=await saveIntakeCommand(owner,command);return command;};
  const selected=result.snapshot.candidateIdeas[0];await send({action:"answer",questionId:"candidate",value:selected.id});const name=result.snapshot.coach.business.name,description=result.snapshot.coach.business.description;
  await send({action:"resources",resourceQuote:{candidateId:selected.id,metric:"initialCost",raw:"100~200원",context,reference:"SYNTHETIC TEST USER QUOTE",includedItems:"all synthetic setup",excludedItems:"",complete:true,expiresAt:"2099-01-01T00:00:00.000Z",confirmed:true}});
  const previous=result.snapshot;const command: IntakeCommand={action:"resources",resourceLimits:{initialCost:"50원",monthlyOperatingCost:"월 30만원",preparationHours:"총 10시간",weeklyOperatingHours:"주당 5~10시간"},planId:result.plan.id,revision:previous.coach.revision,requestId:randomUUID()};
  assert.equal(routeComposerInput(previous,getIntakeQuestion("startup","general","budget")!,"100~300만원").kind,"answer");
  assert.equal(routeComposerInput(previous,getIntakeQuestion("startup","general","budget")!,"월 30만원").kind,"clarify");
  const preview=previewIntakeAnswer(previous,command)!;result=await saveIntakeCommand(owner,command);
  assert.deepEqual(preview.resourceAssessment?.selected?.resourceFit,result.snapshot.resourceAssessment?.selected?.resourceFit);
  assert.equal(result.snapshot.resourceAssessment?.selected?.resourceFit?.status,"exceeded");assert.equal(result.snapshot.resourceAssessment?.selected?.retained,true);
  assert.equal(result.snapshot.coach.business.name,name);assert.equal(result.snapshot.coach.business.description,description);assert.equal(result.snapshot.intake.answers.candidate.value,selected.id);
  const repeat=await saveIntakeCommand(owner,command);assert.equal(repeat.duplicate,true);assert.equal(repeat.snapshot.coach.revision,result.snapshot.coach.revision);
  await assert.rejects(()=>saveIntakeCommand(owner,{...command,requestId:randomUUID()}));await assert.rejects(()=>saveIntakeCommand("another-owner",command));
  const stored=(await loadPlanState(owner)).plans.find(p=>p.id===result.plan.id)!;assert(stored);
  const restored=parseDraft(JSON.stringify({...emptyDraft(),ownerScope:owner,pending:{command}}),result.plan.id,owner);assert.deepEqual(restored.pending?.command,command);
  const ids=result.snapshot.candidateIdeas.map(i=>i.id),revision=result.snapshot.coach.documentRevision;await send({action:"note",message:"unrelated synthetic memo"});assert.deepEqual(result.snapshot.candidateIdeas.map(i=>i.id),ids);assert.equal(result.snapshot.coach.documentRevision,revision);
  await send({action:"resources",resourceLimits:{initialCost:"300원"}});assert.equal(result.snapshot.resourceAssessment?.selected?.resourceFit?.metrics.initialCost.status,"fits");assert.equal(result.snapshot.coach.business.name,name);
 });
 await check("resource draft restoration and later edits survive an older save acknowledgement",()=>{
  const command: IntakeCommand={action:"resources",revision:1,requestId:"synthetic-request",resourceLimits:{initialCost:"100원"}};
  const draft={...emptyDraft(),ownerScope:"synthetic-owner",resourceEditor:{limits:{initialCost:"200원"}}};
  assert.equal(settleDraft(draft,{command}).resourceEditor?.limits?.initialCost,"200원");
  assert.equal(settleDraft({...draft,resourceEditor:{limits:{initialCost:"100원"}}},{command}).resourceEditor?.limits,undefined);
  assert.deepEqual(parseDraft(JSON.stringify(draft),null,"synthetic-owner").resourceEditor,draft.resourceEditor);
  assert.equal(parseDraft(JSON.stringify({...draft,resourceEditor:{context:{variant:123}}}),null,"synthetic-owner").resourceEditor,undefined);
 });
 await check("direct/compound input never replaced and quotes bound to its description",async()=>{
  const owner="r01-direct-"+randomUUID();let r=await saveIntakeCommand(owner,{action:"start",mode:"startup",questionId:"business",value:"합성 새 사업과 복합 서비스",revision:0,requestId:randomUUID()});
  const send=async(input:Partial<IntakeCommand>&Pick<IntakeCommand,"action">)=>{r=await saveIntakeCommand(owner,{...input,planId:r.plan.id,revision:r.snapshot.coach.revision,requestId:randomUUID()});};
  await send({action:"resources",resourceQuote:{candidateId:"custom-business",metric:"weeklyOperatingHours",raw:"5~10시간",context,reference:"SYNTHETIC verified schedule",includedItems:"all synthetic work",excludedItems:"",complete:true,expiresAt:"2099-01-01T00:00:00.000Z",confirmed:true},resourceLimits:{weeklyOperatingHours:"0시간"}});
  assert.equal(r.snapshot.resourceAssessment?.selected?.resourceFit?.status,"exceeded");assert.equal(r.snapshot.coach.business.description,"합성 새 사업과 복합 서비스");
  await send({action:"answer",questionId:"business",value:"다른 직접 입력 사업"});assert.equal(r.snapshot.candidateIdeas[0].id,"custom-business");assert.equal(r.snapshot.candidateIdeas[0].resourceFit?.checked,0);
 });
 await check("all-pool timing and zero external calls",()=>{const c=emptyCoach(),i=createIntake(c,"exploring",at);i.answers.conditions={status:"answered",value:["혼자 시작할 수 있는 일"],messageId:"perf",at};const samples=[];let total=0;for(let n=0;n<20;n++){const t=performance.now();total=evaluateIntakeCandidates(i,c,at).assessment.total;samples.push(performance.now()-t);}samples.sort((a,b)=>a-b);console.log(JSON.stringify({evaluatedCandidates:total,p95Ms:samples[18],maxMs:samples[19],externalCalls:external,fixture:"no invented production numbers"}));assert(total>5);assert.equal(external,0);});
 console.log(`R01 results: ${failed} failed`);process.exitCode=failed?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
