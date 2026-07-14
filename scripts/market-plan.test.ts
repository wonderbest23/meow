import assert from "node:assert/strict";
import { emptyBusinessSetup } from "../lib/business/domain";
import { assessBusinessSetup } from "../lib/business/korea-rules";
import { generateBusinessPlan } from "../lib/business-plan/generator";
import {
  marketWorkspaceSchema,
  type LocationCandidate,
  type MarketWorkspace,
} from "../lib/market/domain";
import { analyzeLocations } from "../lib/market/location-engine";
import {
  normalizeAttestedMarketWorkspaceInput,
  signMarketEvidence,
} from "../lib/market/evidence-attestation";
import type { ProjectRecord } from "../lib/service-domain";

function candidate(overrides: Partial<LocationCandidate>): LocationCandidate {
  return {
    id: crypto.randomUUID(),
    name: "후보",
    address: "서울시 테스트구 테스트로 1",
    latitude: 37.5,
    longitude: 127,
    areaSquareMeters: 30,
    deposit: 20_000_000,
    monthlyRent: 1_500_000,
    monthlyMaintenance: 200_000,
    keyMoney: 0,
    interiorEstimate: 20_000_000,
    expectedMonthlySales: 20_000_000,
    dailyFootTraffic: 10_000,
    residentPopulation: 20_000,
    workerPopulation: 15_000,
    competitorCount: 20,
    parkingScore: 60,
    visibilityScore: 70,
    targetCustomerFitScore: 75,
    buildingUseChecked: true,
    registryChecked: true,
    permitChecked: true,
    fieldVisitCompleted: true,
    sourceUrl: "https://golmok.seoul.go.kr/",
    observedAt: new Date().toISOString().slice(0, 10),
    note: "",
    ...overrides,
  };
}

const affordable = candidate({
  id: crypto.randomUUID(),
  name: "비용 효율 후보",
  monthlyRent: 900_000,
  monthlyMaintenance: 100_000,
  expectedMonthlySales: 24_000_000,
  dailyFootTraffic: 12_000,
  competitorCount: 15,
});
const expensive = candidate({
  id: crypto.randomUUID(),
  name: "고비용 후보",
  monthlyRent: 3_500_000,
  monthlyMaintenance: 500_000,
  expectedMonthlySales: 18_000_000,
  dailyFootTraffic: 8_000,
  competitorCount: 30,
});
const workspace: MarketWorkspace = {
  evidence: [{
    id: crypto.randomUUID(),
    sourceType: "official_report",
    title: "테스트 지역 점포 현황",
    metric: "점포 수",
    value: "128",
    numericValue: 128,
    unit: "개",
    region: "서울 테스트구",
    sourceName: "서울시 상권분석서비스",
    sourceUrl: "https://golmok.seoul.go.kr/",
    observedAt: new Date().toISOString().slice(0, 10),
    note: "테스트",
    verification: "verified",
    verificationMethod: "official_api",
    sourceExcerpt: "공식 API 응답에서 점포 수 128개를 확인",
    retrievedAt: new Date().toISOString(),
    contentHash: "a".repeat(64),
    attestation: "c".repeat(64),
    isDemo: false,
  }],
  locations: [affordable, expensive],
  selectedLocationId: affordable.id,
};

marketWorkspaceSchema.parse(workspace);
const analysis = analyzeLocations(workspace);
const affordableScore = analysis.locations.find((item) => item.candidateId === affordable.id)!;
const expensiveScore = analysis.locations.find((item) => item.candidateId === expensive.id)!;
assert.ok(affordableScore.totalScore !== null);
assert.ok(expensiveScore.totalScore !== null);
assert.ok((affordableScore.totalScore ?? 0) > (expensiveScore.totalScore ?? 0));
assert.equal(affordableScore.occupancyCostRate, 4.2);

const incomplete = candidate({
  id: crypto.randomUUID(),
  expectedMonthlySales: null,
  dailyFootTraffic: null,
  competitorCount: null,
  targetCustomerFitScore: null,
  sourceUrl: "",
  observedAt: "",
  buildingUseChecked: false,
  registryChecked: false,
  fieldVisitCompleted: false,
});
const incompleteAnalysis = analyzeLocations({
  evidence: [],
  locations: [incomplete],
  selectedLocationId: null,
});
assert.equal(incompleteAnalysis.locations[0].totalScore, null);
assert.ok(incompleteAnalysis.locations[0].warnings.some((item) => item.includes("근거가 부족")));

const setup = emptyBusinessSetup("local_retail");
setup.region = "서울 테스트구";
setup.workplaceType = "commercial_lease";
setup.financial.monthlyFixed.rent = 900_000;
setup.financial.monthlyFixed.maintenance = 100_000;
const project: ProjectRecord = {
  id: crypto.randomUUID(),
  title: "테스트 사업",
  status: "active",
  paymentStatus: "test_paid",
  packagePrice: 990_000,
  activeStage: 1,
  opportunity: {
    title: "동네 반려묘 케어숍",
    oneLiner: "반려묘 보호자의 돌봄 공백을 줄입니다.",
    customer: "직장인 반려묘 보호자",
    model: "예약형 지역 서비스",
    firstTest: "보호자 10명을 인터뷰합니다.",
    risk: "지역 수요가 충분하지 않을 수 있습니다.",
  },
  founderProfile: {},
  businessSetup: setup,
  businessAssessment: assessBusinessSetup(setup),
  marketWorkspace: workspace,
  marketAnalysis: analysis,
  businessPlan: null,
  operationsWorkspace: null,
  operationsAssessment: null,
  operationsPackage: null,
  executionWorkspace: null,
  executionAnalysis: null,
  qualityAudit: null,
  grantWorkspace: null,
  grantAnalysis: null,
  grantPackage: null,
  stages: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const plan = generateBusinessPlan(project, workspace, analysis);
assert.equal(plan.sections.length, 8);
assert.ok(plan.markdown.includes("서울시 상권분석서비스"));
assert.ok(plan.markdown.includes("비용 효율 후보"));
assert.ok(plan.readinessScore > 0);
assert.ok(plan.unknownCount > 0);

process.env.EVIDENCE_ATTESTATION_SECRET = "market-test-secret";
const unsigned = { ...workspace.evidence[0], attestation: "" };
const signed = { ...unsigned, attestation: signMarketEvidence(unsigned) };
const preserved = normalizeAttestedMarketWorkspaceInput({ ...workspace, evidence: [signed] }) as MarketWorkspace;
assert.equal(preserved.evidence[0].verification, "verified");
const tampered = normalizeAttestedMarketWorkspaceInput({ ...workspace, evidence: [{ ...signed, value: "999" }] }) as MarketWorkspace;
assert.equal(tampered.evidence[0].verification, "needs_review");

console.log(JSON.stringify({
  passed: 15,
  sample: {
    affordableScore: affordableScore.totalScore,
    expensiveScore: expensiveScore.totalScore,
    occupancyCostRate: affordableScore.occupancyCostRate,
    planReadiness: plan.readinessScore,
    planUnknowns: plan.unknownCount,
  },
}, null, 2));
