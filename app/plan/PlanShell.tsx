"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import PlanRailNav from "./PlanRailNav";
import { planSyncStatus, subscribePlanSync, subscribePlanOwnerChange, pushToServer, type PlanSyncStatus } from "../../lib/plan-builder/plan-store";
import PlanLoading from "./PlanLoading";
import styles from "./PlanShell.module.css";
import RailMenu from "./RailMenu";
import WorkspaceBrand from "../../components/workspace-brand";

/**
 * 현재 경로에서 한 단계 위로 가는 목적지.
 * 페이지마다 제각각이던 뒤로가기를 셸이 한 위치·한 디자인으로 통일한다.
 */
function backTarget(pathname: string): { href: string; label: string } | null {
  if (pathname === "/plan" || pathname === "/plan/") return null; // 목록이 뿌리
  // 개요 뿌리는 목록으로, 그 아래 섹션 위저드는 한 단계 위(개요)로
  /*
   * 개요 화면은 제목 줄에 자기 뒤로가기(←)를 이미 갖고 있다. 여기서 알약을 또
   * 띄우면 같은 화면에 뒤로가기가 둘이 되고, 그 알약이 겹칠 자리를 비워 두느라
   * 제목 위에 56px 이 빈다. 화면을 열면 회색 여백부터 보였다.
   */
  if (pathname === "/plan/overview" || pathname === "/plan/overview/") return null;
  if (pathname.startsWith("/plan/overview/")) return { href: "/plan/overview", label: "플랜 개요" };
  if (pathname.startsWith("/plan/info")) return { href: "/plan", label: "내 사업" };
  if (pathname.startsWith("/plan/me")) return { href: "/plan", label: "내 사업" };
  if (pathname.startsWith("/plan/document")) return { href: "/plan/overview", label: "플랜 개요" };
  if (pathname.startsWith("/plan/pay")) return { href: "/plan/overview", label: "플랜 개요" };
  return { href: "/plan/overview", label: "플랜 개요" }; // 섹션 위저드 등
}

/** /plan 이하 모든 화면이 공유하는 고정 레일 셸 */
export default function PlanShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const back = backTarget(pathname);

  /*
   * PC 메뉴 접기는 뺐다 — 이 화면들에만 있고 대화·내 사업 화면에는 없어 화면마다 달랐고,
   * 로고 옆에 떠서 쓰임새를 알기 어려웠다. 예전에 접어 둔 기록(plan-rail-hidden)은 더 읽지 않는다(늘 펼침).
   */

  /*
   * 폰에서는 레일이 아이콘 폭(56px)이라 목차가 들어갈 자리가 없다.
   * 상단 바의 메뉴 단추를 누르면 서랍처럼 넓게 펼치고, 뒤 배경을 누르면 닫는다 —
   * PC와 같은 목차를 폰에서도 쓰게 한다.
   */
  const [drawer, setDrawer] = useState(false);

  // 화면을 옮기면 서랍은 닫는다 — 열어 둔 채 넘어가면 본문을 가린다
  useEffect(() => { setDrawer(false); }, [pathname]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  /*
   * 저장 상태 — 예전에는 실패해도 아무 표시가 없었다.
   * 저장이 밀리거나 끊기면 알려주고, 다시 시도할 길을 준다.
   */
  const [sync, setSync] = useState<PlanSyncStatus>("idle");
  const [ownerChanged, setOwnerChanged] = useState(false);
  useEffect(() => subscribePlanOwnerChange(() => {
    setOwnerChanged(true);
    window.location.reload();
  }), []);
  useEffect(() => {
    setSync(planSyncStatus());
    return subscribePlanSync(() => setSync(planSyncStatus()));
  }, []);

  if (ownerChanged) return <PlanLoading fill note="현재 계정의 사업을 다시 확인하고 있어요" />;
  if (pathname === "/plan" || pathname === "/plan/" || pathname === "/plan/document" || pathname === "/plan/proposal" || pathname.startsWith("/plan/homepage") || pathname.startsWith("/plan/pay") || pathname.startsWith("/plan/me") || pathname.startsWith("/plan/info") || pathname.startsWith("/plan/workspace") || pathname.startsWith("/plan/chat")) return <>{children}</>;

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
        className={`${styles.rail} ${drawer ? styles.railOpen : ""}`}
        data-rail-open={drawer ? "" : undefined}
        aria-label="주요 메뉴"
      >
        <RailMenu><PlanRailNav /></RailMenu>
      </nav>
      {/*
        폰 상단 바 — 사이트 다른 화면처럼 로고가 보이는 머리 영역.
        예전에는 머리 없이 본문이 바로 시작해 여기가 어느 서비스인지
        알 수 없었고, 메뉴 버튼도 본문 위에 떠 있었다.
      */}
      <header className={styles.mobileBar}>
        <Link href="/" className={styles.mobileBrand} aria-label="오늘창업 홈">
          <WorkspaceBrand />
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
      <div className={styles.content}>
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
