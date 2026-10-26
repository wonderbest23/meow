import type { Metadata } from "next";

/* 주문번호가 든 개인 화면 — 탭 이름은 다른 화면처럼 'OO | 오늘창업', 검색에는 올리지 않는다(점검 r41-B) */
export const metadata: Metadata = { title: "계좌이체 주문 | 오늘창업", robots: { index: false, follow: false } };

export default function TransferLayout({ children }: { children: React.ReactNode }) {
  return children;
}
