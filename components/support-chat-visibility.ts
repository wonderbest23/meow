/*
 * 상담 단추를 띄우지 않는 화면 — 바로 그리는 단추(support-chat-launcher)와 나중에 받는 상담 창(support-chat-widget)이 같이 쓴다.
 *
 * 사장님이 공개한 홈페이지(/launch/…, 내 도메인)에는 오늘창업 상담 버튼을 띄우지 않는다.
 * 그 손님들에게 우리 '고객센터' 단추가 보이고, 폰에서는 홈페이지의 전화·카톡 버튼을 가렸다.
 * 내 도메인은 주소로 알 수 없어서 공개 홈페이지 본문(.public-landing)이 있는지로 본다(onPublicSite).
 *
 * 결제 화면은 동의 목록의 › 를 덮었고 아래 결제 줄과 겹쳤다 · 고객센터 화면에서는 같은 기능이 두 번이다(메뉴의 '고객센터'로 갈 수 있다)
 * · 사업 작업실은 대화 입력칸 · 마무리 단추와 겹쳤다(390px, 점검 2026-10-23) — 대화 화면(/plan/chat)과 같이 띄우지 않는다
 */
export function supportChatHidden(pathname: string, onPublicSite: boolean) {
  return pathname.startsWith("/admin") || pathname === "/plan/chat" || pathname === "/plan/studio" || pathname === "/plan/proposal" || pathname === "/plan/pay" || pathname === "/account" || pathname === "/account/support" || pathname.startsWith("/launch") || pathname.startsWith("/customer-site") || onPublicSite;
}

/* 폰에서 아래 탭 막대와 겹치는 화면은 단추를 숨긴다(CSS 의 [data-phone-hide]) */
export function supportChatPhoneHide(pathname: string) {
  return pathname.startsWith("/plan/workspace") || pathname.startsWith("/plan/inquiries") ? "" : undefined;
}

/* 상담 단추의 '안 읽은 답' 숫자를 보일지(설정 탭) — 기기에 저장한다 */
export const SUPPORT_BADGE_KEY = "oneul:support-badge";
