import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { getLandingForProject } from "../../../../../lib/landing/repository";
import {
  getProject,
  saveQualityAudit,
} from "../../../../../lib/project-repository";
import { runQualityAudit } from "../../../../../lib/quality/engine";
import { getLegalSnapshots } from "../../../../../lib/quality/legal-monitor";

async function auditProject(projectId: string, guestTokenHash: string) {
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const [landing, legalSnapshots] = await Promise.all([
    getLandingForProject(projectId, guestTokenHash),
    getLegalSnapshots(),
  ]);
  return runQualityAudit(project, legalSnapshots, landing);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const audit = await auditProject(projectId, identity.hash);
    return NextResponse.json({ audit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "품질 감사를 실행하지 못했습니다.";
    return NextResponse.json(
      { error: { code: message.endsWith("_NOT_FOUND") ? message : "QUALITY_AUDIT_FAILED", message } },
      { status: message.endsWith("_NOT_FOUND") ? 404 : 400 },
    );
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const audit = await auditProject(projectId, identity.hash);
    const project = await saveQualityAudit(projectId, identity.hash, audit);
    return NextResponse.json({ audit, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "품질 감사를 저장하지 못했습니다.";
    return NextResponse.json(
      { error: { code: message.endsWith("_NOT_FOUND") ? message : "QUALITY_AUDIT_FAILED", message } },
      { status: message.endsWith("_NOT_FOUND") ? 404 : 400 },
    );
  }
}
