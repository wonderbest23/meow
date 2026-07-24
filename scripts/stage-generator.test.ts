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

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ error: { code: "rate_limit_exceeded" } }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
    await assert.rejects(
      () => generateStageArtifact(project, 0, undefined, {
        apiKey: "sk-test-production-key",
        model: "gpt-5.6-sol",
        source: "environment",
      }),
      /OPENAI_429/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

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
  assert.equal(sparseArtifacts[2].reviewStatus, "automated_review");
  assert.equal(sparseArtifacts[3].reviewStatus, "automated_review");
  const landingBlocks = sparseArtifacts[4].content.blocks as Array<Record<string, unknown>>;
  const faqBlock = landingBlocks.find((block) => block.type === "faq");
  assert.equal((faqBlock?.items as unknown[]).length >= 4, true);
  assert.equal(String(sparseArtifacts[4].content.legalNotice).length >= 60, true);
  assert.equal((sparseArtifacts[5].content.channelPlan as unknown[]).length >= 2, true);
  assert.deepEqual(sparseArtifacts.map((artifact) => artifact.reviewStatus), Array(6).fill("automated_review"));

  project.opportunity = {
    ...project.opportunity,
    title: "창업해주는플랫폼",
    oneLiner: "창업해주는플랫폼",
    customer: "첫 기획 단계에서 확인할 초기 고객",
  };
  project.stages[1].inputs = {
    primaryCustomer: "첫 기획 단계에서 확인할 초기 고객",
    problemStatement: "창업해주는플랫폼",
    interviewNotes: [],
    evidenceUrls: [],
    unknowns: ["실제 지불 의사", "구매 결정자", "구매 빈도"],
  };
  const recoveredCustomerDraft = await generateStageArtifact(project, 1);
  assert.equal(String(recoveredCustomerDraft.content.primaryCustomer).includes("예비 창업자"), true);
  assert.equal((recoveredCustomerDraft.content.pains as string[]).every((item) => item.length >= 15), true);
  assert.equal(JSON.stringify(recoveredCustomerDraft.content).includes("창업자이"), false);
  assert.equal(recoveredCustomerDraft.reviewStatus, "automated_review");
  console.log("stage-generator.test.ts passed");
}

void main();
