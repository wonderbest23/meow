"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, CircleHelp, FolderClosed, Headphones, LayoutDashboard, MoreHorizontal, SquarePen, UserRound, X } from "lucide-react";
import styles from "./chat/page.module.css";
import shell from "./PlanShell.module.css";
import RailMenu from "./RailMenu";
import { planSyncStatus, subscribePlanSync, pushToServer, type PlanSyncStatus } from "../../lib/plan-builder/plan-store";

export default function BusinessAppChrome({ children, title, subtitle, actions, active = "plans", backHref = "/plan", workspaceHref, showRail = true, journey }: {
  children: ReactNode; title: string; subtitle?: string; actions?: ReactNode; active?: "plans" | "chat" | "new"; backHref?: string; workspaceHref?: string; showRail?: boolean;
  /** 대화 → 계획서 → 홈페이지 → 유지보수 단계 표시(JourneyBar) — 머리줄 바로 아래 */
  journey?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const [sync, setSync] = useState<PlanSyncStatus>("idle");
  useEffect(() => { setSync(planSyncStatus());return subscribePlanSync(() => setSync(planSyncStatus())); }, []);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); menu.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <>
    {showRail && <aside className={`${shell.rail} ${shell.railStatic} ${styles.railHost}`} aria-label="작업 메뉴">
      <RailMenu active={active} workspaceHref={workspaceHref} />
    </aside>}
    <div className={styles.appSurface}>
      <header className={styles.header}>
        <Link className={`${styles.back} ${!showRail ? styles.backVisible : ""}`} href={backHref} aria-label="이전 화면으로" title="이전 화면으로"><ChevronLeft size={24} /></Link>
        {/* 부제는 화면이 따로 줄 때만(예: 질문 3/12) — 늘 붙던 '오늘창업'·'오늘창업 AI 파트너'는 왼쪽 로고와 겹쳐 뺐다 */}
        <div className={styles.headerTitle}><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div>
        {actions && <div className={styles.headerActions}>{actions}</div>}
        <div className={styles.headerMenu} ref={menu}>
          <button className={styles.menuToggle} aria-label={open ? "대화 메뉴 닫기" : "대화 메뉴 열기"} aria-expanded={open} aria-controls="chat-navigation" onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <MoreHorizontal size={24} />}</button>
          {open && <nav id="chat-navigation" className={styles.menuPanel} aria-label="대화 메뉴">
            <Link href="/plan/chat?new=1" onClick={() => setOpen(false)} aria-current={active === "new" ? "page" : undefined}><SquarePen size={18} />새 대화</Link>
            <Link href="/plan" onClick={() => setOpen(false)} aria-current={active === "plans" || active === "chat" ? "page" : undefined}><FolderClosed size={18} />내 사업</Link>
            {workspaceHref && <Link href={workspaceHref} onClick={() => setOpen(false)}><LayoutDashboard size={18} />사업 관리</Link>}
            <Link href="/plan/info" onClick={() => setOpen(false)}><CircleHelp size={18} />이용 안내</Link>
            <Link href="/account/support" onClick={() => setOpen(false)}><Headphones size={18} />고객센터</Link>
            <Link href="/plan/me" onClick={() => setOpen(false)}><UserRound size={18} />내 계정</Link>
            <Link href="/">홈으로</Link>
          </nav>}
        </div>
      </header>
      {journey}
      {sync === "offline" && <div className={styles.syncNotice} role="status">변경한 내용을 서버에 저장하지 못했어요.<button onClick={()=>void pushToServer()}>다시 저장</button></div>}
      {children}
    </div>
  </>;
}
