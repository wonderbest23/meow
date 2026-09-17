"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent } from "react";

const KEY = "oneulstart:chat-width";
const DEFAULT = 42;
/**
 * 채팅과 옆 패널의 너비 분할. key가 바뀌면(예: 질문 중 → 질문 완료) 그 단계의 저장된 너비나 기본값으로 옮겨 간다.
 * 저장은 보는 사람의 편의(localStorage)일 뿐이며 실패해도 기본값으로 동작한다.
 */
export type ChatSplitOptions = { key?: string; defaultShare?: number; minChatPx?: number; minSidePx?: number; maxShare?: number };
export function useChatSplit(options: ChatSplitOptions = {}) {
  const { key = KEY, defaultShare = DEFAULT, minChatPx = 280, minSidePx = 332, maxShare = 66 } = options;
  const ref = useRef<HTMLDivElement>(null);
  const [preferred, setPreferred] = useState(defaultShare);
  const [width, setWidth] = useState(1200);
  const [dragging, setDragging] = useState(false);
  const latest = useRef(defaultShare);
  useEffect(() => {
    let next = defaultShare;
    try { const stored = localStorage.getItem(key); const value = Number(stored); if (stored && Number.isFinite(value)) next = Math.max(20, Math.min(80, value)); } catch {}
    latest.current = next; setPreferred(next);
  }, [key, defaultShare]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.getBoundingClientRect().width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const min = Math.max(24, minChatPx / width * 100);
  const max = Math.max(min, Math.min(maxShare, (width - minSidePx) / width * 100));
  const value = Math.max(min, Math.min(max, preferred));
  function change(next: number, persist = false) {
    latest.current = Math.max(min, Math.min(max, next));
    setPreferred(latest.current);
    if (persist) try { localStorage.setItem(key, String(latest.current)); } catch {}
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const bounds = ref.current?.getBoundingClientRect();
    if (bounds) change((event.clientX - bounds.left) / bounds.width * 100);
  }
  return {
    ref, style: { "--chat-share": `${value}%` } as CSSProperties, dragging,
    separator: {
      role: "separator", tabIndex: 0, "aria-label": "채팅 영역 너비 조절", "aria-orientation": "vertical" as const,
      "aria-valuemin": Math.round(min), "aria-valuemax": Math.round(max), "aria-valuenow": Math.round(value), "aria-valuetext": `채팅 ${Math.round(value)}%`,
      onPointerDown(event: PointerEvent<HTMLDivElement>) { if (event.button !== 0) return; event.preventDefault(); latest.current = value; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); },
      onPointerMove(event: PointerEvent<HTMLDivElement>) { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event); },
      onPointerUp(event: PointerEvent<HTMLDivElement>) { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; move(event); change(latest.current, true); event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false); },
      onLostPointerCapture() { setDragging(false); },
      onDoubleClick() { change(defaultShare, true); },
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const next = { ArrowLeft: value - 2, ArrowRight: value + 2, Home: min, End: max }[event.key];
        if (next === undefined) return;
        event.preventDefault(); change(next, true);
      },
    },
  };
}
