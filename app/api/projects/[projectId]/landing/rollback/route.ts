import { NextResponse } from "next/server";
import { checkLandingEditAccess, landingEditErrorResponse } from "../../../../../../lib/landing/plan-entitlement";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { rollbackLanding } from "../../../../../../lib/landing/repository";

const schema = z.object({ version: z.number().int().positive() });

export async function POST(
  request: Request,
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
    const { version } = schema.parse(await request.json());
    const site = await rollbackLanding(projectId, identity.hash, version);
    return NextResponse.json({ site, publicPath: `/launch/${site.slug}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "이전 버전으로 되돌리지 못했습니다.";
    return NextResponse.json(
      { error: { code: message, message } },
      { status: message.includes("NOT_FOUND") ? 404 : 400 },
    );
  }
}
