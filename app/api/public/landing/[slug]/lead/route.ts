import { after, NextResponse } from "next/server";
import { z } from "zod";
import { landingLeadSchema } from "../../../../../../lib/landing/domain";
import {
  createLandingLead,
  findRecentDuplicateLead,
  getPublishedLandingBySlug,
} from "../../../../../../lib/landing/repository";
import { enforceRateLimit } from "../../../../../../lib/rate-limit";
import { processLandingLeadNotification } from "../../../../../../lib/landing/lead-notifications";

const requestSchema = landingLeadSchema.and(z.object({
  website: z.string().max(0).default(""),
}));

/*
 * 같은 문의를 거의 동시에 여러 번 보내면(단추 연타·느린 연결에서 다시 보내기) 하나만 남긴다.
 * 방금 같은 서버에서 처리 중인 것은 그 결과를 함께 쓰고, 이미 저장된 것은 저장소에서 찾아 그 번호를 돌려준다.
 * 손님에게는 똑같이 '접수됐어요'로 보인다 — 실패로 보이면 또 보낸다.
 */
const DUPLICATE_WINDOW_MS = 60_000;
const recentLeads = new Map<string, { at: number; leadId: Promise<string> }>();
function leadKey(siteId: string, body: { name: string; email?: string; phone?: string; message?: string }) {
  return JSON.stringify([siteId, body.name.trim(), (body.email ?? "").trim().toLowerCase(), (body.phone ?? "").replace(/\D/g, ""), (body.message ?? "").trim()]);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const limited = await enforceRateLimit("public-lead", request, {
    limit: 10,
    windowMs: 10 * 60_000,
    message: "신청이 너무 잦아요. 잠시 후 다시 시도해 주세요.",
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
    const now = Date.now();
    for (const [key, entry] of recentLeads) if (now - entry.at > DUPLICATE_WINDOW_MS) recentLeads.delete(key);
    const key = leadKey(published.site.id, body);
    const inFlight = recentLeads.get(key);
    if (inFlight) {
      const leadId = await inFlight.leadId.catch(() => null);
      if (leadId) return NextResponse.json({ ok: true, leadId, duplicate: true }, { status: 200 });
    }
    const existing = await findRecentDuplicateLead(published.site.id, body, DUPLICATE_WINDOW_MS).catch(() => null);
    if (existing) return NextResponse.json({ ok: true, leadId: existing, duplicate: true }, { status: 200 });
    const creating = createLandingLead(published.site.id, {
      name: body.name,
      email: body.email,
      phone: body.phone,
      message: body.message,
      privacyAgreed: body.privacyAgreed,
      marketingAgreed: body.marketingAgreed,
      source: body.source,
    });
    recentLeads.set(key, { at: now, leadId: creating.then(item => item.id) });
    let lead: Awaited<typeof creating>;
    try { lead = await creating; } catch (error) { recentLeads.delete(key); throw error; }
    try {
      after(async () => {
        try { await processLandingLeadNotification(lead.id); }
        catch { console.warn("[landing-notification] dispatch deferred; durable outbox retained"); }
        // 방문자 접수 확인 문자는 보내지 않는다(오픈 범위 2026-10-08) — 아무 번호나 넣어도 우리 번호로 문자가 가서
        // 사장님들이 함께 쓰는 하루 문자 한도를 써 버릴 수 있었다(사장님 새 문의 문자가 막힘)
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
      LANDING_NOT_FOUND: "공개되지 않은 페이지예요.",
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
      { status: raw === "LANDING_NOT_FOUND" ? 404 : 400 },
    );
  }
}
