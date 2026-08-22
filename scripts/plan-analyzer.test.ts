import assert from "node:assert/strict";
import { normalizeAnalysis, readAnalysisRecord, ANALYSIS_KEY, type BusinessAnalysis, type AnalysisRecord } from "../lib/plan-builder/analyzer/domain";
import { PACKS, packForAnalysis, slotsForPack, CORE_SLOTS } from "../lib/plan-builder/analyzer/packs";
import { analyzeGaps, pickRoundSlots, shouldContinue, applySlotAnswer, applyAnalysisToAnswers, numericSlots, MAX_PER_ROUND, MAX_ROUNDS } from "../lib/plan-builder/analyzer/gap";
import { defaultQuestions, generateQuestions } from "../lib/plan-builder/analyzer/question-generator";
import { ANALYZER_SYSTEM, analyzerUserPrompt } from "../lib/plan-builder/analyzer/business-analyzer";
import { collectFinancialInputs, calculateFinancials } from "../lib/plan-builder/financials";
import { findConsistencyIssues } from "../lib/plan-builder/consistency";
import { planResearchContext } from "../lib/plan-builder/market-research";
import { parseJsonObject } from "../lib/llm/complete";
import { PLAN_BLUEPRINT } from "../lib/plan-builder/blueprint";

/* ───────── A. Analyzer 출력 검증 ───────── */

const rawGood = {
  primary: { value: "교육·강의", status: "inferred", confidence: 0.9 },
  modelTags: { value: ["class", "newAmazingTag"], status: "confirmed" },
  operationTags: { value: ["offline", "pet", "content_led", "bogus"], status: "inferred" },
  customer: { value: "반려견 보호자", status: "inferred" },
  problem: { value: null, status: "unknown" },
  solution: { value: "반려견 케이크 원데이 클래스", status: "confirmed" },
  revenueModel: { value: "수강료", status: "inferred" },
  deliveryModel: { value: "오프라인 대면", status: "inferred" },
  acquisitionChannels: { value: ["인스타그램", "유튜브 숏폼"], status: "confirmed" },
  keyCosts: { value: ["공간 대관", "재료비"], status: "inferred" },
  stage: { value: "아이디어 단계", status: "inferred" },
  region: { value: null, status: "unknown" },
  gapHints: [{ slot: "classPrice", why: "수강료가 없으면 매출을 계산할 수 없어요" }],
  summaryForUser: "반려견 보호자를 대상으로 원데이 클래스를 운영하는 사업으로 이해했어요.",
};

const an = normalizeAnalysis(rawGood);
assert.ok(an, "정상 출력은 통과");
// 직접 언급 → confirmed / 추론 → inferred / 없는 숫자·정보 → unknown
assert.equal(an.solution.status, "confirmed");
assert.equal(an.customer.status, "inferred");
assert.equal(an.problem.status, "unknown");
assert.equal(an.problem.value, null);
// 화이트리스트 밖 태그 폐기
assert.deepEqual(an.modelTags.value, ["class"]);
assert.deepEqual(an.operationTags.value, ["offline", "pet", "content_led"]);
// 업종은 9종 밖이면 기타
assert.equal(normalizeAnalysis({ ...rawGood, primary: { value: "우주산업", status: "inferred" } })!.primary.value, "기타");
// status 가 이상하면 inferred 로 강등 (confirmed 로 승격되는 일은 없다)
assert.equal(normalizeAnalysis({ ...rawGood, customer: { value: "x", status: "definitely" } })!.customer.status, "inferred");
// malformed → null (호출부 폴백)
assert.equal(normalizeAnalysis(null), null);
assert.equal(normalizeAnalysis("string"), null);
assert.equal(normalizeAnalysis({ ...rawGood, summaryForUser: "" }), null, "요약 없으면 실패");
assert.equal(parseJsonObject("{ not json"), null);
assert.ok(parseJsonObject("```json\n{\"a\":1}\n```"));
// 프롬프트에 태그 사전·슬롯 목록·status 규칙이 들어 있다
assert.ok(ANALYZER_SYSTEM.includes("class(수업·클래스)"));
assert.ok(ANALYZER_SYSTEM.includes("classPrice(1인 수강료)"));
assert.ok(ANALYZER_SYSTEM.includes("절대 만들지 마세요"));
assert.ok(analyzerUserPrompt({ description: "강아지 케이크 클래스", industry: "교육·강의" }).includes("업종(사용자 선택): 교육·강의"));

