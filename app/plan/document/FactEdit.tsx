"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { IntakeSnapshot, IntakeValue } from "../../../lib/plan-builder/intake-types";
import type { IntakeQuestion } from "../../../lib/plan-builder/intake-questions";
import { EDITABLE_FACT_IDS, factNeedles, findFactRanges, parseWon, type EditableFact } from "../../../lib/plan-builder/fact-highlight";
import { isShortCell } from "../../../lib/plan-builder/table-cells";
import { readChatResponse } from "../../../lib/http/read-chat-response";
import { QuestionForm } from "../chat/intake-ui/IntakePanels";
import { choiceDraftSubmission, emptyAnswer, incompleteChoiceText, numericAnswer, readIntakePayload, summaryAnswerText, type AnswerDraft } from "../chat/intake-ui/model";
import { wonLabel } from "../../../lib/plan-builder/intake-options";

/**
 * 칩 · 고치기 창에 보이는 값 — 원 단위 숫자는 대화 · 요약과 같은 한국어 단위('220만원')로(r37 점검: 여기만 '2,200,000원').
 * 문서에서 노란 칸을 찾는 글(needles)은 문서에 적힌 그대로의 display 를 쓴다.
 */
function factShown(fact: { question: IntakeQuestion; value: IntakeValue; display: string }): string {
  if (fact.question.kind !== "number" || fact.question.unit !== "원") return fact.display;
  const amount = numericAnswer(fact.question, fact.value);
  return amount === undefined ? fact.display : fact.question.period ? `${wonLabel(amount)} / ${fact.question.period}` : wonLabel(amount);
}
import intake from "../chat/intake.module.css";
import styles from "./DocumentWorkspace.module.css";

const HEADERS = { "x-business-intake": "2" };

/** Facts the document lets the owner change: answered core questions, in question order, with their display text. */
export function editableFacts(snapshot: IntakeSnapshot | null): Array<EditableFact & { question: IntakeQuestion; value: IntakeValue }> {
  if (!snapshot) return [];
  const ids = new Set<string>(EDITABLE_FACT_IDS);
  return snapshot.questions.flatMap(question => {
    const answer = snapshot.intake.answers[question.id];
    if (!ids.has(question.id) || answer?.status !== "answered") return [];
    const display = summaryAnswerText(question, answer.value, snapshot.candidateIdeas);
    return display.trim() ? [{ questionId: question.id, label: question.label, display, needles: factNeedles(display), question, value: answer.value }] : [];
  });
}

/** Section HTML with fact occurrences wrapped in <mark data-fact>. Scripts and inline handlers are dropped first. */
export function highlightFacts(html: string, facts: Pick<EditableFact, "questionId" | "needles">[]): string {
  if (typeof DOMParser === "undefined" || !html) return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed").forEach(node => node.remove());
  doc.querySelectorAll("*").forEach(element => [...element.attributes].forEach(attribute => { if (/^on/i.test(attribute.name) || /^\s*javascript:/i.test(attribute.value)) element.removeAttribute(attribute.name); }));
  const root = doc.body.firstElementChild!;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const node of texts) {
    const text = node.textContent ?? "";
    // 표·그래프 안의 금액은 계산된 값이라 표시하지 않는다. 문장 속 금액은 같은 문단의 앞말로 어느 사실인지 가린다(fact-highlight amountOwner).
    const parent = node.parentElement;
    let before: string | null = null;
    if (parent && !parent.closest("table, figure, svg, pre, code")) {
      const block = parent.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote, div") ?? root;
      const range = doc.createRange();
      range.setStart(block, 0); range.setEnd(node, 0);
      before = range.toString();
    }
    const ranges = findFactRanges(text, facts, before);
    if (!ranges.length) continue;
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const [start, end, id] of ranges) {
      if (start > cursor) fragment.append(text.slice(cursor, start));
      const mark = doc.createElement("mark");
      mark.setAttribute("data-fact", id); mark.setAttribute("role", "button"); mark.setAttribute("tabindex", "0");
      mark.textContent = text.slice(start, end);
      fragment.append(mark);
      cursor = end;
    }
    if (cursor < text.length) fragment.append(text.slice(cursor));
    node.replaceWith(fragment);
  }
  // 넓은 표는 옆으로 밀어 보게 감싼다(점검 2026-10-21: 고치기 화면에서 표가 잘리고 칸이 어긋났다)
  root.querySelectorAll("table").forEach(table => {
    // 예전 본문에는 짧은 칸 표시가 없다 — 읽기 화면과 같은 기준으로 붙여 숫자 칸만 한 줄로 둔다
    table.querySelectorAll("th, td").forEach(cell => { if (!cell.hasAttribute("data-short") && isShortCell(cell.textContent ?? "")) cell.setAttribute("data-short", ""); });
    const scroller = doc.createElement("div");
    scroller.className = "fact-table-scroll";
    table.replaceWith(scroller);
    scroller.append(table);
  });
  return root.innerHTML;
}

