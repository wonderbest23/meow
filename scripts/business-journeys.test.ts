import assert from "node:assert/strict";
import { emptyCoach, generateAndSaveCoach } from "../lib/plan-builder/coach-job";
import { COACH_KEY, COACH_TYPES, applyCoachReply, coachDocumentRevision, readCoach, type CoachReply } from "../lib/plan-builder/coach";
import { COACH_JOB_KEY, readCoachJob, type CoachJob } from "../lib/plan-builder/coach-job-types";
import { loadPlanState, normalizeState, savePlanState } from "../lib/plan-builder/plan-server-store";
import { generateAndSaveSection } from "../lib/plan-builder/section-service";
import { launchSchema, launchSteps, launchStatus, readLaunch, useOperatingWorkflow, LAUNCH_KEY } from "../lib/plan-builder/business-launch";
import { businessChatHref } from "../lib/plan-builder/business-hub";
import { designFixture } from "./fixtures/coach-design";

async function main() {
  Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "journey-test-only", ANTHROPIC_API_KEY: "" });
  const owner = "isolated-business-journeys";
  const at = "2026-01-01T00:00:00.000Z";
  const plans = ["new-business", "existing-business", "unrelated-business"].map(id => ({ id, title: id, planType: COACH_TYPES.startup, createdAt: at, updatedAt: at, sections: {}, answers: { [COACH_KEY]: { state: emptyCoach() } } }));
  await savePlanState(owner, normalizeState({ plans, activePlanId: plans[2].id }));
  let reply: CoachReply;
  let calls = 0;
  let fail = false;
  let sectionMode = false;
  const designStages: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).hostname, "api.openai.com", "only the mocked AI endpoint is allowed");
    calls++;
    const body = JSON.parse(String(init?.body));
    if (body.text?.format?.name === "business_design") {
      const source = JSON.parse(body.input.find((item: { role: string }) => item.role === "user").content);
      designStages.push(JSON.parse(source.context).stage);
    }
    const output = fail ? "{}" : body.text?.format?.name === "business_plan_review" ? JSON.stringify({ issues: [] }) : sectionMode ? "## 운영 개선\n\n제공된 실제 매출을 기준으로 현재 상품과 고객 반응을 확인합니다. 다음 한 주 동안 유지할 일과 변경할 일을 구별하고 문의 수를 기록합니다."
      : body.text?.format?.type === "json_schema" ? JSON.stringify({ fields: [], design: { ...designFixture(), approach: "operating-improvement" } }) : JSON.stringify(reply);
    return Response.json({ status: "completed", output_text: output });
  };
  const read = async (id: string) => (await loadPlanState(owner)).plans.find(plan => plan.id === id)!;
  let sequence = 0;
  async function chat(id: string, text: string, next: CoachReply) {
    reply = next;
    const state = await loadPlanState(owner);
    const plan = state.plans.find(item => item.id === id)!;
    const timestamp = new Date(Math.max(Date.now(), Date.parse(plan.updatedAt) + 1)).toISOString();
    const job: CoachJob = { token: `token-${++sequence}`, runId: `run-${sequence}`, baseRevision: readCoach(plan.answers)!.revision, status: "queued", phase: "queued", durable: false, attempt: 1, updatedAt: timestamp, message: { id: `message-${sequence}`, role: "user", text, at: timestamp } };
    plan.answers[COACH_JOB_KEY] = job; plan.updatedAt = timestamp;
    await savePlanState(owner, state);
    const request = { ownerHash: owner, planId: id, token: job.token };
    await generateAndSaveCoach(request);
    const beforeReplay = calls;
    await generateAndSaveCoach(request);
    assert.equal(calls, beforeReplay, "a completed request must not charge for another model call");
    return read(id);
  }
  const base: CoachReply = { message: "현재 상황부터 정리할게요", stage: "exploring", title: "사업 탐색", depth: "quick", ready: false, fields: [], suggestions: [] };
  const businessFields: CoachReply["fields"] = (["business", "customer", "offer", "price", "channel", "capacity"] as const).map(key => ({ key, value: key === "business" ? "동네 메뉴 사진 제작" : "검토할 제안", basis: "proposal", quote: "", messageId: "" }));
  try {
    let created = await chat("new-business", "아이디어가 없어요", base);
    assert.equal(readCoach(created.answers)?.stage, "exploring");
    assert.equal(readCoach(created.answers)?.ready, false);
    assert.deepEqual(created.sections, {});
    created = await chat(created.id, "동네 메뉴 사진 제작으로 시작할게요", { ...base, stage: "startup", title: "메뉴 사진", fields: businessFields, ready: true });
    const startupCoach = readCoach(created.answers)!;
    assert.equal(startupCoach.stage, "startup");
    assert.equal(created.planType, COACH_TYPES.startup);

    const state = await loadPlanState(owner);
    const target = state.plans.find(plan => plan.id === created.id)!;
    const originalSection = { markdown: "창업할 때 작성한 원본", html: "<p>창업할 때 작성한 원본</p>", generatedAt: at, coachRevision: coachDocumentRevision(startupCoach) };
    target.sections["overview/summary"] = originalSection;
    target.sections["overview/problem"] = { ...originalSection, markdown: "내가 직접 수정한 본문", edited: true };
    target.answers["overview/summary"] = { planning_source: "coach" };
    const launch = launchSchema.parse({ configured: true, workplace: "remote", registered: "yes", quotes: [{ name: "기존 견적", monthly: "10000" }] });
    const oldStep = launchSteps(target, launch).find(step => step.id === "operations")!;
    launch.records.operations = { status: "done", signature: oldStep.signature, note: "첫 고객과 약속한 범위", material: "직접 쓴 운영 메모", at };
    target.answers[LAUNCH_KEY] = launch;
    target.updatedAt = new Date(Date.now() + 1).toISOString();
    await savePlanState(owner, state);

    const sales = "이번 달 실제 매출 30만원";
    created = await chat(created.id, sales, { ...base, stage: "operating", title: "메뉴 사진", ready: true, fields: [{ key: "sales", value: sales, basis: "user", quote: sales, messageId: `message-${sequence + 1}` }] });
    const operatingCoach = readCoach(created.answers)!;
    assert.equal(operatingCoach.stage, "operating");
    assert.equal(operatingCoach.fields.find(field => field.key === "sales")?.value, sales);
    assert.equal(created.planType, COACH_TYPES.startup, "existing documents retain their original type");
    assert.deepEqual(created.sections["overview/summary"], originalSection);
    assert.equal(readLaunch(created).purpose, "launch", "saved startup workflow is not silently replaced");
    const improved = useOperatingWorkflow(readLaunch(created));
    assert.deepEqual(improved.records, launch.records);
    assert.deepEqual(improved.quotes, launch.quotes);
    const improvedOperations = launchSteps(created, improved).find(step => step.id === "operations")!;
    assert.equal(launchStatus(improved, improvedOperations), "review");
    assert.match(improvedOperations.material, /이번 달 실제 매출 30만원/);
    assert.doesNotMatch(improvedOperations.prompt, /첫 운영/);
    for (const id of ["website", "marketing"]) assert.match(launchSteps(created, improved).find(step => step.id === id)!.title, /개선|실험/);
    assert.equal(new URL(businessChatHref(created.id, "개선할게요"), "http://localhost").searchParams.get("planId"), created.id);

    // A model stage downgrade alone must not stale the document or the operating design.
    const stable = applyCoachReply(operatingCoach, { ...base, title: "메뉴 사진", ready: true, stage: "startup" }, { id: "thanks", role: "user", text: "고마워요", at });
    assert.equal(stable.stage, "operating");
    assert.equal(stable.business.stage, "운영 중");
    assert.equal(coachDocumentRevision(stable), coachDocumentRevision(operatingCoach));

    let existing = await chat("existing-business", "사업을 운영 중이에요", { ...base, stage: "exploring" });
    assert.equal(readCoach(existing.answers)?.stage, "operating", "entry choice overrides a mistaken model classification");
    assert.equal(existing.planType, COACH_TYPES.operating);
    existing = await chat(existing.id, "카페를 운영해요", { ...base, stage: "startup", title: "기존 카페", fields: businessFields, ready: true });
    assert.equal(readCoach(existing.answers)?.stage, "operating");
    assert.equal(readCoach(existing.answers)?.business.stage, "운영 중");
    assert.equal(readLaunch(existing).purpose, "improve");
    assert.deepEqual(readCoach(existing.answers)?.suggestions, ["현재 문제부터 정리해 주세요", "다음 개선 실험을 정해주세요"]);
    assert.deepEqual(designStages, ["startup", "operating", "operating"], "design generation receives the corrected operating stage");

    sectionMode = true;
    const sectionJob = { ownerHash: owner, planId: created.id, chapterId: "overview", sectionId: "summary" };
    assert.deepEqual(await generateAndSaveSection(sectionJob), { ok: true });
    const generated = (await read(created.id)).sections["overview/summary"];
    assert.equal(generated.previous?.markdown, originalSection.markdown);
    assert.equal(generated.coachRevision, coachDocumentRevision(operatingCoach));
    assert.equal((await read(created.id)).sections["overview/problem"].markdown, "내가 직접 수정한 본문");
    const generatedCalls = calls;
    assert.equal((await generateAndSaveSection(sectionJob)).skipped, "ALREADY_GENERATED");
    assert.equal((await generateAndSaveSection({ ...sectionJob, sectionId: "problem" })).skipped, "USER_EDITED");
    assert.equal(calls, generatedCalls);
    assert.equal((await generateAndSaveSection({ ...sectionJob, ownerHash: "different-owner" })).skipped, "PLAN_NOT_FOUND");

    sectionMode = false; fail = true;
    await assert.rejects(chat(created.id, "이번 주 결과를 다시 확인해 주세요", base), /GENERATION_FAILED/);
    const failed = await read(created.id);
    assert.equal(readCoachJob(failed.answers)?.status, "failed");
    assert.deepEqual(readCoach(failed.answers), operatingCoach);
    assert.deepEqual(failed.sections["overview/summary"], generated);
    assert.deepEqual(readLaunch(failed).records, launch.records);
    const final = await loadPlanState(owner);
    assert.equal(final.plans.length, 3);
    assert.equal(readCoach((await read("unrelated-business")).answers)?.revision, 0);
    console.log("business journeys: idea -> startup -> operating, existing operator, same-business isolation, workflow records, regeneration, manual protection, replay and failure preservation passed (mock AI/memory)");
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
