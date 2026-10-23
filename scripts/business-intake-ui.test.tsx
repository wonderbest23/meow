import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { renderToStaticMarkup } from "react-dom/server";
import type { CoachState } from "../lib/plan-builder/coach";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";
import type { IntakeCandidate, IntakeCommand, IntakeSnapshot } from "../lib/plan-builder/intake-types";
import { createIntake, intakeSnapshot } from "../lib/plan-builder/intake-core";
import { structureQuestions, coreQuestions, detailQuestions, intakeSectorOptions } from "../lib/plan-builder/intake-questions";
import { assembleHybridText, candidateConflict, choiceDraftSubmission, customCandidateDraftKey, optionGroups, selectedCount, stepVisible, withCount, draftKey, emptyAnswer, emptyDraft, entryMessage, hasExclusiveOptions, isHybridQuestion, isPrefillQuestion, needsPolling, parseDraft, periodDates, periodPresetRange, persistDraft, plainText, previewIntakeAnswer, readIntakePayload, readableFinancialSummary, seedAnswerDraft, settleDraft, shouldAcceptSnapshot, shouldShowIdeaExploration, suggestedIntakeIndustry, summaryAnswerText, toggleChip, typedChoiceAnswer, typedEntryCommand, unfinishedAnswerText, unmatchedPieces, jobProgress, intakeNextStep } from "../app/plan/chat/intake-ui/model";
import { amountRanges, rangeMidpoint, CHIP_GROUPS, numberPresets, sectorChipOptions } from "../lib/plan-builder/intake-options";
import type { IntakeQuestion } from "../lib/plan-builder/intake-questions";
import { intakeValueLabel } from "../lib/plan-builder/intake-core";
import { changedResourceLimits, intakeChipSector, needsEntryConfirmation, numberInSentence, periodDisplay, routeComposerInput, unitCostRanges, withRo, zeroPriceAnswer } from "../app/plan/chat/intake-ui/model";
import { budgetSentence, mentionedAnswer, mentionsSolo } from "../app/plan/chat/intake-ui/guidance";
import { readChatResponse } from "../lib/http/read-chat-response";
import { generationEta } from "../lib/plan-builder/generation-progress";
import { coachAmount } from "../lib/plan-builder/coach-feasibility";
import { incompleteChoiceText, nextRefinementQuestion, chatTextPreview, hybridComplete, isExclusiveOption } from "../app/plan/chat/intake-ui/model";

const scope = "test-owner-guest";
const id = "plan_ui-fixture";
const at = "2026-09-16T03:00:00.000Z";
const command = (overrides: Partial<IntakeCommand> = {}): IntakeCommand => ({ action: "answer", planId: id, requestId: "e72bf3c0-70de-49f3-9cb7-c322290f530a", revision: 2, questionId: "business", value: "소규모 매장의 예약 업무를 돕는 소프트웨어", ...overrides });

function fixture(mode: "exploring" | "startup" | "operating" = "startup"): IntakeSnapshot {
  const coach: CoachState = { version: "fixture", revision: 2, documentRevision: 1, stage: mode, depth: "quick", fields: [], messages: [], ready: false, suggestions: [], business: { name: "내 사업 구상", description: "", role: "", industry: "", region: "", stage: "사업 기획" } };
  const plan: ServerPlan = { id, title: "내 사업 구상", planType: "일반 사업계획서", createdAt: at, updatedAt: at, sections: {}, answers: {} };
  return intakeSnapshot(plan, coach, createIntake(coach, mode, at));
}

