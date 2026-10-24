"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Menu, Search, UserRound, X } from "lucide-react";
import { CtaArrow } from "./cta-arrow";
import { useDialogFocus } from "./use-dialog-focus";
import { loadAuthSession } from "../lib/client/auth-session";
import menuStyles from "./site-header-menu.module.css";

/*
 * 화면 맨 위 띠.
 *
 * 홈은 이 컴포넌트를 쓰는데 계정 화면은 자기 헤더를 따로 그리고 있었다. 그래서
 * 좌우 여백(14px vs 18px)과 아래 테두리가 어긋났고, 오른쪽에 놓이는 것도 서로
 * 달랐다 — 홈은 마이페이지 아이콘과 '시작하기', 계정 화면은 '홈으로' 글자였다.
 * 로고와 높이만 같고 나머지가 달라, 화면을 옮길 때마다 띠가 조금씩 움직였다.
 *
 * 한 곳에서 그린다. 화면마다 다른 건 넘겨받는 값으로만 갈린다.
 */

/** 로고 그림 파일 — 화면마다 다른 원본을 쓸 수 있다(홈은 검정 화면용 흰 글자) */
export type SiteLogoAsset = { src: string; width: number; height: number };
/* 화면에는 최대 32px 높이로만 그린다 — 3배 크기(384×96, 13KB) 작은 파일을 쓴다. 큰 원본(.png)은 공유 그림 등 큰 크기가 필요한 곳용 */
export const DEFAULT_LOGO: SiteLogoAsset = { src: "/today-startup-logo-2026-sm.webp", width: 384, height: 96 };

/** 로고 단추 — 머리말 말고 바닥글에서도 쓴다 */
export function SiteLogo({ onClick, logo = DEFAULT_LOGO }: { onClick: () => void; logo?: SiteLogoAsset }) {
  return (
    <button className="brand" onClick={onClick} aria-label="오늘창업 홈으로">
      <img className="brand-logo" src={logo.src} alt="오늘창업" width={logo.width} height={logo.height} />
    </button>
  );
}

/**
 * 로그인했는지 — 확인 전이나 확인하지 못했으면 null(로그인한 사람에게 로그인 단추가 잠깐 뜨지 않게, 아무것도 그리지 않는 쪽으로).
 * 첫 화면의 머리말·입력칸 안내·바닥글이 같이 묻는다(같은 순간의 요청은 loadAuthSession 이 하나로 나눠 쓴다).
 */
export function useSignedIn(enabled = true): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadAuthSession()
      .then(data => { if (alive) setSignedIn(!!data.authenticated); })
      .catch(() => {});
    return () => { alive = false; };
  }, [enabled]);
  return signedIn;
}

/* 첫 화면 구간 링크 — 이름은 각 구간 제목과 같게(진행 방식 · 결과물 · 이용 요금) */
const HOME_SECTIONS: Array<[string, string]> = [["#how", "진행 방식"], ["#deliverables", "결과물"], ["#price", "이용 요금"]];
/* 바닥글의 안내 링크와 같은 것 */
const LEGAL_LINKS: Array<[string, string]> = [["/business-info", "사업자·통신판매 정보"], ["/privacy", "개인정보처리방침"], ["/ai-notice", "인공지능·국외 처리"], ["/terms", "이용약관"], ["/refund", "취소·환불 기준"]];

/** 머리말 오른쪽 — 로그인했으면 '내 사업'(첫 화면만)과 내 계정 아이콘, 아니면 '로그인 · 회원가입' 두 단추(헷갈리지 않게 글자로) */
function AccountActions({ signedIn, plans }: { signedIn: boolean | null; plans: boolean }) {
  /* 확인 전에는 비워 둔다 — 로그인 단추가 잠깐 보였다 바뀌지 않게 */
  if (signedIn === null) return null;
  if (signedIn) return <>
    {plans && <a className="header-login header-plans" href="/plan">내 사업</a>}
    <a className="account-link" href="/account" aria-label="내 계정" title="내 계정"><UserRound /></a>
  </>;
  /* /account?next= 링크는 로그인 팝업(login-dialog)이 받아 이 화면에서 연다 */
  return <>
    <a className="header-login" href="/account?next=%2Fplan">로그인</a>
    <a className="header-signup" href="/account?mode=register&next=%2Fplan">회원가입</a>
  </>;
}

/*
 * 첫 화면의 휴대폰·태블릿(900px 이하) 메뉴 — 구간 링크가 머리말에서 사라지는 폭이라 ☰ 로 연다.
 * 작업 화면 서랍(BusinessAppChrome)과 같은 규칙: 열면 '메뉴 닫기'로 초점, Tab 은 메뉴 안에서만, Esc·바깥 누르기로 닫기,
 * 뒤 화면은 inert, 닫으면 ☰ 단추로 초점이 돌아온다. 메뉴는 body 바로 아래에 그려 뒤 화면 전체를 inert 로 막는다.
 */
