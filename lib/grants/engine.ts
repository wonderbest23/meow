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
  return [
    `사업명: ${text(opportunity.title, project.title)}`,
    `목표 고객: ${text(opportunity.customer, "추가 확인 필요")}`,
    `해결하려는 문제와 제안 가치: ${text(opportunity.oneLiner, "추가 확인 필요")}`,
    `사업 방식: ${text(opportunity.model, "추가 확인 필요")}`,
    `첫 확인 계획: ${text(opportunity.firstTest, "실제 고객 인터뷰와 소규모 시험 운영 필요")}`,
    workspace.applicationGoal
      ? `지원사업을 통해 달성하려는 목표: ${workspace.applicationGoal}`
      : "지원사업을 통해 초기 고객 검증과 운영 자금을 확보하고자 합니다.",
    project.businessAssessment
      ? `재무 계획상 총 필요자금은 ${project.businessAssessment.financial.totalFundingNeed.toLocaleString("ko-KR")}원이며, 손익분기 매출은 ${project.businessAssessment.financial.breakEvenRevenue?.toLocaleString("ko-KR") ?? "미산출"}원입니다.`
      : "재무 계획은 사업 조건 저장 후 자동 계산됩니다.",
    `팀 규모: ${workspace.teamSize}명 · 사업 지역: ${province(project)}`,
    match.matchedCriteria.length
      ? `공고 적합 근거: ${match.matchedCriteria.join(" ")}`
      : "공고 적합 근거를 추가로 정리해야 합니다.",
  ];
}

export function generateGrantPackage(
  project: ProjectRecord,
  workspace: GrantWorkspace,
  analysis: GrantAnalysis,
): GrantPackage {
  const prioritized = analysis.matches
    .filter((item) => item.status !== "ineligible")
    .slice(0, workspace.bookmarkedProgramIds.length
      ? analysis.matches.filter((item) => workspace.bookmarkedProgramIds.includes(item.programId)).length || 3
      : 3);
  const selected = prioritized.length
    ? prioritized
    : analysis.matches.slice(0, 3);
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
    "# 공공지원사업 매칭·신청 초안",
    "",
    `> 공고 목록 기준일 ${analysis.catalogObservedAt} · 판정 기준 1판`,
    "",
    `프로젝트: ${text(project.opportunity.title, project.title)}`,
    `증빙 준비도: ${analysis.readinessScore} · 조건 충족 후보 ${analysis.eligibleCount}건 · 원문 검토 필요 ${analysis.conditionalCount}건`,
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
    ...sections.flatMap((section) => [
      `## ${section.title}`,
      "",
      `상태: ${section.status === "eligible" ? "입력 조건상 신청 가능 후보" : section.status === "conditional" ? "후보 · 원문 및 증빙 확인 필요" : "현재 정보상 요건 미충족"}`,
      `공식 공고: ${analysis.matches.find((item) => item.programId === section.programId)?.officialUrl ? `[원문 열기](${analysis.matches.find((item) => item.programId === section.programId)?.officialUrl})` : "공고 원문 확인 필요"}`,
      "",
      ...section.paragraphs.map((paragraph) => paragraph),
      "",
      "### 제출 전 확인",
      ...section.evidenceChecklist.map((item) => `- ${item}`),
      "",
      "---",
      "",
    ]),
    "## 공통 주의",
    "- 이 문서는 공고 원문을 대체하지 않습니다. 마감일·세부 자격·필수 서식은 반드시 공식 링크에서 확인하세요.",
    "- 자동 판정은 프로젝트에 저장된 사실과 계산값만 사용합니다. 추측으로 자격을 확정하지 않습니다.",
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
    title: "공공지원사업 매칭·신청 초안",
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
