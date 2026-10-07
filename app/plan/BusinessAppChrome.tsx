"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import drawer from "./AppDrawer.module.css";
import styles from "./chat/page.module.css";
import shell from "./PlanShell.module.css";
import RailMenu from "./RailMenu";
import type { DocumentToc } from "./BusinessRailTree";
import { planSyncStatus, subscribePlanSync, pushToServer, type PlanSyncStatus } from "../../lib/plan-builder/plan-store";

export default function BusinessAppChrome({ children, title, subtitle, actions, active, backHref = "/plan", showRail = true, documentToc }: {
  children: ReactNode; title: string; subtitle?: string; actions?: ReactNode; active?: "plans" | "chat" | "new" | "inquiries"; backHref?: string; showRail?: boolean;
  /** 문서 화면의 목차 — 왼쪽 메뉴의 그 사업 아래에 붙는다 */
  documentToc?: DocumentToc;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [sync, setSync] = useState<PlanSyncStatus>("idle");
  useEffect(() => { setSync(planSyncStatus());return subscribePlanSync(() => setSync(planSyncStatus())); }, []);
  /* 화면을 옮기면 서랍은 닫는다 */
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  return <>
    {showRail && <aside className={`${shell.rail} ${shell.railStatic} ${styles.railHost} ${drawer.wideOnly}`} aria-label="작업 메뉴">
      <RailMenu active={active} documentToc={documentToc} />
    </aside>}
    {/*
      폰·좁은 화면 메뉴 — PC 왼쪽 메뉴와 똑같은 것(내 사업 → 사업 → 목차)을 서랍으로 연다.
      예전엔 여기만 따로 만든 링크 목록이어서 PC와 폰의 메뉴가 달랐다.
    */}
    {open && <div className={drawer.scrim} onClick={() => setOpen(false)} aria-hidden="true" />}
    {/* 서랍 안에서 다른 화면·사업으로 가는 링크나 홈페이지 칸 이동을 누르면 닫는다 — 같은 주소에 사업만 바뀌면 예전엔 서랍이 그대로 덮고 있었다 */}
    {open && <aside id="app-drawer" className={`${shell.rail} ${shell.railOpen} ${drawer.drawer}`} data-rail-open="" aria-label="메뉴" onClickCapture={event => {
      const target = event.target as Element;
      if (target.closest("a[href]") || target.closest('ul[aria-label="홈페이지 목차"] button')) setOpen(false);
    }}>
      <button type="button" className={drawer.close} aria-label="메뉴 닫기" onClick={() => setOpen(false)}><X size={22} /></button>
      {/* 서랍에서 장을 고르면 서랍을 닫고 그 장을 보여 준다 */}
      <RailMenu active={active} documentToc={documentToc && { ...documentToc, onSelect: index => { setOpen(false); documentToc.onSelect(index); } }} />
    </aside>}
    <div className={styles.appSurface}>
      <header className={styles.header}>
        <Link className={`${styles.back} ${!showRail ? styles.backVisible : ""}`} href={backHref} aria-label="이전 화면으로" title="이전 화면으로"><ChevronLeft size={24} /></Link>
        {/* 부제는 화면이 따로 줄 때만(예: 질문 3/12) — 늘 붙던 '오늘창업'·'오늘창업 AI 파트너'는 왼쪽 로고와 겹쳐 뺐다 */}
        <div className={styles.headerTitle}><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div>
        {actions && <div className={styles.headerActions}>{actions}</div>}
        <div className={`${styles.headerMenu} ${showRail ? drawer.narrowOnly : ""}`}>
          <button className={styles.menuToggle} aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open} aria-controls="app-drawer" onClick={() => setOpen(!open)}><Menu size={24} /></button>
        </div>
      </header>
      {sync === "offline" && <div className={styles.syncNotice} role="status">변경한 내용을 서버에 저장하지 못했어요.<button onClick={()=>void pushToServer()}>다시 저장</button></div>}
      {children}
    </div>
  </>;
}
