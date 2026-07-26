import { getOpenAIRuntimeConfig } from "../openai/session-config";
import type { LLMConfig, LLMProvider } from "./complete";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

function openaiConfigFrom(guestHash: string): LLMConfig | null {
  const openai = getOpenAIRuntimeConfig(guestHash);
  return openai?.apiKey ? { provider: "openai", apiKey: openai.apiKey, model: openai.model } : null;
}

function anthropicConfigFrom(): LLMConfig | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key
    ? { provider: "anthropic", apiKey: key, model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL }
    : null;
}

/**
 * 작업 성격에 맞는 프로바이더를 고른다(역할 분담).
 * - prefer="anthropic": 한국어 서술·문서 다듬기 등 → Claude 우선, 없으면 OpenAI.
 * - prefer="openai"(기본): 구조·아이디어·JSON 추출 등 → OpenAI 우선, 없으면 Claude.
 * 선호 프로바이더 키가 없으면 다른 쪽으로 자동 폴백하고, 둘 다 없으면 null(규칙 기반 폴백).
 */
export function resolveLLMConfig(guestHash: string, prefer: LLMProvider = "openai"): LLMConfig | null {
  const openai = openaiConfigFrom(guestHash);
  const anthropic = anthropicConfigFrom();
  return prefer === "anthropic" ? (anthropic ?? openai) : (openai ?? anthropic);
}

/**
 * 주어진 프로바이더와 "다른" 프로바이더의 설정을 반환한다(교차 검수·다듬기용).
 * 다른 프로바이더 키가 없으면 null → 교차 패스는 건너뛴다.
 */
export function resolveAlternateLLMConfig(guestHash: string, provider: LLMProvider): LLMConfig | null {
  return provider === "openai" ? anthropicConfigFrom() : openaiConfigFrom(guestHash);
}
