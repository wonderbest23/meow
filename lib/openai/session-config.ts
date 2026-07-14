const DEFAULT_MODEL = "gpt-5.6-sol";
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

export type OpenAIRuntimeConfig = {
  apiKey: string;
  model: string;
  source: "session" | "environment";
};

export type OpenAIConnectionStatus = {
  connected: boolean;
  model: string;
  source: "session" | "environment" | "none";
  keyHint: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
};

type SessionConfig = {
  apiKey: string;
  model: string;
  connectedAt: string;
  expiresAt: string;
};

const runtime = globalThis as typeof globalThis & {
  __ventureOpenAISessions?: Map<string, SessionConfig>;
};

const sessions = runtime.__ventureOpenAISessions ?? new Map<string, SessionConfig>();
runtime.__ventureOpenAISessions = sessions;

function keyHint(apiKey: string) {
  return `••••${apiKey.slice(-4)}`;
}

async function providerErrorSummary(response: Response) {
  const payload = await response.clone().json().catch(() => null) as {
    error?: { code?: unknown; type?: unknown; message?: unknown };
  } | null;
  const code = [payload?.error?.code, payload?.error?.type]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const message = typeof payload?.error?.message === "string"
    ? payload.error.message
        .replace(/sk-[A-Za-z0-9_-]+/g, "[API key]")
        .replace(/\b(?:org|proj)_[A-Za-z0-9_-]+\b/g, "[project]")
        .slice(0, 240)
    : "";
  return [code, message].filter(Boolean).join(" · ") || `HTTP ${response.status}`;
}

function activeSession(guestHash: string) {
  const session = sessions.get(guestHash);
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) {
    sessions.delete(guestHash);
    return null;
  }
  return session;
}

export function getOpenAIRuntimeConfig(guestHash: string): OpenAIRuntimeConfig | null {
  const session = activeSession(guestHash);
  if (session) {
    return { apiKey: session.apiKey, model: session.model, source: "session" };
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    source: "environment",
  };
}

export function getOpenAIConnectionStatus(guestHash: string): OpenAIConnectionStatus {
  const session = activeSession(guestHash);
  if (session) {
    return {
      connected: true,
      model: session.model,
      source: "session",
      keyHint: keyHint(session.apiKey),
      connectedAt: session.connectedAt,
      expiresAt: session.expiresAt,
    };
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (apiKey) {
    return {
      connected: true,
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
      source: "environment",
      keyHint: keyHint(apiKey),
      connectedAt: null,
      expiresAt: null,
    };
  }
  return {
    connected: false,
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    source: "none",
    keyHint: null,
    connectedAt: null,
    expiresAt: null,
  };
}

export function setOpenAISessionConfig(guestHash: string, apiKey: string, model: string) {
  const connectedAt = new Date();
  sessions.set(guestHash, {
    apiKey,
    model,
    connectedAt: connectedAt.toISOString(),
    expiresAt: new Date(connectedAt.getTime() + SESSION_TTL_MS).toISOString(),
  });
  return getOpenAIConnectionStatus(guestHash);
}

export async function runOpenAISmokeTest(config: OpenAIRuntimeConfig) {
  const startedAt = Date.now();
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
        reasoning: { effort: "none" },
        max_output_tokens: 32,
        input: "Reply with exactly VENTURE_DNA_OPENAI_OK and nothing else.",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new OpenAIConnectionError(
      "OPENAI_TEST_UNAVAILABLE",
      "OpenAI 샘플 생성 시간이 초과되었습니다.",
      503,
    );
  }

  if (!response.ok) {
    const providerReason = await providerErrorSummary(response);
    if (response.status === 401) {
      throw new OpenAIConnectionError("OPENAI_KEY_INVALID", "OpenAI 연결키(API 키)가 만료되었거나 유효하지 않습니다.", 401);
    }
    if (response.status === 403 || response.status === 404) {
      throw new OpenAIConnectionError("OPENAI_MODEL_UNAVAILABLE", `이 키로 선택한 모델을 생성에 사용할 수 없습니다. OpenAI 응답: ${providerReason}`, 403);
    }
    if (response.status === 429) {
      throw new OpenAIConnectionError("OPENAI_RATE_LIMITED", "OpenAI 사용 한도 또는 요청 제한을 확인해주세요.", 429);
    }
    throw new OpenAIConnectionError(
      "OPENAI_TEST_FAILED",
      `OpenAI 샘플 생성에 실패했습니다. 응답 코드 ${response.status}`,
      502,
    );
  }

  const payload = await response.json() as {
    id?: string;
    model?: string;
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const outputText = payload.output_text ?? payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
  if (outputText?.trim() !== "VENTURE_DNA_OPENAI_OK") {
    throw new OpenAIConnectionError("OPENAI_TEST_OUTPUT_INVALID", "OpenAI 응답 형식을 확인하지 못했습니다.", 502);
  }

  return {
    ok: true as const,
    requestedModel: config.model,
    resolvedModel: payload.model ?? config.model,
    responseId: payload.id ?? null,
    latencyMs: Date.now() - startedAt,
  };
}

export function clearOpenAISessionConfig(guestHash: string) {
  sessions.delete(guestHash);
  return getOpenAIConnectionStatus(guestHash);
}

export async function validateOpenAIConnection(apiKey: string, model: string) {
  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new OpenAIConnectionError(
      "OPENAI_CONNECTION_UNAVAILABLE",
      "OpenAI 연결 확인 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.",
      503,
    );
  }

  if (response.ok) return;
  const providerReason = await providerErrorSummary(response);
  if (response.status === 401) {
    throw new OpenAIConnectionError("OPENAI_KEY_INVALID", "유효하지 않은 OpenAI 연결키(API 키)입니다.", 401);
  }
  if (response.status === 403) {
    throw new OpenAIConnectionError("OPENAI_KEY_FORBIDDEN", `이 키에는 선택한 모델을 사용할 권한이 없습니다. OpenAI 응답: ${providerReason}`, 403);
  }
  if (response.status === 404) {
    throw new OpenAIConnectionError("OPENAI_MODEL_UNAVAILABLE", `선택한 모델을 이 프로젝트에서 사용할 수 없습니다. OpenAI 응답: ${providerReason}`, 400);
  }
  if (response.status === 429) {
    throw new OpenAIConnectionError("OPENAI_RATE_LIMITED", "OpenAI 사용 한도 또는 요청 제한을 확인해주세요.", 429);
  }
  throw new OpenAIConnectionError(
    "OPENAI_CONNECTION_FAILED",
    `OpenAI 연결을 확인하지 못했습니다. 응답 코드 ${response.status}`,
    502,
  );
}

export class OpenAIConnectionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
