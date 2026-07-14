import assert from "node:assert/strict";
import { assembleDeliveryPackage } from "../lib/delivery/package-assembler";
import {
  beginGeneration,
  createProject,
  failGeneration,
  getLatestGenerationJob,
  retryGenerationJob,
} from "../lib/project-repository";
import { listServiceAudit, recordServiceAudit } from "../lib/service-audit/repository";
import type { ProjectRecord } from "../lib/service-domain";

async function main() {
  const guestTokenHash = "guest-hash-service-ops-test";
  const project = await createProject(
    {
      opportunity: { title: "서비스 운영 테스트" },
      founderProfile: { source: "test" },
      paymentStatus: "test_paid",
    },
    guestTokenHash,
  );

  await recordServiceAudit({
    projectId: project.id,
    guestTokenHash,
    action: "stage.generation_started",
    stageIndex: 0,
    status: "info",
    detail: "테스트 생성 시작",
  });
  await recordServiceAudit({
    projectId: project.id,
    guestTokenHash,
    action: "stage.generation_succeeded",
    stageIndex: 0,
    status: "success",
    detail: "테스트 생성 성공",
  });

  const logs = await listServiceAudit(project.id, guestTokenHash, 10);
  assert.ok(logs.length >= 2, "감사 로그가 기록되어야 합니다.");
  assert.equal(logs[0].projectId, project.id);
  assert.ok(logs.some((entry) => entry.action === "stage.generation_started"));

  const model = "deterministic-fallback-v1";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const job = attempt === 1
      ? await beginGeneration(project.id, 0, guestTokenHash, {}, model)
      : await retryGenerationJob(project.id, 0, guestTokenHash, {}, model);
    assert.equal(job.attempt, attempt);
    await failGeneration(project.id, 0, guestTokenHash, job.id, "GENERATION_FAILED", `${attempt}차 실패`);
    const failed = await getLatestGenerationJob(project.id, 0, guestTokenHash);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.attempt, attempt);
  }

  await assert.rejects(
    () => retryGenerationJob(project.id, 0, guestTokenHash, {}, model),
    /GENERATION_RETRY_LIMIT/,
    "재시도는 최대 3회까지만 허용해야 합니다.",
  );

  const deliveryProject: ProjectRecord = {
    ...project,
    stages: project.stages.map((stage, stageIndex) => ({
      ...stage,
      approvedArtifactId: stageIndex === 0 ? "artifact-1" : null,
      artifacts: stageIndex === 0
        ? [{
            id: "artifact-1",
            projectId: project.id,
            stageId: stage.id,
            stageIndex: 0,
            version: 1,
            schemaVersion: "v1",
            content: { problem: "테스트 문제" },
            explanations: ["설명"],
            assumptions: ["가정"],
            sources: [],
            reviewStatus: "approved",
            createdAt: new Date().toISOString(),
          }]
        : [],
    })),
    businessPlan: {
      title: "테스트 사업계획서",
      version: 1,
      templateId: "k-startup-2026-draft-v1",
      generatedAt: new Date().toISOString(),
      readinessScore: 80,
      submissionReady: false,
      blockingItems: ["테스트 증빙"],
      confirmedFactCount: 3,
      unknownCount: 1,
      sections: [],
      markdown: "# 사업계획서\n테스트",
    },
  };
  const pack = assembleDeliveryPackage(deliveryProject);
  assert.equal(pack.items.length, 10, "납품 패키지는 10개 항목이어야 합니다.");
  assert.equal(pack.completeCount, 0, "짧은 승인본과 제출 불가 사업계획서는 최종 완료로 집계하면 안 됩니다.");
  assert.equal(pack.items.find((item) => item.id === "brief")?.contentReady, false);
  assert.match(pack.items.find((item) => item.id === "brief")?.qualityReason ?? "", /최종 납품 최소 기준 미달/);
  assert.ok(pack.missingTitles.includes("고객·시장 진단서"));

  console.log("service-ops tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
