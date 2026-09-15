import type { CoachField } from "./coach";
import { coachAmount } from "./coach-feasibility";
import { calculateFinancials } from "./financials";

export const PROPOSAL_BUSINESS_FIELDS = [
  { key: "offer", label: "상품과 제공 범위" }, { key: "customer", label: "대상 고객" },
  { key: "price", label: "건당 판매가" }, { key: "unitCost", label: "건당 변동비" },
  { key: "cost", label: "월 고정비" }, { key: "volume", label: "월 예상 판매 건수" },
] as const;
export type BusinessConditionsView = {
  revision: number; fields: CoachField[];
  documents: { total: number; current: number; missing: string[]; stale: string[]; manualReview: string[];
    items: Array<{ key: string; title: string; current: boolean; manual: boolean; locked: boolean }> };
};

export function proposalFinancialPreview(fields: Pick<CoachField, "key" | "value">[]) {
  const values = new Map(fields.map(field => [field.key, field.value]));
  const unitPrice = coachAmount(values.get("price")), unitVariableCost = coachAmount(values.get("unitCost")), monthlyFixedCost = coachAmount(values.get("cost"));
  const rawVolume = values.get("volume") ?? "";
  const startingVolume = /^[\d,]+$/.test(rawVolume) ? Number(rawVolume.replace(/,/g, "")) : undefined;
  if (unitPrice == null || unitVariableCost == null || monthlyFixedCost == null || !Number.isSafeInteger(startingVolume) || startingVolume! < 0) return null;
  if (startingVolume === 0) return { month: 1, volume: 0, revenue: 0, variableCost: 0, contribution: 0, fixedCost: monthlyFixedCost, operatingProfit: -monthlyFixedCost, cumulative: -monthlyFixedCost };
  const result = calculateFinancials({ unitPrice, unitVariableCost, monthlyFixedCost, startingVolume, monthlyGrowthPct: 0 });
  const first = result.monthly[0];
  return first && Object.values(first).every(Number.isSafeInteger) ? first : null;
}
