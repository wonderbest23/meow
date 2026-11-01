"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, ChevronRight, CircleHelp, Contrast, CreditCard, Inbox, LayoutGrid, LogIn, Settings, User, UserPlus } from "lucide-react";
import { useDialogFocus } from "../../components/use-dialog-focus";
import { accountInitial, accountName, type Account } from "./use-account";
import styles from "./ProfileMenu.module.css";

/*
 * 프로필 메뉴 — 휴대폰은 아래서 올라오는 시트(r24), PC 는 왼쪽 메뉴의 계정 단추·아바타 옆에 뜨는 같은 모양의 창.
 * 예전 왼쪽 메뉴 아래쪽(손님 문의 · 약관·정책 · 고객센터 · 내 계정)과 머리말 메뉴가 여기로 모였다 — 주소는 예전 그대로.
 * 받은 알림 = 손님 문의(답할 문의 수), 프로필·계정 설정·결제 내역 = 내 계정 화면의 각 칸, 이용 안내 = 약관·정책.
 */
export type ProfileAnchor = "top" | "bottom" | "sheet";

export default function ProfileMenu({ open, onClose, account, unanswered, anchor = "sheet", onOpenMenu }: {
  open: boolean; onClose: () => void; account: Account | null; unanswered: number;
  /** 어디에 뜨는지 — sheet(휴대폰, 아래에서) · top(PC 계정 단추 아래) · bottom(PC 아바타 위) */
  anchor?: ProfileAnchor;
  /** 휴대폰 — 내 사업 나무(사업 → 목차)를 담은 메뉴 서랍을 연다 */
  onOpenMenu?: () => void;
}) {
  const pathname = usePathname() || "/plan";
  const ref = useDialogFocus<HTMLDivElement>(open, { onEscape: onClose });
  const [display, setDisplay] = useState(false);
  if (!open) return null;
  const signedIn = account?.authenticated === true;
  const name = accountName(account);
  const next = encodeURIComponent(pathname);
  /* 링크를 누르면 닫는다 — 같은 주소(#칸 이동)여도 시트가 덮고 있지 않게 */
  const row = (href: string, icon: React.ReactNode, label: string, extra?: React.ReactNode, chevron = false) => (
    <Link href={href} className={styles.row} onClick={onClose}>{icon}<span className={styles.label}>{label}</span>{extra}{chevron && <ChevronRight className={styles.chev} aria-hidden="true" />}</Link>
  );
  return <>
    <div className={styles.scrim} data-anchor={anchor} onClick={onClose} aria-hidden="true" />
    <div ref={ref} className={styles.sheet} data-anchor={anchor} role="dialog" aria-modal="true" aria-label="프로필 메뉴">
      {anchor === "sheet" && <button type="button" className={styles.grab} aria-label="프로필 메뉴 닫기" onClick={onClose} />}
      {signedIn ? <div className={styles.who}>
        <span className={styles.avatar} aria-hidden="true">{accountInitial(account)}</span>
        <div className={styles.whoText}><p className={styles.name}>{name || "내 계정"}</p>{account?.email && <p className={styles.mail}>{account.email}</p>}</div>
      </div> : <div className={styles.who}><div className={styles.whoText}><p className={styles.name}>로그인하면 내 사업이 보여요</p></div></div>}
      <nav aria-label="프로필 메뉴 목록">
        {signedIn
          ? row("/plan/inquiries", <Inbox aria-hidden="true" />, "받은 알림", unanswered ? <b className={styles.count} aria-label={`답할 문의 ${unanswered}건`}>{unanswered}</b> : null, true)
          : <>
            {row(`/account?next=${next}`, <LogIn aria-hidden="true" />, "로그인", null, true)}
            {row(`/account?mode=register&next=${next}`, <UserPlus aria-hidden="true" />, "회원가입", null, true)}
          </>}
        {row("/plan", <Bell aria-hidden="true" />, "새로운 소식", <span className={styles.hint}>오늘 할 일</span>, true)}
        {onOpenMenu && <button type="button" className={styles.row} onClick={() => { onClose(); onOpenMenu(); }}><LayoutGrid aria-hidden="true" /><span className={styles.label}>내 사업 메뉴</span><ChevronRight className={styles.chev} aria-hidden="true" /></button>}
        <div className={styles.hr} />
        {signedIn && <>
          {row("/plan/me", <User aria-hidden="true" />, "프로필")}
          {/* 계정 설정 — 휴대폰은 전체 화면 목록(시안 MSettings: 내 계정 · 환경설정 · 보안 · 기기 및 앱), PC 는 설정 메뉴가 있는 내 계정 화면 */}
          {row(anchor === "sheet" ? "/plan/settings" : "/plan/me#me-info", <Settings aria-hidden="true" />, "계정 설정", null, anchor === "sheet")}
          {row("/plan/me#me-payments", <CreditCard aria-hidden="true" />, "결제 내역")}
        </>}
        {row("/account/support", <CircleHelp aria-hidden="true" />, "고객센터", null, true)}
        {row("/plan/info", <BookOpen aria-hidden="true" />, "이용 안내", null, true)}
        {/* 화면 설정 — 지금은 밝은 화면 하나라 바꿀 것이 없다. 무엇이 정해져 있는지만 펼쳐 알려 준다 */}
        <button type="button" className={styles.row} aria-expanded={display} aria-controls="profile-display-note" onClick={() => setDisplay(value => !value)}><Contrast aria-hidden="true" /><span className={styles.label}>화면 설정</span><ChevronRight className={styles.chev} data-open={display || undefined} aria-hidden="true" /></button>
        {display && <p id="profile-display-note" className={styles.note}>밝은 화면으로 보여 드려요. 글자 크기는 기기·브라우저의 글자 크기 설정을 따라요.</p>}
      </nav>
    </div>
  </>;
}
