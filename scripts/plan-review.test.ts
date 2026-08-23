import assert from "node:assert/strict";
import {
  REVIEW_KEY,
  REVIEW_VERSION,
  REVIEW_DIMENSIONS,
  contentHash,
  countBySeverity,
  normalizeReviewOutput,
  readReview,
  salvageTruncatedJson,
  sortIssues,
  type ReviewIssue,
  type ReviewRecord,
} from "../lib/plan-builder/review/domain";
import { collectDeterministic } from "../lib/plan-builder/review/deterministic";
import { REVIEWER_SYSTEM, buildReviewerPrompt, digestSection, fallbackReview, mergeIssues, reviewPlan } from "../lib/plan-builder/review/reviewer";
import { ANALYSIS_KEY, normalizeAnalysis, type AnalysisRecord } from "../lib/plan-builder/analyzer/domain";
import type { MarketEvidence } from "../lib/market/domain";

type Answers = Record<string, Record<string, unknown>>;
const business = { name: "멍케이크 클래스", description: "반려견 케이크 원데이 클래스", industry: "교육·강의", region: "서울 마포구", stage: "아이디어 단계" };

const analysisRaw = {
  primary: { value: "교육·강의", status: "confirmed" },
  modelTags: { value: ["class"], status: "confirmed" },
  operationTags: { value: ["offline", "b2c", "pet"], status: "inferred" },
  customer: { value: "반려견 보호자", status: "confirmed" },
  problem: { value: "직접 만들어주고 싶지만 방법을 모름", status: "confirmed" },
  solution: { value: "반려견 케이크 원데이 클래스", status: "confirmed" },
  revenueModel: { value: "클래스 수강료", status: "confirmed" },
  deliveryModel: { value: "오프라인 대면", status: "inferred" },
  acquisitionChannels: { value: ["인스타그램"], status: "confirmed" },
  keyCosts: { value: ["재료비"], status: "inferred" },
  stage: { value: "아이디어 단계", status: "confirmed" },
  region: { value: "서울 마포구", status: "confirmed" },
  gapHints: [],
  summaryForUser: "반려견 보호자 대상 원데이 클래스로 이해했어요.",
};
const analysis = normalizeAnalysis(analysisRaw)!;

function rec(slots: AnalysisRecord["slots"]): AnalysisRecord {
  return { analysis, slots, rounds: 2, finished: true, analyzedAt: "2026-08-23T00:00:00Z" };
}

/** 정상 플랜 — 가격 5만, 변동비 1.8만, 고정비 50만, 월 40건, 정원6×월8회=48 */
function healthyAnswers(): Answers {
  return {
    [ANALYSIS_KEY]: rec({
      seatsPerClass: { value: "6명", status: "confirmed" },
      classesPerMonth: { value: "8회", status: "confirmed" },
      materialCost: { value: "1만8천원", status: "confirmed" },
    }) as unknown as Record<string, unknown>,
    "overview/summary": { value_prop: "과정을 보여주고 직접 만드는 경험", city: "서울 마포구", reach: "동네·지역", structure: "개인사업자" },
    "overview/problem": { problems: ["직접 만들어주고 싶지만 방법을 모름"], solutions: ["원데이 클래스"], problem_freq: "월 1~2회" },
    "market/segments": { first_target: "반려견 보호자" },
    "market/products": { main_offer: "반려견 케이크 원데이 클래스", has_price: "yes", price_value: "5만원" },
    "market/competitors": { differentiator: "반려동물 영양을 아는 강사가 진행" },
    "strategy/distribution": { delivery: "오프라인 대면", coverage: "동네·생활권", channels: ["오프라인 매장"] },
    "strategy/promotion": { promo_channels: ["인스타그램"], has_promo_budget: "yes", promo_budget: "월 20만원" },
    "strategy/people": { who_works: ["대표자 직접"] },
    "financials/revenue": { unit_price: "5만원", monthly_volume: "월 40건", revenue_streams: ["시간·건당 요금"], growth: "완만한 성장 (월 5%)" },
    "financials/expenses": { variable_per_unit: "18,000원", fixed_total: "500,000원", variable_items: ["재료·원가"], fixed_items: ["임대료"] },
    "financials/staffing": { has_staff_cost: "no", owner_pay: "월 100만원" },
  };
}

