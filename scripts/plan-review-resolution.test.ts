import assert from "node:assert/strict";
import {
  RESOLUTION_TARGETS,
  affectedOf,
  analyzerSlotsFor,
  answerResolution,
  followUpQuestions,
  gatesFor,
  resolveAiIssue,
} from "../lib/plan-builder/review/resolution";
import { collectDeterministic } from "../lib/plan-builder/review/deterministic";
import { contentHash, readReview, REVIEW_KEY, REVIEW_VERSION, type ReviewIssue, type ReviewRecord } from "../lib/plan-builder/review/domain";
import { ANALYSIS_KEY, normalizeAnalysis, type AnalysisRecord } from "../lib/plan-builder/analyzer/domain";
import { PLAN_BLUEPRINT } from "../lib/plan-builder/blueprint";
import { questionsForSection } from "../lib/plan-builder/questions";

type Answers = Record<string, Record<string, unknown>>;
const business = { name: "멍케이크 클래스", description: "반려견 케이크 원데이 클래스", industry: "교육·강의", region: "서울 마포구", stage: "아이디어 단계" };
const SECTION_KEYS = new Set(PLAN_BLUEPRINT.flatMap((c) => c.sections.map((s) => `${c.id}/${s.id}`)));

const analysis = normalizeAnalysis({
  primary: { value: "교육·강의", status: "confirmed" },
  modelTags: { value: ["class"], status: "confirmed" },
  operationTags: { value: ["offline"], status: "inferred" },
  customer: { value: "반려견 보호자", status: "confirmed" },
  problem: { value: "직접 만들고 싶지만 방법을 모름", status: "confirmed" },
  solution: { value: "반려견 케이크 원데이 클래스", status: "confirmed" },
  revenueModel: { value: "수강료", status: "confirmed" },
  deliveryModel: { value: "오프라인", status: "inferred" },
  acquisitionChannels: { value: null, status: "unknown" },
  keyCosts: { value: null, status: "unknown" },
  stage: { value: "아이디어 단계", status: "confirmed" },
  region: { value: "서울 마포구", status: "confirmed" },
  gapHints: [],
  summaryForUser: "반려견 보호자 대상 클래스로 이해했어요.",
})!;
const rec: AnalysisRecord = {
  analysis,
  slots: { seatsPerClass: { value: "6명", status: "confirmed" }, classesPerMonth: { value: "8회", status: "confirmed" } },
  rounds: 2, finished: true, analyzedAt: "2026-08-23T00:00:00Z",
};
function baseAnswers(): Answers {
  return {
    [ANALYSIS_KEY]: rec as unknown as Record<string, unknown>,
    "overview/problem": { problems: ["직접 만들고 싶지만 방법을 모름"], solutions: ["원데이 클래스"] },
    "market/segments": { first_target: "반려견 보호자" },
    "market/products": { main_offer: "반려견 케이크 원데이 클래스" },
    "market/competitors": { differentiator: "반려동물 영양을 아는 강사" },
    "financials/revenue": { unit_price: "5만원", monthly_volume: "월 40건" },
    "financials/expenses": { variable_per_unit: "18,000원", fixed_total: "500,000원" },
    "financials/staffing": { has_staff_cost: "no", owner_pay: "월 100만원" },
  };
}

/* ═══════ 목표 화이트리스트는 실제 질문과 이어져 있다 ═══════ */
for (const t of Object.values(RESOLUTION_TARGETS)) {
  for (const key of t.affected) assert.ok(SECTION_KEYS.has(key), `${t.id}: 없는 섹션 ${key}`);
  if (t.sectionKey) assert.ok(SECTION_KEYS.has(t.sectionKey), `${t.id}: 없는 저장 섹션 ${t.sectionKey}`);
  if (t.fromWizard) {
    const ok = questionsForSection(t.sectionKey!, "").some((g) => g.questions.some((q) => q.id === t.qid));
    assert.ok(ok, `${t.id}: 기존 질문 ${t.sectionKey}.${t.qid} 없음`);
  }
  // 영향 섹션이 25개를 통째로 덮지 않는다
  assert.ok(t.affected.length <= 6, `${t.id}: 영향 섹션이 너무 많다(${t.affected.length})`);
}

