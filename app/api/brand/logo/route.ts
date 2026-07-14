import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { getOpenAIRuntimeConfig } from "../../../../lib/openai/session-config";

const requestSchema = z.object({
  businessName: z.string().trim().min(1).max(80),
  slogan: z.string().trim().max(120).default(""),
  businessDescription: z.string().trim().min(2).max(500),
  preferredColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  direction: z.string().trim().max(300).default(""),
});

const runtime = globalThis as typeof globalThis & { __ventureLogoRequests?: Map<string, number> };
const recentRequests = runtime.__ventureLogoRequests ?? new Map<string, number>();
runtime.__ventureLogoRequests = recentRequests;

function response(body: unknown, init?: ResponseInit) {
  const result = NextResponse.json(body, init);
  result.headers.set("Cache-Control", "private, no-store, max-age=0");
  return result;
}

export async function POST(request: Request) {
  try {
    const identity = await requireGuestIdentity();
    const config = getOpenAIRuntimeConfig(identity.hash);
    if (!config) {
      return response({ error: { code: "OPENAI_NOT_CONNECTED", message: "먼저 상단의 OpenAI 연결에서 연결키를 등록해주세요. 기본 로고 시안은 연결 없이 사용할 수 있습니다." } }, { status: 409 });
    }
    const previous = recentRequests.get(identity.hash) ?? 0;
    if (Date.now() - previous < 30_000) {
      return response({ error: { code: "LOGO_RATE_LIMITED", message: "이미지 생성 비용을 보호하기 위해 30초 뒤에 다시 만들 수 있습니다." } }, { status: 429 });
    }
    const input = requestSchema.parse(await request.json());
    recentRequests.set(identity.hash, Date.now());
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
          : payload.error?.message ?? "인공지능 로고를 만들지 못했습니다.";
      return response({ error: { code: payload.error?.code ?? "LOGO_GENERATION_FAILED", message } }, { status: openAIResponse.status });
    }
    const image = payload.data?.[0]?.b64_json;
    if (!image) return response({ error: { code: "LOGO_IMAGE_MISSING", message: "생성된 로고 이미지를 받지 못했습니다." } }, { status: 502 });
    return response({ imageDataUrl: `data:image/png;base64,${image}`, model: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2" });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "로고 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
      : error instanceof Error ? error.message : "인공지능 로고를 만들지 못했습니다.";
    return response({ error: { code: "LOGO_GENERATION_FAILED", message } }, { status: 400 });
  }
}
