import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../../../lib/api-auth";
import { getLandingForProject } from "../../../../../../../lib/landing/repository";
import {
  approveArtifact,
  getProject,
} from "../../../../../../../lib/project-repository";
import {
  assertStageApprovalQuality,
  runQualityAudit,
} from "../../../../../../../lib/quality/engine";
import { getLegalSnapshots } from "../../../../../../../lib/quality/legal-monitor";
import { recordServiceAudit } from "../../../../../../../lib/service-audit/repository";

const bodySchema = z.object({ artifactId: z.string().uuid() });

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; stageIndex: string }> },
) {
  try {
    const { projectId, stageIndex: stageValue } = await context.params;
    const stageIndex = Number(stageValue);
    const { artifactId } = bodySchema.parse(await request.json());
    const identity = await requireGuestIdentity();
    const existing = await getProject(projectId, identity.hash);
    if (!existing) throw new Error("PROJECT_NOT_FOUND");
    const [landing, legalSnapshots] = await Promise.all([
      getLandingForProject(projectId, identity.hash),
      getLegalSnapshots(),
    ]);
    const audit = runQualityAudit(existing, legalSnapshots, landing);
    assertStageApprovalQuality(audit, stageIndex);
    const project = await approveArtifact(
      projectId,
      stageIndex,
      artifactId,
      identity.hash,
    );
    await recordServiceAudit({
      projectId,
      guestTokenHash: identity.hash,
      action: "stage.approved",
      stageIndex,
      resourceType: "artifact",
      resourceId: artifactId,
      status: "success",
      detail: `${stageIndex + 1}단계 결과물을 승인했습니다.`,
    });
    return NextResponse.json({ project, approvedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "결과물을 승인하지 못했습니다.";
    const status = message.endsWith("_NOT_FOUND") ? 404 : message.startsWith("QUALITY_GATE_BLOCKED") ? 409 : 400;
    return NextResponse.json(
      { error: { code: message.endsWith("_NOT_FOUND") ? message : message.startsWith("QUALITY_GATE_BLOCKED") ? "QUALITY_GATE_BLOCKED" : "APPROVAL_FAILED", message, retryable: false } },
      { status },
    );
  }
}
