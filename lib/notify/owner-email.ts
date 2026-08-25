/*
 * 운영자(사장님) 이메일 알림.
 *
 * 제작 상담·1:1 문의가 들어왔을 때 rena35200@gmail.com 으로 알린다.
 * 발송은 Resend API — Cloudflare Workers 에는 SMTP 가 없어서 HTTP 발송 서비스가
 * 필요하고, Resend 는 가입한 본인 주소로는 도메인 인증 없이 바로 보낼 수 있다
 * (보내는 주소 onboarding@resend.dev).
 *
 * 열쇠는 코드에 두지 않는다 — Cloudflare secret 으로 사용자가 직접 넣는다:
 *   npx wrangler secret put RESEND_API_KEY
 * 로컬은 .env.local 에 같은 이름으로.
 *
 * 실패해도 절대 던지지 않는다 — 알림 때문에 문의 접수가 실패하면 주객전도다.
 * 실패는 [notify] 로그로 남겨 wrangler tail 에서 보이게 한다.
 */

const OWNER_EMAIL_DEFAULT = "rena35200@gmail.com";

export async function notifyOwnerByEmail(subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[notify] RESEND_API_KEY 가 없어 이메일 알림을 건너뜀 — wrangler secret put RESEND_API_KEY");
    return false;
  }
  const to = process.env.OWNER_NOTIFY_EMAIL || OWNER_EMAIL_DEFAULT;
  const from = process.env.NOTIFY_FROM_EMAIL || "오늘창업 알림 <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.warn(`[notify] 이메일 발송 실패 status=${res.status} body=${(await res.text().catch(() => "")).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[notify] 이메일 발송 오류: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
