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

/** 저장된 문자열(없거나 깨졌으면 null)을 안전하게 읽는다 */
export function parseQuarantineNotice(raw: string | null | undefined): QuarantineNotice | null {
  if (!raw) return null;
  try { return readQuarantineNotice(JSON.parse(raw)); } catch { return null; }
}

/**
 * 새 격리 안내가 화면에 보이는 것(가릴 사업·사업 정보)을 실제로 바꾸는지.
 *
 * 서버는 막힌 것이 없어도 빈 안내({revision:"", blockedPlanIds:[], profileBlocked:false})를 보낸다.
 * 처음 방문한 브라우저에는 저장된 안내가 없어서 그것을 '바뀜'으로 보고 화면을 다시 불러왔다
 * (/plan 첫 방문에 문서·스크립트를 두 번 받음). 가리는 대상이 같으면 다시 그릴 필요가 없다.
 */
export function quarantineChangesCache(previous: QuarantineNotice | null, next: QuarantineNotice | null): boolean {
  if (Boolean(previous?.profileBlocked) !== Boolean(next?.profileBlocked)) return true;
  const before = new Set(previous?.blockedPlanIds ?? []);
  const after = new Set(next?.blockedPlanIds ?? []);
  if (before.size !== after.size) return true;
  for (const id of after) if (!before.has(id)) return true;
  return false;
}
