"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import PlanRailNav from "./PlanRailNav";
import { planSyncStatus, subscribePlanSync, pushToServer, type PlanSyncStatus } from "../../lib/plan-builder/plan-store";
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

  /*
   * 폰에서는 레일이 아이콘 폭(56px)이라 목차가 들어갈 자리가 없다.
   * 손잡이를 누르면 서랍처럼 넓게 펼치고, 뒤 배경을 누르면 닫는다 —
   * PC와 같은 목차를 폰에서도 쓰게 한다.
   */
  const [phone, setPhone] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // 화면을 옮기면 서랍은 닫는다 — 열어 둔 채 넘어가면 본문을 가린다
  useEffect(() => { setDrawer(false); }, [pathname]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  function toggleRail() {
    if (phone) {
      setDrawer((v) => !v);
      return;
    }
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

  /*
   * 저장 상태 — 예전에는 실패해도 아무 표시가 없었다.
   * 저장이 밀리거나 끊기면 알려주고, 다시 시도할 길을 준다.
   */
  const [sync, setSync] = useState<PlanSyncStatus>("idle");
  useEffect(() => {
    setSync(planSyncStatus());
    return subscribePlanSync(() => setSync(planSyncStatus()));
  }, []);

  return (
    <div className={styles.shell}>
      {sync === "offline" && (
        <div className={styles.syncWarn} role="status">
          <span>저장하지 못했습니다 — 연결을 확인해 주세요. 쓰던 내용은 남아 있습니다.</span>
          <button type="button" onClick={() => void pushToServer()}>다시 저장</button>
        </div>
      )}
      {/* 서랍 뒤 배경 — 누르면 닫힌다 */}
      {drawer && <div className={styles.scrim} onClick={() => setDrawer(false)} aria-hidden="true" />}
      {/*
        data-rail-open — 서랍이 열렸다는 사실을 자식 CSS도 알아야 한다.
        railOpen은 이 모듈에서 해시된 이름이라 PlanRailNav 쪽 CSS가 가리킬 수 없어서,
        해시되지 않는 표시를 하나 남긴다.
      */}
      <nav
        className={`${styles.rail} ${railHidden ? styles.railOff : ""} ${drawer ? styles.railOpen : ""}`}
        data-rail-open={drawer ? "" : undefined}
        aria-label="주요 메뉴"
      >
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
          <Link href="/plan/me" className={`${styles.railBtn} ${onMe ? styles.on : ""}`} title={`마이페이지 · ${account.email ?? ""}`} aria-label={`마이페이지 (${account.email ?? "로그인됨"})`}>
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
        className={`${styles.railToggle} ${railHidden ? styles.railToggleOff : ""} ${drawer ? styles.railToggleOpen : ""}`}
        onClick={toggleRail}
        aria-label={(phone ? drawer : !railHidden) ? "메뉴 접기" : "메뉴 펼치기"}
        title={(phone ? drawer : !railHidden) ? "메뉴 접기" : "메뉴 펼치기"}
      >
        {(phone ? drawer : !railHidden) ? "«" : "»"}
      </button>
      {/*
        폰 상단 바 — 사이트 다른 화면처럼 로고가 보이는 머리 영역.
        예전에는 머리 없이 본문이 바로 시작해 여기가 어느 서비스인지
        알 수 없었고, 메뉴 버튼도 본문 위에 떠 있었다.
      */}
      <header className={styles.mobileBar}>
        <Link href="/" className={styles.mobileBrand} aria-label="오늘창업 홈">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/today-startup-logo-2026.png" alt="오늘창업" width={1288} height={322} />
        </Link>
        <button
          type="button"
          className={`${styles.menuFab} ${drawer ? styles.menuFabOn : ""}`}
          onClick={() => setDrawer((v) => !v)}
          aria-label={drawer ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={drawer}
        >
          {drawer ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          )}
        </button>
      </header>
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
