import assert from "node:assert/strict";
import JSZip from "jszip";
import { assessBusinessSetup } from "../lib/business/korea-rules";
import { emptyBusinessSetup, type BusinessArchetype } from "../lib/business/domain";
import { generateBusinessPlan } from "../lib/business-plan/generator";
import { assembleDeliveryPackage } from "../lib/delivery/package-assembler";
import { renderDocx, renderPdf } from "../lib/delivery/document-renderer";
import { analyzeExecutionLoop, createExecutionWorkspace } from "../lib/execution-loop/engine";
import { analyzeGrants, createGrantWorkspace, generateGrantPackage } from "../lib/grants/engine";
import { analyzeLocations } from "../lib/market/location-engine";
import type { MarketWorkspace } from "../lib/market/domain";
import { assessOperations, createOperationsWorkspace, generateOperationsPackage } from "../lib/operations/engine";
import type { ArtifactRecord, ProjectRecord } from "../lib/service-domain";
import { generateStageArtifact } from "../lib/stage-generator";

type Scenario = {
  id: string;
  title: string;
  oneLiner: string;
  customer: string;
  model: string;
  archetype: BusinessArchetype;
  price: number;
  variableCost: number;
  region: string;
  workplace: "home" | "commercial_lease";
  onlineSales: boolean;
};

const scenarios: Scenario[] = [
  {
    id: "professional",
    title: "동네 가게 사진 메뉴 제작 서비스",
    oneLiner: "온라인 메뉴가 없는 소상공인을 방문해 사진 촬영과 모바일 메뉴 페이지를 한 번에 제작합니다.",
    customer: "서울에서 음식점·미용실을 운영하지만 직접 홈페이지를 만들기 어려운 1인 점주",
    model: "현장 촬영과 모바일 판매 페이지 제작을 묶은 1회 서비스",
    archetype: "professional_service",
    price: 390_000,
    variableCost: 90_000,
    region: "서울특별시 마포구",
    workplace: "home",
    onlineSales: false,
  },
  {
    id: "ecommerce",
    title: "소량 맞춤 반려동물 산책 키트 온라인 판매",
    oneLiner: "반려견의 크기와 산책 시간에 맞춰 소모품을 소량 구성해 정기 부담 없이 한 번씩 주문하게 합니다.",
    customer: "첫 반려견을 키우며 산책 준비물을 한 번에 고르기 어려운 20~40대 보호자",
    model: "자사 판매 페이지에서 주문받아 택배로 발송하는 소량 온라인 판매",
    archetype: "ecommerce",
    price: 49_000,
    variableCost: 25_000,
    region: "경기도 성남시",
    workplace: "home",
    onlineSales: true,
  },
  {
    id: "retail",
    title: "출근길 10분 아침 도시락 매장",
    oneLiner: "역세권 직장인이 예약한 아침 도시락을 기다리지 않고 가져갈 수 있도록 메뉴 수를 줄여 운영합니다.",
    customer: "평일 오전 7~9시에 아침을 거르는 역세권 직장인",
    model: "작은 포장 전문 매장에서 사전예약과 현장 판매를 함께 운영",
    archetype: "local_retail",
    price: 8_900,
    variableCost: 3_600,
    region: "부산광역시 부산진구",
    workplace: "commercial_lease",
    onlineSales: false,
  },
];

