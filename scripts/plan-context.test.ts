import assert from "node:assert/strict";
import { buildPlanBusinessContext } from "../lib/plan-builder/context/build";
import { contextForSection, SECTION_CONTEXT_RULES } from "../lib/plan-builder/context/section";
import { buildUserPrompt, formatContext, sectionSystemPrompt } from "../lib/plan-builder/section-generator";
import { PLAN_BLUEPRINT } from "../lib/plan-builder/blueprint";
import { ANALYSIS_KEY, normalizeAnalysis, type AnalysisRecord } from "../lib/plan-builder/analyzer/domain";
import { numberConfirms, analyzeGaps, applySlotAnswer } from "../lib/plan-builder/analyzer/gap";
import { PACKS } from "../lib/plan-builder/analyzer/packs";
import { collectFinancialInputs } from "../lib/plan-builder/financials";

/* ───────── 고정 데이터: 강아지 케이크 클래스 ───────── */

const analysis = normalizeAnalysis({
  primary: { value: "교육·강의", status: "confirmed" },
  modelTags: { value: ["class"], status: "confirmed" },
  operationTags: { value: ["offline", "b2c", "reservation", "pet", "content_led"], status: "inferred" },
  customer: { value: "반려견 보호자", status: "confirmed" },
  problem: { value: "기념일 케이크를 직접 만들고 싶지만 방법을 모름", status: "inferred" },
  solution: { value: "반려견 케이크 원데이 클래스", status: "confirmed" },
  revenueModel: { value: "수강료", status: "confirmed" },
  deliveryModel: { value: "오프라인 대면 · 예약제", status: "inferred" },
  acquisitionChannels: { value: ["인스타그램", "유튜브 숏폼"], status: "confirmed" },
  keyCosts: { value: ["공간 대관", "재료비"], status: "inferred" },
  stage: { value: "아이디어 단계", status: "inferred" },
  region: { value: null, status: "unknown" },
  gapHints: [],
  summaryForUser: "반려견 보호자를 대상으로 원데이 클래스를 운영하는 사업으로 이해했어요.",
})!;
const record: AnalysisRecord = {
  analysis,
  slots: {
    classPrice: { value: "5만원", status: "confirmed" },
    seatsPerClass: { value: "6명", status: "confirmed" },
    classesPerMonth: { value: "8회", status: "confirmed" },
    venueType: { value: "필요할 때 시간제로 빌림", status: "confirmed" },
    materialCost: { value: "1만5천원", status: "confirmed" },
    venueCost: { value: "월 40만원", status: "confirmed" },
    differentiator: { value: null, status: "unknown" },
  },
  rounds: 2,
  finished: true,
  analyzedAt: "2026-08-22T00:00:00Z",
};
const business = { name: "멍케이크 클래스", description: "강아지 케이크 클래스", industry: "교육·강의", region: "서울 마포구", stage: "", role: "" };
const baseAnswers = {
  [ANALYSIS_KEY]: record as unknown as Record<string, unknown>,
  "financials/revenue": { unit_price: "5만원", monthly_volume: "월 40건" },
  "financials/expenses": { fixed_total: "80만원", variable_per_unit: "2만원" },
};

/* ───────── A. mapsTo 의미 수정 — 구성 항목은 합계 칸에 직접 들어가지 않는다 ───────── */

assert.equal(PACKS.class.slots.find((s) => s.id === "venueCost")!.mapsTo, undefined, "venueCost 는 fixed_total 에 직접 매핑하지 않는다");
assert.equal(PACKS.class.slots.find((s) => s.id === "materialCost")!.mapsTo, undefined, "materialCost 는 variable_per_unit 에 직접 매핑하지 않는다");
assert.equal(PACKS.class.slots.find((s) => s.id === "venueCost")!.contributesTo, "fixed");
let ans: Record<string, Record<string, unknown>> = {};
ans = applySlotAnswer(ans, PACKS.class, "venueCost", "월 40만원");
assert.equal(ans["financials/expenses"]?.fixed_total, undefined, "공간비만으로 고정비 합계를 확정하지 않는다");
assert.deepEqual(ans["financials/expenses"]?.fixed_items, ["임대료"], "항목 표시는 한다");
// 숫자 확인 카드: 판매량·고정비 합계·변동비 합계 — 초기값은 구성 항목 합, 사용자 확인 전 저장 없음
const confirms = numberConfirms(record, {});
assert.deepEqual(confirms.map((c) => c.target.qid), ["monthly_volume", "fixed_total", "variable_per_unit"]);
assert.equal(confirms[1].value, 400_000);
assert.ok(confirms[1].hint.includes("광고비"), "다른 고정비를 더하라고 안내");
assert.equal(confirms[2].value, 15_000);
assert.ok(confirms[2].hint.includes("수수료"), "수수료·포장을 더하라고 안내");
// 이미 합계가 있으면 카드도 없고 구성 항목도 다시 묻지 않는다
assert.equal(numberConfirms(record, baseAnswers).length, 0);
const gapsWithTotals = analyzeGaps({ analysis, slots: {} }, { "financials/expenses": { fixed_total: "80만원", variable_per_unit: "2만원" } });
assert.ok(!gapsWithTotals.gaps.some((g) => g.slot === "venueCost" || g.slot === "materialCost"));
// 기존 재무 엔진은 합계 칸만 읽는다(무수정)
assert.equal(collectFinancialInputs(baseAnswers).inputs.monthlyFixedCost, 800_000);

