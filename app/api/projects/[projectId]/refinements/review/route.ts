import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import type { DraftRefinementInput } from "../../../../../../lib/draft-package/domain";
import { getOpenAIRuntimeConfig } from "../../../../../../lib/openai/session-config";
import { getProject } from "../../../../../../lib/project-repository";
import { normalizeRefinementInput } from "../../../../../../lib/refinement/domain";

export const runtime = "nodejs";
export const maxDuration = 60;

const inputSchema = z.object({
  brandName: z.string().trim().min(2).max(100),
  customer: z.string().trim().min(2).max(300),
  oneLiner: z.string().trim().min(10).max(1000),
  priceWon: z.number().int().min(1_000).max(1_000_000_000),
  variableCostPerUnit: z.number().int().min(0).max(1_000_000_000),
  monthlyFixedCostWon: z.number().int().min(0).max(100_000_000_000),
  targetMonthlyUnits: z.number().int().min(0).max(10_000_000),
  region: z.string().trim().min(2).max(100),
  note: z.string().trim().max(1000).default(""),
});

const reviewSchema = z.object({
  summary: z.string().trim().min(1).max(300),
  suggestions: z.array(z.object({
    field: z.enum(["brandName", "customer", "oneLiner"]),
    value: z.string().trim().min(2).max(1000),
    reason: z.string().trim().min(1).max(240),
  })).max(3).default([]),
  warnings: z.array(z.string().trim().min(1).max(240)).max(6).default([]),
});

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

function deterministicWarnings(input: DraftRefinementInput) {
  const warnings: string[] = [];
  if (input.variableCostPerUnit >= input.priceWon) {
    warnings.push("한 건당 변동비가 판매가 이상이라 판매할수록 손실이 생깁니다.");
  } else if (input.variableCostPerUnit / input.priceWon >= 0.7) {
    warnings.push("판매가에서 변동비가 차지하는 비율이 70% 이상입니다. 실제 견적을 다시 확인하세요.");
  }
  if (input.targetMonthlyUnits === 0) warnings.push("월 목표 판매량이 0건이라 월 손익 예상이 계산되지 않습니다.");
  if (/미정|모름|아직/.test(input.region)) warnings.push("사업 지역이 정해지지 않아 지역별 신고·시장 근거는 일반 기준으로 작성됩니다.");
  if (input.oneLiner.length > 120) warnings.push("한 줄 소개가 길어 판매 페이지 첫 화면과 발표자료 제목에서 읽기 어려울 수 있습니다.");
  return warnings;
}

function normalizeReviewPayload(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  let suggestions = record.suggestions;
  if (suggestions && !Array.isArray(suggestions) && typeof suggestions === "object") {
    suggestions = Object.entries(suggestions as Record<string, unknown>)
      .filter(([field]) => ["brandName", "customer", "oneLiner"].includes(field))
      .map(([field, item]) => {
        if (typeof item === "string") return { field, value: item, reason: "더 짧고 명확한 문장으로 다듬었습니다." };
        if (!item || typeof item !== "object") return null;
        const suggestion = item as Record<string, unknown>;
        return {
          field,
          value: suggestion.value ?? suggestion.text ?? suggestion.suggestion,
          reason: suggestion.reason ?? "더 짧고 명확한 문장으로 다듬었습니다.",
        };
      })
      .filter(Boolean);
  }
  const warnings = typeof record.warnings === "string"
    ? [record.warnings]
    : record.warnings;
  return { ...record, suggestions: suggestions ?? [], warnings: warnings ?? [] };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const input = normalizeRefinementInput(project, inputSchema.parse(await request.json()));
    const warnings = deterministicWarnings(input);
    const config = getOpenAIRuntimeConfig(identity.hash);
    if (!config) {
      return privateJson({
        review: {
          summary: warnings.length ? "숫자와 문구에서 확인할 항목을 찾았습니다." : "입력한 핵심 정보끼리 서로 충돌하는 부분은 없습니다.",
          suggestions: [],
          warnings,
        },
        model: "기본 검토",
      });
    }

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
              "당신은 한국 초기 사업의 최종 결과물을 검토하는 보수적인 사업 편집자입니다.",
              "사용자 입력에 없는 시장 수치, 실적, 기관, 제휴, 자격, 고객 반응 또는 사실을 만들지 마세요.",
              "숫자는 수정 제안하지 말고 충돌이나 위험만 warnings에 적으세요.",
              "brandName, customer, oneLiner 중 실제로 더 명확하게 고칠 필요가 있는 항목만 suggestions에 넣으세요.",
              "문장은 쉬운 한국어로 쓰고 과장, 보장, 업계 1위 같은 표현을 제거하세요.",
              "JSON 객체 {summary, suggestions, warnings}만 출력하세요.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              business: input,
              sector: project.opportunity.sector,
              model: project.opportunity.model,
              revenue: project.opportunity.revenue,
              savedEvidenceCount: project.marketWorkspace?.evidence.length ?? 0,
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
        : payload.error?.message ?? "인공지능 검토에 실패했습니다.";
      return privateJson({ error: { code: "OPENAI_REVIEW_FAILED", message } }, { status: providerResponse.status });
    }
    const raw = outputText(payload);
    if (!raw) throw new Error("인공지능 검토 결과가 비어 있습니다.");
    const review = reviewSchema.parse(normalizeReviewPayload(JSON.parse(raw)));
    const suggestions = review.suggestions.filter((suggestion) => (
      suggestion.value !== String(input[suggestion.field])
    ));
    return privateJson({
      review: { ...review, suggestions, warnings: [...new Set([...warnings, ...review.warnings])].slice(0, 6) },
      model: config.model,
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "검토 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
      : error instanceof z.ZodError
        ? "인공지능 검토 결과를 정리하지 못했습니다. 다시 누르면 새로 검토합니다."
      : error instanceof Error ? error.message : "전체 내용을 검토하지 못했습니다.";
    return privateJson(
      { error: { code: message === "PROJECT_NOT_FOUND" ? message : "REFINEMENT_REVIEW_FAILED", message } },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
