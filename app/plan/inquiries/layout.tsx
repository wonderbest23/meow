import type { Metadata } from "next";
import type { ReactNode } from "react";

/* 브라우저 탭 제목만 정한다 — 예전엔 /plan 아래 화면이 모두 '내 사업'이었다(점검 2026-10-23). 화면 틀은 각 page 가 그린다 */
export const metadata: Metadata = { title: "손님 문의 | 오늘창업" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
