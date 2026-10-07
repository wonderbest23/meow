"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, Headphones, MessagesSquare, SquarePen } from "lucide-react";
import { unansweredCount, useInquiries } from "./inquiries/use-inquiries";
import styles from "./PlanShell.module.css";
import menu from "./RailMenu.module.css";
import { DEFAULT_LOGO } from "../../components/site-header";
import BusinessRailTree, { type DocumentToc } from "./BusinessRailTree";

/*
 * 왼쪽 메뉴 하나 — 대화·내 사업 화면(BusinessAppChrome)과 문서·결제 화면(PlanShell)이 같이 쓴다.
 * 예전엔 두 화면이 메뉴를 따로 그려서 폭(232px/208px)·항목·모양이 달랐고, 계정·이용 안내는 한쪽에만 있었다.
 * 계정은 아래 한 줄(내 계정)로 모으고, 마이페이지(/account)를 따로 찾아가지 않게 한다.
 */
export type RailActive = "new" | "chat" | "plans" | "info" | "support" | "me" | "inquiries";

function activeFor(pathname: string): RailActive | undefined {
  if (pathname.startsWith("/plan/info")) return "info";
  if (pathname.startsWith("/plan/me")) return "me";
  if (pathname.startsWith("/plan/inquiries")) return "inquiries";
  if (pathname.startsWith("/account/support")) return "support";
  if (pathname.startsWith("/plan")) return "plans";
  return undefined;
}

export default function RailMenu({ active, children, documentToc }: { active?: RailActive; children?: ReactNode; documentToc?: DocumentToc }) {
  const pathname = usePathname() || "";
  /* 사업 대화 화면(chat)은 그 사업이 속한 '내 사업'을 켠다 — 사업 기획 목록은 내 사업으로 합쳤다 */
  const picked = active ?? activeFor(pathname);
  const current = picked === "chat" ? "plans" : picked;
  const [account, setAccount] = useState<{ authenticated: boolean; email: string | null } | null>(null);
  useEffect(() => {
    /*
     * 로그인 여부는 로그인 전용 주소로 확인한다(사이트 머리말과 같은 곳).
     * 예전엔 결제 권한 주소(/api/plan/access)를 썼는데, 그 주소는 권한 확인에 실패하면
     * '로그인 안 됨'으로 답해 로그인한 사람에게도 로그인·회원가입 단추가 보였다.
     * 확인하지 못했으면 단추를 바꾸지 않고 직전 상태를 둔다.
     */
    let alive = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("session unavailable"); return r.json(); })
      .then((d: { authenticated?: boolean; email?: string | null }) => { if (alive) setAccount({ authenticated: !!d.authenticated, email: d.email ?? null }); })
      .catch(() => { /* 직전 상태 유지 — 처음이면 아무것도 그리지 않는다 */ });
    return () => { alive = false; };
  }, [pathname]);
  const initial = account?.email ? account.email.trim().charAt(0).toUpperCase() : null;
  /* PlanShell 의 railBtn·railLabel 은 폰에서 아이콘만 남기는 동작용으로 같이 붙이고, 모양은 RailMenu.module.css 가 정한다 */
  const item = (extra = "") => `${styles.railBtn} ${menu.item} ${extra}`;
  const here = (key: RailActive) => (current === key ? "page" as const : undefined);
  const loginNext = encodeURIComponent(pathname || "/plan");
  /* 내 문의 — 답할 문의 수(로그인했을 때만 센다) */
  const inquiries = useInquiries();
  const openInquiries = inquiries.items ? unansweredCount(inquiries.items) : 0;

  /* data-app-rail: 화면 로딩 표시(PlanLoading)가 메뉴 폭만큼 본문 가운데로 옮겨 가는 기준 */
  return <div className={menu.menu} data-app-rail>
    <Link href="/" className={menu.brand} title="오늘창업 홈" aria-label="오늘창업 홈">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={menu.logoFull} src={DEFAULT_LOGO.src} alt="" width={DEFAULT_LOGO.width} height={DEFAULT_LOGO.height} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={menu.logoMark} src="/today-startup-mark-2026.png" alt="" width="38" height="38" />
    </Link>
    <Link href="/plan/chat?new=1" className={item(menu.newChat)} title="새 대화" aria-current={here("new")}>
      <SquarePen /><span className={styles.railLabel}>새 대화</span>
    </Link>
    {/* 내 사업 — 누르면 사업 목록이, 사업을 누르면 그 사업의 목차가 바로 아래 펼쳐진다 */}
    <BusinessRailTree documentToc={documentToc} />
    {/* 내 문의 — 홈페이지로 들어온 손님 문의를 메신저처럼(소유자 요청 2026-10-07) */}
    <Link href="/plan/inquiries" className={item()} title="내 문의" aria-current={here("inquiries")}>
      <MessagesSquare /><span className={styles.railLabel}>내 문의</span>{openInquiries ? <b className={menu.count} aria-label={`답할 문의 ${openInquiries}건`}>{openInquiries}</b> : null}
    </Link>
    {/* 플랜을 열어 둔 화면이면 그 목차가 여기 붙는다 */}
    {children}
    <div className={`${styles.spring} ${menu.spring}`} />
    <Link href="/plan/info" className={item()} title="이용 안내" aria-current={here("info")}>
      <CircleHelp /><span className={styles.railLabel}>이용 안내</span>
    </Link>
    <Link href="/account/support" className={item()} title="고객센터" aria-current={here("support")}>
      <Headphones /><span className={styles.railLabel}>고객센터</span>
    </Link>
    <div className={menu.divider} />
    {account === null ? null : account.authenticated ? (
      <Link href="/plan/me" className={item(menu.account)} title={`내 계정 · ${account.email ?? ""}`} aria-label={`내 계정 (${account.email ?? "로그인됨"})`} aria-current={here("me")}>
        <span className={`${styles.meAvatar} ${menu.avatar}`}>{initial ?? "나"}</span>
        <span className={`${styles.railLabel} ${menu.accountText}`}><span className={menu.accountName}>내 계정</span><span className={menu.accountMail}>{account.email}</span></span>
      </Link>
    ) : (
      /* /account?next= 는 로그인 팝업이 받아 이 화면에서 연다 */
      <div className={menu.auth}>
        <a className={menu.login} href={`/account?next=${loginNext}`}>로그인</a>
        <a className={menu.signup} href={`/account?mode=register&next=${loginNext}`}>회원가입</a>
      </div>
    )}
  </div>;
}
