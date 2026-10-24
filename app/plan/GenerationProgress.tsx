"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, RefreshCw, X } from "lucide-react";
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
 *
 * 같은 사업을 보는 곳(작업실 머리줄 · 대화 칸 · 계획서 칸)이 묻기 하나를 나눠 쓴다(사업마다 하나 — 아래 poller).
 * 예전엔 셋이 따로 3~4초마다 물어, 서버가 500 · 429 · 401 을 돌려줘도 9초에 11번씩 계속 물었다(점검 2026-10-23).
 * 이제 실패하면 간격을 두 배씩 늘리고(최대 1분), 429 는 서버가 말한 Retry-After 만큼 기다리고, 401(로그인이 풀림)이면 멈춘다 —
 * 그때는 authLost 로 알려 화면이 로그인 안내를 띄운다. 성공했을 때의 간격 · 멈추는 기준은 예전 그대로다.
 */
const MAX_BACKOFF_MS = 60_000;
/* 창으로 돌아올 때 다시 묻기 — 포커스 · 보이기가 한꺼번에 와도 한 번만 */
const WAKE_GAP_MS = 1_000;

type PollerListener = { interval: number; update: () => void };
type Poller = {
  planId: string;
  state: GenerationState | null;
  authLost: boolean;
  listeners: Set<PollerListener>;
  timer: number;
  inflight: boolean;
  /* 묻는 중에 다시 묻기를 요청받았다(새 제작 시작 등) — 끝나면 바로 한 번 더 */
  again: boolean;
  failures: number;
  lastFetch: number;
};
const pollers = new Map<string, Poller>();

function pollerFor(planId: string): Poller {
  let poller = pollers.get(planId);
  if (!poller) {
    poller = { planId, state: null, authLost: false, listeners: new Set(), timer: 0, inflight: false, again: false, failures: 0, lastFetch: 0 };
    pollers.set(planId, poller);
  }
  return poller;
}

/* 보는 곳마다 원한 간격 중 가장 짧은 것(작업실·대화 3초, 계획서 칸 4초) */
function pollInterval(poller: Poller): number {
  let interval = Infinity;
  for (const listener of poller.listeners) interval = Math.min(interval, listener.interval);
  return Number.isFinite(interval) ? interval : 3000;
}

