"use client";
import PlanLoading from "../PlanLoading";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, ChevronRight, Paperclip, FileCheck2, Check } from "lucide-react";
import { useChatSplit } from "./useChatSplit";
import { readCoach, type CoachField, type CoachState } from "../../../lib/plan-builder/coach";
import type { BriefPatch } from "./BriefEditor";
import type { CoachJob } from "../../../lib/plan-builder/coach-job-types";
import { changedCoachFields } from "../../../lib/plan-builder/coach-presentation";
import { hydrateFromServer, setActivePlan } from "../../../lib/plan-builder/plan-store";
import BusinessBrief from "./BusinessBrief";
import BusinessAppChrome from "../BusinessAppChrome";
import { workspaceHref } from "../../../lib/plan-builder/business-hub";
import styles from "./page.module.css";

type Snapshot = { planId: string; title: string; planType: string; updatedAt?: string; coach: CoachState; completed: string[]; total: number; hasDocuments?: boolean; manualReview?: string[]; job?: CoachJob | null; generation: { keys?: string[]; revision?: number; runId?: string } | null };
type Payload = { plan?: Snapshot | null; message?: string; login?: boolean; authenticated?: boolean; paid?: boolean; runStatus?: string | null };
const ENTRY_OPTIONS = ["아이디어가 없어요", "생각한 사업이 있어요", "사업을 운영 중이에요"];
const PHASES = { queued: "요청을 접수했어요", understanding: "말씀하신 내용을 살펴보고 있어요", designing: "상품과 운영 방법을 정리하고 있어요", saving: "사업안을 저장하고 있어요" };
const activeJob = (job?: CoachJob | null) => !!job && ["queued", "running"].includes(job.status);

function CoachSpeaker() {
  return <span className={styles.speaker}><img src="/support-agent-avatar-2026.png" alt="" width="36" height="36" />오늘창업<span className={styles.aiLabel}>AI</span></span>;
}

