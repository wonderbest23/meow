"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { House, LayoutGrid, MessageCircle } from "lucide-react";
import styles from "./MobileTabBar.module.css";

/*
 * 휴대폰 아래 떠 있는 3탭 막대(시안 MHome.dc.html) — 296×57, r999, 칸 48, 아래 24(+안전 영역) — lovable 실측 2026-11-01.
 * 홈(/plan — 인사말·입력칸, 보내면 새 대화) · 내 사업(/plan?view=all, 사업 카드만 — 열면 작업실) · 대화(/plan?view=chat, 사업을 고르면 그 사업의 대화).
 * 예전엔 대화 탭이 가장 최근 사업의 대화로 바로 들어가 어느 사업인지 헷갈렸다(2026-11-02 사장님).
 * 입력칸이 있는 작업 화면(대화·계획서·홈페이지·작업실)에서는 그리지 않는다 — 입력칸·단추를 가리지 않게(BusinessAppChrome 이 정한다).
 */
export const PLAN_VIEW_ALL = "all";
export const PLAN_VIEW_CHAT = "chat";

function ViewWatcher({ onChange }: { onChange: (view: string | null) => void }) {
  const view = useSearchParams().get("view");
  useEffect(() => { onChange(view); }, [view, onChange]);
  return null;
}

export default function MobileTabBar() {
  const pathname = (usePathname() || "").replace(/\/$/, "");
  const [view, setView] = useState<string | null>(null);
  const home = pathname === "/plan" && view !== PLAN_VIEW_ALL && view !== PLAN_VIEW_CHAT;
  const all = pathname === "/plan" && view === PLAN_VIEW_ALL;
  const chat = (pathname === "/plan" && view === PLAN_VIEW_CHAT) || pathname.startsWith("/plan/chat") || pathname.startsWith("/plan/studio");
  return <nav className={styles.bar} aria-label="아래 메뉴" data-mobile-tabbar="">
    <Suspense fallback={null}><ViewWatcher onChange={setView} /></Suspense>
    <Link href="/plan" className={styles.tab} aria-current={home ? "page" : undefined} aria-label="홈"><House aria-hidden="true" /></Link>
    <Link href={`/plan?view=${PLAN_VIEW_ALL}`} className={styles.tab} aria-current={all ? "page" : undefined} aria-label="내 사업"><LayoutGrid aria-hidden="true" /></Link>
    <Link href={`/plan?view=${PLAN_VIEW_CHAT}`} className={styles.tab} aria-current={chat ? "page" : undefined} aria-label="대화"><MessageCircle aria-hidden="true" /></Link>
  </nav>;
}
