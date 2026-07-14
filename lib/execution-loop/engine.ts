import type { LandingSiteRecord } from "../landing/domain";
import type { ProjectRecord } from "../service-domain";
import type {
  ExecutionExperiment,
  ExecutionLoopAnalysis,
  ExecutionWorkspace,
  HypothesisVerdict,
} from "./domain";

const emptyMetrics: ExecutionExperiment["metrics"] = {
  reached: 0,
  impressions: 0,
  clicks: 0,
  landingVisitors: 0,
  inquiries: 0,
  interviews: 0,
  proposals: 0,
  purchases: 0,
  refunds: 0,
  refundAmount: 0,
  revenue: 0,
  adSpend: 0,
  variableCost: 0,
};

export function createExecutionWorkspace(project: ProjectRecord): ExecutionWorkspace {
  const customer = String(project.opportunity.customer ?? "목표 고객");
  const problem = String(project.opportunity.oneLiner ?? "핵심 문제");
  const channel = project.businessSetup?.onlineSales ? "온라인 고객 경로" : "직접 제안 경로";
  const price = project.businessSetup?.financial.sellingPrice
    ?? Number(project.stages[2]?.inputs.basePriceWon)
    ?? 0;
  return {
    hypotheses: [
      {
        id: crypto.randomUUID(),
        category: "customer",
        claim: `${customer}가 실제 초기 고객이다.`,
        successCriterion: "서로 다른 실제 고객의 문의 또는 인터뷰 10건과 유료 구매 3건 이상",
      },
      {
        id: crypto.randomUUID(),
        category: "problem",
        claim: `${customer}가 ${problem} 문제를 해결하기 위해 시간이나 비용을 지불한다.`,
        successCriterion: "인터뷰 10건 이상과 구체적 현재 지출 근거, 유료 구매 3건 이상",
      },
      {
        id: crypto.randomUUID(),
        category: "channel",
        claim: `${channel}에서 반복 가능한 고객 획득이 가능하다.`,
        successCriterion: "같은 고객 경로에서 구매 5건 이상과 계산 가능한 고객 확보비용 확인",
      },
      {
        id: crypto.randomUUID(),
        category: "price",
        claim: `고객이 ${price > 0 ? `${price.toLocaleString("ko-KR")}원` : "제안 가격"}을 지불한다.`,
        successCriterion: "동일 가격대 유료 구매 5건 이상, 환불률 10% 이하",
      },
    ],
    experiments: [],
  };
}

function sumMetrics(
  experiments: ExecutionExperiment[],
  landing: LandingSiteRecord["metrics"] | null,
): ExecutionExperiment["metrics"] {
  const totals = experiments.reduce(
    (sum, experiment) => {
      for (const key of Object.keys(emptyMetrics) as Array<keyof typeof emptyMetrics>) {
        sum[key] += experiment.metrics[key];
      }
      return sum;
    },
    { ...emptyMetrics },
  );
  if (landing) {
    totals.impressions += landing.pageViews;
    totals.landingVisitors += landing.pageViews;
    totals.clicks += landing.ctaClicks;
    totals.inquiries += landing.leads;
  }
  return totals;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : null;
}

