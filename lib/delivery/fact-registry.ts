import type { ProjectRecord } from "../service-domain";

export type DeliveryFactStatus = "verified" | "user_input" | "calculated" | "assumption" | "needs_input";

export type DeliveryFactRecord = {
  id: string;
  label: string;
  value: string;
  status: DeliveryFactStatus;
  source: string;
};

export type DeliveryFactSummary = {
  total: number;
  verified: number;
  userInput: number;
  calculated: number;
  assumptions: number;
  needsInput: number;
};

function formatWon(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "추가 입력 필요"
    : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function text(value: unknown, fallback = "추가 입력 필요") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function buildDeliveryFactRegistry(project: ProjectRecord): DeliveryFactRecord[] {
  const setup = project.businessSetup;
  const financial = project.businessAssessment?.financial;
  const founderCapability = text(project.founderProfile?.careerSummary);
  const facts: DeliveryFactRecord[] = [
    {
      id: "business-name",
      label: "사업명",
      value: text(project.opportunity.title ?? project.title),
      status: text(project.opportunity.title ?? project.title) === "추가 입력 필요" ? "needs_input" : "user_input",
      source: "프로젝트 기본 정보",
    },
    {
      id: "target-customer",
      label: "목표 고객",
      value: text(project.opportunity.customer),
      status: text(project.opportunity.customer) === "추가 입력 필요" ? "needs_input" : "user_input",
      source: "사용자가 선택한 사업 조건",
    },
    {
      id: "region",
      label: "사업 지역",
      value: text(setup?.region),
      status: setup?.region?.trim() ? "user_input" : "needs_input",
      source: "사업 조건 입력",
    },
    {
      id: "legal-form",
      label: "사업자 형태",
      value: setup?.legalForm && setup.legalForm !== "undecided" ? setup.legalForm : "추가 입력 필요",
      status: setup?.legalForm && setup.legalForm !== "undecided" ? "user_input" : "needs_input",
      source: "사업 조건 입력",
    },
    {
      id: "founder-capability",
      label: "대표자 실행 근거",
      value: founderCapability,
      status: founderCapability === "추가 입력 필요" ? "needs_input" : "user_input",
      source: "대표자 입력",
    },
    {
      id: "gross-price",
      label: "첫 상품 판매가",
      value: formatWon(financial?.grossPrice),
      status: financial ? "calculated" : "needs_input",
      source: "저장된 가격과 세금 조건",
    },
    {
      id: "variable-cost",
      label: "건당 변동비",
      value: formatWon(financial?.variableCostPerUnit),
      status: financial ? "calculated" : "needs_input",
      source: "재료·수수료·작업비 입력",
    },
    {
      id: "contribution",
      label: "건당 남는 금액",
      value: formatWon(financial?.contributionPerUnit),
      status: financial ? "calculated" : "needs_input",
      source: "판매가 - 세금 - 건당 변동비",
    },
    {
      id: "break-even",
      label: "월 손익분기점",
      value: financial?.breakEvenUnits === null || financial?.breakEvenUnits === undefined
        ? "추가 입력 필요"
        : `${Math.ceil(financial.breakEvenUnits).toLocaleString("ko-KR")}건`,
      status: financial?.breakEvenUnits === null || financial?.breakEvenUnits === undefined ? "needs_input" : "calculated",
      source: "월 고정비 ÷ 건당 남는 금액",
    },
    {
      id: "funding-need",
      label: "총 필요자금",
      value: formatWon(financial?.totalFundingNeed),
      status: financial ? "calculated" : "needs_input",
      source: "초기 준비비 + 운전자금",
    },
  ];

  for (const evidence of project.marketWorkspace?.evidence ?? []) {
    const status: DeliveryFactStatus = evidence.verification === "verified"
      ? "verified"
      : evidence.verification === "user_supplied" ? "user_input" : "assumption";
    facts.push({
      id: `evidence-${evidence.id}`,
      label: evidence.title || evidence.metric || "시장 근거",
      value: evidence.note || `${evidence.value}${evidence.unit ? ` ${evidence.unit}` : ""}`,
      status,
      source: evidence.sourceName || evidence.sourceUrl || "시장 근거 입력",
    });
  }

  return facts;
}

export function summarizeDeliveryFacts(facts: DeliveryFactRecord[]): DeliveryFactSummary {
  return {
    total: facts.length,
    verified: facts.filter((fact) => fact.status === "verified").length,
    userInput: facts.filter((fact) => fact.status === "user_input").length,
    calculated: facts.filter((fact) => fact.status === "calculated").length,
    assumptions: facts.filter((fact) => fact.status === "assumption").length,
    needsInput: facts.filter((fact) => fact.status === "needs_input").length,
  };
}
