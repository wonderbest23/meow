"use client";

import {
  Bot,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  CreditCard,
  FileText,
  Globe2,
  Headphones,
  LifeBuoy,
  MessageCircle,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { findSupportFaq, supportFaqCategories, type SupportFaqItem } from "../lib/support-chat/faq";
import type { SupportChat } from "../lib/support-chat/repository";

type QuickMessage = {
  id: string;
  sender: "customer" | "assistant";
  body: string;
  createdAt: string;
  faq?: SupportFaqItem;
};

const categoryIcons = {
  start: CircleHelp,
  project: ClipboardList,
  files: FileText,
  landing: Globe2,
  account: UserRound,
  payment: CreditCard,
  error: LifeBuoy,
};

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
  const [selectedCategoryId, setSelectedCategoryId] = useState<(typeof supportFaqCategories)[number]["id"]>("start");
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([]);
  const [operatorMode, setOperatorMode] = useState(false);
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
  }, [loadChat, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages, open, quickMessages]);

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
      if (detail?.message?.trim()) {
        setOperatorMode(true);
        setMessage(detail.message.trim());
        window.setTimeout(() => textareaRef.current?.focus(), 80);
      }
    };
    window.addEventListener("venture:open-support-chat", openWithMessage);
    return () => window.removeEventListener("venture:open-support-chat", openWithMessage);
  }, []);

  const appendFaqAnswer = (faq: SupportFaqItem, customerText = faq.question) => {
    const now = Date.now();
    setQuickMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), sender: "customer", body: customerText, createdAt: new Date(now).toISOString() },
      { id: crypto.randomUUID(), sender: "assistant", body: faq.answer, createdAt: new Date(now + 1).toISOString(), faq },
    ]);
    setOperatorMode(false);
    setMessage("");
  };

  const startOperatorInquiry = (faq?: SupportFaqItem) => {
    setOperatorMode(true);
    setMessage(faq ? `[${faq.question}]\n추가 문의: ` : "");
    window.setTimeout(() => textareaRef.current?.focus(), 80);
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const nextMessage = message.trim();
    if (!nextMessage || sending) return;

    if (!operatorMode) {
      const matchedFaq = findSupportFaq(nextMessage);
      if (matchedFaq) {
        appendFaqAnswer(matchedFaq, nextMessage);
        return;
      }
    }

    setOperatorMode(true);
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
  const selectedCategory = supportFaqCategories.find((category) => category.id === selectedCategoryId) ?? supportFaqCategories[0];

  return (
    <div className={`support-chat-widget ${open ? "open" : ""}`}>
      {open && (
        <section className="support-chat-panel" role="dialog" aria-label="오늘창업 상담 도우미" aria-modal="true">
          <header>
            <span><Headphones /></span>
            <div><strong>오늘창업 상담 도우미</strong><small>자주 묻는 질문은 바로 답해드려요</small></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="문의창 닫기" title="닫기"><X /></button>
          </header>

          <div className="support-chat-body">
            <aside className="support-chat-guide" aria-label="문의 종류와 자주 묻는 질문">
              <div className="support-guide-intro">
                <Bot />
                <div><strong>무엇이 궁금한가요?</strong><p>문의 종류를 고르면 자주 묻는 질문을 바로 확인할 수 있어요.</p></div>
              </div>

              <nav className="support-category-list" aria-label="문의 종류">
                {supportFaqCategories.map((category) => {
                  const CategoryIcon = categoryIcons[category.id];
                  return (
                    <button
                      type="button"
                      key={category.id}
                      className={category.id === selectedCategory.id ? "active" : ""}
                      onClick={() => setSelectedCategoryId(category.id)}
                    >
                      <CategoryIcon />
                      <span><strong>{category.label}</strong><small>{category.description}</small></span>
                    </button>
                  );
                })}
              </nav>

              <section className="support-question-templates">
                <div><strong>{selectedCategory.label}</strong><small>많이 묻는 질문</small></div>
                {selectedCategory.items.map((item) => (
                  <button type="button" key={item.id} onClick={() => appendFaqAnswer(item)}>
                    <span>{item.question}</span><ChevronRight />
                  </button>
                ))}
              </section>

              <button type="button" className="support-operator-button" onClick={() => startOperatorInquiry()}>
                <Headphones /><span><strong>운영자에게 문의</strong><small>정해진 답변으로 해결되지 않을 때</small></span><ChevronRight />
              </button>
            </aside>

            <div className="support-chat-conversation">
              <div className="support-chat-messages" ref={messageListRef} aria-live="polite">
                <div className="support-chat-welcome">
                  <Bot />
                  <div><strong>안녕하세요. 무엇을 도와드릴까요?</strong><p>왼쪽의 질문을 누르거나 아래 입력창에 궁금한 내용을 적어주세요.</p></div>
                </div>
                {loading && chat.messages.length === 0 && <p className="support-chat-loading">이전 문의를 불러오는 중입니다.</p>}
                {chat.messages.map((item) => (
                  <article key={item.id} className={item.sender === "customer" ? "customer" : "admin"}>
                    <span>{item.sender === "customer" ? "나" : "운영자"}</span>
                    <p>{item.body}</p>
                    <time dateTime={item.createdAt}>{messageTime(item.createdAt)}</time>
                  </article>
                ))}
                {quickMessages.map((item) => (
                  <article key={item.id} className={item.sender}>
                    <span>{item.sender === "customer" ? "나" : "상담 도우미"}</span>
                    <p>{item.body}</p>
                    {item.sender === "assistant" && item.faq && (
                      <button type="button" className="support-answer-more" onClick={() => startOperatorInquiry(item.faq)}>
                        이 답변으로 해결되지 않았어요 <ChevronRight />
                      </button>
                    )}
                    <time dateTime={item.createdAt}>{messageTime(item.createdAt)}</time>
                  </article>
                ))}
              </div>

              <form className="support-chat-form" onSubmit={sendMessage}>
                <div className="support-chat-form-heading">
                  <span>{operatorMode ? "운영자 문의" : "상담 도우미에게 질문"}</span>
                  {operatorMode && <button type="button" onClick={() => { setOperatorMode(false); setMessage(""); }}>자주 묻는 질문으로 돌아가기</button>}
                </div>
                {error && <p className="support-chat-error">{error}</p>}
                <div className="support-chat-input-row">
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={2000}
                    rows={2}
                    placeholder={operatorMode ? "운영자에게 전달할 내용을 적어주세요" : "예: 다음 버튼이 눌리지 않아요"}
                    aria-label="문의 메시지"
                  />
                  <button type="submit" disabled={!message.trim() || sending} aria-label="메시지 보내기" title="보내기"><Send /></button>
                </div>
                <small><ShieldCheck /> 주민등록번호, 계좌 비밀번호 같은 민감정보는 보내지 마세요.</small>
              </form>
            </div>
          </div>
        </section>
      )}
      {!open && (
        <button
          type="button"
          className="support-chat-toggle"
          onClick={() => setOpen(true)}
          aria-expanded="false"
          aria-label="홈페이지·이용 문의 열기"
          title="홈페이지·이용 문의"
        >
          <MessageCircle />
          {unread > 0 && <em>{unread > 9 ? "9+" : unread}</em>}
        </button>
      )}
    </div>
  );
}
