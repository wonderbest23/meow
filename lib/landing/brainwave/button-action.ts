/*
 * 킷 버튼을 눌렀을 때(공개 화면). links[버튼 노드 id] 가
 *   없거나 "contact" → 아래 문의 양식(#landing-contact)으로 스크롤
 *   "none"          → 아무 일도 하지 않음
 *   그 밖           → 주소로 이동(https 는 새 창, tel:/mailto: 는 그 자리)
 *
 * brainwave-page 와 brainwave-mobile 이 함께 쓴다 — 둘은 서로를 이미
 * import 하고 있어서 이 함수를 어느 한쪽에 두면 순환이 된다.
 */
export function runBrainwaveButton(links: Record<string, string> | undefined, id: string) {
  const action = links?.[id] ?? "contact";
  if (action === "none") return;
  if (action === "contact") {
    document.getElementById("landing-contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (/^https?:\/\//i.test(action)) window.open(action, "_blank", "noopener");
  else if (/^(tel:|mailto:)/i.test(action)) window.location.href = action;
}

/** 모바일 수제판의 버튼 글 자리 id("I0:416;0:4460")에서 버튼 노드 id("0:416")를 얻는다 */
export function buttonIdFromTextId(textId: string): string {
  const m = textId.match(/^I([0-9]+:[0-9]+);/);
  return m ? m[1] : textId;
}
