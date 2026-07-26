import { getOpenAIRuntimeConfig } from "../openai/session-config";
import type { LLMConfig } from "./complete";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

/**
 * 사용할 LLM 프로바이더를 고른다.
 * 1) 세션 또는 환경에 OpenAI 키가 있으면 OpenAI.
 * 2) 없고 Anthropic(Claude) 키가 있으면 Claude로 자동 전환.
 * 3) 둘 다 없으면 null(호출부는 규칙 기반 폴백으로 동작).
 */
export function resolveLLMConfig(guestHash: string): LLMConfig | null {
  const openai = getOpenAIRuntimeConfig(guestHash);
  if (openai?.apiKey) {
    return { provider: "openai", apiKey: openai.apiKey, model: openai.model };
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    return {
      provider: "anthropic",
      apiKey: anthropicKey,
      model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
    };
  }
  return null;
}
