"use client";

import { Banknote, Headphones, LayoutDashboard, LogOut, PanelsTopLeft, RotateCcw, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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
    <header className="admin-support-header">
      <div>
        <span><LayoutDashboard /></span>
        <div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>
      </div>
      <div>
        {links.map(({ href, label, Icon }) => (
          <Link
            key={href}
            className={`admin-settings-link ${pathname === href ? "active" : ""}`}
            href={href}
          >
            <Icon /> {label}
          </Link>
        ))}
        <button type="button" onClick={() => void logout()}><LogOut /> 로그아웃</button>
      </div>
    </header>
  );
}
