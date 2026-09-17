import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CoachJob } from "../lib/plan-builder/coach-job-types";
import { ksicStructure } from "../lib/plan-builder/ksic";
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
    const { intakeStructureBrief } = await import("../lib/plan-builder/intake-structure-brief");
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

    await check("unified start stores an unclassified question atomically without AI or confirmed facts", async () => {
      configureAI(true);
      const ownerHash = `intake-note-start-${randomUUID()}`;
      const command: IntakeCommand = { action: "start", mode: "exploring", message: "카페가 괜찮을까요?", noteIntent: "question", revision: 0, requestId: randomUUID() };
      const first = await saveIntakeCommand(ownerHash, command, { aiAvailable: true, aiAllowed: true });
      assert.equal(first.snapshot.coach.fields.length, 0);
      assert.equal(first.snapshot.intake.notes[0].status, "stored");
      assert.equal(first.snapshot.intake.notes[0].intent, "question");
      assert.equal(first.job, null);
      const replay = await saveIntakeCommand(ownerHash, command, { aiAvailable: true, aiAllowed: true });
      assert.equal(replay.snapshot.coach.messages.length, 1);
      assert.equal(replay.snapshot.intake.notes.length, 1);
      assert.equal(calls.length, 0);
      await assert.rejects(saveIntakeCommand(`invalid-${randomUUID()}`, { ...command, questionId: "business", value: "카페" }), assertIntakeError("invalid_start", 400));
    });

    await check("deferred notes preserve original input and document version even when AI is configured", async () => {
      const session = await start();
      await send(session, { action: "answer", questionId: "business", value: "사진 촬영 서비스" });
      const before = await load(session);
      configureAI(true);
      const note = await send(session, { action: "note", message: "예산: 100만원\n고객: 직장인", noteIntent: "memo" }, true);
      assert.equal(note.job, null);
      assert.equal(note.snapshot.intake.candidates.length, 0);
      assert.equal(note.snapshot.intake.notes.at(-1)?.status, "stored");
      assert.equal(coachDocumentRevision(note.snapshot.coach), coachDocumentRevision(before.coach));
      assert.deepEqual(note.snapshot.coach.fields, before.coach.fields);
      const extraction = await send(session, { action: "extract" }, true);
      assert.equal(extraction.job?.kind, "extract");
      assert.equal(extraction.job?.noteIds.length, 1);
      assert.equal(calls.length, 0, "Scheduling is not execution; note collection never calls the provider");
    });

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

    await check("industry answer with a KSIC code stores the code, derives the sector and labels the message", async () => {
      configureAI(true);
      const ownerHash = `intake-ksic-${randomUUID()}`;
      const initial = await saveIntakeCommand(ownerHash, { action: "start", mode: "startup", questionId: "business", value: "동네에서 작은 카페를 하고 싶어요", revision: 0, requestId: randomUUID() }, { aiAvailable: true, aiAllowed: true });
      const session = { ownerHash, planId: initial.plan.id };
      assert.ok(initial.snapshot.ksicCandidates.some(item => item.code === "56221"), `KSIC candidates from the business text: ${initial.snapshot.ksicCandidates.map(item => item.code).join(",")}`);
      await assert.rejects(() => send(session, { action: "answer", questionId: "industry", value: "food_beverage", ksic: "99999" }), assertIntakeError("invalid_ksic", 400));
      const next = await send(session, { action: "answer", questionId: "industry", value: "general", ksic: "56221" });
      assert.equal(next.snapshot.intake.sector, "food_beverage", "the sector follows the KSIC code, not the coarse value");
      assert.equal(next.snapshot.intake.answers.industry.value, "food_beverage");
      assert.equal(next.snapshot.ksic?.code, "56221");
      assert.equal(next.snapshot.ksic?.structure?.license, "registration");
      assert.equal(next.snapshot.coach.business.industry, "카페 · 음식점");
      assert.ok((await load(session)).coach.messages.some(message => message.role === "user" && message.text.includes("커피 전문점")), "the user message carries the KSIC name");
      const again = await send(session, { action: "answer", questionId: "industry", value: "software" });
      assert.equal(again.snapshot.ksic, null, "re-answering without a code clears it");
      assert.equal(again.snapshot.intake.sector, "software");
      // 구조 기본값 반영: 월 구독형 소프트웨어는 가격 기준이 "월 구독 1건", 요약에 구조 라벨이 붙는다
      const saasOwner = `intake-ksic-saas2-${randomUUID()}`;
      const saas2 = await saveIntakeCommand(saasOwner, { action: "start", mode: "startup", questionId: "business", value: "소규모 팀용 예약 관리 SaaS를 만들고 있어요", revision: 0, requestId: randomUUID() }, { aiAvailable: true, aiAllowed: true });
      const saasNext = await send({ ownerHash: saasOwner, planId: saas2.plan.id }, { action: "answer", questionId: "industry", value: "software", ksic: "58222" });
      assert.equal(saasNext.snapshot.questions.find(question => question.id === "price")?.period, "월 구독 1건", "price basis follows the KSIC revenue structure");
      assert.ok(saasNext.snapshot.ksic?.summary.includes("월 구독"), `summary labels: ${saasNext.snapshot.ksic?.summary.join(",")}`);
      assert.equal(saasNext.snapshot.ksic?.licenseHint, null);
      // 구조 기준 상세 팩과 손익 계산: 월 구독 모델은 유지 기간 → 변동비 → 고정비가 업종 상세 앞에 오고, 답이 차면 손익분기·생애 매출이 계산된다(AI 0회)
      const saasSession = { ownerHash: saasOwner, planId: saas2.plan.id };
      assert.ok(saasNext.snapshot.financialSummary.includes("아직 없는 값"), saasNext.snapshot.financialSummary);
      const withDetails = await send(saasSession, { action: "details" });
      const ids = withDetails.snapshot.questions.map(question => question.id), at = ids.indexOf("structure.retentionMonths");
      assert.deepEqual(ids.slice(at, at + 4), ["structure.retentionMonths", "structure.unitCost", "structure.cost", "software.workflow"], ids.join(","));
      assert.equal(withDetails.snapshot.questions.find(question => question.id === "structure.unitCost")?.period, "구독자 1명(월)");
      await send(saasSession, { action: "answer", questionId: "price", value: "30000원" });
      await send(saasSession, { action: "answer", questionId: "capacity", value: "대표자 혼자 / 한 달 50명" });
      await send(saasSession, { action: "answer", questionId: "structure.retentionMonths", value: "12개월" });
      await send(saasSession, { action: "answer", questionId: "structure.unitCost", value: "3000원" });
      const priced = await send(saasSession, { action: "answer", questionId: "structure.cost", value: "100만원" });
      for (const text of ["월 구독 기준", "손익분기: 월 38건", "구독 유지 평균 12개월", "생애 매출 360,000원", "월 이탈률 약 8%", "매달 신규 약 5명", "월 50명 감당 기준"]) assert.ok(priced.snapshot.financialSummary.includes(text), `${text} in: ${priced.snapshot.financialSummary}`);
      assert.equal(priced.snapshot.intake.answers["structure.retentionMonths"]?.value, 12);
      assert.equal(priced.snapshot.summary.find(item => item.id === "unitCost")?.label, "구독자 1명당 월 비용");
      assert.equal(priced.snapshot.coreAnswered, saasNext.snapshot.coreAnswered + 2, "structure answers do not count toward the core progress; price and capacity do");
      // 문서용 구조 브리프: 수익 모델 산식·입력, 인허가 체크리스트, 초기 자본 항목이 결정적으로 채워진다
      const saasLoaded = await load(saasSession);
      const brief = intakeStructureBrief(saasLoaded.coach, saasLoaded.intake);
      assert.ok(brief.source.startsWith("표준산업분류 58222"), brief.source);
      assert.equal(brief.revenueModel.kind, "월 구독"); assert.equal(brief.revenueModel.priceBasis, "월 구독 1건");
      assert.ok(brief.revenueModel.inputs.some(input => input.startsWith("월 구독 가격: 30000원")), brief.revenueModel.inputs.join(" | "));
      assert.ok(brief.revenueModel.metrics.some(metric => metric === "평균 구독 유지 기간: 12개월"), brief.revenueModel.metrics.join(" | "));
      assert.equal(brief.licenseChecklist.status, "인허가 없음");
      assert.equal(brief.capitalPlan.form, "무점포 가능");
      assert.ok(brief.capitalPlan.inputs.some(input => input.includes("= 3,000,000원")), brief.capitalPlan.inputs.join(" | "));
      assert.ok(brief.financialScenario.includes("손익분기: 월 38건"));
      // 공간 제공(공유오피스)은 처리량 단위 칩이 좌석·룸부터
      const spaceOwner = `intake-ksic-space-${randomUUID()}`;
      const space = await saveIntakeCommand(spaceOwner, { action: "start", mode: "startup", questionId: "business", value: "공유오피스를 열려고 해요", revision: 0, requestId: randomUUID() }, { aiAvailable: true, aiAllowed: true });
      const spaceNext = await send({ ownerHash: spaceOwner, planId: space.plan.id }, { action: "answer", questionId: "industry", value: "space_hospitality", ksic: "68112" });
      const capacityUnits = spaceNext.snapshot.questions.find(question => question.id === "capacity")?.options?.filter(option => option.group === "unit").map(option => option.label) ?? [];
      assert.equal(capacityUnits[0], "좌석·룸", `capacity units: ${capacityUnits.join(",")}`);
      assert.equal(spaceNext.snapshot.ksic?.summary[1], "공간 제공");
      const spaceDetails = await send({ ownerHash: spaceOwner, planId: space.plan.id }, { action: "details" });
      assert.ok(spaceDetails.snapshot.questions.some(question => question.id === "structure.occupancy"), "rental model asks the occupancy rate");
      await send({ ownerHash: spaceOwner, planId: space.plan.id }, { action: "answer", questionId: "structure.occupancy", value: "70%" });
      await assert.rejects(() => send({ ownerHash: spaceOwner, planId: space.plan.id }, { action: "answer", questionId: "structure.occupancy", value: "170%" }), assertIntakeError("invalid_number", 400));
      // 사용자 수정이 KSIC 기본값을 덮어쓴다: 카페를 월 구독(정기 구독 커피)으로 바꾸면 가격 기준이 따라온다
      const spaceSession = { ownerHash: spaceOwner, planId: space.plan.id };
      const fixed = await send(spaceSession, { action: "structure", structure: { revenue: "subscription" } });
      assert.equal(fixed.snapshot.structure?.values.revenue, "subscription");
      assert.equal(fixed.snapshot.structure?.basis.revenue, "user");
      assert.equal(fixed.snapshot.structure?.basis.payer, "ksic", "untouched axes keep the KSIC basis");
      assert.ok(fixed.snapshot.questions.some(question => question.id === "structure.retentionMonths") && !fixed.snapshot.questions.some(question => question.id === "structure.occupancy"), "the structure pack follows the edited revenue model");
      assert.equal((fixed.snapshot.intake.answers["structure.occupancy"] as { value?: unknown } | undefined)?.value, 70, "the inactive answer stays in the question audit");
      assert.equal(fixed.snapshot.questions.find(question => question.id === "price")?.period, "월 구독 1건");
      assert.ok((await load(spaceSession)).coach.messages.some(message => message.text.startsWith("사업 구조 수정:") && message.text.includes("월 구독")));
      await assert.rejects(() => send(spaceSession, { action: "structure", structure: {} }), assertIntakeError("structure_required", 400));
      await assert.rejects(() => send(spaceSession, { action: "structure", structure: { revenue: "weird" } as never }));
      const cleared = await send(session, { action: "structure", structure: { payer: "b2b" } });
      assert.equal(cleared.snapshot.structure?.basis.payer, "user");
      assert.equal(cleared.snapshot.structure?.basis.revenue, "sector", "without a KSIC code the remaining axes come from the sector default");
      assert.equal(calls.length, 0);
    });

    await check("exploring mode adds KSIC map candidates from interest, experience and start conditions, and picking one sets the code", async () => {
      configureAI(true);
      const ownerHash = `intake-map-${randomUUID()}`;
      const initial = await saveIntakeCommand(ownerHash, { action: "start", mode: "exploring", revision: 0, requestId: randomUUID() }, { aiAvailable: true, aiAllowed: true });
      const session = { ownerHash, planId: initial.plan.id };
      assert.equal(initial.snapshot.candidateIdeas.length, 3, "without any signal only the curated templates show");
      assert.equal(initial.snapshot.coreTotal, 12);
      await send(session, { action: "answer", questionId: "interest", value: ["local_service"] });
      const withExperience = await send(session, { action: "answer", questionId: "experience", value: "네일아트 자격증이 있고 손님 응대를 오래 했어요" });
      const ideas = withExperience.snapshot.candidateIdeas;
      assert.ok(ideas.slice(0, 3).every(idea => !idea.id.startsWith("ksic:")), "curated templates stay first");
      assert.ok(ideas.length > 3 && ideas.length <= 8, `map candidates appended: ${ideas.map(idea => idea.id).join(",")}`);
      const nail = ideas.find(idea => idea.id === "ksic:96119");
      assert.ok(nail, `nail salon from the experience text: ${ideas.map(idea => idea.id).join(",")}`);
      assert.ok(nail!.reasons.some(reason => reason.includes("네일")), nail!.reasons.join(" | "));
      assert.ok(nail!.description.includes("96119") && nail!.description.includes("신고·등록 필요"), nail!.description);
      assert.equal(ideas.indexOf(nail!), 3, "the experience match leads the map candidates");
      await send(session, { action: "answer", questionId: "hoursPerWeek", value: "20시간" });
      await send(session, { action: "answer", questionId: "budget", value: "300만원" });
      await send(session, { action: "answer", questionId: "interest", value: ["software"] });
      await assert.rejects(() => send(session, { action: "answer", questionId: "conditions", value: ["무점포로 시작", "nope"] }), assertIntakeError("invalid_option", 400));
      const conditioned = await send(session, { action: "answer", questionId: "conditions", value: ["무점포로 시작", "인허가 없이 시작"] });
      assert.equal(conditioned.snapshot.nextQuestion?.id, "candidate");
      assert.equal(conditioned.snapshot.summary.find(item => item.id === "conditions")?.value, "무점포로 시작, 인허가 없이 시작");
      // 서로 모순되는 조건이면 지도 후보가 0개가 되고 후보 질문이 조건을 줄이라고 안내한다
      const contradictory = await send(session, { action: "answer", questionId: "conditions", value: ["무점포로 시작", "매장·공간에서 제공"] });
      assert.ok(!contradictory.snapshot.candidateIdeas.some(idea => idea.id.startsWith("ksic:")));
      assert.ok(contradictory.snapshot.questions.find(question => question.id === "candidate")?.hint?.includes("시작 조건에서"), "empty map result explains how to widen");
      const restored = await send(session, { action: "answer", questionId: "conditions", value: ["무점포로 시작", "인허가 없이 시작"] });
      assert.equal(restored.snapshot.questions.find(question => question.id === "candidate")?.hint, undefined);
      const mapIdeas = restored.snapshot.candidateIdeas.filter(idea => idea.id.startsWith("ksic:"));
      assert.ok(mapIdeas.length > 0 && mapIdeas.length <= 5, `software map candidates: ${mapIdeas.map(idea => idea.id).join(",")}`);
      for (const idea of mapIdeas) {
        const structure = ksicStructure(idea.id.slice(5))!;
        assert.equal(structure.capital, "remote", idea.id); assert.equal(structure.license, "none", idea.id); assert.ok(structure.smallBusiness, idea.id);
        assert.ok(idea.reasons.some(reason => reason.includes("무점포로 시작") && reason.includes("인허가 없이 시작")), idea.reasons.join(" | "));
        assert.equal(idea.sector, "software");
      }
      const chosen = mapIdeas[0];
      const picked = await send(session, { action: "answer", questionId: "candidate", value: chosen.id });
      assert.equal(picked.snapshot.intake.ksic, chosen.id.slice(5));
      assert.equal(picked.snapshot.ksic?.code, chosen.id.slice(5));
      assert.equal(picked.snapshot.coach.business.name, chosen.title);
      assert.equal(picked.snapshot.coach.fields.find(field => field.key === "business")?.value, chosen.title);
      assert.equal(picked.snapshot.intake.sector, "software");
      assert.equal(picked.snapshot.structure?.basis.payer, "ksic", "the picked code becomes the structure basis");
      await assert.rejects(() => send(session, { action: "answer", questionId: "candidate", value: "ksic:99999" }), assertIntakeError("invalid_option", 400));
      const unpicked = await send(session, { action: "answer", questionId: "candidate", unknown: true });
      assert.equal(unpicked.snapshot.intake.ksic, null, "clearing the candidate clears the code too");
      assert.equal(calls.length, 0, "the map costs no AI calls");
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

    await check("explicit help persists one transcript reply across subsequent jobs without changing document revision", async () => {
      configureAI(true);
      const session = await start();
      const initial = await load(session);
      const documentRevision = coachDocumentRevision(initial.coach);
      respond = () => completion({ message: "먼저 고객이 비용을 내는 대상을 구분해 보세요." });
      const queued = await send(session, { action: "help", message: "고객은 어떻게 정하나요?" }, true);
      const request = jobRequest(session, queued);
      assert.deepEqual(await executeIntakeJob(request), { ok: true });
      assert.deepEqual(await executeIntakeJob(request), { ok: true });
      const completed = await load(session);
      const replyId = `${request.jobId}:reply`;
      assert.equal(completed.coach.messages.filter(message => message.id === replyId).length, 1);
      assert.equal(coachDocumentRevision(completed.coach), documentRevision);
      assert.equal(calls.length, 1);
      await send(session, { action: "note", message: "문의가 많은 상품부터 확인하고 있어요", noteIntent: "memo" }, true);
      await send(session, { action: "extract" }, true);
      const next = await load(session);
      assert.equal(next.intake.job?.kind, "extract");
      assert.equal(next.coach.messages.filter(message => message.id === replyId).length, 1);
      assert.equal(coachDocumentRevision(next.coach), documentRevision);
      assert.equal(calls.length, 1, "queuing the next job must not synchronously call a provider");
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
