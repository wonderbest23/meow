"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import PlanGate from "./PlanGate";
import styles from "./PlanShell.module.css";

const ICONS = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9.5 20v-6h5v6" /></svg>
  ),
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

/*
 * 로그인 없이도 볼 수 있는 /plan 화면.
 * 이용 안내는 법적 고지라 누구에게나 열려 있어야 하고,
 * 결제 화면은 자체 로그인 안내를 갖고 있다.
 */
const PUBLIC_PATHS = ["/plan/info", "/plan/pay", "/plan/start", "/plan/sample"];

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
  const onInfo = pathname.startsWith("/plan/info");
  // 목록·개요·섹션 위저드는 '내 플랜'으로 묶어 하이라이트
  const onPlan = !onStart && !onInfo && pathname.startsWith("/plan");

  /*
   * 로그인 관문을 셸 한 곳에 둔다.
   * 화면마다 따로 막으면 새 화면을 추가할 때마다 빠뜨리게 되고,
   * 실제로 /plan 목록과 /plan/overview가 열린 채로 남아 있었다.
   * (서버 차단은 API에서 이미 하고 있고, 여기는 화면 안내다.)
   */
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const locked = account !== null && !account.authenticated && !isPublic;

  return (
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label="주요 메뉴">
        <Link href="/" className={styles.logo} title="오늘창업 홈" aria-label="오늘창업 홈">오늘<br />창업</Link>
        <Link href="/" className={styles.railBtn} title="홈" aria-label="홈">{ICONS.home}</Link>
        <Link href="/plan" className={`${styles.railBtn} ${onPlan ? styles.on : ""}`} title="내 플랜" aria-label="내 플랜">{ICONS.plan}</Link>
        <Link href="/plan/start" className={`${styles.railBtn} ${onStart ? styles.on : ""}`} title="새 플랜 만들기" aria-label="새 플랜 만들기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        </Link>
        <Link href="/plan/info" className={`${styles.railBtn} ${onInfo ? styles.on : ""}`} title="이용 안내" aria-label="이용 안내">{ICONS.help}</Link>
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
      <div className={styles.content}>
        {locked ? (
          <div className={styles.gate}><PlanGate reason="login_required" /></div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
