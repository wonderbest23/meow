"use client";

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

export default function StudioIntakeSummary({ snapshot, note }: { snapshot: IntakeSnapshot | null; note: string }) {
  const rows = snapshot ? intakeSummaryRows(snapshot) : [];
  return <section className={styles.liveSummary} aria-labelledby="studio-live-summary-heading">
    <header>
      <h3 id="studio-live-summary-heading">지금까지 정한 내용</h3>
      {snapshot && snapshot.coreTotal > 0 && <p>{snapshot.coreComplete ? "기본 질문을 다 답했어요" : `기본 질문 ${Math.min(snapshot.coreAnswered, snapshot.coreTotal)} / ${snapshot.coreTotal}`}</p>}
    </header>
    {rows.length ? <dl>
      {rows.map(row => <div key={row.id}><dt>{row.label}{row.proposal && <small>AI 초안</small>}</dt><dd>{row.value}</dd></div>)}
    </dl> : <p className={styles.liveSummaryEmpty}>아직 답한 내용이 없어요. 왼쪽 대화에서 질문에 답하면 여기에 바로 정리돼요.</p>}
    <p className={styles.liveSummaryNote}>{note}</p>
  </section>;
}
