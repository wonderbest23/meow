import assert from "node:assert/strict";
import { applyDeliveryDocumentDraft, type DeliveryItem } from "../lib/delivery/package-assembler";
import {
  applyPresentationDraft,
  buildPresentationSlides,
  type PresentationDeckInput,
} from "../lib/delivery/presentation-deck";
import { sanitizeBusinessReality } from "../lib/quality/business-reality";
import type { ProjectRecord } from "../lib/service-domain";

function projectWithInput(inputText = "") {
  return {
    id: crypto.randomUUID(),
    title: "예약 문의 정리 서비스",
    status: "active",
    paymentStatus: "test_paid",
    packagePrice: 990000,
    activeStage: 0,
    opportunity: {
      title: "예약 문의 정리 서비스",
      oneLiner: "동네 미용실의 흩어진 예약 문의를 한 번에 정리합니다.",
      customer: "전화와 메신저 예약을 함께 받는 1인 미용실 운영자",
      model: "월 구독",
      firstTest: "운영자에게 가격이 공개된 수동 정리 서비스를 제안합니다.",
    },
    founderProfile: {},
    businessSetup: null,
    businessAssessment: null,
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
      projectId: "project",
      stageIndex,
      status: "collecting_input" as const,
      inputs: stageIndex === 0 ? { problem: inputText, referenceUrls: [], evidenceUrls: [] } : {},
      inputVersion: 1,
      approvedArtifactId: null,
      approvedAt: null,
      artifacts: [],
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as ProjectRecord;
}

const unsupported = [
  "# 검증 결과",
  "## 고객 99명을 확보했습니다",
  "- 고객 12명을 확보했습니다.",
  "- 시장 규모는 3조원으로 확인했습니다.",
  "- 대표자는 10년 경력을 보유하고 있습니다.",
  "- 업계 1위와 100% 성공을 보장합니다.",
  "- 출처: https://example.com/report",
].join("\n");

const sanitized = sanitizeBusinessReality(projectWithInput(), unsupported);
assert.equal(sanitized.changedCount, 6);
assert.doesNotMatch(sanitized.text, /99명을 확보했습니다|12명을 확보했습니다|3조원|10년 경력|업계 1위|example\.com/);
assert.match(sanitized.text, /저장된 실행 기록이나 증빙/);
assert.match(sanitized.text, /공식 원문과 기준일/);

const supported = sanitizeBusinessReality(projectWithInput("고객 12명을 확보했습니다."), "고객 12명을 확보했습니다.");
assert.equal(supported.changedCount, 0, "사용자가 직접 입력한 실적은 임의로 지우면 안 됩니다.");

const item: DeliveryItem = {
  id: "brief",
  title: "내 사업 한눈에 보기",
  type: "사업 요약",
  stageIndex: 0,
  source: "server_package",
  versionLabel: "서버 생성본",
  approvedArtifactId: null,
  generatedAt: new Date().toISOString(),
  markdown: "# 사업 요약\n\n초안입니다.",
  complete: true,
};
const edited = applyDeliveryDocumentDraft(projectWithInput(), item, {
  markdown: "# 사업 요약\n\n고객 30명을 확보했고 월 매출 1,000만원을 달성했습니다.",
  updatedAt: new Date().toISOString(),
  versions: [],
});
assert.equal(edited.claimSafety?.changedCount, 1);
assert.doesNotMatch(edited.markdown, /고객 30명을 확보했고/);

const deckInput: PresentationDeckInput = {
  deckType: "intro",
  brandName: "예약한눈에",
  slogan: "예약을 한곳에서 확인하세요",
  title: "예약 문의 정리 서비스",
  oneLiner: "흩어진 예약 문의를 한 번에 정리합니다.",
  customer: "1인 미용실 운영자",
  model: "월 구독",
  revenue: "월 이용료",
  priceWon: 49_000,
  risk: "고객 인터뷰 필요",
  accentColor: "#087353",
  sector: "소프트웨어",
  stage: "초기",
  launchTime: "4주",
  firstTest: "가격이 공개된 제안",
  matchScore: 80,
  marketScore: 70,
  feasibilityScore: 75,
  monthlyFixedCostWon: 500_000,
  breakEvenUnits: 15,
  totalFundingNeedWon: 3_000_000,
  targetMonthlyUnits: 20,
  variableCostPerUnit: 5_000,
  contributionPerUnit: 39_545,
  contributionMarginRate: 88,
  breakEvenRevenueWon: 735_000,
  initialInvestmentWon: 1_500_000,
  runwayMonths: 3,
  investmentAskWon: 30_000_000,
  financialScenarios: [],
  monthlyForecast: [],
  fundingUses: [],
  marketEvidence: [],
  teamSize: 1,
  founderStrengths: ["고객 공감"],
  founderExperience: "",
  evidenceSources: [],
  traction: { interviews: 0, proposals: 0, purchases: 0, revenueWon: 0, confidenceScore: 0 },
};
const slides = applyPresentationDraft(buildPresentationSlides(deckInput), {
  slides: { overview: { statement: "고객 50명을 확보했고 매출 2,000만원을 달성했습니다." } },
  updatedAt: new Date().toISOString(),
}, deckInput);
const overview = slides.find((slide) => slide.id === "overview");
assert.match(overview?.statement ?? "", /^확인 필요:/);
assert.doesNotMatch(overview?.statement ?? "", /50명을 확보했고/);

console.log("claim-safety.test.ts passed");