const evidence: MarketEvidence[] = [
  {
    metric: "반려동물 양육 가구 수",
    value: "5,520,000",
    unit: "가구",
    sourceName: "통계청",
    sourceUrl: "https://kostat.go.kr/x",
    observedAt: "2025-12-31",
    verification: "needs_review",
  } as MarketEvidence,
];

/* ═══════════ Case A — 정상 플랜: critical 0 ═══════════ */

const a = collectDeterministic({ answers: healthyAnswers(), business, evidence });
assert.equal(a.issues.filter((i) => i.severity === "critical").length, 0, "A. 정상 플랜에 확정 critical 이 없어야 한다");
assert.ok(a.financials?.unit && a.financials.unit.contributionMargin === 32_000);
assert.deepEqual(a.capacity, { value: 48, basis: "회당 정원 6명 × 월 수업 횟수 8회" }, "capacity 는 확정 답변에서만 나온다");
assert.ok(a.issues.every((i) => i.origin === "deterministic"));

/* ═══════════ Case C — 판매가 < 변동비 → finance critical ═══════════ */

const cAnswers = healthyAnswers();
cAnswers["financials/expenses"] = { ...cAnswers["financials/expenses"], variable_per_unit: "60,000원" };
const c = collectDeterministic({ answers: cAnswers, business, evidence });
const cFin = c.issues.find((i) => i.category === "finance" && i.severity === "critical");
assert.ok(cFin, "C. 공헌이익 음수 → finance critical");
assert.ok(cFin.problem.includes("공헌이익"));
assert.ok(cFin.evidence.some((e) => e.includes("60,000원")));
assert.equal(cFin.requiresUserInput, true);
assert.equal(cFin.autoFixable, false);

/* ═══════════ Case D — capacity 충돌 (월 최대 48, 목표 100) ═══════════ */

const dAnswers = healthyAnswers();
dAnswers["financials/revenue"] = { ...dAnswers["financials/revenue"], monthly_volume: "월 100건" };
const d = collectDeterministic({ answers: dAnswers, business, evidence });
const dOp = d.issues.find((i) => i.category === "operation");
assert.ok(dOp, "D. 목표 판매량 > 운영 상한 → operation issue");
assert.equal(dOp.severity, "critical");
assert.ok(dOp.problem.includes("100") && dOp.problem.includes("48"));
assert.ok(dOp.evidence.some((e) => e.includes("회당 정원 6명 × 월 수업 횟수 8회")));

/* 손익분기 > 목표 판매량 */
const beAnswers = healthyAnswers();
beAnswers["financials/revenue"] = { ...beAnswers["financials/revenue"], monthly_volume: "월 5건" };
const beIssues = collectDeterministic({ answers: beAnswers, business, evidence }).issues;
assert.ok(beIssues.some((i) => i.category === "finance" && i.title.includes("손익분기")), "손익분기 > 목표 → finance issue");

/* 초기 투자만 있고 조달 계획 없음 */
const fundAnswers = healthyAnswers();
fundAnswers["financials/assets"] = { needs_assets: "yes", asset_cost: "3,000만원" };
const fundIssues = collectDeterministic({ answers: fundAnswers, business, evidence }).issues;
assert.ok(fundIssues.some((i) => i.sectionKey === "funding/requirements"), "초기투자 있는데 조달 답변 없음 → warning");

