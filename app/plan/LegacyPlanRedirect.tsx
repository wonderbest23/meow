"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PlanLoading from "./PlanLoading";
import { activePlan, loadState } from "../../lib/plan-builder/plan-store";
import { documentHref } from "../../lib/plan-builder/business-hub";
import { isSampleId } from "../../lib/plan-builder/samples";

/*
 * 예전 흐름(플랜 개요 → AI 분석 → 항목별 질문)으로 들어온 주소.
 * 지금은 대화 → 사업계획서로 만들고 고치므로, 보던 사업의 사업계획서(없으면 내 사업 목록)로 보낸다.
 * 옛 즐겨찾기·메일 링크가 낯선 옛 화면에 떨어지지 않게 하려고 주소만 남겨 둔다.
 */
export default function LegacyPlanRedirect() {
  const router = useRouter();
  useEffect(() => {
    let plan = null;
    try { plan = activePlan(loadState()); } catch { /* 기기 저장본이 깨져도 목록으로 */ }
    // 예시 문서는 내 사업이 아니다 — 그때는 목록으로
    router.replace(plan && !isSampleId(plan.id) ? documentHref(plan.id) : "/plan");
  }, [router]);
  return <PlanLoading fill note="사업계획서로 옮기고 있어요" />;
}
