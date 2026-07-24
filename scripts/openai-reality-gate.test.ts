import assert from "node:assert/strict";
import { generateStageArtifact } from "../lib/stage-generator";
import type { OpenAIRuntimeConfig } from "../lib/openai/session-config";
import type { ProjectRecord } from "../lib/service-domain";

const project = {
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
    inputs: stageIndex === 0
      ? { budgetWon: 1_000_000, availableHoursPerWeek: 12, referenceUrls: [] }
      : {},
    inputVersion: 1,
    approvedArtifactId: null,
    approvedAt: null,
    artifacts: [],
  })),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as ProjectRecord;

const runtimeConfig: OpenAIRuntimeConfig = {
  apiKey: "sk-test-only",
  model: "gpt-5.6-sol",
  source: "session",
};

async function main() {
  const baseline = await generateStageArtifact(project, 0, undefined, false);
  assert.equal(baseline.model, "deterministic-fallback-v1");

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  try {
    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          ...baseline.content,
          problem: "고객 인터뷰 결과 12명 중 8명이 결제 의사를 확인했습니다. 이 완료 실적을 바탕으로 예약 문의 문제와 첫 제공 범위를 확정했으며, 이미 검증된 수요에 맞춰 서비스를 확대합니다.",
        }),
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    await assert.rejects(
      () => generateStageArtifact(project, 0, undefined, runtimeConfig),
      /OPENAI_REALITY_GATE_FAILED/,
      "출처 없는 완료 실적은 운영 모드에서 납품으로 넘어가면 안 됩니다.",
    );
    assert.equal(fetchCount, 2, "위험한 첫 응답은 한 번 수정 요청해야 합니다.");

    fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ output_text: JSON.stringify(baseline.content) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const accepted = await generateStageArtifact(project, 0, undefined, runtimeConfig);
    assert.equal(fetchCount, 1);
    assert.equal(accepted.model, "gpt-5.6-sol");
    assert.equal(accepted.reviewStatus, "automated_review");

    fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          problem: "너무 짧음",
          day21Goal: "첫 21일 동안 고객 문제와 실제 지출을 확인하고, 가격이 공개된 제안과 완료 증거를 남겨 다음 실행 여부를 판단할 수 있는 기준을 확정합니다.",
        }),
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const partiallyAccepted = await generateStageArtifact(project, 0, undefined, runtimeConfig);
    assert.equal(fetchCount, 1, "부족한 필드 하나 때문에 전체 AI 응답을 다시 생성하면 안 됩니다.");
    assert.equal(partiallyAccepted.model, "gpt-5.6-sol");
    assert.notEqual(partiallyAccepted.content.problem, "너무 짧음");
    assert.equal(String(partiallyAccepted.content.day21Goal).includes("완료 증거"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("openai-reality-gate.test.ts passed");
}

void main();
