import assert from "node:assert/strict";
import { emptyBusinessSetup } from "../lib/business/domain";
import { assessBusinessSetup } from "../lib/business/korea-rules";
import { assertStageApprovalQuality, runQualityAudit } from "../lib/quality/engine";
import { legalSourceRegistry } from "../lib/quality/legal-monitor";
import type { LegalSourceSnapshot } from "../lib/quality/domain";
import type { ProjectRecord } from "../lib/service-domain";

function projectFixture(): ProjectRecord {
  const setup = emptyBusinessSetup("digital_service");
  setup.financial.sellingPrice = 100_000;
  setup.financial.targetMonthlyUnits = 30;
  const assessment = assessBusinessSetup(setup);
  return {
    id: crypto.randomUUID(),
    title: "품질 테스트",
    status: "active",
    paymentStatus: "test_paid",
    packagePrice: 1_000_000,
    activeStage: 0,
    opportunity: {},
    founderProfile: {},
    businessSetup: setup,
    businessAssessment: assessment,
    marketWorkspace: null,
    marketAnalysis: null,
    businessPlan: null,
    operationsWorkspace: null,
    operationsAssessment: {
      readinessScore: 100,
      verifiedRequiredCount: 1,
      requiredCount: 1,
      hardBlockers: [],
      warnings: [],
      estimatedProcurementCost: 0,
      verifiedQuoteCost: 0,
      generatedAt: new Date().toISOString(),
      rulesVersion: "kr-operations-v1",
    },
    operationsPackage: null,
    executionWorkspace: null,
    executionAnalysis: null,
    qualityAudit: null,
    grantWorkspace: null,
    grantAnalysis: null,
    grantPackage: null,
    stages: Array.from({ length: 6 }, (_, stageIndex) => ({
      id: crypto.randomUUID(),
      projectId: "project",
      stageIndex,
      status: "not_started" as const,
      inputs: {},
      inputVersion: 0,
      approvedArtifactId: null,
      approvedAt: null,
      artifacts: [],
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const project = projectFixture();
const baseline = runQualityAudit(project, [], null);
assert.equal(baseline.status, "blocked", "출시 근거와 제출 문서가 없으면 완료를 차단해야 합니다.");
assert.ok(baseline.findings.some((item) => item.title.includes("시장 근거")));
assert.ok(baseline.findings.some((item) => item.title.includes("고객 인터뷰")));
assert.equal(
  baseline.regressionScenarios.find((item) => item.id === "financial-recalculation")?.status,
  "passed",
);

const corrupt = structuredClone(project);
corrupt.businessAssessment!.financial.totalFundingNeed += 100;
const corruptAudit = runQualityAudit(corrupt, [], null);
assert.equal(corruptAudit.status, "blocked");
assert.throws(() => assertStageApprovalQuality(corruptAudit, 2), /QUALITY_GATE_BLOCKED/);

const loss = structuredClone(project);
loss.businessSetup!.financial.unitVariable.materialsOrPurchase = 150_000;
loss.businessAssessment = assessBusinessSetup(loss.businessSetup!);
const lossAudit = runQualityAudit(loss, [], null);
assert.ok(lossAudit.findings.some((item) => item.title.includes("판매할수록 손실")));

const unsafe = structuredClone(project);
unsafe.stages[4].artifacts.push({
  id: crypto.randomUUID(),
  projectId: unsafe.id,
  stageId: unsafe.stages[4].id,
  stageIndex: 4,
  version: 1,
  schemaVersion: "v1",
  content: { blocks: [{ type: "hero", headline: "100% 성공 보장" }] },
  explanations: [],
  assumptions: [],
  sources: [],
  reviewStatus: "user_review",
  createdAt: new Date().toISOString(),
});
const unsafeAudit = runQualityAudit(unsafe, [], null);
assert.ok(unsafeAudit.findings.some((item) => item.title.includes("성과 보장")));
assert.throws(() => assertStageApprovalQuality(unsafeAudit, 4), /QUALITY_GATE_BLOCKED/);

const notReady = structuredClone(project);
notReady.operationsAssessment!.hardBlockers = [{
  id: "permit",
  title: "영업신고",
  reason: "관할기관 증빙 필요",
}];
const notReadyAudit = runQualityAudit(notReady, [], null);
assert.throws(() => assertStageApprovalQuality(notReadyAudit, 5), /QUALITY_GATE_BLOCKED/);

const broken = structuredClone(project);
broken.stages[1].approvedArtifactId = crypto.randomUUID();
const brokenAudit = runQualityAudit(broken, [], null);
assert.ok(brokenAudit.findings.some((item) => item.title.includes("참조가 손상")));

const now = new Date().toISOString();
const changedSnapshots: LegalSourceSnapshot[] = legalSourceRegistry.map((source) => ({
  sourceId: source.id,
  fingerprint: "new",
  previousFingerprint: "old",
  status: source.id === "privacy-protection-act" ? "changed" : "unchanged",
  httpStatus: 200,
  etag: null,
  lastModified: null,
  checkedAt: now,
  acknowledgedAt: null,
  error: null,
}));
const changedAudit = runQualityAudit(project, changedSnapshots, null);
assert.ok(changedAudit.findings.some((item) => item.title.includes("원문 변경 감지")));
assert.throws(() => assertStageApprovalQuality(changedAudit, 0), /QUALITY_GATE_BLOCKED/);

console.log(JSON.stringify({
  passed: 11,
  sample: {
    baselineStatus: baseline.status,
    baselineScore: baseline.score,
    corruptBlockers: corruptAudit.blockerCount,
    unsafeBlockers: unsafeAudit.blockerCount,
    legalChangeBlockers: changedAudit.blockerCount,
  },
}, null, 2));
