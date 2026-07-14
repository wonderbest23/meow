import type { ProjectRecord } from "../service-domain";
import { archetypeLabels, legalFormLabels, workplaceLabels } from "../business/domain";
import {
  appendDeliveryAssurance,
  enhanceDeliveryBody,
  evaluateDeliveryDocument,
  evaluateDeliveryPackage,
  packageQualityMarkdown,
  type DeliveryDocumentQuality,
  type DeliveryPackageQuality,
} from "./quality-gate";

export type DeliveryItem = {
  id: string;
  title: string;
  type: string;
  stageIndex: number | null;
  source: "approved_artifact" | "server_package" | "missing";
  versionLabel: string;
  approvedArtifactId: string | null;
  generatedAt: string | null;
  markdown: string;
  complete: boolean;
  contentReady?: boolean;
  qualityReason?: string | null;
  quality?: DeliveryDocumentQuality;
};

const fieldLabels: Record<string, string> = {
  problem: "고객 문제",
  customer: "목표 고객",
  valueProposition: "제안 가치",
  constraints: "실행 조건",
  budgetWon: "사용 가능한 예산",
  mustAvoid: "반드시 피할 일",
  firstScope: "처음 제공할 범위",
  excludedScope: "처음에는 하지 않을 범위",
  existingAssets: "이미 가진 자료와 도구",
  availableHoursPerWeek: "주당 투입 가능 시간",
  validationPlan: "검증 계획",
  day21Goal: "21일 목표",
  businessReadiness: "사업 시작 준비 상태",
  region: "사업 지역",
  archetype: "사업 유형",
  legalForm: "사업자 형태",
  workplaceType: "사업장 형태",
  hardBlockCount: "반드시 해결할 항목 수",
  requiredActions: "먼저 해야 할 일",
  primaryCustomer: "핵심 고객",
  jobs: "고객이 해결하려는 일",
  pains: "불편과 손실",
  currentAlternatives: "현재 쓰는 대안",
  evidence: "수집 근거",
  status: "확인 상태",
  items: "세부 내용",
  interviewPlan: "인터뷰 계획",
  interviewScript: "인터뷰 질문",
  unknowns: "미확인 사항",
  tiers: "상품 구성",
  name: "이름",
  outcome: "고객이 얻는 결과",
  priceWon: "판매가",
  includes: "포함 내용",
  excludes: "제외 내용",
  deliveryDays: "납품까지 걸리는 날",
  revisionCount: "포함된 수정 횟수",
  unitEconomics: "한 건 판매 시 손익",
  sellingPriceWon: "고객 판매가",
  netPriceWon: "부가세를 제외한 매출",
  variableCostWon: "한 건당 변동비",
  contributionWon: "한 건을 팔고 남는 금액",
  marginRate: "매출 대비 남는 비율",
  breakEvenCustomers: "손익분기 고객 수",
  breakEvenRevenueWon: "손익분기 매출",
  monthlyFixedCostWon: "월 고정비",
  initialInvestmentWon: "초기 투자비",
  recommendedWorkingCapitalWon: "권장 운전자금",
  totalFundingNeedWon: "총 필요자금",
  scenarios: "판매량별 예상 손익",
  volumeFactor: "기준 판매량 대비 배수",
  monthlyUnits: "월 판매 건수",
  variableCosts: "월 변동비",
  contribution: "월 고정비를 내기 전 남는 금액",
  operatingProfitBeforeTax: "세전 영업이익",
  financialWarnings: "재무 주의사항",
  assumptions: "검증할 가정",
  pricingTests: "가격 검증",
  nameCandidates: "이름 후보",
  nameSelectionRule: "이름 선택 기준",
  promise: "고객에게 할 약속",
  slogans: "한 줄 소개 문구",
  toneWords: "표현 분위기",
  tone: "표현 분위기",
  keywords: "핵심 단어",
  selectionGuide: "이름 선택 기준",
  prohibitedClaims: "금지 표현",
  usageExamples: "사용 예시",
  blocks: "판매 페이지 구성",
  type: "구성 역할",
  headline: "핵심 문구",
  subheadline: "보조 설명",
  cta: "신청 버튼 문구",
  title: "제목",
  body: "설명",
  question: "질문",
  answer: "답변",
  button: "버튼 문구",
  contact: "문의 방법",
  method: "연락 방식",
  value: "연락 정보",
  legalNotice: "주의·법적 안내",
  outreachScripts: "고객 접촉 문구",
  interview: "인터뷰 요청 문구",
  offer: "가격 제안 문구",
  followUp: "후속 연락 문구",
  channelPlan: "고객 경로 계획",
  weeklyMetrics: "주간 지표",
  contacts: "접촉 수",
  interviews: "인터뷰 수",
  proposals: "제안 수",
  paidCustomers: "결제 고객 수",
  supportProgramChecklist: "지원사업 준비 항목",
  launchDate: "시작 예정일",
  next30Days: "30일 실행계획",
  decisionCriteria: "계속·수정·중단 기준",
  totals: "전체 실행 결과",
  reached: "직접 접촉 수",
  impressions: "노출 수",
  clicks: "클릭 수",
  landingVisitors: "판매 페이지 방문 수",
  inquiries: "문의 수",
  purchases: "구매 수",
  refunds: "환불 수",
  refundAmount: "환불 금액",
  revenue: "매출",
  adSpend: "광고·홍보비",
  variableCost: "변동비",
  funnel: "구매까지의 전환 흐름",
  clickThroughRate: "노출 중 클릭 비율",
  visitorToInquiryRate: "방문자 중 문의 비율",
  inquiryToProposalRate: "문의 중 제안 비율",
  proposalToPurchaseRate: "제안 중 구매 비율",
  visitorToPurchaseRate: "방문자 중 구매 비율",
  refundRate: "환불 비율",
  calibratedFinancials: "실제 결과로 다시 계산한 손익",
  observedAveragePrice: "실제 평균 판매가",
  observedVariableCostPerPurchase: "구매 1건당 실제 변동비",
  customerAcquisitionCost: "고객 1명 확보비용",
  observedContributionPerPurchase: "구매 1건당 실제로 남은 금액",
  observedContributionMarginRate: "실제 매출 대비 남은 비율",
  observedBreakEvenUnits: "실제 손익분기 판매 건수",
  netRevenue: "환불을 제외한 매출",
  verdicts: "가설별 판정",
  hypothesisId: "가설 번호",
  category: "가설 종류",
  verdict: "판정 결과",
  confidence: "판정 신뢰도",
  nextAction: "다음 행동",
  bestChannel: "현재 가장 효과적인 경로",
  channel: "고객을 만난 경로",
  acquisitionCost: "고객 1명 확보비용",
  confidenceScore: "전체 자료 신뢰도",
  warnings: "주의사항",
  recommendedActions: "권장 다음 행동",
  generatedAt: "생성 시각",
  modelVersion: "계산 규칙 버전",
};

