import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { getOpenAIRuntimeConfig } from "../../../../lib/openai/session-config";

export const runtime = "nodejs";
export const maxDuration = 60;

const editableFieldsSchema = z.object({
  title: z.string().trim().max(180).optional(),
  lead: z.string().trim().max(700).optional(),
  statement: z.string().trim().max(900).optional(),
  supporting: z.string().trim().max(700).optional(),
  note: z.string().trim().max(700).optional(),
});

const requestSchema = z.object({
  mode: z.enum(["spellcheck", "improve", "market"]),
  deckType: z.enum(["intro", "ir"]),
  slideId: z.string().trim().min(1).max(80),
  fields: editableFieldsSchema,
  business: z.object({
    title: z.string().trim().min(1).max(160),
    customer: z.string().trim().max(500),
    model: z.string().trim().max(300),
    revenue: z.string().trim().max(300),
    sector: z.string().trim().max(160),
  }),
  evidenceSources: z.array(z.object({
    title: z.string().trim().min(1).max(180),
    status: z.string().trim().max(80),
    url: z.string().url().optional(),
    observedAt: z.string().max(40).optional(),
  })).max(6).default([]),
});

const resultSchema = z.object({
  fields: editableFieldsSchema,
  summary: z.string().trim().min(1).max(300),
  warnings: z.array(z.string().trim().min(1).max(240)).max(4).default([]),
});

const runtimeState = globalThis as typeof globalThis & { __presentationAssistRequests?: Map<string, number> };
const recentRequests = runtimeState.__presentationAssistRequests ?? new Map<string, number>();
runtimeState.__presentationAssistRequests = recentRequests;

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

function outputText(payload: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}) {
  return payload.output_text ?? payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
}

export async function POST(request: Request) {
  try {
    const identity = await requireGuestIdentity();
    const config = getOpenAIRuntimeConfig(identity.hash);
    if (!config) {
      return privateJson({
        error: { code: "OPENAI_NOT_CONNECTED", message: "인공지능 문장 도움을 사용하려면 운영용 OpenAI 연결이 필요합니다. 직접 수정과 저장은 지금도 가능합니다." },
      }, { status: 409 });
    }
    const previous = recentRequests.get(identity.hash) ?? 0;
    if (Date.now() - previous < 3_000) {
      return privateJson({ error: { code: "ASSIST_RATE_LIMITED", message: "문장을 검토하고 있습니다. 3초 뒤 다시 눌러주세요." } }, { status: 429 });
    }
    const input = requestSchema.parse(await request.json());
    recentRequests.set(identity.hash, Date.now());
    const modeInstruction = input.mode === "spellcheck"
      ? "오탈자, 띄어쓰기, 문법만 바로잡고 의미와 수치와 말투는 바꾸지 마세요."
      : input.mode === "improve"
        ? "초보자도 한 번에 이해하도록 짧고 구체적인 한국어 사업 문장으로 개선하세요. 과장 표현을 제거하세요."
        : "저장된 시장 근거의 제목과 상태만 사용해 시장 근거 문장을 보강하세요. 출처에 없는 통계, 시장 규모, 성장률, 고객 반응은 절대 만들지 말고 확인이 필요한 항목은 경고에 적으세요.";
    const providerResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 1_200,
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "system",
            content: [
              "당신은 한국의 초기 사업 발표자료를 검수하는 편집자입니다.",
              modeInstruction,
              "입력에 없는 사실, 수치, 실적, 인허가, 제휴, 논문, 기관명 또는 출처를 새로 만들지 마세요.",
              "fields에는 입력으로 받은 키만 돌려주고 JSON 객체 {fields, summary, warnings}만 출력하세요.",
            ].join(" "),
          },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const payload = await providerResponse.json() as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      error?: { message?: string };
    };
    if (!providerResponse.ok) {
      const message = providerResponse.status === 429
        ? "OpenAI 사용 한도 또는 요청 제한을 확인해주세요."
        : payload.error?.message ?? "인공지능 문장 검토에 실패했습니다.";
      return privateJson({ error: { code: "OPENAI_ASSIST_FAILED", message } }, { status: providerResponse.status });
    }
    const text = outputText(payload);
    if (!text) throw new Error("인공지능 검토 결과가 비어 있습니다.");
    const result = resultSchema.parse(JSON.parse(text));
    const allowedKeys = new Set(Object.keys(input.fields));
    const fields = Object.fromEntries(Object.entries(result.fields).filter(([key]) => allowedKeys.has(key)));
    return privateJson({ result: { ...result, fields }, model: config.model });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "문장 검토 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
      : error instanceof Error ? error.message : "문장을 검토하지 못했습니다.";
    return privateJson({ error: { code: "PRESENTATION_ASSIST_FAILED", message } }, { status: 400 });
  }
}