/* ═══════ Case A — 홍보 채널 없음 → promo_channels 질문 연결 ═══════ */
const noPromo = baseAnswers();
const aIssues = collectDeterministic({ answers: noPromo, business, evidence: [] }).issues;
const aIssue = aIssues.find((i) => i.category === "marketing")!;
assert.ok(aIssue, "A. 홍보 부재 문제가 잡힌다");
assert.equal(aIssue.resolution?.type, "answer");
assert.deepEqual(aIssue.resolution?.slots?.map((s) => s.id), ["promo_channels", "promo_budget"]);
assert.deepEqual(aIssue.resolution?.slots?.[0], { id: "promo_channels", sectionKey: "strategy/promotion", qid: "promo_channels" });
assert.ok(affectedOf(aIssue.resolution).includes("strategy/promotion"), "A. 홍보 섹션이 영향 대상");
assert.ok(!affectedOf(aIssue.resolution).includes("financials/assets"), "A. 무관한 섹션은 제외");

const aQs = followUpQuestions(aIssue.resolution, noPromo);
assert.equal(aQs.length, 2, "A. 질문은 1~3개");
// 기존 질문 문장을 그대로 쓴다 — 검토 문장을 옮기지 않는다
const promoDef = questionsForSection("strategy/promotion", "").flatMap((g) => g.questions).find((q) => q.id === "promo_channels")!;
assert.equal(aQs[0].q, promoDef.q, "A. 기존 질문 문장 재사용");
assert.equal(aQs[0].input.kind, "multi");
assert.ok(aQs.every((q) => q.allowUnknown), "모든 질문에 '아직 모르겠어요'");
// 분기 게이트도 함께 켜야 위저드에서 보인다
assert.deepEqual(gatesFor(aQs[1].target), [{ sectionKey: "strategy/promotion", qid: "has_promo_budget", value: "yes" }]);

/* ═══════ Case B — 대표 인건비 → owner_pay ═══════ */
const bIssue: ReviewIssue = {
  id: "ai-1", severity: "warning", category: "finance", origin: "ai",
  title: "사업주 인건비 미반영으로 실질 수익 왜곡 가능",
  problem: "인건비를 0원으로 두어 손익분기가 산출되었으나 사업주 본인의 시간 대가가 반영되지 않았습니다.",
  whyItMatters: "실질 수익이 과대평가됩니다.", evidence: [],
  recommendation: "최소한의 사업주 인건비 상당액을 별도 계산해 보세요.",
  requiresUserInput: true, autoFixable: false,
};
const bRes = resolveAiIssue(bIssue, analyzerSlotsFor(baseAnswers()));
assert.equal(bRes.type, "answer");
assert.deepEqual(bRes.slots?.map((s) => s.id), ["owner_pay"], "B. 인건비 → owner_pay");
assert.deepEqual(affectedOf(bRes).sort(), ["financials/expenses", "financials/financing", "financials/staffing", "summary/executive"]);
const bQs = followUpQuestions(bRes, baseAnswers());
assert.equal(bQs[0].target.qid, "owner_pay");
assert.equal(bQs[0].current, "월 100만원", "기존 답이 있으면 미리 채운다");

/* ═══════ Case C — 차별점 부족 → differentiator ═══════ */
const cIssue: ReviewIssue = { ...bIssue, id: "ai-2", category: "competition", title: "차별점이 추상적", problem: "'맞춤형 경험'만으로는 경쟁 대안과 구분되지 않습니다.", recommendation: "비교 기준 2~3개를 정해 주세요." };
const cRes = resolveAiIssue(cIssue, analyzerSlotsFor(baseAnswers()));
assert.deepEqual(cRes.slots?.map((s) => s.id), ["differentiator", "competitor_notes"], "C. 차별점 질문 연결");
assert.ok(affectedOf(cRes).includes("market/swot") && affectedOf(cRes).includes("strategy/product"));

/* ═══════ Case D — 공식근거 없음 → 질문이 아니라 market_research ═══════ */
const dIssue = aIssues.find((i) => i.category === "market_evidence")!;
assert.equal(dIssue.resolution?.type, "market_research", "D. 근거 부재는 검색 액션");
assert.equal(followUpQuestions(dIssue.resolution, noPromo).length, 0, "D. 질문을 만들지 않는다");
const dAi = resolveAiIssue({ ...bIssue, id: "ai-3", category: "market_evidence", title: "통계를 고객 수로 확대" }, new Set());
assert.equal(dAi.type, "market_research");