/* 판매 목표는 있는데 홍보 채널·예산 없음 (분석의 확인된 유입 채널도 없는 경우) */
const noPromo = healthyAnswers();
delete noPromo["strategy/promotion"];
const noChannelAnalysis = normalizeAnalysis({ ...analysisRaw, acquisitionChannels: { value: null, status: "unknown" } })!;
noPromo[ANALYSIS_KEY] = { ...rec({}), analysis: noChannelAnalysis } as unknown as Record<string, unknown>;
const promoIssues = collectDeterministic({ answers: noPromo, business, evidence }).issues;
assert.ok(promoIssues.some((i) => i.category === "marketing"), "홍보 채널·예산 없음 → marketing warning");

/* 시장 근거 0건 */
const noEv = collectDeterministic({ answers: healthyAnswers(), business, evidence: [] }).issues;
assert.ok(noEv.some((i) => i.category === "market_evidence" && i.severity === "improvement"));

/* ═══════════ deterministic ↔ Reviewer 관계 ═══════════ */

const sections = [
  { key: "overview/summary", title: "사업 개요 · 한눈에 보기", markdown: "## 한눈에 보기\n반려견 보호자를 대상으로 한다. 수강료는 5만원이다." },
  { key: "financials/revenue", title: "재무 계획 · 매출", markdown: "## 매출\n월 40건을 목표로 한다." },
];
const prompt = buildReviewerPrompt({ planTitle: "멍케이크 클래스", planType: "창업 초기 · 사업계획서", business, sections, evidence, deterministic: c });

assert.ok(prompt.includes("[코드가 이미 확정한 문제 — 검증됨. 반박·중복 금지]"));
assert.ok(prompt.includes("한 건 팔수록 손해가 나는 가격 구조입니다"), "확정 문제가 프롬프트에 실린다");
assert.ok(prompt.includes("[계산된 재무 — 시스템이 사용자 입력에 산식을 적용한 값]"));
assert.ok(prompt.includes("[사용자가 제공한 사실 — 확정]"));
assert.ok(prompt.includes("[AI 추정 참고정보 — 사용자가 확인하지 않음]"));
assert.ok(prompt.includes("- 운영·delivery: 오프라인 대면"), "inferred 는 추정 블록에");
assert.ok(prompt.includes("[공식 시장 근거]") && prompt.includes("통계청"));
assert.ok(prompt.includes("[사업계획서 본문]") && prompt.includes("### overview/summary"));
assert.ok(prompt.includes("[사용자가 확인한 사업 지표 — 확정]") && prompt.includes("회당 정원"));

// 시스템 프롬프트 규칙
assert.ok(REVIEWER_SYSTEM.includes("사업 성공을 예측하는 것이 아니라"));
assert.ok(REVIEWER_SYSTEM.includes("만들어 문제를 해결하지 마세요"));
assert.ok(REVIEWER_SYSTEM.includes("재무 수치를 다시 계산하지 마세요"));
assert.ok(REVIEWER_SYSTEM.includes("반박하거나 '문제 없다'고 판단하지 마세요"));
assert.ok(REVIEWER_SYSTEM.includes("정부지원 선정 가능성·투자 성공률·대출 승인 가능성·사업 성공 확률이 아닙니다"));
assert.ok(REVIEWER_SYSTEM.includes("문제가 없으면 억지로 만들지 마세요"));
for (const dim of REVIEW_DIMENSIONS) assert.ok(REVIEWER_SYSTEM.includes(dim.id), `차원 ${dim.id} 가 프롬프트에 있다`);

/* ═══════════ LLM 출력 검증 (Case B·E·F·G·H 를 담은 응답) ═══════════ */