/* ───────── B. VERIFY — 저장 레코드 읽기 ───────── */

const rec0: AnalysisRecord = { analysis: an, slots: {}, rounds: 0, finished: false, analyzedAt: "2026-08-22T00:00:00Z" };
const read = readAnalysisRecord({ [ANALYSIS_KEY]: rec0 as unknown as Record<string, unknown> });
assert.ok(read);
assert.equal(read.analysis.customer.status, "inferred", "미확인 → inferred 유지");
assert.equal(readAnalysisRecord({}), null);
assert.equal(readAnalysisRecord({ [ANALYSIS_KEY]: { analysis: { garbage: 1 } } }), null, "손상 레코드는 null");
assert.equal(readAnalysisRecord({ [ANALYSIS_KEY]: { ...rec0, rounds: 99 } })!.rounds, MAX_ROUNDS, "라운드 상한");

// 맞아요 → confirmed, 수정 → confirmed + 새 값 (화면 로직과 같은 변환)
const confirmedAn: BusinessAnalysis = {
  ...an,
  customer: { ...an.customer, status: "confirmed" },
  deliveryModel: { value: "오프라인 · 예약제", status: "confirmed" },
  revenueModel: { ...an.revenueModel, status: "confirmed" },
};
assert.equal(confirmedAn.customer.value, "반려견 보호자");

/* ───────── C. confirmed 만 기존 답변 칸으로 ───────── */

const fromInferred = applyAnalysisToAnswers({}, an);
assert.equal(fromInferred["market/segments"]?.first_target, undefined, "inferred 고객은 답변 칸에 쓰지 않는다");
assert.deepEqual(fromInferred["overview/problem"]?.solutions, ["반려견 케이크 원데이 클래스"], "confirmed 해결책은 쓴다");
assert.deepEqual(fromInferred["financials/revenue"]?.revenue_streams, ["시간·건당 요금"], "class 태그 → 수익 방식 라벨");
assert.deepEqual(fromInferred["strategy/promotion"]?.promo_channels, ["인스타그램", "유튜브·숏폼"], "채널은 기존 선택지로 매핑");
const fromConfirmed = applyAnalysisToAnswers({ "market/segments": { first_target: "이미 적은 값" } }, confirmedAn);
assert.equal(fromConfirmed["market/segments"].first_target, "이미 적은 값", "기존 답은 덮지 않는다");
assert.equal(applyAnalysisToAnswers({}, confirmedAn)["market/segments"]?.first_target, "반려견 보호자");

/* ───────── D. 팩 선택 · 슬롯 화이트리스트 ───────── */

assert.equal(packForAnalysis(an).id, "class");
assert.equal(packForAnalysis({ primary: { value: "온라인 쇼핑몰", status: "confirmed" }, modelTags: { value: ["commerce"], status: "confirmed" } }).id, "commerce");
assert.equal(packForAnalysis({ primary: { value: "카페·음식점", status: "confirmed" }, modelTags: { value: ["seat"], status: "inferred" } }).id, "unit_sale", "그 외는 unit_sale 폴백");
assert.equal(packForAnalysis({ primary: { value: "IT·앱·웹", status: "confirmed" }, modelTags: { value: null, status: "unknown" } }).id, "unit_sale");
for (const p of Object.values(PACKS)) {
  const ids = slotsForPack(p).map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `${p.id} 슬롯 id 유일`);
}
assert.ok(CORE_SLOTS.some((s) => s.id === "customer"));

/* ───────── E. Gap Analyzer ───────── */

const rep1 = analyzeGaps({ analysis: confirmedAn, slots: {} }, {});
assert.equal(rep1.pack.id, "class");
// confirmed 축(customer/solution)은 gap 이 아니다. problem 은 unknown 이라 gap.
assert.ok(!rep1.gaps.some((g) => g.slot === "customer"));
assert.ok(!rep1.gaps.some((g) => g.slot === "solution"));
assert.ok(rep1.gaps.some((g) => g.slot === "problem"));
// blocking 우선
const firstImportantIdx = rep1.gaps.findIndex((g) => g.grade === "important");
const lastBlockingIdx = rep1.gaps.map((g) => g.grade).lastIndexOf("blocking");
assert.ok(firstImportantIdx === -1 || lastBlockingIdx < firstImportantIdx, "blocking 이 important 앞");
// gapHints 의 why 가 쓰인다
assert.equal(rep1.gaps.find((g) => g.slot === "classPrice")!.why, "수강료가 없으면 매출을 계산할 수 없어요");
// 최대 4개
const round1 = pickRoundSlots(rep1);
assert.equal(round1.length, MAX_PER_ROUND);
assert.ok(round1.every((s) => s.grade === "blocking"));
assert.ok(rep1.completeness < 0.85 && !rep1.canFinish);
assert.ok(shouldContinue({ rounds: 0, finished: false }, rep1));

