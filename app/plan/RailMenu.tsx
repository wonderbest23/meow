"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, ChevronsUpDown, Inbox, LayoutGrid, MessagesSquare, Search, SquarePen } from "lucide-react";
import { unansweredCount, useInquiries } from "./inquiries/use-inquiries";
import menu from "./RailMenu.module.css";
import { DEFAULT_LOGO } from "../../components/site-header";
import BusinessRailTree, { type DocumentToc } from "./BusinessRailTree";
import ProfileMenu, { type ProfileAnchor } from "./ProfileMenu";
import { accountInitial, accountName, useAccount } from "./use-account";
import { PLAN_VIEW_ALL } from "./MobileTabBar";

/*
 * 왼쪽 메뉴 하나(시안 Main.dc.html — lovable 배치) — 대화·내 사업 화면(BusinessAppChrome)과 예전 문서 화면(PlanShell)이 같이 쓴다.
 * 256px(안쪽 8) · 로고 줄 32 → 계정 단추 240×32 → 메뉴 칸 240×32 r8 14px 아이콘 20(새 대화 · 검색 · 내 사업 · 손님 문의)
 * → '내 사업' 묶음(사업 → 목차) · '최근 대화' 묶음 → 맨 아래 고객센터 카드 + 아바타(알림 점) · 받은 알림.
 * 예전 아래쪽 줄(약관·정책 · 고객센터 · 내 계정)은 프로필 메뉴(아바타·계정 단추)로 모았다 — 주소는 예전 그대로.
 */
export type RailActive = "new" | "chat" | "plans" | "info" | "support" | "me" | "inquiries";

function activeFor(pathname: string, view: string | null): RailActive | undefined {
  if (pathname.startsWith("/plan/info")) return "info";
  if (pathname.startsWith("/plan/me")) return "me";
  if (pathname.startsWith("/plan/inquiries")) return "inquiries";
  if (pathname.startsWith("/account/support")) return "support";
  /* 첫 화면(/plan)은 큰 입력칸이 새 대화의 입구다 — '새 대화'를 켠다. 사업 카드만 보는 화면(view=all)은 '내 사업' */
  if (pathname === "/plan" || pathname === "/plan/") return view === PLAN_VIEW_ALL ? "plans" : "new";
  if (pathname.startsWith("/plan")) return "plans";
  return undefined;
}

/* 주소의 view(첫 화면 / 사업 카드만)를 따라간다 — useSearchParams 는 정적 빌드에서 Suspense 가 필요해 이 조각만 감싼다 */
function ViewWatcher({ onChange }: { onChange: (view: string | null) => void }) {
  const view = useSearchParams().get("view");
  useEffect(() => { onChange(view); }, [view, onChange]);
  return null;
}

