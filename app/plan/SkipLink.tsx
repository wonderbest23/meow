"use client";

/*
 * 본문 바로가기 — 키보드로 쓰는 사람이 화면마다 왼쪽 메뉴·머리줄을 Tab 으로 다 지나가지 않게.
 * 평소에는 보이지 않고, Tab 으로 처음 닿으면 왼쪽 위에 나타난다.
 * 본문 자리(#plan-content, BusinessAppChrome)가 없는 화면은 첫 <main> 으로 간다.
 */
export default function SkipLink() {
  return <a className="plan-skip-link" href="#plan-content" onClick={event => {
    const target = document.getElementById("plan-content") ?? document.querySelector<HTMLElement>(".plan-ui main");
    if (!target) return;
    event.preventDefault();
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus();
    target.scrollIntoView({ block: "start" });
  }}>본문 바로가기</a>;
}
