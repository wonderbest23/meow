import assert from "node:assert/strict";
import { completeJson, completeText, extractJsonObject, jsonFailureShape, parseJsonObject, type LLMConfig } from "../lib/llm/complete";

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

    // 글로만 JSON을 받는 긴 응답(사업 방향 정리)이 깨지는 모양들 — 객체 하나를 꺼내고, 어떤 손질을 했는지 알려 준다.
    assert.deepEqual(extractJsonObject('{"a":1}'), { value: { a: 1 }, repairs: [] }, "유효한 JSON은 손대지 않는다");
    assert.deepEqual(extractJsonObject('사업안을 정리했어요.\n{"a":1}\n필요하면 더 고칠게요.'), { value: { a: 1 }, repairs: ["outer"] }, "앞뒤 설명");
    assert.deepEqual(extractJsonObject('설명\n```json\n{"a":1}\n```\n끝'), { value: { a: 1 }, repairs: ["fence"] }, "가운데 있는 코드펜스");
    assert.deepEqual(extractJsonObject('```json\n{"a":1}'), { value: { a: 1 }, repairs: ["fence"] }, "닫히지 않은 코드펜스");
    assert.deepEqual(extractJsonObject('{"a":{"b":"괄호 } 가 든 글"}} 뒤에 남은 말 {'), { value: { a: { b: "괄호 } 가 든 글" } }, repairs: ["outer"] }, "문자열 안 괄호는 짝 세기에서 뺀다");
    assert.deepEqual(extractJsonObject('{"usableText":"안녕하세요\n중고 명품 가방이에요\t상태 A"}'), { value: { usableText: "안녕하세요\n중고 명품 가방이에요\t상태 A" }, repairs: ["control"] }, "문자열 안 날 줄바꿈·탭");
    assert.deepEqual(extractJsonObject('{"pitch":"하루 "소금빵"이에요","n":["가", "나"]}'), { value: { pitch: "하루 \"소금빵\"이에요", n: ["가", "나"] }, repairs: ["quote"] }, "문자열 안 따옴표");
    assert.deepEqual(extractJsonObject('{"a":"50\\% 할인","b":[1,2,],}'), { value: { a: "50\\% 할인", b: [1, 2] }, repairs: ["escape", "comma"] }, "모르는 역슬래시·끝 쉼표");
    assert.equal(extractJsonObject('{"a":"그는 "좋다", 라고 했다"}'), null, "따옴표 짐작이 틀리면 지어내지 않고 실패");
    assert.equal(extractJsonObject('{"a":"중간에 끊긴'), null, "잘린 응답은 실패");
    assert.equal(parseJsonObject('{"a":"줄\n바꿈"}')?.a, "줄\n바꿈", "parseJsonObject 도 같은 손질을 쓴다");

    // 실패한 원문은 모양만 남긴다 — 한글(사업 내용)은 가리고 따옴표·괄호·칸 이름만
    const shape = jsonFailureShape('{"startingPlan":{"scope":"매장 없이 온라인으로 시작해요 "정품" 확인');
    assert.equal(/[가-힣]/.test(JSON.stringify(shape)), false, "로그에 한글 내용이 남지 않는다");
    assert.ok(shape.head.includes('"startingPlan"') && shape.error.length > 0, "칸 이름과 깨진 이유는 남는다");

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
    for (const code of ["insufficient_quota", "credit_balance_exhausted", "organization_spend_limit_exceeded", "project_spend_limit_exceeded", "organization_usage_limit_exceeded"]) {
      mock(429, { error: { code } });
      let failure = "";
      await completeText(openai, { system: "s", user: "u", maxOutputTokens: 10, allowFallback: false, onFailure: event => { failure = event.code; } });
      assert.equal(failure, "quota_exhausted", code);
    }
    for (const config of [openai, anthropic]) {
      let failure = "";
      globalThis.fetch = async () => { throw new DOMException("Fixture timeout", "TimeoutError"); };
      await completeText(config, { system: "s", user: "u", maxOutputTokens: 10, allowFallback: false, onFailure: event => { failure = event.code; } });
      assert.equal(failure, "timeout", "A timeout must not be presented as a billing problem");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("llm.test.ts passed");
}

void main();
