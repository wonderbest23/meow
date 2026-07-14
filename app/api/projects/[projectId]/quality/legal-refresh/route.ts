import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { getProject } from "../../../../../../lib/project-repository";
import { refreshLegalSources } from "../../../../../../lib/quality/legal-monitor";

async function requireProjectAccess(projectId: string) {
  const identity = await requireGuestIdentity();
  const project = await getProject(projectId, identity.hash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    await requireProjectAccess(projectId);
    const snapshots = await refreshLegalSources();
    return NextResponse.json({ snapshots, checkedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "법령 원문을 확인하지 못했습니다.";
    return NextResponse.json(
      { error: { code: message.endsWith("_NOT_FOUND") ? message : "LEGAL_REFRESH_FAILED", message } },
      { status: message.endsWith("_NOT_FOUND") ? 404 : 400 },
    );
  }
}