/* ───────── B. Context 구성 우선순위 ───────── */

const ctx = buildPlanBusinessContext({ business, answers: baseAnswers });
// 3. VERIFY 확정 → user_answer/confirmed
assert.equal(ctx.customer.target!.value, "반려견 보호자");
assert.equal(ctx.customer.target!.status, "confirmed");
assert.equal(ctx.customer.target!.source, "user_answer");
// 6. inferred → ai_inference/inferred
assert.equal(ctx.problem.statement!.status, "inferred");
assert.equal(ctx.problem.statement!.source, "ai_inference");
assert.equal(ctx.operations.delivery!.status, "inferred");
// 1. 위저드 직접 입력이 AI 를 이긴다
const ctxW = buildPlanBusinessContext({ business, answers: { ...baseAnswers, "overview/problem": { problems: ["위저드에서 적은 문제"] } } });
assert.equal(ctxW.problem.statement!.value, "위저드에서 적은 문제");
assert.equal(ctxW.problem.statement!.status, "confirmed");
// 1 > 3: 위저드 값이 VERIFY 확정값과 다르면 위저드 값만 가고 충돌이 생긴다
const ctxC = buildPlanBusinessContext({ business, answers: { ...baseAnswers, "market/segments": { first_target: "30~40대 반려견 보호자 직장인" } } });
assert.equal(ctxC.customer.target!.value, "30~40대 반려견 보호자 직장인");
assert.equal(ctxC.conflicts.length, 0, "포함 관계(반려견 보호자 ⊂ …)는 충돌이 아니다");
const ctxC2 = buildPlanBusinessContext({ business, answers: { ...baseAnswers, "market/segments": { first_target: "프리미엄 베이커리 사장님" } } });
assert.equal(ctxC2.customer.target!.value, "프리미엄 베이커리 사장님", "위저드 값 우선");
assert.equal(ctxC2.conflicts.length, 1);
assert.ok(ctxC2.conflicts[0].title.includes("핵심 고객"));
// 2. 동적 답 > 6. 추론 — differentiator 는 unknown 슬롯이라 unknown
assert.equal(ctx.solution.differentiator!.status, "unknown");
assert.ok(ctx.unknowns.some((u) => u.field === "differentiator"));
// 사업 정보(user_input) > 추론 — 지역은 business 에서
assert.equal(ctx.identity.region!.value, "서울 마포구");
assert.equal(ctx.identity.region!.source, "user_input");
// 4. 계산값 — 재무 요약은 기존 계산기 결과
assert.ok(ctx.finance.summary?.includes("손익분기"), "재무 요약은 calculateFinancials 기반");
assert.ok(ctx.finance.summary?.includes("50,000"));
// 동적 슬롯 → 운영
assert.equal(ctx.operations.venueType!.value, "필요할 때 시간제로 빌림");
assert.ok(ctx.operations.capacity!.value?.includes("6명"));
// 태그
assert.deepEqual(ctx.classification.modelTags!.value, ["class"]);
assert.equal(ctx.classification.operationTags!.status, "inferred");

// 분석이 없는 플랜 — 위저드 값만으로 구성되고 추론은 없다
const ctxNo = buildPlanBusinessContext({ business, answers: { "market/segments": { first_target: "A" } } });
assert.equal(ctxNo.customer.target!.value, "A");
assert.equal(ctxNo.problem.statement!.status, "unknown");
assert.equal(ctxNo.classification.modelTags!.status, "unknown");