export default function RailMenu({ active, children, documentToc }: { active?: RailActive; children?: ReactNode; documentToc?: DocumentToc }) {
  const pathname = usePathname() || "";
  const [view, setView] = useState<string | null>(null);
  /* 사업 대화 화면(chat)은 그 사업이 속한 '내 사업'을 켠다 */
  const picked = active ?? activeFor(pathname, view);
  const current = picked === "chat" ? "plans" : picked;
  /*
   * 로그인 여부는 로그인 전용 주소로 확인한다(사이트 머리말과 같은 곳). 확인하지 못했으면 직전 상태를 둔다.
   */
  const account = useAccount(pathname);
  const here = (key: RailActive) => (current === key ? "page" as const : undefined);
  const loginNext = encodeURIComponent(pathname || "/plan");
  /* 손님 문의 — 답할 문의 수(로그인했을 때만 센다) */
  const inquiries = useInquiries(account?.authenticated === true);
  /* 사업 수 — 모르는 동안(null)은 손님 문의를 막지 않는다 */
  const [planCount, setPlanCount] = useState<number | null>(null);
  const openInquiries = inquiries.items ? unansweredCount(inquiries.items) : 0;
  /* 프로필 메뉴 — 위 계정 단추에서 열면 그 아래, 아래 아바타에서 열면 그 위에 */
  const [profile, setProfile] = useState<ProfileAnchor | null>(null);
  useEffect(() => { setProfile(null); }, [pathname]);
  const name = accountName(account);

  /* data-app-rail: 화면 로딩 표시(PlanLoading)가 메뉴 폭만큼 본문 가운데로 옮겨 가는 기준 */
  return <div className={menu.menu} data-app-rail>
    <Suspense fallback={null}><ViewWatcher onChange={setView} /></Suspense>
    <Link href="/" className={menu.brand} title="오늘창업 홈" aria-label="오늘창업 홈">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={menu.logoFull} src={DEFAULT_LOGO.src} alt="" width={DEFAULT_LOGO.width} height={DEFAULT_LOGO.height} />
    </Link>
    {/* 계정 단추 240×32 — 누르면 프로필 메뉴(받은 알림 · 프로필 · 계정 설정 · 결제 내역 · 고객센터 · 이용 안내 · 화면 설정) */}
    {account?.authenticated && <button type="button" className={menu.ws} aria-haspopup="dialog" aria-expanded={profile === "top"} onClick={() => setProfile(profile === "top" ? null : "top")} title={account.email ?? "내 계정"}>
      <b aria-hidden="true">{accountInitial(account)}</b><span>{name || "내 계정"}</span><ChevronsUpDown aria-hidden="true" />
    </button>}
    <div className={menu.nav}>
      <Link href="/plan/chat?new=1" className={menu.item} title="새 대화" aria-current={here("new")}>
        <SquarePen aria-hidden="true" /><span>새 대화</span>
      </Link>
      {/* 검색 — 사업 카드 화면을 열고 검색칸에 초점을 둔다 */}
      <Link href={`/plan?view=${PLAN_VIEW_ALL}&search=1`} className={menu.item} title="검색">
        <Search aria-hidden="true" /><span>검색</span>
      </Link>
      <Link href={`/plan?view=${PLAN_VIEW_ALL}`} className={menu.item} title="내 사업" aria-current={here("plans")}>
        <LayoutGrid aria-hidden="true" /><span>내 사업</span>
      </Link>
      {/* 손님 문의 — 홈페이지로 들어온 손님 문의를 메신저처럼. 사업이 하나도 없으면 받을 문의가 없으니 막아 둔다 */}
      {planCount === 0 && !openInquiries ? (
        <span className={`${menu.item} ${menu.disabled}`} aria-disabled="true" title="사업을 시작하면 열려요">
          <MessagesSquare aria-hidden="true" /><span className={menu.disabledText}>손님 문의<small>사업을 시작하면 열려요</small></span>
        </span>
      ) : (
        <Link href="/plan/inquiries" className={menu.item} title="손님 문의" aria-current={here("inquiries")}>
          <MessagesSquare aria-hidden="true" /><span>손님 문의</span>{openInquiries ? <b className={menu.count} aria-label={`답할 문의 ${openInquiries}건`}>{openInquiries}</b> : null}
        </Link>
      )}
    </div>
    {/* 내 사업 묶음(사업 → 그 사업의 목차) · 최근 대화 묶음 */}
    <BusinessRailTree documentToc={documentToc} onPlanCount={setPlanCount} grouped />
    {/* 예전 문서 화면이면 그 목차가 여기 붙는다 */}
    {children}
    <div className={menu.spring} />
    {/* 안내 카드 240×64 — 고객센터 */}
    <Link href="/account/support" className={menu.promo} aria-current={here("support")}>
      <span className={menu.promoText}><span className={menu.promoTitle}>고객센터</span><span className={menu.promoDesc}>궁금한 점을 남기면 답해 드려요</span></span>
      <i aria-hidden="true" />
    </Link>
    {account === null ? null : account.authenticated ? (
      <div className={menu.foot}>
        <button type="button" className={menu.footAvatar} aria-haspopup="dialog" aria-expanded={profile === "bottom"} aria-label={`프로필 메뉴 열기 (${account.email ?? "로그인됨"})${openInquiries ? ` · 답할 문의 ${openInquiries}건` : ""}`} onClick={() => setProfile(profile === "bottom" ? null : "bottom")}>
          <span className={menu.avatar} aria-hidden="true">{accountInitial(account)}{openInquiries ? <em>{openInquiries > 9 ? "9+" : openInquiries}</em> : null}</span>
        </button>
        <Link href="/plan/inquiries" className={menu.footIcon} aria-label="받은 알림" title="받은 알림"><Inbox aria-hidden="true" /></Link>
      </div>
    ) : (
      /* /account?next= 는 로그인 팝업이 받아 이 화면에서 연다 */
      <div className={menu.auth}>
        <a className={menu.login} href={`/account?next=${loginNext}`}>로그인<ChevronRight aria-hidden="true" /></a>
        <a className={menu.signup} href={`/account?mode=register&next=${loginNext}`}>회원가입<ChevronRight aria-hidden="true" /></a>
      </div>
    )}
    <ProfileMenu open={profile !== null} anchor={profile ?? "bottom"} onClose={() => setProfile(null)} account={account} unanswered={openInquiries} />
  </div>;
}
