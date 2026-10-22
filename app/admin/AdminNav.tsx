"use client";

import { Activity, Banknote, BriefcaseBusiness, Coins, Database, Globe2, Headphones, LayoutDashboard, LogOut, PanelsTopLeft, RotateCcw, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type MouseEvent } from "react";
import { askConfirm } from "../../components/confirm-dialog";
import WorkspaceBrand from "../../components/workspace-brand";
import styles from "./AdminWorkspace.module.css";

/**
 * 어드민 공용 헤더 — 어느 화면에서든 같은 네비게이션.
 * 세션은 하나(support 스코프)라 로그인은 한 번이면 된다.
 * unsaved — 저장하지 않은 고침이 있으면 메뉴·로그아웃·창 닫기 전에 묻는다(예전엔 말없이 사라졌다).
 */
export default function AdminNav({ title, subtitle, unsaved = false }: { title: string; subtitle?: string; unsaved?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  const confirmLeave = async () => !unsaved || askConfirm({
    title: "저장하지 않고 나갈까요?",
    message: "고친 내용이 아직 저장되지 않았어요. 나가면 고친 내용이 사라져요.",
    confirmLabel: "저장 안 하고 나가기",
    cancelLabel: "계속 고치기",
    danger: true,
  });

  const go = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!unsaved || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    void confirmLeave().then((ok) => { if (ok) router.push(href); });
  };

  const logout = async () => {
    if (!(await confirmLeave())) return;
    await fetch("/api/admin/support/session", { method: "DELETE" }).catch(() => undefined);
    // 화면을 통째로 다시 읽는다 — 예전엔 대시보드에서 로그아웃해도 30초 새로고침 전까지 지표가 그대로 보였다
    window.location.assign("/admin");
  };

  const links = [
    { href: "/admin", label: "대시보드", Icon: LayoutDashboard },
    { href: "/admin/generation", label: "생성 작업", Icon: Activity },
    { href: "/admin/ai-cost", label: "AI 비용", Icon: Coins },
    { href: "/admin/support", label: "1:1 상담", Icon: Headphones },
    { href: "/admin/payments", label: "결제 주문", Icon: Banknote },
    { href: "/admin/domains", label: "도메인 구매", Icon: Globe2 },
    { href: "/admin/refunds", label: "환불 요청", Icon: RotateCcw },
    { href: "/admin/services", label: "서비스 신청", Icon: BriefcaseBusiness },
    { href: "/admin/legal", label: "운영 설정", Icon: Settings },
    { href: "/admin/homepage", label: "메인 홈페이지", Icon: PanelsTopLeft },
    { href: "/admin/schema", label: "DB 준비 상태", Icon: Database },
  ];

  return (
    <><aside className={styles.rail} aria-label="관리자 메뉴"><Link href="/admin" aria-label="오늘창업 관리자" onClick={(event) => go(event, "/admin")}><WorkspaceBrand /></Link><nav>
        {links.map(({ href, label, Icon }) => (
          <Link
            key={href}
            aria-current={pathname === href ? "page" : undefined}
            href={href}
            onClick={(event) => go(event, href)}
          >
            <Icon /> {label}
          </Link>
        ))}
      </nav><small>오늘창업 운영 관리</small></aside>
    <header className={styles.header}><div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div><button type="button" onClick={() => void logout()}><LogOut size={18} />로그아웃</button></header></>
  );
}
