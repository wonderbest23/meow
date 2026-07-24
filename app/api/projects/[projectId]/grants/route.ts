import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { grantWorkspaceSchema } from "../../../../../lib/grants/domain";
import {
  analyzeGrants,
  createGrantWorkspace,
  generateGrantPackage,
} from "../../../../../lib/grants/engine";
import { enrichDocumentNarrative } from "../../../../../lib/delivery/ai-narrative";
import { getOpenAIRuntimeConfig } from "../../../../../lib/openai/session-config";
import {
  getProject,
  saveGrantWorkspace,
} from "../../../../../lib/project-repository";
import { recordServiceAudit } from "../../../../../lib/service-audit/repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const workspace = project.grantWorkspace ?? createGrantWorkspace(project);
    const analysis = project.grantAnalysis ?? analyzeGrants(project, workspace);
    const grantPackage = project.grantPackage ?? generateGrantPackage(project, workspace, analysis);
    return NextResponse.json({ workspace, analysis, grantPackage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "지원사업 정보를 불러오지 못했습니다.";
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
    const workspace = grantWorkspaceSchema.parse(await request.json());
    const analysis = analyzeGrants(project, workspace);
    const generatedPackage = generateGrantPackage(project, workspace, analysis);
    const grantPackage = {
      ...generatedPackage,
      markdown: await enrichDocumentNarrative(
        project,
        "grants",
        generatedPackage.markdown,
        getOpenAIRuntimeConfig(identity.hash),
      ),
    };
    const updatedProject = await saveGrantWorkspace(
      projectId,
      identity.hash,
      workspace,
      analysis,
      grantPackage,
    );
    await recordServiceAudit({
      projectId,
      guestTokenHash: identity.hash,
      action: "grants.saved",
      status: "success",
      detail: "공공지원사업 조건을 저장하고 자격 판정을 갱신했습니다.",
      metadata: {
        eligibleCount: analysis.eligibleCount,
        conditionalCount: analysis.conditionalCount,
        readinessScore: analysis.readinessScore,
      },
    });
    await recordServiceAudit({
      projectId,
      guestTokenHash: identity.hash,
      action: "grants.matched",
      status: analysis.eligibleCount > 0 ? "success" : "warning",
      detail: `${analysis.matches.length}개 공고를 검토해 즉시 신청 가능 ${analysis.eligibleCount}건을 찾았습니다.`,
      metadata: {
        topProgram: analysis.matches[0]?.title ?? null,
      },
    });
    return NextResponse.json({
      project: updatedProject,
      workspace,
      analysis,
      grantPackage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "지원사업 정보를 저장하지 못했습니다.";
    return NextResponse.json(
      {
        error: {
          code: message === "PROJECT_NOT_FOUND" ? message : "GRANT_WORKSPACE_INVALID",
          message,
        },
      },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
