// OpenAI와 Anthropic(Claude)을 한 인터페이스로 호출하는 통합 LLM 클라이언트.
// 호출부는 provider를 신경 쓰지 않고 completeText/completeJson만 쓰면 된다.

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
  // OpenAI Responses의 reasoning.effort. Claude에는 적용되지 않는다.
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
  // JSON 객체 응답을 유도한다(OpenAI는 json_object 포맷 강제).
  jsonObject?: boolean;
};

const DEFAULT_TIMEOUT_MS = 120_000;

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
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  } | null;
  if (!payload) return null;
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
        system,
        messages: [{ role: "user", content: params.user }],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(params.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as {
    content?: Array<{ type?: string; text?: string }>;
  } | null;
  if (!payload || !Array.isArray(payload.content)) return null;
  const text = payload.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
  return text || null;
}

/** provider에 맞는 모델을 호출해 원본 텍스트를 반환한다. 실패 시 null. */
export async function completeText(config: LLMConfig, params: LLMCompleteParams): Promise<string | null> {
  if (!config.apiKey) return null;
  return config.provider === "anthropic"
    ? anthropicComplete(config, params)
    : openaiComplete(config, params);
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
