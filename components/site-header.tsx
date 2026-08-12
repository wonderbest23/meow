"use client";

import { UserRound } from "lucide-react";

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

/** 로고 단추 — 머리말 말고 바닥글에서도 쓴다 */
export function SiteLogo({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" onClick={onClick} aria-label="오늘창업 홈으로">
      <img className="brand-logo" src="/today-startup-logo-2026.png" alt="오늘창업" width="1288" height="322" />
    </button>
  );
}

export function SiteHeader({
  onHome,
  onStart,
  light = false,
  homeNav = false,
  /* 계정 화면에서는 끈다 — 지금 보고 있는 화면으로 다시 보내는 단추다 */
  showAccount = true,
}: {
  onHome: () => void;
  onStart?: () => void;
  light?: boolean;
  homeNav?: boolean;
  showAccount?: boolean;
}) {
  return (
    <header className={`site-header ${light ? "light" : ""}`}>
      <button className="brand" onClick={onHome} aria-label="오늘창업 홈으로">
        <img className="brand-logo" src="/today-startup-logo-2026.png" alt="오늘창업" width="1288" height="322" />
      </button>
      {homeNav && (
        <nav className="home-header-nav" aria-label="메인 안내">
          <a href="#how">진행 방식</a>
          <a href="#deliverables">결과물</a>
          <a href="#evidence">근거 기준</a>
          <a href="#price">이용 안내</a>
        </nav>
      )}
      <div className="header-actions">
        {showAccount && (
          <a className="account-link" href="/account" aria-label="마이페이지" title="마이페이지"><UserRound /></a>
        )}
        {onStart && <button className="small-start" onClick={onStart}>시작하기</button>}
      </div>
    </header>
  );
}
