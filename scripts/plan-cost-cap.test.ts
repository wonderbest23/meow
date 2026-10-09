import assert from "node:assert/strict";
import { freeAiCostKrw, planFreeAiCapReached, PLAN_FREE_AI_CAP_KRW } from "../lib/llm/plan-cost-cap";
import type { UsageRow } from "../lib/llm/cost";

// 사업 1건당 무료 AI 비용 상한(2026-10-09): 결제로 값을 받는 작업(항목 작성·검토·고쳐 쓰기·홈페이지 AI)은 세지 않는다
const at = "2026-10-09T00:00:00.000Z";
const row = (kind: string, input: number, output: number, model = "claude-opus-5-5"): UsageRow => ({ kind, model, ok: true, input_tokens: input, output_tokens: output, cache_read_tokens: 0, cache_write_tokens: 0, created_at: at });
assert.equal(PLAN_FREE_AI_CAP_KRW, 20_000);
// Opus 5.5: 입력 $4 / 출력 $20 (100만 토큰당). 입력 100만 + 출력 100만 = $24 = 33,600원(1,400원/달러)
assert.equal(freeAiCostKrw([row("intake-design", 1_000_000, 1_000_000)], 1400), 33_600);
assert.equal(freeAiCostKrw([row("generate", 1_000_000, 1_000_000), row("business-plan-review", 1_000_000, 0), row("landing-ai-fill", 1_000_000, 0)], 1400), 0, "paid work is not counted");
assert.equal(freeAiCostKrw([row("landing-ai-fill-use", 1_000_000, 0)], 1400), 0, "bookkeeping rows are not calls");
assert.equal(freeAiCostKrw([row("intake-edit", 1_000_000, 0, "unknown-model")], 1400), 0, "unpriced models are not guessed");
// 조회할 수 없으면(사업 없음·저장소 없음) 막지 않는다 — 하루 한도는 그대로 남는다
void (async () => {
  assert.equal(await planFreeAiCapReached(undefined), false);
  assert.equal(await planFreeAiCapReached("plan-without-store"), false);
  console.log("plan cost cap tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
