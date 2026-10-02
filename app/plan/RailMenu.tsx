"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, FolderClosed, Headphones, LayoutDashboard, MessageCircle, SquarePen } from "lucide-react";
import styles from "./PlanShell.module.css";
import WorkspaceBrand from "../../components/workspace-brand";

/*
 * 왼쪽 메뉴 하나 — 대화·내 사업 화면(BusinessAppChrome)과 문서·결제 화면(PlanShell)이 같이 쓴다.
 * 예전엔 두 화면이 메뉴를 따로 그려서 폭(232px/208px)·항목·모양이 달랐고, 계정·이용 안내는 한쪽에만 있었다.
 * 계정은 아래 한 줄(내 계정)로 모으고, 마이페이지(/account)를 따로 찾아가지 않게 한다.
 */
export type RailActive = "new" | "chat" | "plans" | "info" | "support" | "me";

function activeFor(pathname: string): RailActive | undefined {
  if (pathname.startsWith("/plan/info")) return "info";
  if (pathname.startsWith("/plan/me")) return "me";
  if (pathname.startsWith("/account/support")) return "support";
  if (pathname.startsWith("/plan/planning")) return "chat";
  if (pathname.startsWith("/plan")) return "plans";
  return undefined;
}

export default function RailMenu({ active, workspaceHref, children }: { active?: RailActive; workspaceHref?: string; children?: ReactNode }) {
  const pathname = usePathname() || "";
  const current = active ?? activeFor(pathname);
  const [account, setAccount] = useState<{ authenticated: boolean; email: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/plan/access")
      .then(r => r.json())
      .then(d => { if (alive) setAccount({ authenticated: !!d.authenticated, email: d.email ?? null }); })
      .catch(() => { if (alive) setAccount({ authenticated: false, email: null }); });
    return () => { alive = false; };
  }, [pathname]);
  const initial = account?.email ? account.email.trim().charAt(0).toUpperCase() : null;
  const item = (key: RailActive) => `${styles.railBtn} ${current === key ? styles.on : ""}`;
  const here = (key: RailActive) => (current === key ? "page" as const : undefined);

  return <>
    <Link href="/" className={styles.logo} title="오늘창업 홈" aria-label="오늘창업 홈"><WorkspaceBrand /></Link>
    <Link href="/plan/chat?new=1" className={`${item("new")} ${styles.railNew}`} title="새 대화" aria-current={here("new")}>
      <SquarePen /><span className={styles.railLabel}>새 대화</span>
    </Link>
    <Link href="/plan/planning" className={item("chat")} title="사업 기획" aria-current={here("chat")}>
      <MessageCircle /><span className={styles.railLabel}>사업 기획</span>
    </Link>
    <Link href="/plan" className={item("plans")} title="내 사업" aria-current={here("plans")}>
      <FolderClosed /><span className={styles.railLabel}>내 사업</span>
    </Link>
    {workspaceHref && <Link href={workspaceHref} className={`${styles.railBtn} ${styles.railSub}`} title="지금 보고 있는 사업의 결과물·시작 준비·운영 기록">
      <LayoutDashboard /><span className={styles.railLabel}>사업 관리</span>
    </Link>}
    {/* 플랜을 열어 둔 화면이면 그 목차가 여기 붙는다 */}
    {children}
    <div className={styles.spring} />
    <Link href="/plan/info" className={item("info")} title="이용 안내" aria-current={here("info")}>
      <CircleHelp /><span className={styles.railLabel}>이용 안내</span>
    </Link>
    <Link href="/account/support" className={item("support")} title="고객센터" aria-current={here("support")}>
      <Headphones /><span className={styles.railLabel}>고객센터</span>
    </Link>
    {account?.authenticated ? (
      <Link href="/plan/me" className={`${item("me")} ${styles.railAccount}`} title={`내 계정 · ${account.email ?? ""}`} aria-label={`내 계정 (${account.email ?? "로그인됨"})`} aria-current={here("me")}>
        <span className={styles.meAvatar}>{initial ?? "나"}</span>
        <span className={styles.railLabel}><span className={styles.railAccountName}>내 계정</span><span className={styles.railAccountMail}>{account.email}</span></span>
      </Link>
    ) : (
      <Link href={`/account?next=${encodeURIComponent(pathname || "/plan")}`} className={`${styles.railBtn} ${styles.signIn}`} title="로그인" aria-label="로그인">
        <span className={styles.signInText}>로그인</span>
        <span className={styles.railLabel}>로그인 · 계정 만들기</span>
      </Link>
    )}
  </>;
}
