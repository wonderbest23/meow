"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronsUpDown, Menu, UserRound, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import drawer from "./AppDrawer.module.css";
import styles from "./chat/page.module.css";
import shell from "./PlanShell.module.css";
import RailMenu from "./RailMenu";
import type { DocumentToc } from "./BusinessRailTree";
import { planSyncStatus, subscribePlanSync, pushToServer, type PlanSyncStatus } from "../../lib/plan-builder/plan-store";
import { useDialogFocus } from "../../components/use-dialog-focus";
import { useStudioPane } from "./studio/StudioContext";
import studio from "./studio/Studio.module.css";
import { STUDIO_CLASSIC_PARAM, STUDIO_ENABLED, studioEntryHref } from "../../lib/plan-builder/studio";
import chrome from "./AppChrome.module.css";
import ProfileMenu from "./ProfileMenu";
import MobileTabBar from "./MobileTabBar";
import { accountInitial, accountName, useAccount } from "./use-account";
import { unansweredCount, useInquiries } from "./inquiries/use-inquiries";

/*
 * 휴대폰 아래 3탭 막대를 그리는 화면 — 입력칸·아래 단추가 있는 작업 화면(대화·계획서·홈페이지·사업 관리·작업실·결제·손님 문의)은 빼서
 * 막대가 입력칸·단추를 가리지 않게 한다.
 */
const TABBAR_PATHS = ["/plan", "/plan/me", "/plan/info", "/account/support"];
function showsTabBar(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return TABBAR_PATHS.includes(path);
}

/*
 * 예전 4개 화면(대화·계획서·홈페이지·사업 관리)에서 같은 사업의 작업실로 가는 작은 링크 — 플래그를 켰을 때, 예전 화면을
 * 일부러 연 경우(?classic=1)에만. 그 밖에는 예전 화면 감싸기가 작업실로 바로 보내므로(StudioRedirect) 링크가 필요 없다.
 */
const STUDIO_ENTRY_PATHS = ["/plan/chat", "/plan/document", "/plan/homepage", "/plan/workspace"];
/* withActions — 머리줄에 저장·공개 같은 단추가 함께 있으면 좁은 화면(560px 이하)에서는 접는다(제목 자리가 0이 되었다) */
function StudioEntryLink({ withActions }: { withActions: boolean }) {
  const pathname = (usePathname() || "").replace(/\/$/, "");
  const params = useSearchParams();
  const query = params.toString();
  if (!STUDIO_ENTRY_PATHS.includes(pathname) || params.get(STUDIO_CLASSIC_PARAM) !== "1") return null;
  const href = studioEntryHref(`${pathname}?${query}`);
  return href ? <Link className={studio.entryLink} href={href} data-with-actions={withActions || undefined}>작업실에서 보기</Link> : null;
}

/**
 * 머리줄을 화면이 직접 그릴 때(작업실 PC 의 한 줄 머리줄) 넘겨받는 메뉴 — 서랍은 여기서 그대로 연다.
 * button 은 메뉴 단추(서랍을 닫으면 초점이 돌아오는 단추), open 은 다른 곳(사업명 ⌄)에서 서랍을 여는 것.
 */
export type ChromeMenu = { button: (className: string, size?: number) => ReactNode; open: () => void; isOpen: boolean };

