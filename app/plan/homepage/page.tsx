"use client";

import BusinessKeyed from "../BusinessKeyed";
import PlanLoading from "../PlanLoading";
import StudioRedirect from "../studio/StudioRedirect";
import { HomepageScreen } from "./HomepageScreen";

/*
 * 왼쪽 목록에서 다른 사업을 고르면(주소의 planId 가 바뀌면) 본문을 그 사업으로 새로 그린다 — BusinessKeyed
 * 작업실이 켜져 있으면 같은 사업의 작업실 '홈페이지' 탭으로 보낸다(손님 문의 알림 메일 링크 포함 · ?classic=1 이면 그대로).
 * 보낼 때는 본문을 그리지 않는다 — 이 화면은 열리는 순간 홈페이지를 만들고 AI 자동 채우기를 시작한다.
 */
export default function PlanHomepagePage() {
  const loading = <PlanLoading fill note="홈페이지를 불러오고 있어요" />;
  return <BusinessKeyed fallback={loading}><StudioRedirect fallback={loading}><HomepageScreen /></StudioRedirect></BusinessKeyed>;
}
