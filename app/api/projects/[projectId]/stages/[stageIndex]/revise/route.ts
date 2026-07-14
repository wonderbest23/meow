import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../../../lib/api-auth";
import {
  beginGeneration,
  failGeneration,
  finishGeneration,
  getProject,
  requestRevision,
} from "../../../../../../../lib/project-repository";
import { revisionRequestSchema } from "../../../../../../../lib/service-domain";
import { recordServiceAudit } from "../../../../../../../lib/service-audit/repository";
import { generateStageArtifact } from "../../../../../../../lib/stage-generator";
import { getOpenAIRuntimeConfig } from "../../../../../../../lib/openai/session-config";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; stageIndex: string }> },
) {
  let projectId = "";
  let stageIndex = 0;
  let guestHash = "";
  let jobId = "";
  try {
    const { projectId: pid, stageIndex: stageValue } = await context.params;
    projectId = pid;
    stageIndex = Number(stageValue);
    const input = revisionRequestSchema.parse(await request.json());
    const identity = await requireGuestIdentity();
    guestHash = identity.hash;
    await requestRevision(
      projectId,
      stageIndex,
      input.artifactId,
      input.instruction,
      identity.hash,
    );
    await recordServiceAudit({
      projectId,
      guestTokenHash: identity.hash,
      action: "stage.revision_requested",
      stageIndex,
      resourceType: "artifact",
      resourceId: input.artifactId,
      status: "info",
      detail: `${stageIndex + 1}단계 수정 요청을 접수했습니다.`,
      metadata: { instructionLength: input.instruction.length },
    });
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const openAIConfig = getOpenAIRuntimeConfig(identity.hash);
    const model = openAIConfig?.model ?? "deterministic-fallback-v1";
    const job = await beginGeneration(
      projectId,
      stageIndex,
      identity.hash,
      {
        ...project.stages[stageIndex].inputs,
        revisionInstruction: input.instruction,
      },
      model,
    );
    jobId = job.id;
    await recordServiceAudit({
      projectId,
      guestTokenHash: identity.hash,
      action: "stage.generation_started",
      stageIndex,
      resourceType: "generation_job",
      resourceId: job.id,
      status: "info",
      detail: `${stageIndex + 1}단계 수정본 생성을 시작했습니다.`,
      metadata: { attempt: job.attempt, model, revision: true },
    });
    const generated = await generateStageArtifact(project, stageIndex, input.instruction, openAIConfig);
    const { model: generatedModel, ...artifactInput } = generated;
    const artifact = await finishGeneration(
      projectId,
      stageIndex,
      identity.hash,
      job.id,
      artifactInput,
      generatedModel,
    );
    await recordServiceAudit({
      projectId,
      guestTokenHash: identity.hash,
      action: "stage.generation_succeeded",
      stageIndex,
      resourceType: "artifact",
      resourceId: artifact.id,
      status: "success",
      detail: `${stageIndex + 1}단계 수정본 생성에 성공했습니다.`,
      metadata: { attempt: job.attempt, version: artifact.version, model: generatedModel },
    });
    return NextResponse.json({ jobId: job.id, status: "succeeded", artifact, generation: { model: generatedModel } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "수정 결과를 생성하지 못했습니다.";
    const code = message.startsWith("OPENAI_") ? message : "REVISION_FAILED";
    if (projectId && jobId && guestHash) {
      await failGeneration(projectId, stageIndex, guestHash, jobId, code, message).catch(() => undefined);
      await recordServiceAudit({
        projectId,
        guestTokenHash: guestHash,
        action: "stage.generation_failed",
        stageIndex,
        resourceType: "generation_job",
        resourceId: jobId,
        status: "error",
        detail: message,
        metadata: { code, revision: true },
      }).catch(() => undefined);
    }
    return NextResponse.json(
      { error: { code, message, retryable: true } },
      { status: 500 },
    );
  }
}
