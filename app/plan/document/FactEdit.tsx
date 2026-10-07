"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { IntakeSnapshot, IntakeValue } from "../../../lib/plan-builder/intake-types";
import type { IntakeQuestion } from "../../../lib/plan-builder/intake-questions";
import { EDITABLE_FACT_IDS, factNeedles, findFactRanges, type EditableFact } from "../../../lib/plan-builder/fact-highlight";
import { readChatResponse } from "../../../lib/http/read-chat-response";
import { QuestionForm, RewriteCost } from "../chat/intake-ui/IntakePanels";
import { choiceDraftSubmission, emptyAnswer, incompleteChoiceText, readIntakePayload, summaryAnswerText, type AnswerDraft } from "../chat/intake-ui/model";
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
    const ranges = findFactRanges(text, facts);
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
  return root.innerHTML;
}

/** The intake snapshot behind a document, and the two writes the document may make: change one answer, re-apply the plan. */
export function useFactEdit(planId: string | null, active: boolean) {
  const [snapshot, setSnapshot] = useState<IntakeSnapshot | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; href?: string; label?: string } | null>(null);
  const load = useCallback(async () => {
    if (!planId) return;
    try {
      const response = await fetch(`/api/plan/chat?planId=${encodeURIComponent(planId)}`, { headers: HEADERS, cache: "no-store" });
      const value = readIntakePayload(await readChatResponse(response));
      if (!response.ok || !value?.plan || value.plan.planId !== planId || !value.ownerScope) throw new Error(value?.message || "사업 정보를 불러오지 못했어요.");
      setSnapshot(value.plan); setOwner(value.ownerScope); setError(null);
    } catch (caught) { setError({ message: caught instanceof Error ? caught.message : "사업 정보를 불러오지 못했어요." }); }
  }, [planId]);
  useEffect(() => { if (active) void load(); }, [active, load]);
  const post = useCallback(async (command: Record<string, unknown>) => {
    if (!snapshot || !owner || !planId) return null;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/plan/chat", { method: "POST", headers: { ...HEADERS, "Content-Type": "application/json", "x-business-intake-owner": owner }, body: JSON.stringify({ planId, revision: snapshot.coach.revision, requestId: crypto.randomUUID(), ...command }) });
      const data = await readChatResponse(response) as { plan?: IntakeSnapshot; message?: string; code?: string; login?: boolean } | null;
      if (response.status === 409) { await load(); setError({ message: "다른 곳에서 먼저 바뀐 내용이 있어요. 최신 내용으로 다시 불러왔어요." }); return null; }
      if (response.status === 402) { setError({ message: data?.message || "다시 쓰기 횟수가 모자라요.", href: `/plan/pay?planId=${encodeURIComponent(planId)}&planType=${encodeURIComponent(snapshot.planType)}&product=regen`, label: "횟수 추가하기" }); return null; }
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

/** The card above the document: every editable fact as a chip, plus "계획서에 반영하기" once something changed. */
export function FactCard({ edit, onPick, onReflect }: { edit: ReturnType<typeof useFactEdit>; onPick: (questionId: string, anchor: DOMRect) => void; onReflect: () => void }) {
  const stale = edit.snapshot?.documentStatus === "stale";
  return <section className={styles.factCard} aria-label="고칠 수 있는 내용" data-fact-card>
    <strong>고칠 수 있는 곳만 표시했어요</strong>
    {!edit.snapshot && !edit.error && <p>사업 정보를 불러오고 있어요…</p>}
    {edit.facts.length > 0 && <div className={styles.factChips}>{edit.facts.map(fact => <button key={fact.questionId} type="button" data-fact-chip={fact.questionId} disabled={edit.busy} onClick={event => onPick(fact.questionId, event.currentTarget.getBoundingClientRect())}><small>{fact.label}</small>{fact.display}</button>)}</div>}
    <p>노란 부분을 누르면 고칠 수 있어요. 여러 곳을 고친 뒤 한 번에 계획서에 반영해요.</p>
    {stale && edit.snapshot && <div className={styles.factReflect} data-fact-reflect>
      <div><b>고친 내용이 아직 계획서에 반영되지 않았어요</b><RewriteCost snapshot={edit.snapshot} /></div>
      <button type="button" className={styles.primary} disabled={edit.busy} onClick={onReflect}>계획서에 반영하기</button>
    </div>}
    {edit.error && <p className={styles.factError} role="alert">{edit.error.message} {edit.error.href && <Link href={edit.error.href}>{edit.error.label}</Link>}</p>}
  </section>;
}

/** Small editor next to a fact: the intake question in coach-chat form; a finished pick saves at once. */
export function FactPopover({ edit, questionId, anchor, onClose, onSaved }: { edit: ReturnType<typeof useFactEdit>; questionId: string; anchor: DOMRect; onClose: () => void; onSaved: () => void }) {
  const fact = edit.facts.find(item => item.questionId === questionId);
  // Start empty: a fact edit replaces the answer, it does not add to it. The current value is shown in the header.
  const [draft, setDraft] = useState<AnswerDraft>(emptyAnswer);
  const box = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: anchor.bottom + 8, left: anchor.left });
  useLayoutEffect(() => {
    const height = box.current?.offsetHeight ?? 320, width = box.current?.offsetWidth ?? 380;
    const top = anchor.bottom + 8 + height > innerHeight - 12 ? Math.max(12, anchor.top - height - 8) : anchor.bottom + 8;
    setPosition({ top, left: Math.max(12, Math.min(anchor.left, innerWidth - width - 12)) });
  }, [anchor]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [onClose]);
  if (!fact || !edit.snapshot) return null;
  const save = async (value: AnswerDraft) => {
    const submission = draftSubmission(fact.question, value);
    if (!submission) return;
    const result = await edit.post({ action: "answer", questionId: fact.questionId, value: submission.value, ...(submission.unknown ? { unknown: true } : {}), ...(submission.ksic ? { ksic: submission.ksic } : {}) });
    if (result) onSaved();
  };
  return <div ref={box} className={styles.factPopover} style={{ top: position.top, left: position.left }} role="dialog" aria-label={`${fact.label} 바꾸기`} data-fact-popover>
    <header><div><b>{fact.label} 바꾸기</b><small>지금: {fact.display}</small></div><button type="button" aria-label="닫기" onClick={onClose}><X size={16} /></button></header>
    <div className={`${intake.page} ${intake.factScope}`} data-coach>
      <QuestionForm question={fact.question} snapshot={edit.snapshot} draft={draft} editing={false} disabled={edit.busy} inChat coach
        onChange={(answer, submit) => { setDraft(answer); if (submit) void save(answer); }}
        onAnswer={value => void save({ ...emptyAnswer(), text: String(value ?? "") })} onCancel={onClose} />
    </div>
    <footer><small>바꾸면 계획서에 반영하기 전까지 기존 문서는 그대로예요</small><button type="button" className={styles.primary} disabled={edit.busy || !draftSubmission(fact.question, draft)} onClick={() => void save(draft)}>바꾸기</button></footer>
  </div>;
}
