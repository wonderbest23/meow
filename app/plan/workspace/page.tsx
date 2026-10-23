"use client";

import BusinessKeyed from "../BusinessKeyed";
import PlanLoading from "../PlanLoading";
import frame from "../chat/page.module.css";
import StudioRedirect from "../studio/StudioRedirect";
import { BusinessWorkspace } from "./BusinessWorkspace";

/*
 * 왼쪽 목록에서 다른 사업을 고르면(주소의 planId 가 바뀌면) 본문을 그 사업으로 새로 그린다 — 같은 사업의 탭 바꾸기는 그대로(BusinessKeyed)
 * 작업실이 켜져 있으면 개업 준비 · 유지보수(tab=launch|operations|action)만 작업실로 보낸다(주간 리포트 메일의 step=marketing 포함).
 * 사업 요약 · 문서(탭 없음 · summary · documents)는 작업실에 없어 그대로 — StudioRedirect
 */
export default function BusinessWorkspacePage() {
  const loading = <main className={frame.page}><PlanLoading fill variant="compact" note="사업을 불러오고 있어요" /></main>;
  return <BusinessKeyed fallback={loading}><StudioRedirect fallback={loading}><BusinessWorkspace /></StudioRedirect></BusinessKeyed>;
}
