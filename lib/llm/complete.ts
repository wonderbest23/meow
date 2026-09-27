// OpenAI와 Anthropic(Claude)을 한 인터페이스로 호출하는 통합 LLM 클라이언트.
// 호출부는 provider를 신경 쓰지 않고 completeText/completeJson만 쓰면 된다.

import { recordLlmUsage } from "./usage";
import type { BudgetLease, ReserveCost } from "./budget";

export type LLMProvider = "openai" | "anthropic";

export type LLMConfig = {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  execution?: LLMCompleteParams["failover"];
};
export type LLMFailure = { provider: LLMProvider; retryable?: boolean; code: "quota_exhausted" | "output_limit" | "unavailable" | "invalid_json" | "invalid_response" | "timeout" | "rate_limited" | "invalid_request" | "authentication" | "refusal" | "cancelled" };

export type LLMCompleteParams = {
  system: string;
  user: string;
  maxOutputTokens: number;
  // 사용량 집계용 기능 태그 (generate/deck/suggest/…) — 어드민 대시보드에 쓴다
  kind?: string;
  // OpenAI Responses의 reasoning.effort. Claude에는 적용되지 않는다.
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  timeoutMs?: number;
  /** Disable cross-provider retries for checkpointed, cost-bounded jobs. */
  allowFallback?: boolean;
  /** Explicit application policy. A shared atomic cost reservation is required for every attempt. */
  failover?: {
    alternate: LLMConfig | null;
    allowedErrors: readonly LLMFailure["code"][];
    totalTimeoutMs: number;
    attemptTimeoutMs: number;
    minRemainingMs: number;
    compatible: boolean;
    reserve: ReserveCost;
  };
  onAttemptUsage?: LLMCompleteParams["onUsage"];
  // JSON 객체 응답을 유도한다(OpenAI는 json_object 포맷 강제).
  jsonObject?: boolean;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /** Opt in only for schemas compatible with Anthropic's structured-output subset. */
  anthropicJsonSchema?: boolean;
  /** Optional caller schema check before recording a structured attempt as successful. */
  validateJson?: (value: Record<string, unknown>) => boolean | "output_limit";
  onFailure?: (failure: LLMFailure) => void;
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
  /*
   * 호출을 밖에서 끊는 신호 — 스트리밍 중 사용자가 화면을 떠났을 때 쓴다.
   * 이게 없으면 보는 사람이 사라진 뒤에도 모델이 끝까지 쓰고, 그 출력 토큰이
   * 그대로 실비가 된다.
   */
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const QUOTA_CODES = new Set(["insufficient_quota", "credit_balance_exhausted", "organization_spend_limit_exceeded", "project_spend_limit_exceeded", "organization_usage_limit_exceeded"]);
const knownTokens = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function requestFailure(signal: AbortSignal, error: unknown): LLMFailure["code"] {
  if (signal.reason?.name === "TimeoutError" || (error instanceof Error && error.name === "TimeoutError")) return "timeout";
  return signal.aborted || error instanceof Error && error.name === "AbortError" ? "cancelled" : error instanceof TypeError ? "unavailable" : "invalid_response";
}

async function httpFailure(response: Response, provider: LLMProvider): Promise<Omit<LLMFailure, "provider">> {
  const payload = await response.json().catch(() => null) as { error?: { code?: string; type?: string; message?: string } } | null;
  const codes = [payload?.error?.code, payload?.error?.type];
  const classify = (): LLMFailure["code"] => {
  if (codes.some(code => code && /^(?:refusal|content_filter|content_policy_violation|safety_violation)$/.test(code))) return "refusal";
  if (codes.some(code => code && QUOTA_CODES.has(code)) || /credit balance|no credits|insufficient.*credit|billing|spend(?:ing)? (?:limit|cap)|monthly.*(?:limit|cap)|usage (?:limit|cap)|quota/i.test(payload?.error?.message ?? "")) return "quota_exhausted";
  if (response.status === 401 || response.status === 403 || codes.some(code => code && /authentication|permission|invalid_api_key/.test(code))) return "authentication";
  if (codes.some(code => code && /invalid_request|not_found|invalid_argument|context_length/.test(code))) return "invalid_request";
  const message = payload?.error?.message ?? "";
  if (response.status === 429 && (provider === "openai"
    ? codes.some(code => code === "rate_limit_exceeded" || code === "slow_down" || code === "rate_limit_error")
    : codes.includes("rate_limit_error") && /(?:tokens?|requests?) per (?:minute|second)|too many requests|rate limit.*(?:minute|second)/i.test(message))) return "rate_limited";
  if (response.status >= 500 && codes.some(code => code === "server_error" || provider === "anthropic" && (code === "overloaded_error" || code === "api_error"))) return "unavailable";
  if (response.status === 408 && codes.some(code => code === "request_timeout" || code === "timeout_error")) return "timeout";
  // Unknown errors fail closed, including ambiguous 429 spend-limit responses.
  return "invalid_request";
  };
  const code = classify();
  // Gateway failures are service errors for users, but ambiguous bodies do not authorize another paid attempt.
  if (code === "invalid_request" && response.status >= 500 && !codes.some(value => value && /invalid_request|not_found|invalid_argument|context_length/.test(value))) return { code: "unavailable", retryable: false };
  if (code === "invalid_request" && response.status === 429 && codes.includes("rate_limit_error")) return { code: "rate_limited", retryable: false };
  if (code === "invalid_request" && !payload?.error) return { code: response.status === 429 ? "rate_limited" : response.status >= 500 ? "unavailable" : code, retryable: false };
  return { code, retryable: ["unavailable", "timeout", "rate_limited"].includes(code) };
}

function mayFallback(params: LLMCompleteParams, failure?: LLMFailure["code"]) {
  return params.allowFallback !== false && !params.signal?.aborted
    && ["unavailable", "timeout", "rate_limited"].includes(failure ?? "invalid_response");
}

/** 타임아웃과 외부 중단 신호를 하나로 — 둘 중 먼저 온 쪽이 끊는다 */
function callSignal(params: LLMCompleteParams): AbortSignal {
  const timeout = AbortSignal.timeout(params.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!params.signal) return timeout;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([timeout, params.signal]) : timeout;
}

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
  const signal = callSignal(params);
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
        ...(process.env.INTAKE_BETA_SAFETY === "1" ? { service_tier: "default" } : {}),
        ...(params.effort ? { reasoning: { effort: params.effort } } : {}),
        max_output_tokens: params.maxOutputTokens,
        ...(params.jsonSchema ? { text: { format: { type: "json_schema", strict: true, ...params.jsonSchema } } } : params.jsonObject ? { text: { format: { type: "json_object" } } } : {}),
        input: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
      }),
      cache: "no-store",
      signal,
    });
  } catch (err) {
    console.error("[llm] openai fetch 실패:", err instanceof Error ? err.message : err);
    params.onFailure?.({ provider: "openai", code: requestFailure(signal, err) });
    return null;
  }
  if (!response.ok) {
    const failure = await httpFailure(response, "openai"), { code } = failure;
    console.error(`[llm] failure kind=${params.kind ?? "etc"} provider=openai status=${response.status} code=${code}`);
    params.onFailure?.({ provider: "openai", ...failure });
    return null;
  }
  const payload = (await response.json().catch(error => {
    params.onFailure?.({ provider: "openai", code: requestFailure(signal, error) });
    return null;
  })) as {
    status?: string;
    model?: string;
    incomplete_details?: unknown;
    error?: { code?: string; type?: string; message?: string } | null;
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;
  if (!payload) return null;
  if (params.onUsage && knownTokens(payload.usage?.input_tokens) && knownTokens(payload.usage?.output_tokens)) {
    params.onUsage({ inputTokens: payload.usage.input_tokens, outputTokens: payload.usage.output_tokens, model: payload.model ?? config.model, provider: "openai" });
  }
  if (payload.output?.some(item => item.content?.some(block => block.type === "refusal"))) {
    params.onFailure?.({ provider: "openai", code: "refusal" });
    return null;
  }
  if (payload.error) {
    const code = payload.error.code;
    const failure = code === "context_length_exceeded" ? { code: "output_limit" as const, retryable: false }
      : await httpFailure(Response.json({ error: payload.error }, { status: code === "server_error" ? 503 : code === "rate_limit_exceeded" ? 429 : 400 }), "openai");
    params.onFailure?.({ provider: "openai", ...failure, code: failure.code === "invalid_request" ? "invalid_response" : failure.code });
    return null;
  }
  if (payload.incomplete_details || (payload.status && payload.status !== "completed")) {
    const reason = (payload.incomplete_details as { reason?: string } | undefined)?.reason;
    console.error(`[llm] incomplete kind=${params.kind ?? "etc"} provider=openai status=${payload.status ?? "unknown"} reason=${reason ?? "unknown"} output_tokens=${payload.usage?.output_tokens ?? 0}`);
    params.onFailure?.({ provider: "openai", code: reason === "max_output_tokens" ? "output_limit" : reason === "content_filter" ? "refusal" : payload.status === "cancelled" ? "cancelled" : "invalid_response", retryable: false });
    return null;
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

/*
 * Claude(Opus 5.5 등)는 추론이 항상 켜져 있고, 추론 토큰도 max_tokens 안에서 쓴다.
 * 답변 몫으로 잡은 한도가 추론에 먹혀 잘리지 않도록 추론 강도만큼 여유를 더한다(실제 쓴 만큼만 과금).
 * 추론 강도는 명시하지 않으면 API 기본값(medium)이 되므로 호출부의 effort를 그대로 보낸다.
 */
const THINKING_HEADROOM = { low: 2_048, medium: 4_096, high: 8_192, xhigh: 16_384, max: 32_000 } as const;

function anthropicOutputParams(config: LLMConfig, params: LLMCompleteParams) {
  const effortCapable = !/haiku/i.test(config.model);
  const effort = params.effort ?? "medium";
  const outputConfig = {
    ...(effortCapable ? { effort } : {}),
    ...(params.anthropicJsonSchema && params.jsonSchema ? { format: { type: "json_schema", schema: params.jsonSchema.schema } } : {}),
  };
  return {
    max_tokens: Math.min(64_000, params.maxOutputTokens + (effortCapable ? THINKING_HEADROOM[effort] : 0)),
    ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
  };
}

async function anthropicComplete(config: LLMConfig, params: LLMCompleteParams): Promise<string | null> {
  // Schema-compatible callers also enable constrained JSON output at the API level.
  const system = params.jsonObject
    ? `${params.system}\n\n반드시 설명이나 마크다운 코드펜스 없이 유효한 JSON 객체 하나만 출력하세요.${params.jsonSchema ? `\n출력 스키마: ${JSON.stringify(params.jsonSchema.schema)}` : ""}`
    : params.system;
  let response: Response;
  const signal = callSignal(params);
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
        ...anthropicOutputParams(config, params),
        // 캐시를 쓰려면 블록 배열이어야 한다 — 문자열에는 cache_control을 달 곳이 없다
        system: params.cache
          ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
          : system,
        messages: [{ role: "user", content: params.user }],
      }),
      cache: "no-store",
      signal,
    });
  } catch (err) {
    console.error("[llm] anthropic fetch 실패:", err instanceof Error ? err.message : err);
    params.onFailure?.({ provider: "anthropic", code: requestFailure(signal, err) });
    return null;
  }
  if (!response.ok) {
    const failure = await httpFailure(response, "anthropic"), { code } = failure;
    console.error(`[llm] failure kind=${params.kind ?? "etc"} provider=anthropic status=${response.status} code=${code}`);
    params.onFailure?.({ provider: "anthropic", ...failure });
    return null;
  }
  const payload = (await response.json().catch(error => {
    params.onFailure?.({ provider: "anthropic", code: requestFailure(signal, error) });
    return null;
  })) as {
    stop_reason?: string;
    content?: Array<{ type?: string; text?: string }>;
    usage?: unknown;
  } | null;
  if (!payload) return null;
  logUsage(params.kind ?? "etc", config.model, payload?.usage ?? null);
  if (params.onUsage && payload?.usage) {
    const u = payload.usage as AnthropicUsage;
    if (knownTokens(u.input_tokens) && knownTokens(u.output_tokens) && knownTokens(u.cache_read_input_tokens ?? 0) && knownTokens(u.cache_creation_input_tokens ?? 0)) params.onUsage({
      inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0,
      model: config.model,
      provider: "anthropic",
    });
  }
  if (!payload || !Array.isArray(payload.content) || (payload.stop_reason && !["end_turn", "stop_sequence"].includes(payload.stop_reason))) {
    const code = payload?.stop_reason === "max_tokens" || payload?.stop_reason === "model_context_window_exceeded" ? "output_limit" : payload?.stop_reason === "refusal" ? "refusal" : "invalid_response";
    console.error(`[llm] incomplete kind=${params.kind ?? "etc"} provider=anthropic reason=${payload?.stop_reason ?? "unknown"}`);
    params.onFailure?.({ provider: "anthropic", code, retryable: false });
    return null;
  }
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
  return key ? { provider: "anthropic", apiKey: key, model: process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5" } : null;
}

