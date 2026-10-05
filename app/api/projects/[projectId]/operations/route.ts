import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { operationsWorkspaceSchema } from "../../../../../lib/operations/domain";
import {
  assessOperations,
  createOperationsWorkspace,
  generateOperationsPackage,
} from "../../../../../lib/operations/engine";
import { enrichDocumentNarrativeCrossModel } from "../../../../../lib/delivery/ai-narrative";
import {
  getProject,
  saveOperationsWorkspace,
} from "../../../../../lib/project-repository";
import { publicErrorMessage } from "../../../../../lib/api-errors";
import { requireProjectAiAccess } from "../../../../../lib/project-ai-access";

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
      { error: { code: message === "PROJECT_NOT_FOUND" ? message : "OPERATIONS_LOAD_FAILED", message: publicErrorMessage(error, "운영 준비 정보를 불러오지 못했습니다.") } },
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
    // 저장할 때마다 두 모델로 문서를 다시 다듬는다 — 결제한 사업만, 사람 단위 호출 한도 안에서
    const denied = await requireProjectAiAccess(request, project, identity);
    if (denied) return denied;
    const workspace = operationsWorkspaceSchema.parse(await request.json());
    const assessment = assessOperations(workspace);
    const generatedPackage = generateOperationsPackage(project, workspace, assessment);
    const operationsPackage = {
      ...generatedPackage,
      markdown: await enrichDocumentNarrativeCrossModel(
        project,
        "operations",
        generatedPackage.markdown,
        identity.hash,
      ),
    };
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
          message: publicErrorMessage(error, "운영 준비 정보를 저장하지 못했습니다."),
        },
      },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
