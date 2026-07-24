import { NextResponse } from "next/server";
import { z } from "zod";
import { landingLeadSchema } from "../../../../../../lib/landing/domain";
import {
  createLandingLead,
  getPublishedLandingBySlug,
} from "../../../../../../lib/landing/repository";
import { enforceRateLimit } from "../../../../../../lib/rate-limit";

const requestSchema = landingLeadSchema.and(z.object({
  website: z.string().max(0).default(""),
}));

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const limited = await enforceRateLimit("public-lead", request, {
    limit: 10,
    windowMs: 10 * 60_000,
    message: "신청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;
  try {
    const { slug } = await context.params;
    const published = await getPublishedLandingBySlug(slug);
    if (!published) throw new Error("LANDING_NOT_FOUND");
    if (!published.config.leadCaptureEnabled) throw new Error("LEAD_CAPTURE_DISABLED");
    const body = requestSchema.parse(await request.json());
    if (body.marketingAgreed && !published.config.marketingOptInEnabled) {
      throw new Error("MARKETING_CONSENT_NOT_OFFERED");
    }
    if (!published.config.collectEmail && body.email) throw new Error("EMAIL_NOT_COLLECTED");
    if (!published.config.collectPhone && body.phone) throw new Error("PHONE_NOT_COLLECTED");
    if (!published.config.collectMessage && body.message) throw new Error("MESSAGE_NOT_COLLECTED");
    const lead = await createLandingLead(published.site.id, {
      name: body.name,
      email: body.email,
      phone: body.phone,
      message: body.message,
      privacyAgreed: body.privacyAgreed,
      marketingAgreed: body.marketingAgreed,
      source: body.source,
    });
    return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "신청을 접수하지 못했습니다.";
    return NextResponse.json(
      {
        error: {
          code: message === "LANDING_NOT_FOUND" ? message : "LEAD_INVALID",
          message: message === "LANDING_NOT_FOUND" ? "공개되지 않은 페이지입니다." : message,
        },
      },
      { status: message === "LANDING_NOT_FOUND" ? 404 : 400 },
    );
  }
}
