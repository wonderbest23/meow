import { getOpenAIRuntimeConfig } from "../openai/session-config";
import type { LLMConfig, LLMProvider } from "./complete";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

function openaiConfigFrom(guestHash: string): LLMConfig | null {
  const openai = getOpenAIRuntimeConfig(guestHash);
  return openai?.apiKey ? { provider: "openai", apiKey: openai.apiKey, model: openai.model } : null;
}

export function anthropicConfigFrom(): LLMConfig | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key
    ? { provider: "anthropic", apiKey: key, model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL }
    : null;
}

/**
 * 글쓰기·분석을 맡는 모델을 하나로 통일할지 정한다.
 * - "anthropic": Claude 한 모델이 모든 텍스트 작업을 맡는다(교차 다듬기 없음). Anthropic 키가 있으면 기본값.
 * - "openai": 예전 방식(OpenAI 우선 + 역할 분담). 되돌릴 때 LLM_TEXT_PROVIDER=openai.
 * 이미지 생성(로고)은 이 설정과 무관하게 OpenAI를 쓴다.
 */
export function singleTextProvider(): LLMProvider | null {
  const configured = process.env.LLM_TEXT_PROVIDER?.trim().toLowerCase();
  if (configured === "openai") return null;
  if (configured === "anthropic") return "anthropic";
  return process.env.ANTHROPIC_API_KEY?.trim() ? "anthropic" : null;
}

/**
 * 모든 텍스트 기능이 쓰는 기본 설정. 통일 모드면 Claude, 아니면 OpenAI(손님 등록 키 포함) 우선.
 * 고른 쪽 키가 없으면 다른 쪽으로 넘어가고, 둘 다 없으면 null(규칙 기반 폴백).
 */
export function resolveTextLLMConfig(guestHash: string): LLMConfig | null {
  if (singleTextProvider() === "anthropic") return anthropicConfigFrom() ?? openaiConfigFrom(guestHash);
  return openaiConfigFrom(guestHash) ?? anthropicConfigFrom();
}

/**
 * 작업 성격에 맞는 프로바이더를 고른다(역할 분담). 통일 모드에서는 prefer와 관계없이 Claude를 쓴다.
 * - prefer="anthropic": 한국어 서술·문서 다듬기 등 → Claude 우선, 없으면 OpenAI.
 * - prefer="openai"(기본): 구조·아이디어·JSON 추출 등 → OpenAI 우선, 없으면 Claude.
 * 선호 프로바이더 키가 없으면 다른 쪽으로 자동 폴백하고, 둘 다 없으면 null(규칙 기반 폴백).
 */
export function resolveLLMConfig(guestHash: string, prefer: LLMProvider = "openai"): LLMConfig | null {
  if (singleTextProvider()) return resolveTextLLMConfig(guestHash);
  const openai = openaiConfigFrom(guestHash);
  const anthropic = anthropicConfigFrom();
  return prefer === "anthropic" ? (anthropic ?? openai) : (openai ?? anthropic);
}

/**
 * 주어진 프로바이더와 "다른" 프로바이더의 설정을 반환한다(교차 검수·다듬기용).
 * 통일 모드에서는 같은 글을 다른 모델이 다시 쓰지 않도록 null이다. 다른 프로바이더 키가 없어도 null.
 */
export function resolveAlternateLLMConfig(guestHash: string, provider: LLMProvider): LLMConfig | null {
  if (singleTextProvider()) return null;
  return provider === "openai" ? anthropicConfigFrom() : openaiConfigFrom(guestHash);
}

/**
 * 요청(손님 쿠키) 없이 환경 변수만으로 텍스트 모델을 고른다 — Cloudflare Workflow처럼
 * this.env를 받는 곳용. 규칙은 resolveTextLLMConfig와 같다(기본 Claude, LLM_TEXT_PROVIDER=openai면 OpenAI).
 */
export function textLLMConfigFromEnv(vars: Record<string, string | undefined>): LLMConfig | null {
  const anthropicKey = vars.ANTHROPIC_API_KEY?.trim();
  const openaiKey = vars.OPENAI_API_KEY?.trim();
  const anthropic: LLMConfig | null = anthropicKey ? { provider: "anthropic", apiKey: anthropicKey, model: vars.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL } : null;
  const openai: LLMConfig | null = openaiKey ? { provider: "openai", apiKey: openaiKey, model: vars.OPENAI_MODEL?.trim() || "gpt-5.6-sol" } : null;
  return vars.LLM_TEXT_PROVIDER?.trim().toLowerCase() === "openai" ? (openai ?? anthropic) : (anthropic ?? openai);
}

/** Business planning has its own model policy; unrelated support and image tasks keep theirs. */
export function resolvePlanningLLMConfig(guestHash: string): LLMConfig | null {
  if (singleTextProvider()) return resolveTextLLMConfig(guestHash);
  const config = openaiConfigFrom(guestHash);
  if (config) return { ...config, model: process.env.PLANNING_MODEL?.trim() || "gpt-6-astra" };
  return anthropicConfigFrom();
}
