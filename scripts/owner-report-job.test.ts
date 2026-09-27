import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module, { createRequire } from "node:module";
import type { IntakeCommand, IntakeJobRequest } from "../lib/plan-builder/intake-types";

const design = {
  approach: "known-business", startingPlan: { scope: "합성 사업안", connectionToVision: "합성 연결", whyThis: "합성 이유", notIncluded: ["실제 검증"] },
  alternatives: [{ name: "합성 대안", scope: "합성 범위", tradeoff: "합성 차이" }], assumptions: [{ statement: "합성 가정", howToCheck: "별도 검증" }],
  nextAction: { action: "합성 행동", doneWhen: "합성 완료", usableText: "합성 문구" },
};

async function main() {
  Object.assign(process.env, {
    NODE_ENV: "test", PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", RATE_LIMIT_BACKEND: "memory",
    PLAN_ACCOUNT_LINKING_ENABLED: "false", PLAN_QUARANTINE_ENABLED: "0", NEXT_PUBLIC_BUSINESS_INTAKE_V2: "1", INTAKE_BETA_SAFETY: "0",
    OPENAI_API_KEY: "owner-job-synthetic-openai", ANTHROPIC_API_KEY: "", OPENAI_MODEL: "owner-job-fixture", PLANNING_MODEL: "owner-job-fixture",
    OWNER_SMS_ENABLED: "1", OWNER_SMS_REPORT_READY_ENABLED: "1",
  });
  for (const kind of ["IDEAS", "DESIGN", "HELP", "EXTRACT"]) delete process.env[`INTAKE_${kind}_FAILOVER_POLICY`];
  const require = createRequire(import.meta.url);
  const storageId = require.resolve("../lib/plan-builder/plan-server-store");
  const storage = require(storageId) as typeof import("../lib/plan-builder/plan-server-store");
  const originalStorage = require.cache[storageId];
  const noticeId = require.resolve("../lib/notify/owner-sms"), originalNotice = require.cache[noticeId];
  const { readCoach } = require("../lib/plan-builder/coach") as typeof import("../lib/plan-builder/coach");
  const { readIntake } = require("../lib/plan-builder/intake-core") as typeof import("../lib/plan-builder/intake-core");
  const notices: Array<{ id: string; type: string }> = [];
  let noticeOwner = "", noticePlan = "", failNotice = false, failSave = false;
  const storageModule = new Module(storageId); storageModule.filename = storageId; storageModule.loaded = true;
  storageModule.exports = { ...storage, savePlanState: async (...args: Parameters<typeof storage.savePlanState>) => {
    if (failSave && args[1].plans.some(plan => readIntake(plan.answers)?.job?.status === "complete")) throw new Error("SYNTHETIC_SAVE_FAILURE");
    return storage.savePlanState(...args);
  } };
  require.cache[storageId] = storageModule;
  const noticeModule = new Module(noticeId); noticeModule.filename = noticeId; noticeModule.loaded = true;
  noticeModule.exports = { notifyOwnerBySms: async (id: string, type: string) => {
    const state = await storage.loadPlanState(noticeOwner), plan = state.plans.find(item => item.id === noticePlan)!;
    assert.equal(readIntake(plan.answers)?.job?.status, "complete", "notification must follow saved completion");
    assert.equal(readCoach(plan.answers)?.design?.startingPlan.scope, design.startingPlan.scope);
    notices.push({ id, type });
    if (failNotice) throw new Error("SYNTHETIC_NOTIFICATION_FAILURE");
    return { status: "accepted", code: "PROVIDER_ACCEPTED" };
  } };
  require.cache[noticeId] = noticeModule;
  const originalFetch = globalThis.fetch;
  let aiCalls = 0;
  const complete = () => Response.json({ status: "completed", output_text: JSON.stringify(design) });
  let respond: () => Promise<Response> | Response = complete;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses", "all traffic intercepted; no real destination contacted");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer owner-job-synthetic-openai");
    aiCalls++;
    return respond();
  };
  const { saveIntakeCommand, executeIntakeJob } = require("../lib/plan-builder/intake-service") as typeof import("../lib/plan-builder/intake-service");
  let failures = 0, passed = 0;
  async function session() {
    const ownerHash = `owner-notification-${randomUUID()}`;
    const started = await saveIntakeCommand(ownerHash, { action: "start", mode: "startup", questionId: "business", value: "합성 촬영 서비스", revision: 0, requestId: randomUUID() });
    const planId = started.plan.id;
    async function send(command: Partial<IntakeCommand> & Pick<IntakeCommand, "action">) {
      const plan = (await storage.loadPlanState(ownerHash)).plans.find(item => item.id === planId)!;
      return saveIntakeCommand(ownerHash, { ...command, planId, revision: readCoach(plan.answers)!.revision, requestId: randomUUID() }, { aiAvailable: true, aiAllowed: true });
    }
    const queued = await send({ action: "design" });
    noticeOwner = ownerHash; noticePlan = planId;
    const request: IntakeJobRequest = { ownerHash, planId, jobId: queued.job!.id };
    return { request, send, load: async () => (await storage.loadPlanState(ownerHash)).plans.find(item => item.id === planId)! };
  }
  async function check(name: string, fn: () => Promise<void>) {
    notices.length = 0; aiCalls = 0; failNotice = false; failSave = false; respond = complete;
    process.env.OWNER_SMS_REPORT_READY_ENABLED = "1";
    try { await fn(); passed++; console.log(`PASS ${name}`); }
    catch (error) { failures++; console.error(`FAIL ${name}: ${String(error)}`); }
  }
  try {
    await check("saved business plan notifies owner once; concurrent/replayed job and reconnect do not resend", async () => {
      const s = await session();
      const results = await Promise.all([executeIntakeJob(s.request), executeIntakeJob(s.request)]);
      assert.ok(results.every(result => result.ok));
      assert.deepEqual(notices, [{ id: s.request.jobId, type: "business-plan-ready" }]);
      assert.equal(aiCalls, 1);
      assert.equal(readIntake((await s.load()).answers)?.job?.status, "complete");
      assert.deepEqual(await executeIntakeJob(s.request), { ok: true });
      assert.equal(notices.length, 1); assert.equal(aiCalls, 1);
    });
    await check("disabled report notification does not affect successful saved job", async () => {
      process.env.OWNER_SMS_REPORT_READY_ENABLED = "0";
      const s = await session();
      assert.deepEqual(await executeIntakeJob(s.request), { ok: true });
      assert.equal(notices.length, 0); assert.equal(aiCalls, 1);
      assert.equal(readIntake((await s.load()).answers)?.job?.status, "complete");
    });
    await check("notification failure cannot turn saved business plan into failed job", async () => {
      failNotice = true;
      const s = await session();
      assert.deepEqual(await executeIntakeJob(s.request), { ok: true });
      assert.equal(notices.length, 1);
      assert.equal(readIntake((await s.load()).answers)?.job?.status, "complete");
    });
    await check("invalid AI output never emits a completion notification", async () => {
      const s = await session();
      respond = () => Response.json({ status: "completed", output_text: "{}" });
      assert.deepEqual(await executeIntakeJob(s.request), { ok: false });
      assert.equal(notices.length, 0); assert.equal(aiCalls, 1);
    });
    await check("failed result save never emits a completion notification", async () => {
      const s = await session(); failSave = true;
      assert.deepEqual(await executeIntakeJob(s.request), { ok: false });
      assert.equal(notices.length, 0);
      assert.equal(readCoach((await s.load()).answers)?.design, undefined);
    });
    await check("changed conditions block stale result and its notification", async () => {
      const s = await session();
      let entered!: () => void, release!: () => void;
      const arrived = new Promise<void>(resolve => { entered = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      respond = async () => { entered(); await gate; return complete(); };
      const running = executeIntakeJob(s.request);
      await arrived;
      try { await s.send({ action: "resources", resourceLimits: { preparationHours: "10시간" } }); }
      finally { release(); }
      assert.deepEqual(await running, { ok: false });
      assert.equal(notices.length, 0);
      assert.equal(readCoach((await s.load()).answers)?.design, undefined);
    });
    await check("other account cannot execute the owner's report or trigger its notification", async () => {
      const s = await session();
      assert.deepEqual(await executeIntakeJob({ ...s.request, ownerHash: `unrelated-${randomUUID()}` }), { ok: true });
      assert.equal(notices.length, 0); assert.equal(aiCalls, 0);
      assert.equal(readIntake((await s.load()).answers)?.job?.status, "queued");
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) require.cache[storageId] = originalStorage; else delete require.cache[storageId];
    if (originalNotice) require.cache[noticeId] = originalNotice; else delete require.cache[noticeId];
  }
  console.log(JSON.stringify({ passed, failures, realAiCalls: 0, realSmsCalls: 0, scope: "actual intake commands, job executor and demo-memory storage; mocked AI and notification boundary; no production DB claim" }));
  if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
