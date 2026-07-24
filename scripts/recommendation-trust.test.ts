import assert from "node:assert/strict";
import { inferProfileFromNarrative } from "../lib/assessment";
import { generateOpportunityPool, normalizeGeneratedOpportunity } from "../lib/idea-generator";
import { calculateProfile } from "../lib/assessment";
import { rankOpportunities } from "../lib/opportunity-engine";

const positive = inferProfileFromNarrative([
  "분석과 데이터 연구를 좋아하고 고객 인터뷰와 자동화 플랫폼 사업을 하고 싶습니다.",
]);
const negative = inferProfileFromNarrative([
  "분석과 데이터 연구를 싫어하고 고객 인터뷰와 자동화 플랫폼 사업은 절대 하고 싶지 않습니다.",
]);

assert.notDeepEqual(positive.profile, negative.profile, "부정 표현이 긍정 신호와 동일하게 처리되면 안 됩니다.");
assert.ok(positive.profile.riasec.I > negative.profile.riasec.I);

const naturalKoreanNumbers = inferProfileFromNarrative([
  "작은 가게를 도와 고객이 쉽게 주문하도록 정리한 경험이 있습니다.",
  "혼자 시작한 분들이 가격과 홍보 방법을 몰라 어려워하는 점이 신경 쓰입니다.",
  "사람들의 말을 듣고 복잡한 일을 순서대로 정리하는 역할이 자연스럽습니다.",
  "시작 예산은 삼백만원이고 하루 세 시간 정도 사용할 수 있습니다.",
]);
assert.equal(naturalKoreanNumbers.budget, "약 300만원");
assert.equal(naturalKoreanNumbers.availableTime, "하루 또는 주당 3시간");

const particleWithoutAmount = inferProfileFromNarrative([
  "재고가 많은 사업은 피하고 싶고 시작 예산이 적어요.",
]);
assert.equal(particleWithoutAmount.budget, "예산 정보가 명확하지 않음");

const particleWithAmount = inferProfileFromNarrative([
  "재고 없이 온라인으로 시작하고 예산이 약 200만원 정도 있습니다.",
]);
assert.equal(particleWithAmount.budget, "약 200만원");

const structuredPlanning = inferProfileFromNarrative(
  ["예산은 잘 모르겠지만 온라인으로 작게 시작하고 싶습니다."],
  { budgetWon: 3_500_000, availableHoursPerWeek: 12 },
);
assert.equal(structuredPlanning.budget, "약 350만원");
assert.equal(structuredPlanning.budgetWon, 3_500_000);
assert.equal(structuredPlanning.availableTime, "주당 12시간");
assert.equal(structuredPlanning.availableHoursPerWeek, 12);

const pool = generateOpportunityPool(1);
assert.ok(pool.length > 0);
assert.ok(pool.every((item) => item.market === 0 && item.novelty === 0));
assert.ok(pool.every((item) => item.evidenceStatus === "hypothesis"));
const broadPool = generateOpportunityPool(1, undefined, 200);
assert.ok(
  broadPool.every((item) => item.title.length <= 18),
  "추천명은 카드에서 한눈에 읽을 수 있는 길이여야 합니다.",
);
assert.ok(
  broadPool.every((item) => !/(연결망|실험실|가맹모델|코파일럿|큐레이션|내비게이터|리디자인)/.test(item.title)),
  "추천명에는 초보자가 뜻을 짐작하기 어려운 기획 용어를 쓰지 않습니다.",
);
const freelancerGroupBuy = broadPool.find((item) => item.id === "generated-7-2");
assert.equal(freelancerGroupBuy?.title, "프리랜서 고정비 절약 공동구매");
assert.ok(freelancerGroupBuy?.oneLiner.includes("사업입니다."));

const normalizedSavedOpportunity = normalizeGeneratedOpportunity({
  ...(freelancerGroupBuy ?? pool[0]),
  id: "generated-7-2",
  title: "프리랜서의 불규칙한 현금흐름 공동구매 연결망",
});
assert.equal(
  normalizedSavedOpportunity.title,
  "프리랜서 고정비 절약 공동구매",
  "예전에 저장한 추천도 다시 열면 쉬운 이름으로 보여야 합니다.",
);

const samePoolDifferentOrder = generateOpportunityPool(7919);
const firstPoolByTitle = new Map(pool.map((item) => [item.title, item.id]));
const repeatedOpportunities = samePoolDifferentOrder.filter((item) => firstPoolByTitle.has(item.title));
assert.ok(repeatedOpportunities.length > 0);
assert.ok(
  repeatedOpportunities.every((item) => firstPoolByTitle.get(item.title) === item.id),
  "같은 사업 조합은 재추천 순서와 관계없이 고정 ID를 유지해야 합니다.",
);
assert.ok(pool.every((item) => /^generated-\d+-\d+$/.test(item.id)));

const recommendationProfile = calculateProfile({});
const savedOpportunity = pool[0];
const baselineRanked = rankOpportunities(recommendationProfile, {}, {}, 1);
const rankedWithPreference = rankOpportunities(
  recommendationProfile,
  { [savedOpportunity.id]: "saved" },
  {},
  1,
  undefined,
  [{ state: "saved", opportunity: savedOpportunity }],
);
assert.ok(
  rankedWithPreference.find((item) => item.id === savedOpportunity.id),
  "저장한 사업은 추천 목록에서 유지되어야 합니다.",
);
assert.equal(
  rankedWithPreference[0].id,
  savedOpportunity.id,
  "저장한 사업은 다시 찾기 쉽도록 추천 목록 상단에 유지되어야 합니다.",
);
const baselineMatchById = new Map(baselineRanked.map((item) => [item.id, item.match]));
assert.ok(
  rankedWithPreference.some(
    (item) =>
      item.id !== savedOpportunity.id &&
      item.match > (baselineMatchById.get(item.id) ?? item.match),
  ),
  "저장한 사업과 비슷한 성향의 사업도 추천 점수에 반영되어야 합니다.",
);

const rankedWithoutExcluded = rankOpportunities(
  recommendationProfile,
  { [savedOpportunity.id]: "excluded" },
  {},
  1,
  undefined,
  [{ state: "excluded", opportunity: savedOpportunity }],
);
assert.equal(
  rankedWithoutExcluded.some((item) => item.id === savedOpportunity.id),
  false,
  "관심 없음으로 지정한 사업은 다음 추천에서 제외되어야 합니다.",
);

console.log("recommendation-trust.test.ts passed");
