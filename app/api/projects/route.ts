import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../lib/api-auth";
import { createProject, persistenceMode } from "../../../lib/project-repository";
import { createProjectSchema } from "../../../lib/service-domain";
import { paymentsEnabled } from "../../../lib/payments/config";
import { ensurePaidStarterLanding } from "../../../lib/landing/auto-publish";

export async function POST(request: Request) {
  try {
    const betaAccess = !paymentsEnabled();
    if (!betaAccess) {
      return NextResponse.json(
        {
          error: {
            code: "PAYMENT_REQUIRED",
            message: "프로젝트는 서버에서 결제가 승인된 주문으로만 생성할 수 있습니다.",
            retryable: false,
          },
        },
        { status: 403 },
      );
    }
    const input = createProjectSchema.parse(await request.json());
    const identity = await requireGuestIdentity();
    const project = await createProject(
      {
        opportunity: input.opportunity,
        founderProfile: input.founderProfile,
        paymentStatus: "test_paid",
        packagePrice: betaAccess ? 0 : 990000,
        initialStageInputs: input.initialStageInputs,
      },
      identity.hash,
      identity.userId,
    );
    const starterLanding = await ensurePaidStarterLanding(project, identity.hash).catch(() => null);
    return NextResponse.json(
      { project, persistence: persistenceMode(), starterLanding },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "PROJECT_CREATE_FAILED",
          message: error instanceof Error ? error.message : "프로젝트 생성에 실패했습니다.",
          retryable: true,
        },
      },
      { status: 400 },
    );
  }
}
