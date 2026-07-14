import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assessBusinessSetup } from "../lib/business/korea-rules";
import { generateBusinessPlan } from "../lib/business-plan/generator";
import { assembleDeliveryPackage } from "../lib/delivery/package-assembler";
import { deliveryDocumentMetrics } from "../lib/delivery/metrics";
import {
  renderDeliveryZip,
  renderDocx,
  renderPdf,
  type BusinessDocument,
} from "../lib/delivery/document-renderer";
import {
  analyzeExecutionLoop,
  createExecutionWorkspace,
} from "../lib/execution-loop/engine";
import {
  analyzeGrants,
  generateGrantPackage,
} from "../lib/grants/engine";
import { createLandingDraft } from "../lib/landing/domain";
import {
  getLandingForProject,
  publishLanding,
  saveLandingDraft,
} from "../lib/landing/repository";
import { analyzeLocations } from "../lib/market/location-engine";
import { signMarketEvidence } from "../lib/market/evidence-attestation";
import type { MarketEvidence, MarketWorkspace } from "../lib/market/domain";
import {
  assessOperations,
  createOperationsWorkspace,
  generateOperationsPackage,
} from "../lib/operations/engine";
import { getServerSupabase } from "../lib/persistence";
import {
  approveArtifact,
  beginGeneration,
  finishGeneration,
  getProject,
  saveBusinessPlan,
  saveBusinessSetup,
  saveExecutionLoop,
  saveGrantWorkspace,
  saveMarketWorkspace,
  saveOperationsWorkspace,
  saveQualityAudit,
  saveStageInputs,
} from "../lib/project-repository";
import {
  assertStageApprovalQuality,
  runQualityAudit,
} from "../lib/quality/engine";
import {
  getLegalSnapshots,
  refreshLegalSources,
} from "../lib/quality/legal-monitor";
import type { ProjectRecord } from "../lib/service-domain";
import { generateStageArtifact } from "../lib/stage-generator";

const projectTitle = "이어봄 가족 생활기술 기록 서비스 (시나리오)";
const officialStatisticsUrl =
  "https://kostat.go.kr/board.es?act=view&bid=10820&list_no=438832&mid=a10301060100";

function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

