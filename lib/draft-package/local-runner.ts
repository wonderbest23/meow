import {
  completeDraftPackageRun,
  completeDraftPackageStep,
  failDraftPackageRun,
  startDraftPackageStep,
  type DraftPackageWorkflowParams,
} from "./domain";
import {
  finishPreparedDraftStage,
  generatePreparedDraftStage,
  generateDraftBusinessPlan,
  generateDraftExecutionPlan,
  generateDraftGrantPackage,
  generateDraftOperations,
  prepareDraftStageGeneration,
  prepareDraftPackage,
  syncGeneratedLanding,
  type DraftPackageBuildContext,
} from "./runner";
import {
  updateDraftPackageRun,
  updateRefinementVersionStatus,
} from "../project-repository";

async function updateStep(
  params: DraftPackageWorkflowParams,
  stepIndex: number,
  state: "start" | "complete",
) {
  return updateDraftPackageRun(
    params.projectId,
    params.guestTokenHash,
    params.runId,
    (run) => state === "start"
      ? startDraftPackageStep(run, stepIndex)
      : completeDraftPackageStep(run, stepIndex),
  );
}

async function runDocumentStep(
  params: DraftPackageWorkflowParams,
  stepIndex: number,
  action: (context: DraftPackageBuildContext) => Promise<unknown>,
  context: DraftPackageBuildContext,
) {
  await updateStep(params, stepIndex, "start");
  await action(context);
  await updateStep(params, stepIndex, "complete");
}

/**
 * Next.js development does not expose Cloudflare Workflows. This runner keeps
 * local end-to-end tests on the same generation functions used in production.
 */
export async function runDraftPackageLocally(params: DraftPackageWorkflowParams) {
  try {
    await updateStep(params, 0, "start");
    const context = await prepareDraftPackage(params);
    await updateStep(params, 0, "complete");

    for (let stageIndex = 0; stageIndex < 6; stageIndex += 1) {
      const stepIndex = stageIndex + 1;
      await updateStep(params, stepIndex, "start");
      const prepared = await prepareDraftStageGeneration(params, stageIndex, context);
      if (prepared.status === "ready") {
        const generated = await generatePreparedDraftStage(
          params,
          stageIndex,
          context,
          prepared.jobId,
        );
        await finishPreparedDraftStage(params, stageIndex, generated, prepared.jobId);
        if (stageIndex === 4) await syncGeneratedLanding(params);
      }
      await updateStep(params, stepIndex, "complete");
    }

    await runDocumentStep(params, 7, (value) => generateDraftBusinessPlan(params, value), context);
    await runDocumentStep(params, 8, (value) => generateDraftOperations(params, value), context);
    await runDocumentStep(params, 9, (value) => generateDraftExecutionPlan(params, value), context);
    await runDocumentStep(params, 10, (value) => generateDraftGrantPackage(params, value), context);

    const completed = await updateDraftPackageRun(
      params.projectId,
      params.guestTokenHash,
      params.runId,
      completeDraftPackageRun,
    );
    if (params.refinement) {
      await updateRefinementVersionStatus(
        params.projectId,
        params.guestTokenHash,
        params.runId,
        "applied",
      );
    }
    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "자료 제작에 실패했습니다.";
    await updateDraftPackageRun(
      params.projectId,
      params.guestTokenHash,
      params.runId,
      (run) => failDraftPackageRun(run, message),
    ).catch(() => undefined);
    if (params.refinement) {
      await updateRefinementVersionStatus(
        params.projectId,
        params.guestTokenHash,
        params.runId,
        "failed",
      ).catch(() => undefined);
    }
    throw error;
  }
}
