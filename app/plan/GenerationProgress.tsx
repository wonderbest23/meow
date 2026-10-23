"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, RefreshCw, X } from "lucide-react";
import { generationEta, type GenerationProgress } from "../../lib/plan-builder/generation-progress";
import styles from "./GenerationProgress.module.css";

export type GenerationState = GenerationProgress & { runStatus: string | null };
// "complete" here means the run ended with sections still missing (the route only asks while done < total): a section failed twice and was skipped.
const FAILED = ["errored", "terminated", "complete"];

/** 작성이 멈췄는지 — 아직 안 쓴 장이 남았는데 작업이 끝났거나(건너뜀) 오류로 멈췄다 */
export function generationStalled(state: GenerationState | null | undefined): boolean {
  return !!state?.active && FAILED.includes(state.runStatus ?? "");
}
/** 이번 작성이 다 끝났는지 — 맡은 장을 모두 썼다 */
export function generationFinished(state: GenerationState | null | undefined): boolean {
  return !!state && !state.active && state.total > 0 && state.done >= state.total;
}

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
        // 바뀐 게 없으면 상태를 새로 만들지 않는다 — 몇 초마다 문서 전체가 다시 그려져 버벅이던 원인
        if (response.ok) { const data = await response.json() as GenerationState; if (!alive) return; setState(current => current && JSON.stringify(current) === JSON.stringify(data) ? current : data); if (!data.active || FAILED.includes(data.runStatus ?? "")) return; }
      } catch { /* 연결이 잠깐 끊겨도 다음 차례에 다시 묻는다 */ }
      if (alive) timer = window.setTimeout(poll, intervalMs);
    };
    void poll();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [planId, enabled, intervalMs, tick]);
  // 다른 탭에서 시작한 작성도 이 화면에 돌아오면 다시 확인한다(멈춘 확인을 다시 켠다)
  useEffect(() => {
    if (!planId || !enabled) return;
    const wake = () => { if (document.visibilityState === "visible") setTick(value => value + 1); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => { document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); };
  }, [planId, enabled]);
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

/*
 * 작업실(사업 작업실) 대화 칸 안의 진행 카드 — 팝업(GenerationDialog) 대신 대화 흐름 안에 둔다.
 * 오른쪽 계획서 칸에서 장이 채워지는 동안 왼쪽 대화에서는 다 쓴 장 · 쓰는 장 · 기다리는 장과 남은 시간을 본다.
 * 멈췄으면(일부 장을 못 씀) '남은 장 이어서 쓰기'로 다시 시작한다 — 이미 쓴 장은 다시 쓰지 않는다.
 */
export function GenerationCard({ state, onRetry, retryDisabled = false, onOpen, note }: {
  state: GenerationState;
  onRetry: () => void;
  retryDisabled?: boolean;
  /** 다 쓴 장이 있으면 '쓴 부분 보기' — 작업실에서는 계획서 탭을 보여 준다 */
  onOpen?: () => void;
  /** 쓰는 중 안내를 바꾼다 — 작업실 대화 칸은 기다리는 동안 보낸 요청을 받아 두므로 그 말을 덧붙인다 */
  note?: string;
}) {
  const total = state.total, done = state.done;
  const stalled = generationStalled(state);
  const pending = state.sections.filter(section => !section.done);
  const current = stalled ? null : pending[0] ?? null;
  const waiting = stalled ? pending : pending.slice(1);
  const finished = state.sections.filter(section => section.done);
  // 남은 시간은 장이 하나 끝날 때마다 다시 잰다(렌더 중에 시계를 읽지 않게 효과에서)
  const [eta, setEta] = useState<string | null>(null);
  useEffect(() => { setEta(generationEta(state, Date.now())); }, [state]);
  return <section className={styles.card} aria-label="사업계획서 작성 진행" data-generation-card data-state={stalled ? "stalled" : "running"}>
    <header>
      <strong>{stalled ? "일부 장을 만들지 못했어요" : "사업계획서 만드는 중"}</strong>
      <span>{stalled ? `${done}/${total}장 완성` : eta ?? "보통 5분 안팎"}</span>
    </header>
    <progress value={done} max={total || 1} aria-label={`작성한 장 ${done}/${total}`} />
    {finished.length > 0 && <p className={styles.cardDone}><Check size={14} aria-hidden="true" />{finished.map(section => section.title).join(" · ")}</p>}
    {/* 쓰는 장이 바뀔 때만 읽힌다(몇 초마다 오는 확인에는 글이 그대로라 다시 읽지 않는다) */}
    {current && <p className={styles.cardCurrent} role="status" aria-live="polite"><i aria-hidden="true" />{current.title} 쓰는 중</p>}
    {waiting.length > 0 && <p className={styles.cardWaiting}>{stalled ? "남은 장" : "대기"}: {waiting.map(section => section.title).join(" · ")}</p>}
    <p className={styles.cardNote}>{stalled ? "다 쓴 장은 저장돼 있어요. 남은 장만 이어서 쓸 수 있어요." : note ?? "다른 탭을 보거나 창을 닫아도 계속 만들어져요. 다 되면 여기에서 알려 드릴게요."}</p>
    {(stalled || onOpen && done > 0) && <div className={styles.cardActions}>
      {stalled && <button type="button" className={styles.cardPrimary} disabled={retryDisabled} onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />남은 장 이어서 쓰기</button>}
      {onOpen && done > 0 && <button type="button" className={styles.cardSecondary} onClick={onOpen}>쓴 부분 보기</button>}
    </div>}
  </section>;
}
