import assert from "node:assert/strict";
import { inferProfileFromNarrative } from "../lib/assessment";
import { generateOpportunityPool } from "../lib/idea-generator";

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

console.log("recommendation-trust.test.ts passed");