/* ───────── C. 섹션별 분배 ───────── */

for (const c of PLAN_BLUEPRINT) for (const s of c.sections) assert.ok(SECTION_CONTEXT_RULES[`${c.id}/${s.id}`], `규칙 누락: ${c.id}/${s.id}`);

const sum = contextForSection("overview/summary", ctx)!;
assert.ok(sum.confirmed.some((c) => c.label === "핵심 고객" && c.value === "반려견 보호자"));
assert.ok(sum.inferred.some((c) => c.label === "전달 방식"), "요약은 추정을 참고로 받는다");
assert.ok(sum.hints[0].includes("클래스 사업"), "class 태그 힌트");
assert.ok(sum.finance, "요약은 재무 요약을 받는다");
assert.ok(sum.unknowns.includes("우리만의 강점"));

const ach = contextForSection("overview/achievements", ctx);
assert.equal(ach, undefined, "성과 섹션: 확정 성과가 없으면 아무것도 주지 않는다(추정 stage 는 제외)");
const achC = contextForSection("overview/achievements", buildPlanBusinessContext({ business, answers: { ...baseAnswers, "overview/summary": { established: "yes", revenue: "no" } } }))!;
assert.ok(achC.confirmed.some((c) => c.label === "사업 시작 여부" && c.value === "예"));
assert.equal(achC.inferred.length, 0);
const mission = contextForSection("overview/mission", ctx);
assert.ok(mission && mission.inferred.length === 0);
const exit = contextForSection("strategy/exit", ctx);
assert.ok(!exit || exit.inferred.length === 0);
const promo = contextForSection("strategy/promotion", ctx)!;
assert.ok(promo.confirmed.some((c) => c.label === "고객 유입 방식" && c.value.includes("인스타그램")));
assert.ok(!promo.confirmed.some((c) => c.label === "판매 가격"), "홍보 섹션에 가격은 안 간다");
const price = contextForSection("strategy/price", ctx)!;
assert.ok(price.confirmed.some((c) => c.label === "판매 가격"));
const swot = contextForSection("market/swot", ctx)!;
assert.equal(swot.inferred.length, 0, "SWOT 은 추정으로 강점·약점을 만들지 않는다");
assert.equal(contextForSection("overview/summary", null), undefined);
assert.equal(contextForSection("없는/섹션", ctx), undefined);
// 분배는 전체보다 작다
const allLabels = Object.values(SECTION_CONTEXT_RULES).reduce((n, r) => Math.max(n, r.fields.length), 0);
assert.ok(allLabels <= 14, "한 섹션 최대 14필드");

/* ───────── D. Writer 프롬프트 ───────── */

const chapter = PLAN_BLUEPRINT[0];
const section = chapter.sections[0];
const base = { chapter, section, answers: { value_prop: "x" }, business, planType: "창업 초기 · 사업계획서" };
const before = buildUserPrompt(base);
const after = buildUserPrompt({ ...base, context: sum });
assert.ok(!before.includes("[이 사업의 구조화된 맥락]"), "context 없으면 예전 프롬프트 그대로");
assert.ok(after.includes("[이 사업의 구조화된 맥락]"));
assert.ok(after.includes("확정된 정보"));
assert.ok(after.includes("AI 추정 참고정보"));
assert.ok(after.includes("- 전달 방식: 오프라인 대면 · 예약제 (추정)"));
assert.ok(after.includes("조건형으로만"));
assert.ok(after.includes("그대로 요약해 반복하지"));
assert.ok(after.includes("'혁신적인'"));
assert.ok(after.includes("다시 계산하지 말고"));
assert.equal(after.replace("\n" + formatContext(sum, {}), ""), before, "맥락 블록을 빼면 바이트 단위로 같다");
// 재무 블록이 따로 있으면 맥락의 재무 요약은 빠진다(중복 방지)
const withFin = buildUserPrompt({ ...base, context: sum, financialsReference: "- 손익분기: 월 10건" });
assert.equal((withFin.match(/손익분기/g) ?? []).length, 1, "재무 요약이 두 번 들어가지 않는다");
// 시스템 프롬프트는 그대로(캐시 유지)
assert.equal(sectionSystemPrompt(base), sectionSystemPrompt({ ...base, context: sum }));
// 맥락 블록 길이 — 장황해지지 않게
assert.ok(formatContext(sum, {}).length < 2200, `맥락 블록 ${formatContext(sum, {}).length}자`);

console.log("plan-context.test.ts: 전부 통과");
