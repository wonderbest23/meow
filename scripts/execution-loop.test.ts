import assert from "node:assert/strict";
import { emptyBusinessSetup } from "../lib/business/domain";
import { assessBusinessSetup } from "../lib/business/korea-rules";
import { executionWorkspaceSchema } from "../lib/execution-loop/domain";
import {
  analyzeExecutionLoop,
  createExecutionWorkspace,
} from "../lib/execution-loop/engine";
import type { ProjectRecord } from "../lib/service-domain";

const setup = emptyBusinessSetup("digital_service");
setup.financial.monthlyFixed.software = 1_000_000;
const project: ProjectRecord = {
  id: crypto.randomUUID(),
  title: "폐루프 테스트",
  status: "active",
  paymentStatus: "test_paid",
  packagePrice: 990_000,
  activeStage: 5,
  opportunity: {
    title: "테스트 서비스",
    customer: "초기 창업자",
    oneLiner: "복잡한 준비를 줄입니다.",
    model: "온라인 서비스",
  },
  founderProfile: {},
  businessSetup: setup,
  businessAssessment: assessBusinessSetup(setup),
  marketWorkspace: null,
  marketAnalysis: null,
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

const workspace = createExecutionWorkspace(project);
executionWorkspaceSchema.parse(workspace);
assert.equal(workspace.hypotheses.length, 4);
const empty = analyzeExecutionLoop(workspace, { monthlyFixedCost: 1_000_000 });
assert.ok(empty.verdicts.every((item) => item.verdict === "insufficient_data"));
assert.equal(empty.calibratedFinancials.observedAveragePrice, null);

workspace.experiments.push({
  id: crypto.randomUUID(),
  name: "검색광고 판매 검증",
  type: "advertising",
  channel: "search_ad",
  startedAt: "2026-07-01",
  endedAt: "2026-07-10",
  status: "completed",
  metrics: {
    reached: 100,
    impressions: 1000,
    clicks: 100,
    landingVisitors: 80,
    inquiries: 20,
    interviews: 10,
    proposals: 10,
    purchases: 5,
    refunds: 0,
    refundAmount: 0,
    revenue: 500_000,
    adSpend: 100_000,
    variableCost: 150_000,
  },
  evidenceUrl: "https://example.com/evidence",
  learning: "구매 고객은 준비 시간을 줄이는 가치에 반응했습니다.",
});
executionWorkspaceSchema.parse(workspace);
const analysis = analyzeExecutionLoop(workspace, { monthlyFixedCost: 1_000_000 });
assert.equal(analysis.calibratedFinancials.observedAveragePrice, 100_000);
assert.equal(analysis.calibratedFinancials.customerAcquisitionCost, 20_000);
assert.equal(analysis.calibratedFinancials.observedContributionPerPurchase, 50_000);
assert.equal(analysis.calibratedFinancials.observedBreakEvenUnits, 20);
assert.equal(analysis.bestChannel?.channel, "search_ad");
assert.ok(analysis.verdicts.filter((item) => item.verdict === "validated").length >= 3);

const invalidWorkspace = createExecutionWorkspace(project);
invalidWorkspace.experiments.push({
  id: crypto.randomUUID(),
  name: "제안 반응 없음",
  type: "offer",
  channel: "direct",
  startedAt: "2026-07-01",
  endedAt: "2026-07-11",
  status: "completed",
  metrics: {
    reached: 150,
    impressions: 0,
    clicks: 0,
    landingVisitors: 0,
    inquiries: 0,
    interviews: 10,
    proposals: 20,
    purchases: 0,
    refunds: 0,
    refundAmount: 0,
    revenue: 0,
    adSpend: 0,
    variableCost: 0,
  },
  evidenceUrl: "https://example.com/no-sales",
  learning: "응답과 구매가 없었습니다.",
});
const invalid = analyzeExecutionLoop(invalidWorkspace);
assert.equal(invalid.verdicts.find((item) => item.category === "customer")?.verdict, "invalidated");
assert.equal(invalid.verdicts.find((item) => item.category === "price")?.verdict, "invalidated");

console.log(JSON.stringify({
  passed: 13,
  sample: {
    confidence: analysis.confidenceScore,
    averagePrice: analysis.calibratedFinancials.observedAveragePrice,
    cac: analysis.calibratedFinancials.customerAcquisitionCost,
    contribution: analysis.calibratedFinancials.observedContributionPerPurchase,
    breakEvenUnits: analysis.calibratedFinancials.observedBreakEvenUnits,
  },
}, null, 2));