export default function BusinessCoachPage() {
  const split = useChatSplit();
  const router = useRouter();
  const [plan, setPlan] = useState<Snapshot | null>(null);
  const planRef = useRef<Snapshot | null>(null);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState(false);
  const [login, setLogin] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [view, setView] = useState<"chat" | "brief">("chat");
  const [changed, setChanged] = useState<CoachField["key"][]>([]);
  const [unseen, setUnseen] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const file = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const pendingId = useRef<string | null>(null);
  const pendingAction = useRef<"message" | "prepare">("message");
  const storageKey = useRef("coach-input:new");
  const submitting = useRef(false);

  useEffect(() => {
    const field = input.current;
    if (!field) return;
    field.style.height = "44px";
    field.style.height = `${Math.min(140, field.scrollHeight)}px`;
  }, [text, view]);

  const accept = useCallback((data: Payload) => {
    const before = planRef.current;
    if (before && data.plan?.planId === before.planId && (data.plan.coach.revision < before.coach.revision || (data.plan.coach.revision === before.coach.revision && data.plan.updatedAt && before.updatedAt && data.plan.updatedAt < before.updatedAt))) return;
    if (data.plan && before && before.coach.revision !== data.plan.coach.revision) setChanged(changedCoachFields(before.coach, data.plan.coach));
    planRef.current = data.plan ?? null; setPlan(data.plan ?? null);
    if (data.authenticated !== undefined) setAuthenticated(data.authenticated);
    if (data.paid !== undefined) setPaid(data.paid);
    if (data.runStatus !== undefined) setRunStatus(data.runStatus);
  }, []);
  const refresh = useCallback(async (id?: string) => {
    const res = await fetch(`/api/plan/chat${id ? `?planId=${encodeURIComponent(id)}` : ""}`, { cache: "no-store" });
    if (!res.ok) throw new Error("대화를 불러오지 못했어요. 다시 시도해 주세요.");
    const data: Payload = await res.json(); accept(data); setConnectionError(false); setLoadFailed(false); return data.plan;
  }, [accept]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    storageKey.current = `coach-input:${query.get("planId") ?? "new"}`;
    try {
      const draft = sessionStorage.getItem(storageKey.current);
      const incoming = query.get("prompt")?.slice(0,2500) || "";
      const value = draft || incoming;
      if (value) sessionStorage.setItem(storageKey.current, value);
      setText(value);
    } catch { setText(query.get("prompt")?.slice(0,2500) || ""); }
    if (query.has("prompt")) { query.delete("prompt"); window.history.replaceState(null,"",`/plan/chat?${query}`); }
    if (query.has("new")) { setLoaded(true); return; }
    refresh(query.get("planId") ?? undefined).catch(e => { setError(e.message); setLoadFailed(true); }).finally(() => setLoaded(true));
  }, [refresh]);
  useEffect(() => {
    if (!loaded) return;
    try { if (text) sessionStorage.setItem(storageKey.current, text); else sessionStorage.removeItem(storageKey.current); } catch { /* Editor works without browser storage. */ }
  }, [text, loaded]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => pageRef.current?.style.setProperty("--chat-height", `${viewport?.height ?? window.innerHeight}px`);
    resize(); viewport?.addEventListener("resize", resize);
    return () => viewport?.removeEventListener("resize", resize);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => setChanged([]), 3500); return () => window.clearTimeout(timer); }, [plan?.coach.revision]);
  useEffect(() => {
    // Smooth auto-scroll can keep moving after the reader scrolls up; animate messages instead.
    if (follow.current && conversationRef.current) conversationRef.current.scrollTo({ top: conversationRef.current.scrollHeight, behavior: "instant" });
    else setUnseen(true);
  }, [plan?.coach.revision, optimistic, busy]);

  const revision = plan?.coach.documentRevision ?? plan?.coach.revision;
  const targetKeys = plan?.generation?.revision === revision ? plan?.generation?.keys ?? [] : [];
  const completed = targetKeys.filter(key => plan?.completed.includes(key)).length;
  const generating = !!targetKeys.length && completed < targetKeys.length && !["errored", "terminated", "complete", "unknown"].includes(runStatus ?? "");
  const working = activeJob(plan?.job);
  const blocked = busy || working || generating || loadFailed || editDirty;
  const hasBrief = !!plan?.coach.ready;
  const started = !!plan?.coach.messages.length || !!optimistic || !!plan?.job;
  const documentCurrent = !!targetKeys.length && completed === targetKeys.length;
  const needsDocumentUpdate = !!plan?.hasDocuments && plan.generation?.revision !== revision;
  const loginHref = `/account?next=${encodeURIComponent(`/plan/chat${plan ? `?planId=${plan.planId}` : ""}`)}`;

  useEffect(() => {
    if ((!generating && !working) || !plan) return;
    let inFlight = false;
    const poll = async () => { if (inFlight) return; inFlight = true; try { await refresh(plan.planId); } catch { setConnectionError(true); } finally { inFlight = false; } };
    const timer = window.setInterval(() => void poll(), 3000);
    const visible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [generating, working, plan?.planId, refresh]);

  async function submit(message = text, action: "message" | "prepare" = "message", retry = false) {
    if (submitting.current || blocked) return;
    const content = action === "message" ? [message.trim(), attachment ? `[첨부 자료: ${attachment.name}]\n${attachment.text}` : ""].filter(Boolean).join("\n\n") : "";
    if (action === "message" && !content && !retry) return;
    submitting.current = true; setBusy(true); setError(""); setLogin(false); follow.current = true;
    if (action === "message") setOptimistic(retry ? plan?.job?.message.text ?? null : content);
    const requestId = retry ? plan!.job!.message.id : pendingAction.current === action && pendingId.current ? pendingId.current : crypto.randomUUID();
    pendingId.current = requestId; pendingAction.current = action;
    try {
      const res = await fetch("/api/plan/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, planId: plan?.planId, revision: plan?.coach.revision ?? 0, message: content, requestId, retry }) });
      const data: Payload = await res.json();
      if (!res.ok) {
        setLogin(!!data.login); if (data.plan) accept(data);
        if (res.status === 409) { await refresh(plan?.planId); pendingId.current = null; }
        throw new Error(data.message || "요청을 처리하지 못했어요. 입력은 그대로 남아 있어요.");
      }
      accept(data);
      if (data.plan) {
        window.history.replaceState(null, "", `/plan/chat?planId=${encodeURIComponent(data.plan.planId)}`);
        try { sessionStorage.removeItem(storageKey.current); } catch { /* Optional local draft storage. */ }
        storageKey.current = `coach-input:${data.plan.planId}`;
      }
      if (action === "prepare") setRunStatus("queued"); else { setText(""); setAttachment(null); }
      pendingId.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인해 주세요. 입력은 그대로 남아 있어요."); }
    finally { setBusy(false); setOptimistic(null); submitting.current = false; }
  }
  async function openDocument(pay = false) {
    if (!plan) return; setError("");
    try { await hydrateFromServer(); setActivePlan(plan.planId); router.push(pay ? `/plan/pay?planId=${encodeURIComponent(plan.planId)}&planType=${encodeURIComponent(plan.planType)}` : "/plan/document"); }
    catch { setError("계획서를 열지 못했어요. 잠시 후 다시 시도해 주세요."); }
  }
  async function attach(selected: File) {
    setError("");
    if (selected.size > 1024 * 1024) { setError("1MB 이하의 워드 또는 텍스트 문서를 첨부해 주세요."); return; }
    try {
      let contents: string;
      if (/\.docx$/i.test(selected.name)) {
        const res = await fetch("/api/plan/chat/attachment", { method: "POST", body: selected }); const data = await res.json(); if (!res.ok) throw new Error(data.message); contents = data.text;
      } else if (/\.(txt|md)$/i.test(selected.name)) contents = await selected.text();
      else throw new Error("워드(.docx) 또는 텍스트(.txt, .md) 문서를 첨부해 주세요.");
      if (contents.length > 18000) throw new Error("문서가 길어요. 필요한 부분만 18,000자 이내로 나누어 주세요.");
      setAttachment({ name: selected.name, text: contents }); pendingId.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : "파일을 읽지 못했어요."); }
  }
  function edit(value: string) { setView("chat"); setText(value); pendingId.current = null; window.setTimeout(() => input.current?.focus(), 0); }
  async function saveBrief(patch: BriefPatch) {
    const current = planRef.current;
    if (!current) throw new Error("사업 정보를 다시 불러와 주세요.");
    const response = await fetch("/api/plan/expert", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...patch, planId: current.planId, requestId: crypto.randomUUID() }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "저장하지 못했어요. 입력 내용은 그대로 남아 있어요.");
    const coach = payload.plan && readCoach(payload.plan.answers);
    if (!coach) throw new Error("저장 결과를 확인하지 못했어요. 다시 확인해 주세요.");
    accept({ plan: { ...current, title: payload.plan.title, updatedAt: payload.plan.updatedAt, coach } });
    void hydrateFromServer().catch(() => {});
  }

  const actions = <>
    {generating ? <div className={styles.generation} role="status"><span>계획서를 작성하고 있어요</span><progress aria-label="문서 제작 진행" value={completed} max={targetKeys.length} /><small>{completed}/{targetKeys.length}개 항목 완료 · 서버에서 계속 제작합니다.</small></div> : documentCurrent ? <><p className={styles.completionLabel}><Check size={15} aria-hidden="true" />{completed >= (plan?.total ?? Infinity) ? "계획서 작성 완료" : "미리보기 준비 완료"}</p><button className={`${styles.primary} ${styles.finishButton}`} onClick={() => void openDocument()}><FileCheck2 size={22} aria-hidden="true" /><span>계획서 보기</span><ChevronRight size={20} aria-hidden="true" /></button>{!paid && <button className={styles.textButton} onClick={() => void openDocument(true)}>전체 문서와 파일 제작 신청</button>}</> : <>
      <small>{plan?.hasDocuments ? "업데이트 필요 · 기존 문서는 그대로 보관 중이에요." : !authenticated ? "로그인 후 제작할 수 있어요. 지금 대화는 그대로 이어집니다." : !paid ? "무료로 앞 2개 항목을 만들어요. 전체 제작은 선택 사항이에요." : "확인한 사업안으로 문서를 만들어요."}</small>
      {!authenticated ? <Link className={styles.primary} href={loginHref}>로그인하고 계획서 만들기</Link> : <button className={styles.primary} disabled={blocked} onClick={() => void submit("", "prepare")}>{plan?.hasDocuments ? "수정 내용을 계획서에 반영하기" : "이 내용으로 계획서 만들기"}</button>}
      {(plan?.hasDocuments || !!plan?.completed.length) && <button className={styles.textButton} onClick={() => void openDocument()}>기존 계획서 보기</button>}
    </>}
    {!!plan?.manualReview?.length && <details><summary>직접 고친 항목 {plan.manualReview.length}개는 유지했어요</summary><p>새 사업안과 함께 확인해 주세요. {plan.manualReview.join(", ")}</p></details>}
    {(runStatus === "complete" && completed < targetKeys.length || ["errored", "terminated", "unknown"].includes(runStatus ?? "")) && <p className={styles.note}>완료한 내용은 남아 있어요. 다시 반영하면 남은 항목을 이어서 제작합니다.</p>}
  </>;

  return <main ref={pageRef} className={`${styles.page} ${hasBrief ? styles.hasBrief : ""}`}>
    <BusinessAppChrome title="사업 기획" active="chat" workspaceHref={plan ? workspaceHref(plan.planId) : undefined}>
    {hasBrief && <nav className={styles.viewTabs} aria-label="화면 선택"><button aria-pressed={view === "chat"} disabled={editDirty} onClick={() => setView("chat")}>대화</button><button aria-pressed={view === "brief"} onClick={() => setView("brief")}>내 사업안{changed.length > 0 && <span className={styles.updateDot} aria-label="수정됨" />}</button></nav>}
    <div ref={split.ref} style={split.style} className={`${styles.workspace} ${split.dragging ? styles.resizing : ""}`}>
      <section id="business-chat-pane" className={`${styles.chatPane} ${view !== "chat" ? styles.mobileHidden : ""}`} aria-label="사업 기획 대화">
        <div ref={conversationRef} className={styles.conversation} onScroll={e => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; if (follow.current) setUnseen(false); }}>
          <div className={styles.thread}>
            <article className={`${styles.assistant} ${!started ? styles.firstMessage : ""}`} aria-label="오늘창업의 첫 메시지"><CoachSpeaker /><div className={styles.bubble}><p>반가워요.<br />어떤 사업을 함께 만들어볼까요?</p><p className={styles.greetingNote}>막연한 생각도 좋아요.<br />이야기하면서 하나씩 구체화해 봐요.</p></div></article>
            {!started && <div className={styles.entryOptions} aria-label="대화 시작 선택지">{ENTRY_OPTIONS.map((option, index) => <button key={option} style={{ animationDelay: `${index * 80 + 150}ms` }} disabled={!loaded || blocked} onClick={() => { pendingId.current = null; void submit(option); }}><span>{option}</span><ChevronRight size={18} aria-hidden="true" /></button>)}</div>}
            {plan?.coach.messages.map((message, index) => <article key={message.id} className={message.role === "user" ? styles.user : styles.assistant} aria-label={message.role === "user" ? "내 메시지" : "오늘창업의 답변"}>
              {message.role === "assistant" && <CoachSpeaker />}
              {message.summary ? <><p>{message.summary}</p>{index < plan.coach.messages.length - 1 && <details className={styles.oldMessage}><summary>당시 사업안 보기</summary><p>{message.text}</p></details>}</> : message.role === "assistant" && message.text.length > 500 && index < plan.coach.messages.length - 1 ? <details className={styles.oldMessage}><summary>이전 사업 제안 보기</summary><p>{message.text}</p></details> : <p>{message.text}</p>}
            </article>)}
            {((plan?.job && !plan.coach.messages.some(message => message.id === plan.job?.message.id)) || optimistic) && <article className={styles.user}><p>{plan?.job && !plan.coach.messages.some(message => message.id === plan.job?.message.id) ? plan.job.message.text : optimistic}</p><small>{working ? "접수됨" : busy ? "보내는 중" : "답변 대기"}</small></article>}
            {(busy || working) && <div className={styles.thinking} role="status"><CoachSpeaker /><div className={styles.thinkingLine}><p>{working ? PHASES[plan!.job!.phase] : "요청을 보내고 있어요"}</p><div className={styles.typing} aria-hidden="true"><i /><i /><i /></div></div><small>{working && plan?.job?.durable ? "화면을 닫아도 서버에서 계속 만들어요." : "완료될 때까지 이 화면을 유지해 주세요."}</small></div>}
            {plan?.job?.status === "failed" && !busy && <div className={styles.jobError} role="alert"><p>답변을 완성하지 못했어요. 입력한 내용은 저장돼 있어요.</p><button className={styles.secondary} onClick={() => void submit("", "message", true)}>이 내용으로 다시 시도</button></div>}
            {generating && <div className={styles.readyNotice} role="status"><span className={styles.resultLabel}>계획서 작성 중</span><p>{completed}/{targetKeys.length}개 항목 완료</p><progress aria-label="대화 내 문서 제작 진행" value={completed} max={targetKeys.length} /><small>서버에서 계속 제작해요. 나중에 이 대화로 돌아와 확인할 수 있어요.</small><button className={styles.secondary} onClick={() => setView("brief")}>제작 상태 보기</button></div>}
            {hasBrief && !blocked && <div className={styles.readyNotice}><span className={styles.resultLabel}>{documentCurrent ? "계획서 완성" : needsDocumentUpdate ? "수정한 사업안" : "함께 정리한 사업안"}</span><h2>{plan?.title}</h2>{needsDocumentUpdate && <p>바꾼 내용을 계획서에도 반영할 수 있어요.</p>}<button className={styles.primary} onClick={() => { setView("brief"); if (window.matchMedia("(min-width:901px)").matches) document.querySelector<HTMLElement>('[aria-label="내 사업안 결과"] h1')?.focus(); }}>내 사업안 확인하기</button></div>}
            {started && !blocked && plan?.job?.status !== "failed" && !!plan?.coach.suggestions.length && <div className={styles.suggestions} aria-label="이어서 대화하기">{plan.coach.suggestions.map((suggestion, index) => <button key={suggestion} style={{ animationDelay: `${index * 60}ms` }} onClick={() => { pendingId.current = null; void submit(suggestion); }}><span>{suggestion}</span><ChevronRight size={18} aria-hidden="true" /></button>)}</div>}
            <div ref={end} />
          </div>
        </div>
        {unseen && <button className={styles.newAnswer} onClick={() => { follow.current = true; setUnseen(false); end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }}>새 답변 보기</button>}
        <footer className={styles.composer}>
          {connectionError && <p role="status" className={styles.note}>연결이 잠시 끊겼어요. 저장된 작업 상태를 다시 확인하고 있어요.</p>}
          {error && <p className={styles.error} role="alert">{error} {login && <Link href={loginHref}>로그인하기</Link>}</p>}
          {loadFailed && <button className={styles.secondary} onClick={() => void refresh(new URLSearchParams(window.location.search).get("planId") ?? undefined).then(() => setError("")).catch(e => setError(e.message))}>대화 다시 불러오기</button>}
          {!loaded && <PlanLoading variant="compact" note="대화를 불러오고 있어요" />}
          {attachment && <div className={styles.attachment}><span>{attachment.name}</span><button onClick={() => setAttachment(null)}>첨부 취소</button></div>}
          <form aria-busy={busy || working} onClick={e => { if (e.target === e.currentTarget) input.current?.focus(); }} onSubmit={e => { e.preventDefault(); void submit(); }}>
            <input hidden ref={file} type="file" accept=".txt,.md,.docx" onChange={e => { const selected = e.target.files?.[0]; if (selected) void attach(selected); e.target.value = ""; }} />
            <button type="button" className={styles.tool} aria-label="기존 문서 첨부" title="기존 문서 첨부" disabled={!loaded || blocked} onClick={() => file.current?.click()}><Paperclip size={20} /></button>
            <textarea ref={input} aria-label="사업에 대해 말씀해주세요" placeholder="메시지를 입력하세요" value={text} maxLength={2500} rows={1} disabled={!loaded || blocked} onChange={e => { setText(e.target.value); pendingId.current = null; }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia("(max-width: 900px)").matches) { e.preventDefault(); void submit(); } }} />
            <button type="submit" className={`${styles.send} ${text.trim() || attachment ? styles.sendReady : ""}`} aria-label="보내기" title="보내기" disabled={!loaded || blocked || (!text.trim() && !attachment)}><ArrowUp size={22} /></button>
          </form>
        </footer>
      </section>
      {hasBrief && <div {...split.separator} aria-controls="business-chat-pane" className={styles.splitHandle} title="드래그로 너비 조절 · 두 번 클릭하면 기본 너비"><span /></div>}
      {hasBrief && plan && <aside className={`${styles.briefPane} ${view !== "brief" ? styles.mobileHidden : ""}`} aria-label="내 사업안 결과"><BusinessBrief coach={plan.coach} changed={changed} onEdit={edit} onSave={saveBrief} onDirty={setEditDirty} disabled={blocked} actions={actions} />{error && view === "brief" && <p className={styles.error} role="alert">{error}</p>}</aside>}
    </div>
    </BusinessAppChrome>
  </main>;
}
