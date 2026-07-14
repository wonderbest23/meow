"use client";

import { CheckCircle2, Headphones, LogOut, MessageCircle, RefreshCw, Send } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { SupportChat, SupportConversation } from "../../lib/support-chat/repository";

type SessionState = { authenticated: boolean; configured: boolean };

async function responsePayload(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "요청을 처리하지 못했습니다.");
  return payload;
}

function shortCustomerName(id: string) {
  return `고객 ${id.slice(0, 4).toUpperCase()}`;
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
  const [password, setPassword] = useState("");
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chat, setChat] = useState<SupportChat>({ conversation: null, messages: [] });
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/admin/support/chat", { cache: "no-store" });
    if (response.status === 401) {
      setSession((current) => ({ authenticated: false, configured: current?.configured ?? true }));
      return [];
    }
    const payload = await responsePayload(response) as { conversations: SupportConversation[] };
    setConversations(payload.conversations);
    setSelectedId((current) => current ?? payload.conversations[0]?.id ?? null);
    return payload.conversations;
  }, []);

  const loadChat = useCallback(async (conversationId: string) => {
    const response = await fetch(`/api/admin/support/chat?conversationId=${encodeURIComponent(conversationId)}`, { cache: "no-store" });
    if (response.status === 401) {
      setSession((current) => ({ authenticated: false, configured: current?.configured ?? true }));
      return;
    }
    const payload = await responsePayload(response) as { chat: SupportChat };
    setChat(payload.chat);
    setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, unreadByAdmin: 0 } : item));
  }, []);

  useEffect(() => {
    void fetch("/api/admin/support/session", { cache: "no-store" })
      .then(responsePayload)
      .then((payload: SessionState) => setSession(payload))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "관리자 상태를 확인하지 못했습니다."));
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    void loadConversations().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "문의 목록을 불러오지 못했습니다."));
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
    void loadChat(selectedId).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "대화를 불러오지 못했습니다."));
  }, [loadChat, selectedId, session?.authenticated]);

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await responsePayload(await fetch("/api/admin/support/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }));
      setPassword("");
      setSession({ authenticated: true, configured: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "로그인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/support/session", { method: "DELETE" });
    setSession((current) => ({ authenticated: false, configured: current?.configured ?? true }));
    setConversations([]);
    setSelectedId(null);
  };

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    const message = reply.trim();
    if (!selectedId || !message || busy) return;
    setBusy(true);
    setError("");
    try {
      const payload = await responsePayload(await fetch("/api/admin/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, message }),
      })) as { chat: SupportChat };
      setChat(payload.chat);
      setReply("");
      await loadConversations();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "답장을 보내지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async () => {
    if (!chat.conversation || busy) return;
    const status = chat.conversation.status === "open" ? "closed" : "open";
    setBusy(true);
    try {
      const payload = await responsePayload(await fetch("/api/admin/support/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: chat.conversation.id, status }),
      })) as { conversation: SupportConversation };
      setChat((current) => ({ ...current, conversation: payload.conversation }));
      await loadConversations();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "상담 상태를 바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (session === null) {
    return <main className="admin-support-loading"><RefreshCw /> 관리자 상담함을 불러오는 중입니다.</main>;
  }

  if (!session.authenticated) {
    return (
      <main className="admin-login-page">
        <form onSubmit={login}>
          <span><Headphones /></span>
          <h1>관리자 상담함</h1>
          <p>고객의 홈페이지 제작과 서비스 이용 문의를 확인하고 답장합니다.</p>
          {!session.configured && <div className="admin-config-warning">서버에 관리자 비밀번호를 먼저 설정해주세요.</div>}
          <label><span>관리자 비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="current-password" /></label>
          {error && <p className="admin-login-error">{error}</p>}
          <button type="submit" disabled={busy || !password || !session.configured}>로그인</button>
          <a href="/">고객 화면으로 돌아가기</a>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-support-page">
      <header className="admin-support-header">
        <div><span><Headphones /></span><div><strong>홈페이지·이용 문의 관리</strong><small>고객 문의와 답변 현황</small></div></div>
        <button type="button" onClick={logout}><LogOut /> 로그아웃</button>
      </header>
      <div className="admin-support-workspace">
        <aside className="admin-conversation-list">
          <header><strong>문의 목록</strong><em>{conversations.filter((item) => item.status === "open").length}건 진행 중</em></header>
          <div>
            {conversations.length === 0 && <p className="admin-empty-list"><MessageCircle /> 아직 접수된 문의가 없습니다.</p>}
            {conversations.map((item) => (
              <button type="button" key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}>
                <span><strong>{shortCustomerName(item.id)}</strong><time>{dateLabel(item.updatedAt)}</time></span>
                <p>{item.lastMessagePreview || "새 상담"}</p>
                <small className={item.status}>{item.status === "open" ? "상담 중" : "완료"}</small>
                {item.unreadByAdmin > 0 && <em>{item.unreadByAdmin}</em>}
              </button>
            ))}
          </div>
        </aside>
        <section className="admin-chat-room">
          {!chat.conversation ? (
            <div className="admin-chat-placeholder"><MessageCircle /><strong>확인할 문의를 선택하세요</strong><p>왼쪽 목록에서 고객 문의를 선택하면 대화가 표시됩니다.</p></div>
          ) : (
            <>
              <header>
                <div><strong>{shortCustomerName(chat.conversation.id)}</strong><small>상담 번호 {chat.conversation.id.slice(0, 8)}</small></div>
                <button type="button" onClick={toggleStatus} disabled={busy}><CheckCircle2 />{chat.conversation.status === "open" ? "상담 완료" : "다시 열기"}</button>
              </header>
              <div className="admin-chat-messages" ref={messageListRef}>
                {chat.messages.map((item) => (
                  <article key={item.id} className={item.sender}>
                    <span>{item.sender === "admin" ? "관리자" : shortCustomerName(chat.conversation!.id)}</span>
                    <p>{item.body}</p>
                    <time>{dateLabel(item.createdAt)}</time>
                  </article>
                ))}
              </div>
              <form onSubmit={sendReply}>
                {error && <p>{error}</p>}
                <div><textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={3} maxLength={2000} placeholder="고객에게 보낼 답변을 입력하세요" /><button type="submit" disabled={busy || !reply.trim()} aria-label="답장 보내기" title="보내기"><Send /></button></div>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
