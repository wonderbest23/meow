import { calculateFinancials } from "./financials";
import { cashflowFromFields, cashflowScenariosEnabled, implausibleMoneyFromFields } from "./cashflow-scenarios";
import { intakeScenarioInputs } from "./intake-core";
import { businessProfile } from "./business-launch";
import { COACH_KEY, type CoachState } from "./coach";
import { INTAKE_KEY, type IntakeState } from "./intake-types";
import type { NarrationFacts, NarrationMoney } from "./work-narration";

/*
 * 대기 문구(work-narration.ts)에 쓰는 사실 — 코드 계산만, AI 0회.
 * 숫자는 계획서 돈 장(section-service.intakeFinancialTable)과 같은 갈래·같은 계산으로 낸다. 화면에서 46건이라 했는데 본문이 51건이면 안 되기 때문이다.
 * 대표가 '직접 답한'(basis "user") 값만 쓴다 — 업종 기준값으로 먼저 채운 초안 숫자는 확인 전이라 대기 문구에 올리지 않는다.
 */
export function narrationMoney(coach: CoachState, intake: Omit<IntakeState, "receipts">): NarrationMoney | null {
  const basis = (key: string) => coach.fields.find(field => field.key === key)?.basis;
  if (basis("price") !== "user" || basis("unitCost") !== "user") return null;
  const scenario = intakeScenarioInputs(coach, intake as IntakeState);
  if ("missing" in scenario) return null;
  if (implausibleMoneyFromFields(coach.fields).length) return null;
  const fixedByOwner = basis("cost") === "user";
  const flow = cashflowScenariosEnabled() && intake.mode !== "operating" ? cashflowFromFields(coach.fields, scenario) : null;
  if (flow) {
    const capacity = basis("capacity") === "user" && flow.capacity ? flow.capacity.volume : null;
    // 업종 말이 이미 '맡을 수 있는 가구 수'처럼 '…수 있는'으로 시작하면 그대로 쓴다('감당할 수 있는 맡을 수 있는 …'이 되지 않게). '처리량'만 앞에 붙인다
    const reachWord = /수 있는/.test(flow.terms.capacity) ? flow.terms.capacity : `감당할 수 있는 ${flow.terms.capacity}`;
    return { unit: flow.unit, perUnit: flow.contribution, vat: flow.vat > 0, breakEven: fixedByOwner ? flow.breakEven : null, reach: capacity, reachWord: capacity != null ? reachWord : null };
  }
  const result = calculateFinancials({ unitPrice: scenario.unitPrice, unitVariableCost: scenario.unitVariableCost, monthlyFixedCost: scenario.monthlyFixedCost, monthlyGrowthPct: 0 });
  if (!result.unit) return null;
  const volume = scenario.volume && (scenario.volumeSource === "volume" && basis("volume") === "user" || scenario.volumeSource === "actual") ? scenario.volume : null;
  return {
    unit: "건", perUnit: result.unit.contributionMargin, vat: false,
    breakEven: fixedByOwner ? result.breakEven?.units ?? null : null,
    reach: volume, reachWord: volume == null ? null : scenario.volumeSource === "actual" ? "지금 판매량" : "생각한 판매량",
  };
}

export function narrationFacts(coach: CoachState, intake: Omit<IntakeState, "receipts">): NarrationFacts {
  // 사업 방향 정리 지시문(intake-service: businessProfile(plan).playbook)과 같은 가이드를 고른다
  const guide = businessProfile({ answers: { [COACH_KEY]: { state: coach }, [INTAKE_KEY]: { state: intake } } as never }).playbook?.name ?? null;
  return { guide, money: narrationMoney(coach, intake) };
}