function verdictFor(
  category: HypothesisVerdict["category"],
  totals: ExecutionExperiment["metrics"],
  funnel: ExecutionLoopAnalysis["funnel"],
  completedEvidenceCount: number,
): Omit<HypothesisVerdict, "hypothesisId" | "category"> {
  const baseConfidence = Math.min(
    95,
    Math.round(
      Math.min(35, totals.interviews * 3) +
      Math.min(45, totals.purchases * 7) +
      Math.min(15, completedEvidenceCount * 3),
    ),
  );
  if (category === "customer") {
    if (totals.purchases >= 5 && totals.inquiries + totals.interviews >= 10) {
      return { verdict: "validated", confidence: baseConfidence, evidence: [`문의·인터뷰 ${totals.inquiries + totals.interviews}건`, `구매 ${totals.purchases}건`], nextAction: "구매 고객의 공통 특성을 기록해 고객 범위를 더 좁히세요." };
    }
    if (totals.reached >= 100 && totals.inquiries === 0) {
      return { verdict: "invalidated", confidence: Math.max(60, baseConfidence), evidence: [`도달 ${totals.reached}명`, "문의 0건"], nextAction: "고객군 또는 문제 표현을 바꾸고 새 실험을 설계하세요." };
    }
    if (totals.inquiries + totals.interviews >= 5 || totals.purchases > 0) {
      return { verdict: "promising", confidence: baseConfidence, evidence: [`문의·인터뷰 ${totals.inquiries + totals.interviews}건`, `구매 ${totals.purchases}건`], nextAction: "서로 다른 고객 10명과 유료 구매 5건까지 표본을 늘리세요." };
    }
  }
  if (category === "problem") {
    if (totals.purchases >= 5 && totals.interviews >= 10) {
      return { verdict: "validated", confidence: baseConfidence, evidence: [`인터뷰 ${totals.interviews}건`, `유료 행동 ${totals.purchases}건`], nextAction: "구매 이유와 기존 대안 지출을 사업계획서 근거에 반영하세요." };
    }
    if (totals.interviews >= 10 && totals.proposals >= 10 && totals.purchases === 0) {
      return { verdict: "invalidated", confidence: Math.max(65, baseConfidence), evidence: [`인터뷰 ${totals.interviews}건`, `제안 ${totals.proposals}건`, "구매 0건"], nextAction: "문제가 약한지, 해결 방식이 맞지 않는지 후속 질문으로 분리 검증하세요." };
    }
    if (totals.interviews >= 5 || totals.purchases > 0) {
      return { verdict: "promising", confidence: baseConfidence, evidence: [`인터뷰 ${totals.interviews}건`, `구매 ${totals.purchases}건`], nextAction: "현재 대안과 실제 지출 금액을 인터뷰 기록에 추가하세요." };
    }
  }
  if (category === "channel") {
    if (totals.purchases >= 5 && totals.adSpend > 0) {
      return { verdict: "validated", confidence: baseConfidence, evidence: [`구매 ${totals.purchases}건`, `광고·획득비 ${totals.adSpend.toLocaleString("ko-KR")}원`], nextAction: "같은 경로에서 예산을 소폭 늘려 고객 1명 확보비용이 유지되는지 확인하세요." };
    }
    if (totals.landingVisitors >= 200 && totals.purchases === 0) {
      return { verdict: "invalidated", confidence: Math.max(60, baseConfidence), evidence: [`방문 ${totals.landingVisitors}명`, "구매 0건"], nextAction: "고객이 들어온 경로와 판매 페이지의 제안을 나눠 다시 확인하세요." };
    }
    if (totals.inquiries >= 5 || totals.purchases > 0) {
      return { verdict: "promising", confidence: baseConfidence, evidence: [`문의 ${totals.inquiries}건`, `구매 ${totals.purchases}건`], nextAction: "고객을 만난 경로별로 비용과 구매를 나눠 기록하세요." };
    }
  }
  if (category === "price") {
    if (totals.purchases >= 5 && (funnel.refundRate ?? 0) <= 10) {
      return { verdict: "validated", confidence: baseConfidence, evidence: [`구매 ${totals.purchases}건`, `환불률 ${funnel.refundRate ?? 0}%`], nextAction: "가격을 유지하고 반복 구매·추천 여부를 확인하세요." };
    }
    if (totals.proposals >= 10 && (funnel.proposalToPurchaseRate ?? 100) < 5) {
      return { verdict: "invalidated", confidence: Math.max(60, baseConfidence), evidence: [`제안 ${totals.proposals}건`, `제안→구매 ${funnel.proposalToPurchaseRate}%`], nextAction: "가격 자체와 제공 범위를 각각 바꾼 두 실험으로 원인을 분리하세요." };
    }
    if (totals.purchases > 0) {
      return { verdict: "promising", confidence: baseConfidence, evidence: [`실제 구매 ${totals.purchases}건`], nextAction: "같은 가격에서 구매 5건과 환불 자료를 확보하세요." };
    }
  }
  return {
    verdict: "insufficient_data",
    confidence: Math.min(35, baseConfidence),
    evidence: ["판정에 필요한 실제 행동 표본이 부족합니다."],
    nextAction: "완료 실험의 원본 근거를 저장하고 최소 표본을 확보하세요.",
  };
}