/*
 * 대화 칸의 '이렇게 바꿀게요' 카드(채팅 수정 제안)가 아직 열려 있으면 — 바꾸기 전 · 바꿀 값을 계획서 본문에서도 미리 보여 준다(작업실 PC 새 화면 2026-10-24).
 * 제안은 사업 답변(사실)을 바꾸는 것이라, 지금 답의 글(18,000원)을 본문에서 찾아 그 옆에 바꿀 글(19,000원)을 붙인다. 적용 전이라 저장은 하지 않는다.
 */
export type PendingFactChange = { questionId: string; label: string; before: string; after: string; needles: string[] };
export function pendingFactChanges(snapshot: IntakeSnapshot | null): PendingFactChange[] {
  const job = snapshot?.intake.job;
  if (!snapshot || job?.kind !== "edit" || job.status !== "complete" || !job.proposal?.length || job.proposalStatus) return [];
  return job.proposal.flatMap(change => {
    const question = snapshot.questions.find(item => item.id === change.questionId);
    const current = snapshot.intake.answers[change.questionId];
    if (!question || current?.status !== "answered") return [];
    const before = summaryAnswerText(question, current.value, snapshot.candidateIdeas).trim();
    const after = summaryAnswerText(question, change.value, snapshot.candidateIdeas).trim();
    return before && after && before !== after ? [{ questionId: change.questionId, label: question.label, before, after, needles: factNeedles(before) }] : [];
  });
}

/**
 * 본문 HTML 에서 바뀔 글을 <span data-plan-change><s>지금</s><ins>바꿀 값</ins></span> 로 감싼다. 찾은 곳이 없으면 null.
 * 문장 속 금액은 사실 고치기와 같은 규칙(앞말로 어느 사실인지 가림)으로, 표 칸은 그 줄 첫 칸(예: '상자 가격')을 앞말로 본다.
 */
export function previewFactChanges(html: string, changes: PendingFactChange[]): string | null {
  if (typeof DOMParser === "undefined" || !html || !changes.length) return null;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed").forEach(node => node.remove());
  doc.querySelectorAll("*").forEach(element => [...element.attributes].forEach(attribute => { if (/^on/i.test(attribute.name) || /^\s*javascript:/i.test(attribute.value)) element.removeAttribute(attribute.name); }));
  const root = doc.body.firstElementChild!;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  /* 블록 사이 줄바꿈 글자는 뺀다 — 편집기 모양(pre-wrap)으로 고정 글을 그리면 빈 줄(28px)로 보였다 */
  for (const node of texts) if (!node.textContent?.trim() && node.parentElement?.matches("div, table, thead, tbody, tfoot, tr, colgroup, ul, ol, blockquote")) node.remove();
  const after = new Map(changes.map(change => [change.questionId, change.after]));
  let found = false;
  for (const node of texts) {
    const text = node.textContent ?? "";
    const parent = node.parentElement;
    if (!parent || parent.closest("figure, svg, pre, code")) continue;
    const cell = parent.closest("td, th");
    let before: string | null;
    if (cell) {
      const first = cell.parentElement?.firstElementChild;
      before = first && first !== cell ? `${first.textContent ?? ""} ` : null;
    } else {
      const block = parent.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote, div") ?? root;
      const range = doc.createRange();
      range.setStart(block, 0); range.setEnd(node, 0);
      before = range.toString();
    }
    const ranges = findFactRanges(text, changes, before);
    if (!ranges.length) continue;
    found = true;
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const [start, end, id] of ranges) {
      if (start > cursor) fragment.append(text.slice(cursor, start));
      const wrap = doc.createElement("span");
      wrap.setAttribute("data-plan-change", id);
      const was = doc.createElement("s"); was.textContent = text.slice(start, end);
      const next = doc.createElement("ins"); next.textContent = after.get(id) ?? "";
      const hint = doc.createElement("span"); hint.className = "plan-change-hint"; hint.textContent = " → 바꿀 값 ";
      wrap.append(was, hint, next);
      fragment.append(wrap);
      cursor = end;
    }
    if (cursor < text.length) fragment.append(text.slice(cursor));
    node.replaceWith(fragment);
  }
  return found ? root.innerHTML : null;
}

