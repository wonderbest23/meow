import assert from "node:assert/strict";
import { completeJson, completeText, parseJsonObject, type LLMConfig } from "../lib/llm/complete";

const openai: LLMConfig = { provider: "openai", apiKey: "sk-openai", model: "gpt-5.6-sol" };
const anthropic: LLMConfig = { provider: "anthropic", apiKey: "sk-ant", model: "claude-sonnet-5" };

let lastUrl = "";
let lastInit: { headers?: Record<string, string>; body?: string } | null = null;
function mock(status: number, payload: unknown) {
  globalThis.fetch = (async (url: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
    lastUrl = String(url);
    lastInit = init ?? null;
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
}

async function main() {
  const originalFetch = globalThis.fetch;
  try {
    // parseJsonObject: 코드펜스가 있어도 벗겨서 파싱한다.
    assert.deepEqual(parseJsonObject('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseJsonObject('{"b":2}'), { b: 2 });
    assert.equal(parseJsonObject("[1,2,3]"), null, "배열은 객체가 아니므로 null");
    assert.equal(parseJsonObject("설명 텍스트"), null);

    // OpenAI: Responses API로 호출하고 output_text를 파싱한다.
    mock(200, { output_text: JSON.stringify({ ok: true }) });
    const a = await completeJson(openai, { system: "s", user: "u", maxOutputTokens: 100 });
    assert.deepEqual(a, { ok: true });
    assert.ok(lastUrl.includes("api.openai.com"), "OpenAI 엔드포인트로 가야 함");
    assert.ok(lastInit?.headers?.Authorization?.startsWith("Bearer "), "OpenAI는 Bearer 인증");

    // Anthropic: messages API로 호출하고 content[].text를 파싱한다. 코드펜스도 벗긴다.
    mock(200, { content: [{ type: "text", text: '```json\n{"ok":true}\n```' }] });
    const b = await completeJson(anthropic, { system: "s", user: "u", maxOutputTokens: 100 });
    assert.deepEqual(b, { ok: true });
    assert.ok(lastUrl.includes("api.anthropic.com"), "Anthropic 엔드포인트로 가야 함");
    assert.equal(lastInit?.headers?.["x-api-key"], "sk-ant", "Anthropic은 x-api-key 인증");
    assert.ok((JSON.parse(lastInit?.body ?? "{}") as { system?: string }).system, "system 포함");

    // 실패 응답은 null.
    mock(500, {});
    assert.equal(await completeText(openai, { system: "s", user: "u", maxOutputTokens: 10 }), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("llm.test.ts passed");
}

void main();
