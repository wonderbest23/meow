import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../../../lib/api-auth";
import {
  finishGeneration,
  failGeneration,
  getLatestGenerationJob,
  getProject,
  retryGenerationJob,
} from "../../../../../../../lib/project-repository";
import { recordServiceAudit } from "../../../../../../../lib/service-audit/repository";
import { generateStageArtifact } from "../../../../../../../lib/stage-generator";
import { resolveTextLLMConfig } from "../../../../../../../lib/llm/config";
import { publicErrorMessage } from "../../../../../../../lib/api-errors";
import { requireProjectAiAccess } from "../../../../../../../lib/project-ai-access";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; stageIndex: string }> },
) {
  try {
    const { projectId, stageIndex: stageValue } = await context.params;
    const stageIndex = Number(stageValue);
    const identity = await requireGuestIdentity();
    const job = await getLatestGenerationJob(projectId, stageIndex, identity.hash);
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "생성 작업 상태를 불러오지 못했습니다.";
    return NextResponse.json(
      { error: { code: "GENERATION_JOB_FAILED", message: publicErrorMessage(error, "생성 작업 상태를 불러오지 못했습니다.") } },
      { status: 400 },
    );
  }
}

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
    const identity = await requireGuestIdentity();
    guestHash = identity.hash;
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    // 단계 결과물은 모델로 만든다 — 결제한 사업만, 사람 단위 호출 한도 안에서
    const denied = await requireProjectAiAccess(request, project, identity);
    if (denied) return denied;
    const openAIConfig = resolveTextLLMConfig(identity.hash);
    const model = openAIConfig?.model ?? "deterministic-fallback-v1";
    const job = await retryGenerationJob(
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
      action: "stage.generation_retried",
      stageIndex,
      resourceType: "generation_job",
      resourceId: job.id,
      status: "info",
      detail: `${stageIndex + 1}단계 결과물 생성을 다시 시도합니다.`,
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
      detail: `${stageIndex + 1}단계 결과물 재생성에 성공했습니다.`,
      metadata: { attempt: job.attempt, version: artifact.version, model: generatedModel },
    });
    return NextResponse.json({ jobId: job.id, status: "succeeded", artifact, generation: { model: generatedModel } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "결과물 재생성에 실패했습니다.";
    const code = message.startsWith("GENERATION_") || message.startsWith("OPENAI_")
      ? message
      : "GENERATION_RETRY_FAILED";
    // 작업 기록·감사 로그도 고객 화면에 보이므로 내부 오류 원문 대신 고객용 문구를 남긴다
    const publicMessage = publicErrorMessage(error, "결과물 재생성에 실패했습니다.");
    if (projectId && jobId && guestHash) {
      await failGeneration(projectId, stageIndex, guestHash, jobId, code, publicMessage).catch(() => undefined);
      await recordServiceAudit({
        projectId,
        guestTokenHash: guestHash,
        action: "stage.generation_failed",
        stageIndex,
        resourceType: "generation_job",
        resourceId: jobId,
        status: "error",
        detail: publicMessage,
        metadata: { code, retried: true },
      }).catch(() => undefined);
    }
    return NextResponse.json(
      {
        error: {
          code: message.startsWith("GENERATION_") ? message : "GENERATION_RETRY_FAILED",
          message: publicMessage,
          retryable: message !== "GENERATION_RETRY_LIMIT",
        },
      },
      { status: message === "GENERATION_RETRY_NOT_ALLOWED" ? 409 : 400 },
    );
  }
}
