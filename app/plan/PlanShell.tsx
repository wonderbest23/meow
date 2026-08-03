"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./PlanShell.module.css";

const ICONS = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9.5 20v-6h5v6" /></svg>
  ),
  plan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h6M9.5 16.5h6" /></svg>
  ),
  help: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l1.5-4A8 8 0 1 1 21 12Z" /><path d="M9.5 10.5a2.5 2.5 0 1 1 3.2 2.4c-.8.3-1.2.8-1.2 1.6" /><path d="M11.5 17h.01" /></svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6M18 19a5.5 5.5 0 0 0-3-4.9" /></svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
  ),
};

/** /plan 이하 모든 화면이 공유하는 고정 레일 셸 */
export default function PlanShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";

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
  const onStart = pathname.startsWith("/plan/start");
  // 목록·개요·섹션 위저드는 '내 플랜'으로 묶어 하이라이트
  const onPlan = !onStart && pathname.startsWith("/plan");

  return (
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label="주요 메뉴">
        <Link href="/" className={styles.logo} title="오늘창업 홈" aria-label="오늘창업 홈">오늘<br />창업</Link>
        <Link href="/" className={styles.railBtn} title="홈" aria-label="홈">{ICONS.home}</Link>
        <Link href="/plan" className={`${styles.railBtn} ${onPlan ? styles.on : ""}`} title="내 플랜" aria-label="내 플랜">{ICONS.plan}</Link>
        <Link href="/plan/start" className={`${styles.railBtn} ${onStart ? styles.on : ""}`} title="새 플랜 만들기" aria-label="새 플랜 만들기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        </Link>
        <Link href="/business-info" className={styles.railBtn} title="도움말" aria-label="도움말">{ICONS.help}</Link>
        <div className={styles.spring} />
        {account?.authenticated ? (
          <Link href="/account" className={`${styles.railBtn} ${styles.me}`} title={account.email ?? "내 계정"} aria-label={`내 계정 (${account.email ?? "로그인됨"})`}>
            {initial ?? ICONS.team}
          </Link>
        ) : (
          <Link
            href={`/account?next=${encodeURIComponent(pathname || "/plan")}`}
            className={`${styles.railBtn} ${styles.signIn}`}
            title="로그인"
            aria-label="로그인"
          >
            <span className={styles.signInText}>로그인</span>
          </Link>
        )}
      </nav>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
