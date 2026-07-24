import type { Opportunity } from "../data/opportunities";
import {
  generateOpportunityPool,
  type ManualPreferences,
} from "./idea-generator";
import {
  founderLabels,
  riasecLabels,
  type FounderProfile,
} from "./assessment";

export type OpportunityFeedback = Record<string, "saved" | "excluded">;

export type OpportunityPreferenceSignal = {
  state: "saved" | "excluded";
  opportunity: Pick<Opportunity, "id" | "sector" | "model" | "riasec" | "founder">;
};

export type RankedOpportunity = Opportunity & {
  match: number;
  reasons: string[];
  caution: string;
  scoreBreakdown: {
    personalFit: number;
    market: number | null;
    feasibility: number;
    novelty: number | null;
  };
};

export type OpportunityFilters = {
  sector?: string;
  capital?: "전체" | Opportunity["capital"];
};

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function preferenceAffinity(
  opportunity: Opportunity,
  signals: OpportunityPreferenceSignal[],
) {
  const adjustment = signals.reduce((sum, signal) => {
    if (signal.opportunity.id === opportunity.id) return sum;
    const founderOverlap = opportunity.founder.filter((axis) =>
      signal.opportunity.founder.includes(axis),
    ).length;
    const riasecOverlap = opportunity.riasec.filter((axis) =>
      signal.opportunity.riasec.includes(axis),
    ).length;
    const sectorMatch = opportunity.sector === signal.opportunity.sector ? 2 : 0;
    const modelMatch = opportunity.model === signal.opportunity.model ? 2 : 0;
    const similarity = founderOverlap * 2 + riasecOverlap + sectorMatch + modelMatch;
    return sum + (signal.state === "saved" ? similarity : -similarity);
  }, 0);
  return Math.max(-12, Math.min(12, adjustment));
}

function rankOne(
  opportunity: Opportunity,
  profile: FounderProfile,
  feedback: OpportunityFeedback,
  signals: OpportunityPreferenceSignal[],
): RankedOpportunity {
  const interestFit = average(opportunity.riasec.map((axis) => profile.riasec[axis]));
  const founderFit = average(opportunity.founder.map((axis) => profile.founder[axis]));
  const personalFit = Math.round(interestFit * 0.45 + founderFit * 0.55);
  const capitalPenalty = opportunity.capital === "높음" ? 7 : opportunity.capital === "중간" ? 2 : 0;
  const regulationPenalty = opportunity.regulation * 0.05;
  const feedbackBoost = feedback[opportunity.id] === "saved" ? 4 : 0;
  const affinityBoost = preferenceAffinity(opportunity, signals);
  const match = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        personalFit + feedbackBoost + affinityBoost - capitalPenalty - regulationPenalty,
      ),
    ),
  );

  const strongestRiasec = [...opportunity.riasec].sort(
    (a, b) => profile.riasec[b] - profile.riasec[a],
  )[0];
  const strongestFounder = [...opportunity.founder].sort(
    (a, b) => profile.founder[b] - profile.founder[a],
  )[0];

  return {
    ...opportunity,
    match,
    reasons: [
      `${riasecLabels[strongestRiasec]} 성향을 실제 업무에 활용할 수 있어요`,
      `${founderLabels[strongestFounder]} 강점과 사업의 핵심 성공 방식이 맞아요`,
      "시장성은 아직 확인되지 않았으므로 첫 고객 실험이 필요해요",
    ],
    caution:
      opportunity.regulation >= 65
        ? "전문가 검토와 인허가 확인이 먼저 필요한 영역이에요."
        : opportunity.capital === "높음"
          ? "바로 투자하기보다 선주문이나 파트너 생산으로 위험을 줄여야 해요."
          : "적합도가 높아도 실제 고객 인터뷰로 수요를 먼저 검증해야 해요.",
    scoreBreakdown: {
      personalFit,
      market: opportunity.evidenceStatus === "verified" ? opportunity.market : null,
      feasibility: opportunity.feasibility,
      novelty: opportunity.evidenceStatus === "verified" ? opportunity.novelty : null,
    },
  };
}

function diversify(items: RankedOpportunity[]) {
  const result: RankedOpportunity[] = [];
  const sectorCount = new Map<string, number>();
  const modelCount = new Map<string, number>();
  const remaining = [...items];

  while (remaining.length) {
    remaining.sort((a, b) => {
      const penaltyA =
        (sectorCount.get(a.sector) ?? 0) * 12 + (modelCount.get(a.model) ?? 0) * 7;
      const penaltyB =
        (sectorCount.get(b.sector) ?? 0) * 12 + (modelCount.get(b.model) ?? 0) * 7;
      return b.match - penaltyB - (a.match - penaltyA);
    });
    const next = remaining.shift();
    if (!next) break;
    result.push(next);
    sectorCount.set(next.sector, (sectorCount.get(next.sector) ?? 0) + 1);
    modelCount.set(next.model, (modelCount.get(next.model) ?? 0) + 1);
  }
  return result;
}

export function rankOpportunities(
  profile: FounderProfile,
  feedback: OpportunityFeedback = {},
  filters: OpportunityFilters = {},
  seed = 1,
  preferences?: ManualPreferences,
  preferenceSignals: OpportunityPreferenceSignal[] = [],
): RankedOpportunity[] {
  const ranked = generateOpportunityPool(seed, preferences)
    .filter((opportunity) => feedback[opportunity.id] !== "excluded")
    .filter((opportunity) => !filters.sector || opportunity.sector === filters.sector)
    .filter(
      (opportunity) =>
        !filters.capital ||
        filters.capital === "전체" ||
        opportunity.capital === filters.capital,
    )
    .map((opportunity) => rankOne(opportunity, profile, feedback, preferenceSignals))
    .sort((a, b) => b.match - a.match);

  const diversified = diversify(ranked);
  return [
    ...diversified.filter((opportunity) => feedback[opportunity.id] === "saved"),
    ...diversified.filter((opportunity) => feedback[opportunity.id] !== "saved"),
  ];
}