const llmOut = {
  overallQualityScore: 74.4,
  dimensions: [
    { id: "structure", score: 4, reason: "고객·문제·해결이 이어집니다." },
    { id: "market", score: 2, reason: "통계 해석이 과합니다." },
    { id: "differentiation", score: 2, reason: "차별점이 추상적입니다." },
    { id: "feasibility", score: 3, reason: "운영 계획이 일부만 있습니다." },
    { id: "finance", score: 3, reason: "계산은 있으나 근거가 얇습니다." },
    { id: "marketing", score: 1, reason: "채널과 고객이 어긋납니다." },
    { id: "trust", score: 2, reason: "근거 없는 숫자가 있습니다." },
    { id: "made_up_dimension", score: 5, reason: "목록 밖 차원" },
  ],
  issues: [
    { severity: "critical", category: "fact_safety", sectionKey: "financials/revenue", title: "근거 없는 고객 수", problem: "12개월 후 고객 300명을 확보한다고 단정합니다.", whyItMatters: "원천 자료에 없는 숫자입니다.", evidence: ["본문: 12개월 후 유료고객 300명"], recommendation: "목표라면 '목표'로 표시하고 근거를 적어 주세요.", requiresUserInput: true, autoFixable: false },
    { severity: "warning", category: "market_evidence", sectionKey: "market/segments", title: "통계를 고객 수로 확대", problem: "양육가구 552만을 잠재 고객 552만으로 옮겼습니다.", whyItMatters: "시장 환경 지표는 구매 고객이 아닙니다.", evidence: ["본문: 잠재 고객 552만 명"], recommendation: "참고지표임을 밝히고 실제 공략 범위를 따로 적어 주세요.", requiresUserInput: false, autoFixable: true },
    { severity: "warning", category: "marketing", sectionKey: "strategy/promotion", title: "고객과 채널이 어긋남", problem: "60대 오프라인 고객인데 틱톡 광고만 있습니다.", whyItMatters: "채널에 고객이 없으면 목표 판매량을 못 채웁니다.", evidence: ["고객: 60대", "채널: 틱톡"], recommendation: "고객이 실제로 있는 경로를 한 곳 정해 주세요.", requiresUserInput: true, autoFixable: false },
    { severity: "warning", category: "competition", title: "차별점이 추상적", problem: "'맞춤형 경험'만 적혀 있습니다.", whyItMatters: "경쟁 대안과 구분되지 않습니다.", evidence: ["본문: 맞춤형 경험"], recommendation: "비교 기준 2~3개를 정해 주세요.", requiresUserInput: true, autoFixable: false },
    { severity: "improvement", category: "writing", title: "같은 설명 반복", problem: "세 섹션에서 같은 문단이 반복됩니다.", whyItMatters: "읽는 사람이 새 정보를 못 얻습니다.", evidence: ["overview/summary", "market/products"], recommendation: "뒤 섹션에서는 관점만 바꿔 짧게 쓰세요.", requiresUserInput: false, autoFixable: true },
    { severity: "critical", category: "finance", sectionKey: "financials/revenue", title: "AI 가 본 재무 문제", problem: "코드가 이미 확정한 것과 같은 자리의 재무 문제입니다.", whyItMatters: "중복 표시는 사용자를 혼란스럽게 합니다.", evidence: [], recommendation: "중복이므로 병합에서 제거되어야 합니다.", requiresUserInput: false, autoFixable: false },
    { severity: "warning", category: "consistency", title: "AI 가 본 정합성", problem: "정합성은 코드가 판정하는 영역입니다.", whyItMatters: "AI 추측이 확정 판정과 섞이면 안 됩니다.", evidence: [], recommendation: "병합에서 제거되어야 합니다.", requiresUserInput: false, autoFixable: false },
    { severity: "warning", category: "customer", sectionKey: "없는/섹션", title: "모르는 섹션 키", problem: "존재하지 않는 섹션 키를 가리킵니다.", whyItMatters: "링크를 누르면 빈 화면으로 갑니다.", evidence: [], recommendation: "섹션 키를 떼고 보여 주어야 합니다.", requiresUserInput: false, autoFixable: false },
    // 형식이 어긋난 항목 — 이것만 버려지고 나머지는 살아야 한다
    { severity: "warning", category: "customer", title: "너무 짧은 설명", problem: "짧", whyItMatters: "짧", evidence: [], recommendation: "짧", requiresUserInput: false, autoFixable: false },
    { severity: "made_up", category: "customer", title: "없는 심각도", problem: "심각도 값이 목록 밖입니다.", whyItMatters: "타입이 깨집니다.", evidence: [], recommendation: "버려야 합니다.", requiresUserInput: false, autoFixable: false },
  ],
  strengths: ["수익모델이 명확합니다", "손익분기가 계산되어 있습니다"],
  topPriorities: ["근거 없는 고객 수부터 정리"],
  summary: "전반적으로 구조는 잡혀 있으나 근거가 얇습니다.",
};

