"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import type { GenerationProgress } from "../../lib/plan-builder/generation-progress";
import styles from "./GenerationProgress.module.css";

export type GenerationState = GenerationProgress & { runStatus: string | null };
const FAILED = ["errored", "terminated"];

/*
 * 사업계획서 제작 진행을 몇 초마다 묻는다. 다 됐거나 작업이 멈췄으면 더 묻지 않는다.
 * 예전엔 단추를 누르면 바로 '문서 열기'로 넘어가고 문서 화면도 새로고침해야 새 장이 보여서,
 * 5분 동안 만들어지는 걸 모르고 단추를 다시 누르게 됐다(사용자 피드백).
 */
export function useGenerationProgress(planId: string | null | undefined, enabled = true, intervalMs = 3000) {
  const [state, setState] = useState<GenerationState | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!planId || !enabled) return;
    let alive = true, timer = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/api/plan/generation?planId=${encodeURIComponent(planId)}`, { cache: "no-store" });
        if (response.ok) { const data = await response.json() as GenerationState; if (!alive) return; setState(data); if (!data.active || FAILED.includes(data.runStatus ?? "")) return; }
      } catch { /* 연결이 잠깐 끊겨도 다음 차례에 다시 묻는다 */ }
      if (alive) timer = window.setTimeout(poll, intervalMs);
    };
    void poll();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [planId, enabled, intervalMs, tick]);
  /** 새 제작을 시작한 직후처럼 다시 묻기 시작하게 한다 */
  const restart = () => setTick(value => value + 1);
  return { state, restart };
}

/** 만드는 중 팝업 — 장마다 완성 표시가 실시간으로 바뀌고, 닫아도 제작은 계속된다 */
export function GenerationDialog({ planId, open, state, onClose }: { planId: string; open: boolean; state: GenerationState | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);
  const total = state?.total ?? 0, done = state?.done ?? 0;
  const failed = FAILED.includes(state?.runStatus ?? "");
  const finished = total > 0 && done >= total;
  const firstPending = state?.sections.find(section => !section.done)?.key;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="generation-title" onClose={onClose} onCancel={onClose}>
    <header>
      <h2 id="generation-title">{finished ? "사업계획서를 다 만들었어요" : failed ? "일부 항목을 만들지 못했어요" : "사업계획서를 만들고 있어요"}</h2>
      <button type="button" className={styles.close} onClick={onClose} aria-label="닫기"><X size={20} /></button>
    </header>
    <p className={styles.lead}>{finished ? "모든 항목을 작성했어요. 바로 열어 확인해 보세요." : failed ? "만든 항목은 저장돼 있어요. 대화 화면에서 '사업계획서 문서 작성하기'를 다시 누르면 남은 항목만 이어서 만들어요." : "항목마다 쓰고 검토하느라 5분 안팎 걸려요. 창을 닫거나 다른 화면으로 가도 계속 만들어져요."}</p>
    <div className={styles.meter}><span>{done} / {total || "–"}</span><progress value={done} max={total || 1} aria-label="작성한 항목" /></div>
    <ol className={styles.list}>
      {(state?.sections ?? []).map(section => <li key={section.key} data-state={section.done ? "done" : section.key === firstPending && !failed ? "current" : "todo"}>
        <span className={styles.mark} aria-hidden="true">{section.done ? <Check size={14} /> : section.key === firstPending && !failed ? <i /> : null}</span>
        {section.title}<small>{section.done ? "완료" : section.key === firstPending && !failed ? "작성 중" : "대기"}</small>
      </li>)}
    </ol>
    <footer>
      <button type="button" className={styles.secondary} onClick={onClose}>{finished ? "닫기" : "닫고 기다리기"}</button>
      <Link className={styles.primary} href={`/plan/document?planId=${encodeURIComponent(planId)}`} aria-disabled={!done} onClick={event => { if (!done) event.preventDefault(); }}>{finished ? "사업계획서 열기" : "작성된 부분 보기"}</Link>
    </footer>
  </dialog>;
}
