"use client";

import { useEffect, useRef, useState } from "react";
import type { IntakeSnapshot } from "../../../lib/plan-builder/intake-types";
import { plainText, summaryAnswerText } from "../chat/intake-ui/model";
import styles from "./Studio.module.css";

/*
 * PC 작업실 — 대화가 끝나기 전 오른쪽 칸. 예전엔 '사업 방향 정리를 마쳐야 … / 대화로 가기'만 있었는데 대화는 바로 왼쪽에 있다
 * (여정 점검 2026-10-23). 대신 지금까지 답한 내용을 대화 칸 '요약'과 같은 자료(대화 질문 진행을 물을 때 함께 오는 것)로 보여 준다.
 * 같은 설명이 '처음 적은 설명 · 사업 소개 · 이전 답변'으로 세 번 보였다 — 같은 글은 한 번만(먼저 나온 이름으로).
 * 고치기는 대화 칸이 맡는다(여기는 읽기만, AI 를 부르지 않는다).
 */
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

export type SummaryRow = { id: string; label: string; value: string; proposal: boolean };

/** 요약 줄 — 값이 없거나 이미 나온 글과 같으면 뺀다. 사업 소개(business)를 맨 앞에 */
export function intakeSummaryRows(snapshot: IntakeSnapshot): SummaryRow[] {
  const seen = new Set<string>();
  const rows: SummaryRow[] = [];
  const items = [...snapshot.summary].sort((a, b) => Number(b.id === "business") - Number(a.id === "business"));
  for (const item of items) {
    if (item.basis === "unknown") continue;
    const shown = plainText(item.value);
    if (!shown) continue;
    const question = snapshot.questions.find(entry => entry.id === item.id || entry.fieldKey === item.id);
    const display = item.id === "industry" && snapshot.ksic ? snapshot.ksic.name : (question ? summaryAnswerText(question, shown, snapshot.candidateIdeas) : "") || shown;
    const key = normalize(display);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: item.id, label: item.label, value: display, proposal: item.basis === "proposal" });
  }
  return rows;
}

/** 지난번과 비교해 새로 생기거나 바뀐 줄 — 처음 그릴 때(이전 값이 없을 때)는 없다고 본다 */
export function changedSummaryRows(previous: Map<string, string> | null, rows: SummaryRow[]): string[] {
  if (!previous) return [];
  return rows.filter(row => previous.get(row.id) !== row.value).map(row => row.id);
}

export default function StudioIntakeSummary({ snapshot, note }: { snapshot: IntakeSnapshot | null; note: string }) {
  const rows = snapshot ? intakeSummaryRows(snapshot) : [];
  /*
   * 왼쪽 대화에서 답하면 오른쪽에 새 줄이 생기는데, 아래쪽에 붙으면 보이지 않아 반영된 줄 몰랐다(대표 요청 2026-10-24).
   * 새로 생기거나 바뀐 줄을 칸 안에서 보이는 곳까지 부드럽게 내리고 잠깐 밝힌다. 이미 보이면 움직이지 않는다(nearest).
   */
  const list = useRef<HTMLDListElement>(null);
  const previous = useRef<Map<string, string> | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const signature = rows.map(row => `${row.id}\u0000${row.value}`).join("\u0001");
  useEffect(() => {
    if (!snapshot) return;
    const changed = changedSummaryRows(previous.current, rows);
    previous.current = new Map(rows.map(row => [row.id, row.value]));
    if (!changed.length) return;
    setFresh(changed);
    const last = changed[changed.length - 1];
    const target = list.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(last)}"]`);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    const timer = window.setTimeout(() => setFresh([]), 1800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 줄 내용(signature)이 바뀔 때만 비교한다
  }, [signature, snapshot === null]);
  return <section className={styles.liveSummary} aria-labelledby="studio-live-summary-heading">
    <header>
      <h3 id="studio-live-summary-heading">지금까지 정한 내용</h3>
      {snapshot && snapshot.coreTotal > 0 && <p>{snapshot.coreComplete ? "기본 질문을 다 답했어요" : `기본 질문 ${Math.min(snapshot.coreAnswered, snapshot.coreTotal)} / ${snapshot.coreTotal}`}</p>}
    </header>
    {rows.length ? <dl ref={list}>
      {rows.map(row => <div key={row.id} data-row={row.id} data-fresh={fresh.includes(row.id) || undefined}><dt>{row.label}{row.proposal && <small>AI 초안</small>}</dt><dd>{row.value}</dd></div>)}
    </dl> : <p className={styles.liveSummaryEmpty}>아직 답한 내용이 없어요. 왼쪽 대화에서 질문에 답하면 여기에 바로 정리돼요.</p>}
    <p className={styles.liveSummaryNote}>{note}</p>
  </section>;
}
