import type { MonthlyFinancialForecast } from "./financial-model";
import { sanitizeBusinessClaimText } from "../quality/business-reality";

export type PresentationDeckType = "intro" | "ir";

export type PresentationMetric = {
  label: string;
  value: string;
  note: string;
};

export type PresentationStep = {
  title: string;
  detail: string;
};

export type PresentationPoint = {
  label: string;
  detail: string;
};

export type PresentationSource = {
  title: string;
  status: string;
  url?: string;
  observedAt?: string;
};

export type PresentationMarketEvidence = {
  metric: string;
  value: string;
  numericValue: number | null;
  unit: string;
  region: string;
  sourceName: string;
  verification: "verified" | "user_supplied" | "unverified" | "example";
  url?: string;
  observedAt?: string;
};

export type PresentationMarketTier = {
  label: "TAM" | "SAM" | "SOM";
  name: string;
  value: string;
  formula: string;
  status: string;
};

export type PresentationMatrix = {
  columns: string[];
  rows: Array<{ label: string; values: string[] }>;
  note: string;
};

export type PresentationFinancialScenario = {
  name: string;
  monthlyUnits: number;
  netRevenue: number;
  operatingProfitBeforeTax: number;
};

export type PresentationFundingUse = {
  label: string;
  amountWon: number;
};

export type PresentationChartPreset = "fit" | "traction";

export type PresentationChart = {
  preset: PresentationChartPreset;
  title: string;
  unit: string;
  items: Array<{ label: string; value: number }>;
  sourceNote: string;
};

export type PresentationSlideOverride = {
  title?: string;
  lead?: string;
  statement?: string;
  supporting?: string;
  note?: string;
  chartPreset?: PresentationChartPreset | null;
};

export type PresentationDeckDraft = {
  slides: Record<string, PresentationSlideOverride>;
  updatedAt: string;
};

export type PresentationDeckDrafts = Partial<Record<PresentationDeckType, PresentationDeckDraft>>;

export type PresentationSlideKind =
  | "cover"
  | "thesis"
  | "statement"
  | "split"
  | "process"
  | "metrics"
  | "evidence"
  | "market"
  | "matrix"
  | "financial"
  | "team"
  | "ask"
  | "timeline"
  | "funding"
  | "closing";

export type PresentationSlide = {
  id: string;
  kind: PresentationSlideKind;
  eyebrow: string;
  title: string;
  lead?: string;
  statement?: string;
  supporting?: string;
  points?: PresentationPoint[];
  steps?: PresentationStep[];
  metrics?: PresentationMetric[];
  sources?: PresentationSource[];
  note?: string;
  dark?: boolean;
  chart?: PresentationChart;
  marketTiers?: PresentationMarketTier[];
  matrix?: PresentationMatrix;
  financialScenarios?: PresentationFinancialScenario[];
  monthlyForecast?: MonthlyFinancialForecast[];
  fundingUses?: PresentationFundingUse[];
};

export type PresentationDeckInput = {
  deckType: PresentationDeckType;
  brandName: string;
  slogan: string;
  title: string;
  oneLiner: string;
  customer: string;
  model: string;
  revenue: string;
  priceWon: number;
  risk: string;
  accentColor: string;
  sector: string;
  stage: string;
  launchTime: string;
  firstTest: string;
  matchScore: number | null;
  marketScore: number | null;
  feasibilityScore: number | null;
  monthlyFixedCostWon: number | null;
  breakEvenUnits: number | null;
  totalFundingNeedWon: number | null;
  targetMonthlyUnits: number | null;
  variableCostPerUnit: number | null;
  contributionPerUnit: number | null;
  contributionMarginRate: number | null;
  breakEvenRevenueWon: number | null;
  initialInvestmentWon: number | null;
  runwayMonths: number | null;
  investmentAskWon: number | null;
  financialScenarios: PresentationFinancialScenario[];
  monthlyForecast: MonthlyFinancialForecast[];
  fundingUses: PresentationFundingUse[];
  marketEvidence: PresentationMarketEvidence[];
  teamSize: number | null;
  founderStrengths: string[];
  founderExperience: string;
  evidenceSources: PresentationSource[];
  traction: {
    interviews: number;
    proposals: number;
    purchases: number;
    revenueWon: number;
    confidenceScore: number;
  };
};

