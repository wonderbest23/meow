"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { openSupportChat } from "../../lib/client/open-support-chat";
import styles from "./MobileTabBar.module.css";

/*
 * 휴대폰 아래 떠 있는 3탭 막대(시안 MHome.dc.html) — 296×57, r999, 칸 48, 아래 24(+안전 영역) — lovable 실측 2026-11-01.
 * 홈(/plan — 인사말·입력칸, 보내면 새 대화) · 내 사업(/plan?view=all, 사업 카드만 — 열면 작업실) · 문의(/account/support — 담당자 문의·문의 내역).
 * 세 번째가 '대화'였을 땐 내 사업과 같은 목록이라 겹쳤다(2026-11-02 사장님) — lovable 의 Chats 는 프로젝트와 무관한 대화라 뜻이 있지만 우리 대화는 모두 사업에 붙어 있다.
 * 떠 있는 상담 동그라미는 이 막대가 있는 화면에서 그리지 않는다(막대와 겹쳤다) — 같은 일을 문의 탭이 한다.
 * 입력칸이 있는 작업 화면(대화·계획서·홈페이지·작업실)에서는 그리지 않는다 — 입력칸·단추를 가리지 않게(BusinessAppChrome 이 정한다).
 */
export const PLAN_VIEW_ALL = "all";

/* 막대 아이콘 — 남의 아이콘 세트를 그대로 쓰지 않고 직접 그렸다(둥근 끝·가는 선, 2026-11-08 사장님). 굵기는 CSS 가 정한다 */
const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const HOME = "M4 10.6 12 4l8 6.6V18.5a2 2 0 0 1-2 2h-3.5v-4.5a2.5 2.5 0 0 0-5 0v4.5H6a2 2 0 0 1-2-2z";
const PLANS = "M8 3.5h6l5 5v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM14 3.5v3a2 2 0 0 0 2 2h3M9.5 13h5M9.5 16.5h3";
const ASK = "M12 4c4.7 0 8 3 8 7s-3.3 7-8 7c-1 0-2-.1-2.9-.4L5 19.5l1.2-3.6C4.8 14.6 4 12.9 4 11c0-4 3.3-7 8-7zM8.5 11h.01M12 11h.01M15.5 11h.01";

function ViewWatcher({ onChange }: { onChange: (view: string | null) => void }) {
  const view = useSearchParams().get("view");
  useEffect(() => { onChange(view); }, [view, onChange]);
  return null;
}

export default function MobileTabBar() {
  const pathname = (usePathname() || "").replace(/\/$/, "");
  const [view, setView] = useState<string | null>(null);
  const home = pathname === "/plan" && view !== PLAN_VIEW_ALL;
  const all = pathname === "/plan" && view === PLAN_VIEW_ALL;
  const support = pathname.startsWith("/account/support") || pathname.startsWith("/plan/inquiries");
  /* 홈·내 사업을 누르면 열린 챗봇 창은 닫는다(창이 모든 화면 위에 남아 있어 탭이 안 먹는 듯 보였다, 2026-11-05 사장님) */
  const closeChat = () => document.querySelector<HTMLButtonElement>('button[aria-label="문의창 닫기"]')?.click();
  return <nav className={styles.bar} aria-label="아래 메뉴" data-mobile-tabbar="">
    <Suspense fallback={null}><ViewWatcher onChange={setView} /></Suspense>
    <Link href="/plan" className={styles.tab} aria-current={home ? "page" : undefined} aria-label="홈" onClick={closeChat}><Icon d={HOME} /></Link>
    <Link href={`/plan?view=${PLAN_VIEW_ALL}`} className={styles.tab} aria-current={all ? "page" : undefined} aria-label="내 사업" onClick={closeChat}><Icon d={PLANS} /></Link>
    {/* 문의 — 휴대폰에선 챗봇 창(전체 화면)을 연다. 챗봇 단추가 없는 화면(고객센터·대화)에서는 양식 화면으로(2026-11-05 사장님) */}
    <Link href="/account/support" className={styles.tab} aria-current={support ? "page" : undefined} aria-label="문의" onClick={event => {
      if (openSupportChat()) event.preventDefault();
    }}><Icon d={ASK} /></Link>
  </nav>;
}
