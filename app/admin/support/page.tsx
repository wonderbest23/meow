"use client";

import { Banknote, CheckCircle2, Headphones, MessageCircle, RefreshCw, RotateCcw } from "lucide-react";
import Link from "next/link";
import AdminNav from "../AdminNav";
import AdminLogin from "../AdminLogin";
import { SUPPORT_STATUS_LABELS, supportCustomerLabel, type AdminSupportCustomer } from "../admin-labels";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupportChat, SupportConversation } from "../../../lib/support-chat/repository";

type SessionState = { authenticated: boolean; configured: boolean };
/* 관리자 목록 한 줄 — 손님 계정(이메일)과 손님이 마지막으로 한 말이 붙어 온다 */
type AdminConversation = SupportConversation & { customer?: AdminSupportCustomer; lastCustomerPreview?: string };
type Tab = "open" | "closed";

async function responsePayload(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "요청을 처리하지 못했어요.");
  return payload;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminSupportPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("open");
  /* 대시보드에서 ?c=<상담 id> 로 들어오면 그 대화를 연다 */
  const wanted = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chat, setChat] = useState<SupportChat>({ conversation: null, messages: [] });
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  /*
   * 늦게 온 옛 응답을 버리기 위한 번호 — 대화를 바꾼 직후 앞 대화가 늦게 와서 화면을 덮거나,
   * 답장 직후 먼저 출발한 4초 새로고침이 방금 보낸 답장을 지우던 것을 막는다.
   */
  const chatRequest = useRef(0);
  const listRequest = useRef(0);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const loadConversations = useCallback(async () => {
    const request = ++listRequest.current;
    const response = await fetch("/api/admin/support/chat", { cache: "no-store" });
    if (response.status === 401) {
      setSession((current) => ({ authenticated: false, configured: current?.configured ?? true }));
      return [];
    }
    const payload = await responsePayload(response) as { conversations: AdminConversation[] };
    if (request !== listRequest.current) return payload.conversations;
    setConversations(payload.conversations);
    setLoaded(true);
    const target = wanted.current ? payload.conversations.find((item) => item.id === wanted.current) : undefined;
    wanted.current = null;
    if (target) {
      setTab(target.status);
      setSelectedId(target.id);
    }
    return payload.conversations;
  }, []);

  const loadChat = useCallback(async (conversationId: string) => {
    const request = ++chatRequest.current;
    const response = await fetch(`/api/admin/support/chat?conversationId=${encodeURIComponent(conversationId)}`, { cache: "no-store" });
    if (response.status === 401) {
      setSession((current) => ({ authenticated: false, configured: current?.configured ?? true }));
      return;
    }
    const payload = await responsePayload(response) as { chat: SupportChat };
    if (request !== chatRequest.current || selectedRef.current !== conversationId) return;
    setChat(payload.chat);
    setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, unreadByAdmin: 0 } : item));
  }, []);

  useEffect(() => {
    wanted.current = new URLSearchParams(window.location.search).get("c");
  }, []);

  useEffect(() => {
    void fetch("/api/admin/support/session", { cache: "no-store" })
      .then(responsePayload)
      .then((payload: SessionState) => setSession(payload))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "관리자 상태를 확인하지 못했어요."));
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    void loadConversations().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "문의 목록을 불러오지 못했어요."));
    const timer = window.setInterval(() => {
      void loadConversations().catch(() => undefined);
      if (selectedId) void loadChat(selectedId).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [loadChat, loadConversations, selectedId, session?.authenticated]);

  useEffect(() => {
    if (!selectedId || !session?.authenticated) {
      setChat({ conversation: null, messages: [] });
      return;
    }
    // 다른 대화를 고르면 앞 대화를 남겨 두지 않는다 — 답장은 새로 고른 대화로 간다
    setChat((current) => current.conversation?.id === selectedId ? current : { conversation: null, messages: [] });
    void loadChat(selectedId).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "대화를 불러오지 못했어요."));
  }, [loadChat, selectedId, session?.authenticated]);

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages]);

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    const message = reply.trim();
    if (!selectedId || !message || busy) return;
    setBusy(true);
    setError("");
    chatRequest.current += 1;
    try {
      const payload = await responsePayload(await fetch("/api/admin/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, message }),
      })) as { chat: SupportChat };
      chatRequest.current += 1;
      if (selectedRef.current === payload.chat.conversation?.id) setChat(payload.chat);
      setReply("");
      await loadConversations();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "답장을 보내지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async () => {
    if (!chat.conversation || busy) return;
    const status = chat.conversation.status === "open" ? "closed" : "open";
    setBusy(true);
    chatRequest.current += 1;
    try {
      const payload = await responsePayload(await fetch("/api/admin/support/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: chat.conversation.id, status }),
      })) as { conversation: SupportConversation };
      chatRequest.current += 1;
      setChat((current) => current.conversation?.id === payload.conversation.id ? { ...current, conversation: payload.conversation } : current);
      await loadConversations();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "상담 상태를 바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => ({
    open: conversations.filter((item) => item.status === "open").length,
    closed: conversations.filter((item) => item.status === "closed").length,
    unread: conversations.reduce((sum, item) => sum + (item.unreadByAdmin ?? 0), 0),
  }), [conversations]);
  /* 안 읽은 문의를 위로, 그다음 최근 순 */
  const visible = useMemo(() => conversations
    .filter((item) => item.status === tab)
    .sort((a, b) => Number(b.unreadByAdmin > 0) - Number(a.unreadByAdmin > 0) || b.updatedAt.localeCompare(a.updatedAt)), [conversations, tab]);
  /* 탭을 바꾸거나 목록이 바뀌면 보이는 대화 중 하나를 고른다(진행 중을 먼저 본다) */
  useEffect(() => {
    if (!loaded || wanted.current) return;
    setSelectedId((current) => current && visible.some((item) => item.id === current) ? current : visible[0]?.id ?? null);
  }, [loaded, visible]);
  const selectedCustomer = conversations.find((item) => item.id === chat.conversation?.id)?.customer;
  const customerLabel = supportCustomerLabel(selectedCustomer);
  const customerEmail = selectedCustomer?.kind === "account" ? selectedCustomer.email : null;

  if (session === null) {
    return <main className="admin-support-loading"><RefreshCw /> 상담함을 불러오는 중이에요.</main>;
  }

  if (!session.authenticated) {
    return <AdminLogin title="1:1 상담" description="고객이 남긴 문의를 보고 답장해요." Icon={Headphones} configured={session.configured} onLoggedIn={() => setSession({ authenticated: true, configured: true })} />;
  }

  return (
    <main className="admin-support-page">
      <AdminNav title="1:1 상담" subtitle="고객이 남긴 문의와 답장" />
      <div className="admin-support-workspace" data-empty={loaded && conversations.length === 0 ? "" : undefined}>
        <aside className="admin-conversation-list">
          <header>
            <div className="admin-support-tabs" role="tablist" aria-label="상담 상태">
              <button type="button" role="tab" aria-selected={tab === "open"} onClick={() => setTab("open")}>{SUPPORT_STATUS_LABELS.open} {counts.open}</button>
              <button type="button" role="tab" aria-selected={tab === "closed"} onClick={() => setTab("closed")}>{SUPPORT_STATUS_LABELS.closed} {counts.closed}</button>
            </div>
            {counts.unread > 0 && <em>안 읽음 {counts.unread}</em>}
          </header>
          <div>
            {/* 답장 폼은 대화를 고른 뒤에만 보인다 — 목록 로딩 실패는 여기서 보여줘야 빈 화면으로 묻히지 않는다 */}
            {error && !chat.conversation && <p className="admin-login-error" role="alert">{error}</p>}
            {!loaded && !error && <p className="admin-empty-list">불러오는 중이에요…</p>}
            {loaded && visible.length === 0 && !error && <p className="admin-empty-list"><MessageCircle /> {conversations.length === 0 ? "아직 들어온 문의가 없어요." : tab === "open" ? "진행 중인 문의가 없어요." : "완료한 문의가 없어요."}</p>}
            {visible.map((item) => (
              <button type="button" key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}>
                <span><strong>{supportCustomerLabel(item.customer)}</strong><span className="admin-conversation-meta"><time>{dateLabel(item.updatedAt)}</time>{item.unreadByAdmin > 0 && <em aria-label={`안 읽은 메시지 ${item.unreadByAdmin}개`}>{item.unreadByAdmin}</em>}</span></span>
                <p>{item.lastCustomerPreview || item.lastMessagePreview || "새 상담"}</p>
                <small className={item.status}>{SUPPORT_STATUS_LABELS[item.status]}</small>
              </button>
            ))}
          </div>
        </aside>
        {!(loaded && conversations.length === 0) && <section className="admin-chat-room">
          {!chat.conversation ? (
            <div className="admin-chat-placeholder"><MessageCircle /><strong>확인할 문의를 골라 주세요</strong><p>목록에서 문의를 고르면 대화가 보여요.</p></div>
          ) : (
            <>
              <header>
                <div>
                  <strong>{customerLabel}</strong>
                  <small>{selectedCustomer?.kind === "guest" ? "로그인하지 않고 남긴 문의라 계정 정보가 없어요. 답장에서 주문 번호나 이메일을 물어봐 주세요." : selectedCustomer?.kind === "unknown" ? "계정 목록을 읽지 못해 손님을 확인하지 못했어요." : `상담 번호 ${chat.conversation.id.slice(0, 8)}`}</small>
                  {customerEmail && <nav className="admin-chat-customer-links" aria-label="이 고객 기록">
                    <Link href={`/admin/payments?q=${encodeURIComponent(customerEmail)}`}><Banknote /> 결제 주문</Link>
                    <Link href={`/admin/refunds?q=${encodeURIComponent(customerEmail)}`}><RotateCcw /> 환불 요청</Link>
                  </nav>}
                </div>
                <button type="button" onClick={toggleStatus} disabled={busy}><CheckCircle2 />{chat.conversation.status === "open" ? "완료로 바꾸기" : "다시 열기"}</button>
              </header>
              <div className="admin-chat-messages" ref={messageListRef}>
                {chat.messages.map((item) => (
                  <article key={item.id} className={item.sender}>
                    <span>{item.sender === "admin" ? "관리자" : customerLabel}</span>
                    <p>{item.body}</p>
                    <time>{dateLabel(item.createdAt)}</time>
                  </article>
                ))}
              </div>
              <form onSubmit={sendReply}>
                {error && <p>{error}</p>}
                <div><textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={3} maxLength={2000} placeholder="고객에게 보낼 답장을 적어 주세요" /><button type="submit" disabled={busy || !reply.trim()} aria-label="답장 보내기" title="보내기">보내기</button></div>
              </form>
            </>
          )}
        </section>}
      </div>
    </main>
  );
}
