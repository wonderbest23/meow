import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../../../lib/api-auth";
import { saveStageInputs } from "../../../../../../../lib/project-repository";
import { parseStageInput } from "../../../../../../../lib/service-domain";
import { recordServiceAudit } from "../../../../../../../lib/service-audit/repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; stageIndex: string }> },
) {
  try {
    const { projectId, stageIndex: stageValue } = await context.params;
    const stageIndex = Number(stageValue);
    const raw = await request.json();
    const inputs = parseStageInput(stageIndex, raw);
    const identity = await requireGuestIdentity();
    const stage = await saveStageInputs(
      projectId,
      stageIndex,
      identity.hash,
      inputs as unknown as Record<string, unknown>,
    );
    await recordServiceAudit({
      projectId,
      guestTokenHash: identity.hash,
      action: "stage.inputs_saved",
      stageIndex,
      resourceType: "stage",
      resourceId: stage.id,
      status: "info",
      detail: `${stageIndex + 1}단계 입력을 저장했습니다.`,
    });
    return NextResponse.json({ stage, savedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "단계 입력을 저장하지 못했습니다.";
    const status = message === "PROJECT_NOT_FOUND" ? 404 : 400;
    return NextResponse.json(
      {
        error: {
          code: message === "PROJECT_NOT_FOUND" ? message : "STAGE_INPUT_INVALID",
          message,
          retryable: status >= 500,
        },
      },
      { status },
    );
  }
}
