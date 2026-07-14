import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { executionWorkspaceSchema } from "../../../../../lib/execution-loop/domain";
import {
  analyzeExecutionLoop,
  createExecutionWorkspace,
} from "../../../../../lib/execution-loop/engine";
import { getLandingForProject } from "../../../../../lib/landing/repository";
import {
  getProject,
  saveExecutionLoop,
} from "../../../../../lib/project-repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const workspace = project.executionWorkspace ?? createExecutionWorkspace(project);
    const landing = await getLandingForProject(projectId, identity.hash);
    const analysis = analyzeExecutionLoop(workspace, {
      landingMetrics: landing?.metrics ?? null,
      monthlyFixedCost: project.businessAssessment?.financial.monthlyFixedCost ?? 0,
    });
    return NextResponse.json({
      workspace,
      analysis,
      automaticSources: {
        landing: landing
          ? {
              status: "connected",
              pageViews: landing.metrics.pageViews,
              ctaClicks: landing.metrics.ctaClicks,
              leads: landing.metrics.leads,
              slug: landing.slug,
            }
          : { status: "not_published" },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 데이터를 불러오지 못했습니다.";
    return NextResponse.json(
      { error: { code: message, message } },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const workspace = executionWorkspaceSchema.parse(await request.json());
    const landing = await getLandingForProject(projectId, identity.hash);
    const analysis = analyzeExecutionLoop(workspace, {
      landingMetrics: landing?.metrics ?? null,
      monthlyFixedCost: project.businessAssessment?.financial.monthlyFixedCost ?? 0,
    });
    const updatedProject = await saveExecutionLoop(projectId, identity.hash, workspace, analysis);
    return NextResponse.json({ project: updatedProject, workspace, analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 데이터를 저장하지 못했습니다.";
    return NextResponse.json(
      {
        error: {
          code: message === "PROJECT_NOT_FOUND" ? message : "EXECUTION_DATA_INVALID",
          message,
        },
      },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
