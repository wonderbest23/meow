"use client";

import BusinessKeyed from "../BusinessKeyed";
import PlanLoading from "../PlanLoading";
import StudioRedirect from "../studio/StudioRedirect";
import { PlanDocumentBody } from "./PlanDocumentBody";

/*
 * 왼쪽 목록에서 다른 사업을 고르면(주소의 planId 가 바뀌면) 본문을 그 사업으로 새로 그린다 — BusinessKeyed
 * 작업실이 켜져 있으면 같은 사업의 작업실 '사업계획서' 탭으로 보낸다(?classic=1 이면 그대로) — StudioRedirect
 */
export default function PlanDocumentPage() {
  const loading = <PlanLoading fill note="사업계획서를 불러오고 있어요" />;
  return <BusinessKeyed adoptFirst fallback={loading}><StudioRedirect fallback={loading}><PlanDocumentBody /></StudioRedirect></BusinessKeyed>;
}
