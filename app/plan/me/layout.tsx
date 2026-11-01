import type { Metadata } from "next";
import type { ReactNode } from "react";
import AppFrame from "../AppFrame";

/* 브라우저 탭 제목 — 화면마다 다르게(예전엔 /plan 아래가 모두 '내 사업'이었다) */
export const metadata: Metadata = { title: "내 계정 | 오늘창업" };

/* 설정 틀(lovable 구조 3단계) — PC 는 설정 메뉴 + 판 안쪽 48, 휴대폰은 ‹(계정 설정 목록으로) · 제목 */
export default function Layout({ children }: { children: ReactNode }) {
  return <AppFrame title="내 계정" settings="back" backHref="/plan/settings">{children}</AppFrame>;
}