const valueLabels: Record<string, string> = {
  digital_service: "온라인 서비스·소프트웨어",
  ecommerce: "온라인 판매",
  local_retail: "오프라인 매장·소매",
  professional_service: "전문·방문 서비스",
  manufacturing: "제조·제품",
  regulated: "인허가 확인이 필요한 업종",
  undecided: "아직 결정하지 않음",
  sole_proprietor: "개인사업자",
  corporation: "법인사업자",
  home: "자택",
  soho: "소호·비상주 사무실",
  shared_office: "공유사무실",
  commercial_lease: "상가·일반 사무실 임차",
  factory: "공장·작업장",
  hero: "첫 화면",
  problem: "고객 문제",
  solution: "해결 방법",
  process: "진행 순서",
  offer: "첫 상품",
  pricing: "가격·거래 조건",
  proof: "확인 근거",
  faq: "자주 묻는 질문",
  cta: "신청 안내",
  verified: "원문 확인 완료",
  user_supplied: "사용자 직접 입력",
  needs_review: "추가 확인 필요",
  validated: "근거 충분",
  invalidated: "근거와 맞지 않음",
  promising: "가능성 있음",
  insufficient_data: "자료 부족",
  direct: "직접 연락",
  referral: "소개",
  community: "커뮤니티",
  blog: "블로그",
  social: "사회관계망",
  search_ad: "검색 광고",
  display_ad: "배너 광고",
  offline: "오프라인",
  partner: "제휴",
  landing: "판매 페이지",
  Starter: "입문형",
  Core: "핵심형",
  Premium: "맞춤형",
  "execution-loop-v1": "실행 손익 계산 1판",
  "kr-operations-v1": "한국 영업 준비 기준 1판",
  planned: "계획",
  running: "진행 중",
  completed: "완료",
  customer: "고객",
  channel: "고객을 만나는 경로",
  price: "가격",
};

