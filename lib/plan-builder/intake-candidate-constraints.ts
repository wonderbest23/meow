import type { BusinessStructure } from "./business-structure";

export const START_CONDITIONS = ["무점포로 시작", "혼자 시작할 수 있는 일", "인허가 없이 시작", "온라인으로 제공", "방문·출장으로 제공", "매장·공간에서 제공", "개인 고객", "기업·사업자 고객", "월 구독·정기 수익"] as const;
type StartCondition = (typeof START_CONDITIONS)[number];
type Facts = Partial<BusinessStructure>;

// Only facts explicit in the template. Missing facts must not inherit sector estimates.
const TEMPLATE_FACTS: Record<string, Facts> = {
  "workflow-support": { payer: "b2b" }, "marketing-support": { payer: "b2b" },
  "booking-management": { payer: "b2b", offering: "software" }, "focused-software": { offering: "software" },
  "small-cafe-dessert": { capital: "storefront", delivery: "store", offering: "goods" },
  "goods-smartstore": { delivery: "online", offering: "goods" },
  "parts-supply": { payer: "b2b", offering: "goods" },
  "small-batch-product": { offering: "goods" }, "lifestyle-goods-maker": { offering: "goods" },
  "online-tutoring": { delivery: "online", offering: "service" },
  "local-organization": { delivery: "visit", offering: "service" },
  "reserved-space": { capital: "storefront", offering: "space", revenue: "rental", delivery: "store" },
  "shared-office": { capital: "storefront", offering: "space", delivery: "store" },
  "studio-partyroom": { capital: "storefront", offering: "space", revenue: "rental", delivery: "store" },
  "subscription-experiment": { revenue: "subscription" },
};
export const candidateTemplateFacts = (id: string): Facts => TEMPLATE_FACTS[id] ?? {};
export function selectedStartConditions(value: unknown): StartCondition[] {
  return Array.isArray(value) ? value.filter((item): item is StartCondition => START_CONDITIONS.includes(item)) : [];
}

export function candidateConditionFit(facts: Facts, conditions: StartCondition[]): { conflict: boolean; unknown: StartCondition[] } {
  if (conditions.includes("무점포로 시작") && conditions.includes("매장·공간에서 제공")) return { conflict: true, unknown: [] };
  const match = <K extends keyof Facts>(key: K, allowed: Facts[K][]) => facts[key] === undefined ? null : allowed.includes(facts[key]);
  const checks: Record<StartCondition, () => boolean | null> = {
    "무점포로 시작": () => facts.capital === "storefront" || facts.offering === "space" || facts.delivery === "store" ? false : facts.capital === "remote" ? true : null,
    "혼자 시작할 수 있는 일": () => match("smallBusiness", [true]),
    "인허가 없이 시작": () => facts.license === "varies" ? null : match("license", ["none"]),
    "온라인으로 제공": () => match("delivery", ["online", "mixed"]),
    "방문·출장으로 제공": () => match("delivery", ["visit", "mixed"]),
    "매장·공간에서 제공": () => facts.offering === "space" ? true : match("delivery", ["store", "mixed"]),
    "개인 고객": () => match("payer", ["b2c", "mixed"]),
    "기업·사업자 고객": () => match("payer", ["b2b", "b2g", "mixed"]),
    "월 구독·정기 수익": () => facts.revenue === "mixed" ? null : match("revenue", ["subscription"]),
  };
  const unknown: StartCondition[] = [];
  for (const condition of conditions) {
    const result = checks[condition]();
    if (result === false) return { conflict: true, unknown };
    if (result === null) unknown.push(condition);
  }
  return { conflict: false, unknown };
}

export function filterCandidateConditions<T extends { cautions: string[] }>(candidate: T, facts: Facts, conditions: StartCondition[]): T[] {
  const fit = candidateConditionFit(facts, conditions);
  if (fit.conflict) return [];
  const warning = fit.unknown.length ? `조건 적합성 확인 필요(자료 없음): ${fit.unknown.join(", ")}` : null;
  return [{ ...candidate, cautions: warning && !candidate.cautions.includes(warning) ? [...candidate.cautions, warning] : candidate.cautions }];
}
