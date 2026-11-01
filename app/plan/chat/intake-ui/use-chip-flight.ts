"use client";

import { useEffect, type RefObject } from "react";

/*
 * 선택지 알약 → 내 말풍선 전환(lovable 구조 6단계).
 * 알약을 누른 순간 그 자리(크기·위치)를 적어 두고, 곧 새 내 말풍선이 대화에 붙으면 그 말풍선을 알약 자리에서 제자리로
 * 짧게(180ms) 옮겨 보인다 — 고른 알약이 말풍선이 되어 올라가는 것처럼. 기다리는 동안(1.5초)만 이어 준다.
 * 움직임 줄이기 설정이면 하지 않는다. 화면 연출만이라 저장·전송에는 손대지 않는다.
 */
export const CHIP_FLIGHT_SELECTOR = ':is([data-chat-question], [data-coach-entry]) :is(button, label:has(input)):not([class*="questionCardBack"]):not([data-variant])';
const USER_BUBBLE = '[data-coach-message="user"]';
const WINDOW_MS = 1500;
export const CHIP_FLIGHT_MS = 180;

export function useChipFlight(container: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const root = container.current;
    if (!enabled || !root || typeof window === "undefined") return;
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* 오래된 브라우저 */ }
    if (reduce || typeof Element.prototype.animate !== "function") return;
    let origin: { rect: DOMRect; at: number } | null = null;
    const seen = new WeakSet<Element>(root.querySelectorAll(USER_BUBBLE));
    const onPress = (event: Event) => {
      const chip = (event.target as Element | null)?.closest?.(CHIP_FLIGHT_SELECTOR);
      if (chip && root.contains(chip)) origin = { rect: chip.getBoundingClientRect(), at: performance.now() };
    };
    const fly = (bubble: HTMLElement) => {
      if (!origin || performance.now() - origin.at > WINDOW_MS) return;
      const from = origin.rect; origin = null;
      const to = bubble.getBoundingClientRect();
      if (!to.width || !to.height) return;
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      const sx = Math.max(.4, Math.min(1.6, from.width / to.width));
      const sy = Math.max(.4, Math.min(1.6, from.height / to.height));
      bubble.setAttribute("data-chip-flight", "");
      const animation = bubble.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: .6 },
        { transform: "none", opacity: 1 },
      ], { duration: CHIP_FLIGHT_MS, easing: "cubic-bezier(.2, .8, .2, 1)" });
      const done = () => bubble.removeAttribute("data-chip-flight");
      animation.onfinish = done; animation.oncancel = done;
    };
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const bubbles = node.matches(USER_BUBBLE) ? [node] : Array.from(node.querySelectorAll<HTMLElement>(USER_BUBBLE));
        for (const bubble of bubbles) { if (seen.has(bubble)) continue; seen.add(bubble); fly(bubble); }
      }
    });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") onPress(event); };
    root.addEventListener("pointerdown", onPress, true);
    root.addEventListener("keydown", onKey, true);
    observer.observe(root, { childList: true, subtree: true });
    return () => { root.removeEventListener("pointerdown", onPress, true); root.removeEventListener("keydown", onKey, true); observer.disconnect(); };
  }, [container, enabled]);
}
