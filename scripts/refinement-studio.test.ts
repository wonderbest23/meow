import assert from "node:assert/strict";
import { emptyBusinessSetup, type BusinessArchetype } from "../lib/business/domain";
import { calculateFinancialAnalysis } from "../lib/business/financial-engine";
import type { DraftRefinementInput } from "../lib/draft-package/domain";
import {
  appendRefinementVersion,
  applyRefinementToBusinessSetup,
  refinementChanges,
} from "../lib/refinement/domain";

const scenarios: Array<{
  name: string;
  archetype: BusinessArchetype;
  input: DraftRefinementInput;
}> = [
  {
    name: "온라인 사업",
    archetype: "digital_service",
    input: {
      brandName: "작게시작",
      customer: "퇴근 후 처음 온라인 사업을 준비하는 직장인",
      oneLiner: "아이디어를 실제 판매 가능한 첫 상품으로 정리해주는 온라인 서비스",
      priceWon: 290_000,
      variableCostPerUnit: 48_000,
      monthlyFixedCostWon: 820_000,
      targetMonthlyUnits: 12,
      region: "전국·온라인",
      note: "쉬운 한국어로 작성",
    },
  },
  {
    name: "온라인 판매",
    archetype: "ecommerce",
    input: {
      brandName: "하루정돈",
      customer: "작은 집에서 수납 문제를 겪는 1인 가구",
      oneLiner: "좁은 공간에 꼭 맞는 수납 묶음을 정기 배송하는 온라인 상점",
      priceWon: 49_000,
      variableCostPerUnit: 24_000,
      monthlyFixedCostWon: 1_450_000,
      targetMonthlyUnits: 120,
      region: "전국·온라인",
      note: "",
    },
  },
  {
    name: "지역 매장",
    archetype: "local_retail",
    input: {
      brandName: "우리동네 반찬실",
      customer: "평일 저녁 식사를 빠르게 준비해야 하는 맞벌이 가정",
      oneLiner: "오늘 먹을 반찬을 필요한 만큼 예약하고 찾아가는 동네 반찬 매장",
      priceWon: 28_000,
      variableCostPerUnit: 11_000,
      monthlyFixedCostWon: 4_200_000,
      targetMonthlyUnits: 320,
      region: "서울 마포구",
      note: "",
    },
  },
];

for (const scenario of scenarios) {
  const setup = applyRefinementToBusinessSetup(emptyBusinessSetup(scenario.archetype), scenario.input);
  const analysis = calculateFinancialAnalysis(setup.financial);
  assert.equal(setup.region, scenario.input.region, `${scenario.name}: 지역 반영`);
  assert.equal(setup.financial.sellingPrice, scenario.input.priceWon, `${scenario.name}: 가격 반영`);
  assert.equal(setup.financial.targetMonthlyUnits, scenario.input.targetMonthlyUnits, `${scenario.name}: 판매량 반영`);
  assert.ok(Math.abs(analysis.variableCostPerUnit - scenario.input.variableCostPerUnit) <= 5, `${scenario.name}: 변동비 합계 반영`);
  assert.ok(Math.abs(analysis.monthlyFixedCost - scenario.input.monthlyFixedCostWon) <= 5, `${scenario.name}: 고정비 합계 반영`);
}

const first = scenarios[0].input;
const revised = { ...first, priceWon: 340_000, customer: "처음 유료 고객을 만들려는 1인 창업자" };
const changes = refinementChanges(first, revised);
assert.deepEqual(changes.map((item) => item.label), ["주요 고객", "첫 상품 가격"]);
const history = appendRefinementVersion([], first, revised, "draft-test", "edit", "2026-07-15T00:00:00.000Z");
assert.equal(history.length, 2);
assert.equal(history[0].label, "처음 완성본");
assert.equal(history[1].status, "processing");
assert.equal(history[1].changes.length, 2);

console.log("refinement studio: 3 business scenarios and version history passed");
