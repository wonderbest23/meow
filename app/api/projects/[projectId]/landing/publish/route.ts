import { NextResponse } from "next/server";
import { checkLandingEditAccess, landingEditErrorResponse } from "../../../../../../lib/landing/plan-entitlement";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { publishLanding } from "../../../../../../lib/landing/repository";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const reason = await checkLandingEditAccess(projectId, identity.hash, identity.userId);
    if (reason !== "ok") {
      const { status, body } = landingEditErrorResponse(reason);
      return NextResponse.json(body, { status });
    }
    const site = await publishLanding(projectId, identity.hash);
    return NextResponse.json({ site, publicPath: `/launch/${site.slug}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "랜딩페이지를 공개하지 못했습니다.";
    return NextResponse.json(
      { error: { code: message, message } },
      { status: message === "PROJECT_NOT_FOUND" || message === "LANDING_NOT_FOUND" ? 404 : 400 },
    );
  }
}