const known = new Set(sections.map((s) => s.key));
const norm = normalizeReviewOutput(llmOut, known)!;
assert.ok(norm, "정상 출력은 통과");
assert.equal(norm.score, 74, "점수는 0~100 정수로 정리");
assert.equal(norm.dimensions.length, 7, "차원은 목록의 7개로 고정");
assert.ok(!norm.dimensions.some((x) => x.id === "made_up_dimension"), "목록 밖 차원은 버린다");
assert.equal(norm.dimensions.find((x) => x.id === "marketing")!.score, 1);
// Case B — 숫자 환각
const bIssue = norm.issues.find((i) => i.category === "fact_safety")!;
assert.ok(bIssue, "B. fact_safety issue");
assert.equal(bIssue.severity, "critical");
assert.equal(bIssue.origin, "ai");
// Case E — Evidence 과잉해석
assert.ok(norm.issues.some((i) => i.category === "market_evidence" && i.severity === "warning"), "E. market_evidence warning");
// Case F — 고객/마케팅 불일치
assert.ok(norm.issues.some((i) => i.category === "marketing" && i.severity === "warning"), "F. marketing warning");
// Case G — 정보 부족 → requiresUserInput
assert.ok(norm.issues.some((i) => i.requiresUserInput), "G. requiresUserInput issue 존재");
// Case H — 반복 문서
const hIssue = norm.issues.find((i) => i.category === "writing")!;
assert.equal(hIssue.severity, "improvement", "H. 반복은 improvement");
assert.equal(hIssue.autoFixable, true);
// 모르는 섹션 키는 링크로 만들지 않는다
assert.equal(norm.issues.find((i) => i.title === "모르는 섹션 키")!.sectionKey, undefined);
// 형식이 어긋난 항목만 버리고 나머지는 살린다 — 하나 때문에 보고서 전체를 잃지 않는다
assert.ok(!norm.issues.some((i) => i.title === "너무 짧은 설명"), "설명이 너무 짧은 항목은 버린다");
assert.ok(!norm.issues.some((i) => i.title === "없는 심각도"), "목록 밖 severity 는 버린다");
assert.equal(norm.issues.length, 8, "형식 맞는 8개는 모두 살아남는다");
assert.ok(REVIEWER_SYSTEM.includes("최대 8개까지만"), "항목 수 상한을 프롬프트가 명시");
assert.ok(REVIEWER_SYSTEM.includes("길게 쓰면 응답이 잘려"), "길이 초과가 검토 전체를 버린다는 경고");

/* 잘못된 출력은 통째로 버린다 */
assert.equal(normalizeReviewOutput(null, known), null);
assert.equal(normalizeReviewOutput({ overallQualityScore: 999 }, known), null);
assert.equal(normalizeReviewOutput({ ...llmOut, overallQualityScore: 140 }, known), null, "0~100 밖이면 실패");

/* ═══════════ 병합 — 확정 문제가 앞, AI 중복은 제거 ═══════════ */

const merged = mergeIssues(c.issues, norm.issues);
assert.equal(merged[0].origin, "deterministic", "확정 문제가 맨 앞");
assert.ok(merged.every((i, idx) => idx === 0 || severityRank(merged[idx - 1].severity) <= severityRank(i.severity)), "심각도 순 정렬");
assert.ok(!merged.some((i) => i.origin === "ai" && i.category === "consistency"), "정합성은 코드가 판정 — AI 중복 제거");
assert.ok(
  !merged.some((i) => i.origin === "ai" && i.category === "finance" && i.sectionKey === "financials/revenue"),
  "코드가 확정한 재무 문제와 같은 자리의 AI 문제는 중복 제거",
);
assert.ok(merged.some((i) => i.origin === "ai" && i.category === "fact_safety"), "겹치지 않는 AI 문제는 남는다");
function severityRank(s: string): number {
  return s === "critical" ? 0 : s === "warning" ? 1 : 2;
}

