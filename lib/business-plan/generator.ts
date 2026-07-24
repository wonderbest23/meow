import type { ProjectRecord } from "../service-domain";
import type { MarketAnalysis, MarketWorkspace } from "../market/domain";
import { archetypeLabels, legalFormLabels, needsPhysicalLocationAnalysis, workplaceLabels } from "../business/domain";

export type PlanFactStatus = "confirmed" | "calculated" | "assumption" | "unknown";

export type BusinessPlanSection = {
  id: string;
  title: string;
  status: PlanFactStatus;
  content: string[];
  sources: Array<{ name: string; url: string; observedAt?: string }>;
};

export type BusinessPlanDocument = {
  title: string;
  version: number;
  templateId: "k-startup-2026-draft-v1";
  generatedAt: string;
  readinessScore: number;
  submissionReady: boolean;
  blockingItems: string[];
  confirmedFactCount: number;
  unknownCount: number;
  sections: BusinessPlanSection[];
  markdown: string;
};

const officialTemplateUrl = "https://www.mss.go.kr/site/smba/ex/bbs/View.do?bcIdx=1066114&cbIdx=310";

function text(value: unknown, fallback = "확인 필요") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function formatWon(value: number | null | undefined) {
  return value === null || value === undefined
    ? "확인 필요"
    : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringList(value: unknown, fallback: string[] = []) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : fallback;
}

function escapeCell(value: unknown) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function budgetRows(project: ProjectRecord): Array<[string, number, string, string]> {
  const financial = project.businessSetup?.financial;
  if (!financial) return [];
  const rows: Array<[string, number, string, string]> = [
    ["재료비", financial.initial.initialInventory, "초기 판매·검증에 사용할 재료 또는 상품 재고 1식", "첫 유료 제공과 실제 원가 확인"],
    ["기계장치·비품", financial.initial.equipment, "업무에 직접 사용하는 장비·비품 1식", "협약기간 내 산출물 제작"],
    ["외주용역비", financial.initial.interior, "제품·서비스 구현에 필요한 전문 외주 1식", "초기 산출물 또는 서비스 환경 구축"],
    ["지급수수료", financial.initial.licensesAndRegistration + financial.monthlyFixed.software * 3, "등록·검사·업무용 소프트웨어 3개월", "합법적 운영과 반복 업무 기반 확보"],
    ["광고선전비", financial.initial.launchMarketing + financial.monthlyFixed.fixedMarketing * 3, "출시 홍보비와 검증 광고비 3개월", "가격 공개 제안과 첫 고객 확보"],
    ["인건비", financial.monthlyFixed.payrollGross * 3, "협약 초기 전담 인력 인건비 3개월", "고객 대응·제작·운영 담당 확보"],
  ];
  return rows.filter(([, amount]) => amount > 0);
}

