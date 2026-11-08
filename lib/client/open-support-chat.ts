/*
 * 휴대폰에서 고객센터 챗봇 창을 연다 — 숨은 '고객센터 열기' 단추를 대신 누른다(아래 막대 '문의' 탭 · 프로필 시트 '고객센터'가 같이 쓴다).
 * 이미 열려 있으면 그대로 두고 true. 단추가 없는 화면(고객센터 양식·대화·결제)이면 false — 부른 쪽이 양식 화면으로 간다.
 */
export function openSupportChat(): boolean {
  if (document.querySelector(".support-chat-widget.open")) return true;
  const launcher = document.querySelector<HTMLButtonElement>('button[aria-label="고객센터 열기"]');
  if (!launcher) return false;
  launcher.click();
  return true;
}
