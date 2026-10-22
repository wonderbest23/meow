import type { LeadNotificationError } from "./lead-notification-types";

/** html·headers 는 주간 리포트가 쓴다(문의 알림은 글만). replyTo 는 '답장'이 고객센터 주소로 가게 — Resend 에는 reply_to 로 보낸다 */
export type LeadEmailPayload = { from: string; to: string; subject: string; text: string; html?: string; headers?: Record<string, string>; replyTo?: string };
export type LeadEmailResult = { ok: true; providerId: string } | { ok: false; code: LeadNotificationError; retryable: boolean; ambiguous: boolean };

/** 고객 문의 이메일(PLATFORM_SUPPORT_EMAIL — 사업자 정보·약관에 적는 '고객 문의 이메일'과 같은 값). 없거나 형식이 아니면 답장 주소를 따로 두지 않는다 */
export function supportReplyTo(env: Record<string, string | undefined> = process.env): string | undefined {
  const address = env.PLATFORM_SUPPORT_EMAIL?.trim();
  return address && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ? address : undefined;
}

export function landingEmailConfiguration(env: Record<string, string | undefined> = process.env): { key: string; from: string; replyTo?: string } | null {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.NOTIFY_FROM_EMAIL?.trim();
  const replyTo = supportReplyTo(env);
  // The provider's onboarding sender cannot reliably deliver to arbitrary customer accounts.
  return key && from && !/onboarding@resend\.dev/i.test(from) ? { key, from, ...(replyTo ? { replyTo } : {}) } : null;
}

/** 사장님께 가는 메일 끝에 붙이는 고객센터 안내 — 메일에 답장하는 대신 여기서 물어보게 */
export const SUPPORT_URL = "https://oneulstart.com/account/support";
export const SUPPORT_FOOTER = `궁금한 점은 고객센터에서 물어봐 주세요: ${SUPPORT_URL}`;

/** 메일에 답장 주소(고객센터)를 붙인다 — 설정이 없으면 그대로 */
export function withSupportReplyTo(payload: LeadEmailPayload, config: { replyTo?: string } | null | undefined): LeadEmailPayload {
  return config?.replyTo ? { ...payload, replyTo: config.replyTo } : payload;
}

/** 메일 속 '홈페이지' 링크 — 사업이 여럿이면 그 사업의 홈페이지가 열리게 사업 번호를 붙인다 */
export function homepageManageUrl(planId?: string | null): string {
  return planId ? `https://oneulstart.com/plan/homepage?planId=${encodeURIComponent(planId)}` : "https://oneulstart.com/plan/homepage";
}

/** 받은 문의는 왼쪽 메뉴 '손님 문의'에 모인다(홈페이지 화면의 문의 목록은 그리로 옮겼다) */
export const INQUIRIES_URL = "https://oneulstart.com/plan/inquiries";

/** 문의 알림 — 사업 이름(사장님 가게 이름)은 넣고, 문의한 손님의 이름·연락처는 넣지 않는다 */
export function buildLandingLeadEmail(from: string, to: string, planId?: string | null, businessName?: string | null): LeadEmailPayload {
  void planId; // 문의는 사업과 관계없이 '손님 문의' 한곳에 모인다
  const name = (businessName ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  return {
    from, to,
    subject: "[오늘창업] 내 홈페이지에 새 문의가 왔어요",
    text: [
      `${name ? `${name} 홈페이지` : "내 홈페이지"}에 새 문의가 왔어요. 문의 내용은 안전하게 저장해 뒀어요.`,
      "",
      "오늘창업에 로그인한 뒤 왼쪽 메뉴 '손님 문의'에서 확인해 주세요.",
      INQUIRIES_URL,
      "",
      "개인정보를 지키려고 이 메일에는 문의한 손님의 이름·연락처를 넣지 않았어요.",
      "",
      SUPPORT_FOOTER,
    ].join("\n"),
  };
}

/** Resend 요청 본문 — 이름이 다른 칸(replyTo → reply_to)을 바꿔 싣는다(모르는 칸을 보내면 거절될 수 있다) */
export function resendBody(payload: LeadEmailPayload) {
  const { replyTo, ...rest } = payload;
  return { ...rest, to: [payload.to], ...(replyTo ? { reply_to: replyTo } : {}) };
}

/** Resend is the existing email provider. Neither responses nor recipient data enter logs. */
export async function sendLandingLeadEmail(payload: LeadEmailPayload, key: string, idempotencyKey: string, transport: typeof fetch = fetch): Promise<LeadEmailResult> {
  try {
    const response = await transport("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(resendBody(payload)),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      const body = response.status === 409 ? await response.json().catch(() => null) as { name?: unknown } | null : null;
      const concurrent = body?.name === "concurrent_idempotent_requests";
      return {
        ok: false,
        code: response.status === 429 || response.status >= 500 || concurrent ? "provider_unavailable" : "provider_rejected",
        retryable: response.status === 429 || response.status >= 500 || concurrent,
        ambiguous: response.status >= 500 || response.status === 409,
      };
    }
    const body = await response.json().catch(() => null) as { id?: unknown } | null;
    if (typeof body?.id !== "string" || !body.id || body.id.length > 200) return { ok: false, code: "delivery_unknown", retryable: true, ambiguous: true };
    return { ok: true, providerId: body.id };
  } catch {
    return { ok: false, code: "delivery_unknown", retryable: true, ambiguous: true };
  }
}
