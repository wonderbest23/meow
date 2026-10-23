"use client";

import BusinessKeyed from "../BusinessKeyed";
import PlanLoading from "../PlanLoading";
import frame from "../chat/page.module.css";
import { BusinessWorkspace } from "./BusinessWorkspace";

/* 왼쪽 목록에서 다른 사업을 고르면(주소의 planId 가 바뀌면) 본문을 그 사업으로 새로 그린다 — 같은 사업의 탭 바꾸기는 그대로(BusinessKeyed) */
export default function BusinessWorkspacePage() {
  return <BusinessKeyed fallback={<main className={frame.page}><PlanLoading fill variant="compact" note="사업을 불러오고 있어요" /></main>}><BusinessWorkspace /></BusinessKeyed>;
}
