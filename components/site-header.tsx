"use client";

import { useEffect, useState } from "react";
import { Search, UserRound } from "lucide-react";
import { CtaArrow } from "./cta-arrow";

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
export const DEFAULT_LOGO: SiteLogoAsset = { src: "/today-startup-logo-2026.png", width: 1288, height: 322 };

/** 로고 단추 — 머리말 말고 바닥글에서도 쓴다 */
export function SiteLogo({ onClick, logo = DEFAULT_LOGO }: { onClick: () => void; logo?: SiteLogoAsset }) {
  return (
    <button className="brand" onClick={onClick} aria-label="오늘창업 홈으로">
      <img className="brand-logo" src={logo.src} alt="오늘창업" width={logo.width} height={logo.height} />
    </button>
  );
}

/** 머리말 오른쪽 — 로그인했으면 마이페이지 아이콘, 아니면 '로그인 · 회원가입' 두 단추(헷갈리지 않게 글자로) */
function AccountActions() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error("session unavailable"); return response.json(); })
      .then((data: { authenticated?: boolean }) => { if (alive) setSignedIn(!!data.authenticated); })
      /* 확인하지 못했으면 아무것도 그리지 않는다 — 로그인한 사람에게 로그인 단추가 뜨지 않게 */
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  /* 확인 전에는 비워 둔다 — 로그인 단추가 잠깐 보였다 바뀌지 않게 */
  if (signedIn === null) return null;
  if (signedIn) return <a className="account-link" href="/account" aria-label="마이페이지" title="마이페이지"><UserRound /></a>;
  /* /account?next= 링크는 로그인 팝업(login-dialog)이 받아 이 화면에서 연다 */
  return <>
    <a className="header-login" href="/account?next=%2Fplan">로그인</a>
    <a className="header-signup" href="/account?mode=register&next=%2Fplan">회원가입</a>
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
          <a href="#how">진행 방식</a>
          <a href="#deliverables">결과물</a>
          <a href="#difference">오늘창업의 차이</a>
          <a href="#price">이용 안내</a>
        </nav>
      ) : null}
      <div className="header-actions">
        {showAccount && <AccountActions />}
        {onStart && <button className="small-start" onClick={onStart}>시작하기<CtaArrow /></button>}
      </div>
    </header>
  );
}
