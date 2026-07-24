import type { FounderProfile } from "./assessment";
import type { RankedOpportunity } from "./opportunity-engine";

export type PlanningConstraints = {
  budgetWon: number;
  availableHoursPerWeek: number;
  notes: string;
  source: "questionnaire" | "conversation" | "direct";
  idea?: string;
  directDraft?: DirectIdeaDraft;
  draftGeneration?: {
    source: "openai" | "fallback";
    model: string;
  };
};

export type DirectPlanInput = {
  idea: string;
  budgetWon: number;
  availableHoursPerWeek: number;
};

export type DirectIdeaDraft = {
  problem: string;
  offerName: string;
  offerDescription: string;
  coreOutcome: string;
  firstScope: string;
  assumptions: string[];
  priceHypothesisWon?: number;
};

export function isDirectIdeaDraft(value: unknown): value is DirectIdeaDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DirectIdeaDraft>;
  return (
    typeof candidate.problem === "string" &&
    typeof candidate.offerName === "string" &&
    typeof candidate.offerDescription === "string" &&
    typeof candidate.coreOutcome === "string" &&
    typeof candidate.firstScope === "string" &&
    Array.isArray(candidate.assumptions) &&
    candidate.assumptions.every((item) => typeof item === "string") &&
    (
      candidate.priceHypothesisWon === undefined ||
      (
        typeof candidate.priceHypothesisWon === "number" &&
        Number.isInteger(candidate.priceHypothesisWon) &&
        candidate.priceHypothesisWon >= 1_000
      )
    )
  );
}

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
    (candidate.source === "questionnaire" || candidate.source === "conversation" || candidate.source === "direct") &&
    (candidate.directDraft === undefined || isDirectIdeaDraft(candidate.directDraft)) &&
    (
      candidate.draftGeneration === undefined ||
      (
        typeof candidate.draftGeneration === "object" &&
        (candidate.draftGeneration.source === "openai" || candidate.draftGeneration.source === "fallback") &&
        typeof candidate.draftGeneration.model === "string"
      )
    )
  );
}

export function planningConstraintsFromFounderProfile(value: unknown): PlanningConstraints | null {
  if (!value || typeof value !== "object") return null;
  const constraints = (value as Record<string, unknown>).planningConstraints;
  return isPlanningConstraints(constraints) ? constraints : null;
}

function directCustomer(idea: string) {
  const normalized = idea.trim().replace(/\s+/g, " ");
  const patterns = [
    /^(.{2,48}?)(?:을|를)\s*위한\s+/,
    /^(.{2,48}?)(?:에게|대상으로)\s+/,
    /^(.{2,48}?)의\s+[^.]{2,50}?(?:을|를)\s+/,
  ];
  for (const pattern of patterns) {
    const candidate = normalized.match(pattern)?.[1]?.trim();
    if (candidate && !/(서비스|사업|아이디어|플랫폼)$/.test(candidate)) return candidate;
  }
  return "첫 기획 단계에서 확인할 초기 고객";
}

function directConcept(idea: string, customer: string) {
  const firstSentence = idea.trim().replace(/\s+/g, " ").split(/[.!?\n]/)[0]?.trim() || idea;
  let concept = firstSentence
    .replace(/^.{2,48}?(?:을|를)\s*위한\s+/, "")
    .replace(/^.{2,48}?(?:에게|대상으로)\s+/, "");
  if (customer !== "첫 기획 단계에서 확인할 초기 고객") {
    concept = concept.replace(new RegExp(`^${customer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}의\\s+`), "");
  }
  return concept
    .replace(/(?:을|를)?\s*(?:운영|시작|진행|판매|제공)하고\s*싶(?:습니다|어요|다).*$/, "")
    .replace(/\s*사업을\s*하고\s*싶(?:습니다|어요|다).*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function directTitle(idea: string, customer: string) {
  const concept = directConcept(idea, customer)
    .replace(/\s*서비스$/, "")
    .replace(/월\s*구독\s*제작$/, "구독 제작");
  const words = concept.split(" ").filter(Boolean);
  let title = "";
  for (const word of words) {
    const candidate = title ? `${title} ${word}` : word;
    if (candidate.length > 30) break;
    title = candidate;
  }
  return title || "새 사업 아이디어";
}

function directBusinessModel(idea: string) {
  if (/구독|정기/.test(idea)) return /제작|영상|사진|디자인|콘텐츠/.test(idea) ? "월 구독 제작" : "월 구독 서비스";
  if (/중개|연결|매칭/.test(idea)) return "연결 수수료";
  if (/교육|수업|강의|코칭/.test(idea)) return "회차·과정 판매";
  if (/제작|대행|디자인|영상|사진/.test(idea)) return "건별 제작 서비스";
  if (/판매|쇼핑몰|상품/.test(idea)) return "상품 판매";
  return "상품·서비스 판매";
}

function directRevenue(idea: string) {
  if (/구독|정기/.test(idea)) return /제작|영상|사진|디자인|콘텐츠/.test(idea) ? "월 구독료 + 추가 제작비" : "월 구독료";
  if (/중개|연결|매칭/.test(idea)) return "건별 연결 수수료";
  if (/교육|수업|강의|코칭/.test(idea)) return "회차·과정 이용료";
  if (/제작|대행|디자인|영상|사진/.test(idea)) return "건별 제작비 + 관리비";
  return "상품·서비스 판매금액";
}

function directFirstTest(idea: string, customer: string) {
  const countUnit = /(사업자|소상공인|자영업자|기업|업체|매장|가게)/.test(customer) ? "5곳" : "5명";
  if (/(숏폼|영상).*(제작|촬영|편집)|(?:제작|촬영|편집).*(숏폼|영상)/.test(idea)) {
    return `${customer} ${countUnit}에 샘플 영상 1편과 월 4편 구독안을 제안하고, 유료 체험 2건이 성사되는지 확인하세요.`;
  }
  return `${customer} ${countUnit}에게 현재 해결 방법과 지불 의사를 확인하고, 가장 작은 유료 상품을 2건만 먼저 제공하세요.`;
}

export function createDirectOpportunity(input: DirectPlanInput): RankedOpportunity {
  const idea = input.idea.trim().replace(/\s+/g, " ");
  const customer = directCustomer(idea);
  const capital = input.budgetWon <= 3_000_000
    ? "소액"
    : input.budgetWon <= 30_000_000
      ? "중간"
      : "높음";
  const launchTime = input.availableHoursPerWeek >= 20 ? "2~6주" : "4~10주";

  return {
    id: `direct-${Date.now()}`,
    title: directTitle(idea, customer),
    oneLiner: idea,
    sector: "사용자 직접 입력",
    model: directBusinessModel(idea),
    customer,
    capital,
    launchTime,
    revenue: directRevenue(idea),
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
    firstTest: directFirstTest(idea, customer),
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
  const meaningfulExisting = Object.fromEntries(
    Object.entries(existing).filter(([key, value]) => {
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (key === "primaryCustomer" && typeof value === "string" && /(첫 기획|초기 목표|확인할.*고객)/.test(value)) return false;
      if ((key === "problemStatement" || key === "coreOutcome") && typeof value === "string" && value.trim().length < 15) return false;
      return true;
    }),
  );

  return {
    ...generated,
    ...meaningfulExisting,
    ...(mergedNotes ? { notes: mergedNotes } : {}),
  };
}
