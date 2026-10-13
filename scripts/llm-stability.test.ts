import assert from "node:assert/strict";
import { completeText, completeJson, streamText, type LLMFailure } from "../lib/llm/complete";

Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "synthetic-only", ANTHROPIC_API_KEY: "synthetic-only" });
const config = { provider: "openai" as const, apiKey: "synthetic-only", model: "mock-model" };
const params = { system: "Synthetic instruction", user: "Synthetic business", maxOutputTokens: 50 };
const sse = (...events: object[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
let failed = 0;
async function check(name: string, run: () => unknown) { try { await run(); console.log(`PASS ${name}`); } catch (error) { failed++; console.error(`FAIL ${name}: ${error instanceof Error ? error.message : error}`); } }

async function main() {
  await check("E stream allowFallback false", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ error: { type: "server_error" } }, { status: 500 }); };
    assert.equal(await streamText(config, { ...params, allowFallback: false }, () => {}), null);
    assert.equal(calls, 1);
  });
  for (const stream of [false, true]) for (const status of [400, 401, 403, 422]) {
    await check(`E ${stream ? "stream" : "complete"} HTTP ${status} does not fail over`, async () => {
      let calls = 0; const failures: LLMFailure[] = [];
      globalThis.fetch = async () => { calls++; return Response.json({ error: { type: status === 400 ? "invalid_request_error" : "synthetic-error" } }, { status }); };
      const input = { ...params, onFailure: (event: LLMFailure) => failures.push(event) };
      const value = stream ? await streamText(config, input, () => {}) : await completeText(config, input);
      assert.equal(value, null); assert.equal(calls, 1);
      assert.equal(failures.at(-1)?.code, status === 401 || status === 403 ? "authentication" : "invalid_request");
    });
  }
  for (const provider of ["openai", "anthropic"] as const) await check(`E ${provider} explicit refusal is terminal`, async () => {
    let calls = 0; const failures: LLMFailure[] = [];
    globalThis.fetch = async () => { calls++; return Response.json(provider === "openai" ? { status: "completed", output: [{ content: [{ type: "refusal", refusal: "Synthetic policy refusal" }] }], usage: { input_tokens: 8, output_tokens: 2 } } : { stop_reason: "refusal", content: [{ type: "text", text: "Synthetic policy refusal" }], usage: { input_tokens: 8, output_tokens: 2 } }); };
    assert.equal(await completeText({ ...config, provider }, { ...params, onFailure: event => failures.push(event) }), null);
    assert.equal(calls, 1); assert.equal(failures.at(-1)?.code, "refusal");
  });
  await check("E invalid JSON logs failed structured attempt with usage", async () => {
    const logs: string[] = []; const log = console.log;
    let calls = 0, usageCalls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ status: "completed", output_text: "not JSON", usage: { input_tokens: 9, output_tokens: 2 } }); };
    console.log = (...args) => { logs.push(args.map(String).join(" ")); };
    try { assert.equal(await completeJson(config, { ...params, onUsage: () => { usageCalls++; } }), null); } finally { console.log = log; }
    assert.equal(calls, 1); assert.equal(usageCalls, 1);
    const attempts = logs.filter(line => line.startsWith("[llm] call")).map(line => JSON.parse(line.slice("[llm] call ".length)));
    assert.equal(attempts.length, 1); assert.equal(attempts[0].ok, false); assert.equal(attempts[0].code, "invalid_json");
  });
  await check("E partial stream failure never appends alternate output", async () => {
    let calls = 0; const chunks: string[] = [];
    globalThis.fetch = async () => { calls++; return sse({ type: "response.output_text.delta", delta: "partial" }, { type: "response.failed" }); };
    assert.equal(await streamText(config, params, value => chunks.push(value)), null);
    assert.equal(calls, 1); assert.deepEqual(chunks, ["partial"]);
  });
  await check("E caller schema validation is not logged as task success", async () => {
    let calls = 0; const failures: LLMFailure[] = [];
    globalThis.fetch = async () => { calls++; return Response.json({ status: "completed", output_text: '{"unexpected":true}' }); };
    assert.equal(await completeJson(config, { ...params, validateJson: value => typeof value.message === "string", onFailure: event => failures.push(event) }), null);
    assert.equal(calls, 1); assert.equal(failures.at(-1)?.code, "invalid_response");
  });
  for (const provider of ["openai", "anthropic"] as const) await check(`E ${provider} refusal stream is terminal`, async () => {
    let calls = 0; const failures: LLMFailure[] = [];
    globalThis.fetch = async () => { calls++; return provider === "openai" ? sse({ type: "response.refusal.delta", delta: "synthetic" }, { type: "response.completed" }) : sse({ type: "message_delta", delta: { stop_reason: "refusal" } }, { type: "message_stop" }); };
    assert.equal(await streamText({ ...config, provider }, { ...params, onFailure: event => failures.push(event) }, () => {}), null);
    assert.equal(calls, 1); assert.equal(failures.at(-1)?.code, "refusal");
  });
  await check("E transient setup failure still allows one alternate", async () => {
    let calls = 0;
    globalThis.fetch = async () => ++calls === 1 ? Response.json({ error: { type: "server_error" } }, { status: 503 }) : Response.json({ content: [{ type: "text", text: "alternate" }], stop_reason: "end_turn" });
    assert.equal(await completeText(config, params), "alternate"); assert.equal(calls, 2);
  });
  await check("E user cancellation is terminal", async () => {
    let calls = 0; const controller = new AbortController(); controller.abort(); const failures: LLMFailure[] = [];
    globalThis.fetch = async () => { calls++; throw new DOMException("Synthetic abort", "AbortError"); };
    assert.equal(await completeText(config, { ...params, signal: controller.signal, onFailure: event => failures.push(event) }), null);
    assert(calls <= 1); assert.equal(failures.at(-1)?.code, "cancelled");
  });
  // 정책 없는 호출은 호출자가 정한 시간을 그대로 쓴다(장 작성 180초) — 예전엔 기본 120초로 다시 잘려 12주 장이 끊겼다(2026-10-11)
  await check("E caller timeout above the default is kept when there is no policy", async () => {
    const original = AbortSignal.timeout.bind(AbortSignal);
    const asked: number[] = [];
    AbortSignal.timeout = (ms: number) => { asked.push(ms); return original(ms); };
    try {
      globalThis.fetch = async () => sse({ type: "response.output_text.delta", delta: "ok" }, { type: "response.completed", response: { status: "completed", usage: { input_tokens: 1, output_tokens: 1 } } });
      await completeText(config, { ...params, timeoutMs: 180_000 });
      assert.ok(asked.length > 0, "a timeout signal is created");
      assert.ok(Math.max(...asked) >= 179_000, `longest timeout ${Math.max(...asked)}ms`);
      assert.ok(asked.every(ms => ms <= 180_000), "never longer than the caller asked");
    } finally { AbortSignal.timeout = original; }
  });
  // 사전 점검(2026-10-11): 장 하나가 출력 상한(본문 + high 생각 여유분)을 다 써도 시간 안에 끝나야 한다.
  // 실측 초당 약 107~111토큰(Opus 5.5) — API가 붐빌 때를 생각해 초당 80토큰으로 계산한다
  await check("E section timeout covers the longest possible chapter at a slow pace", async () => {
    const { SECTION_MAX_TOKENS, SECTION_TIMEOUT_MS } = await import("../lib/plan-builder/section-generator");
    const { THINKING_HEADROOM } = await import("../lib/llm/complete");
    const worstSeconds = (SECTION_MAX_TOKENS + THINKING_HEADROOM.high) / 80;
    assert.ok(SECTION_TIMEOUT_MS / 1000 >= worstSeconds, `timeout ${SECTION_TIMEOUT_MS / 1000}s < worst ${Math.ceil(worstSeconds)}s`);
    const { ROADMAP_MAX_TOKENS, ROADMAP_TIMEOUT_MS } = await import("../lib/plan-builder/section-generator");
    const roadmapWorst = (ROADMAP_MAX_TOKENS + THINKING_HEADROOM.high) / 80;
    assert.ok(ROADMAP_TIMEOUT_MS / 1000 >= roadmapWorst, `roadmap timeout ${ROADMAP_TIMEOUT_MS / 1000}s < worst ${Math.ceil(roadmapWorst)}s`);
  });
  console.log(`LLM stability results: ${failed} failed`); process.exitCode = failed ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
