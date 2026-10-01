import assert from "node:assert/strict";
import { isBillingDuplicate, kstDay, krwPerUsd, priceFor, rowCostUsd, summarizeUsage, type UsageRow } from "../lib/llm/cost";
import { usageContext, withUsageContext } from "../lib/llm/usage-context";

// 요금표: 더 구체적인 모델 이름이 먼저(opus-5-5 가 opus-5 로 잡히지 않게), 날짜 붙은 id 도
assert.equal(priceFor("claude-opus-5-5")?.label, "Claude Opus 5.5");
assert.equal(priceFor("claude-opus-5-20260601")?.label, "Claude Opus 5");
assert.equal(priceFor("gpt-5.6-sol"), null, "unknown models are not priced");
assert.equal(priceFor(null), null);

const row = (over: Partial<UsageRow>): UsageRow => ({ kind: "generate", model: "claude-opus-5-5", ok: true, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, plan_id: null, created_at: "2026-09-30T13:30:00Z", ...over });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
// Opus 5.5: 입력 $4, 출력 $20, 캐시 읽기 $0.20, 캐시 쓰기 $5 (100만 토큰당)
close(rowCostUsd(row({ input_tokens: 1_000_000 }))!, 4);
close(rowCostUsd(row({ output_tokens: 1_000_000 }))!, 20);
// input 에 캐시 몫이 들어 있다: 10만 중 8만 캐시 읽기, 1만 캐시 쓰기 → 1만만 일반 입력
close(rowCostUsd(row({ input_tokens: 100_000, cache_read_tokens: 80_000, cache_write_tokens: 10_000, output_tokens: 2_000 }))!, (10_000 * 4 + 80_000 * 0.2 + 10_000 * 5 + 2_000 * 20) / 1_000_000);
assert.equal(rowCostUsd(row({ model: "gpt-5.6-sol", input_tokens: 1000 })), null);

// 홈페이지 AI 수정의 토큰 차감용 줄(모델 없음)은 비용에서 뺀다 — 공통 기록과 두 번 세지 않게
assert.equal(isBillingDuplicate(row({ kind: "landing-ai-edit", model: null })), true);
assert.equal(isBillingDuplicate(row({ kind: "landing-ai-edit" })), false);
assert.equal(isBillingDuplicate(row({ kind: "landing-ai-fill-use", model: null, input_tokens: 0, output_tokens: 0 })), true, "AI 채우기 횟수 표시는 호출로 세지 않는다");

// 한국 시간 날짜
assert.equal(kstDay("2026-09-30T16:00:00Z"), "2026-10-01");
assert.equal(kstDay("2026-09-30T14:59:59Z"), "2026-09-30");

// 환율: 설정값, 이상하면 기본 1,400원
assert.equal(krwPerUsd({ AI_COST_KRW_PER_USD: "1385" }), 1385);
assert.equal(krwPerUsd({ AI_COST_KRW_PER_USD: "abc" }), 1400);

// 집계: 기능·날짜·모델·사업별, 사업 미기록, 요금 미확인, 실패 수
const summary = summarizeUsage([
  row({ kind: "generate", plan_id: "plan_a", input_tokens: 500_000, output_tokens: 50_000 }),
  row({ kind: "generate", plan_id: "plan_a", input_tokens: 500_000, output_tokens: 50_000, ok: false }),
  row({ kind: "landing-ai-fill", plan_id: "plan_b", input_tokens: 10_000, output_tokens: 1_000 }),
  row({ kind: "landing-ai-edit", model: null, plan_id: "plan_b", input_tokens: 9_999, output_tokens: 9_999 }),
  row({ kind: "support-assistant", model: "gpt-5.6-sol", input_tokens: 1_000, output_tokens: 100 }),
], 1400);
assert.equal(summary.total.calls, 4, "the ai-edit billing duplicate is skipped");
assert.equal(summary.total.failed, 1);
assert.equal(summary.total.unpriced, 1);
close(summary.total.usd, 2 * (0.5 * 4 + 0.05 * 20) + (0.01 * 4 + 0.001 * 20));
assert.equal(summary.byKind[0].kind, "generate");
assert.equal(summary.byPlan.find(item => item.planId === "plan_a")?.calls, 2);
assert.equal(summary.unattributed.calls, 1);
assert.equal(summary.byDay[0].day, "2026-09-30");

// 사업 문맥: 입구에서 정하면 그 안의 await 뒤에도 남고, 밖으로 새지 않는다
assert.equal(usageContext(), undefined);
void (async () => {
await withUsageContext({ planId: "plan_x", ownerHash: "owner" }, async () => {
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(usageContext()?.planId, "plan_x");
  await withUsageContext({ planId: "plan_y" }, async () => { assert.deepEqual(usageContext(), { planId: "plan_y", ownerHash: "owner" }); });
  assert.equal(usageContext()?.planId, "plan_x");
});
assert.equal(usageContext(), undefined);

console.log("llm-cost: model prices, cache split, ai-edit duplicate skipped, KST days, KRW rate, summary, plan context");
})().catch(error => { console.error(error); process.exit(1); });
