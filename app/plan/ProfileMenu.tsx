"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, CircleHelp, CreditCard, LogIn, LogOut, Settings, UserPlus } from "lucide-react";
import { clearLocalState } from "../../lib/plan-builder/plan-store";
import { openSupportChat } from "../../lib/client/open-support-chat";
import { useDialogFocus } from "../../components/use-dialog-focus";
import { accountInitial, accountName, type Account } from "./use-account";
import styles from "./ProfileMenu.module.css";

/*
 * 프로필 메뉴 — 휴대폰은 아래서 올라오는 시트(r24), PC 는 왼쪽 메뉴의 계정 단추·아바타 옆에 뜨는 같은 모양의 창.
 * 예전 왼쪽 메뉴 아래쪽(손님 문의 · 약관·정책 · 고객센터 · 내 계정)과 머리말 메뉴가 여기로 모였다 — 주소는 예전 그대로.
 * 받은 알림 = 손님 문의(답할 문의 수), 프로필·계정 설정·결제 내역 = 내 계정 화면의 각 칸, 이용 안내 = 약관·정책.
 */
export type ProfileAnchor = "top" | "bottom" | "sheet";

export default function ProfileMenu({ open, onClose, account, unanswered, inquiriesClosed = false, anchor = "sheet", onOpenMenu }: {
  open: boolean; onClose: () => void; account: Account | null; unanswered: number;
  /** 공개한 홈페이지가 없어 손님 문의가 닫혀 있으면 '받은 알림' 줄도 뺀다(왼쪽 메뉴와 같게) */
  inquiriesClosed?: boolean;
  /** 어디에 뜨는지 — sheet(휴대폰, 아래에서) · top(PC 계정 단추 아래) · bottom(PC 아바타 위) */
  anchor?: ProfileAnchor;
  /** 휴대폰 — 내 사업 나무(사업 → 목차)를 담은 메뉴 서랍을 연다 */
  onOpenMenu?: () => void;
}) {
  const pathname = usePathname() || "/plan";
  const ref = useDialogFocus<HTMLDivElement>(open, { onEscape: onClose });
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  /* 내 계정 화면의 로그아웃과 같은 순서 — 서버 세션이 끊긴 걸 확인한 뒤에만 이 기기 저장본을 비운다 */
  async function logout() {
    setLeaving(true); setLogoutError("");
    const res = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!res || !res.ok) { setLeaving(false); setLogoutError("로그아웃하지 못했어요. 연결을 확인하고 다시 시도해 주세요."); return; }
    clearLocalState();
    window.location.assign("/plan");
  }
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { if (!open) setPending(null); }, [open]);
  if (!open) return null;
  const signedIn = account?.authenticated === true;
  const name = accountName(account);
  const next = encodeURIComponent(pathname);
  /*
   * 다른 화면으로 가는 줄은 바로 닫지 않는다 — 다음 화면이 뜰 때(주소가 바뀌면 부모가 닫는다)까지 눌린 줄을 보여 준다.
   * 바로 닫으면 느린 화면이 뜨는 사이 빈 곳을 다시 눌러 아래 메뉴가 눌렸다(휴대폰 앱, 2026-11-07 사장님). 같은 주소(#칸 이동)면 바로 닫는다.
   */
  const go = (href: string) => (event: React.MouseEvent) => {
    if (href.split(/[?#]/)[0] === pathname) { onClose(); return; }
    if (pending) { event.preventDefault(); return; }
    setPending(href);
  };
  const row = (href: string, icon: React.ReactNode, label: string, extra?: React.ReactNode, chevron = false, onClick = go(href)) => (
    <Link href={href} className={styles.row} data-pending={pending === href || undefined} aria-busy={pending === href || undefined} onClick={onClick}>{icon}<span className={styles.label}>{label}</span>{extra}{chevron && <ChevronRight className={styles.chev} aria-hidden="true" />}</Link>
  );
  /* 휴대폰 '고객센터'는 아래 막대 '문의'와 같은 챗봇 창으로. 챗봇 단추가 없는 화면이면 양식 화면으로 */
  const support = (event: React.MouseEvent) => {
    if (anchor === "sheet" && openSupportChat()) { event.preventDefault(); onClose(); return; }
    go("/account/support")(event);
  };
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
          ? null /* '받은 알림'(손님 문의)은 뺐다(2026-11-15 사장님) — 홈페이지를 공개한 사업의 유지보수 화면 '문의 접수'로 연다 */
          : <>
            {row(`/account?next=${next}`, <LogIn aria-hidden="true" />, "로그인", null, true)}
            {row(`/account?mode=register&next=${next}`, <UserPlus aria-hidden="true" />, "회원가입", null, true)}
          </>}
        {/* '내 사업 메뉴' 줄도 뺐다 — 아래 탭 '내 사업'과 같은 곳이다 */}
        {!signedIn && <div className={styles.hr} />}
        {/* 네 줄만(2026-11-15 사장님: 복잡한 것은 자른다) — 프로필 · 이용 안내 · 화면 설정은 '계정 설정' 안에 있다 */}
        {signedIn && <>
          {/* 계정 설정 — 휴대폰은 전체 화면 목록(시안 MSettings: 내 계정 · 환경설정 · 보안 · 기기 및 앱), PC 는 설정 메뉴가 있는 내 계정 화면 */}
          {row(anchor === "sheet" ? "/plan/settings" : "/plan/me#me-info", <Settings aria-hidden="true" />, "계정 설정", null, anchor === "sheet")}
          {row("/plan/me#me-payments", <CreditCard aria-hidden="true" />, "결제 내역")}
        </>}
        {row("/account/support", <CircleHelp aria-hidden="true" />, "고객센터", null, true, support)}
        {signedIn && <button type="button" className={styles.row} disabled={leaving} onClick={() => void logout()}><LogOut aria-hidden="true" /><span className={styles.label}>{leaving ? "로그아웃 중…" : "로그아웃"}</span></button>}
        {logoutError && <p role="alert" className={styles.hint} style={{ padding: "4px 12px 8px" }}>{logoutError}</p>}
      </nav>
    </div>
  </>;
}