function stageInputs(scenario: Scenario, stageIndex: number): Record<string, unknown> {
  if (stageIndex === 0) return {
    goal: `${scenario.title}의 첫 유료 고객과 반복 가능한 제공 범위를 확인합니다.`,
    availableHoursPerWeek: 25,
    budgetWon: 8_000_000,
    mustAvoid: ["근거 없는 성과 보장", "검증 전 장기 임대차 계약"],
    existingAssets: ["노트북", "휴대전화", "주 25시간"],
    referenceUrls: ["https://www.sbiz.or.kr/"],
    notes: "혼자 운영할 수 있는 범위부터 시작합니다.",
  };
  if (stageIndex === 1) return {
    primaryCustomer: scenario.customer,
    problemStatement: scenario.oneLiner,
    interviewNotes: [],
    evidenceUrls: ["https://kosis.kr/"],
    unknowns: ["실제 지불 의사", "반복 구매 주기", "현재 대안의 실제 비용"],
  };
  if (stageIndex === 2) return {
    coreOutcome: scenario.oneLiner,
    deliveryMethod: scenario.model,
    basePriceWon: scenario.price,
    variableCostWon: scenario.variableCost,
    monthlyFixedCostWon: 1_200_000,
    monthlyRevenueGoalWon: scenario.price * 20,
    capacityPerMonth: 30,
    assumptions: [
      "고객이 현재 대안보다 시간 절약을 중요하게 평가한다는 가정",
      "대표자가 목표 수량을 혼자 처리할 수 있다는 가정",
      "환불과 재작업을 반영해도 건당 남는 금액이 유지된다는 가정",
    ],
  };
  if (stageIndex === 3) return {
    preferredKeywords: ["쉬운", "믿을 수 있는", "동네"],
    prohibitedKeywords: ["무조건", "완벽"],
    tone: "실용적인",
    preferredNames: [],
    selectedName: "",
    legalNameCheckRequired: true,
  };
  if (stageIndex === 4) return {
    headline: scenario.oneLiner,
    subheadline: `${scenario.customer}이 결제 전에 가격과 제공 범위를 한눈에 확인할 수 있습니다.`,
    callToAction: "가격과 가능 일정 확인하기",
    contactMethod: "신청폼",
    contactValue: "https://example.kr/request",
    proofItems: [],
    faq: [],
    legalNotice: "실제 제공 범위와 가격, 취소·환불 조건, 개인정보 보유기간은 신청 전에 서면으로 안내하며 특정 성과를 보장하지 않습니다.",
  };
  return {
    launchDate: "2026-08-03",
    channels: ["지인", "커뮤니티", "제휴"],
    leadNames: [],
    weeklyContactGoal: 15,
    monthlyCustomerGoal: 3,
    supportProgramInterest: true,
    notes: "유료 주문 전에 작은 범위로 시험합니다.",
  };
}

