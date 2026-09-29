import assert from "node:assert/strict";
import { anthropicStreamUsage } from "../lib/llm/complete";

// 스트리밍 사용량: 입력에는 캐시 읽기·쓰기를 더하고(completeText 기록 기준과 동일), 출력은 그대로
assert.deepEqual(
  anthropicStreamUsage({ input_tokens: 1200, cache_read_input_tokens: 5000, cache_creation_input_tokens: 800, output_tokens: 4100 }, "claude-opus-5-5"),
  { inputTokens: 7000, outputTokens: 4100, model: "claude-opus-5-5" },
);
// 이벤트가 일부만 왔거나 이상한 값이면 0으로 센다
assert.deepEqual(anthropicStreamUsage({ input_tokens: 900 }, "m"), { inputTokens: 900, outputTokens: 0, model: "m" });
assert.deepEqual(anthropicStreamUsage({ input_tokens: -3, output_tokens: Number.NaN }, "m"), { inputTokens: 0, outputTokens: 0, model: "m" });
assert.equal(anthropicStreamUsage(null, "m"), null);

console.log(JSON.stringify({ passed: 4 }));
