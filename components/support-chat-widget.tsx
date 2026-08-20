"use client";

import {
  ArrowUp,
  ChevronRight,
  ClipboardList,
  MessageCircleQuestion,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { supportFaqCategories, type SupportFaqItem } from "../lib/support-chat/faq";
import type { SupportChat } from "../lib/support-chat/repository";
import {
  CONSULT_INPUT_EXAMPLES,
  CONSULT_OPENING,
  CONSULT_STARTERS,
  SUPPORT_INPUT_EXAMPLES,
  PROFILE_LABELS,
  type ConsultPick,
  type ConsultProfile,
} from "../lib/consult/domain";

/*
 * 이 위젯은 두 가지를 한다.
 *
 * 창업 상담 — 열면 처음 보이는 것. "뭘 해야 할지 모르겠다"는 사람에게 되물어
 *   조건에 맞는 아이템을 같이 찾는다. 공짜로 주는 것이고, 여기서 잡은 조건이
 *   그대로 사업계획서로 넘어간다.
 * 서비스 문의 — 결제·환불처럼 우리 서비스 자체를 묻는 것. 예전부터 있던 기능이라
 *   그대로 두고 아래 줄로 내렸다.
 *
 * 상담 대화는 서버에 저장하지 않는다. 로그인 전에도 쓰고, 남의 창업 고민을 우리가
 * 들고 있을 이유가 없다. 이 화면이 들고 있다가 매번 함께 보낸다.
 */
type ConsultTurn = { id: string; role: "user" | "assistant"; text: string; at: string };

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
  /* 열면 상담부터 — 문의는 눌러서 간다 */
  const [mode, setMode] = useState<"consult" | "support">("consult");
  const [consultTurns, setConsultTurns] = useState<ConsultTurn[]>([]);
  const [consultProfile, setConsultProfile] = useState<ConsultProfile>({});
  const [consultChoices, setConsultChoices] = useState<string[]>([]);
  const [consultSummary, setConsultSummary] = useState<string[]>([]);
  const [consultPicks, setConsultPicks] = useState<ConsultPick[]>([]);
  const [consultReady, setConsultReady] = useState(false);
  const [consultThinking, setConsultThinking] = useState(false);
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
  /* 홈 히어로 검색창에서 온 질문을 리스너([] deps)가 최신 함수로 부를 수 있게 */
  const askConsultRef = useRef<(m: string) => Promise<void>>(async () => {});

  /*
   * 입력창 예시 돌리기.
   *
   * "편하게 적어주세요" 로는 무엇을 얼마나 적어야 할지 알 수 없다. 지역·업종이
   * 들어간 실제 문장을 예시로 띄우면 사람들이 그 형태로 따라 쓴다.
   *
   * 이미 뭔가 친 뒤에는 바꾸지 않는다 — 자기가 쓰던 자리에서 글자가 움직이면
   * 방해가 된다. 움직임을 줄여 달라고 한 사람에게는 첫 예시만 고정한다.
   */
  const [exampleIndex, setExampleIndex] = useState(0);

  useEffect(() => {
    if (!open || message.trim()) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setExampleIndex((n) => n + 1), 3600);
    return () => clearInterval(timer);
  }, [open, message]);

  const inputExamples = mode === "consult" ? CONSULT_INPUT_EXAMPLES : SUPPORT_INPUT_EXAMPLES;
  const inputExample = inputExamples[exampleIndex % inputExamples.length];

  /*
   * 언제 '사업계획서 시작'을 권할까.
   *
   * 모델이 주는 ready 하나에만 맡겨 두면 영영 안 뜰 수 있다 — 실제로 상담이
   * 채팅만 계속되고 다음 단계로 넘어가는 문이 안 열렸다. 모델의 판단과 별개로
   * 화면에서도 셀 수 있는 조건을 함께 본다.
   *
   * 두 단계로 권한다.
   *  중간 — 조건 2개 + 손님이 두 번 말했으면 '지금까지 내용으로도 시작할 수 있다'고
   *         조용히 알린다. 상담을 끊지 않도록 눈에 덜 띄는 줄로.
   *  최종 — 아이템 추천이 나왔거나 조건이 충분히 모이면 큰 버튼으로 권한다.
   */
  const consultFilled = Object.values(consultProfile).filter(
    (v) => typeof v === "string" && v.trim().length > 0,
  ).length;
  const consultUserTurns = consultTurns.filter((t) => t.role === "user").length;
  const canStartPlan =
    consultReady || consultPicks.length > 0 || (consultFilled >= 4 && consultUserTurns >= 3);
  const canStartEarly = !canStartPlan && consultFilled >= 2 && consultUserTurns >= 2;
  const consultHandoffHref = `/plan/start?consult=${encodeURIComponent(JSON.stringify(consultProfile))}`;

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
      const detail = (event as CustomEvent<{ message?: string; mode?: "consult" | "support" }>).detail;
      setOpen(true);
      /*
       * 어느 창으로 열지 부르는 쪽이 정한다.
       * 이 창은 한 번 문의 쪽으로 넘어가면 그대로 있어서, 홈에서 '창업 상담'을
       * 눌렀는데 지난번에 보던 문의 화면이 나오는 일이 있었다.
       */
      if (detail?.mode) setMode(detail.mode);
      const text = detail?.message?.trim();
      if (!text) return;
      if (detail?.mode === "consult") {
        /* 히어로 검색창에서 친 질문 — 열리자마자 바로 보낸다. 다시 치게 하지 않는다. */
        void askConsultRef.current(text);
      } else {
        setShowQuickMenu(false);
        setOperatorMode(true);
        setMessage(text);
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

  const askConsult = async (nextMessage: string) => {
    setMessage("");
    setConsultChoices([]);
    setConsultThinking(true);
    const asked: ConsultTurn = { id: crypto.randomUUID(), role: "user", text: nextMessage, at: new Date().toISOString() };
    setConsultTurns((current) => [...current, asked]);
    try {
      const response = await fetch("/api/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: nextMessage,
          /* 서버는 대화를 기억하지 않는다 — 앞의 말을 우리가 들고 가서 보낸다 */
          history: consultTurns.slice(-12).map((turn) => ({ role: turn.role, text: turn.text })),
          profile: consultProfile,
        }),
      });
      const payload = (await response.json()) as {
        message?: string;
        profile?: ConsultProfile;
        choices?: string[];
        summary?: string[];
        picks?: ConsultPick[];
        ready?: boolean;
      };
      if (!response.ok || !payload.message) throw new Error("상담을 이어가지 못했습니다.");
      setConsultTurns((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: payload.message!, at: new Date().toISOString() }]);
      /* 알아낸 것이 하나도 없으면 앞서 모은 것을 지우지 않는다 */
      if (payload.profile && Object.keys(payload.profile).length) setConsultProfile(payload.profile);
      setConsultChoices(payload.choices ?? []);
      setConsultSummary(payload.summary ?? []);
      setConsultPicks(payload.picks ?? []);
      /*
       * 한 번 '방향이 잡혔다'가 되면 되돌리지 않는다.
       *
       * 예전에는 매 턴 payload.ready 로 덮어써서, 모델이 한 번 true 를 준 뒤
       * 다음 턴에 false 를 주면 '창업계획 만들기' 버튼이 사라졌다. 손님 입장에서는
       * 버튼이 깜빡이다 없어지는 셈이라 아무도 누르지 못했다.
       */
      if (payload.ready) setConsultReady(true);
    } catch {
      setConsultTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "지금은 상담을 이어가지 못했습니다. 잠시 후 다시 말씀해 주세요.",
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setConsultThinking(false);
    }
  };
  askConsultRef.current = askConsult;

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
    if (!nextMessage || sending || assistantThinking || consultThinking) return;

    if (mode === "consult") {
      await askConsult(nextMessage);
      return;
    }

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
            <div>
              <strong>{mode === "consult" ? "무료 창업 상담" : "서비스 이용 문의"}</strong>
              <small><i /> {mode === "consult" ? "뭘 할지 몰라도 괜찮아요" : "결제·환불·이용 방법을 물어보세요"}</small>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="문의창 닫기" title="닫기">닫기</button>
          </header>

          <div className="support-chat-body">
            <div className="support-chat-conversation">
              <div className={`support-chat-messages ${showAllHistory ? "history-expanded" : ""}`} ref={messageListRef} aria-live="polite">
                {mode === "consult" ? (
                  <section className="consult-pane" aria-label="창업 상담">
                    {consultTurns.length === 0 && (
                      <>
                        {/*
                          * 첫 인사도 뒤따르는 상담사 말과 같은 모양으로.
                          * 여기만 다른 틀을 쓰면 첫 화면과 대화 중 화면이 다른 서비스처럼 보인다.
                          */}
                        <article className="assistant">
                          <header>
                            <img src="/support-agent-avatar-2026.png" alt="" width="28" height="28" />
                            <span>상담사</span>
                          </header>
                          <p>{CONSULT_OPENING}</p>
                        </article>
                        <div className="support-chat-choice-bubbles" aria-label="상담 시작 고르기">
                          {CONSULT_STARTERS.map((starter) => (
                            <button type="button" key={starter} onClick={() => void askConsult(starter)}>{starter}</button>
                          ))}
                        </div>
                      </>
                    )}

                    {consultTurns.map((turn) => (
                      <article key={turn.id} className={turn.role === "user" ? "customer" : "assistant"}>
                        {/* 누가 말했는지 얼굴과 이름으로 — 색만으로 구분하면 색을 못 가리는 분이 헷갈린다 */}
                        <header>
                          {turn.role === "assistant" && <img src="/support-agent-avatar-2026.png" alt="" width="28" height="28" />}
                          <span>{turn.role === "user" ? "나" : "상담사"}</span>
                        </header>
                        <p>{turn.text}</p>
                        <time dateTime={turn.at}>{messageTime(turn.at)}</time>
                      </article>
                    ))}

                    {consultThinking && (
                      <div className="consult-planning" role="status" aria-label="답변 준비 중">
                        <span>답변 계획 중…</span>
                        <i /><i /><i />
                      </div>
                    )}

                    {/* 중간 정리 — 내 상황을 이해하고 있다는 것이 보여야 계속 답한다 */}
                    {!consultThinking && consultSummary.length > 0 && (
                      <div className="consult-summary" aria-label="지금까지 파악한 내용">
                        <strong>지금까지 파악한 내용</strong>
                        <ul>{consultSummary.map((line) => <li key={line}>{line}</li>)}</ul>
                      </div>
                    )}

                    {!consultThinking && consultPicks.length > 0 && (
                      <div className="consult-picks" aria-label="추천 아이템">
                        {consultPicks.map((pick) => (
                          <article key={pick.name}>
                            <header>
                              <strong>{pick.name}</strong>
                              <span aria-label={`적합도 ${pick.fit}점`}>{"★".repeat(pick.fit)}{"☆".repeat(5 - pick.fit)}</span>
                            </header>
                            {pick.why.length > 0 && (
                              <div><em>왜 맞나요</em><ul>{pick.why.map((line) => <li key={line}>{line}</li>)}</ul></div>
                            )}
                            {pick.watch.length > 0 && (
                              <div className="watch"><em>주의할 점</em><ul>{pick.watch.map((line) => <li key={line}>{line}</li>)}</ul></div>
                            )}
                          </article>
                        ))}
                      </div>
                    )}

                    {/* 눌러서 답하기 — 직접 쓰기 싫은 사람이 대부분이다 */}
                    {!consultThinking && consultChoices.length > 0 && (
                      <div className="support-chat-choice-bubbles" aria-label="답 고르기">
                        {consultChoices.map((choice) => (
                          <button type="button" key={choice} onClick={() => void askConsult(choice)}>{choice}</button>
                        ))}
                      </div>
                    )}

                    {/*
                      * 다음 단계로 가는 문. 여기서 모은 조건은 사업계획서 첫 화면으로
                      * 그대로 넘어간다 — 같은 것을 두 번 묻지 않는다.
                      */}
                    {!consultThinking && canStartEarly && (
                      <a className="consult-cta-soft" href={consultHandoffHref}>
                        지금까지 답한 내용으로 사업계획서를 시작할 수 있어요
                        <b>{consultFilled}개 항목이 그대로 넘어갑니다 →</b>
                      </a>
                    )}
                    {!consultThinking && canStartPlan && (
                      <a className="consult-cta" href={consultHandoffHref}>
                        <Sparkles /> 이 내용으로 사업계획서 시작하기
                      </a>
                    )}

                    <button type="button" className="consult-to-support" onClick={() => { setMode("support"); setShowQuickMenu(true); }}>
                      <MessageCircleQuestion /> 서비스 이용 문의는 여기
                    </button>
                  </section>
                ) : null}

                {mode === "support" && loading && chat.messages.length === 0 && quickMessages.length === 0 && <p className="support-chat-loading">이전 문의를 불러오는 중입니다.</p>}
                {mode === "support" && hiddenMessageCount > 0 && (
                  <button type="button" className="support-chat-history-toggle" onClick={() => setShowAllHistory((current) => !current)}>
                    {showAllHistory ? "최신 대화만 보기" : `이전 대화 ${hiddenMessageCount}개 보기`}
                  </button>
                )}
                {mode === "support" && showAllHistory && (
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
                {mode === "support" && quickMessages.map((item) => (
                  <article key={item.id} className={item.sender}>
                    <span>{item.sender === "customer" ? "나" : "상담 도우미"}</span>
                    <p>{item.body}</p>
                    {item.sender === "assistant" && item.faq?.link && (
                      <a className="support-answer-link" href={item.faq.link.href}>
                        {item.faq.link.label} <ChevronRight />
                      </a>
                    )}
                    {item.sender === "assistant" && (item.faq || item.allowOperator) && (
                      <button type="button" className="support-answer-more" onClick={() => startOperatorInquiry(item.faq, item.operatorContext)}>
                        이 답변으로 해결되지 않았어요 <ChevronRight />
                      </button>
                    )}
                    <time dateTime={item.createdAt}>{messageTime(item.createdAt)}</time>
                  </article>
                ))}
                {mode === "support" && assistantThinking && (
                  <div className="support-chat-thinking" role="status" aria-label="문의 답변 작성 중">
                    <span><img src="/support-agent-avatar-2026.png" alt="" width="34" height="34" /></span><i /><i /><i />
                  </div>
                )}
                {mode === "support" && showQuickMenu ? (
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
                    <button type="button" className="consult-to-support" onClick={() => setMode("consult")}>
                      <Sparkles /> 창업 상담으로 돌아가기
                    </button>
                  </section>
                ) : mode === "support" && chat.messages.length === 0 && quickMessages.length === 0 ? (
                  <div className="support-chat-bot-message">
                    <span><img src="/support-agent-avatar-2026.png" alt="" width="34" height="34" /></span>
                    <div><strong>{operatorMode ? "문의 내용을 남겨주세요." : "무엇이 궁금한가요?"}</strong><p>{operatorMode ? "확인 후 이 대화창으로 답변해 드릴게요." : "예) 결제한 문서를 다시 내려받고 싶어요 — 이렇게 한 줄로 적어주세요."}</p></div>
                  </div>
                ) : null}
              </div>

              <form className="support-chat-form" onSubmit={sendMessage}>
                <div className="support-chat-form-heading">
                  <span>{mode === "consult" ? "상담사에게 이야기하기" : operatorMode ? "운영자에게 전달됩니다" : "직접 질문하기"}</span>
                  {mode === "support" && !showQuickMenu && <button type="button" onClick={openQuestionMenu}><ClipboardList /> 질문 다시 고르기</button>}
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
                    placeholder={
                      mode === "consult"
                        ? consultThinking ? "상담사가 답을 쓰고 있어요" : inputExample
                        : assistantThinking ? "답변을 확인하고 있어요" : operatorMode ? "예) 결제가 안 되는데 확인해 주세요" : inputExample
                    }
                    aria-label={mode === "consult" ? "상담 메시지" : "문의 메시지"}
                    disabled={assistantThinking || consultThinking}
                  />
                  {/*
                    * 보내기는 입력칸 오른쪽 옆이 아니라 입력칸 '안' 오른쪽 아래에 둔다.
                    * 옆에 두면 입력칸이 그만큼 좁아지고, 좁은 칸에서는 사람들이
                    * 한 줄만 쓰고 만다. 안으로 넣으면 쓰는 자리는 넓어지고 버튼은
                    * 손가락이 가는 자리(오른쪽 아래)에 온다.
                    */}
                  <button type="submit" disabled={!message.trim() || sending || assistantThinking || consultThinking} aria-label="메시지 보내기" title="보내기"><ArrowUp aria-hidden="true" /></button>
                </div>
                <small><ShieldCheck /> 비밀번호나 주민등록번호는 입력하지 마세요.</small>
                <small className="ai-caution">AI 답변에는 정확하지 않은 정보가 포함될 수 있어요.</small>
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
          aria-label="무료 창업 상담 열기"
          title="무료 창업 상담"
        >
          <img src="/support-agent-avatar-2026.png" alt="" width="54" height="54" />
          <span>창업 상담</span>
          {unread > 0 && <em>{unread > 9 ? "9+" : unread}</em>}
        </button>
      )}
    </div>
  );
}
