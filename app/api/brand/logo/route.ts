import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedIdentity } from "../../../../lib/api-auth";
import { getOpenAIRuntimeConfig } from "../../../../lib/openai/session-config";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { publicErrorMessage } from "../../../../lib/api-errors";

const requestSchema = z.object({
  businessName: z.string().trim().min(1).max(80),
  slogan: z.string().trim().max(120).default(""),
  businessDescription: z.string().trim().min(2).max(500),
  preferredColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  direction: z.string().trim().max(300).default(""),
});

function response(body: unknown, init?: ResponseInit) {
  const result = NextResponse.json(body, init);
  result.headers.set("Cache-Control", "private, no-store, max-age=0");
  return result;
}

export async function POST(request: Request) {
  try {
    // 이미지 생성은 서버 OpenAI 키로 넘어갈 수 있는 비싼 호출이다 — 로그인한 계정만 쓴다
    const identity = await requireAuthenticatedIdentity();
    const config = getOpenAIRuntimeConfig(identity.hash);
    if (!config) {
      return response({ error: { code: "OPENAI_NOT_CONNECTED", message: "먼저 상단의 OpenAI 연결에서 연결키를 등록해주세요. 기본 로고 시안은 연결 없이 사용할 수 있습니다." } }, { status: 409 });
    }
    const input = requestSchema.parse(await request.json());
    // 예전 메모리 30초 제한은 쿠키 없이 오면 매번 새 사람으로 보여 뚫렸다 — 계정 단위로 시간당 5번
    const limited = await enforceRateLimit("brand-logo", request, {
      limit: 5,
      windowMs: 60 * 60_000,
      key: identity.userId,
      message: "이미지 생성 비용을 보호하기 위해 한 시간에 5번까지 만들 수 있습니다. 잠시 후 다시 시도해주세요.",
    });
    if (limited) return limited;
    const prompt = [
      `Create one polished square brand symbol for a Korean small business named ${input.businessName}.`,
      `Business: ${input.businessDescription}.`,
      input.slogan ? `Brand promise: ${input.slogan}.` : "",
      `Use ${input.preferredColor} as the main color with black and white only as supporting colors.`,
      input.direction ? `Creative direction: ${input.direction}.` : "",
      "Minimal modern vector-like mark, strong silhouette, centered, generous whitespace, opaque pure white background.",
      "No words, no letters, no mockup, no stationery, no 3D object, no gradients, and do not imitate an existing trademark.",
    ].filter(Boolean).join("\n");
    const openAIResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2",
        prompt,
        size: "1024x1024",
        quality: "low",
        background: "opaque",
        n: 1,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    const payload = await openAIResponse.json() as { data?: Array<{ b64_json?: string }>; error?: { code?: string; message?: string } };
    if (!openAIResponse.ok) {
      const message = openAIResponse.status === 401
        ? "OpenAI 연결키가 유효하지 않습니다."
        : openAIResponse.status === 429
          ? "OpenAI 이미지 생성 한도 또는 사용 잔액을 확인해주세요."
          : "인공지능 로고를 만들지 못했습니다. 잠시 후 다시 시도해주세요.";
      // OpenAI 원문 오류(모델명·정책 문구 등)는 고객에게 보이지 않고 서버 로그에만 남긴다
      if (openAIResponse.status !== 401 && openAIResponse.status !== 429) {
        console.error("[brand-logo] OpenAI image generation failed", openAIResponse.status, payload.error);
      }
      return response({ error: { code: payload.error?.code ?? "LOGO_GENERATION_FAILED", message } }, { status: openAIResponse.status });
    }
    const image = payload.data?.[0]?.b64_json;
    if (!image) return response({ error: { code: "LOGO_IMAGE_MISSING", message: "생성된 로고 이미지를 받지 못했습니다." } }, { status: 502 });
    return response({ imageDataUrl: `data:image/png;base64,${image}`, model: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2" });
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_LOGIN_REQUIRED") {
      return response({ error: { code: "ACCOUNT_LOGIN_REQUIRED", message: "로그인 후 인공지능 로고를 만들 수 있습니다." } }, { status: 401 });
    }
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "로고 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
      : publicErrorMessage(error, "인공지능 로고를 만들지 못했습니다.");
    return response({ error: { code: "LOGO_GENERATION_FAILED", message } }, { status: 400 });
  }
}
