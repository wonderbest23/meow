"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, ChevronLeft, FileText, LoaderCircle, PencilLine, RefreshCw, Sparkles } from "lucide-react";
import BusinessAppChrome from "../BusinessAppChrome";
import type { IntakeCommand, IntakePayload, IntakeSnapshot, IntakeValue } from "../../../lib/plan-builder/intake-types";
import { detailQuestions, structureQuestions, getIntakeQuestion } from "../../../lib/plan-builder/intake-questions";
import { subscribePlanOwnerChange } from "../../../lib/plan-builder/plan-store";
import { AnswerHistory, BusinessSummary, ChatSpeaker, ConversationHistory, EntryChoices, ExtractionReview, JobProgress, NextStepAction, QuestionForm, ReplyTyping } from "./intake-ui/IntakePanels";
import { useChatSplit } from "./useChatSplit";
import { useReplyTransition } from "./intake-ui/use-reply-transition";
import { intakeNextStep, customCandidateDraftKey, draftKey, emptyAnswer, emptyDraft, entryMessage, isConsultationText, needsEntryConfirmation, needsPolling, parseDraft, persistDraft, previewIntakeAnswer, readIntakePayload, routeComposerInput, seedAnswerDraft, settleDraft, shouldAcceptSnapshot, typedEntryCommand, unfinishedAnswerText, type IntakeDraft, type PendingRequest } from "./intake-ui/model";
import { readChatResponse } from "../../../lib/http/read-chat-response";
import styles from "./intake.module.css";
import chatUi from "../../../components/coach-chat-ui.module.css";

type SaveStatus = "saved" | "draft" | "saving" | "failed" | "conflict";
type CommandInput = Omit<IntakeCommand, "requestId" | "revision" | "planId">;
export type BusinessIntakeProps = {
  onPrepared?: (payload: IntakePayload) => void;
  onDesignComplete?: (snapshot: IntakeSnapshot) => void;
};
const HEADERS = { "x-business-intake": "2" };

function hasLocalInput(draft: IntakeDraft) {
  return !!draft.memo || !!draft.help || !!draft.introMessage || Object.values(draft.answers).some(answer => answer.text.length > 0 || answer.selected.length > 0);
}

export default function BusinessIntake(props: BusinessIntakeProps) {
  return <Suspense fallback={<div className={styles.loading} role="status">사업 정보를 불러오는 중입니다.</div>}><IntakeWorkspace {...props} /></Suspense>;
}

