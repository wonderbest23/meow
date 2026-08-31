/*
 * 킷 버튼·메뉴 항목을 눌렀을 때(공개 화면). links[자리 id] 가
 *   없거나 "contact" → 아래 문의 양식(#landing-contact)으로 스크롤
 *   "none"          → 아무 일도 하지 않음
 *   "sec:N"         → 페이지의 N번째 섹션으로 스크롤(한 장짜리 앵커 이동)
 *   그 밖           → 주소로 이동(https 는 새 창, tel:/mailto: 는 그 자리)
 *
 * brainwave-page 와 brainwave-mobile 이 함께 쓴다 — 둘은 서로를 이미
 * import 하고 있어서 이 함수를 어느 한쪽에 두면 순환이 된다.
 */

/*
 * 페이지의 섹션들 — 킷 캔버스의 최상위 칸(등장 애니메이션 대상과 같은 선택자).
 * display:contents 래퍼와 얇은 장식 조각은 뺀다. 모바일(수제판·자동 재배치)은
 * 구조가 달라 같은 순서의 세로 스택으로 갈음한다 — 섹션 순서는 같다.
 */
export function brainwaveSections(root: ParentNode = document): HTMLElement[] {
  const out: HTMLElement[] = [];
  /* 최상위가 display:contents 래퍼인 페이지가 많다 — 상자가 나올 때까지 파고든다 */
  const walk = (el: HTMLElement) => {
    if (getComputedStyle(el).display === "contents") { [...el.children].forEach((c) => walk(c as HTMLElement)); return; }
    if (el.offsetHeight > 120) out.push(el);
  };
  root.querySelectorAll<HTMLElement>(".bw-canvas > div > div").forEach(walk);
  if (!out.length) {
    root.querySelectorAll<HTMLElement>(".bwmob > *, .bwm-items > *").forEach((el) => { if (el.offsetHeight > 120) out.push(el); });
  }
  /* 킷 DOM 은 z 순서라 위→아래 순서가 아닐 수 있다 — 화면 세로 순서로 세운다 */
  return out.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
}

export function runBrainwaveButton(links: Record<string, string> | undefined, id: string) {
  const action = links?.[id] ?? "contact";
  if (action === "none") return;
  if (action === "contact") {
    document.getElementById("landing-contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const sec = action.match(/^sec:(\d+)$/);
  if (sec) {
    const els = brainwaveSections();
    const el = els[Math.min(Number(sec[1]), els.length - 1)];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
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