/* ═══════ Case E — 문장 반복 → requiresUserInput=false → 질문 없음 ═══════ */
const eIssue: ReviewIssue = { ...bIssue, id: "ai-4", category: "writing", title: "같은 설명 반복", requiresUserInput: false, autoFixable: true, sectionKey: "market/products" };
const eRes = resolveAiIssue(eIssue, new Set());
assert.equal(eRes.type, "auto_rewrite", "E. 반복은 다음 단계 자동수정 대상으로만 표시");
assert.equal(followUpQuestions(eRes, baseAnswers()).length, 0, "E. 질문 생성 안 함");
const eManual: ReviewIssue = { ...bIssue, id: "ai-5", category: "fact_safety", requiresUserInput: false, sectionKey: "overview/summary" };
assert.equal(resolveAiIssue(eManual, new Set()).type, "manual_edit", "판단이 필요한 문장은 직접 수정으로");

/* ═══════ Case F — 모르는 qid/슬롯은 폐기 ═══════ */
const fRes = answerResolution(["promo_channels", "완전히_없는_목표", "newAmazingMetric"]);
assert.deepEqual(fRes.slots?.map((s) => s.id), ["promo_channels"], "F. 화이트리스트 밖은 버린다");
// 이 사업 팩에 없는 분석 슬롯도 물을 수 없다 (클래스 팩에 monthlyVisitors 없음)
const usable = analyzerSlotsFor(baseAnswers());
assert.ok(usable.has("seatsPerClass") && !usable.has("monthlyVisitors"), "F. 팩에 있는 슬롯만 사용 가능");
const fAi = resolveAiIssue({ ...bIssue, id: "ai-6", category: "operation", title: "방문자 전환율 미확인", problem: "월 방문자와 전환율이 없습니다.", recommendation: "확인해 주세요." }, usable);
assert.notEqual(fAi.type, "answer", "F. 팩에 없는 슬롯만 걸리면 질문을 만들지 않는다");
// 저장 경로가 없는 문제는 편집기로
assert.equal(resolveAiIssue({ ...bIssue, id: "ai-7", category: "problem_solution", title: "x", problem: "특별한 실마리 없음", recommendation: "확인" }, new Set()).slots?.[0].id, "problems", "키워드가 없으면 카테고리 기본 목표로");

/* 분석 슬롯 질문은 팩 문장을 그대로 쓴다 */
const slotRes = answerResolution(["seatsPerClass", "classesPerMonth"]);
const slotQs = followUpQuestions(slotRes, baseAnswers());
assert.equal(slotQs.length, 2);
assert.equal(slotQs[0].target.analyzerSlot, "seatsPerClass");
assert.ok(slotQs[0].q.includes("몇 명까지"), "질문팩 문장 재사용");
assert.equal(slotQs[0].current, "6명", "확정된 슬롯 답을 미리 채운다");

/* ═══════ Case G — 답변으로 본문이 바뀌면 기존 검토는 stale ═══════ */
const sections = { "overview/summary": { markdown: "본문 A" }, "strategy/promotion": { markdown: "홍보 본문" } };
const record: ReviewRecord = { version: REVIEW_VERSION, reviewedAt: "2026-08-23T00:00:00Z", planId: "p1", contentHash: contentHash(sections), result: { version: REVIEW_VERSION, overallQualityScore: 70, dimensions: [], issues: [], strengths: [], topPriorities: [], summary: "" } };
const stored = { [REVIEW_KEY]: record as unknown as Record<string, unknown> };
assert.equal(readReview(stored, { id: "p1", sections }).status, "fresh");
const afterRegen = { ...sections, "strategy/promotion": { markdown: "홍보 본문 — 인스타그램 중심으로 다시 씀" } };
assert.equal(readReview(stored, { id: "p1", sections: afterRegen }).status, "stale", "G. 부분 재생성 후 stale");

/* ═══════ Case H — 부분 재생성은 영향 섹션만 바꾼다 ═══════ */
const before = { ...sections, "financials/revenue": { markdown: "매출 본문" }, "market/swot": { markdown: "SWOT 본문" } };
const affected = new Set(affectedOf(aIssue.resolution));
const after = Object.fromEntries(
  Object.entries(before).map(([k, v]) => [k, affected.has(k) ? { markdown: `${v.markdown} (다시 씀)` } : v]),
);
for (const key of Object.keys(before)) {
  const changed = before[key as keyof typeof before].markdown !== after[key].markdown;
  assert.equal(changed, affected.has(key), `H. ${key} 는 ${affected.has(key) ? "바뀌어야" : "그대로여야"} 한다`);
}
assert.ok(!affected.has("market/swot") && !affected.has("financials/revenue"), "H. 홍보 답변이 SWOT·매출을 건드리지 않는다");
assert.notEqual(contentHash(before), contentHash(after), "H. 일부만 바뀌어도 검토는 stale");