/* ═══════════ 저장 · 낡음 판정 ═══════════ */

const planSections = { "overview/summary": { markdown: "본문 A" }, "financials/revenue": { markdown: "본문 B" } };
const hash = contentHash(planSections);
assert.equal(hash, contentHash({ "financials/revenue": { markdown: "본문 B" }, "overview/summary": { markdown: "본문 A" } }), "키 순서가 달라도 같은 지문");
assert.notEqual(hash, contentHash({ ...planSections, "overview/summary": { markdown: "본문 A 수정" } }), "본문이 바뀌면 지문이 바뀐다");
assert.notEqual(hash, contentHash({ "overview/summary": { markdown: "본문 A" } }), "섹션이 늘거나 줄어도 바뀐다");

const record: ReviewRecord = { version: REVIEW_VERSION, reviewedAt: "2026-08-23T00:00:00Z", planId: "plan_1", contentHash: hash, result: fallbackReview(c.issues) };
const stored = { [REVIEW_KEY]: record as unknown as Record<string, unknown> };
assert.equal(readReview(stored, { id: "plan_1", sections: planSections }).status, "fresh");
assert.equal(readReview(stored, { id: "plan_1", sections: { ...planSections, "overview/summary": { markdown: "고침" } } }).status, "stale", "본문 수정 → stale");
assert.equal(readReview(stored, { id: "plan_2", sections: planSections }).status, "none", "다른 플랜으로 복사돼 오면 무효");
assert.equal(readReview({ [REVIEW_KEY]: { ...record, version: "old" } as never }, { id: "plan_1", sections: planSections }).status, "none");
assert.equal(readReview({}, { id: "plan_1", sections: planSections }).status, "none");

/* ═══════════ 폴백 — LLM 없이도 보고서가 나온다 ═══════════ */

void reviewPlan(null, { planTitle: "t", business, sections, evidence, deterministic: c }).then((fb) => {
  assert.equal(fb.source, "deterministic");
  assert.equal(fb.review.overallQualityScore, -1, "AI 없이 점수를 지어내지 않는다");
  assert.ok(fb.review.issues.length > 0 && fb.review.issues.every((i) => i.origin === "deterministic"));
  assert.equal(fb.review.dimensions.length, 0);
  assert.ok(fb.review.summary.includes("AI 검토를 완료하지 못해"));
});

/* ═══════════ 요약(digest) — 숫자·표·소제목이 남는다 ═══════════ */

const long = ["## 매출 구조", "가".repeat(2000), "| 항목 | 값 |", "| 판매가 | 50,000원 |", "손익분기는 월 16건이다.", "나".repeat(2000)].join("\n");
const dg = digestSection(long, 600);
assert.ok(dg.includes("## 매출 구조"), "소제목 유지");
assert.ok(dg.includes("| 판매가 | 50,000원 |"), "표 유지");
assert.ok(dg.includes("손익분기는 월 16건이다."), "숫자 문장 유지");
assert.ok(dg.length <= 700);

/* ═══════════ 정렬·집계 ═══════════ */
const mixed: ReviewIssue[] = [
  { id: "1", severity: "improvement", category: "writing", title: "a", problem: "", whyItMatters: "", evidence: [], recommendation: "", requiresUserInput: false, autoFixable: true, origin: "ai" },
  { id: "2", severity: "critical", category: "finance", title: "b", problem: "", whyItMatters: "", evidence: [], recommendation: "", requiresUserInput: false, autoFixable: false, origin: "ai" },
  { id: "3", severity: "critical", category: "operation", title: "c", problem: "", whyItMatters: "", evidence: [], recommendation: "", requiresUserInput: false, autoFixable: false, origin: "deterministic" },
];
assert.deepEqual(sortIssues(mixed).map((i) => i.id), ["3", "2", "1"]);
assert.deepEqual(countBySeverity(mixed), { critical: 2, warning: 0, improvement: 1 });

