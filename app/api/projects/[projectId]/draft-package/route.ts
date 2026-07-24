import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import {
  completeDraftPackageRun,
  createDraftPackageRun,
  failDraftPackageRun,
  type DraftPackageWorkflowParams,
  type DraftPackageRun,
} from "../../../../../lib/draft-package/domain";
import { runDraftPackageLocally } from "../../../../../lib/draft-package/local-runner";
import {
  getProject,
  saveDraftPackageRun,
  saveRefinementVersion,
  updateRefinementVersionStatus,
  updateDraftPackageRun,
} from "../../../../../lib/project-repository";
import { normalizeRefinementInput } from "../../../../../lib/refinement/domain";
import type { ProjectRecord } from "../../../../../lib/service-domain";

const refinementSchema = z.object({
  brandName: z.string().trim().min(2).max(100),
  customer: z.string().trim().min(2).max(300),
  oneLiner: z.string().trim().min(10).max(1000),
  priceWon: z.number().int().min(1_000).max(1_000_000_000),
  variableCostPerUnit: z.number().int().min(0).max(1_000_000_000).optional(),
  monthlyFixedCostWon: z.number().int().min(0).max(100_000_000_000).optional(),
  targetMonthlyUnits: z.number().int().min(0).max(10_000_000).optional(),
  region: z.string().trim().min(2).max(100).optional(),
  note: z.string().trim().max(1000).default(""),
});

const startSchema = z.object({
  force: z.boolean().default(false),
  refinement: refinementSchema.optional(),
  refinementSource: z.enum(["edit", "restore"]).default("edit"),
}).refine((value) => !value.force || Boolean(value.refinement), {
  message: "전체 수정에 반영할 기본정보가 필요합니다.",
});

function packageReady(project: ProjectRecord) {
  return project.stages.every((stage) => Boolean(stage.approvedArtifactId))
    && Boolean(project.businessSetup)
    && Boolean(project.businessAssessment)
    && Boolean(project.businessPlan)
    && Boolean(project.operationsPackage)
    && Boolean(project.executionAnalysis)
    && Boolean(project.grantPackage);
}

async function workflowBinding() {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.DRAFT_PACKAGE_WORKFLOW) throw new Error("DRAFT_PACKAGE_WORKFLOW_NOT_CONFIGURED");
  return env.DRAFT_PACKAGE_WORKFLOW;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    let run = project.draftPackageRun ?? null;
    let workflowStatus: string | null = null;

    if (run && ["queued", "running", "waiting"].includes(run.status)) {
      try {
        const instance = await (await workflowBinding()).get(run.workflowInstanceId);
        const status = await instance.status();
        workflowStatus = status.status;
        if (status.status === "errored" || status.status === "terminated") {
          const message = status.error?.message || "서버 제작 작업이 중단되었습니다.";
          run = await updateDraftPackageRun(
            projectId,
            identity.hash,
            run.id,
            (current) => failDraftPackageRun(current, message),
          );
        } else if (status.status === "complete" && packageReady(project)) {
          run = await updateDraftPackageRun(
            projectId,
            identity.hash,
            run.id,
            completeDraftPackageRun,
          );
        }
      } catch {
        // The persisted progress remains the source of truth if status lookup is briefly unavailable.
      }
    }

    return NextResponse.json({ run, packageReady: packageReady(project), workflowStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "제작 상태를 불러오지 못했습니다.";
    return NextResponse.json(
      { error: { code: message, message: message === "PROJECT_NOT_FOUND" ? "프로젝트를 찾을 수 없습니다." : message } },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  let run: DraftPackageRun | null = null;
  let identityHash = "";
  let projectId = "";
  let refinementRunId = "";
  try {
    ({ projectId } = await context.params);
    const input = startSchema.parse(await request.json());
    const identity = await requireGuestIdentity();
    identityHash = identity.hash;
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");

    const existing = project.draftPackageRun;
    if (existing && ["queued", "running", "waiting"].includes(existing.status)) {
      return NextResponse.json({ run: existing, packageReady: packageReady(project) }, { status: 202 });
    }
    if (!input.force && packageReady(project)) {
      return NextResponse.json({ run: existing ?? null, packageReady: true });
    }

    const runId = `draft-${crypto.randomUUID()}`;
    const refinement = input.refinement
      ? normalizeRefinementInput(project, input.refinement)
      : undefined;
    run = createDraftPackageRun(runId, input.force ? "refine" : "initial");
    if (input.force && refinement) {
      refinementRunId = runId;
      await saveRefinementVersion(
        projectId,
        identity.hash,
        refinement,
        runId,
        input.refinementSource,
      );
    }
    await saveDraftPackageRun(projectId, identity.hash, run);
    const params: DraftPackageWorkflowParams = {
      projectId,
      guestTokenHash: identity.hash,
      runId,
      force: input.force,
      refinement,
    };
    try {
      const workflow = await workflowBinding();
      await workflow.create({ id: runId, params });
    } catch (error) {
      if (process.env.NODE_ENV === "production") throw error;
      void runDraftPackageLocally(params).catch(() => undefined);
    }
    return NextResponse.json({ run, packageReady: false }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "자료 제작을 시작하지 못했습니다.";
    if (run && identityHash && projectId) {
      run = failDraftPackageRun(run, message);
      await saveDraftPackageRun(projectId, identityHash, run).catch(() => undefined);
    }
    if (refinementRunId && identityHash && projectId) {
      await updateRefinementVersionStatus(projectId, identityHash, refinementRunId, "failed").catch(() => undefined);
    }
    const notFound = message === "PROJECT_NOT_FOUND";
    return NextResponse.json(
      {
        run,
        error: {
          code: notFound ? message : "DRAFT_PACKAGE_START_FAILED",
          message: notFound ? "프로젝트를 찾을 수 없습니다." : message,
        },
      },
      { status: notFound ? 404 : 500 },
    );
  }
}
