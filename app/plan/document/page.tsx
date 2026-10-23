"use client";

import BusinessKeyed from "../BusinessKeyed";
import PlanLoading from "../PlanLoading";
import { PlanDocumentBody } from "./PlanDocumentBody";

/* 왼쪽 목록에서 다른 사업을 고르면(주소의 planId 가 바뀌면) 본문을 그 사업으로 새로 그린다 — BusinessKeyed */
export default function PlanDocumentPage() {
  return <BusinessKeyed adoptFirst fallback={<PlanLoading fill note="사업계획서를 불러오고 있어요" />}><PlanDocumentBody /></BusinessKeyed>;
}
