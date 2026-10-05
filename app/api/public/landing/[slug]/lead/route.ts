import { after, NextResponse } from "next/server";
import { z } from "zod";
import { landingLeadSchema } from "../../../../../../lib/landing/domain";
import {
  createLandingLead,
  getPublishedLandingBySlug,
} from "../../../../../../lib/landing/repository";
import { enforceRateLimit } from "../../../../../../lib/rate-limit";
import { processLandingLeadNotification } from "../../../../../../lib/landing/lead-notifications";

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
    try {
      after(async () => {
        try { await processLandingLeadNotification(lead.id); }
        catch { console.warn("[landing-notification] dispatch deferred; durable outbox retained"); }
      });
    } catch { console.warn("[landing-notification] dispatch unavailable; durable outbox retained"); }
    return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    /*
     * 방문자에게는 내부 코드(LEAD_CAPTURE_DISABLED 등)나 입력 검사 원문(JSON)을 보여 주지 않는다.
     * 예: 이름에 빈칸만 넣으면 브라우저 검사는 통과하지만 서버 검사에서 걸려 JSON 이 그대로 보였다.
     */
    const visitorMessage: Record<string, string> = {
      LANDING_NOT_FOUND: "공개되지 않은 페이지입니다.",
      LEAD_CAPTURE_DISABLED: "지금은 온라인 신청을 받지 않고 있어요. 페이지에 적힌 연락처로 문의해 주세요.",
      EMAIL_NOT_COLLECTED: "이 페이지는 이메일을 받지 않아요. 이메일 칸을 비우고 다시 보내 주세요.",
      PHONE_NOT_COLLECTED: "이 페이지는 전화번호를 받지 않아요. 전화번호 칸을 비우고 다시 보내 주세요.",
      MESSAGE_NOT_COLLECTED: "이 페이지는 문의 내용을 받지 않아요. 내용 칸을 비우고 다시 보내 주세요.",
    };
    const message = error instanceof z.ZodError
      ? "입력한 내용을 다시 확인해 주세요. 이름과 연락처, 개인정보 동의는 꼭 필요해요."
      : visitorMessage[raw] ?? (/[가-힣]/.test(raw) ? raw : "신청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요.");
    return NextResponse.json(
      {
        error: {
          code: raw === "LANDING_NOT_FOUND" ? raw : "LEAD_INVALID",
          message,
        },
      },
      { status: message === "LANDING_NOT_FOUND" ? 404 : 400 },
    );
  }
}
