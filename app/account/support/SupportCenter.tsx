"use client";

import { CheckCircle2, ChevronRight, CircleAlert, LogIn, MessageSquareText, RefreshCw, Send } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import AppFrame from "../../plan/AppFrame";
import { inquiryCategories, inquiryCategory, inquiryDraftSchema, inquiryPreview, inquirySchema, type InquiryDraft } from "../../../lib/support-chat/inquiry";
import type { SupportChat } from "../../../lib/support-chat/repository";
import PlanLoading, { Spinner } from "../../plan/PlanLoading";
import { EmptyState } from "../../plan/BusinessEmptyState";
import styles from "./support.module.css";
import { StatusBadge } from "../../../components/status-badge";
import { AppButton } from "../../../components/app-button";
import { FieldHelp, Select, TextArea, TextField } from "../../../components/app-field";
import { SettingsCard, SettingsDisclosure, SettingsHeader, SettingsHelpLink, SettingsNote, SettingsRow, SettingsSection, SettingsSegment } from "../../../components/settings-row";
import { faqAnswer, supportFaqCategories } from "../../../lib/support-chat/faq";
import { nativePlatform } from "../../../lib/native-app";

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
  try { data = await response.json(); } catch { throw new Error("고객센터 응답을 확인하지 못했어요. 다시 시도해 주세요."); }
  if (!response.ok) throw new Error(data.error?.message || "문의를 처리하지 못했어요. 다시 시도해 주세요.");
  if (typeof data.ownerScope !== "string" || !Array.isArray(data.chat?.messages)) throw new Error("문의 내역을 확인하지 못했어요.");
  return data as Reply;
}

type SupportMessage = SupportChat["messages"][number];
type InquiryThread = { inquiry: SupportMessage | null; replies: SupportMessage[] };

/*
 * 문의마다 답변을 묶는다 — 메시지에는 어느 문의에 대한 답인지 표시가 없어서, 보낸 순서대로 읽어
 * 답변을 바로 앞 문의에 붙인다. 예전엔 전체를 최신순으로 한 줄로 늘어놓아 답변이 다른 문의 밑에 보였다(감사 2026-10-23).
 * 묶음은 문의를 보낸 시각 기준 최신순으로 놓는다.
 */
function inquiryThreads(messages: SupportMessage[]): InquiryThread[] {
  const threads: InquiryThread[] = [];
  for (const message of [...messages].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    if (message.sender === "customer") threads.push({ inquiry: message, replies: [] });
    else if (threads.length) threads[threads.length - 1].replies.push(message);
    else threads.push({ inquiry: null, replies: [message] });
  }
  return threads.reverse();
}

