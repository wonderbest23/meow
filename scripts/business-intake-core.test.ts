import assert from "node:assert/strict";
import type { CoachField, CoachState } from "../lib/plan-builder/coach";
import type { IntakeMode, IntakeQuestion } from "../lib/plan-builder/intake-questions";
import type { IntakeCandidate, IntakeCommand, IntakeState, IntakeValue } from "../lib/plan-builder/intake-types";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";

const AT = "2026-09-16T00:00:00.000Z";
const LATER = "2026-09-16T00:01:00.000Z";
type Fixture = { plan: ServerPlan; coach: CoachState; intake: IntakeState };

async function main() {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => { fetchCalls++; throw new Error("Pure intake tests must not fetch"); };
  try {
    const { emptyCoach } = await import("../lib/plan-builder/coach-job");
    const { COACH_KEY, COACH_TYPES, coachDocumentRevision } = await import("../lib/plan-builder/coach");
    const { INTAKE_KEY, INTAKE_VERSION } = await import("../lib/plan-builder/intake-types");
    const { coreQuestions, detailQuestions, intakeCandidates, intakeSectorOptions, structureQuestions } = await import("../lib/plan-builder/intake-questions");
    const { PROPOSAL_SECTORS, SECTOR_PROFILES } = await import("../lib/plan-builder/proposal-blueprint");
    const { IntakeError, createIntake, readIntake, intakeQuestions, answeredIntakeQuestion, intakeSnapshot,
      applyIntakeAnswer, applyIntakeCandidates, intakeBusinessFingerprint, finishIntakeMutation, displayIntakeValue, effectiveStructure,
    } = await import("../lib/plan-builder/intake-core");

    let serial = 0;
    let passed = 0;
    const failures: Array<{ name: string; message: string }> = [];
    // Run every regression even when an earlier one fails, without masking a failing exit status.
    function check(name: string, run: () => void) {
      try { run(); passed++; }
      catch (error) { failures.push({ name, message: error instanceof Error ? error.message : String(error) }); }
    }
    const field = (key: CoachField["key"], value: string, basis: CoachField["basis"] = "user"): CoachField => ({
      key, value, basis, messageId: `source-${key}`, quote: value,
    });
    function fixture(mode: IntakeMode, existing?: CoachState): Fixture {
      const coach = existing ?? emptyCoach();
      if (!existing) {
        coach.stage = mode;
        coach.business.stage = mode === "operating" ? "운영 중" : "사업 기획";
      }
      const intake = createIntake(coach, mode, AT);
      const plan: ServerPlan = {
        id: "plan-intake-core", title: coach.business.name,
        planType: COACH_TYPES[intake.mode === "operating" ? "operating" : "startup"],
        createdAt: AT, updatedAt: AT, sections: {},
        answers: { [COACH_KEY]: { state: coach }, [INTAKE_KEY]: { state: intake } },
      };
      return { plan, coach, intake };
    }
    const snapshot = (f: Fixture) => intakeSnapshot(f.plan, f.coach, f.intake);
    const fingerprint = (f: Fixture) => intakeBusinessFingerprint(f.coach, f.plan.answers);
    function command(f: Fixture, patch: Partial<IntakeCommand>): IntakeCommand {
      return { action: "answer", revision: f.coach.revision,
        requestId: `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`, ...patch };
    }
    function answer(f: Fixture, questionId: string, value?: IntakeValue, unknown = false) {
      const before = fingerprint(f);
      applyIntakeAnswer(f.plan, f.coach, f.intake, command(f, { questionId, value, unknown }), LATER);
      return finishIntakeMutation(f.coach, before, f.plan.answers);
    }
    function confirm(f: Fixture, patch: Partial<IntakeCommand>) {
      const before = fingerprint(f);
      applyIntakeCandidates(f.coach, f.intake, command(f, { action: "confirm-extraction", ...patch }), LATER);
      return finishIntakeMutation(f.coach, before, f.plan.answers);
    }
    function rejected(f: Fixture, patch: Partial<IntakeCommand>, code?: string, status = 400) {
      const before = structuredClone(f);
      const input = command(f, patch);
      assert.throws(() => input.action === "confirm-extraction"
        ? applyIntakeCandidates(f.coach, f.intake, input, LATER)
        : applyIntakeAnswer(f.plan, f.coach, f.intake, input, LATER), error => {
        assert.ok(error instanceof IntakeError, "Reject with an IntakeError, not a runtime exception");
        if (code) assert.equal(error.code, code);
        assert.equal(error.status, status);
        return true;
      });
      assert.deepEqual(f, before, "Rejected commands must leave plan, coach and intake unchanged");
    }
    function pending(id: string, fieldKey: CoachField["key"], value: string, baseValue: string | null = null): IntakeCandidate {
      return { id, fieldKey, value, baseValue, quote: `${fieldKey}: ${value}`, noteId: `note-${id}`, status: "pending" };
    }
    function sample(question: IntakeQuestion, sector: typeof PROPOSAL_SECTORS[number]): IntakeValue {
      if (question.id === "industry") return sector;
      if (question.id === "interest") return [sector];
      if (question.id === "period") return "2026-09-01 / 2026-09-15";
      if (question.unit === "원") return "12,000원";
      if (question.kind === "single") return question.options![0].value;
      if (question.kind === "multi") return [question.options![0].value];
      return question.kind === "number" ? 2 : `입력한 ${question.label}`;
    }

    for (const mode of ["exploring", "startup", "operating"] as const) for (const sector of PROPOSAL_SECTORS) {
      check(`matrix ${mode}/${sector}: <=11 core, 4 details, one next question, ready`, () => {
        const f = fixture(mode);
        const coreIds = coreQuestions(mode).map(question => question.id);
        assert.equal(coreIds.length, mode === "exploring" ? 12 : 11, "exploring adds the start-conditions step before the candidates");
        const visited: string[] = [];
        for (let index = 0; index < coreIds.length; index++) {
          const state = snapshot(f);
          assert.ok(state.coreTotal <= coreIds.length);
          assert.equal(state.coreAnswered, index);
          assert.equal(state.coreComplete, false);
          assert.equal(state.nextQuestion?.id, coreIds[index]);
          const question = state.nextQuestion!;
          visited.push(question.id);
          answer(f, question.id, sample(question, sector));
          if (mode === "operating") assert.equal(f.coach.stage, "operating");
        }
        assert.equal(new Set(visited).size, coreIds.length);
        assert.equal(snapshot(f).coreComplete, true);
        assert.equal(snapshot(f).nextQuestion, null);
        assert.equal(f.coach.ready, true);
        assert.equal(f.intake.sector, sector);
        assert.equal(f.coach.business.industry, SECTOR_PROFILES[sector].label);

        const beforeDetails = fingerprint(f), revision = coachDocumentRevision(f.coach);
        f.intake.detailsRequested = true;
        assert.equal(finishIntakeMutation(f.coach, beforeDetails, f.plan.answers), false);
        assert.equal(coachDocumentRevision(f.coach), revision, "Opening details is not a source edit");
        // 상세 팩 = 구조(수익 방식) 질문 2~3개 + 업종 질문 4개. 필드 질문(변동비·고정비)은 coach.fields가 원천이라 intake/details에 들어가지 않는다.
        const detailPack = [...structureQuestions(mode, effectiveStructure(f.intake).values), ...detailQuestions(sector)];
        const detailIds = detailPack.map(question => question.id);
        assert.equal(detailQuestions(sector).length, 4);
        assert.ok(detailPack.filter(question => question.id.startsWith("structure.")).length >= (mode === "operating" ? 1 : 2), "operating already asks fixed cost in the core, so its pack is variable cost plus the model metric");
        assert.equal(snapshot(f).questions.length, coreIds.length + detailIds.length);
        for (const id of detailIds) {
          const state = snapshot(f);
          assert.equal(state.coreTotal, coreIds.length);
          assert.equal(state.coreComplete, true);
          assert.equal(state.nextQuestion?.id, id);
          answer(f, id, sample(state.nextQuestion!, sector));
        }
        assert.equal(snapshot(f).nextQuestion, null);
        assert.deepEqual(Object.keys(f.plan.answers["intake/details"]), detailPack.filter(question => !question.fieldKey).map(question => question.id));
        assert.ok(f.coach.fields.some(field => field.key === "unitCost" && field.basis === "user"), "variable cost lands in coach.fields for the calculation");
        assert.equal(f.coach.ready, true);
      });
    }

    check("missing, explicit zero, and unknown are three different answer states", () => {
      const f = fixture("startup");
      const budget = coreQuestions("startup").find(question => question.id === "budget")!;
      assert.equal(Object.hasOwn(f.intake.answers, "budget"), false);
      assert.equal(answeredIntakeQuestion(f.intake, f.coach, budget), false);
      answer(f, "budget", 0);
      assert.equal(f.intake.answers.budget.status, "answered");
      assert.equal(f.intake.answers.budget.value, 0);
      assert.equal(f.coach.fields.find(item => item.key === "budget")?.value, "0원");
      assert.equal(answeredIntakeQuestion(f.intake, f.coach, budget), true);
      answer(f, "budget", 999, true);
      assert.equal(f.intake.answers.budget.status, "unknown");
      assert.equal(f.intake.answers.budget.value, null);
      assert.equal(f.coach.fields.some(item => item.key === "budget"), false);
      assert.equal(answeredIntakeQuestion(f.intake, f.coach, budget), true);
      assert.match(snapshot(f).financialSummary, /미입력 비용은 0원이 아닙니다/);
    });
    check("editing an earlier answer changes one field without rewinding progress", () => {
      const f = fixture("startup");
      answer(f, "industry", "software"); answer(f, "business", "원래 사업");
      answer(f, "customer", "첫 고객"); answer(f, "problem", "첫 문제");
      const next = snapshot(f).nextQuestion?.id, answered = snapshot(f).coreAnswered;
      const revision = coachDocumentRevision(f.coach);
      assert.equal(answer(f, "customer", "바뀐 고객"), true);
      assert.equal(snapshot(f).nextQuestion?.id, next);
      assert.equal(snapshot(f).coreAnswered, answered);
      assert.equal(f.coach.fields.filter(item => item.key === "customer").length, 1);
      assert.equal(f.coach.fields.find(item => item.key === "customer")?.value, "바뀐 고객");
      assert.equal(coachDocumentRevision(f.coach), revision + 1);
      assert.equal(f.coach.ideaOrigin?.text, "원래 사업");
    });
    check("changing sector replaces the visible detail pack and rejects old IDs atomically", () => {
      const f = fixture("startup");
      answer(f, "industry", "food_beverage"); f.intake.detailsRequested = true;
      answer(f, "food_beverage.peakOrders", 3);
      answer(f, "industry", "software");
      const ids = intakeQuestions(f.intake, f.coach).map(question => question.id);
      assert.ok(detailQuestions("software").every(question => ids.includes(question.id)));
      assert.ok(!ids.some(id => id.startsWith("food_beverage.")));
      assert.ok(!snapshot(f).summary.some(item => item.id.startsWith("food_beverage.")));
      rejected(f, { questionId: "food_beverage.peakOrders", value: 4 }, "question_unknown");
    });
    check("changing sector removes inactive detail answers from document sources", () => {
      const f = fixture("startup");
      answer(f, "industry", "food_beverage"); f.intake.detailsRequested = true;
      answer(f, "food_beverage.peakOrders", 3);
      answer(f, "industry", "software");
      assert.ok(Object.keys(f.plan.answers["intake/details"] ?? {}).every(id => id.startsWith("software.")), "Old food-service answers must not remain active software document sources");
    });
    check("sector round-trips retain audited answers and restore only the active pack", () => {
      const f = fixture("startup");
      answer(f, "industry", "food_beverage"); f.intake.detailsRequested = true;
      answer(f, "food_beverage.peakOrders", 0);
      answer(f, "food_beverage.signatureMenu", undefined, true);
      const originalSources = structuredClone(f.plan.answers["intake/details"]);
      const originalZero = structuredClone(f.intake.answers["food_beverage.peakOrders"]);
      const originalUnknown = structuredClone(f.intake.answers["food_beverage.signatureMenu"]);
      answer(f, "industry", "software"); answer(f, "software.workflow", "새 작업");
      assert.deepEqual(f.intake.answers["food_beverage.peakOrders"], originalZero);
      assert.deepEqual(f.intake.answers["food_beverage.signatureMenu"], originalUnknown);
      assert.deepEqual(Object.keys(f.plan.answers["intake/details"]), ["software.workflow"]);
      answer(f, "industry", "food_beverage");
      assert.deepEqual(f.plan.answers["intake/details"], originalSources);
      assert.equal(f.intake.answers["software.workflow"].value, "새 작업");
      assert.equal(snapshot(f).summary.find(item => item.id === "food_beverage.peakOrders")?.value, "0");
      assert.equal(snapshot(f).summary.find(item => item.id === "food_beverage.signatureMenu")?.value, "아직 미정");
    });
    check("sector round-trips preserve the original source quote, not a reconstructed normalized value", () => {
      const f = fixture("startup");
      answer(f, "industry", "food_beverage"); f.intake.detailsRequested = true;
      answer(f, "food_beverage.peakOrders", "3건");
      const original = structuredClone(f.plan.answers["intake/details"]["food_beverage.peakOrders"]);
      answer(f, "industry", "software"); answer(f, "industry", "food_beverage");
      assert.deepEqual(f.plan.answers["intake/details"]["food_beverage.peakOrders"], original, "Reactivating an answer must retain its original source evidence");
    });
    check("unknown industry clears the previous explicit classification", () => {
      const f = fixture("startup");
      answer(f, "industry", "software"); f.intake.detailsRequested = true;
      answer(f, "industry", undefined, true);
      assert.equal(f.intake.answers.industry.value, null);
      assert.equal(f.coach.business.industry, "", "Unknown must not retain the old confirmed industry");
      assert.equal(f.intake.sector, "general", "Unknown classification uses only the unclassified detail pack");
      const ids = snapshot(f).questions.map(question => question.id);
      assert.ok(detailQuestions("general").every(question => ids.includes(question.id)));
      assert.ok(!ids.some(id => id.startsWith("software.")));
    });
    check("detail answers distinguish zero from unknown without coach-field coercion", () => {
      const f = fixture("startup");
      answer(f, "industry", "food_beverage"); f.intake.detailsRequested = true;
      answer(f, "food_beverage.peakOrders", 0);
      assert.equal((f.plan.answers["intake/details"]["food_beverage.peakOrders"] as { value: unknown }).value, 0);
      answer(f, "food_beverage.peakOrders", undefined, true);
      assert.equal((f.plan.answers["intake/details"]["food_beverage.peakOrders"] as { value: unknown }).value, null);
      assert.ok(!f.coach.fields.some(item => item.key === "capacity"));
    });

    for (const mode of ["exploring", "startup", "operating"] as const) {
      check(`${mode}: all core questions may be unknown without inventing a ready business`, () => {
        const f = fixture(mode);
        for (let index = 0; index < coreQuestions(mode).length; index++) {
          const question = snapshot(f).nextQuestion;
          assert.ok(question);
          answer(f, question.id, undefined, true);
        }
        assert.equal(snapshot(f).coreComplete, true);
        assert.equal(snapshot(f).nextQuestion, null);
        assert.equal(f.coach.ready, false);
        assert.deepEqual(f.coach.fields, []);
        assert.ok(Object.values(f.intake.answers).every(value => value.status === "unknown" && value.value === null));
        if (mode === "operating") assert.equal(f.coach.stage, "operating");
      });
      check(`${mode}: known business enables ready, unknown clears it without resetting operations`, () => {
        const f = fixture(mode);
        answer(f, "business", "직접 입력한 사업");
        assert.equal(f.coach.ready, true);
        assert.equal(f.coach.stage, mode === "operating" ? "operating" : "startup");
        answer(f, "business", undefined, true);
        assert.equal(f.coach.ready, false);
        assert.equal(f.coach.business.description, "");
        assert.ok(!f.coach.fields.some(item => item.key === "business"));
        assert.equal(f.coach.stage, mode === "operating" ? "operating" : "exploring");
      });
      check(`${mode}: rejecting extraction cannot make an unknown business ready`, () => {
        const f = fixture(mode);
        answer(f, "business", undefined, true);
        f.intake.candidates = [pending("unused", "customer", "고객")];
        confirm(f, { rejectIds: ["unused"] });
        assert.equal(f.intake.candidates[0].status, "rejected");
        assert.equal(f.coach.ready, false, "Ready requires an identified business, including operating mode");
        if (mode === "operating") assert.equal(f.coach.stage, "operating");
      });
    }
    check("exploring selection uses current authored candidate options", () => {
      const f = fixture("exploring");
      answer(f, "interest", ["software"]);
      const idea = snapshot(f).candidateIdeas[0];
      assert.equal(idea.sector, "software");
      answer(f, "candidate", idea.id);
      assert.equal(f.coach.business.name, idea.title);
      assert.equal(f.coach.fields.find(item => item.key === "business")?.value, idea.description);
      assert.equal(f.coach.stage, "startup");
      assert.equal(f.intake.mode, "exploring");
      assert.equal(f.coach.ready, true);
    });
    check("an unconfirmed legacy proposal is not a selected business", () => {
      const coach = emptyCoach(); coach.fields = [field("business", "미선택 제안", "proposal")];
      const f = fixture("exploring", coach);
      answer(f, "interest", ["software"]);
      assert.equal(f.coach.ready, false, "Answering interests must not confirm a proposal-only business");
      assert.equal(f.coach.stage, "exploring");
      assert.ok(snapshot(f).questions.some(question => question.id === "candidate"));
    });
    check("exploring direct business preserves original intent and bypasses candidate selection", () => {
      const f = fixture("exploring");
      const idea = "어느 업종에도 맞추지 않은 새로운 사업";
      answer(f, "business", idea);
      assert.equal(f.coach.fields.find(item => item.key === "business")?.value, idea);
      assert.equal(f.coach.ideaOrigin?.text, idea);
      assert.ok(!snapshot(f).questions.some(question => question.id === "candidate"));
      assert.equal(snapshot(f).candidateIdeas[0].id, "custom-business");
      assert.equal(snapshot(f).candidateIdeas[0].description, idea);
      rejected(f, { questionId: "candidate", value: "focused-software" }, "question_unknown");
    });
    check("unknown candidate clears the business derived from that selection", () => {
      const f = fixture("exploring");
      answer(f, "candidate", snapshot(f).candidateIdeas[0].id);
      answer(f, "candidate", undefined, true);
      assert.equal(f.intake.answers.candidate.value, null);
      assert.ok(!f.coach.fields.some(item => item.key === "business"), "An unknown candidate must not leave its former business confirmed");
      assert.equal(f.coach.ready, false);
    });
    check("an old candidate selection cannot overwrite a later custom business", () => {
      const f = fixture("exploring");
      const old = snapshot(f).candidateIdeas[0].id;
      answer(f, "candidate", old); answer(f, "business", "내가 직접 바꾼 사업");
      rejected(f, { questionId: "candidate", value: old }, "invalid_option");
      assert.equal(f.coach.business.description, "내가 직접 바꾼 사업");
    });
    check("clearing an old candidate preserves a business entered directly afterward", () => {
      const f = fixture("exploring");
      answer(f, "candidate", snapshot(f).candidateIdeas[0].id);
      answer(f, "business", "나중에 직접 쓴 구상");
      const current = structuredClone(f.coach.fields.find(item => item.key === "business"));
      answer(f, "candidate", undefined, true);
      assert.deepEqual(f.coach.fields.find(item => item.key === "business"), current);
      assert.equal(f.coach.business.description, "나중에 직접 쓴 구상");
      assert.equal(f.coach.ready, true);
    });
    for (const mode of ["startup", "operating"] as const) {
      check(`${mode}: exploring-only candidate/interest commands are rejected`, () => {
        const f = fixture(mode);
        rejected(f, { questionId: "candidate", value: intakeCandidates({})[0].id }, "question_unknown");
        rejected(f, { questionId: "interest", value: ["software"] }, "question_unknown");
      });
    }

    check("candidate confirmation applies only accepted values and source quotes", () => {
      const f = fixture("startup");
      f.intake.candidates = [pending("business", "business", "확인한 사업"), pending("customer", "customer", "고객")];
      confirm(f, { candidateIds: ["business"], rejectIds: ["customer"] });
      assert.equal(f.intake.candidates[0].status, "applied");
      assert.equal(f.intake.candidates[1].status, "rejected");
      assert.equal(f.coach.fields.find(item => item.key === "business")?.quote, "business: 확인한 사업");
      assert.ok(!f.coach.fields.some(item => item.key === "customer"));
      assert.equal(f.intake.answers.business.value, "확인한 사업");
      assert.equal(f.coach.ready, true);
    });
    check("overlapping candidate decisions reject before mutation", () => {
      const f = fixture("startup"); f.intake.candidates = [pending("a", "customer", "고객")];
      rejected(f, { action: "confirm-extraction", candidateIds: ["a"], rejectIds: ["a"] }, "candidate_choice");
    });
    check("unknown or previously handled candidate IDs reject before mutation", () => {
      const f = fixture("startup"); f.intake.candidates = [pending("a", "customer", "고객")];
      rejected(f, { action: "confirm-extraction", candidateIds: ["a", "missing"] }, "candidate_unknown", 409);
      f.intake.candidates[0].status = "rejected";
      rejected(f, { action: "confirm-extraction", candidateIds: ["a"] }, "candidate_unknown", 409);
    });
    check("two accepted candidates for one field reject atomically", () => {
      const f = fixture("startup"); f.intake.candidates = [pending("a", "customer", "고객 A"), pending("b", "customer", "고객 B")];
      rejected(f, { action: "confirm-extraction", candidateIds: ["a", "b"] }, "ambiguous_candidate");
    });
    check("a conflicting candidate cannot overwrite a direct edit without consent", () => {
      const f = fixture("startup"); answer(f, "customer", "직접 수정");
      f.intake.candidates = [pending("stale", "customer", "추출 내용", "옛 값")];
      rejected(f, { action: "confirm-extraction", candidateIds: ["stale"] }, "candidate_conflict", 409);
      confirm(f, { candidateIds: ["stale"], overwriteIds: ["stale"] });
      assert.equal(f.coach.fields.find(item => item.key === "customer")?.value, "추출 내용");
    });
    check("a late batch conflict rolls back earlier candidate applications", () => {
      const f = fixture("startup"); answer(f, "customer", "직접 수정");
      f.intake.candidates = [pending("valid", "offer", "새 상품"), pending("conflict", "customer", "추출 고객", "옛 값"), pending("excluded", "goal", "제외할 목표")];
      rejected(f, { action: "confirm-extraction", candidateIds: ["valid", "conflict"], rejectIds: ["excluded"] }, "candidate_conflict", 409);
    });
    check("matching current candidate values do not need overwrite or change document revision", () => {
      const f = fixture("startup"); answer(f, "business", "사업"); answer(f, "customer", "같은 고객");
      f.intake.candidates = [pending("same", "customer", "같은 고객", "옛 값")];
      f.intake.candidates[0].quote = "같은 고객";
      const revision = coachDocumentRevision(f.coach);
      assert.equal(confirm(f, { candidateIds: ["same"] }), false);
      assert.equal(coachDocumentRevision(f.coach), revision);
      assert.equal(f.intake.candidates[0].status, "applied");
    });

    for (const [name, patch, code] of [
      ["unknown question", { questionId: "missing", value: "x" }, "question_unknown"],
      ["missing value", { questionId: "budget" }, "answer_required"],
      ["null without unknown flag", { questionId: "budget", value: null }, "answer_required"],
      ["empty value", { questionId: "business", value: "   " }, "answer_required"],
      ["oversized text", { questionId: "business", value: "x".repeat(1201) }, "answer_too_long"],
      ["invalid option", { questionId: "industry", value: "not-a-sector" }, "invalid_option"],
      ["negative money", { questionId: "budget", value: -1 }, "invalid_number"],
      ["infinite number", { questionId: "budget", value: Number.POSITIVE_INFINITY }, "invalid_number"],
      ["too many hours", { questionId: "hoursPerWeek", value: 169 }, "invalid_number"],
      ["money with time unit", { questionId: "budget", value: "10시간" }, "invalid_number"],
      ["prose price", { questionId: "price", value: "대표 메뉴 1개 7500원" }, "invalid_number"],
      ["price with a per-unit suffix", { questionId: "price", value: "12000원/회" }, "invalid_number"],
    ] as Array<[string, Partial<IntakeCommand>, string]>) {
      check(`validation ${name}: expected error, no mutation`, () => rejected(fixture("startup"), patch, code));
    }
    check("price accepts range-ladder strings and stores the exact won amount", () => {
      const f = fixture("exploring");
      answer(f, "price", "12,000원");
      assert.equal(f.intake.answers.price.value, 12000);
      assert.equal(f.coach.fields.find(item => item.key === "price")?.value, "12000원");
      assert.equal(f.coach.fields.find(item => item.key === "price")?.quote, "12,000원");
      answer(f, "price", "1.2만원");
      assert.equal(f.coach.fields.find(item => item.key === "price")?.value, "12000원");
      assert.equal(f.coach.messages.at(-1)?.text, "판매 가격: 1.2만원");
    });
    check("sector chip sets follow the confirmed sector, then the business text, then the general set", () => {
      const f = fixture("startup");
      const optionsOf = (id: string) => intakeQuestions(f.intake, f.coach).find(question => question.id === id)!.options ?? [];
      assert.equal(optionsOf("customer").length, 6, "general customer set before any sector is known");
      assert.equal(optionsOf("customer")[0].value, "개인 소비자");
      assert.ok(optionsOf("business").every(option => option.group === "prefill"));
      assert.ok(optionsOf("industry").every(option => option.hint), "industry chips carry example business types");
      assert.deepEqual(optionsOf("industry").map(option => option.value), intakeSectorOptions.map(option => option.value));
      assert.ok(!intakeQuestions(f.intake, f.coach).find(question => question.id === "budget")!.options, "range ladders stay in intake-options, not in question options");
      answer(f, "business", "동네 반찬가게를 준비하고 있어요");
      assert.equal(f.intake.sector, "general", "business text alone never confirms a sector");
      assert.equal(optionsOf("customer")[0].value, "점심·테이크아웃을 찾는 인근 직장인", "rule-based guess picks the food set");
      assert.equal(intakeQuestions(f.intake, f.coach).find(question => question.id === "price")!.period, "대표 메뉴 1개");
      answer(f, "industry", "software");
      assert.equal(optionsOf("customer")[0].value, "개인 사용자", "a confirmed industry wins over the text guess");
      const price = intakeQuestions(f.intake, f.coach).find(question => question.id === "price")!;
      assert.equal(price.period, "월 구독 1건"); assert.match(price.prompt, /^월 구독 1건 가격/); assert.equal(price.kind, "number");
      assert.deepEqual(optionsOf("channel").filter(option => option.group === "sector").map(option => option.value), ["검색·블로그 콘텐츠", "앱스토어·런칭 커뮤니티"]);
      assert.equal(optionsOf("channel").filter(option => option.group === "common").length, 6);
      assert.ok(optionsOf("capacity").some(option => option.group === "people") && optionsOf("capacity").some(option => option.group === "unit"));
      assert.ok(optionsOf("goal").some(option => option.group === "period") && optionsOf("goal").some(option => option.group === "metric"));
      answer(f, "industry", "space_hospitality");
      assert.deepEqual(optionsOf("price").map(option => option.value), ["시간당", "1박", "월 멤버십"], "space pricing basis chips");
      answer(f, "customer", "1인 창업자·소규모 팀(사무 공간), 모임·파티 그룹");
      assert.equal(f.coach.fields.find(item => item.key === "customer")?.value, "1인 창업자·소규모 팀(사무 공간), 모임·파티 그룹", "hybrid answers stay plain strings");
      assert.equal(f.coach.messages.at(-1)?.text, "주요 고객: 1인 창업자·소규모 팀(사무 공간), 모임·파티 그룹");
    });
    check("exploring chip sets switch from the general set to the selected candidate's sector", () => {
      const f = fixture("exploring");
      const optionsOf = (id: string) => intakeQuestions(f.intake, f.coach).find(question => question.id === id)!.options ?? [];
      assert.equal(optionsOf("experience").length, 12);
      assert.equal(optionsOf("problem")[0].value, "필요한데 해주는 곳이 없음");
      answer(f, "interest", ["local_service"]);
      const idea = snapshot(f).candidateIdeas[0];
      assert.equal(idea.sector, "local_service");
      answer(f, "candidate", idea.id);
      assert.equal(optionsOf("problem")[0].value, "맞는 업체를 찾기 어려움");
      assert.equal(intakeQuestions(f.intake, f.coach).find(question => question.id === "price")!.period, "예약 1건");
    });
    check("operating problem chips combine shared operating issues with sector issues", () => {
      const f = fixture("operating"); answer(f, "industry", "food_beverage");
      const options = intakeQuestions(f.intake, f.coach).find(question => question.id === "problem")!.options!;
      assert.equal(options.filter(option => option.group === "common").length, 6);
      assert.deepEqual(options.filter(option => option.group === "sector").map(option => option.value), ["피크 시간 대응이 어렵다", "폐기·수수료 부담이 크다"]);
      assert.ok(intakeQuestions(f.intake, f.coach).find(question => question.id === "business")!.options!.every(option => option.value.includes("○○")), "operating business chips are sentence starters");
    });
    check("multi detail questions take label arrays and reject legacy free text (client seeds the text instead)", () => {
      const f = fixture("startup"); answer(f, "industry", "education"); f.intake.detailsRequested = true;
      const feedback = detailQuestions("education").find(question => question.id === "education.feedback")!;
      assert.equal(feedback.kind, "multi");
      answer(f, "education.feedback", [feedback.options![0].value, feedback.options![2].value]);
      assert.deepEqual(f.intake.answers["education.feedback"].value, [feedback.options![0].value, feedback.options![2].value]);
      assert.equal(snapshot(f).summary.find(item => item.id === "education.feedback")?.value, `${feedback.options![0].label}, ${feedback.options![2].label}`);
      rejected(f, { questionId: "education.feedback", value: "과제를 첨삭해 줍니다" }, "invalid_option");
      answer(f, "education.classSize", "정원 제한 없음(녹화·자율 수강)");
      assert.equal((f.plan.answers["intake/details"]["education.classSize"] as { value: unknown; unit: unknown }).value, "정원 제한 없음(녹화·자율 수강)");
      assert.equal((f.plan.answers["intake/details"]["education.classSize"] as { unit: unknown }).unit, "명");
    });
    check("multi-choice deduplicates valid values and rejects invalid shapes atomically", () => {
      const f = fixture("exploring");
      answer(f, "interest", ["software", "software", "education"]);
      assert.deepEqual(f.intake.answers.interest.value, ["software", "education"]);
      rejected(f, { questionId: "interest", value: "software" }, "invalid_option");
      rejected(f, { questionId: "interest", value: ["software", "missing"] }, "invalid_option");
    });
    check("direct numeric money/time answers keep their canonical units", () => {
      const f = fixture("startup");
      answer(f, "budget", "1.5만원"); answer(f, "hoursPerWeek", "2시간");
      assert.equal(f.intake.answers.budget.value, 15000);
      assert.equal(f.coach.fields.find(item => item.key === "budget")?.value, "15000원");
      assert.equal(f.coach.fields.find(item => item.key === "budget")?.quote, "1.5만원");
      assert.equal(f.coach.fields.find(item => item.key === "hoursPerWeek")?.value, "2시간");
      answer(f, "price", "7500원");
      assert.equal(f.coach.fields.find(item => item.key === "price")?.value, "7500원", "price is a coachAmount string, not prose");
      assert.equal(f.intake.answers.price.value, 7500);
      assert.equal(f.coach.fields.find(item => item.key === "price")?.quote, "7500원");
      assert.ok(!f.coach.fields.some(item => item.key === "unitCost" || item.key === "cost"));
    });
    check("food-service average ticket does not overwrite a directly typed unit price", () => {
      const f = fixture("startup"); answer(f, "industry", "food_beverage"); f.intake.detailsRequested = true;
      answer(f, "price", "7500원");
      answer(f, "food_beverage.averageTicket", "주문당 평균 15000원 (예상)");
      assert.equal(f.coach.fields.find(item => item.key === "price")?.value, "7500원");
      assert.equal((f.plan.answers["intake/details"]["food_beverage.averageTicket"] as { value: unknown }).value, "주문당 평균 15000원 (예상)");
      answer(f, "price", undefined, true);
      assert.ok(!f.coach.fields.some(item => item.key === "price"));
    });
    check("numeric input with an incompatible suffix must not silently change units", () => {
      rejected(fixture("startup"), { questionId: "hoursPerWeek", value: "2명" }, "invalid_number");
    });
    check("day-valued details accept their advertised day unit", () => {
      const f = fixture("startup"); answer(f, "industry", "b2b_service"); f.intake.detailsRequested = true;
      answer(f, "b2b_service.deliveryDays", "3일");
      assert.equal(f.intake.answers["b2b_service.deliveryDays"].value, 3);
    });
    check("arrays cannot masquerade as numeric answers", () => {
      rejected(fixture("startup"), { questionId: "budget", value: ["1000"] }, "invalid_number");
    });
    check("arrays cannot masquerade as free-text business answers", () => {
      rejected(fixture("startup"), { questionId: "business", value: ["사업 A", "사업 B"] }, "invalid_answer");
    });
    check("arrays cannot masquerade as reporting-period text", () => {
      rejected(fixture("operating"), { questionId: "period", value: ["2026-09-01", "2026-09-15"] }, "invalid_answer");
    });
    check("operating sales and monthly fixed cost remain separate from unit price/cost", () => {
      const f = fixture("operating");
      answer(f, "period", "2026-09-01 / 2026-09-15");
      answer(f, "sales", 0); answer(f, "cost", 100000);
      assert.equal(f.coach.fields.find(item => item.key === "sales")?.value, "0원");
      assert.equal(f.coach.fields.find(item => item.key === "cost")?.value, "100000원");
      assert.ok(!f.coach.fields.some(item => item.key === "price" || item.key === "unitCost" || item.key === "volume"));
      answer(f, "sales", undefined, true); answer(f, "cost", undefined, true); answer(f, "period", undefined, true);
      assert.ok(!f.coach.fields.some(item => item.key === "sales" || item.key === "cost"));
      assert.equal(f.plan.answers["intake/period"].value, null);
      assert.equal(f.coach.stage, "operating");
    });
    for (const [input, normalized] of [
      ["2026-09-01 / 2026-09-15", "2026-09-01 / 2026-09-15"],
      ["시작일 2026-09-01 / 종료일 2026-09-15", "2026-09-01 / 2026-09-15"],
      ["2026-09-16 / 2026-09-16", "2026-09-16 / 2026-09-16"],
      ["2024-02-29 / 2024-03-01", "2024-02-29 / 2024-03-01"],
      ["2000-02-29 / 2000-03-01", "2000-02-29 / 2000-03-01"],
      ["2025-12-31 / 2026-01-01", "2025-12-31 / 2026-01-01"],
    ]) {
      check(`period accepts and normalizes ${input}`, () => {
        const f = fixture("operating");
        answer(f, "period", input);
        assert.equal(f.intake.answers.period.value, normalized);
        assert.equal(f.plan.answers["intake/period"].value, normalized);
        assert.equal(snapshot(f).intake.answers.period.value, normalized);
        assert.equal(f.coach.stage, "operating");
      });
    }
    for (const invalid of [
      "2026-09-15 / 2026-09-01", "2026-02-29 / 2026-03-01", "1900-02-29 / 1900-03-01",
      "2026-04-31 / 2026-05-01", "2026-13-01 / 2027-01-01", "2026-09-00 / 2026-09-15",
      "2026-09-01", "2026-9-1 / 2026-9-15", "2026-09-01 / 2026-09-15 / 2026-09-16", "지난달",
    ]) {
      check(`period rejects ${invalid} without losing a valid existing range`, () => {
        const f = fixture("operating"); answer(f, "period", "2026-09-01 / 2026-09-15");
        rejected(f, { questionId: "period", value: invalid }, "invalid_period");
      });
    }
    check("unknown period bypasses date validation and clears an existing range", () => {
      const f = fixture("operating"); answer(f, "period", "2026-09-01 / 2026-09-15");
      answer(f, "period", "not a date", true);
      assert.equal(f.intake.answers.period.status, "unknown");
      assert.equal(f.intake.answers.period.value, null);
      assert.equal(f.plan.answers["intake/period"].value, null);
      assert.equal(snapshot(f).intake.answers.period.value, null);
    });

    check("bookkeeping, notes, messages, jobs and request IDs do not change source fingerprint", () => {
      const f = fixture("startup"); answer(f, "business", "사업"); answer(f, "customer", "고객");
      const before = fingerprint(f), documentRevision = coachDocumentRevision(f.coach), revision = f.coach.revision;
      f.intake.detailsRequested = true;
      f.intake.receipts.push({ id: "receipt", signature: "signature" });
      f.intake.notes.push({ id: "note", text: "unconfirmed", at: LATER, status: "queued" });
      f.intake.candidates.push(pending("pending", "goal", "미확인 목표"));
      f.intake.job = { id: "job", runId: "run", kind: "help", status: "running", noteIds: [], baseValues: {}, baseDocumentRevision: documentRevision, updatedAt: LATER };
      f.coach.messages.push({ id: "chat", role: "assistant", text: "질문 안내", at: LATER });
      f.coach.suggestions = ["다음 질문"]; f.coach.fields.reverse();
      f.coach.fields[0].messageId = "new-source-id";
      f.plan.updatedAt = LATER;
      assert.equal(fingerprint(f), before);
      assert.equal(finishIntakeMutation(f.coach, before, f.plan.answers), false);
      assert.equal(f.coach.revision, revision + 1);
      assert.equal(coachDocumentRevision(f.coach), documentRevision);
    });
    check("same canonical field answer changes only interaction revision", () => {
      const f = fixture("startup"); answer(f, "business", "사업"); answer(f, "budget", "1만원");
      const revision = coachDocumentRevision(f.coach), interaction = f.coach.revision;
      assert.equal(answer(f, "budget", "1만원"), false);
      assert.equal(f.coach.revision, interaction + 1);
      assert.equal(coachDocumentRevision(f.coach), revision);
    });
    check("repeating the same reporting period does not invalidate documents", () => {
      const f = fixture("operating"); answer(f, "period", "2026-09-01 / 2026-09-15");
      const revision = coachDocumentRevision(f.coach);
      assert.equal(answer(f, "period", "2026-09-01 / 2026-09-15"), false, "A new request ID is not a new reporting period");
      assert.equal(coachDocumentRevision(f.coach), revision);
    });
    check("repeating an identical detail answer does not invalidate documents", () => {
      const f = fixture("startup"); answer(f, "industry", "software"); f.intake.detailsRequested = true;
      answer(f, "software.supportMinutes", 5);
      const revision = coachDocumentRevision(f.coach);
      assert.equal(answer(f, "software.supportMinutes", 5), false, "A new request ID is not a source-content change");
      assert.equal(coachDocumentRevision(f.coach), revision);
    });
    check("repeating unknown detail is not a source change", () => {
      const f = fixture("startup"); f.intake.detailsRequested = true;
      answer(f, "general.trialDays", undefined, true);
      assert.equal(answer(f, "general.trialDays", undefined, true), false);
    });
    check("detail map order is immaterial to the business fingerprint", () => {
      const f = fixture("startup"); f.intake.detailsRequested = true;
      const resources = detailQuestions("general").find(question => question.id === "general.resources")!;
      answer(f, "general.resources", [resources.options![0].value]); answer(f, "general.trialDays", 2);
      const before = fingerprint(f);
      f.plan.answers["intake/details"] = Object.fromEntries(Object.entries(f.plan.answers["intake/details"]).reverse());
      assert.equal(fingerprint(f), before);
    });
    check("material source changes increment document revision and mark direct actions for review", () => {
      const f = fixture("startup"); answer(f, "business", "사업");
      const revision = coachDocumentRevision(f.coach);
      f.coach.directAction = { sourceRevision: revision, action: "연락", doneWhen: "답변", usableText: "안내" };
      assert.equal(answer(f, "customer", "새 고객"), true);
      assert.equal(coachDocumentRevision(f.coach), revision + 1);
      assert.equal(f.coach.directAction.needsReview, true);
      const before = fingerprint(f);
      const changedQuote = structuredClone(f);
      changedQuote.coach.fields[0].quote += " (이번 달 기준)";
      assert.notEqual(fingerprint(changedQuote), before, "Source qualifiers are material, unlike request IDs");
      f.coach.fields[0].basis = "proposal";
      assert.notEqual(fingerprint(f), before, "Source basis is material");
    });
    check("period/detail values, units, scope and quotes remain material sources", () => {
      const f = fixture("operating"); f.intake.detailsRequested = true;
      answer(f, "period", "2026-09-01 / 2026-09-15"); answer(f, "general.trialDays", 2);
      const before = fingerprint(f);
      for (const [key, value] of [["value", 3], ["unit", "시간"], ["period", "주"], ["quote", "범위를 바꾼 원문"]] as const) {
        const copy = structuredClone(f);
        (copy.plan.answers["intake/details"]["general.trialDays"] as Record<string, unknown>)[key] = value;
        assert.notEqual(fingerprint(copy), before, `Detail ${key} is a source change`);
      }
      const copy = structuredClone(f); copy.plan.answers["intake/period"].value = "2026-08-01 / 2026-08-31";
      assert.notEqual(fingerprint(copy), before);
    });

    check("legacy import copies only user fields, preserves provenance and suppresses duplicate questions", () => {
      const coach = emptyCoach();
      coach.fields = [field("business", "기존 사업"), field("customer", "기존 고객"), field("budget", "0원"), field("offer", "제안 상품", "proposal")];
      coach.business.industry = SECTOR_PROFILES.education.label;
      coach.business.description = "기존 사업";
      coach.messages.push({ id: "legacy", role: "user", text: "기존 대화", at: AT });
      const before = structuredClone(coach), f = fixture("startup", coach);
      assert.deepEqual(coach, before, "Import itself does not mutate coach state");
      assert.equal(f.intake.legacyImported, true);
      assert.equal(f.intake.sector, "education");
      assert.equal(f.intake.answers.industry.value, "education");
      assert.equal(f.intake.answers.business.value, "기존 사업");
      assert.equal(f.intake.answers.budget.value, "0원");
      assert.equal(f.intake.answers.customer.messageId, "source-customer");
      assert.equal(f.intake.answers.offer, undefined, "Proposals are not imported as confirmed user answers");
      assert.equal(snapshot(f).nextQuestion?.id, "problem");
      assert.equal(readIntake(f.plan.answers), f.intake);
    });
    check("legacy exploring custom business is not replaced by an authored idea", () => {
      const coach = emptyCoach(); coach.fields = [field("business", "내 원래 구상")];
      const f = fixture("exploring", coach);
      assert.ok(!snapshot(f).questions.some(question => question.id === "candidate"));
      answer(f, "customer", "새 고객");
      assert.equal(f.coach.fields.find(item => item.key === "business")?.value, "내 원래 구상");
      assert.equal(f.coach.ready, true);
    });
    for (const requested of ["exploring", "startup", "operating"] as const) {
      check(`legacy operating stays operating when ${requested} is requested`, () => {
        const coach = emptyCoach(); coach.stage = "operating"; coach.business.stage = "운영 중";
        coach.fields = [field("business", "운영 중인 사업")];
        const f = fixture(requested, coach);
        assert.equal(f.intake.mode, "operating");
        answer(f, "business", undefined, true); answer(f, "goal", "개선 목표");
        assert.equal(f.coach.stage, "operating");
        assert.equal(f.coach.ready, false);
        f.intake.candidates = [pending("business", "business", "같은 운영 사업")];
        confirm(f, { candidateIds: ["business"] });
        assert.equal(f.coach.stage, "operating");
        assert.equal(f.coach.ready, true);
      });
    }
    check("legacy revision fallback establishes document revision without an incidental bump", () => {
      const f = fixture("startup"); delete f.coach.documentRevision; f.coach.revision = 7;
      const before = fingerprint(f);
      assert.equal(finishIntakeMutation(f.coach, before, f.plan.answers), false);
      assert.equal(f.coach.revision, 8);
      assert.equal(f.coach.documentRevision, 7);
      answer(f, "business", "새 사업");
      assert.equal(f.coach.documentRevision, 8);
    });
    for (const mode of ["exploring", "startup", "operating"] as const) {
      check(`${mode}: snapshot uses current coach values instead of stale intake values`, () => {
        const f = fixture(mode); answer(f, "customer", "옛 고객");
        const current = f.coach.fields.find(item => item.key === "customer")!;
        current.value = "최신 고객"; current.messageId = "current-source"; current.quote = "최신 고객";
        f.plan.updatedAt = LATER;
        const before = structuredClone(f), state = snapshot(f);
        assert.equal(state.intake.answers.customer.status, "answered");
        assert.equal(state.intake.answers.customer.value, "최신 고객");
        assert.equal(state.intake.answers.customer.messageId, "current-source");
        assert.equal(state.intake.answers.customer.at, LATER);
        assert.equal(state.summary.find(item => item.id === "customer")?.value, "최신 고객");
        assert.deepEqual(f, before, "Snapshot synchronization must not write back into intake");
        state.intake.answers.customer.value = "client-local edit";
        assert.equal(f.intake.answers.customer.value, "옛 고객");
        assert.equal(current.value, "최신 고객");
      });
    }
    check("snapshot user-field projection supersedes a stale unknown answer and preserves zero units", () => {
      const f = fixture("startup"); answer(f, "budget", undefined, true);
      f.coach.fields.push(field("budget", "0원"));
      const before = structuredClone(f), state = snapshot(f);
      assert.equal(state.intake.answers.budget.status, "answered");
      assert.equal(state.intake.answers.budget.value, "0원");
      assert.equal(state.summary.find(item => item.id === "budget")?.value, "0원");
      assert.deepEqual(f, before);
    });
    check("snapshot also refreshes the exploring custom-business alternative", () => {
      const f = fixture("exploring"); answer(f, "business", "처음 직접 쓴 사업");
      const current = f.coach.fields.find(item => item.key === "business")!;
      current.value = "나중에 직접 바꾼 사업"; current.messageId = "edited-business"; current.quote = current.value;
      f.coach.business.description = current.value;
      const before = structuredClone(f), state = snapshot(f);
      assert.equal(state.intake.answers.business.value, current.value);
      assert.equal(state.intake.answers.business.messageId, current.messageId);
      assert.equal(state.candidateIdeas[0].description, current.value);
      assert.deepEqual(f, before);
    });
    check("snapshot candidate ideas use the same current business as projected answers", () => {
      const f = fixture("startup"); answer(f, "business", "처음 사업");
      const current = f.coach.fields.find(item => item.key === "business")!;
      current.value = "수정한 사업"; current.messageId = "edited-business"; current.quote = current.value;
      f.coach.business.description = current.value;
      const before = structuredClone(f), state = snapshot(f);
      assert.equal(state.intake.answers.business.value, "수정한 사업");
      assert.equal(state.candidateIdeas[0].description, state.intake.answers.business.value, "Candidate ideas must not use stale raw intake answers after coach projection");
      assert.deepEqual(f, before);
    });
    check("snapshot is read-only, omits private receipts, and reports pending extraction/documents", () => {
      const f = fixture("startup");
      f.intake.receipts.push({ id: "request", signature: "private" });
      f.intake.notes.push({ id: "note", text: "원문", at: AT, status: "queued" });
      f.plan.sections.summary = { markdown: "본문", html: "<p>본문</p>", generatedAt: AT };
      const before = structuredClone(f), state = snapshot(f);
      assert.deepEqual(f, before);
      assert.equal("receipts" in state.intake, false);
      assert.equal(state.pendingExtraction, true);
      assert.equal(state.hasDocuments, true);
      assert.equal(readIntake({}), null);
      assert.equal(readIntake({ [INTAKE_KEY]: { state: { ...f.intake, version: INTAKE_VERSION + 1 } } }), null);
      assert.equal(displayIntakeValue(null), ""); assert.equal(displayIntakeValue(0), "0");
      assert.equal(displayIntakeValue(["a", "b"]), "a, b");
    });
    check("no network calls, including module imports", () => assert.equal(fetchCalls, 0));

    console.log(JSON.stringify({ suite: "business-intake-core", passed, failed: failures.length, matrixCases: 33, fetchCalls, failures }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
