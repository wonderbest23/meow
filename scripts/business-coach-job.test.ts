import assert from "node:assert/strict";
import { emptyCoach, generateAndSaveCoach } from "../lib/plan-builder/coach-job";
import { COACH_JOB_KEY, readCoachJob, type CoachJob } from "../lib/plan-builder/coach-job-types";
import { COACH_KEY, COACH_TYPES, readCoach } from "../lib/plan-builder/coach";
import { loadPlanState, normalizeState, savePlanState, preserveServerCoachRecords } from "../lib/plan-builder/plan-server-store";
import { designFixture } from "./fixtures/coach-design";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";
  process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  process.env.OPENAI_API_KEY = "test-only";
  const ownerHash = "job-test-owner";
  const at = new Date().toISOString();
  const job: CoachJob = { token: "token-1", runId: "run-1", baseRevision: 0, status: "queued", phase: "queued", durable: false, attempt: 1, updatedAt: at, message: { id: "message-1", role: "user", text: "사진 촬영 사업", at } };
  const plan = { id: "job-plan", title: "새 사업 구상", planType: COACH_TYPES.startup, createdAt: at, updatedAt: at, sections: {}, answers: { [COACH_KEY]: { state: emptyCoach() }, [COACH_JOB_KEY]: job } };
  await savePlanState(ownerHash, normalizeState({ plans: [plan] }));
  const request = { ownerHash, planId: plan.id, token: job.token };
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const fields = ["business", "customer", "offer", "price", "channel", "capacity"].map(key => ({ key, value: key === "business" ? "사진 촬영 사업" : "검토용 제안", basis: "proposal", quote: "", messageId: "" }));
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls++;
      if (body.text?.format?.type === "json_schema") return Response.json({ status: "completed", output_text: JSON.stringify({ fields: [], design: designFixture() }) });
      await wait;
      return Response.json({ status: "completed", output_text: JSON.stringify({ message: "상품을 정리했어요.", title: "사진 촬영 사업", stage: "startup", depth: "quick", fields, ready: true, suggestions: [] }) });
    };
    const running = generateAndSaveCoach(request);
    await new Promise(resolve => setTimeout(resolve, 30));
    const during = (await loadPlanState(ownerHash)).plans[0];
    assert.equal(readCoachJob(during.answers)?.status, "running");
    assert.equal(readCoachJob(during.answers)?.message.text, "사진 촬영 사업", "모델 호출 전에 사용자 입력을 저장한다");
    await assert.rejects(() => generateAndSaveCoach(request), /NOT_QUEUED/, "중복 전달이 유료 호출을 다시 시작하지 않는다");
    assert.equal(calls, 1);
    release(); await running;
    const complete = (await loadPlanState(ownerHash)).plans[0];
    assert.equal(readCoachJob(complete.answers)?.status, "complete");
    assert.equal(readCoach(complete.answers)?.revision, 1);
    assert.ok(readCoach(complete.answers)?.messages.at(-1)?.summary);
    await generateAndSaveCoach(request);
    assert.equal(calls, 2, "이미 완료한 작업은 다시 생성하지 않는다");
    await assert.rejects(() => generateAndSaveCoach({ ...request, ownerHash: "other-owner" }), /NOT_FOUND/);
    await assert.rejects(() => savePlanState(ownerHash, normalizeState({ plans: [plan] }), { planId: plan.id, coachRevision: 1, jobToken: "old-token" }), /PLAN_VERSION_CONFLICT/);

    const fresh = await loadPlanState(ownerHash);
    fresh.plans[0].answers[COACH_JOB_KEY] = { ...job, token: "token-2", baseRevision: 1, updatedAt: new Date().toISOString(), message: { ...job.message, id: "message-2" } };
    fresh.plans[0].updatedAt = new Date(Date.now() + 1).toISOString();
    await savePlanState(ownerHash, fresh);
    globalThis.fetch = async () => Response.json({ status: "completed", output_text: "{}" });
    await assert.rejects(() => generateAndSaveCoach({ ...request, token: "token-2" }), /GENERATION_FAILED/);
    const failed = (await loadPlanState(ownerHash)).plans[0];
    assert.equal(readCoachJob(failed.answers)?.status, "failed");
    assert.equal(readCoach(failed.answers)?.revision, 1, "실패하면 마지막 정상 사업안을 유지한다");
    assert.equal(readCoachJob(failed.answers)?.message.id, "message-2");
    const server = await loadPlanState(ownerHash);
    const forged = structuredClone(server);
    forged.plans[0].answers[COACH_JOB_KEY] = { ...job, status: "complete", token: "forged" };
    forged.plans[0].answers[COACH_KEY] = { state: { ...emptyCoach(), revision: 999 } };
    const safe = preserveServerCoachRecords(forged, server);
    assert.equal(readCoachJob(safe.plans[0].answers)?.token, "token-2", "클라이언트 자동 저장은 서버 작업을 교체할 수 없다");
    assert.equal(readCoach(safe.plans[0].answers)?.revision, 1);
    assert.equal(readCoachJob(preserveServerCoachRecords(forged, normalizeState({})).plans[0].answers), null, "일반 저장 API로 서버 작업을 만들 수 없다");
    const stale = structuredClone(server);
    stale.plans[0].answers[COACH_JOB_KEY] = { ...job, updatedAt: "2020-01-01T00:00:00.000Z" };
    stale.plans[0].updatedAt = new Date(Date.now() + 1000).toISOString();
    await savePlanState(ownerHash, stale);
    assert.equal(readCoachJob((await loadPlanState(ownerHash)).plans[0].answers)?.token, "token-2", "오래된 메타데이터가 최신 작업 상태를 덮지 않는다");
  } finally { globalThis.fetch = originalFetch; }
  console.log("business-coach jobs: save-before-call, progress, duplicate claim, replay, ownership, stale guard, failed-input preservation passed (mock AI/storage)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