/* ═══════════ 회귀 — Reviewer 는 다른 시스템을 건드리지 않는다 ═══════════ */
const before = JSON.stringify(healthyAnswers());
collectDeterministic({ answers: healthyAnswers(), business, evidence });
assert.equal(JSON.stringify(healthyAnswers()), before, "검토는 답변을 변형하지 않는다(순수)");

/* ═══════════ 잘린 응답 복구 — 운영에서 두 번 겪은 실패 ═══════════ */

const fullJson = JSON.stringify({
  overallQualityScore: 70,
  summary: "요약입니다.",
  dimensions: [{ id: "structure", score: 4, reason: "좋습니다" }],
  issues: [
    { severity: "critical", category: "finance", title: "첫 번째 문제", problem: "첫 번째 문제의 설명입니다.", whyItMatters: "중요한 이유입니다.", evidence: ["근거"], recommendation: "이렇게 고치세요.", requiresUserInput: true, autoFixable: false },
    { severity: "warning", category: "marketing", title: "두 번째 문제", problem: "두 번째 문제의 설명입니다.", whyItMatters: "중요한 이유입니다.", evidence: ["근거"], recommendation: "이렇게 고치세요.", requiresUserInput: false, autoFixable: true },
    { severity: "improvement", category: "writing", title: "세 번째 문제", problem: "세 번째 문제의 설명입니다.", whyItMatters: "중요한 이유입니다.", evidence: ["근거"], recommendation: "이렇게 고치세요.", requiresUserInput: false, autoFixable: true },
  ],
});
// 세 번째 문제 한가운데서 잘린 응답
const truncated = fullJson.slice(0, fullJson.indexOf("세 번째 문제의 설명") + 5);
assert.equal(JSON.parse.bind(null, truncated) instanceof Function, true);
let parseFailed = false;
try { JSON.parse(truncated); } catch { parseFailed = true; }
assert.ok(parseFailed, "잘린 응답은 그대로는 파싱되지 않는다");

const salvaged = salvageTruncatedJson(truncated)!;
assert.ok(salvaged, "잘린 응답에서 완결된 부분을 복구한다");
const salvagedNorm = normalizeReviewOutput(salvaged, new Set(["overview/summary"]))!;
assert.ok(salvagedNorm, "복구본이 검증을 통과한다");
assert.equal(salvagedNorm.issues.length, 2, "완결된 문제 2건은 살리고 잘린 1건만 버린다");
assert.equal(salvagedNorm.issues[0].title, "첫 번째 문제");
assert.equal(salvagedNorm.score, 70);
// 복구 불가한 쓰레기는 null
assert.equal(salvageTruncatedJson("완전히 깨진 응답"), null);
assert.equal(salvageTruncatedJson(""), null);
// 멀쩡한 JSON 은 정상 경로가 처리한다(복구를 타지 않는다)
assert.ok(normalizeReviewOutput(JSON.parse(fullJson), new Set()));

/* 요약이 길어도 버리지 않고 자른다 */
const longSummary = normalizeReviewOutput({ overallQualityScore: 50, summary: "가".repeat(2000), issues: [], dimensions: [] }, new Set())!;
assert.ok(longSummary, "긴 요약 때문에 보고서를 버리지 않는다");
assert.ok(longSummary.summary.length <= 600);
assert.ok(normalizeReviewOutput({ overallQualityScore: 50, summary: "짧음", strengths: Array.from({ length: 20 }, (_, i) => `강점${i}`) }, new Set())!.strengths.length <= 6);

console.log("plan-review.test.ts (복구 포함): 전부 통과");
