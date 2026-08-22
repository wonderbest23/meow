// OpenAI와 Anthropic(Claude)을 한 인터페이스로 호출하는 통합 LLM 클라이언트.
// 호출부는 provider를 신경 쓰지 않고 completeText/completeJson만 쓰면 된다.

import { recordLlmUsage } from "./usage";

export type LLMProvider = "openai" | "anthropic";

export type LLMConfig = {
  provider: LLMProvider;
  apiKey: string;
  model: string;
};

export type LLMCompleteParams = {
  system: string;
  user: string;
  maxOutputTokens: number;
  // 사용량 집계용 기능 태그 (generate/deck/suggest/…) — 어드민 대시보드에 쓴다
  kind?: string;
  // OpenAI Responses의 reasoning.effort. Claude에는 적용되지 않는다.
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
  // JSON 객체 응답을 유도한다(OpenAI는 json_object 포맷 강제).
  jsonObject?: boolean;
  /** 토큰 사용량을 받는다 — 손님에게 토큰으로 파는 기능(홈페이지 AI 수정)이 차감에 쓴다 */
  onUsage?: (usage: { inputTokens: number; outputTokens: number; model: string; provider: LLMProvider }) => void;
  /*
   * system 블록을 프롬프트 캐시에 올린다(Anthropic).
   *
   * 캐시는 '앞에서부터 똑같은 만큼'만 걸린다. 그래서 호출마다 바뀌지 않는
   * 내용을 전부 system에 몰아넣고 이 값을 켜야 한다 — 한 글자라도 다르면
   * 그 뒤는 전부 캐시가 아니다.
   *
   * 되풀이되는 호출에만 켠다. 한 번만 부르는 곳에 켜면 쓰기 요금(1.25배)만
   * 내고 읽을 일이 없어 손해다.
   */
  cache?: boolean;
};

const DEFAULT_TIMEOUT_MS = 120_000;

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

/**
 * 한 호출에 실제로 쓰인 토큰을 남긴다 — 1건당 얼마인지 재는 유일한 근거.
 *
 * 두 가지를 동시에 본다.
 *  - 캐시가 걸렸나: 캐시는 조용히 실패한다. 앞부분이 최소 길이(모델마다
 *    512~1024토큰)에 못 미치면 오류 없이 그냥 안 걸린다. read가 0이 아니어야 성공.
 *  - 얼마가 나갔나: 요금의 대부분은 출력에서 나온다. 입력만 봐서는 알 수 없다.
 *
 * 단가는 일부러 코드에 넣지 않는다 — 값이 바뀌면 조용히 틀린 금액을 찍게 되고,
 * 그건 안 찍느니만 못하다. 토큰 수만 남기고 환산은 읽을 때 한다.
 */
function logUsage(kind: string, model: string, usage: unknown) {
  const u = usage as AnthropicUsage | null;
  if (!u) return;
  console.log(
    `[llm] usage kind=${kind} model=${model}` +
      ` in=${u.input_tokens ?? 0} out=${u.output_tokens ?? 0}` +
      ` cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0}`,
  );
}

async function openaiComplete(config: LLMConfig, params: LLMCompleteParams): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        store: false,
        ...(params.effort ? { reasoning: { effort: params.effort } } : {}),
        max_output_tokens: params.maxOutputTokens,
        ...(params.jsonObject ? { text: { format: { type: "json_object" } } } : {}),
        input: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(params.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[llm] openai fetch 실패:", err instanceof Error ? err.message : err);
    return null;
  }
  if (!response.ok) {
    console.error("[llm] openai", response.status, (await response.text().catch(() => "")).slice(0, 300));
    return null;
  }
  const payload = (await response.json().catch(() => null)) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;
  if (!payload) return null;
  if (params.onUsage && payload.usage) {
    params.onUsage({ inputTokens: payload.usage.input_tokens ?? 0, outputTokens: payload.usage.output_tokens ?? 0, model: config.model, provider: "openai" });
  }
  const text =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("");
  return text || null;
}

async function anthropicComplete(config: LLMConfig, params: LLMCompleteParams): Promise<string | null> {
  // Claude는 별도 json 포맷 강제가 없으므로, JSON이 필요하면 시스템 프롬프트에 지시를 덧붙인다.
  const system = params.jsonObject
    ? `${params.system}\n\n반드시 설명이나 마크다운 코드펜스 없이 유효한 JSON 객체 하나만 출력하세요.`
    : params.system;
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: params.maxOutputTokens,
        // 캐시를 쓰려면 블록 배열이어야 한다 — 문자열에는 cache_control을 달 곳이 없다
        system: params.cache
          ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
          : system,
        messages: [{ role: "user", content: params.user }],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(params.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("[llm] anthropic fetch 실패:", err instanceof Error ? err.message : err);
    return null;
  }
  if (!response.ok) {
    console.error("[llm] anthropic", response.status, (await response.text().catch(() => "")).slice(0, 300));
    return null;
  }
  const payload = (await response.json().catch(() => null)) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: unknown;
  } | null;
  logUsage(params.kind ?? "etc", config.model, payload?.usage ?? null);
  if (params.onUsage && payload?.usage) {
    const u = payload.usage as AnthropicUsage;
    params.onUsage({
      inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0,
      model: config.model,
      provider: "anthropic",
    });
  }
  if (!payload || !Array.isArray(payload.content)) return null;
  const text = payload.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
  return text || null;
}

/**
 * 반대 프로바이더의 환경 키. 크레딧 소진·장애처럼 "키는 있는데 호출이 실패"할 때
 * 다른 프로바이더로 넘어가기 위한 런타임 폴백이다.
 */
