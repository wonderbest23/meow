"use client";

import BusinessKeyed from "../BusinessKeyed";
import PlanLoading from "../PlanLoading";
import { HomepageScreen } from "./HomepageScreen";

/* 왼쪽 목록에서 다른 사업을 고르면(주소의 planId 가 바뀌면) 본문을 그 사업으로 새로 그린다 — BusinessKeyed */
export default function PlanHomepagePage() {
  return <BusinessKeyed fallback={<PlanLoading fill note="홈페이지를 불러오고 있어요" />}><HomepageScreen /></BusinessKeyed>;
}
