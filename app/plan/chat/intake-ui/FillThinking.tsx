"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FILL_LINE_MS, FILL_MERGE_MS, fillThinkingTiming } from "./fill-thinking";
import styles from "./fill-thinking.module.css";

export type FillLine = { id: string; label: string; value: string };

/*
 * 채운 값을 '생각하며 채우는' 모습으로 한 줄씩 보이고, 다 나오면 접힌 한 줄 요약(head)으로 합친다(2026-11-17 사장님).
 * 머리줄은 옅은 글자에 빛이 지나가는 '빈칸을 채우는 중…', 줄은 칸 이름(옅게) + 채운 값 — AI 작업 목록(WorkNarration)과 같은 크기·올라오는 움직임.
 * 언제 재생할지는 부르는 쪽이 정한다(fill-thinking.ts nextFillSeen). 이 부품은 한 번 재생하고 onDone 을 부른다.
 * 화면 읽기: 줄마다 읽지 않는다 — 요약 한 줄(announce)만 한 번 읽힌다(줄 · 머리줄은 aria-hidden).
 */
export function FillThinking({ items, refill = false, head, announce, onDone }: { items: FillLine[]; refill?: boolean; head: ReactNode; announce: string; onDone: () => void }) {
  const [timing] = useState(() => fillThinkingTiming(items.length, refill));
  const [phase, setPhase] = useState<"think" | "merge">("think");
  const [spoken, setSpoken] = useState("");
  const finish = useRef(onDone);
  useEffect(() => { finish.current = onDone; });
  useEffect(() => {
    // 알림 칸이 그려진 뒤에 글을 넣어야 화면 읽기가 한 번 읽는다
    const speak = window.setTimeout(() => setSpoken(announce), 120);
    const merge = window.setTimeout(() => setPhase("merge"), timing.mergeAt);
    const done = window.setTimeout(() => finish.current(), timing.doneAt);
    return () => { window.clearTimeout(speak); window.clearTimeout(merge); window.clearTimeout(done); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={styles.root} data-fill-thinking data-phase={phase} style={{ "--fill-line": `${FILL_LINE_MS}ms`, "--fill-merge": `${FILL_MERGE_MS}ms` } as CSSProperties}>
    {phase === "think" ? <p className={styles.head} aria-hidden="true"><span>빈칸을 채우는 중…</span></p> : head}
    <div className={styles.list} aria-hidden="true">
      <ul>{items.map((item, index) => <li key={item.id} style={{ animationDelay: `${timing.first + index * timing.step}ms` }}><small>{item.label}</small><span>{item.value}</span></li>)}</ul>
    </div>
    <span className={styles.srOnly} role="status" aria-live="polite">{spoken}</span>
  </div>;
}
