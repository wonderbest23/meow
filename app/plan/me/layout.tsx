import type { Metadata } from "next";
import type { ReactNode } from "react";
import AppFrame from "../AppFrame";

/* 브라우저 탭 제목 — 화면마다 다르게(예전엔 /plan 아래가 모두 '내 사업'이었다) */
export const metadata: Metadata = { title: "내 계정 | 오늘창업" };

/* 다른 화면과 같은 틀(← 제목 ☰ · 왼쪽 메뉴) */
export default function Layout({ children }: { children: ReactNode }) {
  return <AppFrame title="내 계정">{children}</AppFrame>;
}
