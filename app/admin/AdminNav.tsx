"use client";

import { Banknote, Headphones, LayoutDashboard, LogOut, PanelsTopLeft, RotateCcw, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import WorkspaceBrand from "../../components/workspace-brand";
import styles from "./AdminWorkspace.module.css";

/**
 * 어드민 공용 헤더 — 어느 화면에서든 같은 네비게이션.
 * 세션은 하나(support 스코프)라 로그인은 한 번이면 된다.
 */
export default function AdminNav({ title, subtitle }: { title: string; subtitle?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/admin/support/session", { method: "DELETE" });
    router.push("/admin");
    router.refresh();
  };

  const links = [
    { href: "/admin", label: "대시보드", Icon: LayoutDashboard },
    { href: "/admin/support", label: "1:1 상담", Icon: Headphones },
    { href: "/admin/payments", label: "입금 주문", Icon: Banknote },
    { href: "/admin/refunds", label: "환불", Icon: RotateCcw },
    { href: "/admin/legal", label: "운영 설정", Icon: Settings },
    { href: "/admin/homepage", label: "홈 문구", Icon: PanelsTopLeft },
  ];

  return (
    <><aside className={styles.rail} aria-label="관리자 메뉴"><Link href="/admin" aria-label="오늘창업 관리자"><WorkspaceBrand /></Link><nav>
        {links.map(({ href, label, Icon }) => (
          <Link
            key={href}
            aria-current={pathname === href ? "page" : undefined}
            href={href}
          >
            <Icon /> {label}
          </Link>
        ))}
      </nav><small>오늘창업 운영 관리</small></aside>
    <header className={styles.header}><div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div><button type="button" onClick={() => void logout()}><LogOut size={18} />로그아웃</button></header></>
  );
}