// 이미 위저드에서 답한 슬롯(mapsTo 칸)은 다시 묻지 않는다
const repPre = analyzeGaps({ analysis: confirmedAn, slots: {} }, { "financials/revenue": { unit_price: "5만원" } });
assert.ok(!repPre.gaps.some((g) => g.slot === "classPrice"), "unit_price 가 있으면 classPrice 안 묻는다");

// "아직 모르겠어요" → 다시 묻지 않지만 충족도 아니다
const repUnk = analyzeGaps({ analysis: confirmedAn, slots: { classPrice: { value: null, status: "unknown" } } }, {});
assert.ok(!repUnk.gaps.some((g) => g.slot === "classPrice"));
assert.equal(repUnk.completeness, rep1.completeness, "unknown 은 충족률을 올리지 않는다");

// 다 채우면 종료
const fullSlots = Object.fromEntries(
  slotsForPack(PACKS.class).map((s) => [s.id, { value: s.input.kind === "single" ? s.input.options[0] : "5만원", status: "confirmed" as const }]),
);
const repFull = analyzeGaps({ analysis: confirmedAn, slots: fullSlots }, {});
assert.equal(repFull.completeness, 1);
assert.ok(repFull.canFinish);
assert.ok(!shouldContinue({ rounds: 1, finished: false }, repFull));
// 최대 2라운드
assert.ok(!shouldContinue({ rounds: MAX_ROUNDS, finished: false }, rep1));
assert.ok(!shouldContinue({ rounds: 0, finished: true }, rep1));

/* ───────── F. 동적 질문 → mapsTo 저장 ───────── */

let ans: Record<string, Record<string, unknown>> = {};
ans = applySlotAnswer(ans, PACKS.class, "classPrice", "5만원");
assert.equal(ans["financials/revenue"].unit_price, "5만원", "classPrice → unit_price");
assert.equal(ans["market/products"].has_price, "yes", "게이트도 켠다");
ans = applySlotAnswer(ans, PACKS.class, "materialCost", "1만5천원");
assert.equal(ans["financials/expenses"].variable_per_unit, "1만5천원");
ans = applySlotAnswer(ans, PACKS.class, "venueCost", "월 60만원");
assert.equal(ans["financials/expenses"].fixed_total, "월 60만원");
assert.deepEqual(ans["financials/expenses"].fixed_items, ["임대료"]);
// 등록되지 않은 슬롯은 폐기
const before = JSON.stringify(ans);
ans = applySlotAnswer(ans, PACKS.class, "newAmazingBusinessMetric", "999");
assert.equal(JSON.stringify(ans), before);
// 모르겠어요(null) 는 기존 칸을 건드리지 않는다
ans = applySlotAnswer(ans, PACKS.class, "seatsPerClass", null);
assert.equal(ans["financials/revenue"].monthly_volume, undefined);
// 기존 답은 덮지 않는다
const keep = applySlotAnswer({ "financials/revenue": { unit_price: "3만원" } }, PACKS.class, "classPrice", "9만원");
assert.equal(keep["financials/revenue"].unit_price, "3만원");
// multi 칸에는 배열로
const ch = applySlotAnswer({}, PACKS.unit_sale, "salesChannel", "오픈마켓·플랫폼");
assert.deepEqual(ch["strategy/distribution"].channels, ["오픈마켓·플랫폼"]);
// problem → problems(multi)
const pr = applySlotAnswer({}, PACKS.class, "problem", "만드는 법을 몰라요");
assert.deepEqual(pr["overview/problem"].problems, ["만드는 법을 몰라요"]);

/* ───────── G. 기존 재무 엔진이 값을 읽는다 (financials.ts 무수정) ───────── */

const fin = collectFinancialInputs(ans);
assert.equal(fin.inputs.unitPrice, 50_000);
assert.equal(fin.inputs.unitVariableCost, 15_000);
assert.equal(fin.inputs.monthlyFixedCost, 600_000);