async function main() {
  const original = fixture();
  for (const text of ["카페가 괜찮을까요?", "안녕하세요", "예전에 카페를 운영했어요", "예산: 100만원 고객: 직장인"]) assert.equal(needsEntryConfirmation(text), true, text);
  assert.equal(needsEntryConfirmation("동네 카페를 운영 중이에요"), false);
  const customer = original.questions.find(q => q.id === "customer")!;
  assert.deepEqual(routeComposerInput(original, customer, "인근 직장인"), { kind: "answer", questionId: "customer", value: "인근 직장인" });
  assert.deepEqual(routeComposerInput(original, customer, "대학생과 직장인 중 누구부터 공략할까요?"), { kind: "note", intent: "question" });
  assert.equal(routeComposerInput(original, customer, "고객: 직장인 가격: 3만원").kind, "clarify");
  assert.equal(routeComposerInput(original, customer, "네").kind, "clarify");
  assert.deepEqual(routeComposerInput(original, customer, "아직 미정"), { kind: "answer", questionId: "customer", value: null, unknown: true });
  // 범위 칩 이름·'정도'를 붙여 적어도 숫자 답으로 받는다 — 예전엔 '이 내용은 어떻게 남길까요?'로 빠졌다(소유자 제보 2026-10-22)
  const fixedCost = { id: "structure.cost", fieldKey: "cost", label: "고정비", prompt: "한 달 고정비는 대략 얼마인가요?", kind: "number", unit: "원", period: "월", optional: true } as IntakeQuestion;
  const firstRange = amountRanges(intakeChipSector(original), "structure.cost", "startup")[0];
  const typedRange = routeComposerInput(original, fixedCost, firstRange.label.replace(/\s+/g, ""));
  assert.equal(typedRange.kind, "answer", firstRange.label);
  assert.equal(routeComposerInput(original, fixedCost, `${firstRange.label} (예상)`).kind, "answer");
  assert.deepEqual(routeComposerInput(original, fixedCost, "30만원 정도"), { kind: "answer", questionId: "structure.cost", value: "30만원" });
  assert.deepEqual(routeComposerInput(original, fixedCost, "약 2만5천원"), { kind: "answer", questionId: "structure.cost", value: "25000원" });
  // 물음표로 끝나면 '어떻게 남길까요' 없이 AI 질문으로(여정 점검 2026-10-23)
  assert.deepEqual(routeComposerInput(original, fixedCost, "임대료가 아직 미정이라 모르겠네요 30만원?"), { kind: "note", intent: "question" });
  // 글과 섞인 숫자 하나는 '○원으로 답하기'로 함께 내민다 — 숫자가 둘 이상이면 고르지 않는다
  assert.deepEqual(routeComposerInput(original, fixedCost, "재료비랑 용기 합쳐서 3500원 정도요"), { kind: "clarify", canAnswer: false, suggested: { value: "3500원", label: "3,500원" } });
  assert.deepEqual(routeComposerInput(original, fixedCost, "월세 80만원에 관리비 10만원이요"), { kind: "clarify", canAnswer: false });
  assert.equal(numberInSentence({ kind: "number", unit: "원" }, "1인분 2개에 9,500원")?.label, "9,500원", "단위 없는 작은 수는 금액으로 보지 않는다");
  assert.equal(numberInSentence({ kind: "number", unit: "원" }, "모아 둔 돈은 2천만원 정도예요")?.value, "2,000만원");
  assert.equal(numberInSentence({ kind: "number", unit: "시간" }, "주말 포함 주 20시간쯤요")?.value, "20시간");
  assert.equal(withRo("3,500원"), "3,500원으로");
  assert.equal(withRo("5개"), "5개로");
  // 건당 비용 칩은 판매 가격보다 큰 범위를 뺀다(9,500원 메뉴에 '300,000원 이상'이 나오지 않게)
  {
    const ladder = amountRanges("food_beverage", "structure.unitCost", "startup");
    const capped = unitCostRanges(ladder, { intake: { ...original.intake, answers: { ...original.intake.answers, price: { status: "answered", value: "9500원", messageId: "m", at: "2026-10-23T00:00:00.000Z" } } } });
    assert.ok(capped.length < ladder.length && capped.every(range => (range.min ?? 0) < 9500), capped.map(range => range.label).join(" · "));
    assert.deepEqual(unitCostRanges(ladder, original), ladder, "가격을 모르면 그대로");
  }
  // 첫 설명에서 말한 예산·혼자 운영은 다시 묻지 않고 미리 보여 준다
  assert.deepEqual(budgetSentence("점심 도시락 가게를 하고 싶어요. 모아 둔 돈은 2천만원 정도예요."), { value: "2천만원", quote: "모아 둔 돈은 2천만원 정도예요." });
  assert.equal(budgetSentence("가격은 9,500원으로 하려고요."), null, "예산이라는 말이 없으면 보지 않는다");
  // 판매 가격 0원은 보내기 전에 한 번 확인한다(무료 상품이면 그대로 저장) — 다른 금액 질문·0이 아닌 금액·미정은 묻지 않는다
  const priceQuestion = coreQuestions("startup").find(question => question.id === "price")!;
  for (const zero of ["0", "0원", " 0 원 ", 0, "0만원"]) assert.equal(zeroPriceAnswer(priceQuestion, zero), true, String(zero));
  for (const priced of ["1000", "3만원", 25000, null, "무료일 수도"]) assert.equal(zeroPriceAnswer(priceQuestion, priced), false, String(priced));
  assert.equal(zeroPriceAnswer(coreQuestions("startup").find(question => question.id === "budget")!, "0"), false, "a zero budget is a real answer, not a price slip");
  assert.equal(zeroPriceAnswer(customer, "0"), false);
  assert.equal(routeComposerInput(original, original.nextQuestion!, "세상에 없는 복합 사업").kind, "clarify");
  assert.deepEqual(routeComposerInput(original, original.nextQuestion!, "카페"), { kind: "answer", questionId: "industry", value: "food_beverage" });
  // 뜻 없는 짧은 말은 답으로 저장하지 않고 '어떻게 남길까요'로 묻는다. 모른다는 말은 '잘 모르겠어요'와 같다.
  for (const text of ["음", "음...", "ㅇㅇ", "ㅋㅋ", "ㅎ", "ㅠㅠ", "흠"]) assert.deepEqual(routeComposerInput(original, customer, text), { kind: "clarify", canAnswer: false }, text);
  for (const text of ["몰라요", "잘 몰라요", "글쎄요", "잘 모르겠어요", "모름"]) assert.deepEqual(routeComposerInput(original, customer, text), { kind: "answer", questionId: "customer", value: null, unknown: true }, text);
  assert.deepEqual(routeComposerInput(original, customer, "학생"), { kind: "answer", questionId: "customer", value: "학생" }, "a short real word is still an answer");
  const weeklyHours = original.questions.find(q => q.id === "hoursPerWeek")!;
  assert.equal(routeComposerInput(original, weeklyHours, "30").kind, "answer", "a two-digit number is still an answer");
  // 2026-10-22 입력 감사: 기간을 붙여 쓴 답('주 20시간', '월 30만', '30만원/월')과 겹친 단위('2만5천원')도 답으로 받는다
  for (const text of ["주 20시간", "주20", "20시간/주", "일주일에 20시간"]) assert.equal(routeComposerInput(original, weeklyHours, text).kind, "answer", text);
  const price = original.questions.find(q => q.id === "price")!;
  const living = original.questions.find(q => q.id === "livingCost")!;
  assert.equal(living.period, "월");
  for (const text of ["월 30만", "30만원/월", "매달 30만원", "30만원"]) assert.deepEqual(routeComposerInput(original, living, text), { kind: "answer", questionId: "livingCost", value: text }, text);
  for (const text of ["2만5천원", "2만 5천원", "3만5천", "4.500"]) assert.equal(routeComposerInput(original, price, text).kind, "answer", text);
  // 읽을 수 없는 숫자는 예시와 함께 다시 적어 달라고 한다(예전엔 서버 400 또는 '어떻게 남길까요')
  assert.deepEqual(routeComposerInput(original, price, "20~30만원"), { kind: "invalid", hint: "범위 대신 숫자 하나만 적어 주세요 (예: 25000, 2만5천원)" });
  assert.deepEqual(routeComposerInput(original, price, "-5000"), { kind: "invalid", hint: "0 이상의 숫자만 적어 주세요 (예: 25000, 2만5천원)" });
  assert.equal(routeComposerInput(original, price, "3만원 정도인데 확실치 않아요").kind, "clarify", "글이 섞이면 기존 확인 흐름");
  assert.equal(routeComposerInput(original, weeklyHours, "-5").kind, "invalid");
  // 서버와 같은 규칙(intake-core validatedAnswer)으로 저장된다
  const answered = (questionId: string, value: string) => { const saved = previewIntakeAnswer(original, command({ questionId, value }))!.intake.answers[questionId]?.value; return typeof saved === "number" ? saved : coachAmount(String(saved)); };
  assert.equal(answered("price", "2만5천원"), 25000);
  assert.equal(answered("price", "1억5천만원"), 150_000_000);
  assert.equal(answered("price", "4.500"), 4500, "점 뒤 세 자리는 천 단위 구분");
  assert.equal(answered("livingCost", "월 30만"), 300000);
  assert.equal(answered("livingCost", "30만원/월"), 300000);
  const hoursSaved = (value: string) => previewIntakeAnswer(original, command({ questionId: "hoursPerWeek", value }))!.intake.answers.hoursPerWeek?.value;
  assert.equal(hoursSaved("주 20시간"), "20시간");
  assert.equal(hoursSaved("주20"), "20시간");
  // 물음표로 끝나는 글은 답으로 저장하자고 먼저 권하지 않는다
  assert.deepEqual(routeComposerInput(original, customer, "이거 꼭 골라야 해요?"), { kind: "note", intent: "question" });
  for (const response of [new Response("", { status: 500 }), new Response("<html>proxy failed</html>", { status: 502 }), new Response("{"), new Response("null")]) {
    await assert.rejects(readChatResponse(response), error => error instanceof Error && /입력은 그대로/.test(error.message) && !/Unexpected|JSON|proxy/.test(error.message));
  }
  assert.deepEqual(await readChatResponse(Response.json({ plan: null, enabled: true })), { plan: null, enabled: true });
  const noteDraft = { ...emptyDraft(), answers: { customer: { ...emptyAnswer(), text: "누구부터 공략할까요?" } } };
  const notePending = { command: command({ action: "note", message: "누구부터 공략할까요?" }), composer: { text: "누구부터 공략할까요?", mode: "answer" as const, questionId: "customer" } };
  assert.equal(settleDraft(noteDraft, notePending).answers.customer, undefined);
  // 예산·시간 고치기: 바뀐 칸만, 빈 칸은 보내지 않는다(빈 칸이 '아직 미정'으로 저장되던 문제)
  assert.deepEqual(changedResourceLimits({ initialCost: "1000만원", weeklyOperatingHours: "" }, { initialCost: "1000만원", weeklyOperatingHours: "", monthlyOperatingCost: "  " }), {}, "nothing changed → nothing to send");
  assert.deepEqual(changedResourceLimits({ initialCost: "1000만원" }, { initialCost: "1500만원", weeklyOperatingHours: "" }), { initialCost: "1500만원" });
  {
    const editing = { ...emptyDraft(), ownerScope: "synthetic-owner", resourceEditor: { limits: { initialCost: "1500만원", weeklyOperatingHours: "" } } };
    const sent: IntakeCommand = { action: "resources", planId: id, revision: 2, requestId: "e72bf3c0-70de-49f3-9cb7-c322290f530b", resourceLimits: { initialCost: "1500만원" } };
    assert.equal(settleDraft(editing, { command: sent }).resourceEditor?.limits, undefined, "a saved partial edit clears the editor draft");
  }
  assert.equal(settleDraft({ ...noteDraft, answers: { customer: { ...emptyAnswer(), text: "저장 중 추가 입력" } } }, notePending).answers.customer.text, "저장 중 추가 입력");
  // Spec §3.3: month presets cover completed months only; "올해" runs to today; dates are Asia/Seoul.
  assert.equal(periodPresetRange("3m", new Date(2026, 8, 16)), "2026-06-01 / 2026-08-31");
  assert.equal(periodPresetRange("last", new Date(2026, 2, 31)), "2026-02-01 / 2026-02-28", "지난달은 전월 1일부터 말일까지");
  assert.equal(periodPresetRange("12m", new Date(2026, 0, 15)), "2025-01-01 / 2025-12-31");
  assert.equal(periodPresetRange("6m", new Date(2026, 8, 16)), "2026-03-01 / 2026-08-31");
  assert.equal(periodPresetRange("year", new Date(2026, 8, 16)), "2026-01-01 / 2026-09-16");
  assert.equal(periodPresetRange("lastYear", new Date(2026, 8, 16)), "2025-01-01 / 2025-12-31");
  assert.equal(periodPresetRange("year", new Date("2026-09-15T16:00:00Z")), "2026-01-01 / 2026-09-16", "16:00Z is already the 16th in Seoul");
  assert.deepEqual(periodDates("2026-01-01 / 2026-06-30"), ["2026-01-01", "2026-06-30"]);
  assert.equal(periodDates("지난달"), null);
  assert.equal(periodDisplay("2026-07-01 / 2026-09-30"), "2026년 7월~9월", "a period reads as months, not raw dates");
  assert.equal(periodDisplay("2025-10-01 / 2026-09-30"), "2025년 10월~2026년 9월");
  assert.equal(periodDisplay("2026-01-01 / 2026-09-16"), "2026년 1월 1일~9월 16일");
  assert.equal(intakeValueLabel(original.nextQuestion!, ["b2b_service", "software"]), "기업 서비스, 소프트웨어 · 플랫폼", "복수 선택은 라벨로 표시");
  assert.equal(intakeValueLabel(original.nextQuestion!, "food_beverage"), "카페 · 음식점");
  assert.equal(intakeValueLabel({ options: undefined }, "자유 답변"), "자유 답변");
  assert.deepEqual(typedEntryCommand(" 2d게임 만들어주는 웹사이트 "), { action: "start", mode: "startup", questionId: "business", value: "2d게임 만들어주는 웹사이트" });
  assert.deepEqual(typedEntryCommand("아이디어가 없어요"), { action: "start", mode: "exploring" });
  assert.deepEqual(typedEntryCommand("사업을 운영 중이에요"), { action: "start", mode: "operating" });
  assert.equal(typedEntryCommand("작은 카페를 운영 중이에요").mode, "operating");
  assert.equal(typedEntryCommand("카페를 운영 중인 건 아니에요").mode, "startup");
  assert.equal(entryMessage({ memo: "이미 보낸 내용", introMessage: "이미 보낸 내용" }), "이미 보낸 내용");
  assert.equal(entryMessage({ memo: "추가 내용", introMessage: "이전 내용" }), "이전 내용\n추가 내용");
  assert.equal(typedChoiceAnswer(original, original.nextQuestion!, "소프트웨어"), "software");
  assert.equal(typedChoiceAnswer(original, original.nextQuestion!, "카페"), "food_beverage");
  assert.equal(typedChoiceAnswer(original, original.nextQuestion!, "무슨 업종인지 잘 모르겠어요"), undefined);
  assert.deepEqual(typedChoiceAnswer(fixture("exploring"), fixture("exploring").nextQuestion!, "소프트웨어, 카페"), ["software", "food_beverage"]);
  const originalJson = JSON.stringify(original);
  const businessSnapshot = (text: string) => previewIntakeAnswer(original, command({ value: text }))!;
  for (const [text, expected] of [
    ["50만원으로 SNS컨설팅", "b2b_service"],
    ["2d게임 만들어주는 웹사이트", "software"],
    ["동네 커피 카페", "food_beverage"],
    ["스마트스토어에서 생활용품 온라인 판매", "retail_commerce"],
    ["맞춤 가구 제조 공장", "manufacturing"],
    ["40만원으로 SNS 강의 수업", "education"],
    ["방문 청소 서비스", "local_service"],
    ["모임 공간 대관", "space_hospitality"],
    ["지역 물류 배송 대행", "logistics"],
    ["브랜드 영상 촬영", "content_media"],
    ["아직 이름 없는 새로운 사업", null],
    ["카페 사장님을 위한 SNS 컨설팅", "b2b_service"],
    ["소프트웨어 개발 강의", "education"],
    ["홈페이지 제작 대행", "b2b_service"],
    ["카페 고객 관리 앱", "software"],
    ["카페와 온라인 쇼핑몰을 함께 운영", null],
    ["소프트웨어가 아닌 카페", null],
    ["카페 그리고 교육", null],
  ] as const) assert.equal(suggestedIntakeIndustry(businessSnapshot(text))?.value ?? null, expected, text);
  const suggestedBusiness = businessSnapshot("50만원으로 SNS컨설팅");
  const beforeSuggestion = JSON.stringify(suggestedBusiness);
  assert.equal(suggestedIntakeIndustry(suggestedBusiness)?.label, "기업 서비스");
  assert.equal(JSON.stringify(suggestedBusiness), beforeSuggestion, "A recommendation does not confirm or save an industry");
  assert.equal(suggestedBusiness.intake.answers.industry, undefined);
  assert.equal(suggestedIntakeIndustry(original), null);
  assert.equal(suggestedIntakeIndustry({ ...original, coach: { ...original.coach, fields: [{ key: "business", value: "커피 카페", basis: "proposal", quote: "", messageId: "proposal-only" }] } }), null, "Unconfirmed AI suggestions are not classification evidence");
  assert.equal(suggestedIntakeIndustry({ ...suggestedBusiness, coach: { ...suggestedBusiness.coach, fields: [...suggestedBusiness.coach.fields, { key: "offer", value: "커피 판매", basis: "user", quote: "커피 판매", messageId: "confirmed-offer" }] } }), null, "Conflicting confirmed business and offer require a manual choice");
  const preview = previewIntakeAnswer(original, command({ questionId: "industry", value: "software" }))!;
  assert.equal(preview.nextQuestion?.id, "business");
  assert.equal(preview.coreAnswered, 1);
  assert.equal(preview.coach.revision, 3);
  assert.equal(JSON.stringify(original), originalJson, "Local preview must not mutate the server snapshot");
  assert.equal(previewIntakeAnswer(original, command({ revision: 1 })), null, "Do not preview an uncertain request against a different revision");
  const skipped = previewIntakeAnswer(original, command({ questionId: "industry", value: null, unknown: true }))!;
  assert.equal(skipped.nextQuestion?.id, "business");
  assert.equal(skipped.intake.answers.industry.status, "unknown");
  assert.throws(() => previewIntakeAnswer(original, command({ questionId: "industry", value: "invented" })));
  assert.throws(() => previewIntakeAnswer(fixture("operating"), command({ questionId: "period", value: "2026-12-31 / 2026-01-01" })));
  assert.throws(() => previewIntakeAnswer(original, command({ questionId: "hoursPerWeek", value: 169 })));
  const zero = previewIntakeAnswer(original, command({ questionId: "budget", value: "0" }))!;
  assert.equal(zero.intake.answers.budget.status, "answered", "Zero is a real answer, not unknown");
  assert.equal(zero.coach.fields.find(field => field.key === "budget")?.value, "0원");

  const timings: number[] = [];
  for (let index = 0; index < 100; index++) {
    const start = performance.now();
    previewIntakeAnswer(original, command({ questionId: "industry", value: "software" }));
    timings.push(performance.now() - start);
  }
  const p95 = timings.sort((a, b) => a - b)[94];
  assert.ok(p95 < 300, `Next-question local preview p95 ${p95.toFixed(1)}ms exceeds 300ms`);

  const answer = { text: "원래 입력", selected: [], custom: false };
  const pending = { command: command(), answer };
  const draft = { ...emptyDraft(), ownerScope: scope, answers: { business: answer }, pending };
  const encoded = JSON.stringify(draft);
  assert.equal(parseDraft(encoded, id, scope).pending?.command.requestId, pending.command.requestId);
  assert.equal(parseDraft(encoded, id, "different-account").pending, null);
  assert.equal(parseDraft(encoded, "different-plan", scope).pending, null);
  assert.equal(parseDraft(encoded, id).pending, null, "Never restore unscoped pending requests");
  assert.equal(parseDraft("bad json", id, scope).pending, null);
  assert.notEqual(draftKey(id, scope), draftKey(id, "another-owner"));
  assert.notEqual(draftKey(id, scope), draftKey("another-plan", scope));
  const memory = new Map();
  assert.equal(persistDraft(draftKey(id, scope), draft, memory, () => { throw new Error("Storage blocked"); }), false);
  assert.equal(memory.get(draftKey(id, scope))?.answers.business.text, "원래 입력", "A blocked storage getter must retain the in-memory draft");
  assert.equal(persistDraft(draftKey(id, scope), draft, memory, () => ({ setItem: () => { throw new Error("Quota exceeded"); } })), false);
  assert.equal(memory.get(draftKey(id, scope))?.pending.command.requestId, pending.command.requestId);
  assert.equal(persistDraft(draftKey(id, scope), draft, memory, () => ({ setItem: () => {} })), true);
  const settled = settleDraft(draft, pending);
  assert.equal(settled.answers.business, undefined);
  assert.equal(settled.pending, null);
  const typedDuringSave = settleDraft({ ...draft, answers: { business: { ...answer, text: "전송 후 바꾼 내용" }, customer: { ...answer, text: "다음 질문 입력" } } }, pending);
  assert.equal(typedDuringSave.answers.business.text, "전송 후 바꾼 내용");
  assert.equal(typedDuringSave.answers.customer.text, "다음 질문 입력");
  assert.equal(typedDuringSave.editingId, "business");
  const nextQuestionDraft = settleDraft({ ...draft, answers: { business: answer, customer: { ...answer, text: "입력 중인 다음 답변" } } }, pending);
  assert.equal(nextQuestionDraft.answers.customer.text, "입력 중인 다음 답변");
  assert.equal(settleDraft({ ...draft, editingId: "business" }, pending).editingId, null, "A saved existing answer releases its editing question");
  assert.equal(settleDraft({ ...draft, editingId: "customer" }, pending).editingId, "customer", "Do not override a user-selected editor while saving another question");
  const custom = { text: "후보 대신 직접 구상", selected: [], custom: true };
  assert.equal(settleDraft({ ...draft, answers: { candidate: custom } }, { command: command(), answer: custom }).answers.candidate, undefined);
  assert.equal(customCandidateDraftKey("business", true), "candidate");
  assert.equal(customCandidateDraftKey("customer", true), "customer", "Only the candidate toggle remaps its draft key; hybrid drafts never move to candidate");
  assert.equal(customCandidateDraftKey("business", false), "business");
  const hybridPending = { command: command({ questionId: "customer", value: "주거 상권 가족·주부" }), answer: { text: "주거 상권 가족·주부", selected: ["가족"], custom: true } };
  assert.equal(settleDraft({ ...draft, answers: { customer: hybridPending.answer } }, hybridPending).answers.customer, undefined, "A stray custom flag on a hybrid answer must not leave the draft behind under candidate");
  assert.equal(settleDraft({ ...draft, memo: "새 메모" }, { command: command({ action: "message" }), text: "이전 메모" }).memo, "새 메모");
  const intro = { ...emptyDraft(), ownerScope: scope, introMessage: "커피 가게를 시작하고 싶어요" };
  assert.equal(parseDraft(JSON.stringify(intro), null, scope).introMessage, intro.introMessage);
  assert.equal(settleDraft(intro, { command: command({ action: "start" }) }).introMessage, intro.introMessage, "Selecting a stage must not discard the first typed message");
  assert.equal(settleDraft(intro, { command: command({ action: "message" }), text: intro.introMessage }).introMessage, null);
  assert.equal(settleDraft(intro, { command: command({ action: "message" }), text: "다른 메시지" }).introMessage, intro.introMessage);
  const typedPending = { command: command({ action: "start" }), text: intro.introMessage, intro: intro.introMessage };
  const typedSettled = settleDraft({ ...intro, memo: intro.introMessage! }, typedPending);
  assert.equal(typedSettled.memo, ""); assert.equal(typedSettled.introMessage, null);
  assert.equal(settleDraft({ ...intro, memo: "저장 중에 추가 입력" }, typedPending).memo, "저장 중에 추가 입력");
  assert.equal(settleDraft({ ...emptyDraft(), memo: "소프트웨어" }, { command: command({ questionId: "industry", value: "software" }), text: "소프트웨어" }).memo, "");

  const running = { id: "job", runId: "run", kind: "extract" as const, status: "running" as const, noteIds: [], baseValues: {}, baseDocumentRevision: 1, updatedAt: at };
  const active = { ...original, intake: { ...original.intake, job: running } };
  assert.equal(needsPolling(active), true);
  const completed = { ...active, intake: { ...active.intake, job: { ...running, status: "complete" as const } } };
  assert.equal(needsPolling(completed), false);
  assert.equal(needsPolling({ ...completed, intake: { ...completed.intake, notes: [{ id: "queued", text: "메모", at, status: "queued" }] } }), false, "Deferred notes do not start polling or paid extraction on their own");
  assert.equal(needsPolling({ ...completed, intake: { ...completed.intake, notes: [{ id: "failed", text: "메모", at, status: "failed" }] } }), false);
  assert.equal(needsPolling({ ...completed, pendingExtraction: true }), false, "Pending review is not an active job");

  const candidate: IntakeCandidate = { id: "candidate1", fieldKey: "business", value: "추출한 새 값", quote: "메모의 원문", noteId: "note1", baseValue: "이전 값", status: "pending" };
  const withBusiness = { ...original, coach: { ...original.coach, fields: [{ key: "business" as const, value: "직접 수정한 값", basis: "user" as const, messageId: "answer1", quote: "직접 수정한 값" }] } };
  assert.deepEqual(candidateConflict(withBusiness, candidate), { current: "직접 수정한 값", changed: true, requiresOverwrite: true });
  assert.equal(candidateConflict(withBusiness, { ...candidate, value: "직접 수정한 값" }).requiresOverwrite, false);
  assert.equal(candidateConflict(original, candidate).requiresOverwrite, true, "Deletion during extraction also requires consent");
  assert.equal(shouldAcceptSnapshot(original, { ...original, coach: { ...original.coach, revision: 1 } }), false);
  assert.equal(shouldAcceptSnapshot(original, { ...original, updatedAt: "2026-09-15T00:00:00.000Z" }), false);
  assert.equal(shouldAcceptSnapshot(original, { ...original, planId: "other" }), false);
  assert.equal(shouldAcceptSnapshot(original, { ...original, coach: { ...original.coach, revision: 3 } }), true);
  assert.equal(readIntakePayload({ flowVersion: 2, enabled: true, ownerScope: scope, code: "owner_changed" })?.code, "owner_changed");
  assert.equal(readIntakePayload({ flowVersion: 2, enabled: true, login: true })?.plan, null);
  assert.equal(readIntakePayload({ plan: original }), null);
  assert.equal(plainText("[처음 구상] 예약 관리"), "[처음 구상] 예약 관리");
  assert.equal(plainText('{"numbers":[1,2]}'), "");
  assert.ok(!readableFinancialSummary({ ...original, financialSummary: '{"internal":true}' }).includes("internal"));
  const money = { ...original, financialSummary: "", coach: { ...original.coach, fields: [{ key: "budget" as const, value: "100만원", basis: "user" as const, messageId: "budget", quote: "100만원" }] } };
  assert.match(readableFinancialSummary(money), /준비 예산: 1,000,000원/, "Stored amounts are thousands-formatted for display only");
  assert.match(readableFinancialSummary(money), /0원으로 계산하지/);

  // ---- Select-first controls (spec §2, §6 Phase 2) ----
  const startupQuestions = coreQuestions("startup");
  const exploringFixture = fixture("exploring");
  const candidateChoice = coreQuestions("exploring").find(question => question.id === "candidate")!;
  const customerBase = startupQuestions.find(question => question.id === "customer")!;
  const customerChips: IntakeQuestion = { ...customerBase, hint: "최대 2개까지 고를 수 있어요", options: [
    { value: "개인", label: "개인 소비자", group: "filter:고객 유형" }, { value: "사업자", label: "사업자", group: "filter:고객 유형" },
    { value: "점심 직장인", label: "점심·테이크아웃을 찾는 인근 직장인", group: "고객" }, { value: "가족", label: "주거 상권 가족·주부", group: "고객" }, { value: "학생", label: "대학가·학원가 학생", group: "고객" },
  ] };
  assert.equal(isHybridQuestion(customerChips), true);
  assert.equal(isHybridQuestion(customerBase), false, "text without options stays a plain composer question");
  assert.equal(isHybridQuestion({ id: "business", kind: "text", options: [{ value: "카페", label: "○○ 카페를 운영합니다" }] }), false, "business is the typing exception");
  assert.equal(isPrefillQuestion({ id: "business", kind: "text", options: [{ value: "카페", label: "○○ 카페를 운영합니다" }] }), true);
  let picks = toggleChip(customerChips, [], "개인");
  assert.deepEqual(picks, ["개인"]);
  assert.deepEqual(toggleChip(customerChips, picks, "사업자"), ["사업자"], "filter steps hold one pick");
  picks = toggleChip(customerChips, picks, "가족"); picks = toggleChip(customerChips, picks, "학생");
  assert.deepEqual(picks, ["개인", "가족", "학생"]);
  assert.deepEqual(toggleChip(customerChips, picks, "점심 직장인"), picks, "customer keeps at most 2 picks in a step");
  assert.equal(assembleHybridText(customerChips, picks), "주거 상권 가족·주부, 대학가·학원가 학생", "filter picks are never written into the answer");
  // Coach chat sends on its own only once nothing is left to pick.
  assert.equal(hybridComplete(customerChips, ["개인", "가족"]), false, "one of two customers is not finished yet");
  assert.equal(hybridComplete(customerChips, picks), true, "two customers fill the step");
  assert.equal(hybridComplete(customerChips, []), false);
  // One tap on an amount range saves its middle (owner decision 2026-10-07).
  assert.equal(rangeMidpoint({ min: 5000, max: 10000 }), 7500);
  assert.equal(rangeMidpoint({ min: 1_500_000, max: 4_000_000 }), 2_750_000);
  assert.equal(rangeMidpoint({ min: 0, max: 1000 }), 500, "an 'under' range halves its ceiling");
  assert.equal(rangeMidpoint({ min: 300_000, max: null }), 300_000, "an open-ended range keeps its floor");
  assert.equal(assembleHybridText(customerChips, ["개인", "가족"], ["마포구 아파트 단지"]), "주거 상권 가족·주부 / 마포구 아파트 단지");
  assert.deepEqual(unmatchedPieces(customerChips, "주거 상권 가족·주부 / 마포구 아파트 단지"), ["마포구 아파트 단지"]);
  for (const text of ["○○ 카페를 운영합니다", "커피·음료 —", "베이커리 / ", "고객, ", "납품:", ""]) assert.equal(unfinishedAnswerText(text), true, text);
  for (const text of ["베이커리·디저트 / 주문: 카운터, 배달앱", "동네 카페를 운영합니다"]) assert.equal(unfinishedAnswerText(text), false, text);
  const feedbackMulti: IntakeQuestion = { id: "education.feedback", label: "평가·피드백 방식", prompt: "피드백?", kind: "multi", options: ["과제 첨삭", "테스트·퀴즈", "별도 피드백 없음"].map(label => ({ value: label, label })) };
  assert.equal(hasExclusiveOptions(feedbackMulti), true);
  assert.equal(hasExclusiveOptions(exploringFixture.nextQuestion!), false);
  assert.deepEqual(toggleChip(feedbackMulti, ["과제 첨삭", "테스트·퀴즈"], "별도 피드백 없음"), ["별도 피드백 없음"], "an exclusive chip clears its step");
  assert.deepEqual(toggleChip(feedbackMulti, ["별도 피드백 없음"], "과제 첨삭"), ["과제 첨삭"], "any other pick clears the exclusive chip");
  // Only short "none" answers are exclusive; problem statements that end in 없음 combine like any other chip.
  for (const label of ["규정 없음", "별도 피드백 없음", "특수 조건 없음", "필요 없음(확인 완료)", "숙박 아님(신고 불필요)", "아직 모름·해당 없음", "사용처: 해당 없음", "없음"]) assert.equal(isExclusiveOption(label), true, label);
  for (const label of ["당일·시간 지정 배송이 없음", "필요한데 해주는 곳이 없음", "전문 인력을 채용할 여유가 없음", "직접 만들 시간·기술이 없음", "디지털 상품(배송 없음)", "매장·작업장으로 고객이 방문(출장 없음)", "제외: 보증·AS 없음", "납품 후 일정 기간 이상 없음"]) assert.equal(isExclusiveOption(label), false, label);
  const problemChips: IntakeQuestion = { id: "problem", label: "해결할 문제", prompt: "어떤 불편?", kind: "text", options: ["당일·시간 지정 배송이 없음", "요금이 불투명함", "파손·분실 책임이 불명확함"].map(label => ({ value: label, label })) };
  assert.deepEqual(toggleChip(problemChips, ["당일·시간 지정 배송이 없음"], "요금이 불투명함"), ["당일·시간 지정 배송이 없음", "요금이 불투명함"], "a problem ending in 없음 combines with another problem");
  assert.equal(hybridComplete(problemChips, ["당일·시간 지정 배송이 없음"]), false, "coach chat waits for the second problem instead of sending at once");
  // Lib conventions (intake-options.ts CHIP_GROUPS): channel "common"+"sector" is one 8-chip step, capacity people → period → unit + count, goal period → metric → amount / count.
  const channelChips: IntakeQuestion = { ...startupQuestions.find(question => question.id === "channel")!, options: sectorChipOptions("food_beverage", "channel", "startup") };
  assert.equal(optionGroups(channelChips.options).length, 1, "common and sector chips render as a single step");
  let channelPicks: string[] = [];
  for (const label of ["매장 방문", "인스타그램·SNS", "배달앱(배민·쿠팡이츠)", "지인·입소문"]) channelPicks = toggleChip(channelChips, channelPicks, label);
  assert.deepEqual(channelPicks, ["매장 방문", "인스타그램·SNS", "배달앱(배민·쿠팡이츠)"], "channel keeps 3 picks across common and sector chips");
  assert.equal(assembleHybridText(channelChips, channelPicks), "매장 방문, 인스타그램·SNS, 배달앱(배민·쿠팡이츠)");
  assert.equal(toggleChip({ id: "experience", kind: "text", options: sectorChipOptions(null, "experience") }, ["문서·사무·기획"], "요리·카페·베이킹").length, 2, "experience is multi-pick");
  const capacityChips: IntakeQuestion = { ...startupQuestions.find(question => question.id === "capacity")!, options: sectorChipOptions("food_beverage", "capacity", "startup") };
  const capacityGroups = optionGroups(capacityChips.options);
  assert.equal(capacityGroups.length, 3);
  assert.equal(stepVisible(capacityChips, capacityGroups, 1, []), false);
  assert.equal(stepVisible(capacityChips, capacityGroups, 1, ["대표자 혼자"]), true);
  const capacityPicks = withCount(["대표자 혼자", "하루", "건"], 20);
  assert.deepEqual(capacityPicks, ["대표자 혼자", "하루", "건", "#20"]);
  assert.equal(selectedCount(capacityPicks), 20);
  assert.equal(assembleHybridText(capacityChips, capacityPicks), "대표자 혼자 / 하루 20건");
  assert.equal(assembleHybridText(capacityChips, ["대표자 혼자", "하루", "건"]), "대표자 혼자 / 하루", "no count → no dangling unit");
  const capacitySeed = seedAnswerDraft(capacityChips, "대표자 혼자 / 하루 20건");
  assert.deepEqual(capacitySeed.selected.sort(), ["#20", "대표자 혼자", "건", "하루"].sort(), "the composed volume piece restores period, unit and count");
  assert.deepEqual(unmatchedPieces(capacityChips, "대표자 혼자 / 하루 20건"), [], "a composed piece is not a free supplement");
  const goalChips: IntakeQuestion = { ...startupQuestions.find(question => question.id === "goal")!, options: sectorChipOptions("food_beverage", "goal", "startup") };
  const goalGroups = optionGroups(goalChips.options);
  assert.equal(stepVisible(goalChips, goalGroups, 2, ["6개월 안에", "첫 유료 고객·첫 판매"]), false, "amount step only for N원 metrics");
  assert.equal(stepVisible(goalChips, goalGroups, 2, ["6개월 안에", "월 매출 N원"]), true);
  assert.equal(assembleHybridText(goalChips, ["6개월 안에"]), "", "a period alone is not a goal");
  assert.equal(hybridComplete(capacityChips, ["대표자 혼자", "하루", "건"]), false, "capacity waits for its count");
  assert.equal(hybridComplete(capacityChips, capacityPicks), true, "people, period, unit and count finish capacity");
  assert.equal(hybridComplete(goalChips, ["6개월 안에"]), false, "a period alone does not send the goal");
  assert.equal(hybridComplete(goalChips, ["6개월 안에", "첫 유료 고객·첫 판매"]), true, "a plain metric finishes the goal");
  assert.equal(hybridComplete(goalChips, ["6개월 안에", "월 매출 N원"]), false, "an N원 metric waits for its amount");
  assert.equal(assembleHybridText(goalChips, ["6개월 안에", "월 매출 N원"]), "6개월 안에 월 매출 N원");
  assert.equal(unfinishedAnswerText("6개월 안에 월 매출 N원"), true, "an unfilled N원 placeholder blocks the save");
  assert.equal(assembleHybridText(goalChips, ["6개월 안에", "월 매출 N원", "1,000만원"]), "6개월 안에 월 매출 1,000만원");
  assert.equal(assembleHybridText(goalChips, withCount(["기간 미정", "월 주문·계약 N건"], 30)), "월 주문·계약 30건", "기간 미정 saves the metric alone");
  const goalSeed = seedAnswerDraft(goalChips, "6개월 안에 월 매출 1,000만원");
  assert.deepEqual(goalSeed.selected, ["6개월 안에", "월 매출 N원", "1,000만원"]);
  assert.deepEqual(seedAnswerDraft(goalChips, "월 주문·계약 30건").selected, ["월 주문·계약 N건", "#30"]);
  assert.equal(CHIP_GROUPS.priceBasis, "basis");
  const hybridSeed = seedAnswerDraft(customerChips, "주거 상권 가족·주부 / 마포구 아파트 단지");
  assert.deepEqual([hybridSeed.selected, hybridSeed.text], [["가족"], "주거 상권 가족·주부 / 마포구 아파트 단지"], "exact label pieces restore chips; the sentence stays in the composer");
  const legacyMulti = seedAnswerDraft(feedbackMulti, "과제 첨삭과 상담으로 확인");
  assert.deepEqual([legacyMulti.selected, legacyMulti.text], [[], "과제 첨삭과 상담으로 확인"], "a legacy prose answer on a multi question lights no chip");
  assert.deepEqual(seedAnswerDraft(feedbackMulti, ["과제 첨삭", "예전 값"]).selected, ["과제 첨삭"]);
  assert.deepEqual(seedAnswerDraft(feedbackMulti, ["과제 첨삭", "예전 값"]).text, "예전 값");
  const budgetQuestion = startupQuestions.find(question => question.id === "budget")!;
  const hoursQuestion = startupQuestions.find(question => question.id === "hoursPerWeek")!;
  assert.equal(seedAnswerDraft(budgetQuestion, "12,000원").text, "12000");
  assert.equal(seedAnswerDraft(budgetQuestion, "300만원").text, "3000000");
  const proseAmount = seedAnswerDraft({ ...budgetQuestion, id: "price" }, "대표 메뉴 1개 7500");
  assert.deepEqual([proseAmount.text, proseAmount.hint], ["", "대표 메뉴 1개 7500"], "unparsable legacy amounts seed empty with the original as a hint");
  assert.equal(seedAnswerDraft(hoursQuestion, "10시간").text, "10");
  assert.equal(seedAnswerDraft(hoursQuestion, 10).text, "10");
  assert.equal(seedAnswerDraft(hoursQuestion, null).text, "");
  const periodQuestion = coreQuestions("operating").find(question => question.id === "period")!;
  assert.equal(seedAnswerDraft(periodQuestion, "2026-01-01 / 2026-06-30").text, "2026-01-01 / 2026-06-30");
  assert.deepEqual(seedAnswerDraft(candidateChoice, exploringFixture.candidateIdeas[0].id, exploringFixture.candidateIdeas).selected, [exploringFixture.candidateIdeas[0].id]);
  assert.equal(summaryAnswerText(hoursQuestion, "10시간"), "10시간 / 주");
  assert.equal(summaryAnswerText(budgetQuestion, "3000000원"), "3,000,000원");
  assert.equal(summaryAnswerText(detailQuestions("food_beverage").find(question => question.id === "food_beverage.peakOrders")!, 30), "30건 / 시간");
  assert.equal(summaryAnswerText(candidateChoice, exploringFixture.candidateIdeas[0].id, exploringFixture.candidateIdeas), exploringFixture.candidateIdeas[0].title);
  assert.equal(summaryAnswerText(exploringFixture.nextQuestion!, ["software"]), "소프트웨어 · 플랫폼");

  const require = createRequire(import.meta.url);
  const css = readFileSync(new URL("../app/plan/chat/intake.module.css", import.meta.url), "utf8");
  const cssClasses = Object.fromEntries([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map(match => [match[1], match[1]]));
  require.extensions[".css"] = module => { module.exports = cssClasses; };
  const { EntryChoices, QuestionForm, BusinessSummary, ConversationHistory, ConversationText, DesignDirection, DesignProgress, DesignResult, DocumentLockedTurn, ExtractionReview, SavedNotes, AnswerHistory, ReplyTyping, JobProgress, NextStepAction, RewriteCost } = await import("../app/plan/chat/intake-ui/IntakePanels");
  const noop = () => {};
  const entry = renderToStaticMarkup(<EntryChoices disabled={false} onStart={noop} />);
  assert.equal((entry.match(/<button/g) ?? []).length, 3);
  for (const label of ["아이디어를 찾고 있어요", "생각한 사업이 있어요", "사업을 운영 중이에요"]) assert.ok(entry.includes(label));
  assert.ok(entry.includes("data-coach-welcome"), "The original chat welcome is reused");
  const firstMessage = renderToStaticMarkup(<EntryChoices initialMessage="먼저 적은 사업 이야기" disabled={false} onStart={noop} />);
  assert.ok(firstMessage.indexOf("먼저 적은 사업 이야기") < firstMessage.indexOf("대화 시작 선택지"), "Typed introduction precedes the stage choices inside the conversation");
  const form = (snapshot: IntakeSnapshot, question = snapshot.nextQuestion!, value = emptyAnswer(), disabled = false) => renderToStaticMarkup(<QuestionForm question={question} snapshot={snapshot} draft={value} editing={false} disabled={disabled} onChange={noop} onAnswer={noop} onCancel={noop} />);
  const sectorMarkup = form(original);
  for (const sector of intakeSectorOptions) assert.ok(sectorMarkup.includes(sector.label), sector.label);
  assert.ok(sectorMarkup.includes(original.nextQuestion!.prompt));
  assert.equal((sectorMarkup.match(/type="radio"/g) ?? []).length, intakeSectorOptions.length);
  const exploring = fixture("exploring");
  assert.equal((form(exploring).match(/type="checkbox"/g) ?? []).length, intakeSectorOptions.length);
  const candidateQuestion = coreQuestions("exploring").find(question => question.id === "candidate")!;
  const candidateMarkup = form(exploring, candidateQuestion);
  for (const idea of exploring.candidateIdeas) { assert.ok(candidateMarkup.includes(idea.title)); assert.ok(candidateMarkup.includes(idea.description)); }
  assert.ok(form(exploring, candidateQuestion, { ...emptyAnswer(), custom: true }).includes("<textarea"));
  const numericMarkup = form(original, coreQuestions("startup").find(question => question.id === "budget")!, { ...emptyAnswer(), text: "0" });
  assert.ok(numericMarkup.includes('inputMode="decimal"'));
  assert.ok(numericMarkup.includes("단위: 원"));
  const activeQuestion = coreQuestions("startup").find(question => question.id === "business")!;
  assert.ok(!form(active, activeQuestion, answer).includes("disabled="), "An active extraction job does not disable answer submission");
  const savingMarkup = form(active, activeQuestion, answer, true);
  assert.ok(savingMarkup.includes("disabled="));
  assert.ok(!savingMarkup.match(/<textarea[^>]*disabled/), "Network save can block commits, never typing");
  assert.ok(form(original, detailQuestions("software")[1]).includes("출시·제공 중"));
  const chatQuestion = renderToStaticMarkup(<QuestionForm inChat question={activeQuestion} snapshot={original} draft={emptyAnswer()} editing={false} disabled={false} onChange={noop} onAnswer={noop} onCancel={noop} />);
  assert.ok(chatQuestion.includes("data-chat-question"));
  assert.ok(!chatQuestion.includes("<textarea"), "The live question uses the persistent bottom composer rather than an inline survey field");
  assert.ok(!chatQuestion.includes("답변 저장"), "Submission lives in the bottom composer");
  assert.equal((chatQuestion.match(/<button/g) ?? []).length, 1, "The text question has one clear alternate action: unknown");
  assert.ok(chatQuestion.includes('class="unknownChoice"') && chatQuestion.includes('aria-pressed="false"'), "unknown uses the same staged choice control for every question");
  assert.ok(!chatQuestion.includes("이전 답변 수정"));
  const chat = (question: IntakeQuestion, value = emptyAnswer(), snapshot = original) => renderToStaticMarkup(<QuestionForm inChat question={question} snapshot={snapshot} draft={value} editing={false} disabled={false} onChange={noop} onAnswer={noop} onCancel={noop} />);
  const mentionedSnapshot = { ...original, coach: { ...original.coach, fields: original.coach.fields.filter(field => field.key !== "customer") }, intake: { ...original.intake, notes: [{ id: "mentioned-customer", text: "고객: 직장인", at, status: "stored" as const, intent: "memo" as const }] } };
  const customerQuestion = original.questions.find(question => question.id === "customer")!;
  const mentioned = chat(customerQuestion, emptyAnswer(), mentionedSnapshot);
  for (const text of ["앞서 말한 내용으로 이어갈까요?", "고객: 직장인", "이 내용 선택", "다르게 답하기"]) assert.ok(mentioned.includes(text), text);
  assert.ok(mentioned.includes("<div hidden=\"\""), "other choices do not compete with the quoted suggestion");
  const acceptedMention = chat(customerQuestion, { ...emptyAnswer(), text: "직장인" }, mentionedSnapshot);
  assert.ok(!acceptedMention.includes("이전 대화에서 찾은 답변"), "a staged answer returns to the single composer flow");
  const undecidedHelpMarkup = chat(customerQuestion, { ...emptyAnswer(), unknown: true });
  assert.ok(undecidedHelpMarkup.includes("<details") && undecidedHelpMarkup.includes("예시를 보고 정할래요"), "unknown offers optional examples without requiring AI");
  assert.ok(!chat(customerQuestion).includes("예시를 보고 정할래요"), "help stays out of the way until undecided is selected");
  const buttonMarkup = (markup: string, label: string) => markup.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}`))?.[0] ?? "";
  const prefillOptions = ["○○ 카페를 운영합니다", "○○ 지역에서 ○○ 방문 서비스를 합니다", "○○를 온라인 판매(스마트스토어)합니다"];
  const prefillMarkup = chat({ ...activeQuestion, options: prefillOptions.map(label => ({ value: label, label })) });
  assert.equal((prefillMarkup.match(/<button/g) ?? []).length, 1 + prefillOptions.length, "business shows unknown + prefill chips; the composer stays the commit path");
  assert.ok(!prefillMarkup.includes("이대로 저장") && !prefillMarkup.includes("답변 저장"), "Prefill chips never save by themselves");
  for (const label of prefillOptions) assert.ok(prefillMarkup.includes(label));
  const hybridEmpty = chat(customerChips);
  assert.ok(!hybridEmpty.includes("이대로 저장") && !hybridEmpty.includes("직접 입력"), "hybrid answers use only the composer, not duplicate send or focus buttons");
  assert.ok(hybridEmpty.includes("최대 2개까지 고를 수 있어요"), "question.hint renders under the prompt");
  assert.ok(hybridEmpty.includes("개인 소비자") && !hybridEmpty.includes("주거 상권 가족·주부"), "Later steps stay hidden until the first step has a pick");
  assert.ok(!hybridEmpty.includes("<textarea"));
  assert.ok(incompleteChoiceText(customerChips, emptyAnswer()));
  const hybridFilterOnly = chat(customerChips, { ...emptyAnswer(), selected: ["개인"] });
  assert.ok(hybridFilterOnly.includes("주거 상권 가족·주부"), "A filter pick reveals the next step");
  assert.ok(incompleteChoiceText(customerChips, { ...emptyAnswer(), text: "개인", selected: ["개인"] }), "A filter-only pick cannot be saved from the composer either");
  assert.ok(hybridFilterOnly.includes("최대 2개 · 0/2"));
  const hybridReady = chat(customerChips, { text: "주거 상권 가족·주부", selected: ["개인", "가족"], custom: false });
  assert.equal(incompleteChoiceText(customerChips, { text: "주거 상권 가족·주부", selected: ["개인", "가족"], custom: false }), false);
  assert.match(buttonMarkup(hybridReady, "주거 상권 가족·주부"), /aria-pressed="true"/);
  assert.ok(incompleteChoiceText(customerChips, { text: "주거 상권 가족·주부 / ", selected: ["개인", "가족"], custom: false }), "A dangling separator blocks the save");
  assert.equal((hybridReady.match(/<button/g) ?? []).length, 2 + 3 + 1, "filter 2 + step 3 + skip; only the composer sends answers");
  const capacityChat = chat(capacityChips, { text: "대표자 혼자 / 하루", selected: ["대표자 혼자", "하루", "건"], custom: false });
  assert.ok(capacityChat.includes('aria-label="건 수량"') && capacityChat.includes("약 ") === false, "unit pick reveals the count step");
  for (const preset of numberPresets({ id: "capacity", unit: "건" })) assert.ok(capacityChat.includes(`${preset}건`), `capacity preset ${preset}`);
  assert.equal(incompleteChoiceText(capacityChips, { text: "대표자 혼자 / 하루", selected: ["대표자 혼자", "하루", "건"], custom: false }), false, "people alone is a saveable capacity answer");
  const spacePrice: IntakeQuestion = { ...startupQuestions.find(question => question.id === "price")!, kind: "number", unit: "원", period: "이용 1건", options: sectorChipOptions("space_hospitality", "price", "startup") };
  const spaceSnapshot = { ...original, intake: { ...original.intake, sector: "space_hospitality" as const } };
  const basisChat = chat(spacePrice, emptyAnswer(), spaceSnapshot);
  assert.ok(basisChat.includes("시간당") && basisChat.includes("1박") && !basisChat.includes('data-stage="ranges"'), "space price asks for a basis before its ladder");
  const basisPicked = chat(spacePrice, { ...emptyAnswer(), selected: ["1박"] }, spaceSnapshot);
  for (const range of amountRanges("space_hospitality", "price", "startup", "1박")) assert.ok(basisPicked.includes(range.label), range.label);
  const operatingProblem: IntakeQuestion = { ...coreQuestions("operating").find(question => question.id === "problem")!, options: sectorChipOptions("food_beverage", "problem", "operating") };
  const problemChat = chat(operatingProblem, emptyAnswer(), fixture("operating"));
  assert.equal((problemChat.match(/aria-pressed=/g) ?? []).length, 9, "operating problem shows common 6 + sector 2 plus the staged unknown choice");
  const interestChat = chat(exploring.nextQuestion!, emptyAnswer(), exploring);
  assert.ok(!interestChat.includes("선택 완료") && interestChat.includes("아직 정하지 않았어요"), "choices and undecided stay in the same question until the composer sends them");
  assert.equal((interestChat.match(/type="checkbox"/g) ?? []).length, intakeSectorOptions.length);
  assert.deepEqual(choiceDraftSubmission(exploring.nextQuestion!, { ...emptyAnswer(), selected: ["software", "education"] }), { value: ["software", "education"] });
  assert.deepEqual(choiceDraftSubmission(exploring.nextQuestion!, { ...emptyAnswer(), unknown: true }), { value: null, unknown: true });
  assert.deepEqual(choiceDraftSubmission(original.nextQuestion!, { ...emptyAnswer(), selected: ["food_beverage"], ksic: "56111" }), { value: "food_beverage", ksic: "56111" });
  assert.equal(choiceDraftSubmission(exploring.nextQuestion!, emptyAnswer()), null);
  assert.equal(shouldShowIdeaExploration(exploring, exploring.nextQuestion!), false);
  assert.equal(shouldShowIdeaExploration(exploring, exploring.questions.find(question => question.id === "candidate")!), true);
  assert.equal(shouldShowIdeaExploration(original, original.nextQuestion!), false);
  const industryHints = chat({ ...original.nextQuestion!, options: original.nextQuestion!.options!.map(option => ({ ...option, hint: `${option.label} 예시` })) });
  assert.ok(industryHints.includes('class="optionHint"') && !industryHints.includes("optionDescription"), "Chip helper text uses its own small class so the grid keeps two columns");
  const hoursChat = chat(hoursQuestion, { ...emptyAnswer(), text: "10" });
  assert.ok(hoursChat.includes('aria-label="값 조정"') && !hoursChat.includes("이 값으로 저장"), "number_quick stages values; only the composer saves in chat");
  assert.ok(hoursChat.includes('aria-label="5시간 늘리기"'), "time-like units step by 5");
  for (const preset of numberPresets(hoursQuestion)) assert.ok(hoursChat.includes(`${preset.toLocaleString("ko-KR")}시간`), `preset ${preset}`);
  assert.ok(!hoursChat.includes("<textarea"));
  const budgetChat = chat(budgetQuestion);
  const budgetRanges = amountRanges(original.intake.sector, "budget", "startup");
  if (budgetRanges.length) { for (const range of budgetRanges) assert.ok(budgetChat.includes(range.label), range.label); assert.ok(budgetChat.includes('data-stage="ranges"')); }
  else assert.ok(budgetChat.includes("만원") && budgetChat.includes("금액 선택") && budgetChat.includes('data-stage="exact"'), "Without a ladder the 만원 keypad opens directly");
  assert.ok(!budgetChat.includes('inputMode="decimal" autoComplete="off" maxLength="80"'), "The chat number question uses the ladder or stepper, not the survey field");
  const hinted = chat(budgetQuestion, { ...emptyAnswer(), hint: "대표 메뉴 1개 7500" });
  assert.ok(hinted.includes("이전 답변: 대표 메뉴 1개 7500"));
  const periodChat = chat(periodQuestion, { ...emptyAnswer(), text: "2026-01-01 / 2026-06-30" }, fixture("operating"));
  for (const label of ["지난달", "최근 3개월", "최근 6개월", "최근 12개월", "올해", "작년", "직접 선택"]) assert.ok(periodChat.includes(label), label);
  assert.ok(periodChat.includes('value="2026-01-01"') && periodChat.includes('value="2026-06-30"'), "Editing a period seeds both date inputs");
  assert.equal((periodChat.match(/<button/g) ?? []).length, 6 + 1 + 1 + 1, "6 presets + 직접 선택 + 미정 + 기간 선택");
  assert.ok(periodChat.includes("기간 선택") && !periodChat.includes("이 기간으로 저장"));
  for (const q of [customer, hoursQuestion, budgetQuestion, periodQuestion, original.nextQuestion!]) {
    assert.deepEqual(choiceDraftSubmission(q, { ...emptyAnswer(), unknown: true }), { value: null, unknown: true }, `${q.id}: unknown is staged, including numbers and dates`);
    assert.equal((chat(q).match(/아직 정하지 않았어요/g) ?? []).length, 1);
    assert.ok(!chat(q).includes("지금은 모르겠어요 · 다음 질문"));
  }
  const recommendedQuestion = renderToStaticMarkup(<QuestionForm inChat question={original.nextQuestion!} snapshot={suggestedBusiness} draft={emptyAnswer()} editing={false} disabled={false} onChange={noop} onAnswer={noop} onCancel={noop} />);
  // 세부 업종 후보가 있으면 한 목록으로 — 큰 분류 카드('이 업종 선택')는 숨기고 첫 후보에 '추천'(여정 점검 2026-10-23: 두 추천이 서로 달랐다)
  for (const text of ["이 업종으로 정리할까요", "추천</em>", "직접 선택하기"]) assert.ok(recommendedQuestion.includes(text), text);
  for (const text of ["입력하신 사업 내용을 보면", "이 업종 선택"]) assert.ok(!recommendedQuestion.includes(text), text);
  const cardOnly = renderToStaticMarkup(<QuestionForm inChat question={original.nextQuestion!} snapshot={{ ...suggestedBusiness, ksicCandidates: [] }} draft={emptyAnswer()} editing={false} disabled={false} onChange={noop} onAnswer={noop} onCancel={noop} />);
  for (const text of ["입력하신 사업 내용을 보면", "이 업종 선택", "직접 선택하기"]) assert.ok(cardOnly.includes(text), `후보가 없으면 큰 분류 카드: ${text}`);
  assert.ok(!recommendedQuestion.includes('type="radio"'), "The long industry list is collapsed until explicitly opened");
  const industryEdit = renderToStaticMarkup(<QuestionForm inChat question={original.nextQuestion!} snapshot={suggestedBusiness} draft={{ ...emptyAnswer(), selected: ["education"] }} editing disabled={false} onChange={noop} onAnswer={noop} onCancel={noop} />);
  assert.ok(industryEdit.includes('type="radio"'));
  assert.ok(!industryEdit.includes("이 업종으로 계속"), "Existing industry edits are not replaced by the automatic recommendation");
  assert.ok(suggestedBusiness.ksicCandidates.length > 0, "KSIC candidates are derived from the confirmed business text without AI");
  assert.ok(recommendedQuestion.includes("표준산업분류 후보") && recommendedQuestion.includes(suggestedBusiness.ksicCandidates[0].name), "The industry step offers KSIC candidates as chips");
  assert.ok(!industryEdit.includes("표준산업분류 후보"), "Editing an existing industry shows the full list instead of candidates");
  // 첫 설명에서 말한 준비 예산 · 혼자 운영은 다시 묻지 않는다 — 예산은 '앞서 말한 내용'으로 한 번에, 운영 범위는 '대표자 혼자'를 미리 골라 둔다(여정 점검 2026-10-23)
  {
    const said = businessSnapshot("회사 많은 동네에서 점심 도시락을 배달하는 1인 도시락 가게를 하고 싶어요. 모아 둔 돈은 2천만원 정도예요.");
    const budgetQ = coreQuestions("startup").find(item => item.id === "budget")!;
    assert.equal(mentionedAnswer(said, budgetQ)?.value, "2천만원");
    assert.ok(mentionsSolo(said));
    assert.ok(!mentionsSolo(businessSnapshot("1인 가구에 반찬 정기배송")), "'1인 가구'는 고객 이야기");
    assert.ok(sectorChipOptions("food_beverage", "capacity", "startup").some(option => option.group === CHIP_GROUPS.people && option.label === "대표자 혼자"), "미리 고를 '대표자 혼자' 칩이 있다");
  }
  assert.equal(original.ksicCandidates.length, 0, "No business text yet → no candidates");
  assert.ok(recommendedQuestion.includes("업종 이름으로 찾기"), "The industry step offers a name search field without leaving the chat");
  assert.ok(original.structure && original.structure.basis.revenue === "sector" && original.structure.values.sector === "general", "Without KSIC the structure falls back to the sector default");
  const typing = renderToStaticMarkup(<ReplyTyping />);
  // 낭독 안내는 BusinessIntake의 늘 붙어 있는 알림 칸이 맡는다(내용과 같이 생기는 칸은 읽히지 않을 때가 있다)
  assert.ok(!typing.includes('role="status"'), "the typing bubble no longer mounts its own live region");
  assert.equal((typing.match(/<i>/g) ?? []).length, 3);
  const chatHistory = renderToStaticMarkup(<ConversationHistory snapshot={preview} onEdit={noop} />);
  const sending = renderToStaticMarkup(<ConversationHistory snapshot={preview} onEdit={noop} receipt="보내는 중" />);
  assert.equal((sending.match(/data-receipt/g) ?? []).length, 1, "only the newest answer carries a receipt");
  assert.ok(sending.includes("보내는 중") && !chatHistory.includes("data-receipt"), "the receipt follows the caller's real send state");
  assert.equal((chatHistory.match(/data-coach-message="user"/g) ?? []).length, 2);
  assert.ok(chatHistory.includes(original.nextQuestion!.prompt));
  assert.ok(chatHistory.includes("업종 답변 수정"));
  const withContext = previewIntakeAnswer(original, command({ questionId: "industry", value: "software", message: "온라인으로만 제공하고 싶어요" }))!;
  const contextHistory = renderToStaticMarkup(<ConversationHistory snapshot={withContext} onEdit={noop} />);
  assert.ok(contextHistory.includes("업종 답변 수정") && contextHistory.includes("소프트웨어 · 플랫폼"), "a supplemental note must not swallow the selected answer or its edit action");
  assert.ok(contextHistory.includes("온라인으로만 제공하고 싶어요"), "the raw supplemental note stays in the conversation");
  // 대화로 고치기의 [바꾸기]가 적용한 답은 손님 말풍선이 아니라 '바꾼 내용' 한 줄 · 예전 답의 '계획서 다시 작성하기'는 지금 단추 이름으로
  {
    const at = "2026-10-23T00:00:00.000Z";
    const applied = { ...preview, coach: { ...preview.coach, messages: [...preview.coach.messages, { id: "edit-1:0", role: "user" as const, text: "주 고객을 1인 가구로", at }, { id: "edit-1:reply", role: "assistant" as const, text: "바꿨어요. 아래 \"계획서 다시 작성하기\"를 누르면 바뀐 내용으로 다시 써요.", at }] } };
    const appliedHistory = renderToStaticMarkup(<ConversationHistory snapshot={applied} onEdit={noop} />);
    assert.ok(appliedHistory.includes("data-change-note") && appliedHistory.includes("바꾼 내용 · 주 고객을 1인 가구로"));
    assert.equal((appliedHistory.match(/data-coach-message="user"/g) ?? []).length, 2, "적용한 답은 손님 말풍선으로 쌓지 않는다");
    assert.ok(appliedHistory.includes("계획서에 반영하기") && !appliedHistory.includes("계획서 다시 작성하기"));
    // 다 만든 뒤 고치는 길의 이름은 '대화로 고치기' · '직접 고치기' 둘뿐
    const lockedStudio = renderToStaticMarkup(<DocumentLockedTurn planId="p1" chatEdit onChatEdit={noop} />);
    assert.ok(lockedStudio.includes("대화로 고치기</button>") && lockedStudio.includes("직접 고치기</a>") && lockedStudio.includes("아래 입력창"));
    const lockedOld = renderToStaticMarkup(<DocumentLockedTurn planId="p1" chatEdit />);
    assert.ok(lockedOld.includes("edit=chat") && lockedOld.includes("대화로 고치기</a>"));
    for (const markup of [lockedStudio, lockedOld]) assert.ok(!/채팅으로 수정하기|문장에서 바로 고치기/.test(markup));
  }
  const undecided = previewIntakeAnswer(original, command({ questionId: "industry", value: null, unknown: true }))!;
  assert.ok(renderToStaticMarkup(<ConversationHistory snapshot={undecided} onEdit={noop} />).includes("아직 정하지 않았어요"));
  // 업종을 바꾸면(업종 확인 [바꾸기]) 마지막 업종 답만 보이고, 그 아래에 '업종을 바꿨어요'가 붙는다 — 예전엔 두 업종이 같은 질문과 함께 두 번 쌓였다
  const changedIndustry = previewIntakeAnswer(preview, command({ questionId: "industry", value: "education", requestId: "4c3a1f0e-6b2d-4e8a-9f1c-2d7b5a9e0c11", revision: preview.coach.revision }))!;
  const changedHistory = renderToStaticMarkup(<ConversationHistory snapshot={changedIndustry} onEdit={noop} />);
  assert.ok(changedHistory.includes("교육 · 코칭") && !changedHistory.includes("소프트웨어 · 플랫폼"), "the replaced industry answer is not shown next to the new one");
  assert.equal(changedHistory.split(original.nextQuestion!.prompt).length - 1, 1, "the industry question is asked once in the history");
  assert.ok(changedHistory.includes("업종을 바꿨어요") && !chatHistory.includes("업종을 바꿨어요"), "only a changed industry carries the note");
  assert.equal((changedHistory.match(/data-coach-message="user"/g) ?? []).length, 2);
  // 탐색 중 '직접 적을래요'로 쓴 사업 소개: 손님이 쓴 적 없는 '사업 소개: ' 머리말 없이 보인다
  const exploringBase = fixture("exploring");
  const typedIdea = { ...exploringBase, coach: { ...exploringBase.coach, messages: [{ id: "typed-idea", role: "user" as const, text: "사업 소개: 어르신 댁 정리 서비스", at }] }, intake: { ...exploringBase.intake, answers: { ...exploringBase.intake.answers, business: { status: "answered" as const, value: "어르신 댁 정리 서비스", messageId: "typed-idea", at } } } };
  const typedHistory = renderToStaticMarkup(<ConversationHistory snapshot={typedIdea} onEdit={noop} />);
  assert.ok(typedHistory.includes(">어르신 댁 정리 서비스<") && !typedHistory.includes("사업 소개: "), "the stored label prefix is not shown in the bubble");
  const review = renderToStaticMarkup(<ExtractionReview snapshot={{ ...withBusiness, intake: { ...withBusiness.intake, candidates: [candidate] } }} disabled={false} onCommand={noop} />);
  for (const text of ["현재 값", "직접 수정한 값", "추출한 새 값", "현재 값을 이 내용으로 바꾸기", "반영하지 않기", "이 내용 반영"]) assert.ok(review.includes(text));
  assert.match(review, /<button[^>]*disabled=""[^>]*>[\s\S]*이 내용 반영<\/button>/, "overwriting still requires explicit consent");
  const queue = [candidate, { ...candidate, id: "candidate2", value: "두 번째 확인할 값" }];
  const reviewMarkup = (candidates: IntakeCandidate[]) => renderToStaticMarkup(<ExtractionReview snapshot={{ ...withBusiness, intake: { ...withBusiness.intake, candidates } }} disabled={false} onCommand={noop} />);
  assert.ok(reviewMarkup(queue).includes("확인할 내용 2개") && !reviewMarkup(queue).includes("두 번째 확인할 값"), "only one extraction decision is visible at once");
  assert.ok(reviewMarkup([{ ...candidate, status: "rejected" }, queue[1]]).includes("두 번째 확인할 값"), "the next pending candidate appears after a server-confirmed rejection");
  const longReply = "먼저 고객을 정해볼까요?\n" + "원문 근거와 미확인 가정. ".repeat(40);
  assert.equal(chatTextPreview("짧은 답변"), null);
  assert.equal(chatTextPreview(longReply), "먼저 고객을 정해볼까요?…");
  const compactReply = renderToStaticMarkup(<ConversationText text={longReply} />);
  assert.ok(compactReply.includes("전체 내용 보기") && compactReply.includes('aria-expanded="false"') && !compactReply.includes("원문 근거와 미확인 가정"));
  let guided = fixture();
  for (const q of [...guided.questions]) guided = previewIntakeAnswer(guided, { ...command({ questionId: q.id, value: null, unknown: true }), revision: guided.coach.revision })!;
  assert.equal(nextRefinementQuestion(guided)?.id, "business", "skipping the business offers the exact question needed to continue");
  guided = previewIntakeAnswer(guided, { ...command(), revision: guided.coach.revision })!;
  assert.equal(nextRefinementQuestion(guided)?.id, "customer");
  const beforeGuided = structuredClone(guided);
  assert.equal(intakeNextStep(guided), "design", "optional unknowns must not block the business plan");
  for (const id of ["customer", "problem", "offer", "channel", "price", "structure.unitCost", "structure.cost"]) guided = previewIntakeAnswer(guided, { ...command({ questionId: id, value: id === "price" || id.startsWith("structure.") ? "0원" : "확인한 답변" }), revision: guided.coach.revision })!;
  assert.equal(nextRefinementQuestion(guided)?.id, "budget");
  guided = previewIntakeAnswer(guided, { ...command({ questionId: "budget", value: "0원" }), revision: guided.coach.revision })!;
  assert.equal(nextRefinementQuestion(guided)?.id, "livingCost", "explicit zero is resolved, not missing");
  guided = previewIntakeAnswer(guided, { ...command({ questionId: "livingCost", value: "0원" }), revision: guided.coach.revision })!;
  assert.equal(nextRefinementQuestion(guided)?.id, "hoursPerWeek", "living cost 0원(고정비에 넣음) is an answer, not missing");
  assert.equal(nextRefinementQuestion(beforeGuided)?.id, "customer", "suggesting a next question does not mutate answers");
  assert.equal(nextRefinementQuestion(beforeGuided, ["customer"])?.id, "problem", "a deferred optional question does not immediately repeat");
  const refiningDraft = { ...emptyDraft(), ownerScope: scope, editingId: "customer", refiningId: "customer", refinementSeen: [], answers: { customer: { ...emptyAnswer(), unknown: true } } };
  const refinementPending = { command: command({ questionId: "customer", value: null, unknown: true }), answer: refiningDraft.answers.customer };
  const refined = settleDraft(refiningDraft, refinementPending);
  assert.deepEqual(refined.refinementSeen, ["customer"]);
  assert.equal(refined.refiningId, null);
  assert.deepEqual(settleDraft(refined, refinementPending).refinementSeen, ["customer"], "replayed acknowledgements do not duplicate progress");
  assert.equal(nextRefinementQuestion(beforeGuided, parseDraft(JSON.stringify(refined), id, scope).refinementSeen)?.id, "problem", "refresh retains the optional question cursor");
  assert.deepEqual(parseDraft(JSON.stringify({ ...refiningDraft, pending: refinementPending }), id, scope).refinementSeen, [], "an unacknowledged request does not advance the cursor");
  assert.equal(nextRefinementQuestion(fixture()), null, "unfinished core questions retain the current conversation flow");
  const summarized = previewIntakeAnswer(original, command())!;
  summarized.coreComplete = true; summarized.hasDocuments = true;
  summarized.coach.design = { status: "proposal", sourceRevision: 1, approach: "new-concept", startingPlan: { scope: "AI가 제안한 시작 범위", connectionToVision: "구상과의 관계", whyThis: "제안 이유", notIncluded: [] }, alternatives: [], assumptions: [], nextAction: { action: "다음 행동", doneWhen: "완료 기준", usableText: "사용할 문구" } };
  const summary = renderToStaticMarkup(<BusinessSummary onStructure={noop} snapshot={summarized} disabled aiBusy prepared={false} onEdit={noop} onDetails={noop} onDesign={noop} onPrepare={noop} />);
  // '좀 더 개선하기'는 2026-10-03에 뺐다(만든 뒤에 고친다)
  assert.ok(!summary.includes("좀 더 개선하기"), "no refine-more button in the summary");
  for (const text of ["사업 요약", "소규모 매장의 예약 업무를 돕는 소프트웨어", "AI가 제안한 시작 범위", "data-state=\"current\"><span>1</span>사업 방향 요약"]) assert.ok(summary.includes(text), `summary is missing: ${text}`);
  assert.equal((summary.match(/(?:사업 방향 정리하기|사업계획서 문서 작성하기)<\/button>/g) ?? []).length, 1, "the summary offers one creation step");
  assert.ok(summary.includes(`/plan/document?planId=${id}`), "Existing artifacts stay navigable even during AI jobs");
  // 다음 단계는 한 번에 하나, 한 곳에만: 사업안 만들기 → (사업안이 현재 입력 기준이면) 계획서 만들기 → 계획서 열기.
  const nextSnapshot = (patch: Partial<IntakeSnapshot>, coachPatch: Partial<CoachState>): IntakeSnapshot => ({ ...summarized, hasDocuments: false, missingSections: 0, ...patch, coach: { ...summarized.coach, ready: true, ...coachPatch } });
  const nextMarkup = (patch: Partial<IntakeSnapshot>, coachPatch: Partial<CoachState>, showActions = true) => renderToStaticMarkup(<BusinessSummary onStructure={noop} showActions={showActions} snapshot={nextSnapshot(patch, coachPatch)} disabled={false} aiBusy={false} prepared={false} onEdit={noop} onDetails={noop} onDesign={noop} onPrepare={noop} />);
  const currentDesign = { documentRevision: 5, design: { ...summarized.coach.design!, sourceRevision: 5 } };
  assert.equal(intakeNextStep(nextSnapshot({}, { design: undefined })), "design");
  assert.equal(intakeNextStep(nextSnapshot({}, { documentRevision: 6, design: { ...summarized.coach.design!, sourceRevision: 5 } })), "design", "an edited answer sends the user back to the design step");
  assert.equal(intakeNextStep(nextSnapshot({}, currentDesign)), "prepare");
  assert.equal(intakeNextStep(nextSnapshot({ hasDocuments: true }, currentDesign)), "open");
  // 쓰지 않은 항목이 남으면(예전 무료 체험으로 앞 2개만 있음, 작성 중 실패) 이어서 작성하기로 돌아온다 — 작성 중이면 진행 중으로 본다
  assert.equal(intakeNextStep(nextSnapshot({ hasDocuments: true, missingSections: 8 }, currentDesign)), "prepare");
  assert.equal(intakeNextStep(nextSnapshot({ hasDocuments: true, missingSections: 8 }, currentDesign), true), "open");
  assert.equal(intakeNextStep(nextSnapshot({}, currentDesign), true), "open");
  assert.equal(intakeNextStep(nextSnapshot({ coreComplete: false }, { design: undefined })), null);
  const STEP1 = 'data-state="current"><span>1</span>사업 방향 요약';
  const needsDesign = nextMarkup({}, { design: undefined });
  assert.equal(needsDesign.split(STEP1).length - 1, 1, "exactly one next step is marked");
  assert.ok(needsDesign.includes("사업 방향 정리하기</button>") && !needsDesign.includes("문서 작성하기</button>"), "only the design button shows before a design exists");
  assert.ok(needsDesign.indexOf("기본 질문 입력 완료") < needsDesign.indexOf(STEP1) && needsDesign.indexOf(STEP1) < needsDesign.indexOf("처음 적은 설명"), "the next step sits at the top of the summary");
  const needsPlan = nextMarkup({}, currentDesign);
  assert.ok(needsPlan.includes("사업계획서 문서 작성하기</button>") && needsPlan.includes("지금까지 만든 건 사업 방향 요약이에요") && !needsPlan.includes("사업 방향 정리하기</button>"), "with a current design only the plan document button shows");
  const opened = nextMarkup({ hasDocuments: true }, currentDesign);
  assert.ok(opened.includes("사업계획서 문서 열기</a>") && !opened.includes("작성하기</button>") && !opened.includes("정리하기</button>"), "after the documents exist the step is opening them");
  const resumeMissing = nextMarkup({ hasDocuments: true, missingSections: 8 }, currentDesign);
  assert.ok(resumeMissing.includes("남은 8개 항목 이어서 작성하기</button>") && !resumeMissing.includes("계획서에 반영하기") && !resumeMissing.includes("다시 생성 횟수"), "unwritten sections resume without a rewrite confirm");
  assert.ok(needsPlan.includes("결제한 뒤에 작성을 시작해요") && !needsPlan.includes("무료로 만들어요"), "the first document step says it starts after payment (no free trial)");
  const staleDocument = nextMarkup({ hasDocuments: true, documentStatus: "stale" }, currentDesign);
  assert.ok(staleDocument.includes("계획서에 반영하기</button>") && !staleDocument.includes("이전 계획서 보기") && !staleDocument.includes("진행 단계") && !staleDocument.includes("다시 생성 횟수"), "a stale document shows one rewrite button; the cost note waits for the confirm popup");
  // 반영하기 전에 비용을 먼저 보여 준다(다시 쓸 항목 수 · 대화는 무료)
  // 횟수 안내는 버튼을 누른 뒤 확인창(RewriteCost)에서 보여 준다
  const staleCost = renderToStaticMarkup(<RewriteCost snapshot={nextSnapshot({ hasDocuments: true, documentStatus: "stale", rewriteCount: 4, freeReflects: 0 }, currentDesign)} />);
  assert.ok(staleCost.includes("<b>4개 항목</b>을 다시 써요") && staleCost.includes("항목마다 다시 생성 횟수 1회가 차감돼요"), "the rewrite count is shown in the confirm popup");
  const freeCost = renderToStaticMarkup(<RewriteCost snapshot={nextSnapshot({ hasDocuments: true, documentStatus: "stale", rewriteCount: 4, freeReflects: 2 }, currentDesign)} />);
  assert.ok(freeCost.includes("<b>4개 항목</b>을 다시 써요") && freeCost.includes("<b>무료</b>예요 (무료 2번 남음)") && !freeCost.includes("차감"), "a free reflect says so instead of a deduction");
  assert.ok(renderToStaticMarkup(<RewriteCost snapshot={nextSnapshot({ hasDocuments: true, documentStatus: "stale", freeReflects: 0 }, currentDesign)} />).includes("바뀐 내용과 맞지 않는 항목만 다시 써요"), "unknown count still explains the cost");
  assert.ok(opened.includes("대화로 내용을 더 다듬는 건 무료예요"), "a finished document tells that further chat is free");
  assert.ok(!needsPlan.includes("다시 생성 횟수"), "the first document shows no rewrite cost");
  const hiddenActions = nextMarkup({}, { design: undefined }, false);
  assert.ok(!hiddenActions.includes(STEP1) && !hiddenActions.includes("좀 더 개선하기"), "when the chat shows the next step the summary shows no buttons");
  const notYet = nextMarkup({ coreComplete: false }, { design: undefined });
  assert.ok(!notYet.includes("data-active") && notYet.includes("기본 질문을 마치면 사업 방향"), "nothing is marked before the core questions are done");
  const chatStep = renderToStaticMarkup(<NextStepAction snapshot={nextSnapshot({}, { design: undefined })} prepared={false} disabled={false} aiBusy={false} onDesign={noop} onPrepare={noop} secondary={<button type="button">좀 더 개선하기</button>} />);
  assert.match(chatStep, /class="nextStepRow">[\s\S]*사업 방향 정리하기<\/button><button type="button">좀 더 개선하기<\/button><\/div>/, "the details button shares one row with the next step");
  const direction = renderToStaticMarkup(<DesignDirection snapshot={nextSnapshot({}, currentDesign)} />);
  assert.ok(direction.indexOf("다음 행동") < direction.indexOf("<details"), "the optional next action is visible before detailed evidence");
  for (const text of ["사업 방향 요약", "선택 사항", "완료 기준", "사용할 문구", "AI가 만든 초안이에요"]) assert.ok(direction.includes(text), `direction is missing: ${text}`);
  // AI 표시는 제목 괄호 꼬리표가 아니라 맨 아래 한 줄(대표 요청 2026-10-15)
  assert.ok(!direction.includes("검증 전"), "the AI notice is not a heading tag");
  assert.equal(renderToStaticMarkup(<DesignDirection snapshot={nextSnapshot({}, { ...currentDesign, documentRevision: 6 })} />), "", "stale directions are not shown as current actions");
  // 코치 채팅 1단계 결과: 이름 추천·직접 수정하기·요약만, AI 아이콘·이름별 이유·상표 안내·펼치기 없음(소유자 피드백 2026-10-09)
  const identityDesign = { ...currentDesign, design: { ...currentDesign.design, identity: { headline: "맞벌이 가정에 반찬을 정기배송하는 동네 반찬가게", pitch: "설명 문장", names: [{ name: "새벽반찬", why: "이유 하나" }, { name: "동네찬방", why: "이유 둘" }] } } } as unknown as Partial<CoachState>;
  const result = renderToStaticMarkup(<DesignResult snapshot={nextSnapshot({}, identityDesign)} onName={noop} />);
  for (const text of ["사업 이름", "새벽반찬", "동네찬방", "직접 수정하기", "결과 요약", "맞벌이 가정에 반찬을 정기배송하는 동네 반찬가게", "이렇게 시작해요", "먼저 해볼 일"]) assert.ok(result.includes(text), `result is missing: ${text}`);
  assert.ok(!result.includes("1단계"), "the result does not read like step one of a startup");
  // 추천 이름을 고른 뒤에도 처음 이름으로 되돌릴 수 있다
  const renamed = nextSnapshot({}, { ...identityDesign, business: { ...summarized.coach.business, name: "새벽반찬", nameConfirmed: true } } as Partial<CoachState>);
  const undo = renderToStaticMarkup(<DesignResult snapshot={{ ...renamed, intake: { ...renamed.intake, originalName: "맞벌이 반찬 정기배송" } }} onName={noop} />);
  assert.ok(undo.includes("맞벌이 반찬 정기배송") && undo.includes("처음 이름"), "the original name stays as a chip");
  // 운영 중인 사업: 새 이름을 앞세우지 않고, 운영에 맞는 머리말
  const operatingResult = renderToStaticMarkup(<DesignResult snapshot={{ ...nextSnapshot({}, identityDesign), intake: { ...summarized.intake, mode: "operating" } }} onName={noop} />);
  assert.ok(operatingResult.includes("이렇게 바꿔 봐요") && !operatingResult.includes("이렇게 시작해요") && operatingResult.includes("새 이름 추천 보기") && !operatingResult.includes("동네찬방"), "operating results keep the current name first");
  assert.ok(operatingResult.includes("지금 가게 이름") && operatingResult.includes('aria-label="지금 가게 이름"'), "operating results ask the current shop name in a plain input");
  for (const text of ["AI 제안", "이유 하나", "키프리스", "<details", "설명 문장"]) assert.ok(!result.includes(text), `result should not include: ${text}`);
  const pricedPrepare = renderToStaticMarkup(<NextStepAction snapshot={nextSnapshot({}, currentDesign)} prepared={false} disabled={false} aiBusy={false} minimal payNote="49,000원 결제 후 작성 · 홈페이지까지 59,000원" onDesign={noop} onPrepare={noop} />);
  assert.ok(pricedPrepare.includes("49,000원 결제 후 작성 · 홈페이지까지 59,000원"), "the plan button shows the price before payment");
  const minimalPrepare = renderToStaticMarkup(<NextStepAction snapshot={nextSnapshot({}, currentDesign)} prepared={false} disabled={false} aiBusy={false} minimal onDesign={noop} onPrepare={noop} />);
  assert.ok(minimalPrepare.includes("사업계획서 만들기</button>") && minimalPrepare.includes("결제하면 바로 작성을 시작해요") && !minimalPrepare.includes("진행 단계"), "the result screen ends with one plan button");
  // 사업 방향 정리 중: 마지막 답을 보낸 순간부터 막대와 단계가 보인다(작업 접수 전에도)
  const starting = renderToStaticMarkup(<DesignProgress snapshot={nextSnapshot({}, { design: undefined })} />);
  assert.ok(starting.includes('role="progressbar"') && starting.includes("답변 모으기") && starting.includes("시작 범위 제안하기") && starting.includes("보통 30~40초"), "design progress shows a bar and steps before the job is accepted");
  assert.equal(renderToStaticMarkup(<NextStepAction snapshot={nextSnapshot({ coreComplete: false }, {})} prepared={false} disabled={false} aiBusy={false} onDesign={noop} onPrepare={noop} />), "");
  // Legacy timing estimates remain compatible but are not shown as measured progress.
  assert.equal(jobProgress("queued", 0, 25_000, 60_000).percent, 3);
  assert.equal(jobProgress("running", 25_000, 25_000, 60_000).percent, 80);
  assert.equal(jobProgress("running", 300_000, 25_000, 60_000).percent, 95);
  assert.equal(jobProgress("complete", 1_000, 25_000, 60_000).percent, 100);
  assert.ok(jobProgress("running", 41_000, 25_000, 60_000).slow && !jobProgress("running", 30_000, 25_000, 60_000).slow);
  for (let t = 0, last = 0; t <= 120_000; t += 5_000) { const p = jobProgress("running", t, 25_000, 60_000).percent; assert.ok(p >= last, "the gauge never goes backwards"); last = p; }
  const runningJob = { id: "job-1", runId: "intake-job-1", kind: "design" as const, status: "running" as const, noteIds: [], baseValues: {}, baseDocumentRevision: 1, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
  const gauge = renderToStaticMarkup(<JobProgress announce snapshot={{ ...summarized, intake: { ...summarized.intake, job: runningJob }, jobClock: { elapsedMs: 25_000, expectedMs: 25_000, limitMs: 60_000 } }} />);
  for (const text of ["사업 방향 정리 중", 'role="progressbar"', 'aria-valuetext="처리 중"', "25초 경과", "답변은 저장돼 있어요", "다시 들어오면 작업 상태와 결과를 확인할 수 있어요"]) assert.ok(gauge.includes(text), `${text} in ${gauge}`);
  for (const text of ["80%", "aria-valuenow", "보통 25초", "다른 페이지로 가도 서버에서 계속 진행돼요"]) assert.ok(!gauge.includes(text), "estimated completion and unconditional background promises are not shown");
  const queuedGauge = renderToStaticMarkup(<JobProgress snapshot={{ ...summarized, intake: { ...summarized.intake, job: { ...runningJob, status: "queued" } }, jobClock: { elapsedMs: 0, expectedMs: 25_000, limitMs: 60_000 } }} />);
  assert.ok(queuedGauge.includes("요청을 접수했어요") && queuedGauge.includes('aria-valuetext="처리 대기 중"'));
  assert.equal(renderToStaticMarkup(<JobProgress snapshot={summarized} />), "", "no gauge without an active job");
  const chatJob = renderToStaticMarkup(<JobProgress announce variant="chat" snapshot={{ ...summarized, intake: { ...summarized.intake, job: runningJob }, jobClock: { elapsedMs: 25_000, expectedMs: 25_000, limitMs: 60_000 } }} />);
  assert.ok(chatJob.includes("data-job-chat") && chatJob.includes("사업 방향 정리 중") && chatJob.includes('role="status"') && chatJob.includes("보통 30~40초 걸려요"),"in the conversation the job reads as the coach replying");
  assert.ok(!chatJob.includes("progressbar") && !chatJob.includes("초 경과") && !chatJob.includes("평소보다"), "no gauge or ticking clock while the job is on time");
  const slowChatJob = renderToStaticMarkup(<JobProgress variant="chat" snapshot={{ ...summarized, intake: { ...summarized.intake, job: runningJob }, jobClock: { elapsedMs: 41_000, expectedMs: 25_000, limitMs: 60_000 } }} />);
  assert.ok(slowChatJob.includes("평소보다 오래 걸리고 있어요 · 41초") && !slowChatJob.includes('role="status"'), "elapsed time appears only once the job runs long");
  assert.equal(renderToStaticMarkup(<JobProgress variant="chat" snapshot={summarized} />), "", "no chat reply bubble without an active job");
  const busySummary = renderToStaticMarkup(<BusinessSummary onStructure={noop} snapshot={{ ...nextSnapshot({}, { design: undefined }), intake: { ...summarized.intake, job: runningJob }, jobClock: { elapsedMs: 5_000, expectedMs: 25_000, limitMs: 60_000 } }} disabled aiBusy prepared={false} onEdit={noop} onDetails={noop} onDesign={noop} onPrepare={noop} />);
  assert.ok(busySummary.includes('role="progressbar"') && !busySummary.includes("aria-valuenow") && !busySummary.includes("사업 방향 정리하기</button>"), "while the job runs its state indicator takes the button's place");
  let numbered = previewIntakeAnswer(original, command({ questionId: "budget", value: "200만원" }))!;
  numbered = previewIntakeAnswer(numbered, { ...command({ questionId: "hoursPerWeek", value: "10시간" }), revision: numbered.coach.revision })!;
  assert.equal(numbered.coach.fields.find(field => field.key === "budget")?.value, "2000000원", "Storage keeps the raw coachAmount string");
  const numberedSummary = renderToStaticMarkup(<BusinessSummary onStructure={noop} snapshot={numbered} disabled={false} aiBusy={false} prepared={false} onEdit={noop} onDetails={noop} onDesign={noop} onPrepare={noop} />);
  assert.ok(numberedSummary.includes("2,000,000원"), "Summary formats amounts");
  assert.ok(numberedSummary.includes("10시간 / 주"), "Summary attaches unit and period");
  assert.ok(!summary.includes("AI 준비 완료"));
  const noteMarkup = renderToStaticMarkup(<SavedNotes snapshot={{ ...original, intake: { ...original.intake, notes: [{ id: "n", text: "사용자가 남긴 원문", at, status: "failed" }] } }} disabled={false} onExtract={noop} />);
  assert.ok(noteMarkup.includes("사용자가 남긴 원문"));
  assert.ok(noteMarkup.includes("메모 원문은 저장되어 있습니다"));
  const orphan = renderToStaticMarkup(<AnswerHistory snapshot={original} drafts={{ "food_beverage.signatureMenu": { ...emptyAnswer(), text: "업종 변경 전 입력한 대표 메뉴", label: "대표 메뉴" } }} onEdit={noop} onKeepAsMemo={noop} />);
  assert.ok(orphan.includes("업종 변경 전 입력한 대표 메뉴"));
  assert.ok(orphan.includes("자유 메모로 가져오기"));
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /minmax\(0, 1fr\)/);
  assert.ok(!/letter-spacing:\s*-/.test(css));
  for (const selector of [".chip ", ".chipRow", ".stepper", ".stepButton", ".keypad ", ".unitToggle", ".optionHint", ".questionHint", ".draftHint"]) assert.ok(css.includes(selector), selector);
  assert.match(css, /@media \(max-width: 400px\) \{\s*\.chip \{/, "Narrow phones tighten the chips");
  const source = readFileSync(new URL("../app/plan/chat/BusinessIntake.tsx", import.meta.url), "utf8");
  assert.match(source, /"x-business-intake-owner": ownerScope.current/);
  assert.ok(!source.includes('action: "extract-pending"'), "The unified composer never auto-dispatches note extraction");
  assert.ok(!source.includes("MODE_LABELS"), "Input modes are not exposed as persistent tabs");
  assert.match(source, /routeComposerInput/);
  assert.match(source, /readChatResponse/);
  assert.match(source, /note.status === "queued"/);
  assert.match(source, /input && draftRef.current.pending/);
  assert.match(source, /replaceState\(null, "", target\)/, "Next's URL wrapper must receive non-internal history state");
  assert.match(source, /if \(stored && previousKey !== storageKey.current\)/, "Keep the old backup if plan-scoped storage fails");
  assert.match(source, /freezeForOwnerChange = useCallback\(\(\) => \{\s*routeEpoch.current \+= 1/);
  assert.ok(!source.includes("setInterval(() => void send"));
  assert.match(source, /enterKeyHint="enter"/);
  assert.match(source, /composerEnterSends\(\{ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode \}, window.matchMedia\("\(pointer: coarse\)"\).matches\)/);
  assert.ok(!source.includes('window.matchMedia("(min-width:901px)").matches'), "Sending with Enter must not depend on the viewport width");
  // 대화 칸은 작업실 밖에서는 main, 작업실 안에서는 section(작업실 루트가 하나뿐인 main) — 같은 InputPane 태그로 그린다
  assert.match(source, /const InputPane = embedded \? "section" : "main";/);
  assert.ok(source.indexOf("<InputPane ref={inputPane}") > 0 && source.indexOf("</InputPane>") > source.indexOf("<InputPane ref={inputPane}"));
  const conversationMarkup = source.slice(source.indexOf('<InputPane ref={inputPane}'), source.indexOf('</InputPane>'));
  // 작업실 탭(tab)이 바뀌어도 대화를 다시 불러오지 않는다 — 불러오기 기준에서 tab 을 뺀다
  assert.match(source, /const routeQuery = withoutStudioTab\(queryString\);/);
  assert.match(source, /\}, \[routeQuery, getSnapshot, installPlan, restoreDraft, updateUrl, resetReply\]\);/);
  assert.match(source, /params\.delete\("tab"\)/);
  // 작업실 칸 안: 늘 한 칸(PC 두 칸 배치·분할 손잡이 없음), 높이는 칸을 채운다
  assert.match(source, /const coachLayout = coach && plan && !embedded \?/);
  assert.match(source, /\{plan && !embedded && <div \{\.\.\.split\.separator\}/);
  assert.match(source, /data-embedded=\{embedded \|\| undefined\}/);
  // 칸 단추 줄(요약)·진행 줄·저장 상태·안내는 대화 위에 가로로 꽉 찬 줄로 쌓고, 대화 영역만 남은 높이를 채운다(예전엔 가로로 나란히 서서 대화가 좁아졌다)
  assert.match(css, /\.page\[data-embedded\] \{ height: 100%; flex-direction: column; \}/);
  assert.match(css, /\.page\[data-embedded\] > \.workspace \{ flex: 1 1 0; min-height: 0; \}/);
  assert.match(css, /\.page\[data-embedded\] \.mobileHidden \{ display: none; \}/);
  assert.match(css, /\.page\[data-embedded\] \.summaryToggle \{ display: inline-flex; \}/);
  // 2단계: 작업실 안에서는 작성 팝업 대신 대화 안 진행 카드 — 시작하면 넓은 화면은 계획서 탭을 보이고 좁은 화면은 점만 찍는다
  assert.match(source, /if \(embedded\) revealGeneration\(\); else setGenerationOpen\(true\);/);
  assert.match(source, /\{plan && !embedded && <GenerationDialog planId/, "작업실에서는 팝업을 그리지 않는다");
  assert.match(source, /studioNav\.showTab && window\.matchMedia\(STUDIO_WIDE_QUERY\)\.matches\) studioNav\.showTab\("plan"\);\s*else studioNav\.markActivity\?\.\("plan"\);/);
  assert.match(source, /const STUDIO_WIDE_QUERY = "\(min-width: 1024px\)";/);
  const studioSource = readFileSync(new URL("../app/plan/studio/Studio.tsx", import.meta.url), "utf8");
  assert.ok(studioSource.includes(`WIDE_QUERY = "(min-width: 1024px)"`), "대화 칸의 넓은 화면 기준은 작업실과 같아야 한다");
  assert.match(source, /\{studioTurn \?\? <NextStepAction /, "작성 중·방금 끝남이면 진행 카드·마무리 말이 다음 단계 단추 자리를 대신한다");
  assert.match(source, /\{studioTurn \?\? <DocumentLockedTurn /);
  assert.match(source, /onHomepage=\{\(\) => navigate\(homepageHref\(plan\.planId\)\)\}/);
  assert.match(source, /if \(studioNav\?\.showTab\) studioNav\.showTab\("plan"\);/);
  // 숨은 대화 칸: 알림 칸 대신 대화 탭에 점, 숨은 칸으로 초점을 옮기지 않는다
  assert.match(source, /if \(!visible\) \{ if \(arrived\) studioNav\?\.markActivity\?\.\("chat"\); setAnnouncement\(""\); return; \}/);
  assert.match(source, /paneVisible\.current = studioPane \? studioPane\.active : true;/);
  // 답이 저장될 때마다(보이는 채로도) 작업실 머리줄의 질문 수를 바로 다시 묻게 한다 — 숨어 있으면 점은 위 알림 효과가
  assert.match(source, /const savedRevision = savedPlan \? `\$\{savedPlan\.planId\}:\$\{savedPlan\.coach\.revision\}` : null;/);
  assert.match(source, /if \(!embedded \|\| !savedRevision \|\| !before \|\| before === savedRevision \|\| !paneVisible\.current\) return;\n\s*studioNav\?\.markActivity\?\.\("chat"\);/);
  // 작성 진행 카드가 나타나면 카드 전체가 보이게 내린다(사업안 카드 아래에서 반쯤 잘렸다)
  assert.match(source, /\? <div ref=\{runCard\}><GenerationCard /);
  assert.match(source, /top = Math\.min\(bottom, Math\.max\(top, Math\.min\(cardTop - 16, cardBottom \+ 16 - container\.clientHeight\)\)\);/);
  assert.match(source, /if \(!runShown\) return;\n\s*follow\.current = true;/);
  // 요약 단추: 작업실 안에서는 칸 단추 줄(actions)로 넘기지 않고 진행 막대와 한 줄(paneBar)에 둔다
  assert.match(source, /actions=\{embedded \? undefined : summaryToggle\}/);
  assert.match(source, /<div className=\{styles\.paneBar\}><div className=\{styles\.paneProgress\} aria-hidden="true">/);
  assert.match(css, /\.page\[data-embedded\] \.paneBar \{ display: flex;/);
  // 새 사업(주소에 planId 없음)을 작업실에서 시작해도 로그인 뒤 작업실로 돌아온다 · planId 는 지금 경로에 붙인다(tab 유지)
  assert.match(source, /embedded \? plan \? studioHref\(plan\.planId, "chat"\) : `\$\{STUDIO_PATH\}\?new=1`/);
  assert.match(source, /url\.searchParams\.set\("planId", id\); url\.searchParams\.delete\("new"\);\s*const target = `\$\{url\.pathname\}\$\{url\.search\}\$\{url\.hash\}`;/);
  const generationSource = readFileSync(new URL("../app/plan/GenerationProgress.tsx", import.meta.url), "utf8");
  assert.match(generationSource, /export function GenerationCard\(/);
  assert.match(generationSource, /남은 장 이어서 쓰기/);
  assert.match(generationSource, /useEffect\(\(\) => \{ setEta\(generationEta\(state, Date\.now\(\)\)\); \}, \[state\]\);/, "렌더 중에 시계를 읽지 않는다");
  {
    const startedAt = "2026-10-23T00:00:00.000Z", t0 = Date.parse(startedAt);
    assert.equal(generationEta({ done: 0, total: 10, startedAt }, t0 + 60_000), null, "한 장도 못 썼으면 평균을 모른다");
    assert.equal(generationEta({ done: 2, total: 10, startedAt: null }, t0), null);
    assert.equal(generationEta({ done: 10, total: 10, startedAt }, t0 + 60_000), null);
    assert.equal(generationEta({ done: 2, total: 10, startedAt }, t0 + 60_000), "약 4분 남음", "한 장 30초 × 8장 = 4분");
    assert.equal(generationEta({ done: 5, total: 6, startedAt }, t0 + 100_000), "곧 끝나요");
    assert.equal(generationEta({ done: 3, total: 10, startedAt }, t0 + 100_000), "약 4분 남음", "233초는 4분으로 올림");
    assert.equal(generationEta({ done: 2, total: 10, startedAt: "엉뚱한 값" }, t0), null);
  }
  const loadingSource = readFileSync(new URL("../app/plan/chat/loading.tsx", import.meta.url), "utf8");
  assert.ok(loadingSource.indexOf("if (pane) return <PlanLoading") > 0 && loadingSource.indexOf("if (pane) return <PlanLoading") < loadingSource.indexOf("<main"), "작업실 칸 안의 로딩은 자기 main 을 그리지 않는다");
  assert.ok(!conversationMarkup.includes("<AnswerHistory"), "Answer history belongs in the summary, not below the next chat question");
  assert.match(source, /finishReply\(pending.command.requestId, saved\)/, "Failed saves must cancel question reveal");
  assert.match(source, /Math\.min\(bottom, Math\.max\(0, turnTop\)\)/, "Auto-scroll follows to the latest content but never hides the current question heading");
  assert.match(source, /observer\.observe\(container\.firstElementChild\)/, "Auto-scroll keeps following while the conversation content grows");
  assert.match(source, /data-intake-announcer/, "One always-mounted live region announces new questions and AI replies");
  assert.ok(source.includes('setAnnouncement("다음 질문을 준비하고 있어요")'), "The typing state is announced through the persistent live region");
  const transition = readFileSync(new URL("../app/plan/chat/intake-ui/use-reply-transition.ts", import.meta.url), "utf8");
  assert.match(transition, /prefers-reduced-motion: reduce/);
  assert.match(transition, /active.current\?\.requestId !== requestId/);
  assert.match(transition, /saved \? Math.max\(0, readyAt.current - performance.now\(\)\) : 0/);
  /* 작업실 3단계 — 대화로 고치기 카드 상태 · 세션 저장 되살리기 · 쓰는 동안 보낸 요청 대기열(순수 함수) */
  {
    const { studioEditReducer, restoreEditTurns, studioEditError, studioEditAction, studioTargetChipText, sectionHint, editTurnBusy, editTurnsKey, requestQueueKey, enqueueRequest, cancelQueuedRequest, readRequestQueue, queuedRequestRoute, queuedRequestStatus, STUDIO_EDIT_TURN_LIMIT, STUDIO_QUEUE_LIMIT, STUDIO_EDIT_INTERRUPTED } = await import("../app/plan/chat/intake-ui/studio-edit");
    const proposal = { id: "p1", target: "homepage" as const, summary: "첫 화면 제목을 짧게 바꿔요", changes: [{ label: "첫 화면 제목", before: "맞벌이 가정을 위한 반찬 정기배송", after: "반찬 정기배송" }], cost: "AI 수정 토큰 1,240개 사용" };
    const base = { id: "t1", target: "homepage" as const, label: "홈페이지", instruction: "제목을 짧게", at: 1 };
    let state = studioEditReducer({ planId: null, turns: [] }, { type: "load", planId: "a", turns: [] });
    state = studioEditReducer(state, { type: "propose", turn: base });
    assert.equal(state.turns[0].status, "proposing");
    assert.ok(editTurnBusy(state.turns[0]), "만드는 중에는 다음 요청을 막는다");
    assert.equal(studioEditReducer(state, { type: "propose", turn: base }), state, "같은 id 는 두 번 넣지 않는다");
    assert.equal(studioEditReducer(state, { type: "applied", id: "t1" }), state, "순서가 틀린 알림(만드는 중에 '바꿨어요')은 무시한다");
    assert.equal(studioEditReducer(state, { type: "proposed", id: "other", proposal }), state, "다른 사업으로 바뀐 뒤 온 결과는 무시한다");
    state = studioEditReducer(state, { type: "proposed", id: "t1", proposal });
    assert.equal(state.turns[0].status, "proposed");
    assert.equal(state.turns[0].proposal?.cost, proposal.cost);
    assert.ok(!editTurnBusy(state.turns[0]));
    const dismissed = studioEditReducer(state, { type: "dismiss", id: "t1" });
    assert.equal(dismissed.turns[0].status, "dismissed");
    assert.equal(studioEditReducer(dismissed, { type: "apply", id: "t1" }), dismissed, "그대로 둔 카드는 바꿀 수 없다");
    state = studioEditReducer(state, { type: "apply", id: "t1" });
    assert.equal(state.turns[0].status, "applying");
    state = studioEditReducer(state, { type: "failed", id: "t1", error: "저장하지 못했어요", retry: "apply" });
    assert.deepEqual([state.turns[0].status, state.turns[0].retry, state.turns[0].error], ["failed", "apply", "저장하지 못했어요"]);
    assert.ok(state.turns[0].proposal, "바꾸다 실패해도 카드는 남는다(다시 시도)");
    state = studioEditReducer(state, { type: "retry", id: "t1" });
    assert.equal(state.turns[0].status, "applying", "다시 시도는 실패한 일로 돌아간다");
    state = studioEditReducer(state, { type: "applied", id: "t1" });
    assert.equal(state.turns[0].status, "applied");
    state = studioEditReducer(state, { type: "undo", id: "t1" });
    assert.equal(state.turns[0].status, "undoing");
    state = studioEditReducer(state, { type: "undone", id: "t1" });
    assert.equal(state.turns[0].status, "undone");
    const failedPropose = studioEditReducer(studioEditReducer(state, { type: "propose", turn: { ...base, id: "t2" } }), { type: "failed", id: "t2", error: "x", retry: "propose" });
    assert.equal(studioEditReducer(failedPropose, { type: "retry", id: "t2" }).turns[1].status, "proposing");
    const noted = studioEditReducer(state, { type: "note", turn: { ...base, id: "n1", target: "plan-section", label: "3장 시장과 고객 고치기" } });
    assert.equal(noted.turns.at(-1)?.status, "note");
    let many = studioEditReducer({ planId: "a", turns: [] }, { type: "load", planId: "a", turns: [] });
    for (let index = 0; index < STUDIO_EDIT_TURN_LIMIT + 5; index++) many = studioEditReducer(many, { type: "propose", turn: { ...base, id: `m${index}` } });
    assert.equal(many.turns.length, STUDIO_EDIT_TURN_LIMIT, "오래된 기록부터 지운다");
    assert.equal(many.turns[0].id, "m5");

    // 세션 저장소에서 되살리기 — 하던 중이던 카드는 '멈췄어요 · 다시 시도', 틀린 모양은 버린다
    const stored = JSON.stringify([
      { ...base, status: "proposing" },
      { ...base, id: "t2", status: "applying", proposal },
      { ...base, id: "t3", status: "applied", proposal },
      { ...base, id: "t4", status: "undoing", proposal },
      { ...base, id: "t5", status: "proposed" },
      { ...base, id: "t6", status: "failed", error: "홈페이지를 아직 불러오고 있어요.", retry: "propose" },
      { ...base, id: "t7", target: "elsewhere", status: "proposed", proposal },
      { id: "t8" }, null, "글",
      { ...base, id: "t9", status: "applied", proposal: { ...proposal, changes: [{ label: "제목", before: 1, after: "x" }, { label: "버튼", before: "", after: "예약하기" }] } },
    ]);
    const restored = restoreEditTurns(stored);
    assert.deepEqual(restored.map(turn => turn.id), ["t1", "t2", "t3", "t4", "t5", "t6", "t9"]);
    assert.deepEqual(restored.map(turn => turn.status), ["failed", "failed", "applied", "failed", "failed", "failed", "applied"]);
    assert.deepEqual(restored.map(turn => turn.retry), ["propose", "apply", undefined, "undo", "propose", "propose", undefined]);
    assert.equal(restored[0].error, STUDIO_EDIT_INTERRUPTED);
    assert.equal(restored[5].error, "홈페이지를 아직 불러오고 있어요.", "저장해 둔 실패 문장은 그대로");
    assert.deepEqual(restored[6].proposal?.changes, [{ label: "버튼", before: "", after: "예약하기" }], "모양이 틀린 바뀌는 곳은 뺀다");
    assert.deepEqual(restoreEditTurns("{깨진"), []);
    assert.deepEqual(restoreEditTurns(null), []);
    assert.deepEqual(restoreEditTurns(JSON.stringify({ turns: [] })), []);

    assert.equal(studioEditError(new Error("홈페이지 결제 후 쓸 수 있어요."), "기본"), "홈페이지 결제 후 쓸 수 있어요.", "칸이 던진 한국어 문장은 그대로");
    // 칸이 오류에 붙인 다음 행동(결제하기) — 작업실 안 주소만 받는다
    assert.deepEqual(studioEditAction(Object.assign(new Error("결제 후"), { action: { label: "함께 결제하기", href: "/plan/pay?product=bundle" } })), { label: "함께 결제하기", href: "/plan/pay?product=bundle" });
    assert.equal(studioEditAction(Object.assign(new Error("x"), { action: { label: "가기", href: "https://evil.example" } })), undefined);
    assert.equal(studioEditAction(new Error("x")), undefined);
    assert.equal(studioEditError(new TypeError("Failed to fetch"), "기본"), "인터넷 연결이 잠시 끊겼어요. 다시 시도해 주세요.");
    assert.equal(studioEditError(new Error("Internal Server Error"), "기본"), "기본", "영어 오류는 손님에게 보이지 않는다");
    assert.equal(studioEditError("문자열", "기본"), "기본");
    assert.equal(studioTargetChipText("홈페이지"), "홈페이지 고치기");
    assert.equal(studioTargetChipText("3장 시장과 고객 고치기"), "3장 시장과 고객 고치기", "이미 '고치기'로 끝나면 두 번 붙이지 않는다");
    assert.equal(studioTargetChipText(" "), "내용 고치기");
    assert.equal(sectionHint("3장  시장과 고객 고치기"), "3장 시장과 고객");
    assert.notEqual(editTurnsKey("a"), editTurnsKey("b"), "사업마다 따로 저장한다");
    assert.notEqual(editTurnsKey("a"), requestQueueKey("a"));

    // 대기열 — 넣기 · 같은 글 막기 · 한도 · 취소 · 되살리기 · 보낼 곳
    const item = (id: string, text: string, section?: { label: string; sectionId?: string }) => ({ id, text, ...(section ? { section } : {}), at: 1 });
    let queue = enqueueRequest([], item("q1", "  가격을 2만원으로  ")).queue;
    assert.equal(queue[0].text, "가격을 2만원으로", "앞뒤 공백은 지운다");
    assert.equal(enqueueRequest(queue, item("q2", "가격을 2만원으로")).ok, false, "같은 요청은 한 번만");
    assert.equal(enqueueRequest(queue, item("q2", "가격을 2만원으로", { label: "3장 고치기" })).ok, true, "다른 장의 같은 말은 따로");
    assert.equal(enqueueRequest(queue, item("q2", "   ")).ok, false);
    for (let index = 2; index <= STUDIO_QUEUE_LIMIT; index++) queue = enqueueRequest(queue, item(`q${index}`, `요청 ${index}`)).queue;
    assert.equal(queue.length, STUDIO_QUEUE_LIMIT);
    assert.equal(enqueueRequest(queue, item("q9", "하나 더")).ok, false, "한도를 넘으면 받지 않는다");
    assert.deepEqual(cancelQueuedRequest(queue, "q2").map(entry => entry.id), queue.map(entry => entry.id).filter(id => id !== "q2"));
    assert.equal(cancelQueuedRequest(queue, "없음"), queue);
    assert.deepEqual(readRequestQueue(JSON.stringify([...queue, { id: "x", text: "" }, { text: "id 없음" }, { id: "s", text: "장 요청", section: { label: "3장 고치기", sectionId: "market/size" } }])).map(entry => entry.id), queue.map(entry => entry.id), "한도까지만, 빈 글·id 없는 것은 버린다");
    assert.deepEqual(readRequestQueue(JSON.stringify([{ id: "s", text: "장 요청", section: { label: "3장 고치기", sectionId: "market/size" } }]))[0].section, { label: "3장 고치기", sectionId: "market/size" });
    assert.deepEqual(readRequestQueue("깨진"), []);
    assert.equal(queuedRequestRoute(item("a", "x", { label: "3장" }), { sectionHandler: true, editChat: true }), "section");
    assert.equal(queuedRequestRoute(item("a", "x", { label: "3장" }), { sectionHandler: false, editChat: true }), "edit", "장 처리기가 없으면 예전 채팅 수정");
    assert.equal(queuedRequestRoute(item("a", "x"), { sectionHandler: true, editChat: true }), "edit", "장이 없는 요청은 채팅 수정");
    assert.equal(queuedRequestRoute(item("a", "x"), { sectionHandler: false, editChat: false }), "note", "채팅 수정도 없으면 메모로");
    assert.equal(queuedRequestStatus(true), "대기 중 · 다 쓰면 반영할게요");
    assert.match(queuedRequestStatus(false), /^대기 중 · /);

    // 카드 모양 — 이렇게 바꿀게요(지금 글은 줄 긋고 → 바꿀 글) · 비용 · [바꾸기] [그대로 두기] / 바꿨어요 + [되돌리기] / 실패 + [다시 시도]
    const { StudioEditTurns, QueuedStudioRequests } = await import("../app/plan/chat/intake-ui/StudioEditTurns");
    const card = (turn: Parameters<typeof StudioEditTurns>[0]["turns"][number]) => renderToStaticMarkup(<StudioEditTurns turns={[turn]} onApply={noop} onDismiss={noop} onUndo={noop} onRetry={noop} />);
    const proposed = card({ ...base, status: "proposed", proposal });
    assert.match(proposed, /이렇게 바꿀게요/);
    assert.match(proposed, /<s>맞벌이 가정을 위한 반찬 정기배송<\/s><strong>반찬 정기배송<\/strong>/);
    assert.match(proposed, /AI 수정 토큰 1,240개 사용/);
    assert.match(proposed, />바꾸기<\/button>/);
    assert.match(proposed, />그대로 두기<\/button>/);
    assert.match(proposed, /제목을 짧게/, "손님 말이 카드 위에 남는다");
    assert.match(proposed, /홈페이지 고치기/);
    assert.ok(!card({ ...base, status: "proposed", proposal: { ...proposal, cost: undefined } }).includes("<small>"), "비용이 없으면 줄을 숨긴다");
    const applied = card({ ...base, status: "applied", proposal });
    assert.match(applied, /바꿨어요/);
    assert.match(applied, /되돌리기/);
    assert.ok(!applied.includes(">바꾸기</button>"));
    assert.match(card({ ...base, status: "undone", proposal }), /되돌렸어요/);
    assert.ok(!card({ ...base, status: "dismissed", proposal }).includes("<s>"), "그대로 둔 카드는 요약만 남긴다");
    const failed = card({ ...base, status: "failed", error: "홈페이지를 아직 불러오고 있어요.", retry: "propose" });
    assert.match(failed, /홈페이지를 아직 불러오고 있어요\./);
    assert.match(failed, /다시 시도/);
    // 결제 전처럼 다시 해도 같은 실패면 [다시 시도] 대신 다음 행동 단추
    const payFailed = renderToStaticMarkup(<StudioEditTurns turns={[{ ...base, status: "failed", error: "홈페이지는 사업계획서와 함께 결제한 뒤 대화로 고칠 수 있어요.", retry: "propose", action: { label: "함께 결제하기", href: "/plan/pay?product=bundle" } }]} onApply={noop} onDismiss={noop} onUndo={noop} onRetry={noop} onAction={noop} />);
    assert.ok(payFailed.includes("함께 결제하기</button>") && !payFailed.includes("다시 시도"));
    assert.match(card({ ...base, status: "proposing" }), /data-reply-typing/);
    assert.match(card({ ...base, status: "note", target: "plan-section", label: "3장 시장과 고객 고치기" }), /메모로 남겨 뒀어요/);
    assert.equal(renderToStaticMarkup(<StudioEditTurns turns={[]} onApply={noop} onDismiss={noop} onUndo={noop} onRetry={noop} />), "");
    const queued = renderToStaticMarkup(<QueuedStudioRequests items={[item("q1", "가격을 2만원으로", { label: "3장 시장과 고객 고치기" })]} generating onCancel={noop} />);
    assert.match(queued, /\[3장 시장과 고객\] 가격을 2만원으로/);
    assert.match(queued, /대기 중 · 다 쓰면 반영할게요/);
    assert.match(queued, />취소<\/button>/);

    // 화면 연결 — 소스 점검
    const intake = readFileSync(new URL("../app/plan/chat/BusinessIntake.tsx", import.meta.url), "utf8");
    // 쓰는 동안 보낸 요청: 남은 질문이 없을 때만 대기열(질문 답은 예전 입력창 그대로) · 진행 카드가 그걸 알린다
    assert.match(intake, /const queueMode = embedded && !!plan && generating && !question && !draft\.editingId;/);
    assert.match(intake, /onOpen=\{\(\) => showPlan\(plan\.planId\)\} note=\{STUDIO_RUN_NOTE\}/);
    assert.match(intake, /기다리는 동안 요청을 보내도 돼요/);
    assert.match(generationSource, /note \?\? "다른 탭을 보거나 창을 닫아도 계속 만들어져요\./, "작업실 밖 안내는 그대로");
    // 다 쓴 뒤 하나씩: 채팅 수정의 확인을 기다리는 동안 · 멈춘 작성 · 실패 중에는 보내지 않는다
    assert.match(intake, /if \(!studioPlanId \|\| !plan \|\| !queuedRequests\.length \|\| generating \|\| runStalled \|\| !plan\.hasDocuments\) return;/);
    assert.match(intake, /editWorking \|\| editProposalOpen \|\| status === "failed"\) return;/);
    // 계획서 한 장: 처리기 → 예전 채팅 수정(장 이름 붙이기 · 거르기 그대로) → 메모
    assert.match(intake, /if \(studioNav\?\.editHandler\?\.\("plan-section"\)\) \{ startProposal\("plan-section"/);
    assert.match(intake, /void send\(\{ action: "edit", message: planSectionEditMessage\(label, text\) \}\)/);
    // 홈페이지 처리기가 없으면 홈페이지 칸을 한 번 열고(처음 열 때 만든다) 기다린다 — 휴대폰은 대화로 돌아온다
    assert.match(intake, /studioNav\.showTab\("homepage"\);\n\s*const until = Date\.now\(\) \+ HANDLER_WAIT_MS;/);
    assert.match(intake, /if \(narrow\) studioNav\.showTab\("chat"\);/);
    assert.match(intake, /const HANDLER_WAIT_MS = 10_000;/);
    // 고치기 입력은 질문 답 임시 저장과 섞이지 않는다 · 한글 조합 중 Enter 는 그대로(같은 composerEnterSends)
    assert.match(intake, /if \(studioRoute\) \{ setInputHint\(""\); setStudioText\(event\.target\.value\);/);
    assert.match(intake, /event\.preventDefault\(\); if \(studioRoute\) submitStudio\(\); else submitComposer\(\);/);
    // 고치기 기록 · 대기열은 사업마다 세션 저장소에
    assert.match(intake, /writeSession\(editTurnsKey\(editState\.planId\)/);
    assert.match(intake, /writeSession\(requestQueueKey\(requestQueue\.planId\)/);
    // 다른 칸의 '대화로 고치기'를 받는다
    assert.match(intake, /useEffect\(\(\) => studioNav\?\.onComposeRequest\?\.\(enterEditTarget\),/);
    assert.ok(css.includes(".composerTarget"), "입력창 위 대상 칩");
    // 채팅 수정을 적용하면 계획서 칸을 다시 읽게 한다 · 장 고치기는 사업 내용만 바뀐다고 알린다
    assert.match(intake, /if \(pending\.command\.action === "edit-apply" && embedded\) studioNav\?\.markActivity\?\.\("plan"\);/);
    assert.match(intake, /가격·고객 같은 사업 내용을 바꿔요/);
    // 작업실에서는 입력창이 늘 보인다 — 다 만든 사업을 다시 열어도, 사업 방향 정리가 끝난 뒤에도. 보낸 말은 뜻을 보고 나눈다
    assert.match(intake, /const studioChatMode = embedded && !!plan && !showReview && !replyTurn && !draft\.editingId && \(locked \|\| showCompletion && \(nextStep === "prepare" \|\| nextStep === "open"\)\);/);
    assert.match(intake, /if \(isConsultationText\(text\)\) \{ void send\(\{ action: "help", message: text \}\); return; \}/);
    // 쓰는 동안 받아 둔 요청으로 채팅 수정 화면이 되어도 마무리 말이 먼저 남는다
    assert.match(intake, /\{editTurn && !replyTurn \? <>\{studioTurn\}<EditChatTurn /);
    // 메신저식 '읽음'은 달지 않는다
    assert.ok(!intake.includes(': "읽음"'));
    // 다른 칸을 보면 대상 칩을 거둔다(적던 글이 있으면 둔다)
    assert.match(intake, /if \(sideChanged \|\| before\.pane && !paneActive\) leaveEditTarget\(\);/);
    assert.equal(studioEditError(new Error("아직 준비 중이에요. 조금만 기다려 주세요."), "기본"), "아직 준비 중이에요. 조금만 기다려 주세요.", "홈페이지 칸의 준비 중 문장은 그대로");
  }
  console.log(`business-intake-ui: ownership, pending retries, optimistic rollback inputs, choice composer, hybrid chips, number stepper, amount ladder, period presets, seeds, extraction consent, source summary, artifact links passed; local next-question p95 ${p95.toFixed(2)}ms`);
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
