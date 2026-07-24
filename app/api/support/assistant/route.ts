import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { getOpenAIRuntimeConfig } from "../../../../lib/openai/session-config";
import {
  findSupportFaq,
  findSupportFaqCandidates,
  findSupportFaqKeywordMatches,
  supportKnowledgeText,
} from "../../../../lib/support-chat/faq";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  message: z.string().trim().min(1, "질문을 입력해주세요.").max(2000, "질문은 2,000자까지 입력할 수 있습니다."),
  page: z.string().trim().max(500).optional(),
});

const responseSchema = z.object({
  answer: z.string().trim().min(1).max(900),
  needsOperator: z.boolean(),
});

const runtimeState = globalThis as typeof globalThis & {
  __supportAssistantRequests?: Map<string, number>;
};
const recentRequests = runtimeState.__supportAssistantRequests ?? new Map<string, number>();
runtimeState.__supportAssistantRequests = recentRequests;

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

function fallbackAnswer(message: string) {
  const exact = findSupportFaq(message);
  const normalizedQuestion = message.replace(/\s+/g, " ").trim().replace(/[?.!]+$/g, "");
  if (exact && exact.question.replace(/[?.!]+$/g, "") === normalizedQuestion) {
    return { answer: exact.answer, needsOperator: false, source: "faq" as const };
  }
  const keywordMatches = findSupportFaqKeywordMatches(message, 3);
  if (keywordMatches.length > 0) {
    return {
      answer: keywordMatches.map((item) => item.answer).join(" "),
      needsOperator: false,
      source: "faq" as const,
    };
  }
  const candidates = findSupportFaqCandidates(message, 1);
  if (candidates.length > 0) {
    return {
      answer: `${candidates[0].answer} 이 답변이 질문과 다르면 현재 화면 주소와 하려던 작업을 운영자에게 남겨주세요.`,
      needsOperator: true,
      source: "faq" as const,
    };
  }
  return {
    answer: "사이트에 확인된 내용만으로는 이 질문을 정확히 답하기 어렵습니다. 현재 화면 주소와 하려던 작업을 함께 적어 운영자에게 문의해주세요.",
    needsOperator: true,
    source: "fallback" as const,
  };
}

export async function POST(request: Request) {
  try {
    const identity = await requireGuestIdentity();
    const input = requestSchema.parse(await request.json());
    const previous = recentRequests.get(identity.hash) ?? 0;
    if (Date.now() - previous < 2_000) {
      return privateJson(
        { error: { code: "SUPPORT_ASSISTANT_RATE_LIMITED", message: "답변을 확인하고 있습니다. 잠시 후 다시 질문해주세요." } },
        { status: 429 },
      );
    }
    recentRequests.set(identity.hash, Date.now());

    const config = getOpenAIRuntimeConfig(identity.hash);
    if (!config) return privateJson(fallbackAnswer(input.message));

    const providerResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 650,
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "system",
            content: [
              "당신은 ‘오늘창업’ 웹서비스의 한국어 고객 상담 도우미입니다.",
              "아래 제공된 서비스 지식만 근거로 답하고, 구현되지 않은 기능·처리 완료·환불 상태·가격·일정을 추측하거나 약속하지 마세요.",
              "질문이 여러 개면 각 질문에 빠짐없이 답하되 초보자가 이해하는 쉬운 한국어로 2~5문장만 쓰세요.",
              "가능하면 사용자가 지금 할 다음 행동을 정확한 화면 이름이나 버튼 문구와 함께 알려주세요.",
              "세무·법률·투자 판단은 대행하거나 확정하지 말고 서비스 지원 범위를 설명하세요.",
              "서비스 지식으로 확정할 수 없거나 실제 주문·계정·프로젝트 확인이 필요하면 needsOperator를 true로 하세요.",
              "JSON 객체 {answer, needsOperator}만 출력하세요.",
              "",
              "오늘창업 서비스 지식:",
              supportKnowledgeText(input.message),
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              question: input.message,
              currentPage: input.page ?? "알 수 없음",
            }),
          },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });

    const payload = await providerResponse.json() as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      error?: { message?: string };
    };
    if (!providerResponse.ok) return privateJson(fallbackAnswer(input.message));

    const text = outputText(payload);
    if (!text) return privateJson(fallbackAnswer(input.message));
    const result = responseSchema.parse(JSON.parse(text));
    return privateJson({ ...result, source: "openai", model: config.model });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return privateJson(
        { error: { code: "SUPPORT_ASSISTANT_INPUT_INVALID", message: error.issues[0]?.message ?? "질문을 확인해주세요." } },
        { status: 400 },
      );
    }
    return privateJson({
      answer: "지금은 자동 답변을 불러오지 못했습니다. 현재 화면 주소와 하려던 작업을 함께 적어 운영자에게 문의해주세요.",
      needsOperator: true,
      source: "fallback",
    });
  }
}