/** The intake snapshot behind a document, and the two writes the document may make: change one answer, re-apply the plan. */
export function useFactEdit(planId: string | null, active: boolean) {
  const [snapshot, setSnapshot] = useState<IntakeSnapshot | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; href?: string; label?: string } | null>(null);
  /* quiet — 대화 수정 미리보기를 위해 뒤에서 다시 읽을 때는 실패해도 안내를 띄우지 않는다(다음 차례에 다시 읽는다) */
  const load = useCallback(async (quiet = false) => {
    if (!planId) return;
    try {
      const response = await fetch(`/api/plan/chat?planId=${encodeURIComponent(planId)}`, { headers: HEADERS, cache: "no-store" });
      const value = readIntakePayload(await readChatResponse(response));
      if (!response.ok || !value?.plan || value.plan.planId !== planId || !value.ownerScope) throw new Error(value?.message || "사업 정보를 불러오지 못했어요.");
      setSnapshot(value.plan); setOwner(value.ownerScope); if (!quiet) setError(null);
    } catch (caught) { if (!quiet) setError({ message: caught instanceof Error ? caught.message : "사업 정보를 불러오지 못했어요." }); }
  }, [planId]);
  useEffect(() => { if (active) void load(); }, [active, load]);
  const post = useCallback(async (command: Record<string, unknown>) => {
    if (!snapshot || !owner || !planId) return null;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/plan/chat", { method: "POST", headers: { ...HEADERS, "Content-Type": "application/json", "x-business-intake-owner": owner }, body: JSON.stringify({ planId, revision: snapshot.coach.revision, requestId: crypto.randomUUID(), ...command }) });
      const data = await readChatResponse(response) as { plan?: IntakeSnapshot; message?: string; code?: string; login?: boolean } | null;
      if (response.status === 409) { await load(); setError({ message: "다른 곳에서 먼저 바뀐 내용이 있어요. 최신 내용으로 다시 불러왔어요." }); return null; }
      if (response.status === 402) { setError({ message: data?.message || "다시 생성 횟수가 모자라요.", href: `/plan/pay?planId=${encodeURIComponent(planId)}&planType=${encodeURIComponent(snapshot.planType)}&product=regen`, label: "횟수 추가하기" }); return null; }
      if (response.status === 401 || data?.login) { setError({ message: "로그인하면 계획서에 반영할 수 있어요.", href: `/account?next=${encodeURIComponent(`/plan/document?planId=${planId}&edit=facts`)}`, label: "로그인" }); return null; }
      if (!response.ok || !data?.plan) { setError({ message: data?.message || "저장하지 못했어요. 잠시 후 다시 시도해 주세요." }); return null; }
      setSnapshot(data.plan);
      return data;
    } catch { setError({ message: "인터넷 연결이 잠시 끊겼어요. 다시 시도해 주세요." }); return null; }
    finally { setBusy(false); }
  }, [snapshot, owner, planId, load]);
  const facts = useMemo(() => editableFacts(snapshot), [snapshot]);
  return { snapshot, facts, busy, error, load, post };
}

/** What the draft from a fact popover would send: the same rules the chat composer uses. */
function draftSubmission(question: IntakeQuestion, draft: AnswerDraft): { value: IntakeValue; unknown?: boolean; ksic?: string } | null {
  if (draft.unknown) return { value: null, unknown: true };
  const choice = choiceDraftSubmission(question, draft);
  if (choice) return choice;
  if (!draft.text.trim() || incompleteChoiceText(question, draft)) return null;
  return { value: draft.text.trim() };
}

/** The card above the document: every editable fact as a chip. "계획서에 반영하기" lives once, in the edit bar above (대표 결정 r39). */
export function FactCard({ edit, onPick }: { edit: ReturnType<typeof useFactEdit>; onPick: (questionId: string, anchor: DOMRect) => void }) {
  return <section className={styles.factCard} aria-label="고칠 수 있는 내용" data-fact-card>
    <strong>고칠 수 있는 곳만 표시했어요</strong>
    {!edit.snapshot && !edit.error && <p role="status">사업 정보를 불러오고 있어요…</p>}
    {edit.facts.length > 0 && <div className={styles.factChips}>{edit.facts.map(fact => <button key={fact.questionId} type="button" data-fact-chip={fact.questionId} disabled={edit.busy} onClick={event => onPick(fact.questionId, event.currentTarget.getBoundingClientRect())}><small>{fact.label}</small>{factShown(fact)}</button>)}</div>}
    {edit.error && <p className={styles.factError} role="alert">{edit.error.message} {edit.error.href && <Link href={edit.error.href}>{edit.error.label}</Link>}</p>}
  </section>;
}

