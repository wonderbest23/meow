export interface QuarantineNotice { revision: string; blockedPlanIds: string[]; profileBlocked: boolean }

export function readQuarantineNotice(value: unknown): QuarantineNotice | null {
  if (!value || typeof value !== "object") return null;
  const q = value as Partial<QuarantineNotice>;
  if (typeof q.revision !== "string" || !Array.isArray(q.blockedPlanIds) || !q.blockedPlanIds.every(id => typeof id === "string") || typeof q.profileBlocked !== "boolean") return null;
  return q as QuarantineNotice;
}

export function filterQuarantinedCache<T extends { plans: { id: string }[]; business: object; activePlanId: string | null }>(state: T, q: QuarantineNotice | null, emptyBusiness: T["business"]): T {
  if (!q) return state;
  return { ...state, plans: state.plans.filter(plan => !q.blockedPlanIds.includes(plan.id)),
    business: q.profileBlocked ? { ...emptyBusiness } : state.business,
    activePlanId: state.activePlanId && q.blockedPlanIds.includes(state.activePlanId) ? null : state.activePlanId };
}
