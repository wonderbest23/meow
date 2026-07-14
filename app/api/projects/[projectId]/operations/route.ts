import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { operationsWorkspaceSchema } from "../../../../../lib/operations/domain";
import {
  assessOperations,
  createOperationsWorkspace,
  generateOperationsPackage,
} from "../../../../../lib/operations/engine";
import {
  getProject,
  saveOperationsWorkspace,
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
    const workspace = project.operationsWorkspace ?? createOperationsWorkspace(project);
    const assessment = project.operationsAssessment ?? assessOperations(workspace);
    const operationsPackage =
      project.operationsPackage ?? generateOperationsPackage(project, workspace, assessment);
    return NextResponse.json({ workspace, assessment, operationsPackage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "운영 준비 정보를 불러오지 못했습니다.";
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
    const workspace = operationsWorkspaceSchema.parse(await request.json());
    const assessment = assessOperations(workspace);
    const operationsPackage = generateOperationsPackage(project, workspace, assessment);
    const updatedProject = await saveOperationsWorkspace(
      projectId,
      identity.hash,
      workspace,
      assessment,
      operationsPackage,
    );
    return NextResponse.json({
      project: updatedProject,
      workspace,
      assessment,
      operationsPackage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "운영 준비 정보를 저장하지 못했습니다.";
    return NextResponse.json(
      {
        error: {
          code: message === "PROJECT_NOT_FOUND" ? message : "OPERATIONS_WORKSPACE_INVALID",
          message,
        },
      },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
