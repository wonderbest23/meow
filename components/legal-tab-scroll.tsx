"use client";

import { useEffect } from "react";

/* 휴대폰 약관 화면 위 탭 줄은 옆으로 넘기는 줄이라, 지금 문서 탭이 오른쪽 화면 밖에 있으면 어느 문서인지 안 보였다 — 열 때 그 탭이 보이게 옮긴다 */
export function LegalTabScroll() {
  useEffect(() => {
    const active = document.querySelector<HTMLElement>(".platform-legal-layout aside nav a.active");
    const nav = active?.parentElement;
    if (!active || !nav || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, []);
  return null;
}
