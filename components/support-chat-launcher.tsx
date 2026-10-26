"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentProps } from "react";
import type { SupportChat } from "../lib/support-chat/repository";
import { preloadAfterFirstInteraction, preloadOnce } from "../lib/client/preload-on-intent";
import { SUPPORT_BADGE_KEY, supportChatHidden, supportChatPhoneHide } from "./support-chat-visibility";

/*
 * 모든 화면 오른쪽 아래의 '고객센터' 단추 — 단추만 바로 그리고, 상담 창(support-chat-widget)은 필요할 때 받는다.
 *
 * 상담 창은 사업 기획 저장소·상담 도메인까지 끌고 와 약관 화면도 처음 받는 JS 가 커졌다(점검 r42-B 결정 1).
 * 단추 모양·자리·안 읽은 숫자는 예전 상담 창이 그리던 것과 같은 마크업으로 여기서 먼저 그리고,
 * 마우스를 올리거나 초점이 가면(폰은 화면을 처음 누르면 한가할 때) 상담 창 코드를 미리 받아 둔다.
 * 단추를 누르면 그 코드로 바꿔 끼우며 열린 채로 시작한다 — 받아 둔 뒤라 바로 열린다.
 */
const widget = preloadOnce(() => import("./support-chat-widget"));

/* 바꿔 끼우는 한 순간에도 같은 단추가 보이게(자리·숫자가 깜빡이지 않게) 마지막 값을 들고 있는다 */
let lastShown: { unread: number; phoneHide: string | undefined } = { unread: 0, phoneHide: undefined };

function LauncherButton({ unread, phoneHide, pending = false, ...button }: { unread: number; phoneHide: string | undefined; pending?: boolean } & Omit<ComponentProps<"button">, "type" | "className">) {
  return (
    <div className="support-chat-widget " data-phone-hide={phoneHide}>
      <button
        {...button}
        type="button"
        className="support-chat-toggle"
        aria-expanded="false"
        aria-label="고객센터 열기"
        aria-busy={pending || undefined}
        title="고객센터"
      >
        <img src="/support-agent-avatar-2026.png" alt="" width="54" height="54" />
        <span>고객센터</span>
        {unread > 0 && <em>{unread > 9 ? "9+" : unread}</em>}
      </button>
    </div>
  );
}

const SupportChatWidget = dynamic(() => widget.get().then((module) => module.SupportChatWidget), {
  ssr: false,
  loading: () => <LauncherButton unread={lastShown.unread} phoneHide={lastShown.phoneHide} pending />,
});

export function SupportChatLauncher() {
  const pathname = usePathname();
  const [onPublicSite, setOnPublicSite] = useState(false);
  useEffect(() => { setOnPublicSite(Boolean(document.querySelector(".public-landing"))); }, [pathname]);
  const hidden = supportChatHidden(pathname, onPublicSite);
  const [badge, setBadge] = useState(true);
  useEffect(() => { try { setBadge(window.localStorage.getItem(SUPPORT_BADGE_KEY) !== "0"); } catch { /* 저장소를 못 쓰면 켬 */ } }, []);
  const [chat, setChat] = useState<SupportChat | undefined>(undefined);
  /* 눌렀다(코드를 받는 중) → 받으면 상담 창으로 바꿔 끼운다 */
  const [pending, setPending] = useState(false);
  const [mounted, setMounted] = useState(false);

  /* 안 읽은 답 숫자 — 상담 창이 하던 것과 같이 화면이 바뀔 때·12초마다(다른 탭을 보는 동안은 쉰다) 읽음 표시 없이 살핀다 */
  useEffect(() => {
    if (hidden || mounted) return;
    let latest = 0;
    const peek = () => {
      const request = ++latest;
      void fetch("/api/support/chat?peek=1", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { chat?: SupportChat } | null) => { if (payload?.chat && request === latest) setChat(payload.chat); })
        .catch(() => { /* 숫자만 못 그린다 — 상담 창을 열면 다시 불러온다 */ });
    };
    peek();
    const timer = window.setInterval(() => { if (!document.hidden) peek(); }, 12000);
    return () => { latest += 1; window.clearInterval(timer); };
  }, [pathname, hidden, mounted]);

  useEffect(() => {
    if (hidden || mounted) return;
    return preloadAfterFirstInteraction(widget.warm);
  }, [hidden, mounted]);

  /*
   * 한 번 받은 상담 창은 계속 둔다 — 단추를 숨기는 화면에 다녀와도 나눈 상담이 남는다(창이 스스로 숨는다).
   * 받는 사이 단추를 숨기는 화면으로 옮겨 갔으면 닫힌 채로 붙인다(initialOpen 은 처음 붙일 때만 읽는다).
   */
  if (mounted) return <SupportChatWidget initialOpen={!hidden} initialChat={chat} initialBadge={badge} />;
  if (hidden) return null;

  const unread = badge ? chat?.conversation?.unreadByCustomer ?? 0 : 0;
  const phoneHide = supportChatPhoneHide(pathname);
  lastShown = { unread, phoneHide };
  const open = () => {
    if (pending) return;
    setPending(true);
    widget.get().then(() => setMounted(true), () => setPending(false));
  };
  return <LauncherButton unread={unread} phoneHide={phoneHide} pending={pending} onClick={open} onPointerEnter={widget.warm} onFocus={widget.warm} onTouchStart={widget.warm} />;
}