const moneyKeys = new Set([
  "budgetWon",
  "priceWon",
  "sellingPriceWon",
  "netPriceWon",
  "variableCostWon",
  "contributionWon",
  "breakEvenRevenueWon",
  "monthlyFixedCostWon",
  "initialInvestmentWon",
  "recommendedWorkingCapitalWon",
  "totalFundingNeedWon",
  "revenue",
  "refundAmount",
  "adSpend",
  "variableCost",
  "observedAveragePrice",
  "observedVariableCostPerPurchase",
  "customerAcquisitionCost",
  "observedContributionPerPurchase",
  "netRevenue",
  "acquisitionCost",
]);

const percentKeys = new Set([
  "marginRate",
  "clickThroughRate",
  "visitorToInquiryRate",
  "inquiryToProposalRate",
  "proposalToPurchaseRate",
  "visitorToPurchaseRate",
  "refundRate",
  "observedContributionMarginRate",
  "confidence",
  "confidenceScore",
]);

function displayScalar(value: string | number | boolean, key?: string) {
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "number") {
    const formatted = value.toLocaleString("ko-KR");
    if (key && moneyKeys.has(key)) return `${formatted}원`;
    if (key && percentKeys.has(key)) return `${formatted}%`;
    return formatted;
  }
  if (key === "archetype" && value in archetypeLabels) return archetypeLabels[value as keyof typeof archetypeLabels];
  if (key === "legalForm" && value in legalFormLabels) return legalFormLabels[value as keyof typeof legalFormLabels];
  if (key === "workplaceType" && value in workplaceLabels) return workplaceLabels[value as keyof typeof workplaceLabels];
  return valueLabels[value] ?? value;
}

function markdownArrayObject(
  item: Record<string, unknown>,
  index: number,
  depth: number,
  parentKey?: string,
) {
  const heading = `${"#".repeat(Math.min(6, depth))} ${fieldLabels[parentKey ?? ""] ?? "세부 항목"} ${index + 1}`;
  const entries = Object.entries(item).map(([key, child]) => {
    const label = fieldLabels[key] ?? "세부 내용";
    if (child === null || child === undefined || child === "") return `- **${label}:** 입력 또는 검증이 필요합니다.`;
    if (typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
      return `- **${label}:** ${displayScalar(child, key)}`;
    }
    if (Array.isArray(child) && child.every((value) => typeof value !== "object" || value === null)) {
      const values = child.map((value) => value === null ? "입력 필요" : displayScalar(value as string | number | boolean, key));
      return `- **${label}:** ${values.length ? values.join(" · ") : "아직 수집된 항목이 없습니다."}`;
    }
    const nested = markdownFromArtifact(child, depth + 1, key)
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n");
    return `- **${label}:**\n${nested}`;
  });
  return [heading, ...entries].join("\n");
}

