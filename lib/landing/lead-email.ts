import type { LeadNotificationError } from "./lead-notification-types";

export type LeadEmailPayload = { from: string; to: string; subject: string; text: string };
export type LeadEmailResult = { ok: true; providerId: string } | { ok: false; code: LeadNotificationError; retryable: boolean; ambiguous: boolean };

export function landingEmailConfiguration(env: Record<string, string | undefined> = process.env) {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.NOTIFY_FROM_EMAIL?.trim();
  // The provider's onboarding sender cannot reliably deliver to arbitrary customer accounts.
  return key && from && !/onboarding@resend\.dev/i.test(from) ? { key, from } : null;
}

export function buildLandingLeadEmail(from: string, to: string): LeadEmailPayload {
  return {
    from, to,
    subject: "오늘창업 홈페이지에 새 문의가 접수됐습니다",
    text: "홈페이지에 새 문의가 접수되어 안전하게 저장됐습니다.\n\n오늘창업에 로그인한 뒤 내 사업 홈페이지의 접수된 문의에서 확인해주세요.\nhttps://oneulstart.com/plan/homepage\n\n이 메일에는 문의자의 개인정보를 포함하지 않습니다.",
  };
}

/** Resend is the existing email provider. Neither responses nor recipient data enter logs. */
export async function sendLandingLeadEmail(payload: LeadEmailPayload, key: string, idempotencyKey: string, transport: typeof fetch = fetch): Promise<LeadEmailResult> {
  try {
    const response = await transport("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ ...payload, to: [payload.to] }),
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
