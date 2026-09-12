import { readCoach } from "./coach";
import type { PlanState } from "./plan-store";

/** A document stays bound to its own business, even when another tab changes the active plan. */
export function documentContext(state: PlanState, planId: string | null) {
  const plan = planId ? state.plans.find(item => item.id === planId) : undefined;
  if (!plan) return null;
  return { plan, business: readCoach(plan.answers)?.business ?? state.business };
}
