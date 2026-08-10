"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import PlanRailNav from "./PlanRailNav";
import styles from "./PlanShell.module.css";

const ICONS = {
  plan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h6M9.5 16.5h6" /></svg>
  ),
  help: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M9.9 9.6a2.2 2.2 0 1 1 2.8 2.2c-.7.2-1 .7-1 1.4v.4" /><path d="M11.7 16.4h.01" /></svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6M18 19a5.5 5.5 0 0 0-3-4.9" /></svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
  ),
};

/**
 * 현재 경로에서 한 단계 위로 가는 목적지.
 * 페이지마다 제각각이던 뒤로가기를 셸이 한 위치·한 디자인으로 통일한다.
 */
function backTarget(pathname: string): { href: string; label: string } | null {
  if (pathname === "/plan" || pathname === "/plan/") return null; // 목록이 뿌리
  // 개요 뿌리는 목록으로, 그 아래 섹션 위저드는 한 단계 위(개요)로
  if (pathname === "/plan/overview" || pathname === "/plan/overview/") return { href: "/plan", label: "내 플랜" };
  if (pathname.startsWith("/plan/overview/")) return { href: "/plan/overview", label: "플랜 개요" };
  if (pathname.startsWith("/plan/start")) return { href: "/plan", label: "내 플랜" };
  if (pathname.startsWith("/plan/info")) return { href: "/plan", label: "내 플랜" };
  if (pathname.startsWith("/plan/me")) return { href: "/plan", label: "내 플랜" };
  if (pathname.startsWith("/plan/document")) return { href: "/plan/overview", label: "플랜 개요" };
  if (pathname.startsWith("/plan/pay")) return { href: "/plan/overview", label: "플랜 개요" };
  return { href: "/plan/overview", label: "플랜 개요" }; // 섹션 위저드 등
}

/** /plan 이하 모든 화면이 공유하는 고정 레일 셸 */
export default function PlanShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const back = backTarget(pathname);

  /* 레일 접기 — 좁은 화면에서 본문이 전체 폭을 쓰도록. 선택은 기억한다. */
  const [railHidden, setRailHidden] = useState(false);
  useEffect(() => {
    try { setRailHidden(localStorage.getItem("plan-rail-hidden") === "1"); } catch { /* 무해 */ }
  }, []);
  function toggleRail() {
    setRailHidden((v) => {
      try { localStorage.setItem("plan-rail-hidden", v ? "0" : "1"); } catch { /* 무해 */ }
      return !v;
    });
  }

  /*
   * 레일에 로그인 상태를 실제로 드러낸다.
   * 예전에는 로그인 여부와 무관하게 같은 사람 모양 아이콘만 있어서,
   * 상단 로고('오')를 프로필로 오해하기 쉬웠다.
   */
  const [account, setAccount] = useState<{ authenticated: boolean; email: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/plan/access")
      .then((r) => r.json())
      .then((d) => { if (alive) setAccount({ authenticated: !!d.authenticated, email: d.email ?? null }); })
      .catch(() => { if (alive) setAccount({ authenticated: false, email: null }); });
    return () => { alive = false; };
  }, [pathname]);

  // 로그인했으면 이메일 첫 글자를 아바타로, 아니면 '로그인'이라고 읽히게 둔다
  const initial = account?.email ? account.email.trim().charAt(0).toUpperCase() : null;
  const onInfo = pathname.startsWith("/plan/info");
  const onMe = pathname.startsWith("/plan/me");
  // 목록·개요·섹션 위저드는 '내 플랜'으로 묶어 하이라이트
  const onPlan = !onInfo && !onMe && pathname.startsWith("/plan");

  return (
    <div className={styles.shell}>
      <nav className={`${styles.rail} ${railHidden ? styles.railOff : ""}`} aria-label="주요 메뉴">
        <Link href="/" className={styles.logo} title="오늘창업 홈" aria-label="오늘창업 홈">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/today-startup-mark-2026.png" alt="오늘창업" width={40} height={40} />
        </Link>
        <Link href="/plan" className={`${styles.railBtn} ${onPlan ? styles.on : ""}`} title="내 플랜" aria-label="내 플랜">
          {ICONS.plan}<span className={styles.railLabel}>내 플랜</span>
        </Link>
        <Link href="/plan/info" className={`${styles.railBtn} ${onInfo ? styles.on : ""}`} title="이용 안내" aria-label="이용 안내">
          {ICONS.help}<span className={styles.railLabel}>이용 안내</span>
        </Link>
        {/* 플랜을 열어 둔 상태면 그 목차가 여기 붙는다 — 오른쪽 별도 열이 아니라 */}
        <PlanRailNav />
        <div className={styles.spring} />
        {account?.authenticated ? (
          <Link href="/plan/me" className={`${styles.railBtn} ${styles.me} ${onMe ? styles.on : ""}`} title={`마이페이지 · ${account.email ?? ""}`} aria-label={`마이페이지 (${account.email ?? "로그인됨"})`}>
            <span className={styles.meAvatar}>{initial ?? ICONS.team}</span>
            <span className={styles.railLabel}>마이페이지</span>
          </Link>
        ) : (
          <Link
            href={`/account?next=${encodeURIComponent(pathname || "/plan")}`}
            className={`${styles.railBtn} ${styles.signIn}`}
            title="로그인"
            aria-label="로그인"
          >
            <span className={styles.signInText}>로그인</span>
            <span className={styles.railLabel}>계정 만들기</span>
          </Link>
        )}
      </nav>
      <button
        type="button"
        className={`${styles.railToggle} ${railHidden ? styles.railToggleOff : ""}`}
        onClick={toggleRail}
        aria-label={railHidden ? "메뉴 펼치기" : "메뉴 접기"}
        title={railHidden ? "메뉴 펼치기" : "메뉴 접기"}
      >
        {railHidden ? "»" : "«"}
      </button>
      <div className={`${styles.content} ${railHidden ? styles.contentWide : ""}`}>
        {back && (
          <Link href={back.href} className={styles.shellBack} aria-label={`${back.label}(으)로 돌아가기`}>
            <span aria-hidden="true">←</span> {back.label}
          </Link>
        )}
        {children}
      </div>
    </div>
  );
}
