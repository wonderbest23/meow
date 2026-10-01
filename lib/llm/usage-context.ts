import { AsyncLocalStorage } from "node:async_hooks";

/*
 * AI 사용 기록의 '어느 사업(계획서) 일인가' — 요청·작업 입구에서 한 번 정하면, 그 안에서 부르는
 * 모든 AI 호출 기록(llm_usage.plan_id)에 붙는다. 호출하는 곳 서른 군데를 하나씩 고치지 않아도
 * 사업별 비용을 셀 수 있다. 입구에서 정하지 않은 호출은 plan_id 없이 남는다(예전과 같다).
 */
import { USAGE_CONTEXT_KEY, type UsageContext } from "./usage-context-reader";

export type { UsageContext };

const store = new AsyncLocalStorage<UsageContext>();

export function withUsageContext<T>(context: UsageContext, run: () => T): T {
  return store.run({ ...store.getStore(), ...context }, run);
}

export function usageContext(): UsageContext | undefined {
  return store.getStore();
}

// 기록 쪽(lib/llm/usage.ts)은 이 파일을 가져오지 않고 전역에 걸린 읽기 함수로 문맥을 본다
(globalThis as Record<symbol, unknown>)[USAGE_CONTEXT_KEY] = usageContext;
