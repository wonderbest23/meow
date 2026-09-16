"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ReplyTurn = { requestId: string; initialText: string | null };

export function useReplyTransition() {
  const [turn, setTurn] = useState<ReplyTurn | null>(null);
  const active = useRef<ReplyTurn | null>(null);
  const readyAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reset = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    active.current = null;
    setTurn(null);
  }, []);
  const begin = useCallback((requestId: string, initialText: string | null = null) => {
    if (timer.current !== null) clearTimeout(timer.current);
    const next = { requestId, initialText };
    active.current = next;
    readyAt.current = performance.now() + (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600);
    setTurn(next);
  }, []);
  const finish = useCallback((requestId: string, saved: boolean) => {
    if (active.current?.requestId !== requestId) return;
    // Persistence is immediate; only the next question's presentation is paced.
    const remaining = saved ? Math.max(0, readyAt.current - performance.now()) : 0;
    if (!remaining) { reset(); return; }
    timer.current = setTimeout(() => {
      if (active.current?.requestId === requestId) reset();
    }, remaining);
  }, [reset]);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
    active.current = null;
  }, []);
  return { turn, active, begin, finish, reset };
}
