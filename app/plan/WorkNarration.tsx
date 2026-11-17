"use client";

import { Check, LoaderCircle } from "lucide-react";
import type { Narration } from "../../lib/plan-builder/work-narration";
import styles from "./WorkNarration.module.css";

/*
 * AI가 일하는 동안 '지금 하는 일' 목록(대표 결정 2026-11-17: 쌓이는 목록).
 * 끝난 일은 ✓ 줄로 위에 쌓이고, 맨 아래 한 줄이 지금 하는 일(돌아가는 표시), 그 아래 회색 한마디.
 * 문구는 lib/plan-builder/work-narration.ts 가 만든다 — 이 컴포넌트는 그리기만 한다.
 * 화면 읽기: 지금 하는 일 줄만 바뀔 때 읽힌다(끝난 줄이 쌓일 때마다 전부 다시 읽지 않게).
 */
export function WorkNarration({ narration, announce = false, className }: { narration: Narration; announce?: boolean; className?: string }) {
  return <div className={`${styles.root}${className ? ` ${className}` : ""}`} data-work-narration>
    <ul className={styles.list}>
      {narration.lines.map(line => <li key={line.id} data-state={line.state} className={styles.item}>
        <span className={styles.mark} aria-hidden="true">{line.state === "done" ? <Check size={13} strokeWidth={2.6} /> : <LoaderCircle size={15} className={styles.spin} />}</span>
        <span className={styles.body}>
          <span className={styles.text} {...(line.state === "active" && announce ? { role: "status", "aria-live": "polite" as const } : {})}>{line.text}</span>
          {line.note && <small className={styles.note}>{line.note}</small>}
        </span>
      </li>)}
    </ul>
    {narration.hope && <div className={styles.hope}>{narration.hope}</div>}
  </div>;
}
