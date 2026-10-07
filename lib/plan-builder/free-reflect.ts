/**
 * 고친 사업 정보를 계획서에 다시 반영할 때는 '다시 생성' 횟수를 빼지 않는다(소유자 결정 2026-10-07).
 * 숫자 하나 고쳐도 모든 항목을 다시 써서 20회 중 9회가 빠지던 문제 때문이다. 대신 AI 비용이 끝없이 나가지 않게
 * 계획서마다 하루(24시간) FREE_REFLECTS_PER_DAY번까지만 무료로 하고, 그 뒤에는 예전처럼 횟수를 쓴다.
 * 사용 기록은 화면 저장이 덮어쓸 수 없는 __coach_generation 안에 둔다.
 */
export const FREE_REFLECTS_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type GenerationLike = { freeReflects?: unknown } | null | undefined;

/** Free reflect timestamps still inside the 24-hour window. */
export function recentFreeReflects(generation: GenerationLike, now = Date.now()): string[] {
  const list = Array.isArray(generation?.freeReflects) ? generation!.freeReflects as unknown[] : [];
  return list.filter((at): at is string => typeof at === "string" && now - Date.parse(at) < DAY_MS);
}

export function freeReflectsLeft(generation: GenerationLike, now = Date.now()): number {
  return Math.max(0, FREE_REFLECTS_PER_DAY - recentFreeReflects(generation, now).length);
}

/** The section worker skips the regen quota for sections rewritten by a free reflect of this revision. */
export function isFreeReflect(generation: unknown, revision: number): boolean {
  if (!generation || typeof generation !== "object") return false;
  const value = generation as { free?: unknown; revision?: unknown };
  return value.free === true && value.revision === revision;
}
