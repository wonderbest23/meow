import assert from "node:assert/strict";
import { generateStageArtifact } from "../lib/stage-generator";
import type { ProjectRecord } from "../lib/service-domain";

const project: ProjectRecord = {
  id: crypto.randomUUID(), title: "실제 문장 검증", status: "active", paymentStatus: "test_paid",
  packagePrice: 990000, activeStage: 0,
  opportunity: { title: "생활 기록 서비스", oneLiner: "가족의 생활 기록을 보존합니다.", customer: "개인", model: "정보 구독", firstTest: "고객 10명을 인터뷰합니다." },
  founderProfile: {}, businessSetup: null, businessAssessment: null, marketWorkspace: null, marketAnalysis: null,
  businessPlan: null, operationsWorkspace: null, operationsAssessment: null, operationsPackage: null,
  executionWorkspace: null, executionAnalysis: null, grantWorkspace: null, grantAnalysis: null, grantPackage: null,
  qualityAudit: null,
  stages: Array.from({ length: 6 }, (_, stageIndex) => ({
    id: crypto.randomUUID(), projectId: "project", stageIndex, status: "collecting_input" as const,
    inputs: stageIndex === 0 ? { referenceUrls: ["https://www.kosis.kr/"] } : {}, inputVersion: 1,
    approvedArtifactId: null, approvedAt: null, artifacts: [],
  })),
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

async function main() {
  const artifact = await generateStageArtifact(project, 0);
  assert.equal(artifact.model, "deterministic-fallback-v1");
  assert.ok(!JSON.stringify(artifact.content).includes("개인가"));
  assert.equal(artifact.sources.length, 1);
  assert.equal(artifact.sources[0].url, "https://www.kosis.kr/");

  project.stages[1].inputs = { unknowns: ["첫 구매 의사"] };
  project.stages[2].inputs = { assumptions: ["첫 달에는 소개 고객이 중심입니다."] };
  project.stages[4].inputs = {
    faq: [{ question: "언제 받을 수 있나요?", answer: "신청 내용을 확인한 뒤 일정을 안내합니다." }],
    legalNotice: "입력 내용은 확인이 필요합니다.",
  };
  project.stages[5].inputs = { channels: ["지인 소개"] };

  const sparseArtifacts = await Promise.all(
    project.stages.map((_, stageIndex) => generateStageArtifact(project, stageIndex)),
  );
  assert.equal((sparseArtifacts[1].content.unknowns as unknown[]).length >= 3, true);
  assert.equal((sparseArtifacts[2].content.assumptions as unknown[]).length >= 3, true);
  const landingBlocks = sparseArtifacts[4].content.blocks as Array<Record<string, unknown>>;
  const faqBlock = landingBlocks.find((block) => block.type === "faq");
  assert.equal((faqBlock?.items as unknown[]).length >= 4, true);
  assert.equal(String(sparseArtifacts[4].content.legalNotice).length >= 60, true);
  assert.equal((sparseArtifacts[5].content.channelPlan as unknown[]).length >= 2, true);
  console.log("stage-generator.test.ts passed");
}

void main();
