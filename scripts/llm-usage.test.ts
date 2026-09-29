import assert from "node:assert/strict";
import { recordLlmUsage } from "../lib/llm/usage";

async function main() {
  process.env.PERSISTENCE_MODE = "supabase";
  process.env.SUPABASE_URL = "http://127.0.0.1:55431";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-unit-fixture";
  const original = globalThis.fetch;
  const calls: Record<string, unknown>[] = [];
  let missing = 0;
  let unavailable = false;
  globalThis.fetch = async (input, init) => {
    assert(String(input).startsWith("http://127.0.0.1:55431/rest/v1/llm_usage"));
    calls.push(JSON.parse(init!.body as string));
    if (missing-- > 0) return Response.json({ code: "PGRST204", message: "fixture missing column" }, { status: 400 });
    if (unavailable) return Response.json({ code: "08000", message: "fixture unavailable" }, { status: 503 });
    return new Response(null, { status: 201 });
  };
  try {
    const usage = { inputTokens: 100, outputTokens: 200 };
    const meta = { model: "fixture", elapsedMs: 1200, failureCode: "timeout" };
    await recordLlmUsage("deck", "mock", false, usage, meta);
    assert.equal(calls[0].elapsed_ms, 1200); assert.equal(calls[0].failure_code, "timeout");
    calls.length = 0; missing = 1;
    await recordLlmUsage("deck", "mock", false, usage, meta);
    assert.equal(calls.length, 2); assert.equal(calls[1].input_tokens, 100); assert.equal(calls[1].model, undefined);
    calls.length = 0; missing = 2;
    await recordLlmUsage("deck", "mock", false, usage, meta);
    assert.equal(calls.length, 3); assert.deepEqual(calls[2], { kind: "deck", provider: "mock", ok: false });
    // 캐시 몫(0037): 저장되고, 칸이 없는 옛 DB에서는 캐시 칸만 빼고 모델 정보는 지킨다
    const cached = { inputTokens: 1000, outputTokens: 50, cacheReadTokens: 800, cacheWriteTokens: 100 };
    calls.length = 0; missing = 0;
    await recordLlmUsage("generate", "anthropic", true, cached, meta);
    assert.equal(calls.length, 1); assert.equal(calls[0].cache_read_tokens, 800); assert.equal(calls[0].cache_write_tokens, 100); assert.equal(calls[0].input_tokens, 1000);
    calls.length = 0; missing = 1;
    await recordLlmUsage("generate", "anthropic", true, cached, meta);
    assert.equal(calls.length, 2); assert.equal(calls[1].cache_read_tokens, undefined); assert.equal(calls[1].model, "fixture");
    calls.length = 0; missing = 0; unavailable = true;
    await recordLlmUsage("deck", "mock", false, usage, meta);
    assert.equal(calls.length, 1, "DB failures do not create an unbounded logging retry");
    console.log("LLM usage: metadata persistence and bounded backwards-compatible logging passed");
  } finally { globalThis.fetch = original; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
