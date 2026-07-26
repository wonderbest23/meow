import assert from "node:assert/strict";
import { resolveLLMConfig, resolveAlternateLLMConfig } from "../lib/llm/config";

const HASH = `test-hash-${crypto.randomUUID()}`;

async function main() {
  const origOpenAI = process.env.OPENAI_API_KEY;
  const origAnthropic = process.env.ANTHROPIC_API_KEY;
  try {
    // 둘 다 없음 → null (규칙 기반 폴백)
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(resolveLLMConfig(HASH), null);
    assert.equal(resolveLLMConfig(HASH, "anthropic"), null);

    // Claude 키만 있으면 선호와 무관하게 Claude로 폴백
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    assert.equal(resolveLLMConfig(HASH, "openai")?.provider, "anthropic", "OpenAI 없으면 Claude로 폴백");
    assert.equal(resolveLLMConfig(HASH, "anthropic")?.provider, "anthropic");

    // 둘 다 있으면 선호가 이긴다 (역할 분담)
    process.env.OPENAI_API_KEY = "sk-oai";
    assert.equal(resolveLLMConfig(HASH, "openai")?.provider, "openai", "구조·아이디어는 OpenAI 우선");
    assert.equal(resolveLLMConfig(HASH, "anthropic")?.provider, "anthropic", "서술은 Claude 우선");

    // 교차(alternate): 반대 프로바이더를 돌려준다
    assert.equal(resolveAlternateLLMConfig(HASH, "anthropic")?.provider, "openai");
    assert.equal(resolveAlternateLLMConfig(HASH, "openai")?.provider, "anthropic");

    // 한쪽 키만 있으면 교차 상대는 null → 교차 패스는 건너뛴다
    delete process.env.OPENAI_API_KEY;
    assert.equal(resolveAlternateLLMConfig(HASH, "anthropic"), null, "OpenAI 없으면 교차 패스 건너뜀");
  } finally {
    if (origOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = origOpenAI;
    if (origAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = origAnthropic;
  }
  console.log("llm-config.test.ts passed");
}

void main();