function projectFor(scenario: Scenario): ProjectRecord {
  const setup = emptyBusinessSetup(scenario.archetype);
  setup.legalForm = "sole_proprietor";
  setup.workplaceType = scenario.workplace;
  setup.region = scenario.region;
  setup.onlineSales = scenario.onlineSales;
  setup.handlesPersonalData = true;
  setup.sectorKeywords = scenario.title.split(" ").slice(0, 3);
  setup.financial.sellingPrice = scenario.price;
  setup.financial.targetMonthlyUnits = 20;
  setup.financial.availableCash = 12_000_000;
  setup.financial.unitVariable.materialsOrPurchase = scenario.variableCost;
  if (scenario.workplace === "commercial_lease") {
    setup.financial.initial.deposit = 10_000_000;
    setup.financial.initial.interior = 12_000_000;
    setup.financial.monthlyFixed.rent = 1_500_000;
    setup.financial.monthlyFixed.maintenance = 250_000;
  }
  const assessment = assessBusinessSetup(setup);
  return {
    id: crypto.randomUUID(),
    title: scenario.title,
    status: "active",
    paymentStatus: "test_paid",
    packagePrice: 990_000,
    activeStage: 0,
    opportunity: {
      id: scenario.id,
      title: scenario.title,
      oneLiner: scenario.oneLiner,
      sector: scenario.archetype,
      model: scenario.model,
      customer: scenario.customer,
      capital: scenario.workplace === "commercial_lease" ? "중간" : "소액",
      launchTime: "30일",
      revenue: "1회 판매 후 반복 구매 가능성 확인",
      stage: "첫 고객 검증",
      market: 0,
      novelty: 0,
      feasibility: 72,
      evidenceStatus: "hypothesis",
      evidenceSources: [],
      regulation: scenario.archetype === "local_retail" ? 65 : 30,
      skills: ["고객 대화", "서비스 제공", "기록 관리"],
      risk: "판매 전 인허가·환불·개인정보·사업장 조건을 공식 경로에서 확인해야 합니다.",
      firstTest: "같은 가격과 범위로 10명에게 제안하고 결제·거절 이유를 기록합니다.",
      color: "green",
    },
    founderProfile: {
      careerSummary: "관련 고객 응대와 현장 운영 경험이 3년 이상 있으며 혼자서 첫 서비스를 제공할 수 있습니다.",
    },
    businessSetup: setup,
    businessAssessment: assessment,
    marketWorkspace: null,
    marketAnalysis: null,
    businessPlan: null,
    operationsWorkspace: null,
    operationsAssessment: null,
    operationsPackage: null,
    executionWorkspace: null,
    executionAnalysis: null,
    grantWorkspace: null,
    grantAnalysis: null,
    grantPackage: null,
    qualityAudit: null,
    stages: Array.from({ length: 6 }, (_, stageIndex) => ({
      id: crypto.randomUUID(),
      projectId: scenario.id,
      stageIndex,
      status: "collecting_input" as const,
      inputs: stageInputs(scenario, stageIndex),
      inputVersion: 1,
      approvedArtifactId: null,
      approvedAt: null,
      artifacts: [],
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function completeProject(scenario: Scenario) {
  const project = projectFor(scenario);
  for (let stageIndex = 0; stageIndex < 6; stageIndex += 1) {
    const generated = await generateStageArtifact(project, stageIndex, undefined, null);
    const artifact: ArtifactRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      stageId: project.stages[stageIndex].id,
      stageIndex,
      version: 1,
      schemaVersion: generated.schemaVersion,
      content: generated.content,
      explanations: generated.explanations,
      assumptions: generated.assumptions,
      sources: generated.sources,
      reviewStatus: "approved",
      createdAt: new Date().toISOString(),
    };
    project.stages[stageIndex].artifacts.push(artifact);
    project.stages[stageIndex].approvedArtifactId = artifact.id;
    project.stages[stageIndex].status = "approved";
  }

  const marketWorkspace: MarketWorkspace = {
    evidence: [
      {
        id: crypto.randomUUID(),
        sourceType: "customer_interview",
        title: `${scenario.title} 고객 확인 기록`,
        metric: "현재 대안과 불편",
        value: "테스트 실행 전 실제 인터뷰 원문으로 교체 필요",
        numericValue: null,
        unit: "",
        region: scenario.region,
        sourceName: "사용자 입력 확인표",
        sourceUrl: "",
        observedAt: "2026-07-14",
        note: "자동 품질 테스트에서는 고객 자료가 가정으로 남는지 확인합니다.",
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
        sourceType: "official_report",
        title: "국가통계포털 업종·지역 자료 확인 경로",
        metric: "시장 배경 지표",
        value: "원문 조회 필요",
        numericValue: null,
        unit: "",
        region: scenario.region,
        sourceName: "국가통계포털 KOSIS",
        sourceUrl: "https://kosis.kr/",
        observedAt: "2026-07-14",
        note: "실제 수치를 임의로 만들지 않고 공식 조회 경로만 연결합니다.",
        verification: "needs_review",
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
        title: `${scenario.title} 현재 대안 비교`,
        metric: "대안 가격과 범위",
        value: "실제 경쟁사 원문 확인 필요",
        numericValue: null,
        unit: "",
        region: scenario.region,
        sourceName: "사용자 경쟁 확인표",
        sourceUrl: "",
        observedAt: "2026-07-14",
        note: "실제 경쟁사 가격과 제공 범위로 교체해야 합니다.",
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
  project.marketWorkspace = marketWorkspace;
  project.marketAnalysis = analyzeLocations(marketWorkspace);
  project.businessPlan = generateBusinessPlan(project, marketWorkspace, project.marketAnalysis);
  project.operationsWorkspace = createOperationsWorkspace(project);
  project.operationsAssessment = assessOperations(project.operationsWorkspace);
  project.operationsPackage = generateOperationsPackage(project, project.operationsWorkspace, project.operationsAssessment);
  project.executionWorkspace = createExecutionWorkspace(project);
  project.executionAnalysis = analyzeExecutionLoop(project.executionWorkspace, {
    monthlyFixedCost: project.businessAssessment?.financial.monthlyFixedCost,
  });
  project.grantWorkspace = createGrantWorkspace(project);
  project.grantAnalysis = analyzeGrants(project, project.grantWorkspace);
  project.grantPackage = generateGrantPackage(project, project.grantWorkspace, project.grantAnalysis);
  return project;
}

async function main() {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const reports = [];
    let renderedSubmission: { pdfBytes: number; docxBytes: number; documents: number } | null = null;
    for (const scenario of scenarios) {
      const project = await completeProject(scenario);
      const pack = assembleDeliveryPackage(project);
      assert.equal(pack.items.length, 10, `${scenario.id}: 결과물 10종이 필요합니다.`);
      assert.ok(pack.items.every((item) => item.source !== "missing"), `${scenario.id}: 누락된 결과물이 있습니다.`);
      assert.ok(pack.items.every((item) => item.contentReady), `${scenario.id}: 문서별 납품 기준을 통과하지 못했습니다. ${pack.items.filter((item) => !item.contentReady).map((item) => `${item.title}(${item.qualityReason} · ${item.quality?.metrics.characters}자/${item.quality?.metrics.sections}항목/${item.quality?.metrics.tables}표)`).join(" / ")}`);
      assert.ok(pack.items.every((item) => item.useStatus && item.useStatusLabel), `${scenario.id}: 결과물 사용 상태가 누락됐습니다.`);
      assert.equal(pack.items.find((item) => item.id === "market")?.useStatus, "verify", `${scenario.id}: 원문 확인 전 시장 문서는 사실 확인 상태여야 합니다.`);
      assert.ok(pack.factSummary.total >= 10 && pack.factSummary.calculated >= 5, `${scenario.id}: 공통 사실 장부가 충분하지 않습니다.`);
      assert.ok(pack.items.every((item) => item.markdown.includes("## 출처와 확인 상태")), `${scenario.id}: 출처 장부가 누락됐습니다.`);
      assert.ok(pack.items.every((item) => item.markdown.includes("검증할 가정")), `${scenario.id}: 사실 상태 설명이 누락됐습니다.`);
      const planDocument = pack.items.find((item) => item.id === "plan");
      const grantDocument = pack.items.find((item) => item.id === "grants");
      assert.ok(planDocument?.markdown.includes("# 제출용 본문"), `${scenario.id}: 사업계획서 제출용 본문이 없습니다.`);
      assert.ok(grantDocument?.markdown.includes("# 제출용 신청서 본문"), `${scenario.id}: 지원사업 신청서 제출용 본문이 없습니다.`);
      assert.ok((grantDocument?.quality?.metrics.characters ?? 0) >= 4_800, `${scenario.id}: 지원사업 신청서 본문 분량이 부족합니다.`);
      assert.ok((grantDocument?.quality?.metrics.tables ?? 0) >= 5, `${scenario.id}: 지원사업 신청서의 계산·비교표가 부족합니다.`);
      assert.ok((planDocument?.markdown.indexOf("# 참고 부록") ?? -1) > (planDocument?.markdown.indexOf("# 제출용 본문") ?? 0), `${scenario.id}: 사업계획서 준비 안내가 제출 본문보다 먼저 나옵니다.`);
      assert.ok((grantDocument?.markdown.indexOf("# 참고 부록") ?? -1) > (grantDocument?.markdown.indexOf("# 제출용 신청서 본문") ?? 0), `${scenario.id}: 지원사업 준비 안내가 제출 본문보다 먼저 나옵니다.`);
      assert.equal(pack.deliveryQuality.blockerCount, 0, `${scenario.id}: 패키지 자동 검수 차단 항목이 있습니다. ${pack.deliveryQuality.actions.join(" / ")}`);
      assert.ok(pack.deliveryQuality.score >= 80, `${scenario.id}: 자동 검수 점수가 80점 미만입니다.`);
      if (!renderedSubmission && planDocument && grantDocument) {
        const documents = [planDocument, grantDocument].map((item) => ({
          id: item.id,
          title: item.title,
          type: item.type,
          versionLabel: item.versionLabel,
          markdown: item.markdown,
        }));
        const documentProject = {
          title: scenario.title,
          sector: scenario.archetype,
          model: scenario.model,
          customer: scenario.customer,
          generatedAt: new Date().toISOString(),
          sample: false,
        };
        const [pdf, docx] = await Promise.all([
          renderPdf(documents, documentProject),
          renderDocx(documents, documentProject),
        ]);
        assert.equal(pdf.subarray(0, 4).toString(), "%PDF", `${scenario.id}: 제출용 PDF 생성에 실패했습니다.`);
        assert.equal(docx[0], 0x50, `${scenario.id}: 제출용 Word 생성에 실패했습니다.`);
        const docxArchive = await JSZip.loadAsync(docx);
        const documentXml = await docxArchive.file("word/document.xml")?.async("text");
        assert.ok(documentXml?.includes("제출용 신청서 본문"), `${scenario.id}: Word에 지원사업 제출 본문이 없습니다.`);
        assert.ok(documentXml?.includes("정부지원사업비 집행 계획"), `${scenario.id}: Word에 사업비 집행 계획이 없습니다.`);
        renderedSubmission = { pdfBytes: pdf.length, docxBytes: docx.length, documents: documents.length };
      }
      reports.push({
        scenario: scenario.id,
        score: pack.deliveryQuality.score,
        status: pack.deliveryQuality.status,
        contentReady: pack.deliveryQuality.readyCount,
        businessReady: pack.completeCount,
        warnings: pack.deliveryQuality.warningCount,
        pages: pack.items.reduce((sum, item) => sum + (item.quality?.metrics.estimatedPages ?? 0), 0),
      });
    }
    console.log(JSON.stringify({ passed: true, reports, renderedSubmission }, null, 2));
  } finally {
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
  }
}

void main();
