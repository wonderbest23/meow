"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { House, LayoutGrid, MessageCircle } from "lucide-react";
import { isSamplePlan, loadState, subscribePlanState } from "../../lib/plan-builder/plan-store";
import { readCoach } from "../../lib/plan-builder/coach";
import { readCoachJob } from "../../lib/plan-builder/coach-job-types";
import { businessChatHref } from "../../lib/plan-builder/business-hub";
import { newChatHref, studioHref, STUDIO_REDIRECT } from "../../lib/plan-builder/studio";
import styles from "./MobileTabBar.module.css";

/*
 * 휴대폰 아래 떠 있는 3탭 막대(시안 MHome.dc.html) — 300×56, r999, 아래 28(+안전 영역).
 * 홈(/plan) · 내 사업(/plan?view=all, 사업 카드만) · 대화(가장 최근에 대화한 사업, 없으면 새 대화).
 * 입력칸이 있는 작업 화면(대화·계획서·홈페이지·작업실)에서는 그리지 않는다 — 입력칸·단추를 가리지 않게(BusinessAppChrome 이 정한다).
 */
export const PLAN_VIEW_ALL = "all";

/** 대화 탭이 열 곳 — 이 기기에 저장된 사업 중 대화가 있는 가장 최근 사업(없으면 가장 최근 사업, 사업이 없으면 새 대화) */
function recentChatHref(): string {
  try {
    const plans = loadState().plans.filter(item => !isSamplePlan(item.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    /* 대화 기록이 이 기기에 없으면(서버에만 있는 대화) 가장 최근 사업의 대화로 */
    const plan = plans.find(item => !!readCoach(item.answers) || !!readCoachJob(item.answers)) ?? plans[0];
    if (plan) return STUDIO_REDIRECT ? studioHref(plan.id, "chat") : businessChatHref(plan.id);
  } catch { /* 저장본을 못 읽으면 새 대화 */ }
  return newChatHref();
}

function ViewWatcher({ onChange }: { onChange: (view: string | null) => void }) {
  const view = useSearchParams().get("view");
  useEffect(() => { onChange(view); }, [view, onChange]);
  return null;
}

export default function MobileTabBar() {
  const pathname = (usePathname() || "").replace(/\/$/, "");
  const [view, setView] = useState<string | null>(null);
  const [chatHref, setChatHref] = useState(() => newChatHref());
  /* 화면을 옮기거나 사업 목록을 새로 받으면(첫 화면이 서버에서 불러온 뒤) 다시 고른다 */
  useEffect(() => { setChatHref(recentChatHref()); return subscribePlanState(() => setChatHref(recentChatHref())); }, [pathname]);
  const home = pathname === "/plan" && view !== PLAN_VIEW_ALL;
  const all = pathname === "/plan" && view === PLAN_VIEW_ALL;
  const chat = pathname.startsWith("/plan/chat") || pathname.startsWith("/plan/studio");
  return <nav className={styles.bar} aria-label="아래 메뉴" data-mobile-tabbar="">
    <Suspense fallback={null}><ViewWatcher onChange={setView} /></Suspense>
    <Link href="/plan" className={styles.tab} aria-current={home ? "page" : undefined} aria-label="홈"><House aria-hidden="true" /></Link>
    <Link href={`/plan?view=${PLAN_VIEW_ALL}`} className={styles.tab} aria-current={all ? "page" : undefined} aria-label="내 사업"><LayoutGrid aria-hidden="true" /></Link>
    <Link href={chatHref} className={styles.tab} aria-current={chat ? "page" : undefined} aria-label="대화"><MessageCircle aria-hidden="true" /></Link>
  </nav>;
}