export function formatDeckMoney(value: number | null) {
  return value === null ? "확인 필요" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatDeckCompactMoney(value: number | null) {
  if (value === null) return "산정 전";
  if (value >= 100_000_000) {
    const eok = value / 100_000_000;
    return `${Number.isInteger(eok) ? eok.toFixed(0) : eok.toFixed(1)}억원`;
  }
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatDeckRate(value: number | null) {
  return value === null ? "산정 전" : `${value.toFixed(1)}%`;
}

function safe(value: string, fallback: string) {
  return value.trim() || fallback;
}

function introSlides(input: PresentationDeckInput): PresentationSlide[] {
  const sources = input.evidenceSources.length > 0
    ? input.evidenceSources.slice(0, 4)
    : [
      { title: "고객 인터뷰 원문 5건", status: "추가 확인 필요" },
      { title: "현재 대안과 경쟁 서비스 3개 비교", status: "추가 확인 필요" },
      { title: "공식 통계의 정의·지역·기준일", status: "추가 확인 필요" },
      { title: "시장 규모 원문", status: "확인 전 수치 사용 금지" },
    ];

  return [
    {
      id: "cover",
      kind: "cover",
      eyebrow: "BUSINESS INTRODUCTION",
      title: input.brandName,
      lead: safe(input.slogan, input.oneLiner),
      supporting: "사업소개서 · 수정 가능한 초안",
      dark: true,
    },
    {
      id: "overview",
      kind: "statement",
      eyebrow: "01 · 한눈에 보기",
      title: "고객이 바로 이해할 한 문장",
      statement: input.oneLiner,
      supporting: `${input.customer}에게 ${input.model} 방식으로 첫 결과를 제공합니다.`,
    },
    {
      id: "problem",
      kind: "split",
      eyebrow: "02 · 고객 문제",
      title: "고객의 불편이 출발점입니다",
      lead: input.customer,
      points: [
        { label: "핵심 고객", detail: input.customer },
        { label: "해결할 문제", detail: input.oneLiner },
        { label: "확인할 행동", detail: "최근 해결 방법, 사용 빈도와 실제 지출을 인터뷰로 확인합니다." },
      ],
      note: "확인되지 않은 문제 빈도와 시장 수치는 가정으로 구분합니다.",
    },
    {
      id: "solution",
      kind: "process",
      eyebrow: "03 · 해결 방식",
      title: "고객은 네 단계로 결과를 받습니다",
      lead: "복잡한 기능보다 신청부터 완료까지의 경험을 먼저 설계합니다.",
      steps: [
        { title: "신청", detail: "상황과 원하는 결과 확인" },
        { title: "진단", detail: "제공 범위와 위험 정리" },
        { title: "제공", detail: input.model },
        { title: "확인", detail: "완료 기준과 고객 반응 기록" },
      ],
    },
    {
      id: "offer",
      kind: "metrics",
      eyebrow: "04 · 첫 상품",
      title: "첫 상품은 작고 명확하게 판매합니다",
      lead: "한 번에 이해하고 구매할 수 있는 최소 상품부터 검증합니다.",
      metrics: [
        { label: "권장 첫 가격", value: formatDeckMoney(input.priceWon), note: "실제 원가 확인 후 수정" },
        { label: "제공 방식", value: input.model, note: "완료 기준을 계약 전 공개" },
        { label: "출시 예상", value: safe(input.launchTime, "확인 필요"), note: "첫 판매까지 준비 기간" },
        { label: "수익 방식", value: input.revenue, note: "반복 결제 가능성 검증" },
      ],
      dark: true,
    },
    {
      id: "customer-scene",
      kind: "split",
      eyebrow: "05 · 고객과 이용 장면",
      title: "첫 구매가 일어나는 장면부터 좁힙니다",
      lead: safe(input.sector, "사업 분야 확인 필요"),
      points: [
        { label: "누가", detail: input.customer },
        { label: "언제", detail: input.oneLiner },
        { label: "어떻게 검증", detail: safe(input.firstTest, "실제 고객 인터뷰와 유료 제안") },
      ],
      note: "넓은 전체 시장보다 첫 고객의 구체적인 구매 상황을 먼저 정의합니다.",
    },
    {
      id: "evidence",
      kind: "evidence",
      eyebrow: "06 · 시장 근거",
      title: "시장성은 출처와 고객 행동으로 확인합니다",
      lead: input.evidenceSources.length > 0
        ? "저장된 자료를 출발점으로 사용하고, 공유 전 원문과 기준일을 다시 확인합니다."
        : "현재 확인된 시장 자료가 없어 숫자를 임의로 만들지 않았습니다.",
      sources,
      note: "출처가 없는 시장 규모, 가상의 고객 반응과 확인 전 통계는 표시하지 않습니다.",
    },
    {
      id: "economics",
      kind: "metrics",
      eyebrow: "07 · 수익 구조",
      title: "판매가와 비용이 맞아야 반복할 수 있습니다",
      lead: "저장된 계산을 사용하며 실제 견적이 들어오면 다시 계산합니다.",
      metrics: [
        { label: "판매가", value: formatDeckMoney(input.priceWon), note: input.revenue },
        { label: "월 고정비", value: formatDeckMoney(input.monthlyFixedCostWon), note: "현재 입력 기준" },
        { label: "손익분기", value: input.breakEvenUnits === null ? "확인 필요" : `월 ${Math.ceil(input.breakEvenUnits)}건`, note: "판매 건수 기준" },
        { label: "준비 자금", value: formatDeckMoney(input.totalFundingNeedWon), note: "초기비와 운전자금" },
      ],
    },
    {
      id: "go-to-market",
      kind: "process",
      eyebrow: "08 · 첫 시장 진입",
      title: "첫 고객은 네 번의 실행으로 만듭니다",
      lead: "큰 광고보다 작은 유료 검증으로 구매 이유를 먼저 확인합니다.",
      steps: [
        { title: "고객 확인", detail: "문제와 현재 지출 확인" },
        { title: "유료 제안", detail: "한 상품·한 가격 제안" },
        { title: "직접 제공", detail: "시간·비용·불편 기록" },
        { title: "반복 판단", detail: "구매·재구매 근거로 확대" },
      ],
    },
    {
      id: "advantage",
      kind: "split",
      eyebrow: "09 · 차별점",
      title: "더 많은 기능보다 더 빠른 학습이 경쟁력입니다",
      lead: "고객 결과",
      points: [
        { label: "명확성", detail: "고객의 문제와 받을 결과를 한 문장으로 설명합니다." },
        { label: "신뢰", detail: "제공 범위·완료 기준·환불 조건을 투명하게 공개합니다." },
        { label: "학습", detail: "실제 주문 데이터를 가격과 운영 방식에 계속 반영합니다." },
      ],
      note: "확정되지 않은 기술·특허·제휴는 차별점으로 표시하지 않습니다.",
    },
    {
      id: "risk",
      kind: "split",
      eyebrow: "10 · 운영과 위험",
      title: "반복하기 전에 운영 위험을 먼저 닫습니다",
      lead: safe(input.risk, "업종별 인허가와 책임 범위 확인 필요"),
      points: [
        { label: "책임", detail: "계약·결제·제공·환불의 담당과 기록 방식을 정합니다." },
        { label: "개인정보", detail: "필요한 항목만 받고 보유 기간 뒤 삭제합니다." },
        { label: "최종 확인", detail: "외부 공유 전 수치·출처·연락처를 다시 확인합니다." },
      ],
    },
    {
      id: "closing",
      kind: "closing",
      eyebrow: "NEXT CONVERSATION",
      title: "함께 확인할 다음 단계",
      statement: safe(input.firstTest, "첫 고객과 실제 문제·가격·제공 방식을 확인합니다."),
      supporting: "연락처와 대표자 정보는 공유 전에 직접 입력하세요.",
      dark: true,
    },
  ];
}

function irSlides(input: PresentationDeckInput): PresentationSlide[] {
  const traction = input.traction;
  const hasTraction = traction.interviews + traction.proposals + traction.purchases > 0;
  const proposalConversion = traction.proposals > 0 ? traction.purchases / traction.proposals * 100 : null;
  const marketAnchor = input.marketEvidence.find((item) => item.verification === "verified" && item.numericValue !== null)
    ?? input.marketEvidence.find((item) => item.verification === "example" && item.numericValue !== null);
  const marketValue = marketAnchor
    ? marketAnchor.value + (marketAnchor.unit && !marketAnchor.value.includes(marketAnchor.unit) ? marketAnchor.unit : "")
    : "산정 전";
  const marketStatus = marketAnchor
    ? (marketAnchor.verification === "verified" ? "공식 원문 확인" : "가상 사례 계산") + " · " + marketAnchor.sourceName
    : "공식 원문과 기준일 입력 필요";
  const marketTiers: PresentationMarketTier[] = [
    {
      label: "TAM",
      name: "전체 시장",
      value: marketValue,
      formula: marketAnchor ? marketAnchor.metric + " · " + (marketAnchor.region || "지역 확인 필요") : "전체 잠재 고객 수 × 연간 객단가",
      status: marketStatus,
    },
    {
      label: "SAM",
      name: "실제 제공 가능 시장",
      value: "산정 전",
      formula: "제공 가능 지역·고객군 × 연간 구매 빈도 × 객단가",
      status: "지역과 고객 범위를 좁힌 뒤 계산",
    },
    {
      label: "SOM",
      name: "12개월 확보 목표",
      value: input.targetMonthlyUnits === null ? "산정 전" : "연 " + Math.round(input.targetMonthlyUnits * 12).toLocaleString("ko-KR") + "건",
      formula: "월 목표 판매량 × 12개월",
      status: "획득 경로별 전환율로 재검증",
    },
  ];
  const askValue = input.investmentAskWon ?? input.totalFundingNeedWon;
  const askLabel = input.investmentAskWon === null ? "검증 필요자금" : "투자 요청금액";
  const teamLabel = input.teamSize === null ? "구성 입력 전" : input.teamSize + "명";
  const founderStrength = input.founderStrengths.length > 0
    ? input.founderStrengths.slice(0, 3).join(" · ")
    : "대표자 강점 입력 필요";
  const fundingUses = input.fundingUses.filter((item) => item.amountWon > 0).slice(0, 4);

  return [
    {
      id: "cover",
      kind: "cover",
      eyebrow: "CONFIDENTIAL · INVESTMENT DECK",
      title: input.brandName,
      lead: safe(input.slogan, input.oneLiner),
      supporting: safe(input.stage, "초기 검증") + " · 투자제안서(IR)",
      dark: true,
    },
    {
      id: "investment-thesis",
      kind: "thesis",
      eyebrow: "01 · INVESTMENT THESIS",
      title: "투자자가 30초 안에 볼 핵심",
      lead: input.oneLiner,
      metrics: [
        { label: "고객", value: input.customer, note: "첫 구매 고객군" },
        { label: "현재 단계", value: safe(input.stage, "초기 검증"), note: "저장된 사업 진행 기준" },
        {
          label: "검증 신호",
          value: hasTraction ? "구매 " + traction.purchases + "건" : "실적 전",
          note: hasTraction
            ? "제안→구매 " + (proposalConversion === null ? "산정 전" : proposalConversion.toFixed(1) + "%")
            : "고객 행동 근거 확보 필요",
        },
        {
          label: askLabel,
          value: formatDeckCompactMoney(askValue),
          note: input.investmentAskWon === null ? "투자 요청액·기업가치는 별도 확정" : "이번 라운드 요청액",
        },
      ],
      note: input.model + " 방식으로 제공하고 " + input.revenue + " 구조를 검증합니다.",
    },
    {
      id: "problem",
      kind: "split",
      eyebrow: "02 · PROBLEM & WHY NOW",
      title: "누가, 얼마나 자주, 무엇 때문에 돈을 쓰는가",
      lead: input.customer,
      points: [
        { label: "해결할 문제", detail: input.oneLiner },
        { label: "현재 대안", detail: "고객이 지금 쓰는 방법·시간·비용을 인터뷰와 결제 기록으로 비교합니다." },
        {
          label: "지금인 이유",
          detail: input.evidenceSources.length > 0
            ? "연결된 시장 원문과 고객 행동을 기준으로 시점을 설명합니다."
            : "정책·기술·행동 변화의 공식 근거를 추가해야 합니다.",
        },
      ],
      note: "문제 빈도와 지불 비용이 확인되지 않으면 투자 가설로 표시합니다.",
    },
    {
      id: "solution",
      kind: "process",
      eyebrow: "03 · SOLUTION & PRODUCT",
      title: "고객 결과가 생기는 제품 흐름",
      lead: input.model + " 방식의 핵심 경험과 반복 가능한 운영 구조를 함께 보여줍니다.",
      steps: [
        { title: "발견", detail: "고객의 문제 상황과 의도 확인" },
        { title: "전환", detail: "범위·가격·완료 기준 제안" },
        { title: "가치 제공", detail: input.model },
        { title: "반복", detail: "결과·원가·재구매 데이터 축적" },
      ],
    },
    {
      id: "market-opportunity",
      kind: "market",
      eyebrow: "04 · MARKET OPPORTUNITY",
      title: "TAM·SAM·SOM을 같은 기준으로 좁힙니다",
      lead: marketAnchor
        ? "확인된 기준값과 명시된 산정식만 사용합니다."
        : "시장 숫자를 만들지 않고, 필요한 원문과 계산식을 먼저 표시했습니다.",
      marketTiers,
      sources: input.evidenceSources.slice(0, 3),
      note: "같은 단위와 기준일로 계산하고 출처 없는 숫자는 투자자 공유본에 넣지 않습니다.",
    },
    {
      id: "business-model",
      kind: "metrics",
      eyebrow: "05 · BUSINESS MODEL",
      title: "매출 구조와 단위 경제성",
      lead: "가격, 건당 공헌이익, 손익분기점을 한 화면에서 검토합니다.",
      metrics: [
        { label: "판매가", value: formatDeckCompactMoney(input.priceWon), note: input.revenue },
        {
          label: "건당 공헌이익",
          value: formatDeckCompactMoney(input.contributionPerUnit),
          note: "변동비 " + formatDeckCompactMoney(input.variableCostPerUnit),
        },
        { label: "공헌이익률", value: formatDeckRate(input.contributionMarginRate), note: "판매 1건이 고정비에 기여하는 비율" },
        {
          label: "손익분기점",
          value: input.breakEvenUnits === null ? "산정 전" : "월 " + Math.ceil(input.breakEvenUnits) + "건",
          note: input.breakEvenRevenueWon === null ? "매출 기준 산정 전" : "매출 " + formatDeckCompactMoney(input.breakEvenRevenueWon),
        },
      ],
      dark: true,
    },
    {
      id: "traction",
      kind: "metrics",
      eyebrow: "06 · TRACTION",
      title: hasTraction ? "고객 행동이 어디까지 이어졌는가" : "실적 전 단계와 다음 검증 기준",
      lead: hasTraction ? "저장된 실행 결과만 표시합니다." : "가상의 매출이나 고객 수를 넣지 않았습니다.",
      metrics: [
        { label: "문제 확인", value: traction.interviews + "건", note: "고객 인터뷰" },
        { label: "가격 제안", value: traction.proposals + "건", note: "구매 의사 확인" },
        {
          label: "실제 구매",
          value: traction.purchases + "건",
          note: proposalConversion === null ? "전환율 산정 전" : "제안 대비 " + proposalConversion.toFixed(1) + "%",
        },
        { label: "누적 매출", value: formatDeckCompactMoney(traction.revenueWon), note: "근거 신뢰도 " + Math.round(traction.confidenceScore) + "%" },
      ],
    },
    {
      id: "competition",
      kind: "matrix",
      eyebrow: "07 · COMPETITION",
      title: "고객의 현재 대안부터 비교합니다",
      lead: "경쟁사 이름만 나열하지 않고 구매 기준별로 비교합니다.",
      matrix: {
        columns: ["비교 기준", "직접 해결·검색", "기존 전문 서비스", input.brandName],
        rows: [
          { label: "시작 속도", values: ["정보 탐색 필요", "상담 후 결정", "조건 확인 후 바로 제안"] },
          { label: "가격·범위", values: ["직접 판단", "업체별 상이", "가격·완료 기준 사전 공개"] },
          { label: "결과 기록", values: ["개인 메모", "제공 결과 중심", "결과·원가·반복 행동 축적"] },
          { label: "확장 근거", values: ["제한적", "운영자 경험 의존", "표준 흐름과 데이터 기반"] },
        ],
        note: "현재 비교 가설입니다. 실제 경쟁사명·가격·후기 원문을 확인한 뒤 최종 확정하세요.",
      },
    },
    {
      id: "go-to-market",
      kind: "process",
      eyebrow: "08 · GO-TO-MARKET",
      title: "첫 고객 획득 경로와 전환 기준",
      lead: "넓은 광고보다 한 고객군·한 메시지·한 유료 제안으로 획득 비용을 측정합니다.",
      steps: [
        { title: "접점", detail: "고객이 이미 모이는 한 경로 선택" },
        { title: "활성화", detail: "문제 진단 또는 첫 상담 완료" },
        { title: "매출", detail: "한 상품·한 가격의 유료 전환" },
        { title: "유지", detail: "재구매·추천·반복 이용 측정" },
      ],
    },
    {
      id: "growth-engine",
      kind: "process",
      eyebrow: "09 · GROWTH ENGINE",
      title: "반복 매출로 이어지는 성장 구조",
      lead: "채널을 늘리기 전 전환율, 공헌이익, 재구매 가운데 최소 두 가지를 확인합니다.",
      steps: [
        { title: "고객 학습", detail: "문제·구매 이유를 같은 형식으로 기록" },
        { title: "상품 개선", detail: "범위·가격·제공 시간을 표준화" },
        { title: "운영 효율", detail: "건당 원가와 처리 시간을 낮춤" },
        { title: "재투자", detail: "남는 공헌이익을 검증된 채널에 투입" },
      ],
    },
    {
      id: "financial-scenarios",
      kind: "financial",
      eyebrow: "10 · 12-MONTH FINANCIAL PLAN",
      title: "입력값으로 계산한 12개월 월별 손익 계획",
      lead: "월 고정비 " + formatDeckCompactMoney(input.monthlyFixedCostWon)
        + " · 손익분기 " + (input.breakEvenUnits === null ? "산정 전" : "월 " + Math.ceil(input.breakEvenUnits) + "건"),
      financialScenarios: input.financialScenarios,
      monthlyForecast: input.monthlyForecast,
      note: "입력한 가격·원가·고정비·목표 판매량으로 계산한 12개월 계획이며 실적이나 확정 전망이 아닙니다.",
    },
    {
      id: "team",
      kind: "team",
      eyebrow: "11 · TEAM & FOUNDER-MARKET FIT",
      title: "왜 이 팀이 이 문제를 풀 수 있는가",
      lead: input.founderExperience || "관련 경력·업종 경험·고객 접근 경로를 입력해야 합니다.",
      points: [
        { label: "대표 강점", detail: founderStrength + " · 성향 진단 기반" },
        { label: "현재 팀", detail: teamLabel + " · 역할과 투입 가능 시간을 확인해야 합니다." },
        { label: "보완할 핵심 역할", detail: "제품·판매·운영 중 비어 있는 책임자와 채용 시점을 입력합니다." },
      ],
      note: "성향 점수는 경력 증빙이 아닙니다. 실제 이력·성과·전문성을 확인한 뒤 공유하세요.",
    },
    {
      id: "funding-ask",
      kind: "ask",
      eyebrow: "12 · FUNDING ASK",
      title: "투자 요청액, 사용처, 자금으로 만들 성과",
      lead: input.investmentAskWon === null ? "확정 전" : formatDeckCompactMoney(input.investmentAskWon),
      supporting: input.investmentAskWon === null
        ? "현재 계산상 검증 필요자금 " + formatDeckCompactMoney(input.totalFundingNeedWon) + " · 투자 요청액과 기업가치는 대표자 확정 필요"
        : "이번 투자 라운드 요청금액",
      fundingUses,
      points: [
        { label: "3개월", detail: "문제·가격·첫 구매의 실증 자료 확보" },
        { label: "6개월", detail: "반복 가능한 제공 범위와 공헌이익 확인" },
        { label: "12개월", detail: "검증된 채널의 전환율·재구매 근거 확보" },
      ],
      note: "현재 계산 자금 " + formatDeckCompactMoney(input.totalFundingNeedWon)
        + " · 초기비 " + formatDeckCompactMoney(input.initialInvestmentWon)
        + " · 운전자금 기간 " + (input.runwayMonths === null ? "산정 전" : input.runwayMonths.toFixed(1) + "개월"),
      dark: true,
    },
    {
      id: "milestones",
      kind: "timeline",
      eyebrow: "13 · MILESTONES",
      title: "자금 집행 뒤 판정할 3·6·12개월 목표",
      lead: safe(input.firstTest, "첫 유료 고객과 단위 경제성을 확인한 뒤 확장합니다."),
      steps: [
        { title: "3개월", detail: "첫 유료 고객·실제 원가·핵심 문제 확인" },
        { title: "6개월", detail: "전환율·공헌이익·반복 제공 가능성 확인" },
        { title: "12개월", detail: "재구매·획득비용·확장 채널 투자 판단" },
      ],
      note: "각 목표에는 담당자·기준값·증빙 위치를 연결해야 합니다.",
    },
    {
      id: "risk",
      kind: "split",
      eyebrow: "14 · RISK & DUE DILIGENCE",
      title: "투자 전에 확인할 핵심 위험",
      lead: safe(input.risk, "인허가·시장 수요·원가 확인 필요"),
      points: [
        { label: "시장", detail: "고객 문제 빈도·현재 지출·재구매를 실제 행동으로 확인" },
        { label: "재무", detail: "원가·세금·획득비용이 가정을 벗어나면 가격과 범위 조정" },
        { label: "법무·팀", detail: "인허가·개인정보·계약과 핵심 역할 공백을 실사 목록으로 관리" },
      ],
      note: "미확인 항목을 숨기지 않고 검증 방법과 책임자를 함께 제시합니다.",
    },
    {
      id: "closing",
      kind: "closing",
      eyebrow: "15 · INVESTMENT CONVERSATION",
      title: "다음 투자 검토를 위한 요청",
      statement: formatDeckCompactMoney(askValue) + "의 자금으로 고객, 단위 경제성, 반복 성장의 근거를 만듭니다.",
      supporting: "대표자·연락처·투자 조건·기업가치는 공유 전에 직접 확정하세요.",
      dark: true,
    },
  ];
}
export function buildPresentationSlides(input: PresentationDeckInput) {
  const slides = input.deckType === "ir" ? irSlides(input) : introSlides(input);
  return slides.map((slide) => sanitizePresentationSlide(slide, input));
}

function presentationClaimEvidence(input: PresentationDeckInput) {
  const verifiedMarket = input.marketEvidence
    .filter((item) => item.verification === "verified" || item.verification === "user_supplied")
    .map((item) => [item.metric, item.value, item.unit, item.region, item.sourceName].filter(Boolean).join(" "));
  return {
    inputText: [
      input.founderExperience,
      ...verifiedMarket,
      `고객 인터뷰 ${input.traction.interviews}건을 완료했습니다`,
      `가격 제안 ${input.traction.proposals}건을 완료했습니다`,
      `실제 구매 ${input.traction.purchases}건을 기록했습니다`,
      `매출 ${input.traction.revenueWon}원을 기록했습니다`,
    ].filter(Boolean),
    sourceUrls: [
      ...input.marketEvidence.flatMap((item) => item.url ? [item.url] : []),
      ...input.evidenceSources.flatMap((item) => item.url ? [item.url] : []),
    ],
    founderText: input.founderExperience,
  };
}

function sanitizePresentationText(value: string | undefined, input: PresentationDeckInput) {
  if (typeof value !== "string") return value;
  return sanitizeBusinessClaimText(value, presentationClaimEvidence(input)).text.replaceAll("**", "");
}

function sanitizePresentationSlide(slide: PresentationSlide, input: PresentationDeckInput): PresentationSlide {
  return {
    ...slide,
    title: sanitizePresentationText(slide.title, input) ?? slide.title,
    lead: sanitizePresentationText(slide.lead, input),
    statement: sanitizePresentationText(slide.statement, input),
    supporting: sanitizePresentationText(slide.supporting, input),
    note: sanitizePresentationText(slide.note, input),
    points: slide.points?.map((point) => ({
      label: sanitizePresentationText(point.label, input) ?? point.label,
      detail: sanitizePresentationText(point.detail, input) ?? point.detail,
    })),
    steps: slide.steps?.map((step) => ({
      title: sanitizePresentationText(step.title, input) ?? step.title,
      detail: sanitizePresentationText(step.detail, input) ?? step.detail,
    })),
  };
}

function buildPresentationChart(input: PresentationDeckInput, preset: PresentationChartPreset) {
  if (preset === "fit") {
    const items = [
      { label: "나와의 적합도", value: input.matchScore },
      { label: "시장성", value: input.marketScore },
      { label: "실행 가능성", value: input.feasibilityScore },
    ].filter((item): item is { label: string; value: number } => item.value !== null);
    if (items.length < 2) return undefined;
    return {
      preset,
      title: "현재 저장된 사업 평가",
      unit: "점",
      items,
      sourceNote: "사용자 답변과 사업 조건으로 계산한 참고 점수이며 외부 시장 통계가 아닙니다.",
    } satisfies PresentationChart;
  }

  const items = [
    { label: "고객 인터뷰", value: input.traction.interviews },
    { label: "가격 제안", value: input.traction.proposals },
    { label: "실제 구매", value: input.traction.purchases },
  ];
  if (items.every((item) => item.value === 0)) return undefined;
  return {
    preset,
    title: "실제 고객 검증 흐름",
    unit: "건",
    items,
    sourceNote: "프로젝트 실행 도우미에 저장된 실제 기록만 사용합니다.",
  } satisfies PresentationChart;
}

export function applyPresentationDraft(
  slides: PresentationSlide[],
  draft: PresentationDeckDraft | undefined,
  input: PresentationDeckInput,
) {
  if (!draft) return slides.map((slide) => sanitizePresentationSlide(slide, input));
  return slides.map((slide) => {
    const override = draft.slides[slide.id];
    if (!override) return sanitizePresentationSlide(slide, input);
    const next = { ...slide };
    const textFields = ["title", "lead", "statement", "supporting", "note"] as const;
    for (const field of textFields) {
      if (typeof override[field] === "string") next[field] = override[field];
    }
    if (override.chartPreset) next.chart = buildPresentationChart(input, override.chartPreset);
    return sanitizePresentationSlide(next, input);
  });
}
