import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { getProject, persistenceMode } from "../../../../../lib/project-repository";
import { listServiceAudit } from "../../../../../lib/service-audit/repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const logs = await listServiceAudit(projectId, identity.hash, 25);
    return NextResponse.json({
      persistence: persistenceMode(),
      paymentStatus: project.paymentStatus,
      projectStatus: project.status,
      qualityStatus: project.qualityAudit?.status ?? null,
      qualityScore: project.qualityAudit?.score ?? null,
      approvedStages: project.stages.filter((stage) => stage.approvedArtifactId).length,
      logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서비스 감사 로그를 불러오지 못했습니다.";
    return NextResponse.json(
      { error: { code: message.endsWith("_NOT_FOUND") ? message : "SERVICE_AUDIT_FAILED", message } },
      { status: message.endsWith("_NOT_FOUND") ? 404 : 400 },
    );
  }
}
