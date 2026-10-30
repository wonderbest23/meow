"use client";

import { useEffect, useRef, useState } from "react";
import { ListChecks } from "lucide-react";
import type { IntakeSnapshot } from "../../../lib/plan-builder/intake-types";
import type { IntakeQuestion } from "../../../lib/plan-builder/intake-questions";
import { wonLabel } from "../../../lib/plan-builder/intake-options";
import { numericAnswer, plainText, summaryAnswerText } from "../chat/intake-ui/model";
import styles from "./Studio.module.css";
import { StatusBadge } from "../../../components/status-badge";

/*
 * PC 작업실 — 대화가 끝나기 전 오른쪽 칸. 예전엔 '사업 방향 정리를 마쳐야 … / 대화로 가기'만 있었는데 대화는 바로 왼쪽에 있다
 * (여정 점검 2026-10-23). 대신 지금까지 답한 내용을 대화 칸 '요약'과 같은 자료(대화 질문 진행을 물을 때 함께 오는 것)로 보여 준다.
 * 같은 설명이 '처음 적은 설명 · 사업 소개 · 이전 답변'으로 세 번 보였다 — 같은 글은 한 번만(먼저 나온 이름으로).
 * 고치기는 대화 칸이 맡는다(여기는 읽기만, AI 를 부르지 않는다).
 *
 * 새 작업실(대표 승인 시안 2026-10-24) — 카드 위 얇은 줄(지금까지 정한 내용), 사업 소개를 큰 제목으로,
 * 질문 수는 머리줄과 진행 막대에만 둔다 — 여기서 'N개 답함 · N개 남았어요'를 또 말하지 않는다(r37 글 점검).
 * '사업' 표 · '숫자'(가격 · 한 건 비용 · 둘 다 있으면 남는 돈 '계산') · 남은 질문(지금 묻는 중) · 마치면 무엇이 되는지 한 줄.
 * 숫자는 답한 것만 쓴다 — 남는 돈도 가격과 한 건 비용을 둘 다 답했을 때만 뺀 값이다(지어내지 않는다).
 * 금액은 대화 말풍선과 같은 한국어 단위로(2,000만원 · 1억 5,000만원) — 여기만 '20,000,000원'으로 보였다(점검 2026-10-24).
 * 사업 소개는 큰 제목이 맡는다 — 같은 글을 '사업' 표에 또 두지 않는다.
 */
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/* 좁은 표 칸에서 두 줄로 꺾이던 긴 이름 — 뜻이 같은 짧은 이름으로(r37 점검) */
const SHORT_LABELS: Record<string, string> = { "일주일에 쓸 수 있는 시간": "일주일 시간" };

export type SummaryRow = { id: string; label: string; value: string; proposal: boolean };

/* 요약 줄의 질문 — 질문 id 나 저장 칸(fieldKey)이 같은 것 */
const questionFor = (snapshot: IntakeSnapshot, id: string): IntakeQuestion | undefined => snapshot.questions.find(entry => entry.id === id || entry.fieldKey === id);

/** 원 단위 숫자 답이면 한국어 단위 금액(기간 기준이 있으면 ' / 월'처럼 붙인다), 아니면 undefined */
function koreanAmount(question: IntakeQuestion | undefined, value: string): string | undefined {
  if (!question || question.kind !== "number" || question.unit !== "원") return undefined;
  const amount = numericAnswer(question, value);
  if (amount === undefined) return undefined;
  return question.period ? `${wonLabel(amount)} / ${question.period}` : wonLabel(amount);
}

