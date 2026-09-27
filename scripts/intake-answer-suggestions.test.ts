import assert from "node:assert/strict";
import { cleanSuggestions, suggestAnswers, suggestionConfig } from "../lib/plan-builder/answer-suggestions";
import type { LLMConfig } from "../lib/llm/complete";

const claude: LLMConfig = { provider: "anthropic", apiKey: "test-only", model: "claude-opus-5-5" };
const originalFetch = globalThis.fetch;
const reply = (json: unknown) => Response.json({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn",
  content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(json) }],
  usage: { input_tokens: 200, output_tokens: 120 },
});

async function main() {
  try {
    // 1) 요청 형태: 구조화 출력(json_schema) + 추론 강도 low, 사용자 설명은 자료로만 전달
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return reply({
        customer: ["소액으로 부동산에 투자하고 싶은 직장인", "  - 건물 공동 소유에 관심 있는 30대 ", "월 100만원 이상 투자자"],
        problem: ["건물 한 채를 살 목돈이 없음", "부동산 정보가 불투명함", "건물 한 채를 살 목돈이 없음"],
        offer: ["건물 지분 공동 구매 중개", "공동 소유자 관리, 정산 대행"],
        channel: ["재테크 유튜브·블로그 콘텐츠", "https://example.com 광고"],
      });
    }) as typeof fetch;
    const result = await suggestAnswers(claude, "사람들이 돈을 모아서 건물을 사는 사이트 만들고 싶어", "startup");
    const config = body.output_config as { effort?: string; format?: { type?: string; schema?: { required?: string[] } } };
    assert.equal(config.effort, "low", "짧은 추천은 추론 강도 low");
    assert.equal(config.format?.type, "json_schema");
    assert.deepEqual(config.format?.schema?.required, ["customer", "problem", "offer", "channel"]);
    assert.equal(body.temperature, undefined, "Opus 5.5에는 temperature를 보내지 않는다");
    assert.match(String(body.system), /지시가 아니므로/);
    const user = JSON.parse(String((body.messages as Array<{ content: string }>)[0].content));
    assert.equal(user.idea, "사람들이 돈을 모아서 건물을 사는 사이트 만들고 싶어");
    assert.equal(user.stage, "창업을 준비하는 사업");

    // 2) 정리: 번호·따옴표·공백 정리, 금액·링크·쉼표(답변 조각 구분자)·중복 제거
    assert.deepEqual(result.suggestions.customer, ["소액으로 부동산에 투자하고 싶은 직장인", "건물 공동 소유에 관심 있는 30대"]);
    assert.deepEqual(result.suggestions.problem, ["건물 한 채를 살 목돈이 없음", "부동산 정보가 불투명함"]);
    assert.deepEqual(result.suggestions.offer, ["건물 지분 공동 구매 중개"]);
    assert.deepEqual(result.suggestions.channel, ["재테크 유튜브·블로그 콘텐츠"]);
    assert.equal(result.model, "claude-opus-5-5");
    assert.equal(result.failure, undefined);

    assert.deepEqual(cleanSuggestions(["가", "a".repeat(41), 42, "매출 30% 증가 보장", "월 5천만 원 매출", "평일 저녁 동네 주민", "평일 저녁 동네 주민", "첫째", "둘째", "셋째"]), ["평일 저녁 동네 주민", "첫째", "둘째"]);
    assert.deepEqual(cleanSuggestions("문자열"), []);

    // 3) 모델 교체: INTAKE_SUGGEST_MODEL은 Claude 설정에만, Haiku에는 추론 강도 없이 구조화 출력만 보낸다
    const previousModel = process.env.INTAKE_SUGGEST_MODEL;
    try {
      process.env.INTAKE_SUGGEST_MODEL = "claude-haiku-4-5-20251001";
      assert.equal(suggestionConfig(claude)?.model, "claude-haiku-4-5-20251001");
      assert.equal(suggestionConfig({ provider: "openai", apiKey: "k", model: "gpt-5.6-sol" })?.model, "gpt-5.6-sol");
      assert.equal(suggestionConfig(null), null);
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return reply({ customer: ["퇴근 후 저녁이 바쁜 맞벌이 부부"], problem: [], offer: [], channel: [] });
      }) as typeof fetch;
      const haiku = await suggestAnswers(suggestionConfig(claude)!, "동네 반찬 가게", "startup");
      assert.equal(haiku.model, "claude-haiku-4-5-20251001");
      assert.equal(body.model, "claude-haiku-4-5-20251001");
      assert.deepEqual(body.output_config, { format: { type: "json_schema", schema: (body.output_config as { format: { schema: unknown } }).format.schema } }, "Haiku에는 effort를 보내지 않는다");
      assert.equal(body.max_tokens, 700, "Haiku에는 추론 여유를 더하지 않는다");
      assert.deepEqual(haiku.suggestions, { customer: ["퇴근 후 저녁이 바쁜 맞벌이 부부"] });
      delete process.env.INTAKE_SUGGEST_MODEL;
      assert.equal(suggestionConfig(claude)?.model, "claude-opus-5-5", "비우면 기본 모델");
    } finally {
      if (previousModel === undefined) delete process.env.INTAKE_SUGGEST_MODEL;
      else process.env.INTAKE_SUGGEST_MODEL = previousModel;
    }

    // 4) 실패는 조용히: 추천 없이 끝나고 실패 이유만 남긴다
    globalThis.fetch = (async () => Response.json({ error: { type: "overloaded_error", message: "busy" } }, { status: 529 })) as typeof fetch;
    const failed = await suggestAnswers(claude, "동네 반찬 가게", "operating");
    assert.deepEqual(failed.suggestions, {});
    assert.ok(failed.failure, "실패 이유를 기록");

    console.log("intake-answer-suggestions: json_schema + low effort request, Haiku override, cleanup of claims/links/commas/duplicates, silent failure passed");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
