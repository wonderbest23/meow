import { AsyncLocalStorage } from "node:async_hooks";

/*
 * AI 사용 기록의 '어느 사업(계획서) 일인가' — 요청·작업 입구에서 한 번 정하면, 그 안에서 부르는
 * 모든 AI 호출 기록(llm_usage.plan_id)에 붙는다. 호출하는 곳 서른 군데를 하나씩 고치지 않아도
 * 사업별 비용을 셀 수 있다. 입구에서 정하지 않은 호출은 plan_id 없이 남는다(예전과 같다).
 */
export type UsageContext = { planId?: string; ownerHash?: string };

const store = new AsyncLocalStorage<UsageContext>();

export function withUsageContext<T>(context: UsageContext, run: () => T): T {
  return store.run({ ...store.getStore(), ...context }, run);
}

export function usageContext(): UsageContext | undefined {
  return store.getStore();
}