/** 요약 줄 — 값이 없거나 이미 나온 글과 같으면 뺀다. 사업 소개(business)를 맨 앞에 */
export function intakeSummaryRows(snapshot: IntakeSnapshot): SummaryRow[] {
  const seen = new Set<string>();
  const rows: SummaryRow[] = [];
  /* 사업 소개를 맨 앞, 업종을 바로 다음에(r37 점검) — 나머지는 원래 순서 */
  const rank = (id: string) => (id === "business" ? 0 : id === "industry" ? 1 : 2);
  const items = [...snapshot.summary].sort((a, b) => rank(a.id) - rank(b.id));
  for (const item of items) {
    if (item.basis === "unknown") continue;
    const shown = plainText(item.value);
    if (!shown) continue;
    const question = questionFor(snapshot, item.id);
    const display = item.id === "industry" && snapshot.ksic ? snapshot.ksic.name : koreanAmount(question, shown) ?? ((question ? summaryAnswerText(question, shown, snapshot.candidateIdeas) : "") || shown);
    const key = normalize(display);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: item.id, label: SHORT_LABELS[item.label] ?? item.label, value: display, proposal: item.basis === "proposal" });
  }
  return rows;
}

/** 지난번과 비교해 새로 생기거나 바뀐 줄 — 처음 그릴 때(이전 값이 없을 때)는 없다고 본다 */
export function changedSummaryRows(previous: Map<string, string> | null, rows: SummaryRow[]): string[] {
  if (!previous) return [];
  return rows.filter(row => previous.get(row.id) !== row.value).map(row => row.id);
}

/** 아직 답하지 않은 기본 질문 — 기본 질문이 목록 앞에 온다(intakeQuestions). 지금 묻는 질문(nextQuestion)을 표시한다 */
export function remainingCoreQuestions(snapshot: IntakeSnapshot): { id: string; label: string; now: boolean }[] {
  const answered = (question: IntakeQuestion) => !!snapshot.intake.answers[question.id]
    || (!!question.fieldKey && snapshot.coach.fields.some(field => field.key === question.fieldKey && field.basis === "user"));
  return snapshot.questions.slice(0, Math.max(0, snapshot.coreTotal))
    .filter(question => !answered(question))
    .map(question => ({ id: question.id, label: question.label, now: question.id === snapshot.nextQuestion?.id }));
}

type Stat = { id: string; label: string; value: string; computed?: boolean };

/** 숫자 카드 — 가격 · 한 건 비용(답한 것만), 둘 다 숫자로 답했으면 남는 돈(계산) */
export function summaryStats(snapshot: IntakeSnapshot, rows: SummaryRow[]): Stat[] {
  const amount = (id: string) => {
    const question = questionFor(snapshot, id);
    const raw = plainText(snapshot.summary.find(item => item.id === id && item.basis !== "unknown")?.value);
    return question && raw ? numericAnswer(question, raw) : undefined;
  };
  /*
   * 세 칸 이름은 같은 단위 낱말로 — '판매 1건 가격 · 판매 1건 비용 · 판매 1건 남는 돈'(r37 점검).
   * 대화 칸 작업 기록('남는 돈을 계산했어요 · 판매 1건에 6,000원')과 같은 단위(비용 질문의 기준, 없으면 가격 질문의 기준)를 쓴다.
   */
  const unit = questionFor(snapshot, "unitCost")?.period ?? questionFor(snapshot, "price")?.period ?? "한 건";
  const stats: Stat[] = [];
  for (const [id, name] of [["price", "가격"], ["unitCost", "비용"]] as const) {
    const row = rows.find(item => item.id === id);
    if (!row) continue;
    const value = amount(id);
    stats.push({ id, label: `${unit} ${name}`, value: value === undefined ? row.value : wonLabel(value) });
  }
  const price = amount("price"), unitCost = amount("unitCost");
  if (price !== undefined && unitCost !== undefined) {
    stats.push({ id: "margin", label: `${unit} 남는 돈`, value: price - unitCost < 0 ? `-${wonLabel(unitCost - price)}` : wonLabel(price - unitCost), computed: true });
  }
  return stats;
}

