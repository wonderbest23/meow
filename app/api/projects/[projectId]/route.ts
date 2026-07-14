import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { deleteProject, getProject, persistenceMode, updateProjectOpportunity } from "../../../../lib/project-repository";

const updateSchema = z.object({
  customer: z.string().trim().min(2).max(300).optional(),
  oneLiner: z.string().trim().min(10).max(1000).optional(),
}).refine((value) => Boolean(value.customer || value.oneLiner), "수정할 내용을 입력해주세요.");

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) {
      return NextResponse.json(
        { error: { code: "PROJECT_NOT_FOUND", message: "프로젝트를 찾을 수 없습니다.", retryable: false } },
        { status: 404 },
      );
    }
    return NextResponse.json({ project, persistence: persistenceMode() });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "PROJECT_LOAD_FAILED",
          message: error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다.",
          retryable: true,
        },
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const deleted = await deleteProject(projectId, identity.hash);
    if (!deleted) {
      return NextResponse.json(
        { error: { code: "PROJECT_NOT_FOUND", message: "삭제할 프로젝트를 찾을 수 없습니다.", retryable: false } },
        { status: 404 },
      );
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "PROJECT_DELETE_FAILED",
          message: error instanceof Error ? error.message : "프로젝트를 삭제하지 못했습니다.",
          retryable: true,
        },
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const input = updateSchema.parse(await request.json());
    const identity = await requireGuestIdentity();
    const project = await updateProjectOpportunity(projectId, identity.hash, input);
    return NextResponse.json({ project, updatedAt: project.updatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "사업 기본정보를 수정하지 못했습니다.";
    return NextResponse.json(
      {
        error: {
          code: message === "PROJECT_NOT_FOUND" ? message : "PROJECT_UPDATE_FAILED",
          message,
          retryable: message !== "PROJECT_NOT_FOUND",
        },
      },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
