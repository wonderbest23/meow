"use client";

import { usePathname } from "next/navigation";
import PlanLoading from "./PlanLoading";
import ChatLoading from "./chat/loading";
import BusinessAppChrome from "./BusinessAppChrome";
import frame from "./chat/page.module.css";

/**
 * 라우트 전환 로딩.
 * 화면 코드가 도착하기 전 구간은 지금까지 완전한 공백이었다 —
 * 느린 회선에서 아무 반응이 없어 멈춘 것처럼 보였다.
 */
export default function Loading() {
  const pathname = usePathname();
  if (pathname === "/plan/chat" || pathname === "/plan/chat/") return <ChatLoading />;
  const path = pathname.replace(/\/$/, "");
  if (["/plan", "/plan/planning", "/plan/workspace", "/plan/document"].includes(path)) {
    const title = path === "/plan/planning" ? "사업 기획" : path === "/plan/workspace" ? "내 사업 관리" : path === "/plan/document" ? "사업계획서" : "내 사업";
    return <main className={frame.page}><BusinessAppChrome title={title} active={path === "/plan/planning" ? "chat" : "plans"} showRail={path !== "/plan/document"}><PlanLoading fill variant="compact" note="화면을 불러오고 있어요" /></BusinessAppChrome></main>;
  }
  return <PlanLoading variant="rows" note="불러오는 중…" />;
}
