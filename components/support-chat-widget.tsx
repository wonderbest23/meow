"use client";

import {
  ChevronRight,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { supportFaqCategories, type SupportFaqItem } from "../lib/support-chat/faq";
import type { SupportChat } from "../lib/support-chat/repository";

type QuickMessage = {
  id: string;
  sender: "customer" | "assistant";
  body: string;
  createdAt: string;
  faq?: SupportFaqItem;
  allowOperator?: boolean;
  operatorContext?: string;
};

async function readPayload(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "상담 서버에 연결하지 못했습니다.");
  return payload as { chat: SupportChat };
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function topicChoiceLabel(label: string) {
  const lastCharacter = label.at(-1);
  const code = lastCharacter ? lastCharacter.charCodeAt(0) - 0xac00 : -1;
  const hasFinalConsonant = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${label}${hasFinalConsonant ? "이" : "가"} 궁금해요.`;
}

export function SupportChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<SupportChat>({ conversation: null, messages: [] });
  const [message, setMessage] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<(typeof supportFaqCategories)[number]["id"] | null>(null);
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([]);
  const [showQuickMenu, setShowQuickMenu] = useState(true);
  const [operatorMode, setOperatorMode] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assistantThinking, setAssistantThinking] = useState(false);
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
    if (!open || !window.matchMedia("(max-width: 760px)").matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const messageList = messageListRef.current;
      if (!messageList) return;
      messageList.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chat.messages, open, quickMessages, selectedCategoryId, showQuickMenu]);

  useEffect(() => {
    setShowAllHistory(false);
  }, [quickMessages.length]);

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
        setShowQuickMenu(false);
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
    setShowQuickMenu(false);
    setOperatorMode(false);
    setMessage("");
  };

  const startOperatorInquiry = (faq?: SupportFaqItem, context?: string) => {
    setShowQuickMenu(false);
    setOperatorMode(true);
    setMessage(
      faq
        ? `[${faq.question}]\n추가 문의: `
        : context
          ? `[자동 상담에서 해결되지 않은 질문]\n${context}\n\n추가 문의: `
          : "",
    );
    window.setTimeout(() => textareaRef.current?.focus(), 80);
  };

  const askSupportAssistant = async (nextMessage: string) => {
    const customerCreatedAt = new Date().toISOString();
    setShowQuickMenu(false);
    setOperatorMode(false);
    setMessage("");
    setAssistantThinking(true);
    setQuickMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), sender: "customer", body: nextMessage, createdAt: customerCreatedAt },
    ]);
    try {
      const response = await fetch("/api/support/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: nextMessage,
          page: `${window.location.pathname}${window.location.search}`,
        }),
      });
      const payload = await response.json() as {
        answer?: string;
        needsOperator?: boolean;
        error?: { message?: string };
      };
      if (!response.ok || !payload.answer) throw new Error(payload.error?.message ?? "답변을 만들지 못했습니다.");
      setQuickMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          sender: "assistant",
          body: payload.answer!,
          createdAt: new Date().toISOString(),
          allowOperator: true,
          operatorContext: nextMessage,
        },
      ]);
    } catch {
      setQuickMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          sender: "assistant",
          body: "이 질문은 자동 답변만으로 확정하기 어렵습니다. 현재 화면과 하려던 작업을 함께 적어 운영자에게 남겨주세요.",
          createdAt: new Date().toISOString(),
          allowOperator: true,
        },
      ]);
    } finally {
      setAssistantThinking(false);
    }
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const nextMessage = message.trim();
    if (!nextMessage || sending || assistantThinking) return;

    if (!operatorMode) {
      await askSupportAssistant(nextMessage);
      return;
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
      setShowAllHistory(true);
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

  const openQuestionMenu = () => {
    setShowQuickMenu(true);
    setSelectedCategoryId(null);
    setOperatorMode(false);
    setMessage("");
    window.setTimeout(() => {
      const messageList = messageListRef.current;
      messageList?.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
    }, 20);
  };

  if (pathname.startsWith("/admin")) return null;

  const unread = chat.conversation?.unreadByCustomer ?? 0;
  const selectedCategory = selectedCategoryId
    ? supportFaqCategories.find((category) => category.id === selectedCategoryId) ?? null
    : null;
  const hiddenMessageCount = chat.messages.length;

  return (
    <div className={`support-chat-widget ${open ? "open" : ""}`}>
      {open && (
        <section className="support-chat-panel" role="dialog" aria-label="오늘창업 상담 도우미" aria-modal="true">
          <header>
            <span><img src="/support-agent-avatar-2026.png" alt="" width="48" height="48" /></span>
            <div><strong>오늘창업 상담 도우미</strong><small><i /> 궁금한 내용을 편하게 물어보세요</small></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="문의창 닫기" title="닫기">닫기</button>
          </header>

          <div className="support-chat-body">
            <div className="support-chat-conversation">
              <div className={`support-chat-messages ${showAllHistory ? "history-expanded" : ""}`} ref={messageListRef} aria-live="polite">
                {loading && chat.messages.length === 0 && quickMessages.length === 0 && <p className="support-chat-loading">이전 문의를 불러오는 중입니다.</p>}
                {hiddenMessageCount > 0 && (
                  <button type="button" className="support-chat-history-toggle" onClick={() => setShowAllHistory((current) => !current)}>
                    {showAllHistory ? "최신 대화만 보기" : `이전 대화 ${hiddenMessageCount}개 보기`}
                  </button>
                )}
                {showAllHistory && (
                  <div className="support-chat-saved-history" aria-label="이전 운영자 상담">
                    {chat.messages.map((item) => (
                      <article key={item.id} className={item.sender === "customer" ? "customer" : "admin"}>
                        <span>{item.sender === "customer" ? "나" : "운영자"}</span>
                        <p>{item.body}</p>
                        <time dateTime={item.createdAt}>{messageTime(item.createdAt)}</time>
                      </article>
                    ))}
                  </div>
                )}
                {quickMessages.map((item) => (
                  <article key={item.id} className={item.sender}>
                    <span>{item.sender === "customer" ? "나" : "상담 도우미"}</span>
                    <p>{item.body}</p>
                    {item.sender === "assistant" && (item.faq || item.allowOperator) && (
                      <button type="button" className="support-answer-more" onClick={() => startOperatorInquiry(item.faq, item.operatorContext)}>
                        이 답변으로 해결되지 않았어요 <ChevronRight />
                      </button>
                    )}
                    <time dateTime={item.createdAt}>{messageTime(item.createdAt)}</time>
                  </article>
                ))}
                {assistantThinking && (
                  <div className="support-chat-thinking" role="status" aria-label="상담 답변 작성 중">
                    <span><img src="/support-agent-avatar-2026.png" alt="" width="34" height="34" /></span><i /><i /><i />
                  </div>
                )}
                {showQuickMenu ? (
                  <section className="support-chat-home" aria-label="자주 묻는 질문">
                    <div className="support-chat-bot-message">
                      <span><img src="/support-agent-avatar-2026.png" alt="" width="34" height="34" /></span>
                      <div><strong>무엇을 도와드릴까요?</strong><p>가까운 내용을 말풍선에서 골라주세요.</p></div>
                    </div>
                    {!selectedCategory ? (
                      <div className="support-chat-choice-bubbles" aria-label="문의 종류 선택">
                        {supportFaqCategories.map((category) => (
                          <button type="button" key={category.id} onClick={() => setSelectedCategoryId(category.id)}>
                            {topicChoiceLabel(category.label)}
                          </button>
                        ))}
                        <button type="button" className="operator" onClick={() => startOperatorInquiry()}>
                          운영자에게 직접 문의할게요.
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="support-chat-selected-bubble"><span>{topicChoiceLabel(selectedCategory.label)}</span></div>
                        <div className="support-chat-bot-message compact">
                          <span><img src="/support-agent-avatar-2026.png" alt="" width="34" height="34" /></span>
                          <div><strong>{selectedCategory.label}</strong><p>어떤 내용이 궁금한가요?</p></div>
                        </div>
                        <div className="support-chat-choice-bubbles questions" aria-label={`${selectedCategory.label} 질문 선택`}>
                          {selectedCategory.items.map((item) => (
                            <button type="button" key={item.id} onClick={() => appendFaqAnswer(item)}>
                              {item.question}
                            </button>
                          ))}
                          <button type="button" className="back" onClick={() => setSelectedCategoryId(null)}>다른 내용을 고를게요.</button>
                          <button type="button" className="operator" onClick={() => startOperatorInquiry()}>
                            운영자에게 직접 문의할게요.
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                ) : chat.messages.length === 0 && quickMessages.length === 0 ? (
                  <div className="support-chat-bot-message">
                    <span><img src="/support-agent-avatar-2026.png" alt="" width="34" height="34" /></span>
                    <div><strong>{operatorMode ? "문의 내용을 남겨주세요." : "무엇이 궁금한가요?"}</strong><p>{operatorMode ? "확인 후 이 대화창으로 답변해 드릴게요." : "아래 입력창에 편하게 적어주세요."}</p></div>
                  </div>
                ) : null}
              </div>

              <form className="support-chat-form" onSubmit={sendMessage}>
                <div className="support-chat-form-heading">
                  <span>{operatorMode ? "운영자에게 전달됩니다" : "직접 질문하기"}</span>
                  {!showQuickMenu && <button type="button" onClick={openQuestionMenu}><ClipboardList /> 질문 다시 고르기</button>}
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
                    placeholder={assistantThinking ? "답변을 확인하고 있어요" : operatorMode ? "문의 내용을 적어주세요" : "궁금한 내용을 입력해주세요"}
                    aria-label="문의 메시지"
                    disabled={assistantThinking}
                  />
                  <button type="submit" disabled={!message.trim() || sending || assistantThinking} aria-label="메시지 보내기" title="보내기">보내기</button>
                </div>
                <small><ShieldCheck /> 비밀번호나 주민등록번호는 입력하지 마세요.</small>
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
          <img src="/support-agent-avatar-2026.png" alt="" width="54" height="54" />
          <span>문의</span>
          {unread > 0 && <em>{unread > 9 ? "9+" : unread}</em>}
        </button>
      )}
    </div>
  );
}
