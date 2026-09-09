"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, FolderClosed, MessageCircle, MoreHorizontal, SquarePen, X } from "lucide-react";
import styles from "./chat/page.module.css";
import { planSyncStatus, subscribePlanSync, pushToServer, type PlanSyncStatus } from "../../lib/plan-builder/plan-store";

export default function BusinessAppChrome({ children, title, active = "plans", backHref = "/plan", workspaceHref, showRail = true }: {
  children: ReactNode; title: string; active?: "plans" | "chat"; backHref?: string; workspaceHref?: string; showRail?: boolean;
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
    {showRail && <aside className={styles.appRail} aria-label="작업 메뉴">
      <Link className={styles.brand} href="/" aria-label="오늘창업 홈"><img src="/today-startup-logo-2026.png" alt="오늘창업" width="132" height="33" /></Link>
      <a className={styles.newChat} href="/plan/chat?new=1"><SquarePen size={19} />새 대화</a>
      <nav><Link href="/plan/chat" className={active === "chat" ? styles.currentNav : ""} aria-current={active === "chat" ? "page" : undefined}><MessageCircle size={19} />사업 기획</Link><Link href="/plan" className={active === "plans" ? styles.currentNav : ""} aria-current={active === "plans" ? "page" : undefined}><FolderClosed size={19} />내 사업</Link></nav>
      <span className={styles.railCaption}>아이디어에서 시작하는 내 사업</span>
    </aside>}
    <div className={styles.appSurface}>
      <header className={styles.header}>
        <Link className={`${styles.back} ${!showRail ? styles.backVisible : ""}`} href={backHref} aria-label="이전 화면으로" title="이전 화면으로"><ChevronLeft size={24} /></Link>
        <div className={styles.headerTitle}><strong>{title}</strong><span>오늘창업{active === "chat" ? " AI 파트너" : ""}</span></div>
        {workspaceHref && <Link className={styles.workspaceLink} href={workspaceHref}>사업 관리</Link>}
        <div className={styles.headerMenu} ref={menu}><button className={styles.menuToggle} aria-label={open ? "대화 메뉴 닫기" : "대화 메뉴 열기"} aria-expanded={open} aria-controls="chat-navigation" onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <MoreHorizontal size={24} />}</button>{open && <nav id="chat-navigation" className={styles.menuPanel} aria-label="대화 메뉴"><a href="/plan/chat?new=1"><SquarePen size={18} />새 대화</a><Link href="/plan"><FolderClosed size={18} />내 사업</Link><Link href="/">홈으로</Link></nav>}</div>
      </header>
      {sync === "offline" && <div className={styles.syncNotice} role="status">변경한 내용을 서버에 저장하지 못했어요.<button onClick={()=>void pushToServer()}>다시 저장</button></div>}
      {children}
    </div>
  </>;
}
