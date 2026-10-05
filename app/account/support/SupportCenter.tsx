"use client";

import { ArrowLeft, CheckCircle2, ChevronDown, Headphones, LogIn, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { SiteHeader } from "../../../components/site-header";
import { inquiryCategories, inquiryCategory, inquiryDraftSchema, inquiryPreview, inquirySchema, type InquiryDraft } from "../../../lib/support-chat/inquiry";
import type { SupportChat } from "../../../lib/support-chat/repository";
import PlanLoading, { Spinner } from "../../plan/PlanLoading";
import styles from "./support.module.css";

type Reply = { ownerScope: string; chat: SupportChat; requestId?: string; receivedMessageId?: string };
type View = "write" | "history";
const emptyChat: SupportChat = { conversation: null, messages: [] };
const draftKey = (scope: string) => `oneulstart:support-draft:${scope}`;
const emptyDraft = (): InquiryDraft => ({ category: "other", subject: "", message: "", requestId: crypto.randomUUID() });

function loadDraft(scope: string): InquiryDraft {
  try {
    const stored = inquiryDraftSchema.safeParse(JSON.parse(sessionStorage.getItem(draftKey(scope)) ?? "null"));
    if (stored.success) return stored.data;
  } catch {}
  const category = inquiryCategory(new URLSearchParams(window.location.search).get("category"));
  return { ...emptyDraft(), category, subject: category === "website" ? "홈페이지 제작 문의" : "" };
}

async function readReply(response: Response): Promise<Reply> {
  let data;
  try { data = await response.json(); } catch { throw new Error("고객센터 응답을 확인하지 못했어요. 다시 시도해주세요."); }
  if (!response.ok) throw new Error(data.error?.message || "문의를 처리하지 못했어요. 다시 시도해주세요.");
  if (typeof data.ownerScope !== "string" || !Array.isArray(data.chat?.messages)) throw new Error("문의 내역을 확인하지 못했어요.");
  return data as Reply;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function SupportCenter() {
  const router = useRouter();
  const [scope, setScope] = useState<string | null>(null);
  const scopeRef = useRef<string | null>(null);
  const [chat, setChat] = useState<SupportChat>(emptyChat);
  const [draft, setDraft] = useState<InquiryDraft | null>(null);
  const [view, setView] = useState<View>("write");
  const [entryCategory, setEntryCategory] = useState("other");
  const [loading, setLoading] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const inFlight = useRef(false);
  const recheck = useRef(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const submitRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (inFlight.current) { recheck.current = true; return; }
    const current = ++sequence.current;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const timeout = window.setTimeout(() => request.abort(), 20000);
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/account/support", { cache: "no-store", signal: request.signal });
      if (current !== sequence.current) return;
      const signedOut = response.status === 401 || (response.ok && (await response.clone().json().catch(() => null))?.loggedIn === false);
      if (current !== sequence.current) return;
      if (signedOut) {
        scopeRef.current = null; setScope(null); setChat(emptyChat); setDraft(null); setLoggedOut(true); return;
      }
      const result = await readReply(response);
      if (current !== sequence.current) return;
      if (scopeRef.current !== result.ownerScope) {
        setDraft(loadDraft(result.ownerScope)); setReceipt("");
      }
      scopeRef.current = result.ownerScope; setScope(result.ownerScope);
      setChat(result.chat); setLoggedOut(false);
    } catch (failure) {
      if (current === sequence.current) {
        scopeRef.current = null; setScope(null); setChat(emptyChat); setDraft(null);
        setError(failure instanceof Error && !["AbortError", "TypeError"].includes(failure.name) ? failure.message : "연결이 늦어지고 있어요. 다시 불러와주세요.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (current === sequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setEntryCategory(inquiryCategory(new URLSearchParams(window.location.search).get("category")));
    void load();
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    const focus = () => void load();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    return () => { sequence.current++; controller.current?.abort(); submitRef.current?.abort(); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visible); };
  }, [load]);

  useEffect(() => {
    if (!scope || !draft) return;
    try { sessionStorage.setItem(draftKey(scope), JSON.stringify(draft)); } catch {}
  }, [scope, draft]);

  function edit(patch: Partial<InquiryDraft>) {
    setReceipt("");
    setDraft(current => current ? { ...current, ...patch, requestId: crypto.randomUUID() } : current);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || loading || !scope || !draft) return;
    const parsed = inquirySchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "문의 내용을 확인해주세요."); return; }
    const owner = scope, input = parsed.data;
    const current = ++sequence.current;
    inFlight.current = true; setBusy(true); setError(""); setReceipt("");
    controller.current?.abort();
    const request = new AbortController(); submitRef.current = request;
    const timeout = window.setTimeout(() => request.abort(), 20000);
    try {
      const response = await fetch("/api/account/support", {
        method: "POST", headers: { "Content-Type": "application/json", "x-support-owner": owner },
        body: JSON.stringify(input), signal: request.signal,
      });
      if (current !== sequence.current) return;
      if (response.status === 401 || response.status === 409 && (await response.clone().json()).error?.code === "ACCOUNT_CHANGED") {
        scopeRef.current = null; setScope(null); setChat(emptyChat); setDraft(null); setLoggedOut(response.status === 401);
        throw new Error(response.status === 401 ? "로그인이 끝났어요. 다시 로그인한 뒤 문의해 주세요." : "로그인 계정이 바뀌었어요. 고객센터를 다시 불러와주세요.");
      }
      const result = await readReply(response);
      if (current !== sequence.current) return;
      if (result.ownerScope !== owner || result.requestId !== input.requestId || !result.chat.messages.some(message => message.id === result.receivedMessageId)) throw new Error("접수 결과를 확인하지 못했어요. 같은 내용으로 다시 확인해주세요.");
      setChat(result.chat); setDraft(emptyDraft()); setView("history"); setReceipt("문의를 접수했어요. 답변은 이곳에서 확인할 수 있어요.");
    } catch (failure) {
      if (current === sequence.current) setError(failure instanceof Error && !["AbortError", "TypeError"].includes(failure.name) ? failure.message : "접수 결과를 아직 확인하지 못했어요. 내용은 그대로 있으니 다시 접수해주세요.");
    } finally {
      window.clearTimeout(timeout); inFlight.current = false;
      if (current === sequence.current) setBusy(false);
      if (recheck.current && current === sequence.current) { recheck.current = false; void load(); }
    }
  }

  const loginHref = `/account?next=${encodeURIComponent(`/account/support${entryCategory !== "other" ? `?category=${entryCategory}` : ""}`)}`;
  return <main className={`${styles.page} plan-ui`}>
    <SiteHeader light showAccount={false} onHome={() => router.push("/")} />
    <div className={styles.content}>
      <Link className={styles.back} href="/plan/me"><ArrowLeft size={18} aria-hidden="true" />마이페이지</Link>
      <header className={styles.heading}><Headphones size={28} aria-hidden="true" /><h1>고객센터</h1></header>
      {loading ? <PlanLoading variant="compact" note="문의 내역을 불러오고 있어요" /> : loggedOut ? <section className={styles.empty}><h2>로그인 후 문의를 남겨주세요</h2><Link className={styles.primary} href={loginHref}><LogIn size={19} />로그인하기</Link></section> : <>
        {scope && <>
          <nav className={styles.tabs} aria-label="고객센터 메뉴">
            <button type="button" aria-pressed={view === "write"} onClick={() => setView("write")}>문의하기</button>
            <button type="button" aria-pressed={view === "history"} onClick={() => setView("history")}>문의 내역{chat.messages.length ? <span>{chat.messages.filter(message => message.sender === "customer").length}</span> : null}</button>
          </nav>
          {receipt && <p className={styles.success} role="status"><CheckCircle2 size={20} aria-hidden="true" />{receipt}</p>}
          {view === "write" && draft ? <form className={styles.form} onSubmit={submit} aria-busy={busy}>
            <label>문의 유형<select value={draft.category} disabled={busy} onChange={event => edit({ category: inquiryCategory(event.target.value) })}>{inquiryCategories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
            <label>제목<input value={draft.subject} maxLength={80} required disabled={busy} onChange={event => edit({ subject: event.target.value })} placeholder="어떤 도움이 필요하신가요?" /></label>
            <label>문의 내용<textarea rows={7} maxLength={1800} required disabled={busy} value={draft.message} onChange={event => edit({ message: event.target.value })} placeholder="불편했던 상황이나 궁금한 점을 남겨주세요." /></label>
            <div className={styles.fieldFooter}><small>비밀번호·인증번호·결제정보는 적지 마세요.</small><span>{draft.message.length.toLocaleString()} / 1,800</span></div>
            <button className={styles.primary} type="submit" disabled={busy || !draft.subject.trim() || !draft.message.trim()}>{busy ? <Spinner /> : <Send size={18} aria-hidden="true" />}{busy ? "접수 중" : "문의 접수"}</button>
          </form> : view === "history" && <section className={styles.history} aria-label="문의와 답변">
            <div className={styles.historyHeading}><h2>내 문의와 답변</h2><button type="button" className={styles.iconButton} aria-label="문의 내역 새로고침" title="문의 내역 새로고침" onClick={() => void load()}><RefreshCw size={20} /></button></div>
            {chat.messages.length === 0 ? <div className={styles.empty}><p>아직 접수한 문의가 없어요.</p><button className={styles.secondary} onClick={() => setView("write")}>문의 남기기</button></div> : [...chat.messages].reverse().map(message => {
              const inquiry = inquiryPreview(message.body);
              return message.sender === "customer" ? <details className={styles.inquiry} key={message.id}>
                <summary><span className={styles.itemHeading}><small>보낸 문의 · {inquiry.category}</small><strong>{inquiry.subject}</strong><time dateTime={message.createdAt}>{dateLabel(message.createdAt)}</time></span><ChevronDown size={20} aria-hidden="true" /></summary>
                <p>{inquiry.message}</p>
              </details> : <article className={styles.reply} key={message.id}><div><strong>고객센터 답변</strong><time dateTime={message.createdAt}>{dateLabel(message.createdAt)}</time></div><p>{message.body}</p></article>;
            })}
          </section>}
        </>}
        {error && <div className={styles.error} role="alert"><p>{error}</p>{!scope && !loggedOut && <button className={styles.secondary} onClick={() => void load()}><RefreshCw size={18} />다시 불러오기</button>}</div>}
      </>}
    </div>
  </main>;
}