function HomeMenu({ signedIn }: { signedIn: boolean | null }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  /* 뒤 화면 막기 — 초점 되돌리기(useDialogFocus 의 정리)보다 먼저 풀리도록 이 효과를 앞에 둔다 */
  useEffect(() => {
    if (!open) return;
    const blocked: Element[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child === layer.current || child.hasAttribute("inert") || child.tagName === "SCRIPT") continue;
      child.setAttribute("inert", "");
      blocked.push(child);
    }
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    /* 태블릿을 돌려 넓어지면(900px 초과) 메뉴 단추가 사라지므로 닫는다 */
    const wide = window.matchMedia("(min-width: 901px)");
    const onWide = () => { if (wide.matches) setOpen(false); };
    wide.addEventListener("change", onWide);
    return () => {
      for (const child of blocked) child.removeAttribute("inert");
      root.style.overflow = overflow;
      wide.removeEventListener("change", onWide);
    };
  }, [open]);
  const panel = useDialogFocus<HTMLElement>(open, { onEscape: () => setOpen(false), initialFocus: () => closeButton.current });
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) { wasOpen.current = true; return; }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) toggle.current?.focus({ preventScroll: true });
  }, [open]);
  /* 메뉴 안 링크를 누르면 닫는다 — 같은 화면의 구간(#how 등)으로 갈 때도 메뉴가 덮고 있지 않게 */
  const onLink = (event: MouseEvent) => { if ((event.target as Element).closest("a[href]")) setOpen(false); };
  return <>
    <button ref={toggle} type="button" className={`home-menu-toggle ${menuStyles.toggle}`} aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open} aria-controls="home-menu" onClick={() => setOpen(value => !value)}><Menu size={22} aria-hidden="true" /></button>
    {open && createPortal(<div ref={layer} className={menuStyles.layer}>
      <div className={menuStyles.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside ref={panel} id="home-menu" className={menuStyles.panel} role="dialog" aria-modal="true" aria-label="메뉴" onClickCapture={onLink}>
        <button ref={closeButton} type="button" className={menuStyles.close} aria-label="메뉴 닫기" onClick={() => setOpen(false)}><X size={22} aria-hidden="true" /></button>
        <nav aria-label="첫 화면 안내" className={menuStyles.group}>
          {HOME_SECTIONS.map(([href, label]) => <a key={href} href={href} className={menuStyles.link}>{label}</a>)}
        </nav>
        {signedIn !== null && <div className={menuStyles.group} role="group" aria-label="계정">
          {signedIn
            ? <><a href="/plan" className={menuStyles.primary}>내 사업<ChevronRight size={18} aria-hidden="true" /></a><a href="/account" className={menuStyles.link}>내 계정</a></>
            : <><a href="/account?next=%2Fplan" className={menuStyles.primary}>로그인<ChevronRight size={18} aria-hidden="true" /></a><a href="/account?mode=register&next=%2Fplan" className={menuStyles.link}>회원가입</a></>}
        </div>}
        <nav aria-label="약관과 사업자 정보" className={`${menuStyles.group} ${menuStyles.legal}`}>
          {LEGAL_LINKS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
      </aside>
    </div>, document.body)}
  </>;
}

export function SiteHeader({
  onHome,
  onStart,
  light = false,
  homeNav = false,
  /* 계정 화면에서는 끈다 — 지금 보고 있는 화면으로 다시 보내는 단추다 */
  showAccount = true,
  /*
   * BRIX Headers V17 의 가운데 검색칸 자리.
   * 우리에게 검색은 없지만 '무엇이든 물어보는 곳'은 있다 — 창업 상담.
   * 검색칸처럼 생긴 단추를 누르면 상담 창이 열린다.
   */
  onConsult,
  logo = DEFAULT_LOGO,
}: {
  onHome: () => void;
  onStart?: () => void;
  light?: boolean;
  homeNav?: boolean;
  showAccount?: boolean;
  onConsult?: () => void;
  logo?: SiteLogoAsset;
}) {
  /* 계정 화면(showAccount 꺼짐)은 묻지 않는다 */
  const signedIn = useSignedIn(showAccount || homeNav);
  return (
    <header className={`site-header ${light ? "light" : ""}`}>
      <button className="brand" onClick={onHome} aria-label="오늘창업 홈으로">
        <img className="brand-logo" src={logo.src} alt="오늘창업" width={logo.width} height={logo.height} />
      </button>
      {onConsult ? (
        /* V17: 링크 줄 대신 검색칸 하나 — 링크는 아래 본문 섹션이 대신한다 */
        <button type="button" className="header-consult-search" onClick={onConsult}>
          <Search aria-hidden="true" />
          <span>궁금한 창업, 무엇이든 물어보세요</span>
        </button>
      ) : homeNav ? (
        <nav className="home-header-nav" aria-label="메인 안내">
          {/* 첫 화면(2026-10-23) 구간으로 바로 간다 — 이름은 구간 제목과 같게(HOME_SECTIONS) */}
          {HOME_SECTIONS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
      ) : null}
      <div className="header-actions">
        {showAccount && <AccountActions signedIn={signedIn} plans={homeNav} />}
        {onStart && <button className="small-start" onClick={onStart}>시작하기<CtaArrow /></button>}
        {homeNav && <HomeMenu signedIn={signedIn} />}
      </div>
    </header>
  );
}
