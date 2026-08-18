"use client";

/*
 * 다시 생성 잔여 횟수 — 화면 표시용 캐시.
 *
 * 판정은 서버가 한다. 여기 값은 '방금 서버가 알려준 남은 횟수'를 들고 있다가
 * 화면에 보여주기만 한다. 이 값을 고쳐도 생성이 더 되지는 않는다.
 *
 * 미리 알려주는 이유는 하나다 — 20회를 다 쓰는 순간 예고 없이 막히면
 * 손님은 고장으로 읽는다. 몇 회 남았는지 먼저 보여야 한다.
 */

export interface RegenQuotaView {
  allowed: number;
  used: number;
  remaining: number;
}

/** 남은 횟수가 이 이하로 떨어지면 화면에 알린다 */
export const REGEN_WARN_AT = 5;

const byPlan = new Map<string, RegenQuotaView>();
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

/** 생성 응답에 quota 가 실려 왔을 때 갱신한다 */
export function rememberRegenQuota(planId: string | undefined, quota: unknown): void {
  if (!planId || !quota || typeof quota !== "object") return;
  const q = quota as Partial<RegenQuotaView>;
  if (typeof q.allowed !== "number" || typeof q.used !== "number" || typeof q.remaining !== "number") return;
  byPlan.set(planId, { allowed: q.allowed, used: q.used, remaining: q.remaining });
  notify();
}

export function regenQuotaOf(planId: string | undefined): RegenQuotaView | null {
  return planId ? byPlan.get(planId) ?? null : null;
}

export function subscribeRegenQuota(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