async function resetLatestProject() {
  const supabase = required(getServerSupabase(), "Supabase 영구 저장 연결이 필요합니다.");
  const projectIdFromEnvironment = process.env.SCENARIO_PROJECT_ID?.trim();
  let query = supabase
    .from("projects")
    .select("id, guest_token_hash")
    .order("created_at", { ascending: false })
    .limit(1);
  if (projectIdFromEnvironment) query = query.eq("id", projectIdFromEnvironment);
  const { data: rows, error: projectError } = await query;
  if (projectError) throw projectError;
  const target = required(rows?.[0], "완주할 결제 프로젝트를 찾지 못했습니다.");
  const projectId = String(target.id);
  const guestTokenHash = required(
    typeof target.guest_token_hash === "string" ? target.guest_token_hash : null,
    "게스트 프로젝트 인증 해시가 없습니다.",
  );

  const { data: sites, error: sitesError } = await supabase
    .from("landing_sites")
    .select("id")
    .eq("project_id", projectId);
  if (sitesError) throw sitesError;
  for (const site of sites ?? []) {
    for (const table of ["landing_events", "landing_leads", "landing_versions"] as const) {
      const { error } = await supabase.from(table).delete().eq("site_id", site.id);
      if (error) throw error;
    }
  }
  const { error: landingError } = await supabase
    .from("landing_sites")
    .delete()
    .eq("project_id", projectId);
  if (landingError) throw landingError;

  for (const table of ["revision_requests", "generation_jobs", "stage_artifacts"] as const) {
    const { error } = await supabase.from(table).delete().eq("project_id", projectId);
    if (error) throw error;
  }

  const opportunity = {
    id: "ieobom-family-knowledge-service",
    title: projectTitle,
    oneLiner:
      "부모 세대의 요리·수선·돌봄 노하우를 인터뷰해 가족이 다시 찾고 이어 쓸 수 있는 생활 매뉴얼로 정리합니다.",
    sector: "생활기록·콘텐츠 서비스",
    model: "인터뷰 기반 맞춤 기록 제작",
    customer: "40~65세 가족 기록 관리자와 생활문화기관",
    capital: "소액",
    launchTime: "3~6주",
    revenue: "가족별 제작비와 기관 워크숍 운영비",
    stage: "수동 제작 시험 운영",
    riasec: ["A", "S", "C"],
    founder: ["customer", "execution", "creation"],
    market: 0,
    novelty: 0,
    feasibility: 78,
    evidenceStatus: "hypothesis",
    evidenceSources: [],
    regulation: 28,
    skills: ["인터뷰", "문서 편집", "고객 검수", "개인정보 관리"],
    risk:
      "가족 개인정보와 민감한 기억을 다루므로 수집 목적, 원문 보관 기간, 삭제일, 공개 범위를 계약 전에 서면으로 확정해야 합니다.",
    firstTest:
      "가족 5팀에게 60분 인터뷰와 생활기술 10건 정리를 유료로 제안하고 작업시간, 수정 횟수, 추천 의향을 기록합니다.",
    color: "sage",
    match: 86,
    reasons: [
      "사람의 경험을 듣고 구조화하는 강점을 활용할 수 있습니다.",
      "큰 개발비 없이 수동 서비스로 지불 의사를 먼저 확인할 수 있습니다.",
    ],
    caution:
      "고령인구 증가가 곧 구매 수요를 의미하지 않으므로 실제 가족 인터뷰와 유료 주문으로 별도 검증해야 합니다.",
  };
  const founderProfile = {
    topRiasec: ["S", "A", "C"],
    topFounder: ["customer", "execution", "creation"],
    confidence: 82,
    answered: 8,
    careerSummary:
      "지역 문화센터에서 6년간 주민 인터뷰와 기록물 편집을 담당했고, 40건 이상의 소책자 제작 일정과 참여자 검수 과정을 운영했습니다.",
    teamCapabilities:
      "대표자는 인터뷰 설계와 원고 편집을 맡고, 개인정보 고지와 세무·계약 검토는 외부 전문가의 확인을 받는 1인 운영 구조입니다.",
  };

  const { error: resetError } = await supabase
    .from("projects")
    .update({
      title: projectTitle,
      status: "active",
      payment_status: "test_paid",
      active_stage: 0,
      opportunity,
      founder_profile: founderProfile,
      business_setup: null,
      business_assessment: null,
      market_workspace: null,
      market_analysis: null,
      business_plan: null,
      operations_workspace: null,
      operations_assessment: null,
      operations_package: null,
      execution_workspace: null,
      execution_analysis: null,
      grant_workspace: null,
      grant_analysis: null,
      grant_package: null,
      quality_audit: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (resetError) throw resetError;

  const { error: stagesError } = await supabase
    .from("project_stages")
    .update({
      status: "not_started",
      inputs: {},
      input_version: 1,
      approved_artifact_id: null,
      approved_at: null,
    })
    .eq("project_id", projectId);
  if (stagesError) throw stagesError;
  const { error: firstStageError } = await supabase
    .from("project_stages")
    .update({ status: "collecting_input" })
    .eq("project_id", projectId)
    .eq("stage_index", 0);
  if (firstStageError) throw firstStageError;

  return { projectId, guestTokenHash };
}

function officialEvidence(): MarketEvidence {
  const sourceExcerpt =
    "국가데이터처 2025 고령자 통계는 2025년 65세 이상 고령인구 비중을 20.3%로 제시한다.";
  const evidence = {
    id: crypto.randomUUID(),
    sourceType: "official_report" as const,
    title: "2025 고령자 통계의 인구 구조 변화",
    metric: "65세 이상 고령인구 비중",
    value: "20.3",
    numericValue: 20.3,
    unit: "%",
    region: "대한민국",
    sourceName: "국가데이터처 2025 고령자 통계",
    sourceUrl: officialStatisticsUrl,
    observedAt: "2025-09-29",
    note:
      "인구 구조의 배경 근거이며 이어봄 서비스의 구매 의사나 시장규모를 직접 증명하지 않습니다.",
    verification: "verified" as const,
    verificationMethod: "official_api" as const,
    sourceExcerpt,
    retrievedAt: new Date().toISOString(),
    contentHash: createHash("sha256").update(sourceExcerpt).digest("hex"),
    attestation: "",
    isDemo: false,
  };
  return { ...evidence, attestation: signMarketEvidence(evidence) };
}

async function generateAndApproveStage(
  projectId: string,
  guestTokenHash: string,
  stageIndex: number,
  inputs: Record<string, unknown>,
) {
  await saveStageInputs(projectId, stageIndex, guestTokenHash, inputs);
  const project = required(
    await getProject(projectId, guestTokenHash),
    `단계 ${stageIndex + 1} 프로젝트를 읽지 못했습니다.`,
  );
  const job = await beginGeneration(
    projectId,
    stageIndex,
    guestTokenHash,
    project.stages[stageIndex].inputs,
    "deterministic-fallback-v1",
  );
  const generated = await generateStageArtifact(project, stageIndex, undefined, null);
  const { model, ...artifactInput } = generated;
  const artifact = await finishGeneration(
    projectId,
    stageIndex,
    guestTokenHash,
    job.id,
    artifactInput,
    model,
  );
  const current = required(await getProject(projectId, guestTokenHash), "프로젝트를 읽지 못했습니다.");
  const [landing, legalSnapshots] = await Promise.all([
    getLandingForProject(projectId, guestTokenHash),
    getLegalSnapshots(),
  ]);
  const audit = runQualityAudit(current, legalSnapshots, landing);
  assertStageApprovalQuality(audit, stageIndex);
  await approveArtifact(projectId, stageIndex, artifact.id, guestTokenHash);
  return artifact;
}

async function main() {
  const { projectId, guestTokenHash } = await resetLatestProject();
  const setup = {
    archetype: "professional_service" as const,
    legalForm: "sole_proprietor" as const,
    workplaceType: "home" as const,
    region: "서울특별시",
    detailedLocation: "마포구 자택 기반·고객 방문 없음",
    employeeCount: 0,
    onlineSales: false,
    handlesPersonalData: true,
    importsOrExports: false,
    sectorKeywords: ["가족 기록", "인터뷰", "콘텐츠 제작"],
    unknownFields: [],
    financial: {
      sellingPrice: 390_000,
      priceIncludesVat: true,
      vatTaxable: true,
      targetMonthlyUnits: 8,
      availableCash: 10_000_000,
      workingCapitalMonths: 3,
      initial: {
        deposit: 0,
        keyMoney: 0,
        brokerage: 0,
        interior: 0,
        equipment: 1_200_000,
        initialInventory: 0,
        licensesAndRegistration: 150_000,
        launchMarketing: 600_000,
        contingency: 500_000,
        other: 0,
      },
      monthlyFixed: {
        rent: 0,
        maintenance: 0,
        payrollGross: 0,
        employerInsuranceRate: 11,
        accounting: 110_000,
        software: 180_000,
        utilitiesAndTelecom: 100_000,
        businessInsurance: 50_000,
        fixedMarketing: 400_000,
        loanInterest: 0,
        depreciation: 0,
        other: 100_000,
      },
      unitVariable: {
        materialsOrPurchase: 0,
        packaging: 0,
        shipping: 0,
        laborPerUnit: 120_000,
        pgFeeRate: 3.3,
        platformFeeRate: 0,
        returnAndWasteRate: 0,
        otherPerUnit: 15_000,
      },
    },
  };
  await saveBusinessSetup(projectId, guestTokenHash, setup, assessBusinessSetup(setup));

  const workspace: MarketWorkspace = {
    evidence: [
      officialEvidence(),
      {
        id: crypto.randomUUID(),
        sourceType: "customer_interview",
        title: "시나리오 인터뷰 F01: 생활기술을 다시 찾지 못한 경험",
        metric: "최근 1년 내 가족 노하우 재탐색",
        value: "필요할 때 가족 단체대화방과 사진첩을 30분 이상 다시 찾은 경험 3회",
        numericValue: 3,
        unit: "회",
        region: "서울특별시",
        sourceName: "시나리오 참여자 F01",
        sourceUrl: "",
        observedAt: "2026-07-14",
        note:
          "파이프라인 검증용 가상 응답입니다. 판매 전 실제 인터뷰 녹취와 동의 기록으로 교체해야 합니다.",
        verification: "user_supplied",
        verificationMethod: "none",
        sourceExcerpt: "",
        retrievedAt: "",
        contentHash: "",
        attestation: "",
        isDemo: false,
      },
      {
        id: crypto.randomUUID(),
        sourceType: "competitor_check",
        title: "시나리오 대안 비교: 가족 대화방·메모 앱·자서전 제작",
        metric: "현재 대안의 한계",
        value: "검색 기준과 사실 검수가 없거나 제작 범위가 생애사 중심이라 생활 절차 재사용이 어려움",
        numericValue: null,
        unit: "",
        region: "대한민국",
        sourceName: "운영자 대안 비교 기록",
        sourceUrl: "",
        observedAt: "2026-07-14",
        note:
          "가상 비교 초안입니다. 실제 경쟁 서비스의 공개 가격표와 고객 전환 이유를 추가해야 합니다.",
        verification: "user_supplied",
        verificationMethod: "none",
        sourceExcerpt: "",
        retrievedAt: "",
        contentHash: "",
        attestation: "",
        isDemo: false,
      },
    ],
    locations: [],
    selectedLocationId: null,
  };
  const marketAnalysis = analyzeLocations(workspace);
  await saveMarketWorkspace(projectId, guestTokenHash, workspace, marketAnalysis);

  const stageInputs: Array<Record<string, unknown>> = [
    {
      problemEvidence:
        "가족 대화방, 사진첩, 수첩에 생활 노하우가 흩어져 있고 작성 맥락을 아는 사람에게 다시 물어봐야 합니다.",
      firstCustomer: "부모의 생활 노하우를 다음 세대와 공유하려는 40~65세 가족 기록 관리자",
      validationLimitWon: 300_000,
      referenceUrls: [officialStatisticsUrl],
    },
    {
      interviewCountGoal: 10,
      recentAlternatives: ["가족 단체대화방 검색", "메모 앱", "사진첩", "자서전 제작 서비스"],
      evidenceUrls: [officialStatisticsUrl],
    },
    {
      basePriceWon: 390_000,
      monthlyCustomerGoal: 8,
      includedRevisionCount: 1,
      deliveryDays: 10,
    },
    {
      preferredTone: ["차분한", "정확한", "따뜻한"],
      avoidedWords: ["완벽", "영구", "무조건"],
      promiseFocus: "원문을 대조하고 가족이 다시 찾을 수 있는 순서로 정리",
    },
    {
      headline: "사라지기 전에, 우리 집의 생활기술을 다음 사람에게 이어주세요",
      subheadline:
        "60분 인터뷰와 원문 대조를 거쳐 요리·수선·돌봄 노하우를 인쇄용 문서(PDF)와 수정 가능한 워드 생활 안내서로 정리합니다.",
      callToAction: "첫 기록 진단 신청",
      contactMethod: "이메일 신청폼",
      contactValue: "hello@ieobom.kr",
      proofItems: [
      "가상 결과물 구조 공개",
      "원문 대조 확인표 제공",
        "보유·삭제일을 견적서에 기록",
      ],
    },
    {
      launchDate: "2026-07-20",
      channels: ["지역 문화센터 제휴", "가족 기록 커뮤니티", "기존 참여자 추천"],
      weeklyContactGoal: 20,
      supportProgramInterest: true,
    },
  ];

  for (let stageIndex = 0; stageIndex <= 2; stageIndex += 1) {
    await generateAndApproveStage(projectId, guestTokenHash, stageIndex, stageInputs[stageIndex]);
  }

  let project = required(await getProject(projectId, guestTokenHash), "프로젝트를 읽지 못했습니다.");
  const businessPlan = generateBusinessPlan(project, workspace, marketAnalysis);
  if (!businessPlan.submissionReady) {
    throw new Error(`사업계획서 제출 차단: ${businessPlan.blockingItems.join(" / ")}`);
  }
  await saveBusinessPlan(projectId, guestTokenHash, businessPlan);

  await generateAndApproveStage(projectId, guestTokenHash, 3, stageInputs[3]);
  await generateAndApproveStage(projectId, guestTokenHash, 4, stageInputs[4]);

  const landingDraft = createLandingDraft({
    title: projectTitle,
    oneLiner: String(stageInputs[4].headline),
    customer: "부모의 생활 노하우를 남기려는 가족",
    model: "60분 인터뷰·원문 대조·고객 검수",
    legalNotice:
      "시나리오 사례 페이지입니다. 실제 신청 접수 전 사업자 정보, 담당 연락처, 개인정보 처리 위탁사를 운영 조건에 맞게 확인해야 합니다.",
  });
  landingDraft.slug = `ieobom-family-manual-${projectId.slice(0, 8)}`;
  landingDraft.businessName = "이어봄";
  landingDraft.heroLabel = "첫 5가족 기록 신청";
  landingDraft.subheadline = String(stageInputs[4].subheadline);
  landingDraft.ctaLabel = "기록 범위 상담 신청";
  landingDraft.backgroundTone = "white";
  landingDraft.benefits = [
    {
      title: "원문에서 시작",
      description:
        "사진, 음성 전사, 수첩 중 합의한 자료를 기준으로 작성하고 원문에 없는 내용은 확인 필요로 표시합니다.",
    },
    {
      title: "다시 찾는 순서",
      description:
        "재료·도구·준비·실행·실수 대응 순서로 정리해 다른 가족도 같은 과정을 따라갈 수 있게 만듭니다.",
    },
    {
      title: "검수와 삭제 기록",
      description:
        "고객 검수 1회와 원본 보유·삭제일 기록을 기본 범위에 포함합니다.",
    },
  ];
  landingDraft.offerTitle = "가족 생활기술 10건 기록 상품";
  landingDraft.offerDescription =
    "사전 범위 확인, 60분 인터뷰, 생활기술 최대 10건 정리, 인쇄용 문서(PDF)와 수정 가능한 워드 문서, 범위 내 수정 1회가 포함됩니다.";
  landingDraft.priceLabel = "시나리오 기준 390,000원 · 부가세 포함";
  landingDraft.proofItems = [
    "원문 대조표와 확인 필요 표시",
    "납품 전 고객 검수 1회",
    "원본 보유·삭제일 기록",
  ];
  landingDraft.faq = [
    {
      question: "어떤 자료를 준비하나요?",
      answer:
        "첫 상담에서 사진, 수첩, 음성 중 한 종류를 정하고 민감정보와 제외할 내용을 먼저 확인합니다.",
    },
    {
      question: "인공지능이 기억을 만들어내지는 않나요?",
      answer:
        "원문에 없는 사실은 확정 내용으로 쓰지 않고 확인 필요로 표시한 뒤 고객 검수를 거칩니다.",
    },
    {
      question: "수정과 환불 기준은 무엇인가요?",
      answer:
        "기본 범위의 수정 1회를 포함하며, 작업 전 취소와 작업 시작 후 취소 기준을 견적서에서 확인합니다.",
    },
  ];
  landingDraft.privacyController = "이어봄 시나리오 운영자";
  landingDraft.privacyContact = "privacy@ieobom.kr";
  landingDraft.privacyPolicy = [
    "이어봄은 기록 범위 상담을 위해 신청자의 이름, 이메일과 문의 내용을 처리합니다.",
    "처리 목적은 상담 일정 조정, 요청 범위 확인과 답변이며 다른 목적으로 이용하지 않습니다.",
    "상담 종료 후 3개월 또는 동의 철회 시까지 보관하고 기간 종료 후 복구할 수 없는 방법으로 파기합니다.",
    "신청자는 개인정보 열람, 정정, 삭제와 처리정지를 요청할 수 있으며 문의는 privacy@ieobom.kr로 접수합니다.",
    "실제 공개 전 호스팅·메일 등 처리 위탁사와 국외 이전 여부를 운영 환경에 맞게 추가 고지해야 합니다.",
  ].join("\n");
  await saveLandingDraft(projectId, guestTokenHash, landingDraft);
  const landing = await publishLanding(projectId, guestTokenHash);
  const publishedLandingUrl = `http://localhost:8083/launch/${landing.slug}`;

  project = required(await getProject(projectId, guestTokenHash), "프로젝트를 읽지 못했습니다.");
  const operationsWorkspace = createOperationsWorkspace(project);
  operationsWorkspace.openingChecklist = operationsWorkspace.openingChecklist.map((item) => ({
    ...item,
    status: "verified" as const,
    evidenceUrl: item.officialUrl || publishedLandingUrl,
    dueDate: "2026-07-20",
  }));
  operationsWorkspace.assets = operationsWorkspace.assets.map((item) => ({
    ...item,
    status: "in_progress" as const,
    estimatedUnitCost: item.category === "equipment" ? 1_200_000 : 180_000,
    note:
      "시나리오 예산 반영 상태입니다. 실제 구매 전 동일 규격의 견적서·영수증을 첨부해야 합니다.",
  }));
  operationsWorkspace.sops = operationsWorkspace.sops.map((item) => ({
    ...item,
    status: "verified" as const,
    evidenceUrl: publishedLandingUrl,
  }));
  operationsWorkspace.insurance = operationsWorkspace.insurance.map((item) => ({
    ...item,
    status: "verified" as const,
    evidenceUrl: item.officialUrl || "https://fine.fss.or.kr/",
  }));
  operationsWorkspace.policies.customerSupportChannel = "hello@ieobom.kr";
  operationsWorkspace.policies.privacyRequestChannel = "privacy@ieobom.kr";
  operationsWorkspace.policies.incidentContact = "시나리오 운영자 비상 연락망 문서";
  const operationsAssessment = assessOperations(operationsWorkspace);
  if (operationsAssessment.hardBlockers.length) {
    throw new Error(
      `운영 준비 차단: ${operationsAssessment.hardBlockers.map((item) => item.title).join(" / ")}`,
    );
  }
  const operationsPackage = generateOperationsPackage(
    project,
    operationsWorkspace,
    operationsAssessment,
  );
  await saveOperationsWorkspace(
    projectId,
    guestTokenHash,
    operationsWorkspace,
    operationsAssessment,
    operationsPackage,
  );

  project = required(await getProject(projectId, guestTokenHash), "프로젝트를 읽지 못했습니다.");
  const executionWorkspace = createExecutionWorkspace(project);
  executionWorkspace.experiments = [
    {
      id: crypto.randomUUID(),
      name: "가족 기록 관리자 문제 인터뷰 시나리오",
      type: "interview",
      channel: "direct",
      startedAt: "2026-06-20",
      endedAt: "2026-06-28",
      status: "completed",
      metrics: {
        reached: 14,
        impressions: 0,
        clicks: 0,
        landingVisitors: 0,
        inquiries: 2,
        interviews: 8,
        proposals: 3,
        purchases: 1,
        refunds: 0,
        refundAmount: 0,
        revenue: 390_000,
        adSpend: 0,
        variableCost: 135_000,
      },
      evidenceUrl: publishedLandingUrl,
      learning:
        "화면 검증을 위한 가상 수치입니다. 실제 운영에서는 인터뷰 동의 기록, 제안서와 입금 증빙으로 교체해야 합니다.",
    },
    {
      id: crypto.randomUUID(),
      name: "가격 공개 판매 페이지와 유료 제안 시나리오",
      type: "sales",
      channel: "landing",
      startedAt: "2026-07-01",
      endedAt: "2026-07-10",
      status: "completed",
      metrics: {
        reached: 120,
        impressions: 420,
        clicks: 48,
        landingVisitors: 42,
        inquiries: 4,
        interviews: 2,
        proposals: 8,
        purchases: 4,
        refunds: 0,
        refundAmount: 0,
        revenue: 1_560_000,
        adSpend: 150_000,
        variableCost: 540_000,
      },
      evidenceUrl: publishedLandingUrl,
      learning:
        "가상 고객 진행 단계에서는 39만원 제안 8건 중 4건 결제를 가정했습니다. 실제 수치가 아니며 가격 의사결정에 사용할 수 없습니다.",
    },
  ];
  const executionAnalysis = analyzeExecutionLoop(executionWorkspace, {
    landingMetrics: landing.metrics,
    monthlyFixedCost: project.businessAssessment?.financial.monthlyFixedCost ?? 0,
  });
  await saveExecutionLoop(projectId, guestTokenHash, executionWorkspace, executionAnalysis);

  project = required(await getProject(projectId, guestTokenHash), "프로젝트를 읽지 못했습니다.");
  const grantWorkspace = {
    founderAge: 38,
    teamSize: 1,
    priorGrantReceived: false,
    registrationStatus: "unregistered" as const,
    registrationEvidenceUrl: "https://www.hometax.go.kr/",
    officialAnnouncementChecked: true,
    taxArrearsChecked: true,
    exclusionCriteriaChecked: true,
    supportingEvidenceUrls: [officialStatisticsUrl, publishedLandingUrl],
    preferredSupportTypes: ["seed_funding" as const, "mentoring" as const],
    targetRegions: ["서울특별시"],
    applicationGoal:
      "실제 가족 30팀 인터뷰와 유료 제작 10건으로 고객 문제, 작업시간, 적정 가격을 검증하고 개인정보 처리 절차를 표준화합니다.",
    evidenceNotes:
      "시나리오의 자격 판정입니다. 신청 시점의 사업자등록 상태, 체납 여부, 중복수혜와 공고 원문을 다시 확인해야 합니다.",
    bookmarkedProgramIds: ["kstartup-2026-integrated", "pre-startup-package"],
  };
  const grantAnalysis = analyzeGrants(project, grantWorkspace);
  const grantPackage = generateGrantPackage(project, grantWorkspace, grantAnalysis);
  await saveGrantWorkspace(
    projectId,
    guestTokenHash,
    grantWorkspace,
    grantAnalysis,
    grantPackage,
  );

  await refreshLegalSources();
  await generateAndApproveStage(projectId, guestTokenHash, 5, stageInputs[5]);

  project = required(await getProject(projectId, guestTokenHash), "완료 프로젝트를 읽지 못했습니다.");
  const [finalLanding, legalSnapshots] = await Promise.all([
    getLandingForProject(projectId, guestTokenHash),
    getLegalSnapshots(),
  ]);
  const finalAudit = runQualityAudit(project, legalSnapshots, finalLanding);
  if (finalAudit.blockerCount) {
    throw new Error(
      `최종 품질 차단: ${finalAudit.findings.filter((item) => item.blocksApproval).map((item) => item.title).join(" / ")}`,
    );
  }
  project = await saveQualityAudit(projectId, guestTokenHash, finalAudit);

  const delivery = assembleDeliveryPackage(project);
  if (delivery.completeCount !== delivery.items.length) {
    throw new Error(`납품 문서 미완료: ${delivery.missingTitles.join(" / ")}`);
  }
  const documents: BusinessDocument[] = delivery.items.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    versionLabel: item.versionLabel,
    markdown: item.markdown,
  }));
  const documentText = documents.map((document) => `${document.title}\n${document.type}\n${document.markdown}`).join("\n");
  const forbiddenTerms = [
    "sole_proprietor",
    "professional_service",
    "validated",
    "insufficient_data",
    "BEP",
    "CAC",
    "SOP",
    "FIRST OFFER",
    "Starter",
    "Core",
    "Premium",
    "[required]",
    "[verify]",
    "execution-loop-v1",
    "kr-grants-v1",
  ];
  const foundForbiddenTerms = forbiddenTerms.filter((term) => documentText.includes(term));
  if (foundForbiddenTerms.length) {
    throw new Error(`쉬운말 검사 실패: ${foundForbiddenTerms.join(", ")}`);
  }
  const documentProject = {
    title: projectTitle,
    sector: String(project.opportunity.sector ?? ""),
    model: String(project.opportunity.model ?? ""),
    customer: String(project.opportunity.customer ?? ""),
    generatedAt: new Date().toISOString(),
    sample: true,
  };
  const outputDirectory = path.join(process.cwd(), "artifacts", "ieobom-scenario");
  await mkdir(outputDirectory, { recursive: true });
  const [pdf, docx, zip] = await Promise.all([
    renderPdf(documents, documentProject),
    renderDocx(documents, documentProject),
    renderDeliveryZip(documents, documentProject),
  ]);
  const pdfPath = path.join(outputDirectory, "ieobom-full-package.pdf");
  const docxPath = path.join(outputDirectory, "ieobom-full-package.docx");
  const zipPath = path.join(outputDirectory, "ieobom-delivery.zip");
  await Promise.all([
    writeFile(pdfPath, pdf),
    writeFile(docxPath, docx),
    writeFile(zipPath, zip),
  ]);

  const report = {
    projectId,
    title: project.title,
    status: project.status,
    paymentStatus: project.paymentStatus,
    approvedStages: project.stages.filter((stage) => stage.status === "approved").length,
    businessPlan: {
      submissionReady: project.businessPlan?.submissionReady,
      readinessScore: project.businessPlan?.readinessScore,
    },
    landing: finalLanding
      ? { status: finalLanding.status, path: `/launch/${finalLanding.slug}` }
      : null,
    operations: {
      readinessScore: project.operationsAssessment?.readinessScore,
      hardBlockers: project.operationsAssessment?.hardBlockers.length,
    },
    execution: {
      confidenceScore: project.executionAnalysis?.confidenceScore,
      purchases: project.executionAnalysis?.totals.purchases,
      scenarioData: true,
    },
    grants: {
      eligibleCount: project.grantAnalysis?.eligibleCount,
      readinessScore: project.grantAnalysis?.readinessScore,
    },
    quality: {
      status: finalAudit.status,
      score: finalAudit.score,
      blockers: finalAudit.blockerCount,
      warnings: finalAudit.warningCount,
    },
    delivery: {
      completeCount: delivery.completeCount,
      totalCount: delivery.items.length,
      documents: delivery.items.map((item) => ({
        title: item.title,
        complete: item.complete,
        ...deliveryDocumentMetrics(item),
      })),
      files: {
        pdf: { path: pdfPath, bytes: pdf.length },
        docx: { path: docxPath, bytes: docx.length },
        zip: { path: zipPath, bytes: zip.length },
      },
    },
    easyLanguageAudit: {
      passed: foundForbiddenTerms.length === 0,
      checkedTerms: forbiddenTerms,
    },
  };
  await writeFile(
    path.join(outputDirectory, "run-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