export function analyzeExecutionLoop(
  workspace: ExecutionWorkspace,
  options: {
    landingMetrics?: LandingSiteRecord["metrics"] | null;
    monthlyFixedCost?: number;
  } = {},
): ExecutionLoopAnalysis {
  const completed = workspace.experiments.filter((experiment) => experiment.status === "completed");
  const totals = sumMetrics(workspace.experiments, options.landingMetrics ?? null);
  const funnel = {
    clickThroughRate: rate(totals.clicks, totals.impressions),
    visitorToInquiryRate: rate(totals.inquiries, totals.landingVisitors),
    inquiryToProposalRate: rate(totals.proposals, totals.inquiries),
    proposalToPurchaseRate: rate(totals.purchases, totals.proposals),
    visitorToPurchaseRate: rate(totals.purchases, totals.landingVisitors),
    refundRate: rate(totals.refunds, totals.purchases),
  };
  const netPurchases = Math.max(0, totals.purchases - totals.refunds);
  const netRevenue = Math.max(0, totals.revenue - totals.refundAmount);
  const observedAveragePrice = netPurchases > 0 ? Math.round(netRevenue / netPurchases) : null;
  const observedVariableCostPerPurchase =
    totals.purchases > 0 ? Math.round(totals.variableCost / totals.purchases) : null;
  const customerAcquisitionCost =
    totals.purchases > 0 && totals.adSpend > 0 ? Math.round(totals.adSpend / totals.purchases) : null;
  const observedContributionPerPurchase =
    netPurchases > 0
      ? Math.round((netRevenue - totals.variableCost - totals.adSpend) / netPurchases)
      : null;
  const observedContributionMarginRate =
    observedAveragePrice && observedContributionPerPurchase !== null
      ? Math.round((observedContributionPerPurchase / observedAveragePrice) * 1000) / 10
      : null;
  const observedBreakEvenUnits =
    observedContributionPerPurchase && observedContributionPerPurchase > 0
      ? Math.ceil((options.monthlyFixedCost ?? 0) / observedContributionPerPurchase)
      : null;
  const evidenceCount = completed.filter((experiment) => Boolean(experiment.evidenceUrl)).length;
  const verdicts = workspace.hypotheses.map((hypothesis) => ({
    hypothesisId: hypothesis.id,
    category: hypothesis.category,
    ...verdictFor(hypothesis.category, totals, funnel, evidenceCount),
  }));

  const channelRows = new Map<ExecutionExperiment["channel"], { purchases: number; revenue: number; spend: number }>();
  for (const experiment of workspace.experiments) {
    const current = channelRows.get(experiment.channel) ?? { purchases: 0, revenue: 0, spend: 0 };
    current.purchases += experiment.metrics.purchases;
    current.revenue += experiment.metrics.revenue - experiment.metrics.refundAmount;
    current.spend += experiment.metrics.adSpend;
    channelRows.set(experiment.channel, current);
  }
  const bestChannelEntry = [...channelRows.entries()]
    .filter(([, value]) => value.purchases > 0)
    .sort(([, a], [, b]) => b.purchases - a.purchases || b.revenue - a.revenue)[0];
  const bestChannel = bestChannelEntry
    ? {
        channel: bestChannelEntry[0],
        purchases: bestChannelEntry[1].purchases,
        revenue: bestChannelEntry[1].revenue,
        acquisitionCost: bestChannelEntry[1].spend
          ? Math.round(bestChannelEntry[1].spend / bestChannelEntry[1].purchases)
          : null,
      }
    : null;

  const confidenceScore = Math.min(
    100,
    Math.round(
      Math.min(30, evidenceCount * 6) +
      Math.min(20, totals.interviews * 2) +
      Math.min(40, totals.purchases * 6) +
      Math.min(10, totals.landingVisitors / 50),
    ),
  );
  const warnings: string[] = [];
  if (completed.some((experiment) => !experiment.evidenceUrl)) {
    warnings.push("원본 근거가 없는 완료 실험은 신뢰도에 반영하지 않습니다.");
  }
  if (totals.purchases > 0 && totals.revenue === 0) warnings.push("구매 건수는 있지만 매출액이 입력되지 않았습니다.");
  if (totals.revenue > 0 && totals.variableCost === 0) warnings.push("실제 변동비가 0원으로 기록되어 공헌이익이 과대 계산될 수 있습니다.");
  if (observedContributionPerPurchase !== null && observedContributionPerPurchase <= 0) {
    warnings.push("실측 고객당 공헌이익이 0원 이하입니다. 현재 구조로는 손익분기점에 도달할 수 없습니다.");
  }
  if (totals.purchases < 5) warnings.push("구매 표본이 5건 미만이므로 가격·수익성 판정은 잠정치입니다.");

  const recommendedActions = [...new Set(verdicts
    .filter((verdict) => verdict.verdict !== "validated")
    .sort((a, b) => a.confidence - b.confidence)
    .map((verdict) => verdict.nextAction))]
    .slice(0, 3);
  if (!recommendedActions.length) {
    recommendedActions.push("검증된 고객 경로에서 예산을 조금씩 늘리며 고객 1명 확보비용과 환불률이 유지되는지 확인하세요.");
  }

  return {
    totals,
    funnel,
    calibratedFinancials: {
      observedAveragePrice,
      observedVariableCostPerPurchase,
      customerAcquisitionCost,
      observedContributionPerPurchase,
      observedContributionMarginRate,
      observedBreakEvenUnits,
      netRevenue,
    },
    verdicts,
    bestChannel,
    confidenceScore,
    warnings,
    recommendedActions,
    generatedAt: new Date().toISOString(),
    modelVersion: "execution-loop-v1",
  };
}
