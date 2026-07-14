import type {
  FinancialAnalysis,
  FinancialInput,
  FinancialScenario,
} from "./domain";

function sum(values: Record<string, number>) {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function safeRound(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

export function calculateFinancialAnalysis(input: FinancialInput): FinancialAnalysis {
  const grossPrice = input.sellingPrice;
  const netPrice =
    input.vatTaxable && input.priceIncludesVat ? grossPrice / 1.1 : grossPrice;
  const vatPerUnit = input.vatTaxable && input.priceIncludesVat ? grossPrice - netPrice : 0;
  const variable = input.unitVariable;
  const percentageCost =
    grossPrice *
    ((variable.pgFeeRate + variable.platformFeeRate + variable.returnAndWasteRate) / 100);
  const variableCostPerUnit =
    variable.materialsOrPurchase +
    variable.packaging +
    variable.shipping +
    variable.laborPerUnit +
    variable.otherPerUnit +
    percentageCost;
  const contributionPerUnit = netPrice - variableCostPerUnit;
  const contributionMarginRate = netPrice > 0 ? (contributionPerUnit / netPrice) * 100 : 0;

  const fixed = input.monthlyFixed;
  const employerInsurance = fixed.payrollGross * (fixed.employerInsuranceRate / 100);
  const monthlyFixedCost =
    fixed.rent +
    fixed.maintenance +
    fixed.payrollGross +
    employerInsurance +
    fixed.accounting +
    fixed.software +
    fixed.utilitiesAndTelecom +
    fixed.businessInsurance +
    fixed.fixedMarketing +
    fixed.loanInterest +
    fixed.depreciation +
    fixed.other;

  const breakEvenUnits =
    contributionPerUnit > 0 ? Math.ceil(monthlyFixedCost / contributionPerUnit) : null;
  const breakEvenRevenue = breakEvenUnits === null ? null : safeRound(breakEvenUnits * grossPrice);
  const initialInvestment = sum(input.initial);
  const recommendedWorkingCapital = safeRound(monthlyFixedCost * input.workingCapitalMonths);
  const totalFundingNeed = initialInvestment + recommendedWorkingCapital;
  const targetMonthlyOperatingProfit = safeRound(
    contributionPerUnit * input.targetMonthlyUnits - monthlyFixedCost,
  );
  const monthlyBurnBeforeSales = monthlyFixedCost;
  const runwayMonths =
    monthlyBurnBeforeSales > 0
      ? Math.round((input.availableCash / monthlyBurnBeforeSales) * 10) / 10
      : null;

  const scenarios: FinancialScenario[] = [
    ["보수적", 0.6],
    ["기준", 1],
    ["공격적", 1.4],
  ].map(([name, volumeFactor]) => {
    const monthlyUnits = Math.max(
      0,
      Math.round(input.targetMonthlyUnits * (volumeFactor as number)),
    );
    const netRevenue = safeRound(netPrice * monthlyUnits);
    const variableCosts = safeRound(variableCostPerUnit * monthlyUnits);
    const contribution = netRevenue - variableCosts;
    return {
      name: name as FinancialScenario["name"],
      volumeFactor: volumeFactor as number,
      monthlyUnits,
      netRevenue,
      variableCosts,
      contribution,
      operatingProfitBeforeTax: contribution - safeRound(monthlyFixedCost),
    };
  });

  const warnings: string[] = [];
  if (contributionPerUnit <= 0) {
    warnings.push("판매할수록 손실이 발생합니다. 판매가 또는 변동비를 먼저 수정해야 합니다.");
  }
  if (input.availableCash < totalFundingNeed) {
    warnings.push(`현재 가용자금이 권장 필요자금보다 ${safeRound(totalFundingNeed - input.availableCash).toLocaleString("ko-KR")}원 부족합니다.`);
  }
  if (runwayMonths !== null && runwayMonths < 3) {
    warnings.push("매출이 없을 때 버틸 수 있는 기간이 3개월 미만입니다.");
  }
  if (fixed.payrollGross > 0 && fixed.employerInsuranceRate === 0) {
    warnings.push("급여가 있지만 사업주 부담 보험료율이 0%입니다. 실제 가입 대상과 요율을 확인하세요.");
  }
  if (input.vatTaxable && !input.priceIncludesVat) {
    warnings.push("판매가가 부가세 별도입니다. 고객 표시가격과 세금계산서 발행 기준을 확인하세요.");
  }
  const contingencyRiskBase =
    input.initial.interior +
    input.initial.equipment +
    input.initial.initialInventory +
    input.initial.licensesAndRegistration;
  if (contingencyRiskBase > 0 && input.initial.contingency < contingencyRiskBase * 0.05) {
    warnings.push("예비비가 공사·장비·재고·인허가 준비비의 5% 미만입니다. 실제 견적 변동과 시작 지연 위험을 반영하세요.");
  }

  return {
    grossPrice: safeRound(grossPrice),
    netPrice: safeRound(netPrice),
    vatPerUnit: safeRound(vatPerUnit),
    variableCostPerUnit: safeRound(variableCostPerUnit),
    contributionPerUnit: safeRound(contributionPerUnit),
    contributionMarginRate: Math.round(contributionMarginRate * 10) / 10,
    monthlyFixedCost: safeRound(monthlyFixedCost),
    breakEvenUnits,
    breakEvenRevenue,
    initialInvestment: safeRound(initialInvestment),
    recommendedWorkingCapital,
    totalFundingNeed: safeRound(totalFundingNeed),
    targetMonthlyOperatingProfit,
    runwayMonths,
    scenarios,
    warnings,
    assumptions: [
      "부가세 과세이며 판매가에 부가세가 포함된 경우 공급가액을 판매가÷1.1로 계산합니다.",
      "사업주 부담 보험료는 사용자가 입력한 급여 대비 비율로 계산하며 실제 가입 대상·요율은 달라질 수 있습니다.",
      "소득세·법인세는 개인 상황과 비용 인정 여부에 따라 달라 손익 계산에서 제외했습니다.",
      "손익분기점은 재고 증감, 외상매출, 대출 원금 상환 전의 월 영업 기준입니다.",
    ],
  };
}
