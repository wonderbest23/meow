import { NextResponse } from "next/server";
import { checkLandingEditAccess, landingEditErrorResponse } from "../../../../../../lib/landing/plan-entitlement";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { rollbackLanding } from "../../../../../../lib/landing/repository";
import { LANDING_CONFLICT_MESSAGE } from "../../../../../../lib/landing/save-contract";

const schema = z.object({ version: z.number().int().positive(), expectedUpdatedAt: z.string().datetime({ offset: true }) });

export async function POST(
  request: Request,
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
    const body = await request.json().catch(() => ({}));
    if (!body || !Object.hasOwn(body, "expectedUpdatedAt")) return NextResponse.json({ error: { code: "LANDING_VERSION_REQUIRED", message: "복원할 저장 버전을 확인해주세요. 새로고침 후 다시 시도해주세요." } }, { status: 428 });
    const { version, expectedUpdatedAt } = schema.parse(body);
    const site = await rollbackLanding(projectId, identity.hash, version, expectedUpdatedAt);
    return NextResponse.json({ site, publicPath: `/launch/${site.publishedSlug ?? site.slug}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "이전 버전으로 되돌리지 못했습니다.";
    if (message === "LANDING_DRAFT_CONFLICT") return NextResponse.json({ error: { code: message, message: LANDING_CONFLICT_MESSAGE } }, { status: 409 });
    return NextResponse.json(
      { error: { code: message, message } },
      { status: message.includes("NOT_FOUND") ? 404 : 400 },
    );
  }
}