function IntakeWorkspace({ onPrepared, onDesignComplete }: BusinessIntakeProps) {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [savedPlan, setPlan] = useState<IntakeSnapshot | null>(null);
  const [preview, setPreview] = useState<IntakeSnapshot | null>(null);
  const plan = preview ?? savedPlan;
  // PC 분할: 질문에 답하는 동안은 대화가 넓고, 기본 질문이 끝나면 요약과 다음 단계 쪽이 넓어진다. 단계마다 마우스로 고친 너비를 따로 기억한다.
  const split = useChatSplit(plan?.coreComplete
    ? { key: "oneulstart:intake-split:complete", defaultShare: 42, minChatPx: 300, minSidePx: 300, maxShare: 75 }
    : { key: "oneulstart:intake-split:answering", defaultShare: 64, minChatPx: 300, minSidePx: 300, maxShare: 75 });
  const planRef = useRef<IntakeSnapshot | null>(null);
  const ownerScope = useRef<string | null>(null);
  const [ownerChanged, setOwnerChanged] = useState(false);
  const [intentPrompt, setIntentPrompt] = useState<{ text: string; questionId: string | null; revision: number; canAnswer: boolean } | null>(null);
  const [draft, setDraft] = useState<IntakeDraft>(emptyDraft);
  const draftRef = useRef<IntakeDraft>(draft);
  const memoryDrafts = useRef(new Map<string, IntakeDraft>());
  const storageKey = useRef(draftKey());
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [newEntry, setNewEntry] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const conflictRef = useRef(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [login, setLogin] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [view, setView] = useState<"input" | "summary">("input");
  const routeEpoch = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const inputPane = useRef<HTMLElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const currentTurn = useRef<HTMLDivElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const { turn: replyTurn, active: replyActive, begin: beginReply, finish: finishReply, reset: resetReply } = useReplyTransition();
  const manualScroll = useRef(false);
  const touchY = useRef(0);
  const lastDesign = useRef("");
  const completedCallback = useRef(onDesignComplete);
  completedCallback.current = onDesignComplete;

  const writeDraft = useCallback((next: IntakeDraft) => {
    const scoped = { ...next, ownerScope: ownerScope.current };
    draftRef.current = scoped;
    setDraft(scoped);
    if (!ownerScope.current) return false;
    const stored = persistDraft(storageKey.current, scoped, memoryDrafts.current, () => sessionStorage);
    setStorageError(!stored);
    return stored;
  }, []);
  const editDraft = (next: IntakeDraft) => {
    writeDraft(next);
    if (!busyRef.current && !draftRef.current.pending && !conflictRef.current) setStatus("draft");
  };
  const restoreDraft = useCallback((id: string | null, scope: string) => {
    ownerScope.current = scope;
    storageKey.current = draftKey(id, scope);
    let next = memoryDrafts.current.get(storageKey.current);
    if (!next || next.ownerScope !== scope) {
      try { next = parseDraft(sessionStorage.getItem(storageKey.current), id, scope); }
      catch { setStorageError(true); next = emptyDraft(); }
    }
    next.ownerScope = scope;
    draftRef.current = next; setDraft(next);
    conflictRef.current = !!next.pending?.conflict;
    setStatus(next.pending?.conflict ? "conflict" : next.pending ? "failed" : hasLocalInput(next) ? "draft" : "saved");
    if (next.pending) setError(next.pending.conflict ? "저장된 내용과 충돌했습니다. 입력은 이 기기에 남아 있어요." : "이전 요청의 저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.");
  }, []);

  const freezeForOwnerChange = useCallback(() => {
    routeEpoch.current += 1;
    resetReply();
    for (const controller of controllers.current) controller.abort();
    busyRef.current = false; setBusy(false); setLoaded(true);
    conflictRef.current = true; setOwnerChanged(true); setPreview(null); setStatus("conflict");
    setError("계정이 변경되어 저장을 멈췄어요. 이전 계정의 입력은 따로 보관했습니다. 현재 계정으로 다시 불러와 주세요.");
  }, [resetReply]);

  const updateUrl = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("planId", id); url.searchParams.delete("new");
    const target = `${url.pathname}${url.search}${url.hash}`;
    if (target === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    // Passing Next's internal history state bypasses its search-parameter update.
    window.history.replaceState(null, "", target);
  }, []);
  const installPlan = useCallback((incoming: IntakeSnapshot, force = false) => {
    if (!force && (conflictRef.current || !shouldAcceptSnapshot(planRef.current, incoming))) return;
    planRef.current = incoming; setPlan(incoming);
    const job = incoming.intake.job;
    if (job?.kind === "design" && job.status === "complete" && job.id !== lastDesign.current) {
      lastDesign.current = job.id;
      try { completedCallback.current?.(incoming); } catch { /* A parent navigation callback must not invalidate saved data. */ }
    }
  }, []);

  const getSnapshot = useCallback(async (id?: string | null, signal?: AbortSignal) => {
    const response = await fetch(`/api/plan/chat${id ? `?planId=${encodeURIComponent(id)}` : ""}`, { headers: HEADERS, cache: "no-store", signal });
    const value = readIntakePayload(await readChatResponse(response));
    if (!response.ok) throw new Error(value?.message || "사업 정보를 불러오지 못했어요. 다시 시도해 주세요.");
    if (!value || !value.enabled) throw new Error("새 입력 화면을 사용할 수 없습니다. 잠시 후 다시 불러와 주세요.");
    if (!value.ownerScope) throw new Error("계정별 저장 정보를 확인하지 못했어요. 입력을 전송하지 않고 보관합니다.");
    if (id && value.plan && value.plan.planId !== id) throw new Error("요청한 사업과 다른 응답을 받았습니다. 다시 불러와 주세요.");
    return value;
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(queryString);
    const id = query.get("planId");
    const startNew = query.get("new") === "1";
    if (!startNew && id && id === planRef.current?.planId) return;
    resetReply(); follow.current = true;
    const epoch = ++routeEpoch.current;
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
    const controller = new AbortController();
    controllers.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    setLoaded(false); setLoadFailed(false); setNewEntry(startNew); setError(""); setLogin(false); setPrepared(false); setConnectionError(false); setView("input"); setOwnerChanged(false);
    busyRef.current = false; setBusy(false); planRef.current = null; setPlan(null); setPreview(null); ownerScope.current = null; lastDesign.current = ""; setIntentPrompt(null);
    draftRef.current = emptyDraft(); setDraft(draftRef.current); conflictRef.current = false;
    void getSnapshot(startNew ? null : id, controller.signal).then(data => {
      if (epoch !== routeEpoch.current || controller.signal.aborted) return;
      restoreDraft(startNew ? null : data.plan?.planId ?? id, data.ownerScope!);
      if (!startNew && data.plan) {
        installPlan(data.plan, true); updateUrl(data.plan.planId);
      }
    }).catch(caught => {
      if (epoch !== routeEpoch.current) return;
      setLoadFailed(true); setError(controller.signal.aborted ? "불러오기가 지연되고 있어요. 다시 시도해 주세요." : caught instanceof Error ? caught.message : "사업 정보를 불러오지 못했어요.");
    }).finally(() => {
      window.clearTimeout(timeout); controllers.current.delete(controller);
      if (epoch === routeEpoch.current) setLoaded(true);
    });
    return () => { controller.abort(); window.clearTimeout(timeout); controllers.current.delete(controller); };
  }, [queryString, getSnapshot, installPlan, restoreDraft, updateUrl, resetReply]);

  useEffect(() => () => { routeEpoch.current += 1; for (const controller of controllers.current) controller.abort(); }, []);

  useEffect(() => subscribePlanOwnerChange(freezeForOwnerChange), [freezeForOwnerChange]);

  const polling = needsPolling(savedPlan);
  useEffect(() => {
    if (!loaded || !plan?.planId || !polling || status === "conflict") return;
    const id = plan.planId, epoch = routeEpoch.current;
    let cancelled = false, inFlight = false;
    let active: AbortController | null = null;
    const poll = async () => {
      if (cancelled || inFlight || conflictRef.current || document.visibilityState === "hidden") return;
      inFlight = true; active = new AbortController();
      const controller = active;
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const data = await getSnapshot(id, controller.signal);
        if (!cancelled && epoch === routeEpoch.current && !conflictRef.current) {
          if (data.ownerScope !== ownerScope.current) { freezeForOwnerChange(); return; }
          if (!data.plan) throw new Error("missing_plan");
          installPlan(data.plan); setConnectionError(false);
        }
      } catch { if (!cancelled && epoch === routeEpoch.current) setConnectionError(true); }
      finally { window.clearTimeout(timeout); inFlight = false; }
    };
    const timer = window.setInterval(() => void poll(), 2500);
    const visible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", visible);
    return () => { cancelled = true; active?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [loaded, savedPlan?.planId, polling, status === "conflict", getSnapshot, installPlan, freezeForOwnerChange]);

  const reload = async () => {
    if (busyRef.current) return;
    const epoch = routeEpoch.current;
    busyRef.current = true; setBusy(true);
    const controller = new AbortController(); controllers.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const id = planRef.current?.planId ?? new URLSearchParams(queryString).get("planId");
      const data = await getSnapshot(id, controller.signal);
      if (epoch !== routeEpoch.current) return;
      if (data.ownerScope !== ownerScope.current || ownerChanged) {
        restoreDraft(newEntry ? null : data.plan?.planId ?? id, data.ownerScope!);
        setOwnerChanged(false); setPreview(null); planRef.current = null; setPlan(null);
      } else if (!id && !newEntry && data.plan) restoreDraft(data.plan.planId, data.ownerScope!);
      if (!data.plan && !newEntry && id) {
        setLoaded(true); setLoadFailed(false); setError("현재 계정에서 이 사업을 찾을 수 없습니다. 이전 계정의 입력은 별도로 보관되어 있어요."); return;
      }
      if (conflictRef.current) { writeDraft({ ...draftRef.current, pending: null }); conflictRef.current = false; }
      if (!newEntry && data.plan) { installPlan(data.plan, true); updateUrl(data.plan.planId); }
      setStatus(draftRef.current.pending ? "failed" : hasLocalInput(draftRef.current) ? "draft" : "saved");
      setError(draftRef.current.pending ? "확인하지 못한 저장 요청이 있어요. 같은 요청으로 재시도해 주세요." : ""); setConnectionError(false); setLoadFailed(false); setLoaded(true);
    } catch (caught) { if (epoch === routeEpoch.current) setError(caught instanceof Error && !controller.signal.aborted ? caught.message : "사업 정보를 불러오지 못했어요. 입력은 그대로 남아 있어요."); }
    finally { window.clearTimeout(timeout); controllers.current.delete(controller); if (epoch === routeEpoch.current) { busyRef.current = false; setBusy(false); } }
  };

  async function send(input?: CommandInput, captured?: Pick<PendingRequest, "answer" | "text" | "intro" | "composer">) {
    if (!loaded || loadFailed || busyRef.current || replyActive.current || conflictRef.current || !ownerScope.current || input && draftRef.current.pending) return;
    const existing = draftRef.current.pending;
    if (!input && !existing) return;
    if (input?.action !== "start" && !existing && !planRef.current) return;
    const pending: PendingRequest = existing ?? { command: { ...input!, requestId: crypto.randomUUID(), revision: planRef.current?.coach.revision ?? 0, ...(planRef.current ? { planId: planRef.current.planId } : {}) }, ...captured };
    let optimistic: IntakeSnapshot | null = null;
    try { if (planRef.current) optimistic = previewIntakeAnswer(planRef.current, pending.command); }
    catch (caught) { setStatus("failed"); setError(caught instanceof Error ? caught.message : "답변 형식을 확인해 주세요."); return; }
    const epoch = routeEpoch.current;
    let saved = false;
    if (["start", "answer", "details"].includes(pending.command.action)) {
      const initialText = pending.command.action === "start" ? pending.command.message ?? (typeof pending.command.value === "string" ? pending.command.value : { exploring: "아이디어를 찾고 있어요", startup: "생각한 사업이 있어요", operating: "사업을 운영 중이에요" }[pending.command.mode ?? "startup"]) : null;
      beginReply(pending.command.requestId, initialText);
    }
    busyRef.current = true; setBusy(true); setStatus("saving"); setError(""); setLogin(false);
    writeDraft({ ...draftRef.current, pending, ...(optimistic ? { editingId: null } : {}) });
    setPreview(optimistic);
    follow.current = true; manualScroll.current = false;
    const controller = new AbortController(); controllers.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const identity = await getSnapshot(pending.command.planId, controller.signal);
      if (epoch !== routeEpoch.current) return;
      if (identity.ownerScope !== ownerScope.current) { freezeForOwnerChange(); return; }
      const response = await fetch("/api/plan/chat", { method: "POST", headers: { ...HEADERS, "Content-Type": "application/json", "x-business-intake-owner": ownerScope.current! }, body: JSON.stringify(pending.command), signal: controller.signal });
      let data: IntakePayload | null = null;
      try { data = readIntakePayload(await readChatResponse(response)); } catch { /* A lost response must retain its original idempotency key. */ }
      if (epoch !== routeEpoch.current) return;
      if (data?.code === "owner_changed" || data?.ownerScope && data.ownerScope !== ownerScope.current) { freezeForOwnerChange(); return; }
      if (response.status === 409) {
        conflictRef.current = true; writeDraft({ ...draftRef.current, pending: { ...pending, conflict: true }, ...(pending.command.questionId ? { editingId: customCandidateDraftKey(pending.command.questionId, pending.answer?.custom) } : {}) });
        setStatus("conflict"); setError(data?.message || "다른 곳에서 이 사업의 내용이 바뀌었어요. 최신 내용을 불러온 뒤 답변을 다시 확인해 주세요."); return;
      }
      if (!response.ok || data?.login) {
        setLogin(!!data?.login || response.status === 401);
        if (response.status >= 400 && response.status < 500 || data?.code && ["ai_unavailable", "ai_limit", "business_required", "disabled"].includes(data.code)) writeDraft({ ...draftRef.current, pending: null });
        if (data?.login && data.plan && data.plan.planId === planRef.current?.planId) installPlan(data.plan);
        const aiUnavailable = ["help", "design", "extract", "extract-pending"].includes(pending.command.action) && !!data?.code && ["ai_unavailable", "ai_limit", "business_required"].includes(data.code);
        setStatus(aiUnavailable ? hasLocalInput(draftRef.current) ? "draft" : "saved" : "failed"); setError(data?.message || "요청을 처리하지 못했어요. 입력은 그대로 남아 있어요."); return;
      }
      if (!data?.plan || !data.enabled || pending.command.planId && data.plan.planId !== pending.command.planId) throw new Error("저장 응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.");
      const settled = settleDraft(draftRef.current, pending);
      const previousKey = storageKey.current;
      storageKey.current = draftKey(data.plan.planId, ownerScope.current);
      const stored = writeDraft(settled);
      if (stored && previousKey !== storageKey.current) {
        memoryDrafts.current.delete(previousKey);
        try { sessionStorage.removeItem(previousKey); } catch { /* A stale backup can only replay the same idempotent start request. */ }
      }
      installPlan(data.plan); updateUrl(data.plan.planId); setNewEntry(false);
      saved = true;
      setIntentPrompt(null);
      setStatus(hasLocalInput(settled) ? "draft" : "saved");
      if (pending.command.action === "prepare" && data.started) { setPrepared(true); try { onPrepared?.(data); } catch { /* The saved document workflow is independent of parent navigation. */ } }
      if (pending.command.action === "details") { writeDraft({ ...draftRef.current, mode: "answer", editingId: null }); setView("input"); }
    } catch (caught) {
      if (epoch === routeEpoch.current) { setStatus("failed"); setError(caught instanceof Error && !controller.signal.aborted ? caught.message : "저장 결과를 확인하지 못했어요. 입력을 보관했으니 같은 요청으로 다시 시도해 주세요."); }
    } finally {
      window.clearTimeout(timeout); controllers.current.delete(controller);
      if (epoch === routeEpoch.current) { setPreview(null); busyRef.current = false; setBusy(false); finishReply(pending.command.requestId, saved); }
    }
  }

  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!loaded || !savedPlan || !draft.introMessage || busy || replyTurn || draft.pending || status === "failed" || status === "conflict" || ownerChanged || loadFailed) return;
    void sendRef.current({ action: "note", message: draft.introMessage, noteIntent: isConsultationText(draft.introMessage) ? "question" : "memo" }, { text: draft.introMessage });
  }, [loaded, savedPlan, draft.introMessage, busy, replyTurn, draft.pending, status, ownerChanged, loadFailed]);

  const focusQuestion = () => { follow.current = true; window.requestAnimationFrame(() => inputPane.current?.querySelector<HTMLElement>("#intake-question-heading")?.focus({ preventScroll: true })); };
  const editQuestion = (id: string) => {
    if (busyRef.current || replyActive.current) return;
    const snapshot = planRef.current;
    if (!snapshot) return;
    const question = snapshot.questions.find(item => item.id === id) ?? getIntakeQuestion("startup", snapshot.intake.sector, id, snapshot.structure?.values);
    if (!question) { setError("현재 사업에서 수정할 수 없는 질문입니다. 최신 내용을 불러와 주세요."); return; }
    const existing = draftRef.current.answers[id];
    const answer = snapshot.intake.answers[id];
    const fieldValue = snapshot.coach.fields.find(field => field.key === question.fieldKey)?.value;
    const value = answer?.status === "unknown" ? null : answer?.value ?? fieldValue ?? null;
    // Seed rules (spec §6 Phase 2): chips restore only values the current options know; prose numbers become an empty value with the original as a hint.
    const seeded = existing ?? seedAnswerDraft(question, value, snapshot.candidateIdeas);
    writeDraft({ ...draftRef.current, mode: "answer", editingId: id, answers: { ...draftRef.current.answers, [id]: seeded } });
    setView("input"); focusQuestion();
  };
  const keepDraftAsMemo = (id: string) => {
    const answer = draftRef.current.answers[id];
    if (!answer) return;
    const content = answer.text || answer.selected.join(", ");
    writeDraft({ ...draftRef.current, editingId: null, mode: "memo", memo: [draftRef.current.memo, `${answer.label || "이전 질문 답변"}\n${content}`].filter(Boolean).join("\n\n") });
    setView("input");
  };
  const question = plan ? draft.editingId ? plan.questions.find(item => item.id === draft.editingId) ?? getIntakeQuestion("startup", plan.intake.sector, draft.editingId, plan.structure?.values) : plan.nextQuestion : null;
  const questionDraft = question ? draft.answers[question.id] ?? emptyAnswer() : emptyAnswer();
  const blocked = busy || !!replyTurn || !!draft.pending || status === "conflict" || loadFailed || ownerChanged;
  const aiBusy = ["queued", "running"].includes(plan?.intake.job?.status ?? "");
  const job = plan?.intake.job;
  const loginHref = `/account?next=${encodeURIComponent(`/plan/chat${plan ? `?planId=${encodeURIComponent(plan.planId)}` : "?new=1"}`)}`;
  const saveLabel = !plan && newEntry && status === "saved" ? "시작 전" : { saved: "저장됨", draft: "입력 중 · 이 기기에 보관", saving: "저장 중", failed: "저장 실패", conflict: "저장 충돌" }[status];
  const choiceQuestion = !!question && !questionDraft.custom && ["single", "multi"].includes(question.kind);
  const directAnswer = !!plan && draft.mode === "answer" && !!question && !choiceQuestion;
  const composerText = directAnswer ? questionDraft.text : draft.mode === "help" ? draft.help : draft.memo;
  const selectedAnswer = draft.mode === "answer" && choiceQuestion && !composerText.trim() ? questionDraft.selected : [];
  const unfinishedText = directAnswer && !!question?.options?.length && question.kind === "text" && !!composerText.trim() && unfinishedAnswerText(composerText);
  const sendLabel = "보내기";
  const captureComposer = (): PendingRequest["composer"] => ({ text: composerText, mode: draft.mode, ...(directAnswer && question ? { questionId: question.id } : {}) });
  const liveIntent = intentPrompt && intentPrompt.text === composerText && intentPrompt.questionId === (question?.id ?? null) && intentPrompt.revision === plan?.coach.revision ? intentPrompt : null;
  const intentConfirmation = liveIntent && <section className={styles.intentPrompt} aria-label="입력 내용 확인"><ChatSpeaker /><p>이 내용은 어떻게 남길까요?</p><div className={styles.intentActions}>
    {liveIntent.canAnswer && question && <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={() => void send({ action: "answer", questionId: question.id === "candidate" && questionDraft.custom ? "business" : question.id, value: liveIntent.text }, { answer: questionDraft, composer: captureComposer() })}>{question.label} 답변으로 저장</button>}
    <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={() => storeComposerNote("question")}>질문으로 남기기</button>
    <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={() => storeComposerNote("memo")}>메모로 남기기</button>
  </div></section>;
  const lastMessage = plan?.coach.messages.filter(message => message.role === "user").at(-1);
  const questionNote = lastMessage && plan?.intake.notes.find(note => note.intent === "question" && note.id === `${lastMessage.id}:0`);
  const questionHandled = !!questionNote && job?.kind === "help" && job.request === lastMessage?.text;
  const memoPending = plan?.intake.notes.some(note => note.status === "failed" || note.status === "queued" || note.status === "stored" && note.intent === "memo");
  const startFromCard = (mode: "exploring" | "startup" | "operating") => {
    const text = entryMessage(draftRef.current);
    void send({ action: "start", mode, ...(text ? { message: text, noteIntent: isConsultationText(text) ? "question" as const : "memo" as const } : {}) }, { text: draftRef.current.memo, intro: draftRef.current.introMessage });
  };
  const storeComposerNote = (intent: "memo" | "question") => {
    if (!composerText.trim()) return;
    follow.current = true;
    void send({ action: "note", message: composerText.trim(), noteIntent: intent }, { composer: captureComposer() });
  };
  const answerQuestion = (value: IntakeValue, unknown = false, questionId = question?.id, extra?: { ksic?: string }) => {
    if (!questionId || !question) return;
    follow.current = true;
    void send({ action: "answer", questionId, value, ...(unknown ? { unknown: true } : {}), ...(extra?.ksic ? { ksic: extra.ksic } : {}) }, { answer: draftRef.current.answers[question.id] ?? emptyAnswer() });
  };
  const submitComposer = () => {
    if (blocked || !loaded || unfinishedText) return;
    if (!plan) {
      const text = entryMessage(draftRef.current);
      if (text.length > 1200) { setError("처음 사업 설명은 1,200자 이내로 나눠 보내 주세요. 입력한 내용은 그대로 보관했어요."); return; }
      if (text && needsEntryConfirmation(text)) {
        editDraft({ ...draftRef.current, memo: "", introMessage: text });
        follow.current = true;
      } else if (text) void send(typedEntryCommand(text), { text: draftRef.current.memo, intro: draftRef.current.introMessage });
      return;
    }
    if (!composerText.trim()) { if (selectedAnswer.length) answerQuestion(question?.kind === "multi" ? selectedAnswer : selectedAnswer[0]); return; }
    const target = question?.id === "candidate" && questionDraft.custom ? getIntakeQuestion("startup", plan.intake.sector, "business", plan.structure?.values) ?? null : question;
    const route = routeComposerInput(plan, target ?? null, composerText);
    if (route.kind === "clarify") { setIntentPrompt({ text: composerText, questionId: question?.id ?? null, revision: plan.coach.revision, canAnswer: route.canAnswer }); follow.current = true; return; }
    if (route.kind === "note") { storeComposerNote(route.intent); return; }
    void send({ action: "answer", questionId: route.questionId, value: route.value, ...(route.unknown ? { unknown: true } : {}) }, { answer: questionDraft, composer: captureComposer() });
  };
  const scrollToCurrent = useCallback(() => {
    const container = conversation.current;
    if (!container) return;
    const messages = container.querySelectorAll<HTMLElement>('[data-coach-message="user"]');
    const target = draftRef.current.editingId ? currentTurn.current : messages[messages.length - 1] ?? currentTurn.current;
    if (!target) return;
    const box = target.getBoundingClientRect();
    // Keep the last answer above the new question, including the end of long answers.
    const visibleAnswer = Math.min(box.height, Math.max(80, container.clientHeight * .35));
    const top = container.scrollTop + box.bottom - visibleAnswer - container.getBoundingClientRect().top - 16;
    manualScroll.current = false;
    container.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    setUnseen(false);
  }, []);
  useEffect(() => {
    if (follow.current) { const frame = requestAnimationFrame(scrollToCurrent); return () => cancelAnimationFrame(frame); }
    setUnseen(true);
  }, [plan?.planId, plan?.coach.messages.length, question?.id, draft.editingId, draft.introMessage, replyTurn, view, intentPrompt, scrollToCurrent]);
  useEffect(() => {
    const container = conversation.current;
    if (!container) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      if (follow.current) frame = requestAnimationFrame(scrollToCurrent);
    });
    observer.observe(container);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [scrollToCurrent]);
  useEffect(() => {
    const input = composerInput.current;
    if (input) { input.style.height = "auto"; input.style.height = `${Math.min(128, input.scrollHeight)}px`; }
  }, [composerText, view]);

  // 마지막 정리 화면이 보일 때는 진행 게이지를 방금 누른 '다음 단계' 자리에 보여 준다(그 밖에는 대화 흐름의 작업 상태 자리).
  const showCompletion = !!plan && !replyTurn && !intentConfirmation && !question && !draft.editingId;
  const nextStep = plan ? intakeNextStep(plan, prepared) : null;
  // 상세 질문 추가는 다음 단계 버튼과 같은 줄에 놓인다(다음 단계가 아직 없으면 단독으로).
  const detailsButton = plan && !plan.intake.detailsRequested && plan.coreComplete ? <button type="button" className={styles.secondaryButton} disabled={blocked || aiBusy} onClick={() => void send({ action: "details" })}>상세 질문 {structureQuestions(plan.intake.mode, plan.structure?.values).length + detailQuestions(plan.intake.sector).length}개 추가</button> : undefined;
  return <div className={`${styles.page} ${chatUi.theme}`}><BusinessAppChrome title={!plan && newEntry ? "새 대화" : "사업 기획"} active={newEntry ? "new" : "chat"} backHref="/plan/planning" workspaceHref={plan ? `/plan/workspace?planId=${encodeURIComponent(plan.planId)}` : undefined} subtitle={plan ? `질문 ${plan.coreAnswered}/${plan.coreTotal}` : undefined} actions={plan && (plan.coreAnswered > 0 || plan.coach.fields.length > 0) ? <button type="button" className={styles.summaryToggle} aria-label={`사업 요약${plan.coreAnswered > 0 ? ` (답변 ${plan.coreAnswered}개)` : ""}`} aria-controls="intake-summary-panel" aria-expanded={view === "summary"} onClick={() => setView(view === "summary" ? "input" : "summary")}><FileText size={17} aria-hidden="true" /><span aria-hidden="true">요약</span>{plan.coreAnswered > 0 && <b aria-hidden="true">{plan.coreAnswered}</b>}</button> : undefined}>
    {plan && <>
      <div className={styles.progressLine} aria-hidden="true"><span style={{ width: `${plan.coreTotal ? Math.round(plan.coreAnswered / plan.coreTotal * 100) : 0}%` }} /></div>
      <div className={!loaded || status === "saving" || status === "failed" || status === "conflict" ? styles.statusLine : styles.srOnly} data-status={status} role="status" aria-live="polite">{status === "failed" || status === "conflict" ? <AlertCircle size={15} aria-hidden="true" /> : !loaded || status === "saving" ? <LoaderCircle className={styles.spinner} size={15} aria-hidden="true" /> : null}{loaded ? saveLabel : "불러오는 중"}</div>
    </>}
    {(error || connectionError || storageError) && <div className={styles.notices}>
      {error && <div className={styles.notice} role="alert"><p>{error}</p><div className={styles.noticeActions}>{status === "conflict" || loadFailed ? <button type="button" disabled={busy} onClick={() => void reload()}><RefreshCw size={16} aria-hidden="true" />최신 내용 불러오기</button> : draft.pending && <button type="button" disabled={busy} onClick={() => void send()}><RefreshCw size={16} aria-hidden="true" />같은 요청 다시 확인</button>}{login && <Link href={loginHref}>로그인하고 이어가기<ArrowRight size={16} aria-hidden="true" /></Link>}</div></div>}
      {connectionError && <div className={styles.notice} role="status"><p>정리 상태를 갱신하지 못했어요. 입력은 계속할 수 있습니다.</p><button type="button" disabled={busy} onClick={() => void reload()}><RefreshCw size={16} aria-hidden="true" />상태 새로고침</button></div>}
      {storageError && <p className={styles.notice} role="status">이 기기에 임시 저장하지 못했어요. 서버에 저장하기 전에는 이 화면을 닫지 말아 주세요.</p>}
    </div>}
    <div ref={split.ref} style={plan ? split.style : undefined} className={`${styles.workspace} ${plan ? styles.withSummary : ""} ${split.dragging ? styles.resizing : ""}`}>
      <main ref={inputPane} id="intake-input-panel" aria-label="사업 기획 대화" className={`${styles.inputPane} ${view !== "input" ? styles.mobileHidden : ""}`}>
        <div ref={conversation} data-intake-conversation className={styles.conversation}
          onWheel={event => { manualScroll.current = true; if (event.deltaY < 0) follow.current = false; }}
          onTouchStart={event => { touchY.current = event.touches[0]?.clientY ?? 0; }}
          onTouchMove={event => { manualScroll.current = true; if ((event.touches[0]?.clientY ?? 0) > touchY.current) follow.current = false; touchY.current = event.touches[0]?.clientY ?? 0; }}
          onPointerDown={event => { if (event.target === event.currentTarget) manualScroll.current = true; }}
          onKeyDown={event => { if (["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) { manualScroll.current = true; if (["PageUp", "Home", "ArrowUp"].includes(event.key)) follow.current = false; } }}
          onScroll={event => { if (!manualScroll.current) return; const node = event.currentTarget; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; if (follow.current) setUnseen(false); }}><div className={styles.inputContent}>
          {!loaded ? <p className={styles.loading} role="status"><LoaderCircle size={21} className={styles.spinner} aria-hidden="true" />사업 정보를 불러오는 중입니다.</p> : !plan ? replyTurn ? <><div className={styles.assistantMessage}><ChatSpeaker /><p>어떤 사업을 생각하고 계세요?</p></div><article className={styles.userMessage} data-coach-message="user"><p>{replyTurn.initialText}</p></article><div ref={currentTurn}><ReplyTyping /></div></> : newEntry ? <EntryChoices disabled={blocked} initialMessage={draft.introMessage} onStart={startFromCard} /> : !loadFailed && <section className={styles.empty}><h1>저장한 사업이 없습니다</h1><Link href="/plan/chat?new=1" className={styles.primaryButton}>새 사업 기획<ArrowRight size={18} aria-hidden="true" /></Link><Link href="/plan" className={styles.textLink}>내 사업으로</Link></section> : <>
            <ConversationHistory snapshot={plan} onEdit={editQuestion} />
            {job && <section className={styles.job} aria-label="AI 작업 상태">{aiBusy && !showCompletion && job.kind !== "design" && <JobProgress snapshot={plan} announce />}{job.status === "failed" && <div className={styles.error} role="alert"><p>{job.error || "AI 작업을 완료하지 못했어요."}</p><p>저장한 답변과 메모는 그대로 남아 있습니다.</p><button type="button" className={styles.textButton} disabled={blocked} onClick={() => void send(job.kind === "extract" ? { action: "extract" } : job.kind === "design" ? { action: "design" } : { action: "help", message: job.request || draft.help })}><RefreshCw size={16} aria-hidden="true" />다시 요청</button></div>}{job.status === "complete" && job.reply && !plan.coach.messages.some(message => message.id === `${job.id}:reply`) && <div className={styles.aiReply}><h3>{job.kind === "design" ? "AI 사업안 · 제안" : job.kind === "help" ? "AI 답변" : "메모 정리 결과"}</h3><p>{job.reply}</p></div>}</section>}
            <ExtractionReview key={plan.planId} snapshot={plan} disabled={blocked} onCommand={command => void send(command)} />
            {questionNote && !questionHandled && <section className={styles.noteReceipt} aria-label="저장한 질문"><p>질문을 저장했어요</p><button type="button" className={styles.secondaryButton} disabled={blocked || aiBusy} onClick={() => void send({ action: "help", message: lastMessage!.text })}><Sparkles size={16} aria-hidden="true" />AI 답변 받기</button></section>}
            {memoPending && <button type="button" className={styles.textButton} disabled={blocked || aiBusy} onClick={() => void send({ action: "extract" })}><RefreshCw size={15} aria-hidden="true" />저장한 메모 정리</button>}
            <div ref={currentTurn} className={styles.currentTurn} aria-busy={!!replyTurn}>
              {replyTurn ? <ReplyTyping /> : intentConfirmation || (question ? <QuestionForm key={`${question.id}:${draft.editingId ?? "current"}`} inChat question={question} snapshot={plan} draft={questionDraft} editing={!!draft.editingId} disabled={blocked} onChange={answer => editDraft({ ...draftRef.current, mode: "answer", answers: { ...draftRef.current.answers, [question.id]: { ...answer, label: question.label } } })} onAnswer={answerQuestion} onCancel={() => { follow.current = true; writeDraft({ ...draftRef.current, editingId: null }); }} /> : draft.editingId ? <section className={styles.complete}><h2>이전 질문의 입력이 남아 있어요</h2><p>현재 사업 정보에 맞춰 질문 구성이 달라졌습니다.</p><button type="button" className={styles.secondaryButton} onClick={() => writeDraft({ ...draftRef.current, editingId: null })}>현재 질문으로</button></section> : <section className={styles.complete}><ChatSpeaker /><h2>이야기해 주신 내용을 정리했어요</h2><p>요약을 확인했다면 다음 단계로 넘어가세요</p><button type="button" className={styles.editLink} onClick={() => setView("summary")}><PencilLine size={14} aria-hidden="true" />답변 수정하기</button><NextStepAction snapshot={plan} prepared={prepared} disabled={blocked} aiBusy={aiBusy} announce onDesign={() => void send({ action: "design" })} onPrepare={() => void send({ action: "prepare" })} secondary={detailsButton} />{!nextStep && detailsButton}</section>)}
            </div>
          </>}
          {plan && draft.introMessage && <div className={styles.introMessage}><article className={styles.userMessage} data-coach-message="user"><p>{draft.introMessage}</p></article><p className={styles.messageStatus}>이 기기에 보관 중</p></div>}
        </div></div>
        {unseen && <button type="button" className={styles.newMessage} onClick={() => { follow.current = true; scrollToCurrent(); }}><ArrowDown size={15} aria-hidden="true" />이어서 대화하기</button>}
        {(plan || newEntry) && <footer className={styles.composer} aria-label="대화 입력창">
          <form className={styles.composerShell} onSubmit={event => { event.preventDefault(); submitComposer(); }}>
            {directAnswer && <div className={styles.composerContext}>{draft.editingId ? "답변 수정 · " : ""}{question?.label}{question?.unit && <span>{question.unit}{question.period ? ` · ${question.period}` : ""}</span>}</div>}
            {selectedAnswer.length > 0 && <div className={styles.composerContext}>선택한 답변 {selectedAnswer.length}개<span>{question?.kind === "multi" ? "여러 개 선택 가능" : ""}</span></div>}
            <div className={styles.composerRow}>
              <textarea ref={composerInput} id={directAnswer ? `intake-answer-${question!.id}` : "intake-memo"} aria-label="대화 내용" placeholder={replyTurn ? "다음 질문을 준비하고 있어요" : !plan ? "생각을 들려주세요" : "답변이나 궁금한 점을 적어 주세요"} readOnly={!!replyTurn} disabled={!loaded || loadFailed || ownerChanged} rows={1} enterKeyHint="send" maxLength={1200} value={composerText} onChange={event => {
                setIntentPrompt(null);
                if (directAnswer && question) editDraft({ ...draftRef.current, answers: { ...draftRef.current.answers, [question.id]: { ...questionDraft, text: event.target.value, label: question.label } } });
                else editDraft({ ...draftRef.current, [draft.mode === "help" ? "help" : "memo"]: event.target.value });
              }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); submitComposer(); } }} />
              <button type="submit" className={styles.sendButton} aria-label={sendLabel} title={sendLabel} disabled={!loaded || blocked || unfinishedText || !(plan ? composerText.trim() || selectedAnswer.length : entryMessage(draft))}>{busy || replyTurn ? <LoaderCircle size={20} className={styles.spinner} /> : <ArrowUp size={21} />}</button>
            </div>
          </form>
        </footer>}
      </main>
      {plan && <div {...split.separator} aria-controls="intake-input-panel" className={styles.splitHandle} title="드래그해서 너비 조절 · 두 번 누르면 기본 너비"><span /></div>}
      {plan && <aside id="intake-summary-panel" aria-labelledby="intake-summary-heading" className={`${styles.summaryPane} ${view !== "summary" ? styles.mobileHidden : ""}`}><div className={styles.summarySheetHeader}><button type="button" onClick={() => setView("input")}><ChevronLeft size={18} aria-hidden="true" />대화로 돌아가기</button></div><BusinessSummary snapshot={plan} showActions={!showCompletion} disabled={blocked} onStructure={patch => void send({ action: "structure", structure: patch })} aiBusy={aiBusy} prepared={prepared} onEdit={editQuestion} onDetails={() => void send({ action: "details" })} onDesign={() => void send({ action: "design" })} onPrepare={() => void send({ action: "prepare" })} /><AnswerHistory snapshot={plan} drafts={draft.answers} onEdit={editQuestion} onKeepAsMemo={keepDraftAsMemo} /></aside>}
    </div>
  </BusinessAppChrome></div>;
}
