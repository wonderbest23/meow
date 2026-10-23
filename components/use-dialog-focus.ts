"use client";

import { useEffect, useRef } from "react";

/*
 * 화면을 덮는 창(편집기·전체 화면·상담 창)의 키보드 길.
 *
 * 예전엔 창이 열려도 초점이 뒤 화면에 남아 Tab 이 뒤 화면으로 빠져나갔고, Esc 로 닫히지 않았고,
 * 닫으면 초점이 문서 맨 앞(body)으로 가 키보드·화면 낭독 사용자는 어디에 있는지 잃었다.
 *  - 열리면 창 안 첫 단추로 초점을 옮긴다
 *  - Tab·Shift+Tab 은 창 안에서만 돈다
 *  - Esc 는 onEscape 에 맡긴다(저장하지 않은 수정이 있으면 확인을 묻는 등 창마다 다르다)
 *  - 닫히면 연 단추로 초점을 돌려준다
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/* 열려 있는 창 — 초점이 body 로 떨어졌을 때 키 입력은 가장 나중에 연 창 하나만 받는다 */
const openStack: HTMLElement[] = [];

export function focusableIn(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.closest("[inert]") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
}

export function useDialogFocus<T extends HTMLElement>(open: boolean, options: { onEscape?: () => void; initialFocus?: () => HTMLElement | null | undefined } = {}) {
  const ref = useRef<T | null>(null);
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement && !node.contains(document.activeElement) ? document.activeElement : null;
    const start = () => {
      if (node.contains(document.activeElement)) return;
      const target = latest.current.initialFocus?.() ?? focusableIn(node)[0];
      if (target) target.focus({ preventScroll: true });
      else { if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1"); node.focus({ preventScroll: true }); }
    };
    // 창 안 내용이 한 박자 늦게 그려지는 경우가 있어 다음 프레임에 한 번 더 확인한다
    start();
    const frame = window.requestAnimationFrame(start);
    /*
     * 키는 문서 전체에서 듣는다 — 창 안 단추가 눌린 뒤 사라지면(상담 창 '문의하기'로 탭이 바뀔 때 등) 초점이 body 로 떨어져
     * 창에 붙인 듣개로는 Esc·Tab 을 못 받았다(감사 2026-10-23). 창 안이거나 초점을 잃은(body) 경우만 처리한다.
     */
    openStack.push(node);
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const lost = !target || target === document.body || target === document.documentElement;
      if (lost ? openStack[openStack.length - 1] !== node : !node.contains(target)) return;
      // 창 안에서 띄운 다른 창(<dialog>, 예: 로그인 창)의 Esc 는 그 창이 처리한다
      const inner = target ? target.closest("dialog") : null;
      if (inner && (inner as Element) !== (node as Element) && node.contains(inner)) return;
      if (event.key === "Escape" && latest.current.onEscape) {
        if (event.defaultPrevented || event.isComposing) return;
        latest.current.onEscape();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusableIn(node);
      if (!items.length) { event.preventDefault(); node.focus({ preventScroll: true }); return; }
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === node || !node.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !node.contains(active))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      const index = openStack.lastIndexOf(node);
      if (index >= 0) openStack.splice(index, 1);
      // 닫힌 뒤 — 초점이 창 안에 있었거나 body 로 떨어졌으면 연 단추로 돌려준다
      const active = document.activeElement;
      if (opener?.isConnected && (!active || active === document.body || node.contains(active))) opener.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}