function envAlternate(config: LLMConfig): LLMConfig | null {
  if (config.provider === "anthropic") {
    const key = process.env.OPENAI_API_KEY?.trim();
    return key ? { provider: "openai", apiKey: key, model: process.env.OPENAI_MODEL?.trim() || "gpt-5.6-sol" } : null;
  }
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key ? { provider: "anthropic", apiKey: key, model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5" } : null;
}

function completeOnce(config: LLMConfig, params: LLMCompleteParams): Promise<string | null> {
  return config.provider === "anthropic"
    ? anthropicComplete(config, params)
    : openaiComplete(config, params);
}

/** provider에 맞는 모델을 호출해 원본 텍스트를 반환한다. 실패하면 반대 프로바이더로 1회 폴백. */
export async function completeText(config: LLMConfig, params: LLMCompleteParams): Promise<string | null> {
  if (!config.apiKey) return null;
  const primary = await completeOnce(config, params);
  if (primary) {
    await recordLlmUsage(params.kind ?? "etc", config.provider, true);
    return primary;
  }
  const alt = envAlternate(config);
  if (!alt) {
    await recordLlmUsage(params.kind ?? "etc", config.provider, false);
    return null;
  }
  console.error(`[llm] ${config.provider} 실패 — ${alt.provider}(${alt.model})로 폴백`);
  const second = await completeOnce(alt, params);
  await recordLlmUsage(params.kind ?? "etc", alt.provider, second !== null);
  return second;
}

/** 모델 출력에서 JSON 객체를 파싱한다. 코드펜스가 있으면 벗겨낸다. 실패 시 null. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  let trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) trimmed = fenced[1].trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return null;
}

/** provider에 맞는 모델을 호출해 JSON 객체를 반환한다. 실패 시 null. */
export async function completeJson(
  config: LLMConfig,
  params: LLMCompleteParams,
): Promise<Record<string, unknown> | null> {
  const text = await completeText(config, { ...params, jsonObject: true });
  return text ? parseJsonObject(text) : null;
}

/**
 * 델타 단위로 흘려주는 스트리밍 호출.
 * onDelta로 조각을 넘기고, 끝나면 전체 텍스트를 반환한다. 실패 시 null.
 */
export async function streamText(
  config: LLMConfig,
  params: LLMCompleteParams,
  onDelta: (chunk: string) => void,
): Promise<string | null> {
  if (!config.apiKey) return null;
  const first = await streamOnce(config, params, onDelta);
  if (first !== "setup_failed") {
    await recordLlmUsage(params.kind ?? "etc", config.provider, first !== null);
    return first;
  }
  const alt = envAlternate(config);
  if (!alt) {
    await recordLlmUsage(params.kind ?? "etc", config.provider, false);
    return null;
  }
  console.error(`[llm] ${config.provider} 스트림 실패 — ${alt.provider}(${alt.model})로 폴백`);
  const second = await streamOnce(alt, params, onDelta);
  await recordLlmUsage(params.kind ?? "etc", alt.provider, second !== "setup_failed" && second !== null);
  return second === "setup_failed" ? null : second;
}

/** 1회 스트리밍 시도. 연결 자체가 실패하면(아직 아무 조각도 안 보냄) "setup_failed". */
async function streamOnce(
  config: LLMConfig,
  params: LLMCompleteParams,
  onDelta: (chunk: string) => void,
): Promise<string | null | "setup_failed"> {
  const anthropic = config.provider === "anthropic";

  let response: Response;
  try {
    response = await fetch(
      anthropic ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: anthropic
          ? { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }
          : { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          anthropic
            ? {
                model: config.model,
                max_tokens: params.maxOutputTokens,
                system: params.cache
                  ? [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }]
                  : params.system,
                messages: [{ role: "user", content: params.user }],
                stream: true,
              }
            : {
                model: config.model,
                store: false,
                ...(params.effort ? { reasoning: { effort: params.effort } } : {}),
                max_output_tokens: params.maxOutputTokens,
                input: [
                  { role: "system", content: params.system },
                  { role: "user", content: params.user },
                ],
                stream: true,
              },
        ),
        cache: "no-store",
        signal: AbortSignal.timeout(params.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      },
    );
  } catch (err) {
    console.error("[llm] stream fetch 실패:", err instanceof Error ? err.message : err);
    return "setup_failed";
  }
  if (!response.ok || !response.body) {
    console.error("[llm] stream", config.provider, response.status, (await response.text().catch(() => "")).slice(0, 300));
    return "setup_failed";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  /*
   * 스트리밍은 사용량이 두 번에 나눠 온다 — 입력·캐시는 첫 이벤트(message_start),
   * 출력은 마지막 직전(message_delta). 한쪽만 보면 요금의 절반을 놓치므로 합쳐 둔다.
   */
  let usage: AnthropicUsage | null = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE는 빈 줄로 이벤트를 구분한다
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (anthropic && payload.type === "message_start") {
            usage = { ...(usage ?? {}), ...((payload.message as { usage?: AnthropicUsage } | undefined)?.usage ?? {}) };
          }
          if (anthropic && payload.type === "message_delta") {
            usage = { ...(usage ?? {}), ...((payload.usage as AnthropicUsage | undefined) ?? {}) };
          }
          const piece = anthropic
            ? payload.type === "content_block_delta"
              ? ((payload.delta as { text?: string } | undefined)?.text ?? "")
              : ""
            : payload.type === "response.output_text.delta"
              ? (typeof payload.delta === "string" ? payload.delta : "")
              : "";
          if (piece) {
            full += piece;
            onDelta(piece);
          }
        }
      }
    }
  } catch {
    // 중간에 끊겨도 거기까지의 사용량은 청구된다 — finally에서 남긴다
    return full || null;
  } finally {
    if (anthropic) logUsage(params.kind ?? "etc", config.model, usage);
  }
  return full || null;
}