/* ═══════ 슬롯 id 이름 차이 — 미확정 항목이 빈 버튼이 되지 않게 ═══════ */
// 미확정 항목은 분석 슬롯 id 로 들어온다(problem·customer·classPrice…)
const aliased = answerResolution(["problem", "customer", "classPrice"]);
assert.equal(aliased.type, "answer");
assert.deepEqual(aliased.slots?.map((s) => s.id), ["problems", "first_target", "unit_price"], "다른 이름도 같은 질문으로 잇는다");
assert.equal(followUpQuestions(aliased, baseAnswers()).length, 3, "실제로 물을 질문이 만들어진다");
// 같은 목표로 겹치면 한 번만
assert.equal(answerResolution(["materialCost", "unitCost", "variable_per_unit"]).slots?.length, 1);
// 물을 것이 없으면 '답변 추가하기' 를 붙이지 않는다
const empty = answerResolution(["존재하지_않는_슬롯"]);
assert.equal(empty.type, "manual_edit", "빈 버튼을 만들지 않는다");
assert.equal(followUpQuestions(empty, baseAnswers()).length, 0);

/* 미확정 항목 문제(코드 생성)도 실제 질문으로 이어진다 */
const unknownAnswers = baseAnswers();
unknownAnswers[ANALYSIS_KEY] = { ...rec, slots: { ...rec.slots, differentiator: { value: null, status: "unknown" } } } as unknown as Record<string, unknown>;
const unknownIssue = collectDeterministic({ answers: unknownAnswers, business, evidence: [] }).issues.find((i) => i.title.includes("아직 정하지 않은"))!;
assert.ok(unknownIssue, "미확정 항목 문제가 잡힌다");
assert.ok(followUpQuestions(unknownIssue.resolution, unknownAnswers).length > 0, "미확정 항목도 물을 질문이 있다");

/* ═══════ 질문 수 상한 ═══════ */
assert.ok(followUpQuestions(answerResolution(["promo_channels", "promo_budget", "message", "first_target"]), baseAnswers()).length <= 3, "한 문제당 최대 3개");

/* ═══════ 영향 섹션은 그 값을 실제로 받아야 한다 ═══════ */
/*
 * 운영 실측에서 홍보 채널을 답하고 '한눈에 보기'를 다시 썼는데 본문에 채널이 없었다.
 * 영향 섹션으로 지정해 놓고 정작 그 섹션 맥락에 값이 가지 않으면 재생성이 헛돈다.
 */
import { SECTION_CONTEXT_RULES } from "../lib/plan-builder/context/section";
const FIELD_OF: Record<string, string> = {
  promo_channels: "marketing.channels",
  promo_budget: "marketing.budget",
  message: "marketing.message",
  first_target: "customer.target",
  problems: "problem.statement",
  differentiator: "solution.differentiator",
  main_offer: "solution.mainOffer",
  unit_price: "revenue.unitPrice",
  monthly_volume: "revenue.volume",
  why_us: "team.ownerExperience",
  who_works: "operations.who",
};
for (const [targetId, path] of Object.entries(FIELD_OF)) {
  const t = RESOLUTION_TARGETS[targetId];
  if (!t) continue;
  const misses = t.affected.filter((key) => {
    const rule = SECTION_CONTEXT_RULES[key];
    // 추정을 받지 않는 섹션(성과·미션 등)과 경쟁·SWOT 처럼 별도 필드를 쓰는 섹션은 제외
    return rule && !rule.fields.includes(path) && !rule.fields.some((f) => f.startsWith(path.split(".")[0] + "."));
  });
  assert.deepEqual(misses, [], `${targetId}: 영향 섹션 ${misses.join(",")} 이 ${path} 를 받지 못한다`);
}
assert.ok(SECTION_CONTEXT_RULES["overview/summary"].fields.includes("marketing.channels"), "한눈에 보기가 사용자의 실제 홍보 채널을 받는다");
assert.ok(SECTION_CONTEXT_RULES["summary/executive"].fields.includes("marketing.channels"));

console.log("plan-review-resolution.test.ts (영향 섹션 검증 포함): 전부 통과");
