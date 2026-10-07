"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import PlanLoading from "./PlanLoading";
import ChatLoading from "./chat/loading";
import BusinessAppChrome from "./BusinessAppChrome";
import frame from "./chat/page.module.css";

const noop = () => () => {};
const readCareTab = () => new URLSearchParams(window.location.search).get("tab") === "operations";

/**
 * 라우트 전환 로딩.
 * 화면 코드가 도착하기 전 구간은 지금까지 완전한 공백이었다 —
 * 느린 회선에서 아무 반응이 없어 멈춘 것처럼 보였다.
 * 왼쪽 사업 목록이 있는 화면은 로딩 중에도 목록을 그대로 둔다 — 홈페이지 화면만 빠져 있어
 * 오갈 때마다 목록이 사라졌다 나타나며 '유지보수' 체크가 풀린 것처럼 보였다(소유자 지적 2026-10-07).
 */
export default function Loading() {
  const pathname = usePathname();
  const care = useSyncExternalStore(noop, readCareTab, () => false);
  if (pathname === "/plan/chat" || pathname === "/plan/chat/") return <ChatLoading />;
  const path = pathname.replace(/\/$/, "");
  const titles: Record<string, string> = { "/plan": "내 사업", "/plan/workspace": care ? "유지보수" : "내 사업 관리", "/plan/document": "사업계획서", "/plan/homepage": "홈페이지" };
  if (titles[path]) return <main className={frame.page}><BusinessAppChrome title={titles[path]} active="plans"><PlanLoading fill variant="compact" note="화면을 불러오고 있어요" /></BusinessAppChrome></main>;
  return <PlanLoading variant="rows" note="불러오는 중…" />;
}
