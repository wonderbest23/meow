import { NextResponse } from "next/server";
import { checkLandingEditAccess, landingEditErrorResponse } from "../../../../../../lib/landing/plan-entitlement";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { unpublishLanding } from "../../../../../../lib/landing/repository";
import { publicErrorCode, publicErrorMessage } from "../../../../../../lib/api-errors";

/*
 * 공개 멈추기 — 공개(publish)와 같은 확인(로그인·내 사업·편집 권한)을 거친다.
 * 초안·주소는 그대로 두고 손님 화면만 닫는다. 다시 공개는 /publish 로 한다.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const reason = await checkLandingEditAccess(projectId, identity.hash, identity.userId, identity.email);
    if (reason !== "ok") {
      const { status, body } = landingEditErrorResponse(reason);
      return NextResponse.json(body, { status });
    }
    const site = await unpublishLanding(projectId, identity.hash);
    return NextResponse.json({ site });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      { error: { code: publicErrorCode(error, "LANDING_UNPUBLISH_FAILED"), message: publicErrorMessage(error, "공개를 멈추지 못했어요. 잠시 후 다시 시도해 주세요.", { LANDING_NOT_FOUND: "홈페이지를 찾지 못했어요." }) } },
      { status: message === "PROJECT_NOT_FOUND" || message === "LANDING_NOT_FOUND" ? 404 : 400 },
    );
  }
}
