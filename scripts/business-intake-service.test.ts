import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CoachJob } from "../lib/plan-builder/coach-job-types";
import type { IntakeCommand, IntakeJobRequest, IntakeSnapshot } from "../lib/plan-builder/intake-types";
import type { IntakeMode, IntakeQuestion } from "../lib/plan-builder/intake-questions";
import type { IntakeExtractCandidate, IntakeExtractNote } from "../lib/plan-builder/intake-extraction";

type ProviderBody = {
  model: string;
  input: Array<{ role: string; content: string }>;
  text?: { format?: { name?: string; type?: string; strict?: boolean } };
  max_output_tokens?: number;
};
type Session = { ownerHash: string; planId: string };
type Saved = Awaited<ReturnType<typeof import("../lib/plan-builder/intake-service").saveIntakeCommand>>;
type Command = Omit<IntakeCommand, "planId" | "revision" | "requestId">;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function completion(value: unknown) {
  return Response.json({ status: "completed", output_text: typeof value === "string" ? value : JSON.stringify(value) });
}

async function main() {
  // Never load an env file or inspect inherited credentials. All relevant config is synthetic.
  Object.assign(process.env, {
    NODE_ENV: "test", PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", RATE_LIMIT_BACKEND: "memory",
    PLAN_ACCOUNT_LINKING_ENABLED: "false", NEXT_PUBLIC_BUSINESS_INTAKE_V2: "1",
    OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", OPENAI_MODEL: "intake-service-fixture",
    ANTHROPIC_MODEL: "intake-fallback-fixture", PLANNING_MODEL: "intake-service-fixture",
  });
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: ProviderBody }> = [];
  const unexpected: string[] = [];
  let respond: (body: ProviderBody) => Response | Promise<Response> = () => { throw new Error("Unexpected provider call"); };
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target !== "https://api.openai.com/v1/responses") {
      unexpected.push(target);
      throw new Error(`Unexpected network destination (never contacted): ${target}`);
    }
    const body = JSON.parse(String(init?.body)) as ProviderBody;
    calls.push({ url: target, body });
    const authorization = new Headers(init?.headers).get("authorization");
    if (authorization !== "Bearer intake-service-dummy-openai") {
      unexpected.push("non-fixture authorization");
      throw new Error("Only synthetic credentials are allowed");
    }
    return respond(body);
  };

  const failures: string[] = [];
  let passed = 0;
  try {
    const { saveIntakeCommand, executeIntakeJob, updateIntakeJob, expireStaleIntakeJob } = await import("../lib/plan-builder/intake-service");
    const { readIntake, IntakeError } = await import("../lib/plan-builder/intake-core");
    const { COACH_KEY, COACH_TYPES, readCoach, coachDocumentRevision } = await import("../lib/plan-builder/coach");
    const { emptyCoach, generateAndSaveCoach } = await import("../lib/plan-builder/coach-job");
    const { COACH_JOB_KEY, readCoachJob } = await import("../lib/plan-builder/coach-job-types");
    const { loadPlanState, savePlanState, normalizeState } = await import("../lib/plan-builder/plan-server-store");
    const { resolvePlanningLLMConfig } = await import("../lib/llm/config");

    function configureAI(enabled: boolean) {
      process.env.OPENAI_API_KEY = enabled ? "intake-service-dummy-openai" : "";
      // A configured alternate makes unintended fallback observable in the fetch mock.
      process.env.ANTHROPIC_API_KEY = enabled ? "intake-service-dummy-anthropic" : "";
    }

    async function check(name: string, run: () => Promise<void>) {
      calls.length = 0; unexpected.length = 0;
      configureAI(false);
      respond = () => { throw new Error(`Unexpected provider call in ${name}`); };
      try {
        await run();
        assert.deepEqual(unexpected, [], "no storage network, live calls, or cross-provider fallback");
        passed++;
        console.log(`PASS ${name}`);
      } catch (error) {
        failures.push(name);
        console.error(`FAIL ${name}`, error);
      }
    }

    async function load(session: Session) {
      const state = await loadPlanState(session.ownerHash);
      const plan = state.plans.find(item => item.id === session.planId);
      assert.ok(plan, "saved plan exists");
      const coach = readCoach(plan.answers), intake = readIntake(plan.answers);
      assert.ok(coach, "saved coach exists");
      assert.ok(intake, "saved intake exists");
      return { state, plan, coach, intake };
    }

    async function start(mode: IntakeMode = "startup") {
      const ownerHash = `intake-service-${randomUUID()}`;
      const result = await saveIntakeCommand(ownerHash, { action: "start", mode, revision: 0, requestId: randomUUID() });
      return { ownerHash, planId: result.plan.id, result };
    }

    async function send(session: Session, command: Command, ai = false): Promise<Saved> {
      const current = await load(session);
      return saveIntakeCommand(session.ownerHash, {
        ...command, planId: session.planId, revision: current.coach.revision, requestId: randomUUID(),
      }, { aiAvailable: ai, aiAllowed: ai });
    }

    function jobRequest(session: Session, saved: Saved): IntakeJobRequest {
      assert.ok(saved.job, "AI job must be durably queued before execution");
      return { ownerHash: session.ownerHash, planId: session.planId, jobId: saved.job.id };
    }

    function assertIntakeError(code: string, status: number) {
      return (error: unknown) => error instanceof IntakeError && error.code === code && error.status === status;
    }

    function extracted(body: ProviderBody, fieldKey: IntakeExtractCandidate["fieldKey"], value: string, quote: string) {
      assert.equal(body.text?.format?.name, "intake_extract");
      assert.equal(body.text?.format?.strict, true);
      assert.equal(body.max_output_tokens, 1200);
      const payload = JSON.parse(body.input[1].content) as { notes: IntakeExtractNote[] };
      assert.equal(payload.notes.length, 1);
      assert.deepEqual(Object.keys(payload.notes[0]).sort(), ["id", "text"], "stored metadata must be projected out before extraction");
      assert.ok(payload.notes[0].text.includes(quote));
      return completion({ candidates: [{ fieldKey, value, quote, noteId: payload.notes[0].id }] });
    }

    function answerFor(question: IntakeQuestion, snapshot: IntakeSnapshot): Pick<IntakeCommand, "value" | "unknown"> {
      if (question.id === "capacity") return { unknown: true };
      if (question.id === "candidate") {
        assert.ok(snapshot.candidateIdeas.length > 0);
        return { value: snapshot.candidateIdeas[0].id };
      }
      if (question.kind === "single" || question.kind === "multi") {
        assert.ok(question.options?.length);
        return { value: question.kind === "multi" ? [question.options[0].value] : question.options[0].value };
      }
      const values: Record<string, string | number> = {
        business: "직장인 프로필 촬영 사업", experience: "사진 촬영과 고객 응대 경험", customer: "직장인",
        problem: "예약 가능한 촬영 시간을 찾기 어려움", offer: "프로필 촬영 1회", channel: "직접 예약",
        price: "50000원", budget: 1000000, hoursPerWeek: 10, sales: 500000, cost: 100000,
        period: "2026-08-01 / 2026-08-31", goal: "다음 달 고객 반응 확인",
      };
      assert.ok(question.id in values, `add an explicit fixture for ${question.id}`);
      return { value: values[question.id] };
    }

    await check("typed first message atomically starts, saves and replays without AI", async () => {
      configureAI(true);
      const ownerHash = `intake-entry-${randomUUID()}`;
      const command: IntakeCommand = { action: "start", mode: "startup", questionId: "business", value: "2d게임 만들어주는 웹사이트", revision: 0, requestId: randomUUID() };
      const initial = await saveIntakeCommand(ownerHash, command, { aiAvailable: true, aiAllowed: true });
      const session = { ownerHash, planId: initial.plan.id };
      assert.equal(initial.snapshot.coach.fields.find(field => field.key === "business")?.value, command.value);
      assert.equal(initial.snapshot.intake.answers.business.messageId, command.requestId);
      assert.equal(initial.snapshot.nextQuestion?.id, "industry");
      assert.equal(initial.job, null);
      const replay = await saveIntakeCommand(ownerHash, command, { aiAvailable: true, aiAllowed: true });
      assert.equal(replay.duplicate, true);
      assert.equal((await load(session)).coach.messages.filter(message => message.id === command.requestId).length, 1);
      const next = await send(session, { action: "answer", questionId: "industry", value: "software" });
      assert.equal(next.snapshot.nextQuestion?.id, "customer", "Do not ask the already typed business description again");
      await assert.rejects(() => saveIntakeCommand(ownerHash, { ...command, value: "changed payload" }), assertIntakeError("request_reused", 409));
      await assert.rejects(() => send(session, { action: "start", mode: "startup", questionId: "business", value: "덮어쓰기 시도" }), assertIntakeError("start_exists", 409));
      assert.equal((await load(session)).coach.fields.find(field => field.key === "business")?.value, command.value);
      assert.equal(calls.length, 0);
    });

    await check("invalid initial answer is rejected without creating a partial conversation", async () => {
      const ownerHash = `intake-entry-invalid-${randomUUID()}`;
      await assert.rejects(() => saveIntakeCommand(ownerHash, { action: "start", mode: "startup", questionId: "budget", value: "1000", revision: 0, requestId: randomUUID() }), assertIntakeError("invalid_start", 400));
      assert.equal((await loadPlanState(ownerHash)).plans.length, 0);
      const operating = await saveIntakeCommand(ownerHash, { action: "start", mode: "operating", questionId: "business", value: "작은 카페를 운영 중이에요", revision: 0, requestId: randomUUID() });
      assert.equal(operating.snapshot.intake.mode, "operating");
      assert.equal(operating.snapshot.coach.stage, "operating");
      assert.equal(operating.snapshot.intake.answers.business.value, "작은 카페를 운영 중이에요");
      assert.equal(calls.length, 0);
    });

    for (const mode of ["exploring", "startup", "operating"] as const) await check(`${mode}: complete basic questions without AI configuration or fetch`, async () => {
      const session = await start(mode);
      assert.equal(resolvePlanningLLMConfig(session.ownerHash), null);
      assert.equal(session.result.snapshot.intake.mode, mode);
      assert.equal(session.result.snapshot.coach.stage, mode);
      let snapshot = session.result.snapshot;
      const seen = new Set<string>();
      while (snapshot.nextQuestion) {
        const question = snapshot.nextQuestion;
        assert.ok(!seen.has(question.id), `question ${question.id} must advance`);
        seen.add(question.id);
        assert.ok(seen.size <= 20, "basic flow must terminate");
        const saved = await send(session, { action: "answer", questionId: question.id, ...answerFor(question, snapshot) });
        assert.equal(saved.job, null);
        snapshot = saved.snapshot;
      }
      const current = await load(session);
      assert.equal(snapshot.coreComplete, true);
      assert.equal(snapshot.coreAnswered, snapshot.coreTotal);
      assert.equal(current.coach.stage, mode === "operating" ? "operating" : "startup");
      assert.equal(current.coach.ready, true);
      assert.equal(current.intake.job, null);
      assert.equal(current.coach.design, undefined);
      assert.deepEqual(current.plan.sections, {});
      assert.ok(current.coach.messages.every(message => message.role === "user"));
      if (mode !== "exploring") {
        assert.equal(current.intake.answers.capacity.status, "unknown");
        assert.ok(!current.coach.fields.some(field => field.key === "capacity"), "unknown is not an invented zero");
      }
      if (mode === "operating") {
        assert.equal(current.coach.fields.find(field => field.key === "sales")?.value, "500000원");
        assert.deepEqual(current.plan.answers["intake/period"].value, "2026-08-01 / 2026-08-31");
      }
      assert.equal(calls.length, 0);
    });

    await check("request replay is idempotent; reuse and stale revisions are rejected without mutation", async () => {
      const ownerHash = `intake-idempotency-${randomUUID()}`;
      const command: IntakeCommand = { action: "start", mode: "startup", revision: 0, requestId: randomUUID() };
      const first = await saveIntakeCommand(ownerHash, command);
      const session = { ownerHash, planId: first.plan.id };
      const initial = await loadPlanState(ownerHash);
      assert.equal((await saveIntakeCommand(ownerHash, command)).duplicate, true);
      assert.deepEqual(await loadPlanState(ownerHash), initial);
      const answer: IntakeCommand = { action: "answer", planId: session.planId, revision: first.snapshot.coach.revision, requestId: randomUUID(), questionId: "price", value: "5000원" };
      const saved = await saveIntakeCommand(ownerHash, answer);
      const after = await loadPlanState(ownerHash);
      const duplicate = await saveIntakeCommand(ownerHash, answer);
      assert.equal(duplicate.duplicate, true);
      assert.equal(duplicate.snapshot.coach.revision, saved.snapshot.coach.revision);
      assert.deepEqual(await loadPlanState(ownerHash), after);
      await assert.rejects(() => saveIntakeCommand(ownerHash, { ...answer, value: "9000원" }), assertIntakeError("request_reused", 409));
      await assert.rejects(() => saveIntakeCommand(ownerHash, { ...answer, requestId: randomUUID(), value: "9000원" }), assertIntakeError("revision_conflict", 409));
      assert.deepEqual(await loadPlanState(ownerHash), after);
      assert.equal(calls.length, 0);
    });

    await check("concurrent replay creates one plan and one receipt", async () => {
      const ownerHash = `intake-concurrent-save-${randomUUID()}`;
      const command: IntakeCommand = { action: "start", mode: "startup", revision: 0, requestId: randomUUID() };
      const results = await Promise.all([saveIntakeCommand(ownerHash, command), saveIntakeCommand(ownerHash, command)]);
      assert.deepEqual(results.map(result => result.duplicate).sort(), [false, true]);
      const current = await load({ ownerHash, planId: results[0].plan.id });
      assert.equal(current.state.plans.length, 1);
      assert.equal(current.intake.receipts.length, 1);
      assert.equal(current.coach.revision, 1);
      assert.equal(calls.length, 0);
    });

    await check("label notes require explicit confirmation and never call AI", async () => {
      const session = await start();
      await send(session, { action: "answer", questionId: "business", value: "직장인 사진 촬영" });
      const before = await load(session);
      const text = "예산: 100만원\n고객: 직장인";
      const saved = await send(session, { action: "message", message: text }, true);
      assert.equal(saved.job, null);
      assert.deepEqual(saved.snapshot.coach.fields, before.coach.fields);
      assert.equal(coachDocumentRevision(saved.snapshot.coach), coachDocumentRevision(before.coach));
      assert.equal(saved.snapshot.intake.notes[0].text, text);
      assert.equal(saved.snapshot.intake.notes[0].status, "review");
      assert.equal(saved.snapshot.intake.candidates.length, 2);
      assert.ok(saved.snapshot.intake.candidates.every(candidate => candidate.status === "pending" && candidate.baseValue === null));
      const confirmed = await send(session, { action: "confirm-extraction", candidateIds: saved.snapshot.intake.candidates.map(candidate => candidate.id) });
      assert.ok(confirmed.snapshot.intake.candidates.every(candidate => candidate.status === "applied"));
      for (const candidate of saved.snapshot.intake.candidates) {
        const field = confirmed.snapshot.coach.fields.find(item => item.key === candidate.fieldKey);
        assert.deepEqual(field, { key: candidate.fieldKey, value: candidate.value, quote: candidate.quote, messageId: candidate.noteId, basis: "user" });
      }
      assert.equal(confirmed.snapshot.intake.notes[0].text, text);
      assert.equal(calls.length, 0);
    });

    await check("conflicting label candidates cannot both be confirmed", async () => {
      const session = await start();
      const saved = await send(session, { action: "message", message: "예산: 100만원\n예산: 200만원" });
      const candidates = saved.snapshot.intake.candidates;
      assert.equal(candidates.length, 2);
      const before = await loadPlanState(session.ownerHash);
      await assert.rejects(() => send(session, { action: "confirm-extraction", candidateIds: candidates.map(candidate => candidate.id) }), assertIntakeError("ambiguous_candidate", 400));
      assert.deepEqual(await loadPlanState(session.ownerHash), before);
      const confirmed = await send(session, { action: "confirm-extraction", candidateIds: [candidates[0].id], rejectIds: [candidates[1].id] });
      assert.equal(confirmed.snapshot.coach.fields.find(field => field.key === "budget")?.value, "100만원");
      assert.deepEqual(confirmed.snapshot.intake.candidates.map(candidate => candidate.status), ["applied", "rejected"]);
      assert.equal(calls.length, 0);
    });

    await check("stale rule candidate returns 409 without overwriting a direct answer", async () => {
      const session = await start();
      await send(session, { action: "answer", questionId: "price", value: "5000원" });
      const saved = await send(session, { action: "message", message: "가격: 7000원" });
      const candidate = saved.snapshot.intake.candidates[0];
      assert.ok(candidate);
      assert.equal(candidate.baseValue, "5000원");
      await send(session, { action: "answer", questionId: "price", value: "9000원" });
      const before = await loadPlanState(session.ownerHash);
      await assert.rejects(() => send(session, { action: "confirm-extraction", candidateIds: [candidate.id] }), assertIntakeError("candidate_conflict", 409));
      assert.deepEqual(await loadPlanState(session.ownerHash), before);
      const current = await load(session);
      assert.equal(current.coach.fields.find(field => field.key === "price")?.value, "9000원");
      assert.equal(current.intake.candidates[0].status, "pending");
      assert.equal(calls.length, 0);
    });

    await check("field revision catches edit-and-revert and newly undecided answers", async () => {
      const session = await start();
      await send(session, { action: "answer", questionId: "price", value: "5000원" });
      const saved = await send(session, { action: "message", message: "가격: 7000원\n고객: 새로운 고객" });
      const price = saved.snapshot.intake.candidates.find(candidate => candidate.fieldKey === "price")!;
      const customer = saved.snapshot.intake.candidates.find(candidate => candidate.fieldKey === "customer")!;
      await send(session, { action: "answer", questionId: "price", value: "9000원" });
      await send(session, { action: "answer", questionId: "price", value: "5000원" });
      await send(session, { action: "answer", questionId: "customer", unknown: true });
      await assert.rejects(() => send(session, { action: "confirm-extraction", candidateIds: [price.id] }), assertIntakeError("candidate_conflict", 409));
      await assert.rejects(() => send(session, { action: "confirm-extraction", candidateIds: [customer.id] }), assertIntakeError("candidate_conflict", 409));
      assert.equal(calls.length, 0);
    });

    await check("unavailable AI preserves raw notes before queueing and after configuration disappears", async () => {
      const session = await start();
      const raw = "직장인을 위한 사진 촬영을 하고 싶고 예산은 아직 고민 중입니다.";
      const saved = await send(session, { action: "message", message: raw });
      assert.equal(saved.job, null);
      assert.equal(saved.snapshot.intake.notes[0].status, "failed");
      assert.equal(saved.snapshot.intake.notes[0].text, raw);
      assert.equal(saved.snapshot.coach.messages.at(-1)?.text, raw);
      assert.equal(saved.snapshot.intake.candidates.length, 0);
      assert.equal(saved.snapshot.coach.fields.length, 0);
      const queued = await send(session, { action: "extract" }, true);
      assert.equal(resolvePlanningLLMConfig(session.ownerHash), null);
      assert.deepEqual(await executeIntakeJob(jobRequest(session, queued)), { ok: false });
      const after = await load(session);
      assert.equal(after.intake.job?.status, "failed");
      assert.equal(after.intake.notes[0].text, raw);
      assert.equal(after.intake.notes[0].status, "failed");
      assert.equal(after.coach.messages.at(-1)?.text, raw);
      assert.equal(after.coach.fields.length, 0);
      assert.equal(calls.length, 0);
    });

    await check("8000-character raw note is split and retained without AI", async () => {
      const session = await start();
      const raw = "가".repeat(4000) + "나".repeat(4000);
      const saved = await send(session, { action: "message", message: raw });
      assert.deepEqual(saved.snapshot.intake.notes.map(note => note.text.length), [4000, 4000]);
      assert.equal(saved.snapshot.intake.notes.map(note => note.text).join(""), raw);
      assert.equal(saved.snapshot.coach.messages.at(-1)?.text, raw);
      assert.equal(calls.length, 0);
    });

    await check("queued extraction projects stored notes to the helper and saves candidates only", async () => {
      configureAI(true);
      const session = await start();
      assert.equal(resolvePlanningLLMConfig(session.ownerHash)?.model, "intake-service-fixture");
      const raw = "예산은 100만원으로 생각하고 있습니다.";
      const queued = await send(session, { action: "message", message: raw }, true);
      respond = body => extracted(body, "budget", "100만원", "예산은 100만원");
      const result = await executeIntakeJob(jobRequest(session, queued));
      assert.equal(calls.length, 1, "queued extraction must reach the provider once, not reject stored at/status metadata");
      assert.deepEqual(result, { ok: true });
      const after = await load(session);
      assert.equal(after.intake.job?.status, "complete");
      assert.equal(after.intake.notes[0].status, "review");
      assert.equal(after.intake.notes[0].text, raw);
      assert.equal(after.intake.candidates[0].value, "100만원");
      assert.equal(after.intake.candidates[0].status, "pending");
      assert.deepEqual(after.coach.fields, queued.snapshot.coach.fields);
      assert.equal(after.coach.revision, queued.snapshot.coach.revision);
      assert.equal(coachDocumentRevision(after.coach), coachDocumentRevision(queued.snapshot.coach));
    });

    await check("delayed extraction cannot overwrite a newer price; confirmation conflicts without explicit overwrite", async () => {
      configureAI(true);
      const session = await start();
      await send(session, { action: "answer", questionId: "business", value: "커피 판매" });
      await send(session, { action: "answer", questionId: "price", value: "5000원" });
      const queued = await send(session, { action: "message", message: "한 잔 판매가는 7000원으로 생각합니다." }, true);
      const entered = deferred<void>(), release = deferred<void>();
      respond = async body => { entered.resolve(); await release.promise; return extracted(body, "price", "7000원", "한 잔 판매가는 7000원"); };
      const running = executeIntakeJob(jobRequest(session, queued));
      try {
        await Promise.race([entered.promise, running.then(() => { throw new Error("Extraction finished before the mocked provider was called"); })]);
        const processing = await load(session);
        assert.equal(processing.intake.job?.status, "running");
        assert.equal(processing.intake.notes[0].status, "processing");
        const direct = await send(session, { action: "answer", questionId: "price", value: "9000원" });
        release.resolve();
        assert.deepEqual(await running, { ok: true });
        const finished = await load(session);
        assert.equal(finished.coach.fields.find(field => field.key === "price")?.value, "9000원");
        assert.equal(coachDocumentRevision(finished.coach), coachDocumentRevision(direct.snapshot.coach));
        const candidate = finished.intake.candidates.find(item => item.fieldKey === "price");
        assert.ok(candidate);
        assert.equal(candidate.baseValue, "5000원");
        assert.equal(candidate.value, "7000원");
        assert.equal(candidate.status, "pending");
        const before = await loadPlanState(session.ownerHash);
        await assert.rejects(() => send(session, { action: "confirm-extraction", candidateIds: [candidate.id] }), assertIntakeError("candidate_conflict", 409));
        assert.deepEqual(await loadPlanState(session.ownerHash), before, "409 must not mutate the newer answer or pending candidate");
        const explicit = await send(session, { action: "confirm-extraction", candidateIds: [candidate.id], overwriteIds: [candidate.id] });
        assert.equal(explicit.snapshot.coach.fields.find(field => field.key === "price")?.value, "7000원");
        assert.equal(calls.length, 1);
      } finally { release.resolve(); await running; }
    });

    await check("duplicate execute claims one provider call while running and after completion", async () => {
      configureAI(true);
      const session = await start();
      const queued = await send(session, { action: "message", message: "준비 예산은 100만원으로 정했습니다." }, true);
      const request = jobRequest(session, queued);
      const entered = deferred<void>(), release = deferred<void>();
      respond = async body => { entered.resolve(); await release.promise; return extracted(body, "budget", "100만원", "준비 예산은 100만원"); };
      const running = executeIntakeJob(request);
      try {
        await Promise.race([entered.promise, running.then(() => { throw new Error("Extraction finished before the mocked provider was called"); })]);
        assert.deepEqual(await executeIntakeJob(request), { ok: true });
        assert.equal(calls.length, 1);
        assert.equal((await load(session)).intake.job?.status, "running");
        release.resolve();
        assert.deepEqual(await running, { ok: true });
        const before = await loadPlanState(session.ownerHash);
        assert.deepEqual(await executeIntakeJob(request), { ok: true });
        assert.deepEqual(await loadPlanState(session.ownerHash), before);
        assert.equal(calls.length, 1);
        assert.equal((await load(session)).intake.candidates.length, 1);
      } finally { release.resolve(); await running; }
    });

    for (const failure of ["malformed", "quota429", "rate429"] as const) await check(`${failure}: one attempt, no fallback, preserved raw source`, async () => {
      configureAI(true);
      const session = await start();
      const raw = "구독 서비스를 준비하며 예산은 100만원으로 생각합니다.";
      const queued = await send(session, { action: "message", message: raw }, true);
      respond = () => failure === "malformed" ? completion('{"candidates":') : Response.json({ error: { code: failure === "quota429" ? "insufficient_quota" : "rate_limit_exceeded" } }, { status: 429 });
      const request = jobRequest(session, queued);
      assert.deepEqual(await executeIntakeJob(request), { ok: false });
      assert.equal(calls.length, 1, "a malformed/quota response is one paid attempt, never a retry");
      const after = await load(session);
      assert.equal(after.intake.job?.status, "failed");
      assert.ok(after.intake.job?.error);
      assert.equal(after.intake.notes[0].text, raw);
      assert.equal(after.intake.notes[0].status, "failed");
      assert.equal(after.coach.messages.at(-1)?.text, raw);
      assert.deepEqual(after.coach.fields, queued.snapshot.coach.fields);
      assert.equal(after.intake.candidates.length, 0);
      const beforeReplay = await loadPlanState(session.ownerHash);
      assert.deepEqual(await executeIntakeJob(request), { ok: true });
      assert.deepEqual(await loadPlanState(session.ownerHash), beforeReplay);
      assert.equal(calls.length, 1);
    });

    await check("demo-memory daily quota permits 24 calls and blocks call 25 without blocking local answers", async () => {
      configureAI(true);
      const session = await start();
      respond = () => completion({ message: "가격은 상품 한 건의 판매 금액입니다." });
      for (let index = 0; index < 24; index++) {
        const queued = await send(session, { action: "help", message: "가격은 무엇인가요?" }, true);
        const request = jobRequest(session, queued);
        assert.deepEqual(await executeIntakeJob(request), { ok: true });
        assert.deepEqual(await executeIntakeJob(request), { ok: true }, "completed redelivery must not consume another daily allowance");
        assert.equal((await load(session)).intake.job?.status, "complete");
        assert.equal(calls.length, index + 1);
      }
      const denied = await send(session, { action: "help", message: "예산은 무엇인가요?" }, true);
      assert.deepEqual(await executeIntakeJob(jobRequest(session, denied)), { ok: false });
      assert.equal(calls.length, 24);
      assert.equal((await load(session)).intake.job?.status, "failed");
      const edited = await send(session, { action: "answer", questionId: "price", value: "9000원" });
      assert.equal(edited.snapshot.coach.fields.find(field => field.key === "price")?.value, "9000원");
      assert.equal(calls.length, 24);
    });

    await check("background document saves cannot rewind independently completed intake jobs", async () => {
      const session = await start();
      const queued = await send(session, { action: "message", message: "새로운 고객을 찾으면서 업무를 정리하고 싶어요" }, true);
      const request = jobRequest(session, queued);
      const stale = await loadPlanState(session.ownerHash);
      await updateIntakeJob(request, (_plan, _coach, intake, job) => { job.status = "complete"; intake.notes[0].status = "stored"; });
      stale.plans[0].updatedAt = new Date(Date.now() + 1000).toISOString();
      stale.plans[0].sections.generated = { markdown: "늦게 끝난 문서", html: "<p>늦게 끝난 문서</p>", generatedAt: stale.plans[0].updatedAt };
      await savePlanState(session.ownerHash, stale);
      const latest = await load(session);
      assert.equal(latest.intake.job?.status, "complete");
      assert.equal(latest.intake.notes[0].status, "stored");
      assert.equal(latest.plan.sections.generated.markdown, "늦게 끝난 문서");
      assert.equal(calls.length, 0);
    });

    await check("stale jobs expire without retrying and pending extraction excludes failed notes", async () => {
      const session = await start();
      const saved = await send(session, { action: "message", message: "이전 메모는 정리하지 못했지만 그대로 보관해 주세요" }, true);
      const request = jobRequest(session, saved);
      const old = await load(session);
      old.intake.job!.updatedAt = new Date(Date.now() - 125000).toISOString();
      await savePlanState(session.ownerHash, old.state);
      const expired = await expireStaleIntakeJob(request);
      assert.equal(expired?.intake.job?.status, "failed");
      assert.equal(expired?.intake.notes[0].status, "failed");
      const next = await send(session, { action: "message", message: "새로운 상담 내용도 원문부터 저장해서 나중에 정리하고 싶어요" }, true);
      assert.equal(next.job!.noteIds.length, 1);
      assert.notEqual(next.job!.noteIds[0], expired!.intake.notes[0].id);
      assert.equal(calls.length, 0);
    });

    await check("in-flight legacy coach job cannot overwrite intake migration or subsequent answers", async () => {
      configureAI(true);
      const ownerHash = `intake-legacy-${randomUUID()}`;
      const at = new Date().toISOString();
      const coach = emptyCoach();
      coach.revision = 3; coach.documentRevision = 2; coach.stage = "startup";
      coach.business.name = "기존 사진 사업"; coach.business.description = "기존 사진 사업";
      coach.fields = [{ key: "business", value: "기존 사진 사업", basis: "user", quote: "기존 사진 사업", messageId: "legacy-source" }, { key: "price", value: "5000원", basis: "user", quote: "5000원", messageId: "legacy-price" }];
      const legacy: CoachJob = { token: randomUUID(), runId: randomUUID(), baseRevision: coach.revision, status: "queued", phase: "queued", durable: false, attempt: 1, updatedAt: at, message: { id: randomUUID(), role: "user", text: "예전 사업 구상을 수정해 주세요", at } };
      const plan = { id: `legacy-${randomUUID()}`, title: coach.business.name, planType: COACH_TYPES.startup, createdAt: at, updatedAt: at, sections: { original: { markdown: "기존 문서", html: "<p>기존 문서</p>", generatedAt: at } }, answers: { [COACH_KEY]: { state: coach }, [COACH_JOB_KEY]: legacy } };
      await savePlanState(ownerHash, normalizeState({ plans: [plan], activePlanId: plan.id }));
      const session = { ownerHash, planId: plan.id };
      const request = { ownerHash, planId: plan.id, token: legacy.token };
      const entered = deferred<void>(), release = deferred<void>();
      respond = async () => {
        entered.resolve(); await release.promise;
        return completion({ message: "예전 결과입니다.", title: "늦게 도착한 예전 사업", stage: "startup", depth: "quick", fields: [{ key: "price", value: "1000원", basis: "proposal", quote: "", messageId: "" }], ready: false, suggestions: [] });
      };
      const running = generateAndSaveCoach(request).then(value => ({ value }), error => ({ error }));
      try {
        await Promise.race([entered.promise, running.then(() => { throw new Error("Legacy job finished before provider entry"); })]);
        const migrated = await saveIntakeCommand(ownerHash, { action: "start", planId: plan.id, mode: "startup", revision: coach.revision, requestId: randomUUID() });
        assert.equal(readCoachJob(migrated.plan.answers)?.status, "failed");
        assert.notEqual(readCoachJob(migrated.plan.answers)?.token, legacy.token);
        await send(session, { action: "answer", questionId: "price", value: "9000원" });
        const beforeCompletion = await loadPlanState(ownerHash);
        release.resolve();
        const outcome = await running;
        assert.ok("error" in outcome);
        assert.match(String(outcome.error), /COACH_JOB_SUPERSEDED|PLAN_VERSION_CONFLICT/);
        assert.deepEqual(await loadPlanState(ownerHash), beforeCompletion, "late legacy completion must not write coach, intake, or documents");
        const after = await load(session);
        assert.equal(after.coach.fields.find(field => field.key === "price")?.value, "9000원");
        assert.equal(after.plan.title, "기존 사진 사업");
        assert.deepEqual(after.plan.sections, plan.sections);
        assert.equal(calls.length, 1);
        await assert.rejects(() => generateAndSaveCoach(request), /COACH_JOB_NOT_FOUND|COACH_JOB_SUPERSEDED/);
        assert.equal(calls.length, 1, "retired delivery must not call the provider again");
        assert.deepEqual(await loadPlanState(ownerHash), beforeCompletion);
      } finally { release.resolve(); await running; }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(`business-intake-service: ${passed} passed, ${failures.length} failed (demo-memory; mocked provider only)`);
  if (failures.length) throw new Error(`Failing service cases: ${failures.join("; ")}`);
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
