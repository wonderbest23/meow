import { documentIndustryLabel } from "./business-launch";
import { readCoach } from "./coach";
import type { Plan, PlanState } from "./plan-store";

/** A document stays bound to its own business, even when another tab changes the active plan. */
export function documentContext(state: PlanState, planId: string | null) {
  const plan = planId ? state.plans.find(item => item.id === planId) : undefined;
  if (!plan) return null;
  return { plan, business: readCoach(plan.answers)?.business ?? state.business };
}

/** 일반 현황 표 — 입력한 값만 싣는다(대표자·사업자번호 같은 칸은 지어내지 않는다) */
export function overviewFields(business: { name?: string; industry?: string; region?: string; stage?: string }, planType?: string, date?: Date) {
  return ([["사업명", business.name], ["업종", business.industry], ["지역", business.region], ["진행 단계", business.stage], ["계획 유형", planType], ["작성일", date?.toLocaleDateString("ko-KR")]] as Array<[string, string | undefined]>)
    .flatMap(([label, value]) => value?.trim() ? [{ label, value: value.trim() }] : []);
}

/*
 * 문서에 적는 사업 정보 — 업종은 확정한 분류 · 업종 가이드 이름을 넓은 업종 이름보다 먼저 쓴다(business-launch documentIndustryLabel).
 * 화면의 일반 현황 표와 내려받는 PDF · Word 가 같은 이 함수를 쓴다. 예전엔 내려받기만 그 이름을 써서, 같은 계획서가 화면에는
 * '유통 · 온라인 판매', PDF 에는 '생활화학제품 제조(캔들…)'로 달리 나왔다(2026-11-20 점검).
 */
export function documentBusiness<T extends { industry?: string }>(plan: Pick<Plan, "answers">, business: T): T {
  return { ...business, industry: documentIndustryLabel(plan) || business.industry };
}
