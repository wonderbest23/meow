import type { Metadata } from "next";
import type { ReactNode } from "react";

/* 로그인·계정 복구 화면 — 홈과 다른 제목, 검색에는 올리지 않는다(app/robots.ts 도 /account 를 막는다). 고객센터는 자기 제목이 있다 */
export const metadata: Metadata = { title: "로그인 | 오늘창업", robots: { index: false, follow: false } };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
