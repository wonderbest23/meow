import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../../../lib/api-auth";
import {
  beginGeneration,
  failGeneration,
  finishGeneration,
  getProject,
} from "../../../../../../../lib/project-repository";
import { recordServiceAudit } from "../../../../../../../lib/service-audit/repository";
import { generateStageArtifact } from "../../../../../../../lib/stage-generator";
import { getOpenAIRuntimeConfig } from "../../../../../../../lib/openai/session-config";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string; stageIndex: string }> },
) {
  let projectId = "";
  let stageIndex = 0;
  let guestHash = "";
  let jobId = "";
  try {
    const params = await context.params;
    projectId = params.projectId;
    stageIndex = Number(params.stageIndex);
    if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex > 5) {
      return NextResponse.json(
        { error: { code: "INVALID_STAGE", message: "지원하지 않는 단계입니다.", retryable: false } },
        { status: 400 },
      );
    }
    const identity = await requireGuestIdentity();
    guestHash = identity.hash;
    const project = await getProject(projectId, identity.hash);
    if (!project) {
      return NextResponse.json(
        { error: { code: "PROJECT_NOT_FOUND", message: "프로젝트를 찾을 수 없습니다.", retryable: false } },
        { status: 404 },
      );
    }
    const openAIConfig = getOpenAIRuntimeConfig(identity.hash);
    const model = openAIConfig?.model ?? "deterministic-fallback-v1";
    const job = await beginGeneration(
      projectId,
      stageIndex,
      identity.hash,
      project.stages[stageIndex].inputs,
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
      detail: `${stageIndex + 1}단계 결과물 생성을 시작했습니다.`,
      metadata: { attempt: job.attempt, model },
    });
    const generated = await generateStageArtifact(project, stageIndex, undefined, openAIConfig);
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
      detail: `${stageIndex + 1}단계 결과물 생성에 성공했습니다.`,
      metadata: { attempt: job.attempt, version: artifact.version, model: generatedModel },
    });
    return NextResponse.json({ jobId: job.id, status: "succeeded", artifact, generation: { model: generatedModel } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "결과물 생성에 실패했습니다.";
    const code = message.startsWith("OPENAI_") ? message : "GENERATION_FAILED";
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
        metadata: { code },
      }).catch(() => undefined);
    }
    return NextResponse.json(
      {
        error: {
          code,
          message,
          retryable: true,
        },
      },
      { status: 500 },
    );
  }
}