export default function StudioIntakeSummary({ snapshot }: { snapshot: IntakeSnapshot | null }) {
  const rows = snapshot ? intakeSummaryRows(snapshot) : [];
  /*
   * 왼쪽 대화에서 답하면 오른쪽에 새 줄이 생기는데, 아래쪽에 붙으면 보이지 않아 반영된 줄 몰랐다(대표 요청 2026-10-24).
   * 새로 생기거나 바뀐 줄을 칸 안에서 보이는 곳까지 부드럽게 내리고 잠깐 밝힌다. 이미 보이면 움직이지 않는다(nearest).
   * '방금 정함' 표시는 다음 답이 반영될 때까지 남긴다(밝힘은 잠깐 — CSS).
   */
  const list = useRef<HTMLDivElement>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 줄 내용(signature)이 바뀔 때만 비교한다
  }, [signature, snapshot === null]);

  const business = rows.find(row => row.id === "business");
  const stats = snapshot ? summaryStats(snapshot, rows) : [];
  const numeric = (row: SummaryRow) => !!snapshot && questionFor(snapshot, row.id)?.kind === "number";
  const textRows = rows.filter(row => row !== business && !numeric(row));
  const numberRows = rows.filter(row => numeric(row) && !stats.some(stat => stat.id === row.id));
  const remaining = snapshot ? remainingCoreQuestions(snapshot) : [];
  const title = snapshot?.title && normalize(snapshot.title) !== normalize(business?.value ?? "") ? snapshot.title : "";
  const freshTag = (id: string) => (fresh.includes(id) ? <StatusBadge tone="info">방금 정함</StatusBadge> : null);
  const summaryRow = (row: SummaryRow) => <div key={row.id} data-row={row.id} data-fresh={fresh.includes(row.id) || undefined}>
    <dt>{row.label}{row.proposal && <StatusBadge tone="neutral">AI 초안</StatusBadge>}</dt><dd>{row.value}</dd>{freshTag(row.id) ?? <span />}
  </div>;

  return <section className={styles.liveSummary} aria-labelledby="studio-live-summary-heading">
    <header className={styles.sumStrip}>
      <ListChecks size={15} aria-hidden="true" />
      <h3 id="studio-live-summary-heading">지금까지 정한 내용</h3>
    </header>
    <div className={styles.sumBody} ref={list} data-empty={!rows.length || undefined}>
      {rows.length ? <>
        <div className={styles.sumHead} data-row={business ? "business" : undefined} data-fresh={business && fresh.includes("business") || undefined}>
          <p className={styles.sumTitle}>{business?.value ?? (title || "아직 사업 소개를 정하지 않았어요")}{business && freshTag("business")}</p>
          {business && title && <p className={styles.sumLead}>{title}</p>}
        </div>
        {textRows.length > 0 && <div className={styles.sumGroup}>
          <h4>사업</h4>
          <dl>{textRows.map(summaryRow)}</dl>
        </div>}
        {(stats.length > 0 || numberRows.length > 0) && <div className={styles.sumGroup}>
          <h4>숫자</h4>
          {stats.length > 0 && <div className={styles.sumStats}>
            {stats.map(stat => <div key={stat.id} data-row={stat.computed ? undefined : stat.id} data-fresh={!stat.computed && fresh.includes(stat.id) || undefined}>
              <span className={styles.sumStatLabel}>{stat.label}{!stat.computed && freshTag(stat.id)}</span>
              <strong>{stat.value}{stat.computed && <small>계산</small>}</strong>
            </div>)}
          </div>}
          {numberRows.length > 0 && <dl>{numberRows.map(summaryRow)}</dl>}
        </div>}
      </> : <div className={styles.liveSummaryEmpty}><ListChecks size={26} aria-hidden="true" /><p>아직 정한 내용이 없어요</p></div>}
      {remaining.length > 0 && <div className={styles.sumGroup}>
        <h4>남은 질문</h4>
        <ol className={styles.sumTodo}>
          {remaining.map(item => <li key={item.id} data-now={item.now || undefined} aria-current={item.now ? "step" : undefined}>{item.label}{item.now && <small>지금 묻는 중</small>}</li>)}
        </ol>
      </div>}
    </div>
  </section>;
}