/* Retry-After — 초 또는 날짜. 못 읽으면 0 */
function retryAfterMs(response: Response): number {
  const value = response.headers.get("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
}

function notify(poller: Poller) {
  for (const listener of poller.listeners) listener.update();
}

function stopTimer(poller: Poller) {
  window.clearTimeout(poller.timer);
  poller.timer = 0;
}

async function runPoller(poller: Poller) {
  stopTimer(poller);
  poller.inflight = true;
  poller.lastFetch = Date.now();
  let delay: number | null = null;
  try {
    const response = await fetch(`/api/plan/generation?planId=${encodeURIComponent(poller.planId)}`, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json() as GenerationState;
      poller.failures = 0;
      const wasLost = poller.authLost;
      poller.authLost = false;
      // 바뀐 게 없으면 상태를 새로 만들지 않는다 — 몇 초마다 문서 전체가 다시 그려져 버벅이던 원인
      const changed = !poller.state || JSON.stringify(poller.state) !== JSON.stringify(data);
      if (changed) poller.state = data;
      if (changed || wasLost) notify(poller);
      if (data.active && !FAILED.includes(data.runStatus ?? "")) delay = pollInterval(poller);
    } else if (response.status === 401) {
      /* 로그인이 풀렸다 — 다시 로그인하거나 창으로 돌아올 때(wake)까지 묻지 않는다 */
      if (!poller.authLost) { poller.authLost = true; notify(poller); }
    } else {
      poller.failures += 1;
      delay = Math.max(retryAfterMs(response), Math.min(pollInterval(poller) * 2 ** poller.failures, MAX_BACKOFF_MS));
    }
  } catch {
    /* 연결이 잠깐 끊겨도 다음 차례에 다시 묻는다 — 끊긴 동안은 간격을 늘려 가며 */
    poller.failures += 1;
    delay = Math.min(pollInterval(poller) * 2 ** poller.failures, MAX_BACKOFF_MS);
  }
  poller.inflight = false;
  if (!poller.listeners.size) return;
  if (poller.again) { poller.again = false; void runPoller(poller); return; }
  if (delay !== null) poller.timer = window.setTimeout(() => void runPoller(poller), delay);
}

/** 지금 바로 다시 묻는다(새 제작 시작 등) — 묻는 중이면 끝난 뒤 한 번 더 */
function restartPoller(poller: Poller) {
  poller.failures = 0;
  if (poller.inflight) { poller.again = true; return; }
  void runPoller(poller);
}

export function useGenerationProgress(planId: string | null | undefined, enabled = true, intervalMs = 3000) {
  const [state, setState] = useState<GenerationState | null>(null);
  const [authLost, setAuthLost] = useState(false);
  useEffect(() => {
    if (!planId || !enabled) return;
    const poller = pollerFor(planId);
    const listener: PollerListener = { interval: intervalMs, update: () => { setState(poller.state); setAuthLost(poller.authLost); } };
    poller.listeners.add(listener);
    /* 이미 받아 둔 진행은 바로 보이고, 쉬고 있는 묻기(멈춤 · 다 됨)는 처음 여는 곳이 한 번 다시 묻는다(예전처럼) */
    if (poller.state || poller.authLost) listener.update();
    if (!poller.inflight && !poller.timer) void runPoller(poller);
    return () => {
      poller.listeners.delete(listener);
      if (!poller.listeners.size) { stopTimer(poller); poller.again = false; }
    };
  }, [planId, enabled, intervalMs]);
  // 다른 탭에서 시작한 작성도 이 화면에 돌아오면 다시 확인한다(멈춘 확인 · 로그인이 풀려 멈춘 확인을 다시 켠다)
  useEffect(() => {
    if (!planId || !enabled) return;
    const poller = pollerFor(planId);
    const wake = () => {
      if (document.visibilityState !== "visible" || poller.inflight || Date.now() - poller.lastFetch < WAKE_GAP_MS) return;
      void runPoller(poller);
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => { document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); };
  }, [planId, enabled]);
  /** 새 제작을 시작한 직후처럼 다시 묻기 시작하게 한다 */
  const restart = () => { if (planId && enabled) restartPoller(pollerFor(planId)); };
  return { state, restart, authLost };
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
    {/* 짧게 — 제목이 이미 상태를 말한다(r37 글 점검). 멈췄으면 다시 만들 때 남은 항목만 쓴다는 것만 */}
    {!finished && <p className={styles.lead}>{failed ? "만든 항목은 저장돼 있어요. 다시 만들면 남은 항목만 써요." : "5분 안팎 걸려요. 창을 닫아도 계속 써요."}</p>}
    <div className={styles.meter}><span>{done} / {total || "–"}</span><progress value={done} max={total || 1} aria-label="작성한 항목" /></div>
    <ol className={styles.list}>
      {(state?.sections ?? []).map(section => <li key={section.key} data-state={section.done ? "done" : section.key === firstPending && !failed ? "current" : "todo"}>
        <span className={styles.mark} aria-hidden="true">{section.done ? <Check size={14} /> : section.key === firstPending && !failed ? <i /> : null}</span>
        {section.title}<small>{section.done ? "완료" : section.key === firstPending && !failed ? "작성 중" : "대기"}</small>
      </li>)}
    </ol>
    <footer>
      <button type="button" className={styles.secondary} onClick={onClose}>{finished ? "닫기" : "닫고 기다리기"}</button>
      <Link className={styles.primary} href={`/plan/document?planId=${encodeURIComponent(planId)}`} aria-disabled={!done} onClick={event => { if (!done) event.preventDefault(); }}>{finished ? "사업계획서 열기" : "작성된 부분 보기"}<ChevronRight size={18} aria-hidden="true" /></Link>
    </footer>
  </dialog>;
}

/*
 * 작업실(사업 작업실) 대화 칸 안의 진행 카드 — 팝업(GenerationDialog) 대신 대화 흐름 안에 둔다.
 * 오른쪽 계획서 칸에서 장이 채워지는 동안 왼쪽 대화에서는 다 쓴 장 · 쓰는 장 · 기다리는 장과 남은 시간을 본다.
 * 멈췄으면(일부 장을 못 씀) '남은 장 이어서 쓰기'로 다시 시작한다 — 이미 쓴 장은 다시 쓰지 않는다.
 */
export function GenerationCard({ state, onRetry, retryDisabled = false, onOpen, note, compact = false }: {
  state: GenerationState;
  onRetry: () => void;
  retryDisabled?: boolean;
  /** 다 쓴 장이 있으면 '쓴 부분 보기' — 작업실에서는 계획서 탭을 보여 준다 */
  onOpen?: () => void;
  /** 쓰는 중 안내를 바꾼다 — null 이면 쓰는 중 안내를 두지 않는다(작업실 PC: 오른쪽 계획서 칸이 '창을 닫아도 계속 써요'를 한 번만 말한다) */
  note?: string | null;
  /**
   * 한 줄 상태만 — 작업실 PC 는 머리줄 · 오른쪽 계획서 칸이 이미 장마다 진행을 보여 대화 칸까지 세 번 보였다(PC 점검 2026-10-24).
   * 쓰는 중이면 '사업계획서 만드는 중 · 3/10 항목' 한 줄(쓴 부분 보기 단추 없음 — 계획서는 바로 오른쪽에 있다). 멈췄으면 다시 쓰기 카드 그대로.
   */
  compact?: boolean;
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
  if (compact && !stalled) return <section className={`${styles.card} ${styles.cardLine}`} aria-label="사업계획서 작성 진행" data-generation-card data-state="running">
    <p className={styles.cardCurrent} role="status"><i aria-hidden="true" />사업계획서 만드는 중<span className={styles.cardCount}>{done}/{total || "–"} 항목</span></p>
  </section>;
  return <section className={styles.card} aria-label="사업계획서 작성 진행" data-generation-card data-state={stalled ? "stalled" : "running"}>
    <header>
      {/* 단위는 항목 — 머리줄 '만드는 중 · 2/10 항목' · 대화 '10개 항목을 썼어요'와 같은 말(r37 점검) */}
      <strong>{stalled ? done ? "일부 항목을 만들지 못했어요" : "계획서를 만들지 못했어요" : "사업계획서 만드는 중"}</strong>
      <span>{stalled ? `${done}/${total} 항목 완성` : eta ?? "보통 5분 안팎"}</span>
    </header>
    <progress value={done} max={total || 1} aria-label={`작성한 항목 ${done}/${total}`} />
    {finished.length > 0 && <p className={styles.cardDone}><Check size={14} aria-hidden="true" />{finished.map(section => section.title).join(" · ")}</p>}
    {/* 쓰는 장이 바뀔 때만 읽힌다(몇 초마다 오는 확인에는 글이 그대로라 다시 읽지 않는다) */}
    {current && <p className={styles.cardCurrent} role="status" aria-live="polite"><i aria-hidden="true" />{current.title} 쓰는 중</p>}
    {/* 장 이름이 줄 끝에서 둘로 쪼개지지 않게 이름마다 한 덩어리로(r37 휴대폰 점검) */}
    {waiting.length > 0 && <p className={styles.cardWaiting}>{stalled ? "남은 항목" : "대기"}: {/* 항목 이름과 뒤 구분점을 한 덩어리로 묶는다 — 줄 끝에서 '요약' 하나만 다음 줄로 떨어지지 않게(PC 점검 2026-10-24) */}{waiting.map((section, index) => <Fragment key={section.title + index}>{index > 0 && " "}<span>{section.title}{index < waiting.length - 1 && " ·"}</span></Fragment>)}</p>}
    {(stalled || note !== null) && <p className={styles.cardNote}>{stalled ? done ? "다 쓴 장은 저장돼 있어요." : "한 장도 쓰지 못했어요. 계속 안 되면 고객센터로 알려 주세요." : note ?? "창을 닫아도 계속 써요."}</p>}
    {(stalled || onOpen && done > 0) && <div className={styles.cardActions}>
      {stalled && <button type="button" className={styles.cardPrimary} disabled={retryDisabled} onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />남은 항목 이어서 쓰기</button>}
      {onOpen && done > 0 && <button type="button" className={styles.cardSecondary} onClick={onOpen}>쓴 부분 보기</button>}
    </div>}
  </section>;
}
