import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { isDeliveryDocumentId } from "../../../../../../lib/delivery/document-drafts";
import { getOpenAIRuntimeConfig } from "../../../../../../lib/openai/session-config";
import { getProject } from "../../../../../../lib/project-repository";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  mode: z.enum(["spellcheck", "simplify", "concretize", "evidence"]),
  documentId: z.string().trim().min(1).max(40),
  sectionTitle: z.string().trim().min(1).max(180),
  text: z.string().trim().min(1).max(14_000),
});

const resultSchema = z.object({
  replacement: z.string().trim().min(1).max(20_000),
  summary: z.string().trim().min(1).max(300),
  warnings: z.array(z.string().trim().min(1).max(240)).max(5).default([]),
});

const runtimeState = globalThis as typeof globalThis & { __documentAssistRequests?: Map<string, number> };
const recentRequests = runtimeState.__documentAssistRequests ?? new Map<string, number>();
runtimeState.__documentAssistRequests = recentRequests;

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

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const input = requestSchema.parse(await request.json());
    if (!isDeliveryDocumentId(input.documentId)) throw new Error("DOCUMENT_NOT_FOUND");
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const config = getOpenAIRuntimeConfig(identity.hash);
    if (!config) {
      return privateJson({ error: { code: "OPENAI_NOT_CONNECTED", message: "인공지능 문장 도움을 사용하려면 운영용 OpenAI 연결이 필요합니다. 직접 수정과 저장은 지금도 가능합니다." } }, { status: 409 });
    }
    const previous = recentRequests.get(identity.hash) ?? 0;
    if (Date.now() - previous < 3_000) {
      return privateJson({ error: { code: "ASSIST_RATE_LIMITED", message: "문장을 검토하고 있습니다. 3초 뒤 다시 눌러주세요." } }, { status: 429 });
    }
    recentRequests.set(identity.hash, Date.now());

    const modeInstruction = input.mode === "spellcheck"
      ? "오탈자, 띄어쓰기와 문법만 고치고 뜻, 수치, 표, 링크와 주장 강도는 바꾸지 마세요."
      : input.mode === "simplify"
        ? "사업 초보자가 한 번에 이해하도록 어려운 영어와 전문용어를 쉬운 한국어로 바꾸고 문장을 짧게 정리하세요."
        : input.mode === "concretize"
          ? "저장된 사업 정보 범위 안에서 주어, 대상, 행동, 완료 기준을 구체적으로 만드세요. 없는 가격, 실적, 기간, 기관, 제휴는 만들지 마세요."
          : "아래에 제공된 저장 근거만 사용해 문장을 보강하세요. 출처에 없는 통계, 시장 규모, 성장률, 고객 반응은 절대 만들지 말고 근거가 부족하면 원문은 유지하고 경고에 적으세요.";
    const evidence = (project.marketWorkspace?.evidence ?? []).slice(0, 12).map((item) => ({
      title: item.title,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      observedAt: item.observedAt,
      verification: item.verification,
      note: item.note,
      metric: item.metric,
      value: item.value,
      unit: item.unit,
    }));
    const providerResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 2_500,
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "system",
            content: [
              "당신은 한국 초기 사업 문서를 다듬는 보수적인 편집자입니다.",
              modeInstruction,
              "표와 목록의 구조를 보존하세요.",
              "사용자 입력과 저장 근거에 없는 사실, 수치, 실적, 논문, 인허가, 기관, 제휴 또는 출처를 새로 만들지 마세요.",
              "JSON 객체 {replacement, summary, warnings}만 출력하세요.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              documentId: input.documentId,
              sectionTitle: input.sectionTitle,
              text: input.text,
              business: {
                title: project.title,
                opportunity: project.opportunity,
                founderProfile: project.founderProfile,
                financial: project.businessAssessment?.financial ?? null,
              },
              savedEvidence: input.mode === "evidence" ? evidence : [],
            }),
          },
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
    const raw = outputText(payload);
    if (!raw) throw new Error("인공지능 검토 결과가 비어 있습니다.");
    const result = resultSchema.parse(JSON.parse(raw));
    return privateJson({ result, model: config.model });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "문장 검토 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
      : error instanceof z.ZodError
        ? "인공지능 검토 결과를 정리하지 못했습니다. 다시 눌러주세요."
        : error instanceof Error ? error.message : "문장을 검토하지 못했습니다.";
    return privateJson({ error: { code: "DOCUMENT_ASSIST_FAILED", message } }, { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 });
  }
}

