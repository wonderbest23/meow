"use client";

import { Headphones, MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import type { SupportChat } from "../lib/support-chat/repository";

async function readPayload(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "상담 서버에 연결하지 못했습니다.");
  return payload as { chat: SupportChat };
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function SupportChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<SupportChat>({ conversation: null, messages: [] });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const loadChat = useCallback(async (markRead: boolean) => {
    try {
      const response = await fetch(`/api/support/chat${markRead ? "" : "?peek=1"}`, { cache: "no-store" });
      const payload = await readPayload(response);
      setChat(payload.chat);
      setError("");
    } catch (loadError) {
      if (markRead) setError(loadError instanceof Error ? loadError.message : "상담 내용을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    void loadChat(false);
    const timer = window.setInterval(() => void loadChat(open), open ? 4000 : 12000);
    return () => window.clearInterval(timer);
  }, [loadChat, open, pathname]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void loadChat(true);
    window.setTimeout(() => textareaRef.current?.focus(), 80);
  }, [loadChat, open]);

  useEffect(() => {
    if (!open) return;
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages, open]);

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    const openWithMessage = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setOpen(true);
      if (detail?.message?.trim()) setMessage(detail.message.trim());
    };
    window.addEventListener("venture:open-support-chat", openWithMessage);
    return () => window.removeEventListener("venture:open-support-chat", openWithMessage);
  }, []);

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const nextMessage = message.trim();
    if (!nextMessage || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: nextMessage }),
      });
      const payload = await readPayload(response);
      setChat(payload.chat);
      setMessage("");
      textareaRef.current?.focus();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "메시지를 보내지 못했습니다.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  if (pathname.startsWith("/admin")) return null;

  const unread = chat.conversation?.unreadByCustomer ?? 0;

  return (
    <div className={`support-chat-widget ${open ? "open" : ""}`}>
      {open && (
        <section className="support-chat-panel" role="dialog" aria-label="홈페이지 제작과 이용 문의" aria-modal="false">
          <header>
            <span><Headphones /></span>
            <div><strong>홈페이지·이용 문의</strong><small>운영자에게 바로 전달됩니다</small></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="문의창 닫기" title="닫기"><X /></button>
          </header>
          <div className="support-chat-messages" ref={messageListRef} aria-live="polite">
            <div className="support-chat-welcome">
              <MessageCircle />
              <p>홈페이지 디자인·공개 또는 서비스 이용 중 막힌 부분을 남겨주세요. 세무·법률·사업 연결 상담은 제공하지 않습니다.</p>
            </div>
            {loading && chat.messages.length === 0 && <p className="support-chat-loading">대화 내용을 불러오는 중입니다.</p>}
            {chat.messages.map((item) => (
              <article key={item.id} className={item.sender === "customer" ? "customer" : "admin"}>
                <span>{item.sender === "customer" ? "나" : "운영자"}</span>
                <p>{item.body}</p>
                <time dateTime={item.createdAt}>{messageTime(item.createdAt)}</time>
              </article>
            ))}
          </div>
          <form onSubmit={sendMessage}>
            {error && <p className="support-chat-error">{error}</p>}
            <div>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={2000}
                rows={2}
                placeholder="홈페이지 제작 또는 이용 문의"
                aria-label="문의 메시지"
              />
              <button type="submit" disabled={!message.trim() || sending} aria-label="메시지 보내기" title="보내기"><Send /></button>
            </div>
            <small><ShieldCheck /> 주민등록번호, 계좌 비밀번호 같은 민감정보는 보내지 마세요.</small>
          </form>
        </section>
      )}
      <button
        type="button"
        className="support-chat-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? "홈페이지·이용 문의 닫기" : "홈페이지·이용 문의 열기"}
        title={open ? "문의창 닫기" : "홈페이지·이용 문의"}
      >
        {open ? <X /> : <MessageCircle />}
        {!open && unread > 0 && <em>{unread > 9 ? "9+" : unread}</em>}
      </button>
    </div>
  );
}
