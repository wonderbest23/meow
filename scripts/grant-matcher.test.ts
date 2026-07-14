import assert from "node:assert/strict";
import { emptyBusinessSetup } from "../lib/business/domain";
import { assessBusinessSetup } from "../lib/business/korea-rules";
import { assembleDeliveryPackage } from "../lib/delivery/package-assembler";
import {
  analyzeGrants,
  createGrantWorkspace,
  generateGrantPackage,
} from "../lib/grants/engine";
import {
  createProject,
  getProject,
  saveGrantWorkspace,
} from "../lib/project-repository";
import type { ProjectRecord } from "../lib/service-domain";

function projectFixture(): ProjectRecord {
  const setup = emptyBusinessSetup("digital_service");
  setup.region = "서울특별시";
  setup.employeeCount = 2;
  const assessment = assessBusinessSetup(setup);
  return {
    id: crypto.randomUUID(),
    title: "공공지원 테스트",
    status: "active",
    paymentStatus: "test_paid",
    packagePrice: 990_000,
    activeStage: 5,
    opportunity: {
      title: "디지털 코칭 서비스",
      oneLiner: "직장인이 혼자 실행하기 어려운 런칭 과제를 단계별로 해결합니다.",
      sector: "교육·코칭",
      model: "디지털 서비스",
      customer: "1인 창업 예비자",
    },
    founderProfile: {},
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

const fixture = projectFixture();
const workspace = createGrantWorkspace(fixture);
workspace.founderAge = 31;
workspace.applicationGoal = "예비창업패키지로 초기 고객 검증 비용을 확보하고 싶습니다.";

async function main() {
  const analysis = analyzeGrants(fixture, workspace);
  assert.ok(analysis.matches.length >= 4, "카탈로그 공고가 매칭되어야 합니다.");
  assert.ok(analysis.readinessScore >= 0 && analysis.readinessScore <= 100);
  assert.equal(typeof analysis.catalogObservedAt, "string");
  assert.equal(analysis.eligibleCount, 0, "공고 원문과 증빙 전에는 신청 가능으로 확정하면 안 됩니다.");
  assert.ok(analysis.conditionalCount > 0);

  const grantPackage = generateGrantPackage(fixture, workspace, analysis);
  assert.ok(grantPackage.markdown.includes("공공지원사업 매칭·신청 초안"));
  assert.ok(grantPackage.sections.length > 0);

  const guestTokenHash = "guest-hash-grant-test";
  const project = await createProject(
    {
      opportunity: fixture.opportunity,
      founderProfile: fixture.founderProfile,
      paymentStatus: "test_paid",
    },
    guestTokenHash,
  );

  const saved = await saveGrantWorkspace(
    project.id,
    guestTokenHash,
    workspace,
    analysis,
    grantPackage,
  );
  assert.ok(saved.grantWorkspace);
  assert.ok(saved.grantAnalysis);
  assert.ok(saved.grantPackage);

  const reloaded = await getProject(project.id, guestTokenHash);
  assert.equal(reloaded?.grantAnalysis?.eligibleCount, analysis.eligibleCount);

  const delivery = assembleDeliveryPackage(saved);
  const grantItem = delivery.items.find((item) => item.id === "grants");
  assert.ok(grantItem, "공공지원 초안은 납품 패키지에 포함되어야 합니다.");
  assert.equal(grantItem.complete, false, "외부 자격 검증 전 지원사업 초안을 완료로 집계하면 안 됩니다.");
  assert.ok(grantItem?.markdown.includes("공공지원사업"));

  console.log("grant-matcher.test.ts passed");
}

void main();
