export const monthlyRampFactors = [0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 1, 1, 1.1, 1.1, 1.2, 1.2] as const;

export type TwelveMonthForecastInput = {
  priceWon: number;
  variableCostPerUnit: number | null;
  monthlyFixedCostWon: number | null;
  targetMonthlyUnits: number | null;
  initialInvestmentWon?: number | null;
  startDate?: string;
};

export type MonthlyFinancialForecast = {
  monthIndex: number;
  month: string;
  rampFactor: number;
  units: number;
  grossUnitPriceWon: number;
  netUnitPriceWon: number;
  grossRevenueWon: number;
  netRevenueWon: number;
  variableCostsWon: number;
  contributionWon: number;
  fixedCostsWon: number;
  operatingProfitBeforeTaxWon: number;
  cumulativeOperatingProfitWon: number;
  cumulativeCashAfterInitialInvestmentWon: number;
};

export type TwelveMonthForecast = {
  months: MonthlyFinancialForecast[];
  annualGrossRevenueWon: number;
  annualNetRevenueWon: number;
  annualOperatingProfitBeforeTaxWon: number;
  operatingBreakEvenMonth: string | null;
  capitalRecoveryMonth: string | null;
  isCalculated: boolean;
};

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function startMonth(value: string | undefined) {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function monthLabel(date: Date, offset: number) {
  const month = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  return `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
}

export function buildTwelveMonthForecast(input: TwelveMonthForecastInput): TwelveMonthForecast {
  const grossUnitPriceWon = Math.round(finiteNonNegative(input.priceWon));
  const netUnitPriceWon = Math.round(grossUnitPriceWon / 1.1);
  const variableCostPerUnit = Math.round(finiteNonNegative(input.variableCostPerUnit));
  const fixedCostsWon = Math.round(finiteNonNegative(input.monthlyFixedCostWon));
  const targetMonthlyUnits = Math.round(finiteNonNegative(input.targetMonthlyUnits));
  const initialInvestmentWon = Math.round(finiteNonNegative(input.initialInvestmentWon));
  const beginning = startMonth(input.startDate);
  let cumulativeOperatingProfitWon = 0;

  const months = monthlyRampFactors.map((rampFactor, index): MonthlyFinancialForecast => {
    const units = Math.round(targetMonthlyUnits * rampFactor);
    const grossRevenueWon = units * grossUnitPriceWon;
    const netRevenueWon = units * netUnitPriceWon;
    const variableCostsWon = units * variableCostPerUnit;
    const contributionWon = netRevenueWon - variableCostsWon;
    const operatingProfitBeforeTaxWon = contributionWon - fixedCostsWon;
    cumulativeOperatingProfitWon += operatingProfitBeforeTaxWon;
    return {
      monthIndex: index + 1,
      month: monthLabel(beginning, index),
      rampFactor,
      units,
      grossUnitPriceWon,
      netUnitPriceWon,
      grossRevenueWon,
      netRevenueWon,
      variableCostsWon,
      contributionWon,
      fixedCostsWon,
      operatingProfitBeforeTaxWon,
      cumulativeOperatingProfitWon,
      cumulativeCashAfterInitialInvestmentWon: cumulativeOperatingProfitWon - initialInvestmentWon,
    };
  });

  const annualGrossRevenueWon = months.reduce((sum, month) => sum + month.grossRevenueWon, 0);
  const annualNetRevenueWon = months.reduce((sum, month) => sum + month.netRevenueWon, 0);
  const annualOperatingProfitBeforeTaxWon = months.reduce((sum, month) => sum + month.operatingProfitBeforeTaxWon, 0);
  return {
    months,
    annualGrossRevenueWon,
    annualNetRevenueWon,
    annualOperatingProfitBeforeTaxWon,
    operatingBreakEvenMonth: months.find((month) => month.operatingProfitBeforeTaxWon >= 0)?.month ?? null,
    capitalRecoveryMonth: months.find((month) => month.cumulativeCashAfterInitialInvestmentWon >= 0)?.month ?? null,
    isCalculated: grossUnitPriceWon > 0 && targetMonthlyUnits > 0,
  };
}

export function buildFinancialScenarioRows(input: TwelveMonthForecastInput) {
  const grossUnitPriceWon = Math.round(finiteNonNegative(input.priceWon));
  const netUnitPriceWon = Math.round(grossUnitPriceWon / 1.1);
  const variableCostPerUnit = Math.round(finiteNonNegative(input.variableCostPerUnit));
  const monthlyFixedCostWon = Math.round(finiteNonNegative(input.monthlyFixedCostWon));
  const targetMonthlyUnits = Math.round(finiteNonNegative(input.targetMonthlyUnits));
  return [
    { name: "보수적", factor: 0.7 },
    { name: "기준", factor: 1 },
    { name: "도전적", factor: 1.3 },
  ].map((scenario) => {
    const monthlyUnits = Math.round(targetMonthlyUnits * scenario.factor);
    const monthlyNetRevenueWon = monthlyUnits * netUnitPriceWon;
    const monthlyOperatingProfitBeforeTaxWon = monthlyNetRevenueWon - monthlyUnits * variableCostPerUnit - monthlyFixedCostWon;
    return { ...scenario, monthlyUnits, monthlyNetRevenueWon, monthlyOperatingProfitBeforeTaxWon };
  });
}
