import type { ProjectRecord } from "../service-domain";
import { archetypeLabels } from "../business/domain";
import { catalogObservedAt, grantCatalog } from "./catalog";
import type {
  GrantAnalysis,
  GrantApplicationSection,
  GrantEligibilityStatus,
  GrantMatch,
  GrantPackage,
  GrantProgram,
  GrantWorkspace,
} from "./domain";

const RULES_VERSION = "kr-grants-v1";

function text(value: unknown, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

function archetype(project: ProjectRecord) {
  return project.businessSetup?.archetype ?? "digital_service";
}

function province(project: ProjectRecord) {
  return text(project.businessSetup?.region, "미확인");
}

function fundingNeed(project: ProjectRecord) {
  return project.businessAssessment?.financial.totalFundingNeed ?? null;
}

function founderStage(project: ProjectRecord, workspace: GrantWorkspace): string {
  if (workspace.registrationStatus === "unregistered") return "예비창업자";
  if (["registered", "corporation"].includes(workspace.registrationStatus)) {
    return (project.businessSetup?.employeeCount ?? 0) <= 5 ? "초기창업자" : "도약창업자";
  }
  return "미확인";
}

function matchProgram(
  project: ProjectRecord,
  workspace: GrantWorkspace,
  program: GrantProgram,
): GrantMatch {
  const matchedCriteria: string[] = [];
  const blockers: string[] = [];
  const missingEvidence: string[] = [];
  const nextActions: string[] = [];
  const stage = founderStage(project, workspace);
  const arch = archetype(project);
  const title = text(project.opportunity.title, project.title);
  const oneLiner = text(project.opportunity.oneLiner);

  if (program.targetArchetypes.includes(arch)) {
    matchedCriteria.push(`${archetypeLabels[arch]} 유형과 공고 대상이 일치합니다.`);
  } else {
    blockers.push("사업 유형이 공고 대상과 직접 일치하지 않습니다.");
  }

  if (stage === "미확인") {
    missingEvidence.push("공고일 기준 사업자등록·법인설립 상태");
    nextActions.push("홈택스 사실증명 등 공고가 요구하는 예비·기창업 상태 증빙을 확인하세요.");
  } else if (program.targetFounder.some((item) => stage.includes(item.replace("창업자", "")) || item === stage)) {
    matchedCriteria.push(`현재 단계(${stage})가 공고 대상에 포함됩니다.`);
  } else if (program.targetFounder.includes("예비창업자") && stage === "예비창업자") {
    matchedCriteria.push("예비창업자 대상 공고입니다.");
  } else if (program.targetFounder.includes("초기창업자") && stage === "초기창업자") {
    matchedCriteria.push("초기창업자 대상 공고입니다.");
  } else {
    blockers.push(`현재 단계(${stage})가 공고 대상(${program.targetFounder.join(", ")})과 맞지 않을 수 있습니다.`);
  }

  if (program.requiresIncorporation === true && !["registered", "corporation"].includes(workspace.registrationStatus)) {
    blockers.push("법인 설립 또는 사업자등록 완료가 필요합니다.");
    nextActions.push("사업자등록·법인 설립 일정을 먼저 확정하세요.");
  }
  if (program.requiresIncorporation === false && ["registered", "corporation"].includes(workspace.registrationStatus)) {
    blockers.push("예비창업자 공고는 공고일 기준 사업자등록·법인설립 상태가 있으면 대상에서 제외될 수 있습니다.");
  }

  if (!workspace.registrationEvidenceUrl) missingEvidence.push("사업자등록 상태 증빙 원문");
  if (!workspace.officialAnnouncementChecked) missingEvidence.push("해당 연도 세부 공고문 원문 확인");
  if (!workspace.taxArrearsChecked) missingEvidence.push("국세·지방세 체납 및 납부 요건 확인");
  if (!workspace.exclusionCriteriaChecked) missingEvidence.push("중복수혜·참여제한·제외업종 확인");

  if (workspace.teamSize < program.minTeamSize) {
    blockers.push(`최소 팀 규모 ${program.minTeamSize}명 이상이 필요합니다.`);
  } else {
    matchedCriteria.push(`팀 규모 ${workspace.teamSize}명이 최소 요건을 충족합니다.`);
  }
  if (program.maxTeamSize && workspace.teamSize > program.maxTeamSize) {
    blockers.push(`최대 팀 규모 ${program.maxTeamSize}명을 초과합니다.`);
  }

  if (program.id === "youth-startup-academy") {
    if (!workspace.founderAge) {
      missingEvidence.push("창업자 연령 증빙");
      nextActions.push("만 나이와 신분증 기준일을 입력하세요.");
    } else if (workspace.founderAge > 39) {
      blockers.push("청년창업사관학교는 39세 이하 요건이 일반적입니다.");
    } else {
      matchedCriteria.push(`창업자 연령 ${workspace.founderAge}세가 청년 요건 범위입니다.`);
    }
  }

  if (workspace.priorGrantReceived && program.id === "pre-startup-package") {
    blockers.push("동일·유사 지원사업 수혜 이력이 있으면 제외될 수 있습니다.");
  }

  const combined = `${title} ${oneLiner} ${text(project.opportunity.sector)}`.toLowerCase();
  for (const keyword of program.excludedKeywords) {
    if (combined.includes(keyword.toLowerCase())) {
      blockers.push(`공고 제외 키워드(${keyword})와 사업 설명이 겹칠 수 있습니다.`);
    }
  }

  if (workspace.targetRegions.length && !workspace.targetRegions.some((item) => province(project).includes(item))) {
    missingEvidence.push("지역 거점·사업장 증빙");
    nextActions.push(`${workspace.targetRegions.join(", ")} 지역 증빙을 추가하세요.`);
  } else if (province(project) !== "미확인") {
    matchedCriteria.push(`사업 지역(${province(project)}) 정보가 저장되어 있습니다.`);
  }

  if (!project.businessPlan?.submissionReady) missingEvidence.push("공식 양식 필수항목과 증빙을 갖춘 사업계획서");
  if (!project.businessAssessment) missingEvidence.push("손익분기점·자금 소요 분석");
  if (!project.marketWorkspace?.evidence.length) missingEvidence.push("시장·수요 근거");
  for (const item of program.requiredEvidence) {
    if (item.includes("사업계획서") && !project.businessPlan?.submissionReady) missingEvidence.push(item);
    if ((item.includes("사업자등록") || item.includes("예비창업")) && !workspace.registrationEvidenceUrl) missingEvidence.push(item);
    if ((item.includes("팀") || item.includes("역량")) && workspace.supportingEvidenceUrls.length === 0) missingEvidence.push(item);
    if (!/(사업계획서|사업자등록|예비창업|팀|역량)/.test(item)) missingEvidence.push(item);
  }

  const need = fundingNeed(project);
  if (need && program.maxSupportWon && need > program.maxSupportWon * 1.5) {
    nextActions.push(`필요자금 ${need.toLocaleString("ko-KR")}원 대비 공고 한도를 검토하세요.`);
  } else if (need && program.maxSupportWon) {
    matchedCriteria.push("필요자금 규모가 공고 지원 한도 범위에서 검토 가능합니다.");
  }

  if (
    workspace.preferredSupportTypes.length &&
    !workspace.preferredSupportTypes.includes(program.supportType)
  ) {
    nextActions.push("선호 지원 유형과 다르지만 병행 검토할 가치가 있습니다.");
  }

  let status: GrantEligibilityStatus = "eligible";
  if (blockers.length) status = "ineligible";
  else if (missingEvidence.length) status = "conditional";

  const fitScore = Math.max(
    0,
    Math.min(
      100,
      40 +
        matchedCriteria.length * 12 -
        blockers.length * 25 -
        missingEvidence.length * 8 +
        (status === "conditional" ? 5 : 0),
    ),
  );

  return {
    programId: program.id,
    title: program.title,
    organizer: program.organizer,
    status,
    fitScore,
    maxSupportWon: program.maxSupportWon,
    officialUrl: program.officialUrl,
    matchedCriteria,
    blockers,
    missingEvidence: [...new Set(missingEvidence)],
    nextActions: [...new Set(nextActions)],
  };
}

export function analyzeGrants(project: ProjectRecord, workspace: GrantWorkspace): GrantAnalysis {
  const matches = grantCatalog
    .map((program) => matchProgram(project, workspace, program))
    .sort((left, right) => right.fitScore - left.fitScore);
  const eligibleCount = matches.filter((item) => item.status === "eligible").length;
  const conditionalCount = matches.filter((item) => item.status === "conditional").length;
  const readinessChecks = [
    { label: "사업자등록 상태 입력", passed: workspace.registrationStatus !== "unknown" },
    { label: "등록 상태 증빙", passed: Boolean(workspace.registrationEvidenceUrl) },
    { label: "세부 공고문 확인", passed: workspace.officialAnnouncementChecked },
    { label: "체납 요건 확인", passed: workspace.taxArrearsChecked },
    { label: "제외요건 확인", passed: workspace.exclusionCriteriaChecked },
    { label: "제출용 사업계획서", passed: Boolean(project.businessPlan?.submissionReady) },
    { label: "검증된 시장 근거", passed: (project.marketAnalysis?.verifiedEvidenceCount ?? 0) > 0 },
    { label: "팀·역량 증빙", passed: workspace.supportingEvidenceUrls.length > 0 },
  ];
  const readinessScore = Math.round(
    (readinessChecks.filter((item) => item.passed).length / readinessChecks.length) * 100,
  );
  return {
    generatedAt: new Date().toISOString(),
    rulesVersion: RULES_VERSION,
    catalogObservedAt: catalogObservedAt(),
    readinessScore,
    eligibleCount,
    conditionalCount,
    readinessChecks,
    matches,
  };
}

function applicationParagraphs(
  project: ProjectRecord,
  workspace: GrantWorkspace,
  match: GrantMatch,
): string[] {
  const opportunity = project.opportunity;
  const financial = project.businessAssessment?.financial;
  return [
    `${text(opportunity.title, project.title)}은(는) ${text(opportunity.customer, "목표 고객 확인 필요")}를 대상으로 ${text(opportunity.oneLiner, "해결할 문제와 고객 혜택 확인 필요")} ${text(opportunity.model, "제공 방식 확인 필요")} 방식으로 첫 상품을 제공하고 실제 구매·원가·재구매를 확인합니다.`,
    `지원사업을 통해 ${workspace.applicationGoal || "판매 가능한 최소 결과물과 표준 제공 절차를 완성하고, 가격을 공개한 고객 제안과 유료 운영 결과를 확보"}하고자 합니다.`,
    financial
      ? `현재 입력 기준 고객 판매가는 ${financial.grossPrice.toLocaleString("ko-KR")}원, 건당 공헌이익은 ${financial.contributionPerUnit.toLocaleString("ko-KR")}원이며 월 손익분기점은 ${financial.breakEvenUnits ?? "산정 전"}건입니다. 이 수치는 입력값 기반 계산으로 실제 견적과 주문 기록으로 교체합니다.`
      : "가격·원가·손익은 실제 견적과 첫 주문 기록을 기준으로 사업비 표와 함께 확정합니다.",
    `대표자와 현재 팀 ${workspace.teamSize}명은 초기 고객 확인, 상품 구현과 품질 관리를 담당하고, 내부에 없는 개발·디자인·법률·인허가 역량은 산출물과 책임 범위를 정한 외부 협업으로 보완합니다.`,
    match.matchedCriteria.length
      ? `현재 입력에서 확인된 공고 적합 근거는 ${match.matchedCriteria.join(" ")}입니다.`
      : "현재 입력만으로 자격을 확정하지 않으며 공고일 기준 대표자·업력·지역 요건을 원문과 대조합니다.",
  ];
}

function approvedContent(project: ProjectRecord, stageIndex: number): Record<string, unknown> {
  const stage = project.stages[stageIndex];
  const value = stage?.artifacts.find((item) => item.id === stage.approvedArtifactId)?.content;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringList(value: unknown, fallback: string[] = []) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : fallback;
}

function escapeCell(value: unknown) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function formatWon(value: number | null | undefined) {
  return value === null || value === undefined ? "확인 필요" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function grantBudgetRows(project: ProjectRecord): Array<[string, number, string, string]> {
  const financial = project.businessSetup?.financial;
  if (!financial) return [];
  const rows: Array<[string, number, string, string]> = [
    ["재료비", financial.initial.initialInventory, "초기 판매·검증에 필요한 재료·상품 재고 1식", "첫 유료 제공과 실제 원가 확인"],
    ["기계장치·비품", financial.initial.equipment, "제품·서비스 제작에 직접 사용하는 장비·비품 1식", "협약기간 산출물 제작"],
    ["외주용역비", financial.initial.interior, "내부에 없는 제품·디자인·개발 업무 외주 1식", "판매 가능한 최소 결과물 구현"],
    ["지급수수료", financial.initial.licensesAndRegistration + financial.monthlyFixed.software * 3, "등록·검사·업무용 소프트웨어 3개월", "합법적 운영과 반복 업무 기반"],
    ["광고선전비", financial.initial.launchMarketing + financial.monthlyFixed.fixedMarketing * 3, "출시 홍보와 고객 검증 광고 3개월", "가격 공개 제안과 첫 고객 확보"],
    ["인건비", financial.monthlyFixed.payrollGross * 3, "협약 초기 전담 인력 인건비 3개월", "제작·고객 대응·운영 담당 확보"],
  ];
  return rows.filter(([, amount]) => amount > 0);
}

function applicationMarkdown(
  project: ProjectRecord,
  workspace: GrantWorkspace,
  match: GrantMatch,
) {
  const opportunity = project.opportunity;
  const program = grantCatalog.find((item) => item.id === match.programId);
  const financial = project.businessAssessment?.financial;
  const setup = project.businessSetup;
  const market = approvedContent(project, 1);
  const pricing = approvedContent(project, 2);
  const launch = approvedContent(project, 5);
  const recommendedOffer = pricing.recommendedOffer && typeof pricing.recommendedOffer === "object"
    ? pricing.recommendedOffer as Record<string, unknown>
    : {};
  const offerName = text(recommendedOffer.name, text(opportunity.title, project.title));
  const offerOutcome = text(recommendedOffer.outcome ?? recommendedOffer.includedScope, text(opportunity.oneLiner));
  const alternatives = stringList(market.currentAlternatives, [
    "고객이 검색과 무료 도구로 직접 해결",
    "지인·커뮤니티에 질문하거나 도움을 요청",
    "기존 업체·전문가에게 일부 업무를 의뢰",
  ]).slice(0, 4);
  const channels = stringList(launch.channelPlan, [
    "목표 고객이 모여 있는 커뮤니티에 가격과 범위를 공개한 제안 전달",
    "문제와 가까운 지역·업종 파트너를 통한 소개",
    "첫 구매 고객의 재구매 시점과 추천 경로 확인",
  ]).slice(0, 4);
  const budgetRows = grantBudgetRows(project);
  const budgetTotal = budgetRows.reduce((sum, [, amount]) => sum + amount, 0);
  const targetUnits = setup?.financial.targetMonthlyUnits ?? null;
  const targetPaid = Math.max(3, Math.min(30, targetUnits ?? 10));
  const founderCapability = ["careerSummary", "experience", "teamCapabilities", "founderCapability"]
    .map((key) => project.founderProfile[key])
    .find((value) => typeof value === "string" && value.trim().length >= 10) as string | undefined;
  const evidence = project.marketWorkspace?.evidence ?? [];
  const evidenceRows = evidence.length
    ? evidence.slice(0, 8).map((item) => [
        item.verification === "verified" ? "공식 원문 확인" : item.verification === "user_supplied" ? "사용자 입력" : "추가 확인",
        `${item.metric}: ${item.value}${item.unit ? ` ${item.unit}` : ""}`,
        `${item.sourceName}${item.observedAt ? ` · ${item.observedAt}` : ""}`,
        item.sourceUrl ? `[원문](${item.sourceUrl})` : "내부 기록",
      ])
    : [["추가 확인", "연결된 고객·시장 원문 없음", "작성된 사업 가설", "없음"]];
  const programSummary = program?.summary ?? "세부 지원 내용은 최신 공고 원문에서 확인합니다.";
  const applicationGoal = workspace.applicationGoal || `${offerName} 1식과 표준 운영 절차를 완성하고 가격 공개 제안 30건, 유료 고객 ${targetPaid}건의 검증 자료를 확보`;
  const problemParagraph = `${text(opportunity.customer, "목표 고객 확인 필요")}는 ${text(opportunity.oneLiner, "고객 문제 확인 필요")} 현재 대안은 직접 해결, 지인·커뮤니티 요청, 기존 업체 이용으로 나뉘지만 가격·범위·완료 기준을 같은 기준으로 비교하기 어렵습니다. 본 과제는 이 문제를 기능 추가만으로 해결하지 않고, 고객이 구매 전에 결과와 거래조건을 이해하고 실제로 비용을 지불할 수 있는 최소 서비스 단위를 구축하는 데 목적이 있습니다.`;
  const solutionParagraph = `${offerName}은(는) ${text(opportunity.model, "제공 방식 확인 필요")} 방식으로 ${offerOutcome}을(를) 제공합니다. 고객은 신청 단계에서 필요한 정보, 포함·제외 범위, 가격, 완료 시점과 수정·환불 조건을 확인합니다. 대표자는 접수·제공·검수·완료 기록을 같은 절차로 운영하고, 초기 유료 주문에서 반복되는 입력과 업무만 이후 자동화 대상으로 선정합니다.`;
  const growthParagraph = `초기 시장 진입은 ${province(project)}의 ${text(opportunity.customer, "목표 고객")}를 중심으로 진행합니다. 노출 수보다 가격 공개 제안, 문의, 결제, 재구매, 환불과 고객 한 명 확보비용을 측정합니다. 같은 고객군에서 공헌이익과 반복 구매가 확인된 경로에만 홍보비를 확대하며, 검증 전에는 고정비가 큰 사무실·채용·대규모 개발 계약을 진행하지 않습니다.`;
  const statusLabel = match.status === "eligible" ? "입력 조건상 신청 가능 후보" : match.status === "conditional" ? "조건부 후보 · 원문 확인 필요" : "현재 정보상 요건 미충족";

  return [
    `## ${match.title} 제출용 신청서 본문`,
    "",
    `- 주관기관: ${match.organizer}`,
    `- 자동 자격 판정: ${statusLabel}`,
    `- 지원 내용: ${programSummary}`,
    `- 공고·접수 기간: ${program?.applicationWindow ?? "최신 공고 확인"}`,
    `- 공식 원문: ${match.officialUrl ? `[열기](${match.officialUrl})` : "확인 필요"}`,
    "",
    "### 창업아이템 개요(요약)",
    "",
    "| 항목 | 작성 내용 |",
    "| --- | --- |",
    `| 창업아이템명 | ${escapeCell(opportunity.title)} |`,
    `| 목표 고객 | ${escapeCell(opportunity.customer)} |`,
    `| 핵심 상품·서비스 | ${escapeCell(offerName)} |`,
    `| 고객 제공 혜택 | ${escapeCell(offerOutcome)} |`,
    `| 제공 방식 | ${escapeCell(opportunity.model)} |`,
    `| 첫 판매가 | ${formatWon(financial?.grossPrice)} |`,
    `| 협약기간 산출물 | ${escapeCell(offerName)} 1식, 신청·제공·검수 절차 1식, 가격 공개 고객 검증 결과표 1식 |`,
    `| 지원사업 목표 | ${escapeCell(applicationGoal)} |`,
    "",
    ...applicationParagraphs(project, workspace, match),
    "",
    "### 1. 문제 인식(Problem) · 창업아이템의 필요성",
    "",
    problemParagraph,
    "",
    evidence.length
      ? `현재 연결된 고객·시장 자료 ${evidence.length}건을 아래와 같이 사용합니다. 공식 원문 확인 표시가 없는 자료는 시장 사실이 아니라 검증할 가정입니다.`
      : "공식 시장 수치와 고객 인터뷰 원문은 아직 연결되지 않았습니다. 따라서 문제의 크기를 과장하지 않고 첫 고객군의 실제 구매 검증을 과제 범위로 설정합니다.",
    "",
    "| 상태 | 확인 내용 | 자료·기준일 | 원문 |",
    "| --- | --- | --- | --- |",
    ...evidenceRows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
    "",
    "| 현재 대안 | 고객이 얻는 장점 | 남아 있는 불편 | 본 과제의 검증할 차별점 |",
    "| --- | --- | --- | --- |",
    ...alternatives.map((alternative, index) => `| ${escapeCell(alternative)} | ${index === 0 ? "비용을 직접 통제" : "익숙하고 접근이 쉬움"} | 결과 범위·시간·책임의 편차 | 가격·범위·완료 증거를 사전에 합의 |`),
    "",
    "### 2. 실현 가능성(Solution) · 개발 및 구체화 계획",
    "",
    solutionParagraph,
    "",
    "| 단계 | 추진 내용 | 기간 | 산출물·완료 기준 |",
    "| ---: | --- | --- | --- |",
    "| 1 | 고객 문제·현재 대안 확인 | 1개월 | 최근 행동 인터뷰와 가격 공개 제안 기록 |",
    `| 2 | ${escapeCell(offerName)} 1차 구현 | 1~2개월 | 판매 가능한 결과물 1식 |`,
    "| 3 | 신청·제공·검수 절차 구축 | 2개월 | 운영 절차서와 고객 안내문 |",
    "| 4 | 소규모 유료 제공 | 2~3개월 | 주문별 매출·원가·수정·환불 기록 |",
    "| 5 | 판매 경로·문구 개선 | 3~5개월 | 문의→결제 전환 기록 |",
    "| 6 | 반복 제공과 확장 판정 | 협약 종료 전 | 공헌이익·재구매·고객획득비용 |",
    "",
    "#### 정부지원사업비 집행 계획 초안",
    "",
    `현재 입력으로 산출한 신청 비목 합계는 ${formatWon(budgetTotal)}입니다. 전체 창업 필요자금 ${formatWon(financial?.totalFundingNeed)}과 정부지원금 신청액은 구분하며, 선택 공고에서 인정하는 비목과 자기부담 비율을 적용해 최종 확정합니다.`,
    "",
    "| 비목 | 신청액 초안 | 수량·단가 산출 근거 | 과제 성과와의 연결 |",
    "| --- | ---: | --- | --- |",
    ...(budgetRows.length
      ? budgetRows.map((row) => `| ${escapeCell(row[0])} | ${formatWon(row[1])} | ${escapeCell(row[2])} | ${escapeCell(row[3])} |`)
      : ["| 비목 확정 필요 | 확인 필요 | 실제 견적과 수량·단가 입력 필요 | 협약 산출물과 연결 필요 |"]),
    `| **합계** | **${formatWon(budgetTotal)}** | 견적 확인 전 산출 초안 | ${escapeCell(applicationGoal)} |`,
    "",
    "### 3. 성장전략(Scale-up) · 사업화 추진 전략",
    "",
    growthParagraph,
    "",
    "| 수익·손익 항목 | 현재 작성값 | 판단 기준 |",
    "| --- | ---: | --- |",
    `| 수익 방식 | ${escapeCell(opportunity.revenue)} | 실제 고객이 결제하는 거래 구조 |`,
    `| 고객 판매가 | ${formatWon(financial?.grossPrice)} | 저장된 가격·세금 조건 |`,
    `| 건당 변동비 | ${formatWon(financial?.variableCostPerUnit)} | 재료·작업·배송·수수료 |`,
    `| 건당 공헌이익 | ${formatWon(financial?.contributionPerUnit)} | 부가세 제외 매출 - 변동비 |`,
    `| 월 손익분기점 | ${financial?.breakEvenUnits === null || financial?.breakEvenUnits === undefined ? "확인 필요" : `${financial.breakEvenUnits.toLocaleString("ko-KR")}건 · ${formatWon(financial.breakEvenRevenue)}`} | 월 고정비 ÷ 건당 공헌이익 |`,
    "",
    "| 우선순위 | 목표시장 진입 경로 | 실행 내용 | 측정 지표 |",
    "| ---: | --- | --- | --- |",
    ...channels.map((channel, index) => `| ${index + 1} | ${escapeCell(channel)} | 같은 가격과 범위로 제안 | 문의·제안·결제·고객획득비용 |`),
    "",
    "| 기간 | 목표 | 정량 산출물 | 계속·수정 기준 |",
    "| --- | --- | --- | --- |",
    `| 1~3개월 | 문제·가격·제공 가능성 확인 | 가격 공개 제안 30건, 유료 고객 ${targetPaid}건 | 고객 문제와 실제 결제가 없으면 고객·범위 수정 |`,
    `| 4~6개월 | ${escapeCell(offerName)} 반복 제공 | 월 목표 ${targetUnits === null ? "확인 필요" : `${targetUnits.toLocaleString("ko-KR")}건`}, 주문별 원가표 | 공헌이익이 0 이하이면 확대 중단 |`,
    "| 7~9개월 | 반복 업무 표준화·도구화 | 처리시간·누락률·재구매 기록 | 자동화 비용보다 운영 절감이 큰지 확인 |",
    "| 10~12개월 | 인접 고객·지역 확장 판단 | 재구매율·추천·고객획득비용 | 확장 후 공헌이익 유지 시 다음 투자 검토 |",
    "",
    "### 4. 팀 구성(Team) · 대표자 및 팀원 구성 계획",
    "",
    founderCapability
      ? `대표자는 ${founderCapability}의 경험을 바탕으로 고객 확인, 상품 범위 결정과 품질 검수를 직접 담당합니다. 실제 제출본에는 개인정보를 마스킹한 경력·포트폴리오·성과 증빙을 연결합니다.`
      : "대표자는 고객 확인, 상품 범위 결정과 품질 검수를 직접 담당합니다. 다만 관련 경력·성과가 입력되지 않아 해당 칸만 실제 경력증명·포트폴리오 내용으로 교체해야 합니다.",
    "",
    "| 구분 | 담당 업무 | 보유역량 | 구성·보완 계획 |",
    "| --- | --- | --- | --- |",
    `| 대표자 | 고객 확인, 상품·가격 결정, 품질·손익 관리 | ${escapeCell(founderCapability ?? "실제 관련 경력·성과 입력 필요")} | 현재 · 증빙 연결 필요 |`,
    `| 제품·서비스 | ${escapeCell(offerName)} 구현·개선 | 대표자가 직접 제공 가능한 범위부터 시작 | 부족 기술만 범위가 정해진 외주 활용 |`,
    "| 판매·고객 | 제안, 문의, 계약, 재구매 기록 | 초기에는 대표자가 직접 고객 언어 확보 | 반복 경로 확인 후 채용 판단 |",
    "| 전문 협력 | 인허가·계약·개인정보 등 검토 | 내부 보유로 가정하지 않음 | 필요한 시점에 산출물·견적을 정해 협업 |",
    "",
    "### 5. 기대성과 및 협약 종료 시 판정",
    "",
    `협약 종료 시 ${offerName} 1식, 표준 운영 절차 1식, 가격 공개 제안 30건과 유료 고객 ${targetPaid}건의 결과표를 확보합니다. 성과는 단순 노출 수가 아니라 실제 결제, 공헌이익, 제공시간, 수정·환불, 재구매와 고객 한 명 확보비용으로 판정합니다. 목표를 달성하지 못하면 기능을 늘리기보다 고객군·제공 범위·가격을 한 번씩 분리해 수정하고, 손실 또는 통제하기 어려운 위험이 지속되면 확대를 중단합니다.`,
    "",
  ].join("\n");
}

export function generateGrantPackage(
  project: ProjectRecord,
  workspace: GrantWorkspace,
  analysis: GrantAnalysis,
): GrantPackage {
  const prioritized = analysis.matches
    .filter((item) => item.status !== "ineligible" && item.programId !== "kstartup-2026-integrated")
    .slice(0, workspace.bookmarkedProgramIds.length
      ? analysis.matches.filter((item) => workspace.bookmarkedProgramIds.includes(item.programId)).length || 3
      : 3);
  const selected = prioritized.length
    ? prioritized
    : analysis.matches.filter((item) => item.programId !== "kstartup-2026-integrated").slice(0, 3);
  const sections: GrantApplicationSection[] = selected.map((match) => ({
    programId: match.programId,
    title: match.title,
    status: match.status,
    paragraphs: applicationParagraphs(project, workspace, match),
    evidenceChecklist: [
      ...match.missingEvidence,
      "공고 원문의 세부 자격 요건",
      "제출 마감일·필수 서식",
    ],
  }));
  const markdown = [
    "# 공공지원사업 신청서 본문 작성본",
    "",
    `> 공고 목록 기준일 ${analysis.catalogObservedAt} · 2026 창업지원사업 문제 인식·실현 가능성·성장전략·팀 구성 구조`,
    "",
    `프로젝트: ${text(project.opportunity.title, project.title)}`,
    `작성 상태: 신청서 본문 완성 · 증빙 준비도 ${analysis.readinessScore}% · 조건 충족 후보 ${analysis.eligibleCount}건 · 원문 검토 필요 ${analysis.conditionalCount}건`,
    "",
    "> 아래 본문은 선택한 공고의 공식 HWPX에 옮겨 쓸 수 있도록 작성했습니다. 확인되지 않은 실적·시장 수치·대표자 경력은 만들지 않았으며, 교체가 필요한 칸만 제한적으로 표시합니다.",
    "",
    "## 후보 비교표",
    "",
    "| 지원사업 | 자동 판정 | 적합도 | 최대 지원액 | 공식 공고 |",
    "| --- | --- | ---: | ---: | --- |",
    ...selected.map((section) => {
      const match = analysis.matches.find((item) => item.programId === section.programId);
      const status = section.status === "eligible" ? "입력 조건상 신청 가능 후보" : section.status === "conditional" ? "원문·증빙 확인 필요" : "현재 정보상 미충족";
      return `| ${section.title} | ${status} | ${match?.fitScore ?? 0}점 | ${match?.maxSupportWon === null || match?.maxSupportWon === undefined ? "공고 확인" : `${match.maxSupportWon.toLocaleString("ko-KR")}원`} | ${match?.officialUrl ? `[원문 열기](${match.officialUrl})` : "원문 확인 필요"} |`;
    }),
    "",
    "# 제출용 신청서 본문",
    "",
    ...selected.flatMap((match, index) => [
      applicationMarkdown(project, workspace, match),
      ...(index < selected.length - 1 ? ["", "---", ""] : []),
    ]),
    "",
    "# 참고 부록 · 제출본에서 분리",
    "",
    "> 아래 내용은 자격과 증빙을 확인하기 위한 참고표입니다. 신청서의 문제 인식·실현 가능성·성장전략·팀 구성 본문에 그대로 복사하지 않습니다.",
    "",
    ...sections.flatMap((section) => [
      `## ${section.title} 자격·증빙 확인`,
      `- 자동 판정: ${section.status === "eligible" ? "입력 조건상 신청 가능 후보" : section.status === "conditional" ? "조건부 후보 · 원문 확인 필요" : "현재 정보상 요건 미충족"}`,
      ...section.evidenceChecklist.map((item) => `- [ ] ${item}`),
      "",
    ]),
    "## 공통 확인",
    "- 공고 원문에서 접수 기간, 대표자·업력·지역·중복수혜·제외업종과 필수 서식을 다시 확인합니다.",
    "- 자동 판정은 프로젝트에 저장된 사실과 계산값만 사용하며 자격과 선정 가능성을 보장하지 않습니다.",
    "",
    "## 제출 파일 묶음 확인",
    "- [ ] 해당 공고에서 내려받은 최신 신청서·사업계획서 원본",
    "- [ ] 사업자등록·창업일·대표자·지역·업종을 확인할 자료",
    "- [ ] 국세·지방세 체납 여부와 중복수혜·제외업종 확인",
    "- [ ] 고객·시장·경쟁·매출·원가 주장을 뒷받침하는 원문",
    "- [ ] 사업비 비목별 수량 × 단가 × 개월 산출근거와 견적",
    "- [ ] 최종 제출 PDF와 접수번호·제출 시각 보관",
  ].join("\n");
  return {
    title: "공공지원사업 신청서 본문 작성본",
    generatedAt: new Date().toISOString(),
    markdown,
    sections,
  };
}

export function createGrantWorkspace(project: ProjectRecord): GrantWorkspace {
  return {
    founderAge: null,
    teamSize: Math.max(1, project.businessSetup?.employeeCount ?? 1),
    priorGrantReceived: false,
    registrationStatus: "unknown",
    registrationEvidenceUrl: "",
    officialAnnouncementChecked: false,
    taxArrearsChecked: false,
    exclusionCriteriaChecked: false,
    supportingEvidenceUrls: [],
    preferredSupportTypes: ["seed_funding", "mentoring"],
    targetRegions: project.businessSetup?.region
      ? [project.businessSetup.region]
      : [],
    applicationGoal: "",
    evidenceNotes: "",
    bookmarkedProgramIds: [],
  };
}
