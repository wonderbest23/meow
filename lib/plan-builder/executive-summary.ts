import { coachDocumentRevision, currentNextAction, readCoach, type CoachField } from "./coach";
import { coachAmount, checkCoachFeasibility } from "./coach-feasibility";
import { buildPlanBusinessContext, type ContextField } from "./context/build";
import { calculateFinancials, collectFinancialInputs, describeFinancialFields } from "./financials";
import { comparePeriods, metricValue, periodDays, periodLabel, previousPeriod, readOperatingState } from "./operating-records";
import type { ServerPlan } from "./plan-server-store";

export type SummaryLine = { label: string; value: string; basis: "user" | "proposal" | "calculation" | "missing"; sourceIds: string[] };
export type ExecutiveSummary = {
  version: 1; title: string; planType: string; sourceVersion: string; abbreviated: boolean;
  blocks: Array<{ id: string; title: string; lines: SummaryLine[] }>;
  note: string;
};
type Business = { name?: string; description?: string; industry?: string; region?: string; stage?: string };
const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

/** Explicit excerpts preserve full source records; truncation is disclosed in every format. */
function excerpt(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const candidate = text.slice(0, max - 1);
  const boundary = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, boundary > max / 2 ? boundary : max - 1).replace(/[\d,.+-]+$/, "").trimEnd()}…`;
}

export function buildExecutiveSummary(plan: Pick<ServerPlan, "id" | "title" | "planType" | "updatedAt" | "answers">, business: Business = {}): ExecutiveSummary {
  const coach = readCoach(plan.answers);
  const context = buildPlanBusinessContext({ answers: plan.answers, business: coach?.business ?? business });
  const fields = new Map(coach?.fields.map(field => [field.key, field]) ?? []);
  const operations = readOperatingState(plan.answers);
  const period = [...operations.periods].sort((a, b) => b.end.localeCompare(a.end))[0];
  const baseline = period ? previousPeriod(operations.periods, period) : null;
  let abbreviated = false;
  const line = (label: string, value: string | undefined, basis: SummaryLine["basis"], sourceIds: string[], max = 115): SummaryLine => {
    const full = value?.trim() || "미입력";
    const shortened = excerpt(full, max);
    if (shortened !== full.replace(/\s+/g, " ")) abbreviated = true;
    return { label, value: shortened, basis: value?.trim() ? basis : "missing", sourceIds };
  };
  const field = (label: string, key: CoachField["key"], fallback?: ContextField<unknown>, max?: number) => {
    const item = fields.get(key);
    const value = item?.value ?? (fallback?.value != null ? Array.isArray(fallback.value) ? fallback.value.join(", ") : String(fallback.value) : undefined);
    return line(label, value, item?.basis ?? (fallback?.status === "inferred" ? "proposal" : "user"), [item ? `coach.${key}` : `context.${key}`], max);
  };

  const offer = field("상품", "offer", context.solution.mainOffer);
  const customer = field("고객", "customer", context.customer.target);
  const businessLine = field("사업", "business", context.identity.description, 145);
  const price = field("가격", "price", context.revenue.unitPrice, 50);
  const channel = field("판매", "channel", context.marketing.channels, 70);
  const cost = field("월 고정비", "cost", undefined, 45);
  const unitCost = field("건당 변동비", "unitCost", undefined, 45);
  const inputs = coach ? {
    unitPrice: coachAmount(fields.get("price")?.value), unitVariableCost: coachAmount(fields.get("unitCost")?.value),
    monthlyFixedCost: coachAmount(fields.get("cost")?.value),
    startingVolume: /^[\d,]+$/.test(fields.get("volume")?.value ?? "") ? Number(fields.get("volume")!.value.replace(/,/g, "")) : undefined,
    monthlyGrowthPct: 0,
  } : collectFinancialInputs(plan.answers).inputs;
  // The shared engine permits partial calculations. A summary must never turn missing fixed costs into zero profit costs.
  const legacyCosts = coach ? [] : describeFinancialFields(plan.answers);
  const legacyComplete = coach || legacyCosts.filter(item => item.id === "fixedBase" || item.id === "staffMonthly").every(item => item.value != null);
  const completeCosts = !!legacyComplete && inputs.unitPrice != null && inputs.unitVariableCost != null && inputs.monthlyFixedCost != null;
  const financials = completeCosts ? calculateFinancials(inputs) : null;
  const firstMonth = financials?.monthly[0];
  const financialLines = firstMonth ? [
    line(coach?.stage === "operating" || period ? "월 운영 가정" : "첫 달 가정", `${firstMonth.volume.toLocaleString("ko-KR")}건 판매 / 매출 ${won(firstMonth.revenue)} / 영업손익 ${won(firstMonth.operatingProfit)}`, "calculation", ["financials.monthly.1"], 110),
    line("산출 조건", `판매가 ${won(inputs.unitPrice!)} / 건당 변동비 ${won(inputs.unitVariableCost!)} / 월 고정비 ${won(inputs.monthlyFixedCost!)}`, "calculation", ["financials.inputs"], 110),
  ] : [
    line("계산 상태", completeCosts ? "월 예상 판매량이 없어 월 매출과 손익을 계산하지 않음" : "가격·건당 변동비·인건비를 포함한 월 고정비가 모두 있어야 손익 계산 가능", "missing", ["financials.inputs"]),
    ...(coach ? [line("입력 비용", `${cost.label} ${cost.value} / ${unitCost.label} ${unitCost.value}`, cost.basis === "proposal" || unitCost.basis === "proposal" ? "proposal" : "user", ["coach.cost", "coach.unitCost"])] : []),
  ];
  if (financials?.breakEven) financialLines.push(line("손익분기", `월 ${financials.breakEven.units.toLocaleString("ko-KR")}건 / 매출 ${won(financials.breakEven.revenue)}`, "calculation", ["financials.breakEven"], 80));
  const evidenceLines: SummaryLine[] = [];
  if (period) {
    evidenceLines.push(line("기록 기간", `${periodLabel(period)}${baseline ? ` / 이전 ${periodLabel(baseline)}` : " / 이전 기록 없음"}`, "user", [`operations.${period.id}`], 105));
    const rows = comparePeriods(period, baseline);
    for (const pair of [rows.slice(0, 2), rows.slice(2)]) evidenceLines.push(line("입력 실적", pair.map(row => `${row.label} ${metricValue(row.current, row.unit)}${row.delta === null ? "" : ` (이전 대비 ${row.delta > 0 ? "+" : ""}${metricValue(row.delta, row.unit)})`}`).join(" / "), "user", pair.map(row => `operations.${period.id}.${row.key}`), 150));
  } else {
    const sales = fields.get("sales");
    evidenceLines.push(sales?.basis === "user" ? line("매출 진술", sales.value, "user", ["coach.sales"], 120) : line("실적", undefined, "missing", []));
    const experience = field("관련 경험", "experience", context.team.ownerExperience, 120);
    if (experience.basis === "user") evidenceLines.push(experience);
  }
  const next = coach ? currentNextAction(coach) : undefined;
  const actionNeedsReview = !!(coach?.directAction && next === coach.directAction && coach.directAction.needsReview);
  const action = period?.nextAction || (!actionNeedsReview ? next?.action : undefined);
  const criterion = period?.successCriterion || (!actionNeedsReview ? next?.doneWhen : undefined);
  const actionLines = [
    line("다음 행동", action, period?.nextAction || coach?.directAction && next === coach.directAction ? "user" : "proposal", [period?.nextAction ? `operations.${period.id}.nextAction` : "coach.nextAction"], 150),
    line("확인 기준", criterion, period?.successCriterion || coach?.directAction && next === coach.directAction ? "user" : "proposal", [period?.successCriterion ? `operations.${period.id}.successCriterion` : "coach.nextAction.doneWhen"], 100),
  ];
  const goal = field("목표", "goal", context.goals.main, 100);
  if (goal.basis !== "missing") actionLines.push(goal);
  const unresolved = [customer, offer, price].filter(item => item.basis === "missing").map(item => item.label);
  const attention = coach ? checkCoachFeasibility(coach.fields).filter(check => check.status === "attention").map(check => check.detail) : context.conflicts.map(conflict => conflict.detail);
  const note = [
    "사용자 입력은 외부 검증된 실적이 아닙니다. 제안과 계획 계산은 실제 실적과 구분합니다.",
    firstMonth ? "계획 손익은 세금·운전자금 차감 후 현금잔액이 아닙니다." : "미입력 비용은 0원이 아닙니다.",
    baseline && period && periodDays(baseline) !== periodDays(period) ? "비교 기간 길이가 달라 합계 차이를 성과 개선으로 판단할 수 없습니다." : "",
    "내용을 줄여 표시한 항목은 상세 계획서와 원본 사업 정보를 확인하세요.",
  ].filter(Boolean).join(" ");
  const blocks = [
      { id: "business", title: "사업과 고객", lines: [businessLine, customer] },
      { id: "offer", title: "제공안과 판매", lines: [offer, line("거래 조건", `${price.value} / ${channel.value}`, price.basis === "proposal" || channel.basis === "proposal" ? "proposal" : "user", [...price.sourceIds, ...channel.sourceIds], 120)] },
      { id: "finance", title: "수익 구조와 계획 계산", lines: financialLines },
      { id: "evidence", title: period ? "기간별 실제 기록" : "현재 확인할 근거", lines: evidenceLines },
      { id: "action", title: "다음 행동과 확인 기준", lines: actionLines },
      { id: "conditions", title: "결정할 조건", lines: [line("확인 사항", [...attention, ...(unresolved.length ? [`미입력: ${unresolved.join(", ")}`] : [])].join(" ") || "추가로 기록된 충돌 없음 / 사업성 검증을 뜻하지 않음", attention.length ? "calculation" : "missing", ["feasibility", "context.conflicts"], 150)] },
  ];
  return {
    version: 1, title: plan.title, planType: plan.planType, sourceVersion: `${plan.id}:${plan.updatedAt}:coach-${coach ? coachDocumentRevision(coach) : "legacy"}:operations-${operations.revision}`,
    abbreviated, note, blocks,
  };
}

export const summaryBasisLabel = (basis: SummaryLine["basis"]) => ({ user: "입력", proposal: "제안", calculation: "계산", missing: "확인 필요" })[basis];
export const hasExecutiveSummaryContent = (summary: ExecutiveSummary) => summary.blocks[0]?.lines.some(line => line.basis !== "missing") ?? false;
