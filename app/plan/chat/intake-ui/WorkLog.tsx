"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronDown, ChevronUp, Copy } from "lucide-react";
import styles from "../intake.module.css";
import { clockLabel, type WorkLogItem } from "./work-log";

/** 펼친 목록에 처음 보일 개수 — 나머지는 '+ N개 더 보기' */
const DETAIL_PREVIEW = 6;

/*
 * 작업실 PC 대화 칸의 작업 기록 — 파란 체크 아이콘이 붙은 한 줄씩. 목록이 있는 줄만 눌러서 펼친다(2열 목록).
 * 기록할 것이 없으면 아무것도 그리지 않는다.
 */
export function WorkLog({ items, unit = "개", card = false }: { items: Array<WorkLogItem | null | undefined | false>; unit?: string; card?: boolean }) {
  const shown = items.filter((item): item is WorkLogItem => !!item);
  if (!shown.length) return null;
  if (card) return <div className={styles.workLog} data-work-log>{shown.map(item => <WorkLogCard key={item.id} item={item} unit={unit} />)}</div>;
  return <div className={styles.workLog} data-work-log>{shown.map(item => <WorkLogRow key={item.id} item={item} unit={unit} />)}</div>;
}

/*
 * 대화 중간 요약(예: 남는 돈을 계산했어요 · 대표 메뉴 1개에 4,500원) — lovable 도구 카드처럼 r12 카드 한 장(제목 + 설명 + 작은 '자세히' 알약).
 * 예전엔 체크 아이콘 한 줄이 질문 사이에 끼어 흐름이 끊겨 보였다(6단계).
 */
function WorkLogCard({ item, unit }: { item: WorkLogItem; unit: string }) {
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLElement>(null);
  /* 펼치거나 접어도 카드가 제자리에 있게 — 대화의 '맨 아래 따라가기'가 늘어난 높이만큼 화면을 끌어내리지 않게 한다 */
  const toggle = () => {
    const el = card.current;
    let scroller: HTMLElement | null = el?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const before = el?.getBoundingClientRect().top ?? 0;
    setOpen(value => !value);
    const keep = () => { if (!el || !scroller) return; const moved = el.getBoundingClientRect().top - before; if (Math.abs(moved) > 1) scroller.scrollTop += moved; };
    window.requestAnimationFrame(() => { keep(); window.setTimeout(keep, 120); });
  };
  const [all, setAll] = useState(false);
  const detail = item.detail ?? [];
  const visible = all ? detail : detail.slice(0, DETAIL_PREVIEW);
  const id = `work-log-${item.id}`;
  return <section ref={card} className={styles.workLogCard} data-work-log-item={item.id} aria-label={item.text}>
    <div className={styles.workLogCardHead}>
      <CheckCircle2 size={16} className={styles.workLogIcon} aria-hidden="true" />
      <div className={styles.workLogCardText}><p className={styles.workLogCardTitle}>{item.text}</p>{item.sub && <p className={styles.workLogCardSub}>{item.sub}</p>}</div>
      {detail.length > 0 && <button type="button" className={styles.workLogCardButton} aria-expanded={open} aria-controls={id} onClick={toggle}>{open ? "접기" : "자세히"}{open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}</button>}
    </div>
    {open && <div id={id} className={styles.workLogBody}>
      {visible.map((line, index) => <span key={`${line}:${index}`}><Check size={12} aria-hidden="true" />{line}</span>)}
      {detail.length > visible.length && <button type="button" className={styles.workLogMore} onClick={() => setAll(true)}>+ {detail.length - visible.length}{unit} 더 보기</button>}
    </div>}
  </section>;
}

function WorkLogRow({ item, unit }: { item: WorkLogItem; unit: string }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const detail = item.detail ?? [];
  const label = <><CheckCircle2 size={16} className={styles.workLogIcon} aria-hidden="true" /><span>{item.text}</span>{item.sub && <span className={styles.workLogSub}>· {item.sub}</span>}</>;
  if (!detail.length) return <p className={styles.workLogRow} data-work-log-item={item.id}>{label}</p>;
  const visible = all ? detail : detail.slice(0, DETAIL_PREVIEW);
  const id = `work-log-${item.id}`;
  return <div data-work-log-item={item.id}>
    <button type="button" className={styles.workLogRow} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{label}{open ? <ChevronUp size={14} className={styles.workLogChevron} aria-hidden="true" /> : <ChevronDown size={14} className={styles.workLogChevron} aria-hidden="true" />}</button>
    {open && <div id={id} className={styles.workLogBody}>
      {visible.map((line, index) => <span key={`${line}:${index}`}><Check size={12} aria-hidden="true" />{line}</span>)}
      {detail.length > visible.length && <button type="button" className={styles.workLogMore} onClick={() => setAll(true)}>+ {detail.length - visible.length}{unit} 더 보기</button>}
    </div>}
  </div>;
}

/*
 * AI 답 아래 작은 줄 — 시각(있을 때만) · 복사. 되돌리기는 되돌릴 수 있는 곳(고치기 카드)에만 있어 여기에는 두지 않는다.
 */
export function MessageMeta({ text, at }: { text: string; at?: string | null }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const time = clockLabel(at);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => { /* 복사를 막은 브라우저면 아무 일도 없다 */ });
  };
  return <div className={styles.messageMeta} data-message-meta>
    {time && <time dateTime={at ?? undefined}>{time}</time>}
    <button type="button" className={styles.metaButton} aria-label={copied ? "복사했어요" : "답 복사하기"} title={copied ? "복사했어요" : "복사하기"} onClick={copy}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}</button>
    <span className={styles.srOnly} role="status" aria-live="polite">{copied ? "복사했어요" : ""}</span>
  </div>;
}