export default function BusinessAppChrome({ children, title, subtitle, actions, active, backHref = "/plan", onBack, showRail = true, documentToc, titleHeading = true, topBar, home = false }: {
  children: ReactNode; title: string; subtitle?: string; actions?: ReactNode; active?: "plans" | "chat" | "new" | "inquiries"; backHref?: string; showRail?: boolean;
  /** 화면 안에서 한 단계 되돌리기(예: 내 문의 상세 → 목록) — 있으면 머리말 뒤로 단추가 주소 이동 대신 이것을 부른다 */
  onBack?: () => void;
  /** 문서 화면의 목차 — 왼쪽 메뉴의 그 사업 아래에 붙는다 */
  documentToc?: DocumentToc;
  /** 머리줄 제목을 이 화면의 h1로 둔다. 본문이 따로 h1을 갖는 화면(계획서의 사업명)은 false. */
  titleHeading?: boolean;
  /** 머리줄을 대신 그린다(작업실 PC) — 서랍 · 저장 실패 안내 · 본문 바로가기 자리는 그대로 */
  topBar?: (menu: ChromeMenu) => ReactNode;
  /** 로그인 뒤 첫 화면(/plan) — 머리줄 대신 휴대폰은 계정 알약 · 아바타(56px), PC 는 머리줄 없이 판 전체가 그라데이션 */
  home?: boolean;
}) {
  /* 작업실 칸 안이면 머리줄·서랍·왼쪽 메뉴는 작업실이 한 번만 그린다 — 여기서는 칸 단추 줄(actions)과 본문만 */
  const pane = useStudioPane();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  /* 프로필 시트(휴대폰 아바타) — 로그인 상태·답할 문의 수는 왼쪽 메뉴와 같은 곳에서 읽는다(요청은 나눠 쓴다) */
  const [profile, setProfile] = useState(false);
  const account = useAccount(pathname ?? "");
  const inquiries = useInquiries(account?.authenticated === true);
  const unanswered = inquiries.items ? unansweredCount(inquiries.items) : 0;
  const tabBar = showsTabBar(pathname || "");
  useEffect(() => { setProfile(false); }, [pathname]);
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
  /*
   * 서랍은 화면을 덮는 창이다 — 열면 '메뉴 닫기'로 초점을 옮기고, Tab은 서랍 안에서만 돌고, 뒤 화면은 inert로 막는다.
   * 닫히면 메뉴 단추로 초점을 돌려준다(예전엔 초점이 뒤 화면에 남아 낭독기가 서랍을 지나쳤다 · 접근성 점검 2026-10-22).
   */
  const toggle = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drawerRef = useDialogFocus<HTMLElement>(open, { onEscape: () => setOpen(false), initialFocus: () => closeButton.current });
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) { wasOpen.current = true; return; }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    // Safari처럼 누른 단추에 초점을 주지 않는 브라우저에서도 body에 떨어지지 않게
    const active = document.activeElement;
    if (!active || active === document.body) toggle.current?.focus({ preventScroll: true });
  }, [open]);
  const menuButton = (className: string, size = 24) => <button ref={toggle} type="button" className={className} aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open} aria-controls={open ? "app-drawer" : undefined} onClick={() => setOpen(!open)}><Menu size={size} /></button>;
  const avatarButton = <button type="button" className={chrome.avatar} data-guest={account?.authenticated ? undefined : ""} aria-haspopup="dialog" aria-expanded={profile} aria-label={`프로필 메뉴 열기${unanswered ? ` · 답할 문의 ${unanswered}건` : ""}`} onClick={() => setProfile(true)}>
    {account?.authenticated ? accountInitial(account) : <UserRound aria-hidden="true" />}{unanswered ? <em aria-hidden="true" /> : null}
  </button>;
  if (pane) return <>
    {actions && <div className={studio.paneToolbar}>{actions}</div>}
    {children}
  </>;
  return <>
    {showRail && <aside className={`${chrome.side} ${drawer.wideOnly}`} aria-label="작업 메뉴" inert={open || profile} data-app-side="">
      <RailMenu active={active} documentToc={documentToc} />
    </aside>}
    {/*
      폰·좁은 화면 메뉴 — PC 왼쪽 메뉴와 똑같은 것(내 사업 → 사업 → 목차)을 서랍으로 연다.
      예전엔 여기만 따로 만든 링크 목록이어서 PC와 폰의 메뉴가 달랐다.
    */}
    {open && <div className={drawer.scrim} onClick={() => setOpen(false)} aria-hidden="true" />}
    {/* 서랍 안에서 다른 화면·사업으로 가는 링크나 홈페이지 칸 이동을 누르면 닫는다 — 같은 주소에 사업만 바뀌면 예전엔 서랍이 그대로 덮고 있었다 */}
    {open && <aside ref={drawerRef} id="app-drawer" className={`${shell.rail} ${shell.railOpen} ${drawer.drawer}`} data-rail-open="" role="dialog" aria-modal="true" aria-label="메뉴" onClickCapture={event => {
      const target = event.target as Element;
      if (target.closest("a[href]") || target.closest('ul[aria-label="홈페이지 목차"] button')) setOpen(false);
    }}>
      <button ref={closeButton} type="button" className={drawer.close} aria-label="메뉴 닫기" onClick={() => setOpen(false)}><X size={22} /></button>
      {/* 서랍에서 장을 고르면 서랍을 닫고 그 장을 보여 준다 */}
      <RailMenu active={active} documentToc={documentToc && { ...documentToc, onSelect: index => { setOpen(false); documentToc.onSelect(index); } }} />
    </aside>}
    <div className={`${styles.appSurface} ${chrome.surface} ${home ? chrome.hero : ""}`} data-app-surface="" data-solo={showRail ? undefined : ""} data-tabbar={tabBar ? "" : undefined} inert={open || profile}>
      {/* 휴대폰 첫 화면 머리 56px — 계정 알약(누르면 내 사업 메뉴 서랍) · 아바타(프로필 시트) */}
      {home && <header className={chrome.homeBar}>
        <button type="button" className={chrome.pill} aria-haspopup="dialog" aria-expanded={open} aria-label="내 사업 메뉴 열기" onClick={() => setOpen(true)}>
          <b aria-hidden="true">{accountInitial(account)}</b><span>{accountName(account) || "오늘창업"}</span><ChevronsUpDown aria-hidden="true" />
        </button>
        {avatarButton}
      </header>}
      {/* 첫 화면은 위 머리(homeBar)만 — PC 는 머리줄 없이 판 전체가 첫 화면이다 */}
      {home ? null : <>{topBar ? topBar({ button: menuButton, open: () => setOpen(true), isOpen: open }) : <header className={styles.header}>
        {onBack
          ? <button type="button" className={`${styles.back} ${!showRail ? styles.backVisible : ""}`} onClick={onBack} aria-label="이전 화면으로" title="이전 화면으로"><ChevronLeft size={24} /></button>
          : <Link className={`${styles.back} ${!showRail ? styles.backVisible : ""}`} href={backHref} aria-label="이전 화면으로" title="이전 화면으로"><ChevronLeft size={24} /></Link>}
        {/* 부제는 화면이 따로 줄 때만(예: 질문 3/12) — 늘 붙던 '오늘창업'·'오늘창업 AI 파트너'는 왼쪽 로고와 겹쳐 뺐다 */}
        {/* 긴 사업명은 말줄임으로 잘린다 — 마우스를 올리면 전체 이름(title) */}
        <div className={styles.headerTitle}>{titleHeading ? <h1><strong title={title}>{title}</strong></h1> : <strong title={title}>{title}</strong>}{subtitle && <span>{subtitle}</span>}</div>
        {STUDIO_ENABLED && <Suspense fallback={null}><StudioEntryLink withActions={!!actions} /></Suspense>}
        {actions && <div className={styles.headerActions}>{actions}</div>}
        {/* PC — 왼쪽 메뉴가 없는 화면만 메뉴 단추. 휴대폰 — 메뉴 단추 대신 아바타(프로필 시트, 그 안에 '내 사업 메뉴') */}
        {!showRail && <div className={`${styles.headerMenu} ${drawer.wideOnly}`}>
          {menuButton(styles.menuToggle)}
        </div>}
        <div className={`${styles.headerMenu} ${drawer.narrowOnly}`}>
          {avatarButton}
        </div>
      </header>}</>}
      {sync === "offline" && <div className={styles.syncNotice} role="status">변경한 내용을 서버에 저장하지 못했어요.<button onClick={()=>void pushToServer()}>다시 저장</button></div>}
      {/* 본문 바로가기(SkipLink)가 데려오는 자리 — 머리줄 바로 아래 */}
      <span id="plan-content" tabIndex={-1} className="plan-content-anchor" />
      {children}
    </div>
    {tabBar && <MobileTabBar />}
    <ProfileMenu open={profile} onClose={() => setProfile(false)} account={account} unanswered={unanswered} anchor="sheet" onOpenMenu={() => setOpen(true)} />
  </>;
}
