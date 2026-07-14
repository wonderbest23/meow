import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { launchMissionWorkspaceSchema } from "../../../../../lib/launch-missions/domain";
import {
  getProject,
  saveLaunchMissionWorkspace,
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
    return NextResponse.json({ workspace: project.launchMissionWorkspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 미션을 불러오지 못했습니다.";
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
    const workspace = launchMissionWorkspaceSchema.parse(await request.json());
    const project = await saveLaunchMissionWorkspace(projectId, identity.hash, workspace);
    return NextResponse.json({ project, workspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : "실행 미션을 저장하지 못했습니다.";
    return NextResponse.json(
      {
        error: {
          code: message === "PROJECT_NOT_FOUND" ? message : "MISSION_WORKSPACE_INVALID",
          message,
        },
      },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
