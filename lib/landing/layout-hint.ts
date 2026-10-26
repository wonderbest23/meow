/*
 * 공개 홈페이지를 처음 그릴 때 휴대폰 배치로 그릴지 — 요청 머리말(User-Agent·Sec-CH-UA-Mobile)로 정한다.
 *
 * 킷 디자인(BrainwaveStage)은 폭을 재야 휴대폰·PC 배치를 고를 수 있는데, 서버에서는 폭을 모른다.
 * 예전엔 서버가 늘 PC 배치로 그리고 화면이 붙은 뒤 휴대폰 배치로 다시 그려, 휴대폰 첫 화면이 통째로 밀렸다
 * (CLS 0.28, 점검 r42-B 결정 3번 — 대표 승인: 서버에서 휴대폰이면 처음부터 휴대폰 배치).
 *
 *   mobile  — 휴대폰이 확실할 때(Sec-CH-UA-Mobile: ?1, UA 의 Mobi·iPhone 등). 처음부터 휴대폰 배치.
 *   desktop — PC 가 확실할 때. 지금처럼 PC 배치.
 *   either  — 태블릿·알 수 없음. 폭에 따라 둘 다 맞을 수 있어 두 배치를 함께 싣고 CSS(@container)가 폭에 맞는 쪽만
 *             보이게 한다 — 화면이 붙어 폭을 재면 맞는 쪽만 남긴다. 밀림이 없다.
 *
 * 같은 주소가 기기마다 다른 HTML 이 되므로, 응답에 Vary(LANDING_LAYOUT_VARY)를 붙여 캐시가 섞이지 않게 한다(cloudflare-worker.ts).
 * Next 가 페이지를 그릴 때 Vary 를 통째로 다시 써서(app-page 의 res.setHeader) 미들웨어·next.config 로는 붙지 않는다 —
 * Next 가 다 그린 뒤 워커에서 덧붙인다. 지금 응답은 private, no-store 라 공유 캐시가 담지 않지만, 바뀌어도 섞이지 않게 둔다.
 */
export type BrainwaveLayoutHint = "mobile" | "desktop" | "either";

/** 공개 홈페이지 응답이 기대는 요청 머리말 — Vary 로 알린다 */
export const LANDING_LAYOUT_VARY = "User-Agent, Sec-CH-UA-Mobile";

/* iPad 는 UA 에 'Mobile/…'이 들어 있고, 안드로이드 태블릿은 'Mobile'이 없다 — 태블릿을 먼저 가린다 */
const TABLET = /iPad|Tablet|PlayBook|Kindle|Silk\/|Android(?!.*Mobi)/i;
const PHONE = /Mobi|iPhone|iPod|Windows Phone|BlackBerry|BB10|Opera Mini|webOS/i;

export function landingLayoutHint(userAgent: string | null | undefined, uaMobile: string | null | undefined): BrainwaveLayoutHint {
  if (uaMobile?.trim() === "?1") return "mobile";
  const ua = (userAgent ?? "").slice(0, 600);
  if (!ua.trim()) return "either";
  if (TABLET.test(ua)) return "either";
  if (PHONE.test(ua)) return "mobile";
  return "desktop";
}

export function landingLayoutHintFromHeaders(headers: { get(name: string): string | null }): BrainwaveLayoutHint {
  return landingLayoutHint(headers.get("user-agent"), headers.get("sec-ch-ua-mobile"));
}

const LANDING_PAGE = /^\/launch\/[^/]+\/?$/;

/** 공개 홈페이지(/launch/…, 내 도메인 = 워커가 바꾼 /customer-site) 응답이면 Vary 에 기기 머리말을 덧붙인다 */
export function withLandingVary(pathname: string, response: Response): Response {
  if (!LANDING_PAGE.test(pathname) && pathname !== "/customer-site") return response;
  const next = new Response(response.body, response);
  next.headers.append("Vary", LANDING_LAYOUT_VARY);
  return next;
}
