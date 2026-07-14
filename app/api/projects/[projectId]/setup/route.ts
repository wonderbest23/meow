import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { businessSetupSchema } from "../../../../../lib/business/domain";
import { assessBusinessSetup } from "../../../../../lib/business/korea-rules";
import { saveBusinessSetup } from "../../../../../lib/project-repository";

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const setup = businessSetupSchema.parse(await request.json());
    const assessment = assessBusinessSetup(setup);
    const identity = await requireGuestIdentity();
    const project = await saveBusinessSetup(
      projectId,
      identity.hash,
      setup,
      assessment,
    );
    return NextResponse.json({ project, assessment });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "사업 설정을 저장하지 못했습니다.";
    return NextResponse.json(
      {
        error: {
          code: message === "PROJECT_NOT_FOUND" ? message : "BUSINESS_SETUP_INVALID",
          message,
          retryable: false,
        },
      },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
