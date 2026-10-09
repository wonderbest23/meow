/**
 * 고친 사업 정보를 계획서에 다시 반영할 때는 '다시 생성' 횟수를 빼지 않는다(소유자 결정 2026-10-07).
 * 숫자 하나 고쳐도 모든 항목을 다시 써서 20회 중 9회가 빠지던 문제 때문이다. 대신 AI 비용이 끝없이 나가지 않게
 * 계획서마다 모두 FREE_REFLECTS_TOTAL번까지만 무료로 하고, 그 뒤에는 예전처럼 횟수를 쓴다.
 * 처음엔 '하루 3번'이었는데 날마다 다시 생겨 한 계획서로 한 달 수십만 원의 AI 비용이 나갈 수 있어 평생 상한으로 바꿨다
 * (운영 실측: 10개 항목 다시 쓰기 1번 약 2.9달러).
 * 사용 기록은 화면 저장이 덮어쓸 수 없는 __coach_generation 안에 둔다.
 *
 * 2026-10-09 가격 개편부터 계획서마다 2번(FREE_REFLECTS_TOTAL). 그 전에 결제한 계획서는 결제 당시 약속대로 5번이다.
 * 몇 번인지는 결제 주문(lib/plan-builder/regen-quota.ts resolvePlanAllowance)으로 정하고, 정한 값을 freeReflectsTotal 로
 * 함께 남겨 화면이 같은 숫자를 보여 준다. 값이 없는 기록은 개편 전에 만든 것이라 예전 조건으로 본다.
 */
export const FREE_REFLECTS_TOTAL = 2;
export const LEGACY_FREE_REFLECTS_TOTAL = 5;

type GenerationLike = { freeReflects?: unknown; freeReflectsTotal?: unknown } | null | undefined;

/** 이 계획서의 무료 반영 총 횟수 — 남긴 값, 개편 전 기록이면 예전 조건, 아직 기록이 없으면 지금 조건 */
export function storedFreeReflectsTotal(generation: GenerationLike): number {
  const stored = generation?.freeReflectsTotal;
  if (typeof stored === "number" && Number.isSafeInteger(stored) && stored >= 0) return stored;
  return generation ? LEGACY_FREE_REFLECTS_TOTAL : FREE_REFLECTS_TOTAL;
}

/** Every free reflect this plan has used (timestamps), oldest first. */
export function usedFreeReflects(generation: GenerationLike): string[] {
  const list = Array.isArray(generation?.freeReflects) ? generation!.freeReflects as unknown[] : [];
  return list.filter((at): at is string => typeof at === "string" && !Number.isNaN(Date.parse(at)));
}

export function freeReflectsLeft(generation: GenerationLike, total = storedFreeReflectsTotal(generation)): number {
  return Math.max(0, total - usedFreeReflects(generation).length);
}

/** The section worker skips the regen quota for sections rewritten by a free reflect of this revision. */
export function isFreeReflect(generation: unknown, revision: number): boolean {
  if (!generation || typeof generation !== "object") return false;
  const value = generation as { free?: unknown; revision?: unknown };
  return value.free === true && value.revision === revision;
}
