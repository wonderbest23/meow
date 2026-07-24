import { NextResponse } from "next/server";
import { landingEventSchema } from "../../../../../../lib/landing/domain";
import {
  getPublishedLandingBySlug,
  recordLandingEvent,
} from "../../../../../../lib/landing/repository";
import { enforceRateLimit } from "../../../../../../lib/rate-limit";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  // Lenient cap: real visitors fire a handful of analytics events; this only stops flooding.
  const limited = await enforceRateLimit("public-event", request, {
    limit: 120,
    windowMs: 60_000,
    message: "요청이 너무 잦습니다.",
  });
  if (limited) return limited;
  try {
    const { slug } = await context.params;
    const published = await getPublishedLandingBySlug(slug);
    if (!published) throw new Error("LANDING_NOT_FOUND");
    if (!published.config.analyticsEnabled) return NextResponse.json({ ok: true, recorded: false });
    const event = landingEventSchema.parse(await request.json());
    await recordLandingEvent(published.site.id, event);
    return NextResponse.json({ ok: true, recorded: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "이벤트를 기록하지 못했습니다.";
    return NextResponse.json(
      { error: { code: message, message } },
      { status: message === "LANDING_NOT_FOUND" ? 404 : 400 },
    );
  }
}
