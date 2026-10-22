import { NextResponse } from "next/server";
import { handleAppleNotification } from "../../../../../lib/payments/apple-notifications";
import { enforceRateLimit } from "../../../../../lib/rate-limit";

export const runtime = "nodejs";

/*
 * App Store 서버 알림(App Store Server Notifications, Version 2) 받는 곳.
 *
 * App Store Connect → 앱 → 앱 정보 → App Store 서버 알림 에 아래 주소를 넣는다(버전은 'Version 2'):
 *   운영(Production) 서버 URL: https://oneulstart.com/api/payments/iap/apple-notifications
 *   샌드박스(Sandbox) 서버 URL: https://oneulstart.com/api/payments/iap/apple-notifications  (같은 주소여도 된다 — 환경은 알림 안에 들어 있다)
 * 넣은 뒤 'Request a Test Notification'(또는 App Store Server API 의 테스트 알림)을 보내면 TEST 로 기록된다.
 *
 * 애플 서버가 직접 부르는 주소라 로그인·출처(Origin) 확인을 하지 않는다 — 대신 본문의 서명(애플 루트 인증서로 이어지는 JWS)을
 * 확인한다(lib/payments/apple-notifications.ts). 서명이 틀리거나 형식이 이상하면 400 — 받아들이지 않는다.
 * 확인된 알림은 빨리 200 으로 답한다(애플은 2xx 가 아니면 몇 번 다시 보낸다). 저장소 오류만 500 으로 답해 다시 받는다.
 * 요청 수 제한은 넉넉하게 둔다 — 애플 알림을 막지 않으면서 같은 곳에서 쏟아지는 가짜 요청만 줄인다.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit("iap-apple-notifications", request, { limit: 600, windowMs: 60_000 });
  if (limited) return limited;
  const raw = await request.text().catch(() => "");
  if (raw.length > 200_000) return NextResponse.json({ ok: false, error: "APPLE_NOTIFICATION_MALFORMED" }, { status: 400 });
  let body: { signedPayload?: unknown } | null = null;
  try {
    body = JSON.parse(raw) as { signedPayload?: unknown } | null;
  } catch {
    body = null;
  }
  const result = await handleAppleNotification(body && typeof body === "object" ? body.signedPayload : undefined);
  if (result.status !== 200) console.error("[apple-notifications] 거절:", result.status, result.body.error);
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
