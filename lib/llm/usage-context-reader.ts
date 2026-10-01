/*
 * usage-context 를 읽기만 하는 쪽 — node:async_hooks 를 가져오지 않는다.
 *
 * lib/llm/usage.ts 는 브라우저 묶음(개발용 분석 화면 등)에도 끌려 들어가는데, 거기에
 * node:async_hooks 가 섞이면 빌드가 깨진다(2026-10-01 배포 실패). 그래서 문맥 저장소는
 * 서버 입구가 가져오는 usage-context.ts 에만 두고, 여기서는 그 파일이 전역에 걸어 둔
 * 읽기 함수만 부른다. 아무도 걸어 두지 않았으면(브라우저·입구 밖) 문맥 없음.
 */
export type UsageContext = { planId?: string; ownerHash?: string };

export const USAGE_CONTEXT_KEY = Symbol.for("oneulstart.llm.usageContext");

export function currentUsageContext(): UsageContext | undefined {
  const read = (globalThis as Record<symbol, unknown>)[USAGE_CONTEXT_KEY];
  return typeof read === "function" ? (read as () => UsageContext | undefined)() : undefined;
}