/* 자주 묻는 질문 — 상담 창(support-chat-widget)과 같은 안내 문구(lib/support-chat/faq), 묶음마다 첫 질문 하나씩 */
const FAQ_ITEMS = supportFaqCategories.map(category => category.items[0]).filter(Boolean);

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function SupportCenter() {
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
  /** 문의 내역에서 펼친 문의 — 안내 띠·최근 문의에서 누르면 그 문의를 펼친다 */
  const [openThread, setOpenThread] = useState<string | null>(null);
  /** 앱 안이면 결제 안내를 스토어 결제 기준으로(상담 창과 같은 규칙) */
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(nativePlatform() !== null); }, []);
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
        setError(failure instanceof Error && !["AbortError", "TypeError"].includes(failure.name) ? failure.message : "연결이 늦어지고 있어요. 다시 불러와 주세요.");
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
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "문의 내용을 확인해 주세요."); return; }
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
        throw new Error(response.status === 401 ? "로그인이 끝났어요. 다시 로그인한 뒤 문의해 주세요." : "로그인 계정이 바뀌었어요. 고객센터를 다시 불러와 주세요.");
      }
      const result = await readReply(response);
      if (current !== sequence.current) return;
      if (result.ownerScope !== owner || result.requestId !== input.requestId || !result.chat.messages.some(message => message.id === result.receivedMessageId)) throw new Error("접수 결과를 확인하지 못했어요. 같은 내용으로 다시 확인해 주세요.");
      setChat(result.chat); setDraft(emptyDraft()); setView("history"); setReceipt("문의를 접수했어요. 답변은 이곳에서 확인할 수 있어요.");
    } catch (failure) {
      if (current === sequence.current) setError(failure instanceof Error && !["AbortError", "TypeError"].includes(failure.name) ? failure.message : "접수 결과를 아직 확인하지 못했어요. 내용은 그대로 있으니 다시 접수해 주세요.");
    } finally {
      window.clearTimeout(timeout); inFlight.current = false;
      if (current === sequence.current) setBusy(false);
      if (recheck.current && current === sequence.current) { recheck.current = false; void load(); }
    }
  }

  const loginHref = `/account?next=${encodeURIComponent(`/account/support${entryCategory !== "other" ? `?category=${entryCategory}` : ""}`)}`;
  const threads = inquiryThreads(chat.messages);
  const inquiryCount = chat.messages.filter(message => message.sender === "customer").length;
  /* 답변을 기다리는 문의 — 가장 최근 것을 안내 띠에 */
  const waiting = threads.filter(thread => thread.inquiry && thread.replies.length === 0);
  const firstWaiting = waiting[0]?.inquiry ? inquiryPreview(waiting[0].inquiry.body) : null;
  const showThread = (id: string | undefined) => { setView("history"); setOpenThread(id ?? null); };
  /*
   * 다른 화면과 같은 틀에 담는다(대표 요청 2026-10-15) — 예전엔 사이트 머리말을 따로 그려 앱에서 로고가 아이폰 상태바에 겹쳤다.
   * lovable 구조 3단계 — 설정 틀(PC 설정 메뉴 · 판 안쪽 48 / 휴대폰 ‹ · 제목) + 설정 행 카드(components/settings-row).
   * 시안의 '화면 캡처 붙이기'는 지금 문의 접수(/api/account/support)가 글만 받아 두지 않았다 — 시안 문서에 적음.
   */
  return <AppFrame title="고객센터" settings="back"><div className={`${styles.page} plan-ui`} data-fill={loggedOut && !loading ? "" : undefined}>
    <SettingsHeader title="고객센터" description="불편했던 일이나 궁금한 점을 남겨 주세요. 답변은 이 화면에서 확인할 수 있어요."
      aside={<>
        {scope && !loading && <SettingsSegment label="고객센터 보기" value={view} onChange={setView} items={[{ value: "write", label: "문의하기" }, { value: "history", label: "문의 내역", count: inquiryCount }]} />}
        <SettingsHelpLink href="/plan/info">이용 안내</SettingsHelpLink>
      </>} />
    <div className={styles.content}>
      {loading ? <PlanLoading variant="compact" note="문의 내역을 불러오고 있어요" /> : loggedOut ? <EmptyState as="section" className={styles.empty} icon={LogIn} title="로그인 후 문의를 남겨 주세요" actions={<AppButton variant="primary" href={loginHref}><LogIn size={19} />로그인하기<ChevronRight size={18} aria-hidden="true" /></AppButton>} /> : <>
        {scope && <>
          {receipt && <p className={styles.success} role="status"><CheckCircle2 size={20} aria-hidden="true" />{receipt}</p>}
          {firstWaiting && view === "write" && <SettingsNote icon={<CircleAlert size={18} aria-hidden="true" />}
            title={`답변을 기다리는 문의가 ${waiting.length}건 있어요`}
            description={`"${firstWaiting.subject}" · ${shortDate(waiting[0].inquiry!.createdAt)} 접수`}
            action={<AppButton type="button" variant="soft" size="mini" onClick={() => showThread(waiting[0].inquiry?.id)}>문의 보기</AppButton>} />}
          {view === "write" && draft ? <>
            <SettingsSection id="support-new" title="새 문의" description="언제, 어느 화면에서, 무엇이 있었는지 적어 주시면 빨리 찾아요.">
              <SettingsCard as="form" onSubmit={submit} aria-busy={busy}>
                <SettingsRow title="문의 유형" titleFor="support-category" description="가장 가까운 것을 골라 주세요."
                  control={<Select id="support-category" data-size="compact" className={styles.field} value={draft.category} disabled={busy} onChange={event => edit({ category: inquiryCategory(event.target.value) })}>{inquiryCategories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</Select>} />
                <SettingsRow title="제목" titleFor="support-subject" description="한 줄로 요약해 주세요."
                  control={<TextField id="support-subject" data-size="compact" className={styles.field} value={draft.subject} maxLength={80} required disabled={busy} onChange={event => edit({ subject: event.target.value })} placeholder="어떤 도움이 필요하신가요?" />} />
                <SettingsRow stack title="문의 내용" titleFor="support-message" description="불편했던 상황이나 궁금한 점을 남겨 주세요.">
                  <TextArea id="support-message" className={styles.message} rows={6} maxLength={1800} required disabled={busy} value={draft.message} onChange={event => edit({ message: event.target.value })} placeholder="불편했던 상황이나 궁금한 점을 남겨 주세요." aria-describedby="support-message-help" />
                  <div className={styles.fieldFooter}>
                    <FieldHelp id="support-message-help">비밀번호·인증번호·결제정보는 적지 마세요.</FieldHelp>
                    <span className={styles.count}>{draft.message.length.toLocaleString()} / 1,800</span>
                    <AppButton variant="primary" size="compact" className={styles.primary} type="submit" disabled={busy || !draft.subject.trim() || !draft.message.trim()}>{busy ? <Spinner /> : <Send size={16} aria-hidden="true" />}{busy ? "접수 중" : "문의 접수"}</AppButton>
                  </div>
                </SettingsRow>
              </SettingsCard>
            </SettingsSection>
            {threads.some(thread => thread.inquiry) && <SettingsSection id="support-recent" title="최근 문의" description="답변이 오면 이 화면의 문의 내역에서 볼 수 있어요.">
              <SettingsCard>
                {threads.filter(thread => thread.inquiry).slice(0, 3).map(thread => {
                  const inquiry = inquiryPreview(thread.inquiry!.body);
                  const answered = thread.replies.length > 0;
                  return <SettingsRow key={thread.inquiry!.id} onSelect={() => showThread(thread.inquiry!.id)} title={inquiry.subject} description={`${inquiry.category} · ${shortDate(thread.inquiry!.createdAt)}`}
                    control={<StatusBadge tone={answered ? "success" : "warning"} done={answered}>{answered ? "답변 완료" : "답변 대기"}</StatusBadge>} />;
                })}
              </SettingsCard>
            </SettingsSection>}
            <SettingsSection id="support-faq" title="자주 묻는 질문" description="문의 전에 한 번 확인해 보세요.">
              <SettingsCard>
                {FAQ_ITEMS.map(item => <SettingsDisclosure key={item.id} plain title={item.question}>
                  <p className={styles.answer}>{faqAnswer(item, inApp)}</p>
                  {item.link && <AppButton href={item.link.href} variant="soft" size="compact" className={styles.faqLink}>{item.link.label}<ChevronRight size={14} aria-hidden="true" /></AppButton>}
                </SettingsDisclosure>)}
              </SettingsCard>
            </SettingsSection>
          </> : view === "history" && <SettingsSection id="support-history" title="내 문의와 답변" description="보낸 문의를 누르면 내용과 답변이 펼쳐져요."
            aside={<AppButton type="button" variant="soft" size="compact" className={styles.iconButton} aria-label="문의 내역 새로고침" title="문의 내역 새로고침" onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" /></AppButton>}>
            <SettingsCard aria-label="문의와 답변">
              {chat.messages.length === 0 ? <EmptyState className={styles.empty} icon={MessageSquareText} heading="p" title="아직 접수한 문의가 없어요." actions={<AppButton variant="secondary" onClick={() => setView("write")}>문의 남기기</AppButton>} /> : threads.map(thread => {
                const replies = thread.replies.map(message => <article className={styles.reply} key={message.id}><div><strong>고객센터 답변</strong><time dateTime={message.createdAt}>{dateLabel(message.createdAt)}</time></div><p>{message.body}</p></article>);
                if (!thread.inquiry) return <SettingsRow key={thread.replies[0]?.id} stack title="고객센터 안내">{replies}</SettingsRow>;
                const inquiry = inquiryPreview(thread.inquiry.body);
                const answered = thread.replies.length > 0;
                const id = thread.inquiry.id;
                return <SettingsDisclosure key={id} open={openThread === id || undefined} onToggle={open => setOpenThread(current => open ? id : current === id ? null : current)}
                  title={inquiry.subject} description={<>{inquiry.category} · <time dateTime={thread.inquiry.createdAt}>{dateLabel(thread.inquiry.createdAt)}</time></>}
                  control={<StatusBadge tone={answered ? "success" : "warning"} done={answered}>{answered ? "답변 완료" : "답변 대기"}</StatusBadge>}>
                  <p className={styles.inquiryBody}>{inquiry.message}</p>
                  {replies}
                </SettingsDisclosure>;
              })}
            </SettingsCard>
          </SettingsSection>}
        </>}
        {error && <div className={styles.error} role="alert"><p>{error}</p>{!scope && !loggedOut && <AppButton variant="secondary" className={styles.secondary} onClick={() => void load()}><RefreshCw size={18} />다시 불러오기</AppButton>}</div>}
      </>}
    </div>
  </div></AppFrame>;
}
