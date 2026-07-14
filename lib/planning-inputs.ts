import type { FounderProfile } from "./assessment";
import type { RankedOpportunity } from "./opportunity-engine";

export type PlanningConstraints = {
  budgetWon: number;
  availableHoursPerWeek: number;
  notes: string;
  source: "conversation" | "direct";
  idea?: string;
};

export type DirectPlanInput = {
  idea: string;
  budgetWon: number;
  availableHoursPerWeek: number;
};

export function isPlanningConstraints(value: unknown): value is PlanningConstraints {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlanningConstraints>;
  return (
    typeof candidate.budgetWon === "number" &&
    Number.isFinite(candidate.budgetWon) &&
    candidate.budgetWon >= 0 &&
    typeof candidate.availableHoursPerWeek === "number" &&
    Number.isFinite(candidate.availableHoursPerWeek) &&
    candidate.availableHoursPerWeek >= 1 &&
    typeof candidate.notes === "string" &&
    (candidate.source === "conversation" || candidate.source === "direct")
  );
}

function directTitle(idea: string) {
  const normalized = idea.trim().replace(/\s+/g, " ");
  const firstSentence = normalized.split(/[.!?\n]/)[0]?.trim() || normalized;
  return firstSentence.length > 42 ? `${firstSentence.slice(0, 42)}...` : firstSentence;
}

export function createDirectOpportunity(input: DirectPlanInput): RankedOpportunity {
  const idea = input.idea.trim().replace(/\s+/g, " ");
  const capital = input.budgetWon <= 3_000_000
    ? "소액"
    : input.budgetWon <= 30_000_000
      ? "중간"
      : "높음";
  const launchTime = input.availableHoursPerWeek >= 20 ? "2~6주" : "4~10주";

  return {
    id: `direct-${Date.now()}`,
    title: directTitle(idea),
    oneLiner: idea,
    sector: "사용자 직접 입력",
    model: "맞춤 사업 모델",
    customer: "첫 기획 단계에서 확인할 초기 고객",
    capital,
    launchTime,
    revenue: "고객 검증 후 가격과 수익 구조 확정",
    stage: "기획 시작",
    riasec: ["E", "I", "C"],
    founder: ["opportunity", "execution", "customer"],
    market: 0,
    novelty: 0,
    feasibility: capital === "소액" ? 78 : capital === "중간" ? 66 : 52,
    evidenceStatus: "hypothesis",
    evidenceSources: [],
    regulation: 50,
    skills: ["고객 확인", "상품 설계", "실행 운영"],
    risk: "사용자가 직접 입력한 가설입니다. 업종, 제공 방식, 사업장 조건에 따라 인허가와 실제 수요를 먼저 확인해야 합니다.",
    firstTest: "아이디어의 대상이 될 수 있는 고객 5명에게 현재 해결 방법과 지불 의사를 확인하고, 핵심 결과 한 가지만 수동으로 제공하세요.",
    color: "sage",
    match: 100,
    reasons: ["사용자가 직접 선택한 사업 아이디어입니다", "입력한 예산과 시간을 첫 실행 범위에 반영합니다"],
    caution: "추천 점수가 아니라 사용자 선택으로 시작한 사업입니다. 시장성과 인허가는 기획 과정에서 별도로 확인합니다.",
    scoreBreakdown: {
      personalFit: 100,
      market: null,
      feasibility: capital === "소액" ? 78 : capital === "중간" ? 66 : 52,
      novelty: null,
    },
  };
}

export function createInitialStageInputs(
  opportunity: RankedOpportunity,
  constraints: PlanningConstraints,
) {
  return {
    goal: `${opportunity.title} 아이디어를 입력한 예산과 시간 안에서 검증하고 첫 고객 실행안까지 완성하기`,
    availableHoursPerWeek: constraints.availableHoursPerWeek,
    budgetWon: constraints.budgetWon,
    mustAvoid: [],
    existingAssets: [],
    referenceUrls: [],
    notes: constraints.notes,
  };
}

export function createFounderProfilePayload(
  profile: FounderProfile,
  constraints: PlanningConstraints | null,
): FounderProfile & { planningConstraints?: PlanningConstraints } {
  return constraints
    ? { ...profile, planningConstraints: constraints }
    : profile;
}

export function mergeStageInputs(
  generated: Record<string, unknown>,
  existing: Record<string, unknown>,
  addedNotes: string,
): Record<string, unknown> {
  const existingNotes = typeof existing.notes === "string" ? existing.notes.trim() : "";
  const newNotes = addedNotes.trim();
  const mergedNotes = [...new Set([existingNotes, newNotes].filter(Boolean))].join("\n");

  return {
    ...generated,
    ...existing,
    ...(mergedNotes ? { notes: mergedNotes } : {}),
  };
}