export function generateBusinessPlan(
  project: ProjectRecord,
  workspace: MarketWorkspace,
  marketAnalysis: MarketAnalysis,
): BusinessPlanDocument {
  const opportunity = project.opportunity;
  const setup = project.businessSetup;
  const assessment = project.businessAssessment;
  const financial = assessment?.financial;
  const locationRelevant = setup ? needsPhysicalLocationAnalysis(setup.archetype) : true;
  const unknownFinancialLabels = setup?.unknownFields ?? [];
  const selectedLocation = workspace.locations.find((candidate) => candidate.id === marketAnalysis.selectedLocationId);
  const selectedLocationScore = marketAnalysis.locations.find((score) => score.candidateId === marketAnalysis.selectedLocationId);
  const verifiedEvidence = workspace.evidence.filter((item) => item.verification === "verified");
  const customerEvidence = workspace.evidence.filter((item) => item.sourceType === "customer_interview");
  const competitorEvidence = workspace.evidence.filter((item) => item.sourceType === "competitor_check");
  const evidenceSources = workspace.evidence
    .filter((item) => Boolean(item.sourceUrl))
    .map((item) => ({ name: item.sourceName, url: item.sourceUrl, observedAt: item.observedAt }));
  const approvedContent = (stageIndex: number) => {
    const stage = project.stages[stageIndex];
    return record(stage?.artifacts.find((item) => item.id === stage.approvedArtifactId)?.content);
  };
  const brief = approvedContent(0);
  const market = approvedContent(1);
  const pricing = approvedContent(2);
  const launch = approvedContent(5);
  const recommendedOffer = record(pricing.recommendedOffer);
  const currentAlternatives = stringList(market.currentAlternatives, [
    "고객이 검색과 무료 도구로 직접 해결하는 방식",
    "지인·온라인 커뮤니티에 도움을 요청하는 방식",
    "기존 업체나 전문가에게 일부 업무를 의뢰하는 방식",
  ]).slice(0, 4);
  const channels = stringList(launch.channelPlan, [
    "목표 고객이 모여 있는 지역·직군 커뮤니티에서 가격과 범위를 공개한 제안을 전달",
    "문제와 가까운 파트너에게 소개 자료를 제공하고 실제 문의·결제만 측정",
    "첫 구매 고객의 재구매 시점과 추천 이유를 기록해 반복 가능한 경로를 선택",
  ]).slice(0, 4);
  const founderCapability = ["careerSummary", "experience", "teamCapabilities", "founderCapability"]
    .map((key) => project.founderProfile[key])
    .find((value) => typeof value === "string" && value.trim().length >= 10) as string | undefined;
  const founderStrengths = stringList(project.founderProfile.topFounder).slice(0, 3);
  const plannedBudgetRows = budgetRows(project);
  const plannedBudgetTotal = plannedBudgetRows.reduce((sum, [, amount]) => sum + amount, 0);
  const coreOffer = text(recommendedOffer.name, text(opportunity.title));
  const coreOutcome = text(recommendedOffer.outcome ?? recommendedOffer.includedScope, text(opportunity.oneLiner));
  const price = financial?.grossPrice ?? setup?.financial.sellingPrice ?? null;
  const targetUnits = setup?.financial.targetMonthlyUnits ?? null;
  const containsDemoData = /(?:테스트|example\.com|테스트로\s*\d+)/i.test(JSON.stringify({ workspace, opportunity }));
  const blockingItems = [
    ...(!setup || setup.legalForm === "undecided" ? ["사업자 형태와 사업장 조건 확정"] : []),
    ...(customerEvidence.length === 0 ? ["실제 고객 인터뷰 근거 1건 이상"] : []),
    ...(verifiedEvidence.length === 0 ? ["공식 자료 원문으로 확인된 시장 근거 1건 이상"] : []),
    ...(competitorEvidence.length === 0 ? ["실제 경쟁 대안·경쟁사 비교 근거"] : []),
    ...(!financial ? ["입력 근거가 있는 손익·사업비 계산"] : []),
    ...(unknownFinancialLabels.length ? [`추천값으로 임시 계산한 비용 ${unknownFinancialLabels.length}개 실제 확인`] : []),
    ...(!founderCapability ? ["대표자와 팀의 관련 경험·역량 증빙"] : []),
    ...(assessment?.hardBlockCount ? ["인허가 고위험 확인 완료"] : []),
    ...(containsDemoData ? ["화면 시험용·예시 자료 제거"] : []),
  ];

  const marketEvidenceSummary = verifiedEvidence.length
    ? verifiedEvidence.map((item) => `${item.metric} ${item.value}${item.unit ? ` ${item.unit}` : ""}(${item.sourceName}, ${item.observedAt || "기준일 확인"})`).join(" / ")
    : "공식 시장 수치는 아직 연결되지 않았습니다. 따라서 아래 시장 전략은 목표 고객과 판매 검증 범위에 한정한 사업 가설입니다.";
  const customerEvidenceSummary = customerEvidence.length
    ? `${customerEvidence.length}건의 고객 확인 기록에서 최근 문제·현재 대안·구매 조건을 확인했습니다.`
    : "고객 인터뷰 원문은 아직 연결되지 않았습니다. 고객 문제 문장은 선택한 사업 아이디어를 기준으로 작성한 검증 전 가설입니다.";
  const offerDescription = `${coreOffer}은(는) ${text(opportunity.customer)}가 겪는 문제를 ${text(opportunity.model)} 방식으로 해결하고, ${coreOutcome}을(를) 제공하는 첫 판매 상품입니다.`;
  const problemNarrative = `${text(opportunity.customer)}는 ${text(opportunity.oneLiner)} 현재 고객은 이 문제를 직접 해결하거나 지인·커뮤니티·기존 업체에 일부를 의뢰하지만, 결과 범위와 가격, 완료 기준을 사전에 비교하기 어렵습니다. 본 사업은 처음부터 대규모 시스템을 구축하는 대신 한 종류의 고객과 한 가지 핵심 결과에 범위를 제한하고, 같은 가격으로 제안한 실제 구매·거절 기록을 통해 문제의 반복성과 지불 의사를 검증합니다.`;
  const solutionNarrative = `${offerDescription} 고객은 신청 단계에서 필요한 정보, 포함·제외 범위, 가격, 완료 시점과 수정·환불 조건을 확인합니다. 대표자는 접수 내용을 검토한 뒤 정해진 절차로 결과를 제공하고, 완료 증거와 다음 행동을 함께 전달합니다. 초기 운영에서 반복되는 입력과 작업만 자동화 대상으로 선정하여 개발비를 통제하고, 확인되지 않은 기능은 협약 산출물에 포함하지 않습니다.`;
  const scaleNarrative = `초기 시장 진입은 ${text(setup?.region, "사업 지역 확인 필요")}의 ${text(opportunity.customer)}를 중심으로 진행합니다. 첫 단계에서는 광고 노출보다 가격이 공개된 제안 수, 문의, 결제, 재구매, 환불과 고객 한 명 확보비용을 측정합니다. 월 목표 판매량 ${targetUnits === null ? "확인 필요" : `${targetUnits.toLocaleString("ko-KR")}건`}과 건당 공헌이익 ${formatWon(financial?.contributionPerUnit)}을 기준으로 손익을 점검하고, 동일 고객군에서 반복 결제가 확인된 경로에만 홍보비를 확대합니다.`;
  const teamNarrative = founderCapability
    ? `대표자는 ${founderCapability}의 경험을 바탕으로 초기 고객 확인, 상품 범위 결정과 품질 검수를 직접 담당합니다. ${founderStrengths.length ? `성향 진단에서 확인된 강점은 ${founderStrengths.join("·")}이며, 이는 업무 배치 참고값으로만 사용합니다.` : ""} 제품·판매·운영 중 내부에 없는 역량은 산출물과 책임 범위를 명시한 외부 협업으로 보완합니다.`
    : "대표자는 초기 고객 확인, 상품 범위 결정과 품질 검수를 직접 담당합니다. 다만 관련 경력·성과가 아직 입력되지 않아 제출본의 대표자 역량 칸은 실제 경력증명·포트폴리오·수행 실적으로 교체해야 합니다. 부족한 개발·마케팅·전문 검토 역량은 역할과 산출물을 명시한 외부 협업으로 보완합니다.";

  const sections: BusinessPlanSection[] = [
    { id: "summary", title: "현황 및 창업아이템 개요", status: setup && setup.legalForm !== "undecided" ? "confirmed" : "unknown", content: [offerDescription, `산출물: 판매 가능한 ${coreOffer} 1식, 고객 신청·제공 절차 1식, 가격 공개 검증 결과표 1식`], sources: [] },
    { id: "problem", title: "1. 문제 인식(Problem)", status: customerEvidence.length && verifiedEvidence.length ? "confirmed" : "assumption", content: [problemNarrative, customerEvidenceSummary, marketEvidenceSummary], sources: evidenceSources },
    { id: "solution", title: "2. 실현 가능성(Solution)", status: Object.keys(brief).length && Object.keys(pricing).length ? "assumption" : "unknown", content: [solutionNarrative, `협약 산출물: ${coreOffer} 1식과 운영·검증 자료`], sources: competitorEvidence.filter((item) => item.sourceUrl).map((item) => ({ name: item.sourceName, url: item.sourceUrl, observedAt: item.observedAt })) },
    { id: "scale-up", title: "3. 성장전략(Scale-up)", status: financial ? "calculated" : "unknown", content: [scaleNarrative, `수익 방식: ${text(opportunity.revenue)} · 첫 판매가 ${formatWon(price)}`], sources: evidenceSources },
    { id: "team", title: "4. 팀 구성(Team)", status: founderCapability ? "confirmed" : "unknown", content: [teamNarrative], sources: [] },
    { id: "budget", title: "사업비 집행 계획", status: plannedBudgetRows.length ? "calculated" : "unknown", content: [`본문 산출 초안 ${formatWon(plannedBudgetTotal)} · 전체 필요자금 ${formatWon(financial?.totalFundingNeed)}`], sources: [] },
  ];
  const confirmedFactCount = sections.filter((section) => ["confirmed", "calculated"].includes(section.status)).length;
  const unknownCount = sections.filter((section) => section.status === "unknown").length;
  const readinessScore = Math.round(((8 - Math.min(8, blockingItems.length)) / 8) * 100);
  const submissionReady = blockingItems.length === 0;
  const title = `${text(opportunity.title)} 2026 창업지원사업 사업계획서 본문 초안`;
  const competitorRows = currentAlternatives.map((alternative, index) => [
    alternative,
    index === 0 ? "비용을 통제하기 쉽지만 시간과 시행착오가 큼" : "이미 익숙하거나 접근이 쉬움",
    index === 0 ? "완료 기준과 품질 편차" : "가격·범위·책임이 한 번에 비교되지 않음",
    "가격·제공 범위·완료 증거를 사전에 합의하고 같은 절차로 기록",
  ]);
  const milestones = [
    ["1개월", "목표 고객 문제와 현재 대안 확인", "최근 행동 인터뷰와 가격 공개 제안 기록", "문제 반복·구매 조건이 확인된 고객군 1개"],
    ["2~3개월", `${coreOffer} 수동 제공`, "주문별 작업시간·원가·수정·환불 기록", "첫 유료 고객과 실제 공헌이익 확인"],
    ["4~6개월", "반복 업무 표준화와 판매 경로 집중", "제공 절차서·문의→결제 전환율", "같은 범위의 반복 판매 가능"],
    ["7~9개월", "검증된 부분만 도구화·자동화", "처리시간·누락·고객 만족 변화", "자동화 비용 대비 운영시간 절감"],
    ["10~12개월", "인접 고객·지역 확장 판단", "재구매·추천·고객획득비용", "확대 전후 공헌이익 유지"],
  ];
  const sourceRows = workspace.evidence.length
    ? workspace.evidence.map((item, index) => [`S${String(index + 1).padStart(2, "0")}`, item.verification === "verified" ? "공식 원문 확인" : item.verification === "user_supplied" ? "사용자 입력" : "추가 확인", `${item.title} · ${item.sourceName}`, item.observedAt || "확인 필요", item.sourceUrl ? `[원문](${item.sourceUrl})` : "내부 기록"])
    : [["S00", "추가 확인", "연결된 시장·고객 원문 없음", "확인 전", "없음"]];

  const markdown = [
    `# ${title}`,
    "",
    `작성일: ${new Date().toLocaleDateString("ko-KR")} · 공식 목차 기준: [2026년 예비창업패키지 사업계획서 양식](${officialTemplateUrl})`,
    "",
    "> 아래 ‘제출용 본문’은 공식 HWPX의 문제 인식·실현 가능성·성장전략·팀 구성 칸에 옮겨 쓸 수 있도록 작성한 내용입니다. 가정은 계획형 문장으로 표시했으며, 없는 실적·시장 수치·경력을 만들지 않았습니다.",
    "",
    "# 제출용 본문",
    "",
    "## 현황 및 창업아이템 개요",
    "",
    "| 항목 | 작성 내용 |",
    "| --- | --- |",
    `| 창업아이템명 | ${escapeCell(text(opportunity.title))} |`,
    `| 범주 | ${escapeCell(setup ? archetypeLabels[setup.archetype] : opportunity.sector)} |`,
    `| 목표 고객 | ${escapeCell(opportunity.customer)} |`,
    `| 핵심 상품·서비스 | ${escapeCell(coreOffer)} |`,
    `| 고객 제공 혜택 | ${escapeCell(coreOutcome)} |`,
    `| 판매가 | ${escapeCell(formatWon(price))} |`,
    `| 협약기간 산출물 | 판매 가능한 ${escapeCell(coreOffer)} 1식, 고객 신청·제공 절차 1식, 가격 공개 검증 결과표 1식 |`,
    `| 사업 형태·지역 | ${escapeCell(setup ? `${legalFormLabels[setup.legalForm]} · ${workplaceLabels[setup.workplaceType]} · ${setup.region}` : "확인 필요")} |`,
    "",
    "### 창업아이템 개요(요약)",
    "",
    offerDescription,
    "",
    `${problemNarrative} ${solutionNarrative} ${scaleNarrative}`,
    "",
    "## 1. 문제 인식(Problem) · 창업아이템의 필요성",
    "",
    "### 1-1. 목표 고객이 겪는 문제",
    "",
    problemNarrative,
    "",
    customerEvidenceSummary,
    "",
    "### 1-2. 시장 현황과 현재 대안",
    "",
    marketEvidenceSummary,
    "",
    "| 현재 대안 | 장점 | 고객이 감수하는 불편 | 본 사업의 검증할 차별점 |",
    "| --- | --- | --- | --- |",
    ...competitorRows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
    "",
    "### 1-3. 개발·사업화 필요성",
    "",
    `현재 문제는 기능 부족만으로 설명되지 않습니다. ${text(opportunity.customer)}가 구매 전에 결과 범위와 가격, 완료 기준을 이해하고 실제로 비용을 지불할 수 있는 제공 구조가 필요합니다. 따라서 본 사업은 ${coreOffer}을(를) 판매 가능한 최소 단위로 만들고, 실제 주문에서 작업시간·원가·수정·환불을 기록해 이후 개발과 확장의 기준을 확보하고자 합니다.`,
    "",
    "## 2. 실현 가능성(Solution) · 창업아이템 개발 계획",
    "",
    "### 2-1. 제품·서비스 구현 내용",
    "",
    solutionNarrative,
    "",
    "| 단계 | 고객이 보는 화면·행동 | 내부 수행 내용 | 완료 증거 |",
    "| --- | --- | --- | --- |",
    "| 1. 확인 | 고객·가격·포함 범위를 확인 | 고위험·제외 요청을 분리 | 접수 기록 |",
    "| 2. 신청 | 필요한 정보와 일정을 입력 | 제공 가능 여부와 원가 확인 | 확정 안내 |",
    "| 3. 제공 | 약속한 핵심 결과를 받음 | 표준 절차로 제작·운영 | 결과물·작업 기록 |",
    "| 4. 검수 | 범위 안 수정 또는 완료 확인 | 누락·추가 요청·환불 판단 | 완료 확인 |",
    "| 5. 개선 | 다음 이용 또는 후속 행동 선택 | 실제 시간·원가·구매 이유 반영 | 개선판과 변경 기록 |",
    "",
    "### 2-2. 차별성 및 경쟁력 확보 전략",
    "",
    `초기 경쟁력은 많은 기능이 아니라 ${text(opportunity.customer)}에게 필요한 ${coreOutcome}을(를) 정해진 범위와 가격으로 반복 제공하는 능력입니다. 경쟁 대안과 같은 항목으로 가격, 소요시간, 포함 범위, 책임, 완료 증거를 비교하고, 실제 구매자가 선택한 이유만 차별성으로 남깁니다. 수동 운영에서 반복되는 입력·판단·전달 업무만 자동화하여 개발비와 운영 복잡도를 낮춥니다.`,
    "",
    "### 2-3. 협약기간 추진 일정",
    "",
    "| 순서 | 추진 내용 | 기간 | 산출물·판정 기준 |",
    "| ---: | --- | --- | --- |",
    "| 1 | 고객 문제·현재 대안 확인 | 1개월 | 최근 행동 기록과 가격 공개 제안 |",
    `| 2 | ${escapeCell(coreOffer)} 1차 구현 | 1~2개월 | 판매 가능한 결과물과 제공 절차 |`,
    "| 3 | 소규모 유료 제공 | 2~3개월 | 주문별 매출·원가·수정·환불 기록 |",
    "| 4 | 판매 페이지·신청 흐름 개선 | 3~4개월 | 문의→제안→결제 전환 기록 |",
    "| 5 | 반복 업무 표준화 | 4~6개월 | 운영 절차서와 품질 기준 |",
    "| 6 | 재구매·확장 판정 | 협약 종료 전 | 공헌이익·재구매·고객획득비용 |",
    "",
    "### 2-4. 사업비 집행 계획",
    "",
    `현재 입력값으로 산출한 사업비 본문 초안은 ${formatWon(plannedBudgetTotal)}입니다. 전체 창업 필요자금 ${formatWon(financial?.totalFundingNeed)}과 지원사업 신청액은 같은 개념이 아니며, 아래 금액 중 해당 공고가 인정하는 비목만 신청합니다.`,
    "",
    "| 비목 | 신청액 초안 | 산출 근거 | 연결되는 성과 |",
    "| --- | ---: | --- | --- |",
    ...(plannedBudgetRows.length
      ? plannedBudgetRows.map((row) => `| ${escapeCell(row[0])} | ${formatWon(row[1])} | ${escapeCell(row[2])} | ${escapeCell(row[3])} |`)
      : ["| 비목 확정 필요 | 확인 필요 | 실제 견적과 수량·단가 입력 필요 | 협약 산출물과 연결 필요 |"]),
    `| **합계** | **${formatWon(plannedBudgetTotal)}** | 실제 견적 확인 전 산출 초안 | 정부지원금·자기부담 비율은 선택 공고 기준 적용 |`,
    "",
    "## 3. 성장전략(Scale-up) · 사업화 추진 전략",
    "",
    "### 3-1. 목표시장 진입 전략",
    "",
    scaleNarrative,
    "",
    "| 우선순위 | 고객 경로 | 실행 내용 | 판정 지표 |",
    "| ---: | --- | --- | --- |",
    ...channels.map((channel, index) => `| ${index + 1} | ${escapeCell(channel)} | 같은 가격·범위로 제안하고 반응을 기록 | 문의·제안·결제·고객획득비용 |`),
    "",
    "### 3-2. 비즈니스 모델과 손익 구조",
    "",
    "| 항목 | 현재 작성값 | 산식·의미 |",
    "| --- | ---: | --- |",
    `| 고객 판매가 | ${formatWon(financial?.grossPrice)} | 고객이 결제하는 1건 가격 |`,
    `| 건당 변동비 | ${formatWon(financial?.variableCostPerUnit)} | 재료·구매·배송·작업·수수료 |`,
    `| 건당 공헌이익 | ${formatWon(financial?.contributionPerUnit)} | 부가세 제외 매출 - 건당 변동비 |`,
    `| 월 고정비 | ${formatWon(financial?.monthlyFixedCost)} | 임차·인건비·도구·보험·고정 홍보비 |`,
    `| 월 손익분기점 | ${financial?.breakEvenUnits === null || financial?.breakEvenUnits === undefined ? "확인 필요" : `${financial.breakEvenUnits.toLocaleString("ko-KR")}건 · ${formatWon(financial.breakEvenRevenue)}`} | 월 고정비 ÷ 건당 공헌이익 |`,
    `| 총 필요자금 | ${formatWon(financial?.totalFundingNeed)} | 초기 투자비 + 권장 운전자금 |`,
    "",
    "### 3-3. 전체 사업 로드맵",
    "",
    "| 기간 | 핵심 목표 | 완료 증거 | 다음 단계 기준 |",
    "| --- | --- | --- | --- |",
    ...milestones.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
    "",
    "### 3-4. 투자·후속자금 및 사회적 가치 계획",
    "",
    `초기에는 ${formatWon(financial?.totalFundingNeed)} 범위의 실제 필요자금과 사업화 지원 비목을 구분해 집행합니다. 유료 주문과 공헌이익이 반복되기 전에는 지분투자 유치를 전제로 인력·고정비를 확대하지 않습니다. 이후 투자 검토 시에는 누적 고객 수, 재구매율, 고객 한 명 확보비용, 건당 공헌이익과 자금 사용 후 달성할 12개월 목표를 함께 제시합니다. 개인정보 최소수집, 과장광고 방지, 공정한 거래·계약과 지역 파트너 협업을 운영 지표에 포함합니다.`,
    "",
    "## 4. 팀 구성(Team) · 대표자 및 팀원 구성 계획",
    "",
    teamNarrative,
    "",
    "| 구분 | 담당 업무 | 현재 보유역량 | 구성 상태·보완 계획 |",
    "| --- | --- | --- | --- |",
    `| 대표자 | 고객 확인, 상품 결정, 품질·손익 관리 | ${escapeCell(founderCapability ?? "실제 관련 경력·성과 입력 필요")} | 현재 · 증빙 연결 필요 |`,
    `| 제품·서비스 담당 | ${escapeCell(coreOffer)} 구현·개선 | 대표자 직접 수행 가능한 범위부터 시작 | 내부 수행 후 부족 기술만 외부 협업 |`,
    "| 판매·고객 담당 | 제안, 문의, 계약, 재구매 기록 | 초기에는 대표자가 직접 고객 언어 확보 | 반복 경로 확인 후 채용 판단 |",
    "| 전문 협력 | 인허가·계약·개인정보 등 전문 검토 | 내부 보유로 가정하지 않음 | 필요한 시점에 범위·견적을 정해 협업 |",
    "",
    "# 참고 부록 · 제출본에서 분리",
    "",
    "> 아래 내용은 본문을 준비하기 위한 검토표입니다. 공식 신청서 본문에 그대로 복사하지 않습니다.",
    "",
    "## A. 공식 양식 적용 정보",
    "",
    `- 기준 양식: [2026년 예비창업패키지 사업계획서 양식](${officialTemplateUrl})`,
    "- 공식 양식은 공고별 페이지 수, 비목, 자기부담 비율과 증빙목록이 다르므로 선택한 공고의 원본을 최종 기준으로 사용합니다.",
    `- 현재 자동 작성 준비도: ${readinessScore}% · ${submissionReady ? "필수 입력 충족" : "본문은 완성됐으며 일부 사실·증빙 확인 필요"}`,
    "",
    "## B. 출처와 확인 상태",
    "",
    "| 근거 | 상태 | 자료·기관 | 기준일 | 원문 |",
    "| --- | --- | --- | --- | --- |",
    ...sourceRows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
    "",
    "## C. 제출 직전 교체할 항목",
    "",
    ...(blockingItems.length ? blockingItems.map((item) => `- [ ] ${item}`) : ["- [x] 현재 입력 기준의 필수 작성 항목이 채워졌습니다."]),
    `- [ ] 시장 수치·경쟁사 가격의 기준일과 원문 확인`,
    `- [ ] 사업비 ${formatWon(plannedBudgetTotal)}의 견적·수량·단가와 합계 검산`,
    "- [ ] 대표자·팀 경력의 개인정보 마스킹 및 증빙 연결",
    "- [ ] 선택 공고의 최신 HWPX에 옮긴 뒤 글자 수·표 잘림·파일명·마감 시각 확인",
    "",
    "## D. 입지·인허가 참고",
    "",
    selectedLocation
      ? `선택 입지 ${selectedLocation.name}의 입력 기반 월 점유비는 ${formatWon(selectedLocationScore?.monthlyOccupancyCost)}이며 점수는 ${selectedLocationScore?.totalScore ?? "확인 필요"}점입니다.`
      : locationRelevant ? "오프라인 사업은 임대차·건축물 용도·인허가를 관할기관 원문으로 확인합니다." : "온라인 중심 사업이므로 상권 비교를 본문에 넣지 않고 사업자등록 주소 사용 가능 여부만 확인합니다.",
    ...(assessment?.requirements.map((item) => `- ${item.title}: ${item.reason} · [${item.authority} 확인](${item.sourceUrl})`) ?? []),
  ].join("\n");

  return {
    title,
    version: 2,
    templateId: "k-startup-2026-draft-v1",
    generatedAt: new Date().toISOString(),
    readinessScore,
    submissionReady,
    blockingItems,
    confirmedFactCount,
    unknownCount,
    sections,
    markdown,
  };
}
