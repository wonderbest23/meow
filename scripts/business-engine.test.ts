import assert from "node:assert/strict";
import { emptyBusinessSetup } from "../lib/business/domain";
import { calculateFinancialAnalysis } from "../lib/business/financial-engine";
import { assessBusinessSetup } from "../lib/business/korea-rules";
import { inferBusinessArchetype } from "../lib/business/router";

const ecommerce = emptyBusinessSetup("ecommerce");
ecommerce.financial.sellingPrice = 39_000;
ecommerce.financial.targetMonthlyUnits = 100;
ecommerce.financial.monthlyFixed.rent = 500_000;

const analysis = calculateFinancialAnalysis(ecommerce.financial);
assert.ok(analysis.netPrice < analysis.grossPrice, "VAT 포함 판매가는 공급가액이 더 작아야 합니다.");
assert.ok(analysis.variableCostPerUnit > 0, "이커머스 건당 변동비가 계산되어야 합니다.");
assert.ok(analysis.contributionPerUnit > 0, "기본 이커머스 모델은 양의 공헌이익이어야 합니다.");
assert.equal(
  analysis.breakEvenUnits,
  Math.ceil(analysis.monthlyFixedCost / analysis.contributionPerUnit),
  "BEP 수량은 고정비÷단위 공헌이익이어야 합니다.",
);
assert.equal(analysis.scenarios.length, 3, "보수·기준·공격 시나리오가 필요합니다.");

const lossMaking = structuredClone(ecommerce.financial);
lossMaking.unitVariable.materialsOrPurchase = 50_000;
const lossAnalysis = calculateFinancialAnalysis(lossMaking);
assert.equal(lossAnalysis.breakEvenUnits, null, "공헌이익이 음수이면 BEP를 계산하면 안 됩니다.");
assert.ok(lossAnalysis.warnings.some((warning) => warning.includes("판매할수록 손실")));

ecommerce.onlineSales = true;
ecommerce.handlesPersonalData = true;
const ecommerceAssessment = assessBusinessSetup(ecommerce);
assert.ok(ecommerceAssessment.requirements.some((item) => item.id === "mail-order-sales"));
assert.ok(ecommerceAssessment.requirements.some((item) => item.id === "privacy-policy"));
assert.ok(ecommerceAssessment.requirements.some((item) => item.id === "business-registration"));

const foodStore = emptyBusinessSetup("regulated");
foodStore.workplaceType = "commercial_lease";
foodStore.sectorKeywords = ["카페", "식품"];
const foodAssessment = assessBusinessSetup(foodStore);
assert.ok(foodAssessment.hardBlockCount > 0, "식품 업종은 영업신고 확인 전 진행 차단이 필요합니다.");
assert.ok(foodAssessment.requirements.some((item) => item.id === "building-use-check"));
assert.ok(foodAssessment.requirements.some((item) => item.id === "food-permit"));

assert.equal(
  inferBusinessArchetype({ model: "B2B SaaS", sector: "소상공인·운영", regulation: 20 }),
  "digital_service",
);
assert.equal(
  inferBusinessArchetype({ model: "팝업 커머스", sector: "로컬·관광", regulation: 20 }),
  "ecommerce",
);
assert.equal(
  inferBusinessArchetype({ model: "상담 서비스", sector: "약국·돌봄", regulation: 78 }),
  "regulated",
);
assert.equal(
  inferBusinessArchetype({ model: "온라인 서비스", oneLiner: "혼자 운영하는 미용실의 예약 문의를 자동으로 정리합니다.", regulation: 20 }),
  "digital_service",
  "규제 업종 고객을 돕는 업무 도구는 실제 제공 방식에 따라 온라인 서비스로 분류해야 합니다.",
);

console.log(JSON.stringify({
  passed: 13,
  sample: {
    monthlyFixedCost: analysis.monthlyFixedCost,
    contributionPerUnit: analysis.contributionPerUnit,
    breakEvenUnits: analysis.breakEvenUnits,
    totalFundingNeed: analysis.totalFundingNeed,
    ecommerceRequirements: ecommerceAssessment.requirements.length,
    regulatedHardBlocks: foodAssessment.hardBlockCount,
  },
}, null, 2));
