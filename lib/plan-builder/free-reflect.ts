/**
 * 고친 사업 정보를 계획서에 다시 반영할 때는 '다시 생성' 횟수를 빼지 않는다(소유자 결정 2026-10-07).
 * 숫자 하나 고쳐도 모든 항목을 다시 써서 20회 중 9회가 빠지던 문제 때문이다. 대신 AI 비용이 끝없이 나가지 않게
 * 계획서마다 모두 FREE_REFLECTS_TOTAL번까지만 무료로 하고, 그 뒤에는 예전처럼 횟수를 쓴다.
 * 처음엔 '하루 3번'이었는데 날마다 다시 생겨 한 계획서로 한 달 수십만 원의 AI 비용이 나갈 수 있어 평생 상한으로 바꿨다
 * (운영 실측: 10개 항목 다시 쓰기 1번 약 2.9달러).
 * 사용 기록은 화면 저장이 덮어쓸 수 없는 __coach_generation 안에 둔다.
 */
export const FREE_REFLECTS_TOTAL = 5;

type GenerationLike = { freeReflects?: unknown } | null | undefined;

/** Every free reflect this plan has used (timestamps), oldest first. */
export function usedFreeReflects(generation: GenerationLike): string[] {
  const list = Array.isArray(generation?.freeReflects) ? generation!.freeReflects as unknown[] : [];
  return list.filter((at): at is string => typeof at === "string" && !Number.isNaN(Date.parse(at)));
}

export function freeReflectsLeft(generation: GenerationLike): number {
  return Math.max(0, FREE_REFLECTS_TOTAL - usedFreeReflects(generation).length);
}

/** The section worker skips the regen quota for sections rewritten by a free reflect of this revision. */
export function isFreeReflect(generation: unknown, revision: number): boolean {
  if (!generation || typeof generation !== "object") return false;
  const value = generation as { free?: unknown; revision?: unknown };
  return value.free === true && value.revision === revision;
}
