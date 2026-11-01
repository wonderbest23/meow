import type { Metadata } from "next";
import type { ReactNode } from "react";

/* 계정 설정 묶음(목록 · 환경설정 · 보안 · 기기 및 앱) — 화면마다 자기 틀(AppFrame)을 둔다(제목 · ✕/‹ 가 다르다) */
export const metadata: Metadata = { title: "계정 설정 | 오늘창업" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
