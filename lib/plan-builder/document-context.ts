import { readCoach } from "./coach";
import type { PlanState } from "./plan-store";

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