// 파생 판매량 — 산식이 보이고, 확정 전에는 저장되지 않는다
const nums = numericSlots({
  seatsPerClass: { value: "6명", status: "confirmed" },
  classesPerMonth: { value: "8회", status: "confirmed" },
  occupancyRate: { value: "80%", status: "confirmed" },
  classPrice: { value: null, status: "unknown" },
});
assert.equal(nums.seatsPerClass, 6);
assert.equal(nums.occupancyRate, 80);
assert.equal(nums.classPrice, undefined);
const d = PACKS.class.deriveVolume!(nums)!;
assert.equal(d.value, 38);
assert.ok(d.formula.includes("정원 6명 × 월 8회 × 참석률 80%"));
assert.equal(PACKS.class.deriveVolume!({ seatsPerClass: 6 }), null, "횟수 없으면 계산 안 함");
assert.equal(PACKS.commerce.deriveVolume!(numericSlots({ monthlyVisitors: { value: "2,000명", status: "confirmed" }, conversionRate: { value: "2명 (2%)", status: "confirmed" } }))!.value, 40);
assert.equal(ans["financials/revenue"].monthly_volume, undefined, "파생값은 자동 저장되지 않는다");
// 확정 후 재무 계산 전체가 돈다
const withVol = { ...ans, "financials/revenue": { ...ans["financials/revenue"], monthly_volume: "월 38건" } };
const calc = calculateFinancials(collectFinancialInputs(withVol).inputs);
assert.equal(calc.monthly[0]?.revenue, 50_000 * 38, "첫 달 매출 = 단가 × 파생 판매량");
assert.ok(calc.unit && calc.breakEven, "단위 경제·손익분기 계산됨");
// 정합성 검사가 그대로 돈다 (예외 없음)
assert.ok(Array.isArray(findConsistencyIssues(withVol, { stage: "" })));

/* ───────── H. 질문 생성 — 폴백·화이트리스트 ───────── */

const slots4 = pickRoundSlots(rep1);
const dq = defaultQuestions(slots4);
assert.equal(dq.length, 4);
assert.ok(dq.every((q) => q.allowUnknown && q.q.length > 5));
// config 없으면 LLM 없이 기본 문장
void generateQuestions(null, confirmedAn, slots4, 1).then((gen) => {
  assert.equal(gen.source, "fallback");
  assert.deepEqual(gen.questions.map((q) => q.id), slots4.map((s) => s.id));
});

/* ───────── I. 시장조사 맥락 — confirmed 우선, inferred 무시, 없으면 현행 동일 ───────── */

const planNo = { title: "t", answers: { "market/segments": { first_target: "위저드 고객" } } };
const biz = { name: "", description: "d", industry: "교육·강의", region: "서울" };
assert.equal(planResearchContext(planNo, biz).customer, "위저드 고객");
assert.equal(planResearchContext(planNo, biz).sector, "교육·강의", "분석 없으면 업종 그대로");
const planInf = { title: "t", answers: { ...planNo.answers, [ANALYSIS_KEY]: rec0 as unknown as Record<string, unknown> } };
assert.equal(planResearchContext(planInf, biz).customer, "위저드 고객", "inferred 고객은 쓰지 않는다");
assert.equal(planResearchContext(planInf, biz).model, "반려견 케이크 원데이 클래스", "confirmed 해결책은 model 로");
const planConf = { title: "t", answers: { ...planNo.answers, [ANALYSIS_KEY]: { ...rec0, analysis: confirmedAn } as unknown as Record<string, unknown> } as Record<string, Record<string, unknown>> };
assert.equal(planResearchContext(planConf, biz).customer, "반려견 보호자", "confirmed 고객이 우선");
assert.ok((planResearchContext(planConf, biz).sector ?? "").startsWith("교육·강의 · 수업·클래스"), "confirmed 태그가 업종 뒤에 붙는다");

/* ───────── J. 회귀 — __analysis 는 진행률·답변 수에 영향을 주지 않아야 한다 ───────── */

assert.ok(!PLAN_BLUEPRINT.some((c) => c.sections.some((s) => `${c.id}/${s.id}` === ANALYSIS_KEY)), "가상 키는 blueprint 에 없다");

console.log("plan-analyzer.test.ts: 전부 통과");
