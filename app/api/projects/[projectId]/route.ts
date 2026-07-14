import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { getProject, persistenceMode } from "../../../../lib/project-repository";

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