function completeOnce(config: LLMConfig, params: LLMCompleteParams): Promise<string | null> {
  return config.provider === "anthropic"
    ? anthropicComplete(config, params)
    : openaiComplete(config, params);
}

/** provider에 맞는 모델을 호출해 원본 텍스트를 반환한다. 실패하면 반대 프로바이더로 1회 폴백. */
export async function completeText(config: LLMConfig, params: LLMCompleteParams): Promise<string | null> {
  if (config.execution) params = { ...params, failover: config.execution, allowFallback: true };
  if (process.env.INTAKE_BETA_SAFETY === "1") {
    if (!config.execution) {
      params.onFailure?.({ provider: config.provider, code: "quota_exhausted", retryable: false });
      return null;
    }
    params = { ...params, allowFallback: false, failover: { ...config.execution, alternate: null, allowedErrors: [], compatible: false } };
  }
  if (!config.apiKey) return null;
  if (params.signal?.aborted) { params.onFailure?.({ provider: config.provider, code: requestFailure(params.signal, params.signal.reason) }); return null; }
  const policy = params.failover;
  const deadline = Date.now() + Math.min(params.timeoutMs ?? DEFAULT_TIMEOUT_MS, policy?.totalTimeoutMs ?? DEFAULT_TIMEOUT_MS);
  const totalSignal = callSignal({ ...params, timeoutMs: Math.max(1, deadline - Date.now()) });
  const bounded = async <T>(promise: Promise<T>, signal: AbortSignal, fallback: T): Promise<T> => {
    let listener: () => void = () => {};
    try { return await Promise.race([promise, new Promise<T>(resolve => { listener = () => resolve(fallback); if (signal.aborted) listener(); else signal.addEventListener("abort", listener, { once: true }); })]); }
    finally { signal.removeEventListener("abort", listener); }
  };
  const measuredCall = async (target: LLMConfig, attempt: number) => {
    const startedAt = Date.now();
    let failure: LLMFailure["code"] | undefined;
    let retryable: boolean | undefined;
    let usage: Parameters<NonNullable<LLMCompleteParams["onUsage"]>>[0] | undefined;
    let lease: BudgetLease | undefined;
    let attemptFinished = false;
    if (totalSignal.aborted || deadline - Date.now() < (policy?.minRemainingMs ?? 1)) return { result: null, failure: "timeout" as const };
    if (policy) {
      let abandoned = false;
      const requestBytes = new TextEncoder().encode(JSON.stringify({system:params.system,user:params.user,schema:params.jsonSchema,effort:params.effort,cache:params.cache}));
      const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", requestBytes)), n=>n.toString(16).padStart(2,"0")).join("");
      const reservation = Promise.resolve().then(() => policy.reserve({ provider: target.provider, model: target.model, attempt, inputBytes: requestBytes.length, maxOutputTokens: params.maxOutputTokens, deadline, requestFingerprint:fingerprint })).then(async value=>{
        if(value && typeof value!=="boolean" && (abandoned || totalSignal.aborted)){await value.cancel();return false;}
        return value;
      });
      const value=await bounded(reservation.catch(()=>false),totalSignal,false);
      if(!value || typeof value==="boolean" && process.env.NODE_ENV!=="test") { abandoned=true;params.onFailure?.({ provider: target.provider, code: totalSignal.aborted ? requestFailure(totalSignal,totalSignal.reason) : "quota_exhausted" });return {result:null,failure:"quota_exhausted" as const}; }
      if(typeof value!=="boolean")lease=value;
    }
    if (totalSignal.aborted || deadline - Date.now() < (policy?.minRemainingMs ?? 1)) { await lease?.cancel().catch(()=>undefined);return { result: null, failure: "timeout" as const }; }
    if(lease && !await bounded(lease.begin().catch(()=>false),totalSignal,false)){await lease.cancel().catch(()=>undefined);return {result:null,failure:"quota_exhausted" as const};}
    if(totalSignal.aborted){await lease?.cancel().catch(()=>undefined);return {result:null,failure:"timeout" as const};}
    const signal = callSignal({ signal: totalSignal, system: "", user: "", maxOutputTokens: 0, timeoutMs: Math.max(1, Math.min(deadline - Date.now(), policy?.attemptTimeoutMs ?? DEFAULT_TIMEOUT_MS)) });
    let result = await bounded(completeOnce(target, { ...params, signal,
      onFailure: event => { failure = event.code; retryable = event.retryable; params.onFailure?.(event); },
      onUsage: event => { usage = event; if(attemptFinished && lease) void lease.settle(event).catch(()=>undefined);params.onAttemptUsage?.(event); if (!policy) params.onUsage?.(event); },
    }), signal, null);
    attemptFinished = true;
    if(lease) {
      const settled=await bounded(lease.settle(usage??null).then(()=>true,()=>false),totalSignal,false);
      if(!settled){result=null;failure="quota_exhausted";params.onFailure?.({provider:target.provider,code:failure,retryable:false});}
    }
    if (signal.aborted) { result = null; failure = requestFailure(signal, signal.reason); params.onFailure?.({ provider: target.provider, code: failure }); }
    const responseReceived = !!result;
    if (result && params.jsonObject) {
      const parsed = parseJsonObject(result);
      if (!parsed) failure = "invalid_json";
      else if (params.validateJson) {
        try {
          const validation = params.validateJson(parsed);
          if (validation !== true) failure = validation === "output_limit" ? "output_limit" : "invalid_response";
        }
        catch { failure = "invalid_response"; }
      }
      if (failure) { result = null; params.onFailure?.({ provider: target.provider, code: failure }); }
    }
    console.log("[llm] call", JSON.stringify({ kind: params.kind ?? "etc", provider: target.provider, model: usage?.model ?? target.model, ok: !!result, responseReceived, validation: params.validateJson ? "schema" : params.jsonObject ? "json" : "text", code: failure, elapsedMs: Date.now() - startedAt, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null }));
    await bounded(recordLlmUsage(params.kind ?? "etc", target.provider, !!result, usage, { model: usage?.model ?? target.model, elapsedMs: Date.now() - startedAt, failureCode: failure ?? (!result ? "empty_response" : undefined) }), totalSignal, undefined);
    if (totalSignal.aborted) return { result: null, failure: "timeout" as const };
    if (result && policy && usage) params.onUsage?.(usage);
    return { result, failure, retryable };
  };
  const primary = await measuredCall(config, 0);
  if (primary.result) return primary.result;
  /* 밖에서 끊은 호출은 실패가 아니다 — 폴백으로 또 부르면 끊은 의미가 없다 */
  if (primary.retryable === false || !mayFallback(params, primary.failure)) return null;
  if (policy && (!policy.compatible || !policy.allowedErrors.includes(primary.failure ?? "invalid_response"))) return null;
  const alt = policy ? policy.alternate : envAlternate(config);
  if (!alt) return null;
  console.error(`[llm] ${config.provider} 실패 — ${alt.provider}(${alt.model})로 폴백`);
  return (await measuredCall(alt, 1)).result;
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
  if (process.env.INTAKE_BETA_SAFETY === "1") {
    params.onFailure?.({ provider: config.provider, code: "quota_exhausted", retryable: false });
    return null;
  }
  // Feature policies use buffered JSON, never splice a second provider into a visible stream.
  if (params.failover || config.execution) { params.onFailure?.({ provider: config.provider, code: "invalid_request" }); return null; }
  const deadline = Date.now() + (params.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  params = { ...params, signal: callSignal(params) };
  if (!config.apiKey) return null;
  if (params.signal?.aborted) { params.onFailure?.({ provider: config.provider, code: requestFailure(params.signal, params.signal.reason) }); return null; }
  let failure: LLMFailure["code"] | undefined;
  let retryable: boolean | undefined;
  const first = await streamOnce(config, { ...params, onFailure: event => { failure = event.code; retryable = event.retryable; params.onFailure?.(event); } }, onDelta);
  if (first !== "setup_failed") {
    await recordLlmUsage(params.kind ?? "etc", config.provider, first !== null);
    return first;
  }
  /* 밖에서 끊은 호출은 실패가 아니다 — 폴백으로 또 부르면 끊은 의미가 없다 */
  await recordLlmUsage(params.kind ?? "etc", config.provider, false);
  if (retryable === false || !mayFallback(params, failure)) return null;
  const alt = envAlternate(config);
  if (!alt) return null;
  console.error(`[llm] ${config.provider} 스트림 실패 — ${alt.provider}(${alt.model})로 폴백`);
  if (Date.now() >= deadline) return null;
  const second = await streamOnce(alt, { ...params, timeoutMs: Math.max(1, deadline - Date.now()) }, onDelta);
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
  const signal = callSignal(params);

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
                ...anthropicOutputParams(config, params),
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
        signal,
      },
    );
  } catch (err) {
    console.error("[llm] stream fetch 실패:", err instanceof Error ? err.message : err);
    params.onFailure?.({ provider: config.provider, code: requestFailure(signal, err) });
    return "setup_failed";
  }
  if (!response.ok || !response.body) {
    const failure = response.ok ? { code: "invalid_response" as const, retryable: false } : await httpFailure(response, config.provider);
    console.error("[llm] stream", config.provider, response.status, failure.code);
    params.onFailure?.({ provider: config.provider, ...failure });
    return "setup_failed";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let completed = false;
  let failed = false;
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
            const reason = (payload.delta as { stop_reason?: string } | undefined)?.stop_reason;
            if (reason === "max_tokens" || reason === "refusal") {
              failed = true;
              params.onFailure?.({ provider: config.provider, code: reason === "refusal" ? "refusal" : "output_limit" });
            }
          }
          if (payload.type === "response.refusal.delta" || payload.type === "response.refusal.done"
            || payload.type === "content_block_start" && (payload.content_block as { type?: string } | undefined)?.type === "refusal") {
            failed = true;
            params.onFailure?.({ provider: config.provider, code: "refusal" });
          }
          if (payload.type === "message_stop" || payload.type === "response.completed") completed = true;
          if (["error", "response.failed", "response.incomplete"].includes(String(payload.type))) {
            failed = true;
            params.onFailure?.({ provider: config.provider, code: "unavailable" });
          }
          const piece = anthropic
            ? payload.type === "content_block_delta" && (payload.delta as { type?: string } | undefined)?.type === "text_delta"
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
  } catch (error) {
    // 중간에 끊겨도 거기까지의 사용량은 청구된다 — finally에서 남긴다
    params.onFailure?.({ provider: config.provider, code: requestFailure(signal, error) });
    return null;
  } finally {
    if (anthropic) logUsage(params.kind ?? "etc", config.model, usage);
  }
  return completed && !failed ? full || null : null;
}
