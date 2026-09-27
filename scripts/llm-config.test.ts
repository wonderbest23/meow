import assert from "node:assert/strict";
import { resolveLLMConfig, resolveAlternateLLMConfig, resolvePlanningLLMConfig, resolveTextLLMConfig, singleTextProvider } from "../lib/llm/config";

const HASH = `test-hash-${crypto.randomUUID()}`;
const ENV_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "LLM_TEXT_PROVIDER"] as const;

async function main() {
  const original = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    // 둘 다 없음 → null (규칙 기반 폴백)
    assert.equal(resolveLLMConfig(HASH), null);
    assert.equal(resolveLLMConfig(HASH, "anthropic"), null);
    assert.equal(resolveTextLLMConfig(HASH), null);

    // Claude 키만 있으면 선호와 무관하게 Claude, 기본 모델은 Opus 5.5
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    assert.equal(resolveLLMConfig(HASH, "openai")?.provider, "anthropic", "OpenAI 없으면 Claude로 폴백");
    assert.equal(resolveLLMConfig(HASH, "anthropic")?.model, "claude-opus-5-5");

    // 둘 다 있고 LLM_TEXT_PROVIDER 미설정 → Claude 단일 모델(통일 모드)이 기본
    process.env.OPENAI_API_KEY = "sk-oai";
    assert.equal(singleTextProvider(), "anthropic");
    for (const resolved of [resolveLLMConfig(HASH, "openai"), resolveLLMConfig(HASH, "anthropic"), resolvePlanningLLMConfig(HASH), resolveTextLLMConfig(HASH)]) {
      assert.equal(resolved?.provider, "anthropic", "통일 모드에서는 모든 텍스트 작업이 Claude");
      assert.equal(resolved?.model, "claude-opus-5-5");
    }
    assert.equal(resolveAlternateLLMConfig(HASH, "anthropic"), null, "통일 모드에서는 다른 모델이 다시 쓰지 않는다");
    assert.equal(resolveAlternateLLMConfig(HASH, "openai"), null);

    // ANTHROPIC_MODEL로 모델만 바꿀 수 있다
    process.env.ANTHROPIC_MODEL = "claude-opus-5";
    assert.equal(resolveTextLLMConfig(HASH)?.model, "claude-opus-5");
    delete process.env.ANTHROPIC_MODEL;

    // 되돌리기: LLM_TEXT_PROVIDER=openai → 예전 역할 분담
    process.env.LLM_TEXT_PROVIDER = "openai";
    assert.equal(singleTextProvider(), null);
    assert.equal(resolveLLMConfig(HASH, "openai")?.provider, "openai", "구조·아이디어는 OpenAI 우선");
    assert.equal(resolveLLMConfig(HASH, "anthropic")?.provider, "anthropic", "서술은 Claude 우선");
    assert.equal(resolveAlternateLLMConfig(HASH, "anthropic")?.provider, "openai");
    assert.equal(resolveAlternateLLMConfig(HASH, "openai")?.provider, "anthropic");
    assert.equal(resolvePlanningLLMConfig(HASH)?.provider, "openai");

    // 통일 모드인데 Anthropic 키가 없으면 OpenAI로 계속 동작한다(서비스 중단 방지)
    process.env.LLM_TEXT_PROVIDER = "anthropic";
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(resolveTextLLMConfig(HASH)?.provider, "openai");

    // 한쪽 키만 있으면 교차 상대는 null → 교차 패스는 건너뛴다
    process.env.LLM_TEXT_PROVIDER = "openai";
    assert.equal(resolveAlternateLLMConfig(HASH, "openai"), null, "Claude 없으면 교차 패스 건너뜀");
  } finally {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
  console.log("llm-config.test.ts passed");
}

void main();