function markdownFromArtifact(value: unknown, depth = 2, parentKey?: string): string {
  if (value === null || value === undefined || value === "") return "입력 또는 검증이 필요합니다.";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return displayScalar(value, parentKey);
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item, index) => item && typeof item === "object"
        ? markdownArrayObject(item as Record<string, unknown>, index, depth + 1, parentKey)
        : `- ${displayScalar(item as string | number | boolean, parentKey)}`).join("\n\n")
      : "- 아직 수집된 항목이 없습니다.";
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${"#".repeat(Math.min(6, depth))} ${fieldLabels[key] ?? "기타 정보"}\n${markdownFromArtifact(item, depth + 1, key)}`)
    .join("\n\n");
}

function artifactMarkdown(project: ProjectRecord, stageIndex: number): DeliveryItem | null {
  const stage = project.stages[stageIndex];
  const approved = stage?.artifacts.find((artifact) => artifact.id === stage.approvedArtifactId);
  if (!approved) return null;
  return {
    id: `stage-${stageIndex}`,
    title: "",
    type: "",
    stageIndex,
    source: "approved_artifact",
    versionLabel: `${approved.version}판 승인본`,
    approvedArtifactId: approved.id,
    generatedAt: approved.createdAt,
    markdown: [
      `> 서버 승인 결과물 ${approved.version}판 · ${new Date(approved.createdAt).toLocaleString("ko-KR")}`,
      "",
      markdownFromArtifact(approved.content),
      "",
      "## 자동 생성 시 설명",
      approved.explanations.map((item) => `- ${item}`).join("\n"),
      "",
      "## 반드시 검증할 가정",
      approved.assumptions.map((item) => `- ${item}`).join("\n"),
    ].join("\n"),
    complete: true,
  };
}

const definitions = [
  { id: "brief", title: "사업 실행 요약서", type: "사업 방향과 핵심 가정", stageIndex: 0 },
  { id: "market", title: "고객·시장 진단서", type: "고객 문제와 경쟁 대안", stageIndex: 1 },
  { id: "pricing", title: "상품 구성·손익표", type: "3단계 상품과 가격 기준", stageIndex: 2 },
  { id: "brand", title: "이름·소개 문구 모음", type: "이름·한 줄 소개 문구·표현 방식", stageIndex: 3 },
  { id: "landing", title: "판매 페이지 원고", type: "휴대전화용 판매 페이지 원고", stageIndex: 4 },
  { id: "launch", title: "30일 첫 고객 실행안", type: "검증 활동과 지표", stageIndex: 5 },
  { id: "plan", title: "근거 기반 사업계획서", type: "시장·입지·재무·인허가 통합", stageIndex: null },
  { id: "operations", title: "영업 운영 준비서", type: "조달·업무 절차·고객 응대·영업 시작 점검", stageIndex: null },
  { id: "execution", title: "실행 결과 검증 보고서", type: "가정·구매 흐름·고객 한 명을 얻는 비용·실제 손익분기점", stageIndex: null },
  { id: "grants", title: "공공지원사업 매칭·신청 초안", type: "공고 자격 판정·신청 문단", stageIndex: null },
] as const;

function businessReadinessReason(project: ProjectRecord, itemId: string) {
  if (itemId === "plan" && !project.businessPlan?.submissionReady) {
    return `공식 제출 전 확인: ${project.businessPlan?.blockingItems.slice(0, 3).join(", ") || "필수 증빙 확인"}`;
  }
  if (itemId === "operations" && project.operationsAssessment?.hardBlockers.length) {
    return `영업 시작 전 증빙 ${project.operationsAssessment.hardBlockers.length}개 확인 필요`;
  }
  if (itemId === "execution" && (project.executionAnalysis?.confidenceScore ?? 0) < 50) {
    return `실행 자료 신뢰도 ${project.executionAnalysis?.confidenceScore ?? 0}% · 문서는 제공되며 실제 결과를 추가하면 갱신됩니다.`;
  }
  if (itemId === "grants" && (project.grantAnalysis?.eligibleCount ?? 0) === 0) {
    return `입력 조건상 확정된 신청 가능 후보가 없습니다. 조건부 후보와 공식 공고는 문서에서 확인할 수 있습니다.`;
  }
  return "사업 실행 전 사실 확인이 남아 있습니다.";
}

export function assembleDeliveryPackage(project: ProjectRecord): {
  items: DeliveryItem[];
  completeCount: number;
  missingTitles: string[];
  qualityStatus: string | null;
  qualityScore: number | null;
  deliveryQuality: DeliveryPackageQuality;
} {
  const rawItems = definitions.map((definition) => {
    if (definition.id === "plan" && project.businessPlan) {
      return {
        id: definition.id,
        title: definition.title,
        type: definition.type,
        stageIndex: definition.stageIndex,
        source: "server_package" as const,
        versionLabel: "서버 생성본",
        approvedArtifactId: null,
        generatedAt: project.businessPlan.generatedAt,
        markdown: project.businessPlan.markdown,
        complete: project.businessPlan.submissionReady,
      };
    }
    if (definition.id === "operations" && project.operationsPackage) {
      return {
        id: definition.id,
        title: definition.title,
        type: definition.type,
        stageIndex: definition.stageIndex,
        source: "server_package" as const,
        versionLabel: "서버 생성본",
        approvedArtifactId: null,
        generatedAt: project.operationsPackage.generatedAt,
        markdown: project.operationsPackage.markdown,
        complete: project.operationsAssessment?.hardBlockers.length === 0,
      };
    }
    if (definition.id === "execution" && project.executionAnalysis) {
      return {
        id: definition.id,
        title: definition.title,
        type: definition.type,
        stageIndex: definition.stageIndex,
        source: "server_package" as const,
        versionLabel: "서버 생성본",
        approvedArtifactId: null,
        generatedAt: project.executionAnalysis.generatedAt,
        markdown: markdownFromArtifact(project.executionAnalysis),
        complete: project.executionAnalysis.confidenceScore >= 50,
      };
    }
    if (definition.id === "grants" && project.grantPackage) {
      return {
        id: definition.id,
        title: definition.title,
        type: definition.type,
        stageIndex: definition.stageIndex,
        source: "server_package" as const,
        versionLabel: "서버 생성본",
        approvedArtifactId: null,
        generatedAt: project.grantPackage.generatedAt,
        markdown: project.grantPackage.markdown,
        complete: (project.grantAnalysis?.eligibleCount ?? 0) > 0,
      };
    }
    if (definition.stageIndex !== null) {
      const artifact = artifactMarkdown(project, definition.stageIndex);
      if (artifact) {
        return { ...artifact, id: definition.id, title: definition.title, type: definition.type };
      }
    }
    return {
      id: definition.id,
      title: definition.title,
      type: definition.type,
      stageIndex: definition.stageIndex,
      source: "missing" as const,
      versionLabel: "확인 필요",
      approvedArtifactId: null,
      generatedAt: null,
      markdown: `${definition.title} 결과물이 아직 승인되지 않았습니다. 해당 단계를 완료한 뒤 다시 내려받으세요.`,
      complete: false,
    };
  });
  const items = rawItems.map((item) => {
    if (item.source === "missing") {
      const quality = evaluateDeliveryDocument(project, item, item.markdown);
      return { ...item, contentReady: false, qualityReason: "승인된 원본이 없습니다.", quality };
    }
    const bodyMarkdown = enhanceDeliveryBody(project, item.id, item.markdown);
    const markdown = appendDeliveryAssurance(project, item.id, bodyMarkdown);
    const quality = evaluateDeliveryDocument(project, { ...item, markdown }, bodyMarkdown);
    const contentReady = quality.status === "ready";
    const businessReady = item.complete;
    return {
      ...item,
      markdown,
      complete: item.complete && contentReady,
      contentReady,
      quality,
      qualityReason: contentReady
        ? businessReady ? null : businessReadinessReason(project, item.id)
        : `최종 납품 최소 기준 미달 · 자동 납품 검수: ${quality.issues.slice(0, 3).join(", ")}`,
      versionLabel: contentReady ? item.versionLabel : "내용 보강 필요",
    };
  });
  const deliveryQuality = evaluateDeliveryPackage(
    project,
    items.map((item) => ({ ...item, quality: item.quality as DeliveryDocumentQuality })),
  );
  return {
    items,
    completeCount: items.filter((item) => item.complete).length,
    missingTitles: items.filter((item) => !item.complete).map((item) => item.title),
    qualityStatus: deliveryQuality.status,
    qualityScore: deliveryQuality.score,
    deliveryQuality,
  };
}

export function buildDeliveryDownload(
  project: ProjectRecord,
  opportunityTitle: string,
  opportunitySector: string,
  opportunityModel: string,
  title?: string,
) {
  const pack = assembleDeliveryPackage(project);
  const selected = title
    ? pack.items.find((item) => item.title === title)
    : null;
  const body = selected
    ? [`# ${selected.title}`, "", selected.markdown].join("\n")
    : [
        "# 전체 창업 실행 문서",
        "",
        `프로젝트: ${opportunityTitle}`,
        `사업 영역: ${opportunitySector}`,
        `사업 방식: ${opportunityModel}`,
        "",
        packageQualityMarkdown(pack.deliveryQuality),
        "",
        ...pack.items.map((item) => [`## ${item.title}`, "", item.markdown].join("\n")),
      ].join("\n\n---\n\n");
  return { body, pack };
}