/** Small editor next to a fact: amounts get one input; other facts use the intake question in coach-chat form. */
export function FactPopover({ edit, questionId, anchor, onClose, onSaved }: { edit: ReturnType<typeof useFactEdit>; questionId: string; anchor: DOMRect; onClose: () => void; onSaved: () => void }) {
  const fact = edit.facts.find(item => item.questionId === questionId);
  // Start empty: a fact edit replaces the answer, it does not add to it. The current value is shown in the header.
  const [draft, setDraft] = useState<AnswerDraft>(emptyAnswer);
  const [amountText, setAmountText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: anchor.bottom + 8, left: anchor.left });
  useLayoutEffect(() => {
    const height = box.current?.offsetHeight ?? 320, width = box.current?.offsetWidth ?? 380;
    const top = anchor.bottom + 8 + height > innerHeight - 12 ? Math.max(12, anchor.top - height - 8) : anchor.bottom + 8;
    setPosition({ top, left: Math.max(12, Math.min(anchor.left, innerWidth - width - 12)) });
  }, [anchor]);
  /*
   * 창을 열면 초점을 창 안으로(금액은 입력칸이 스스로 받는다), 닫거나 바꾸면 연 자리(노란 칸 · 칩)로 돌려준다
   * (점검 r42: 고르는 창은 초점이 문서 맨 앞에 남아 키보드로 닿지 않았고, 닫으면 초점이 사라졌다). 연 자리는 첫 그리기 전에 잡는다.
   */
  const [opener] = useState(() => {
    if (typeof document === "undefined") return null;
    const active = document.activeElement;
    // 사파리는 단추를 눌러도 초점을 주지 않는다 — 그때는 이 사실의 칩으로 돌려준다
    return active instanceof HTMLElement && active !== document.body ? active : document.querySelector<HTMLElement>(`[data-fact-chip="${CSS.escape(questionId)}"]`);
  });
  useEffect(() => {
    if (!box.current?.contains(document.activeElement)) box.current?.focus({ preventScroll: true });
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [opener]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [onClose]);
  if (!fact || !edit.snapshot) return null;
  const amount = fact.question.kind === "number" && fact.question.unit === "원";
  const won = amount ? parseWon(amountText) : null;
  const saveAmount = async () => {
    if (won === null) return;
    const result = await edit.post({ action: "answer", questionId: fact.questionId, value: won });
    if (result) onSaved();
  };
  const save = async (value: AnswerDraft) => {
    const submission = draftSubmission(fact.question, value);
    if (!submission) return;
    const result = await edit.post({ action: "answer", questionId: fact.questionId, value: submission.value, ...(submission.unknown ? { unknown: true } : {}), ...(submission.ksic ? { ksic: submission.ksic } : {}) });
    if (result) onSaved();
  };
  return <div ref={box} className={styles.factPopover} style={{ top: position.top, left: position.left }} role="dialog" aria-label={`${fact.label} 바꾸기`} tabIndex={-1} data-fact-popover>
    <header><div><b>{fact.label} 바꾸기</b><small>지금: {factShown(fact)}</small></div><button type="button" aria-label="닫기" onClick={onClose}><X size={16} /></button></header>
    {amount ? <form className={styles.factAmount} onSubmit={event => { event.preventDefault(); void saveAmount(); }}>
      {/* 휴대폰은 숫자 자판이 뜬다 — 예시도 숫자로 둔다('6만'은 숫자 자판으로 칠 수 없다). 키보드로 '6만'을 적어도 읽는다 */}
      <label htmlFor="fact-amount">새 금액</label>
      <div><input id="fact-amount" autoFocus inputMode="numeric" autoComplete="off" maxLength={20} placeholder="예: 60000" value={amountText} disabled={edit.busy} onChange={event => setAmountText(event.target.value)} /><span>원</span></div>
      <small aria-live="polite">{won !== null ? `${new Intl.NumberFormat("ko-KR").format(won)}원으로 바꿔요` : amountText.trim() ? "숫자로 적어 주세요 (예: 60000, 6만5천)" : "\u00a0"}</small>
    </form> : <div className={`${intake.page} ${intake.factScope}`} data-coach>
      <QuestionForm question={fact.question} snapshot={edit.snapshot} draft={draft} editing={false} disabled={edit.busy} inChat coach
        onChange={(answer, submit) => { setDraft(answer); if (submit) void save(answer); }}
        onAnswer={value => void save({ ...emptyAnswer(), text: String(value ?? "") })} onCancel={onClose} />
    </div>}
    <footer><small>{amount ? "노란 금액은 바로 바뀌어요. 표와 계산된 숫자는 \"계획서에 반영하기\"로 맞춰요" : "바꾼 내용은 \"계획서에 반영하기\"를 누르면 계획서에 들어가요"}</small><button type="button" className={styles.primary} disabled={edit.busy || (amount ? won === null : !draftSubmission(fact.question, draft))} onClick={() => void (amount ? saveAmount() : save(draft))}>바꾸기</button></footer>
  </div>;
}
