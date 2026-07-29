import { NextResponse } from "next/server";
import { renderPlanMarkdown } from "../../../../lib/plan-builder/markdown";
import { PLAN_BLUEPRINT } from "../../../../lib/plan-builder/blueprint";
import { generateSection, streamSection } from "../../../../lib/plan-builder/section-generator";
import { resolveLLMConfig } from "../../../../lib/llm/config";
import { collectFinancialInputs, calculateFinancials, financialsToMarkdown } from "../../../../lib/plan-builder/financials";
import { findConsistencyIssues, issuesForSection } from "../../../../lib/plan-builder/consistency";
import { requireGuestIdentity } from "../../../../lib/api-auth";

export const runtime = "nodejs";

// 섹션 생성 — 답변을 프롬프트로 만들어 Claude/OpenAI가 그 섹션 본문(마크다운) 생성 → HTML까지 렌더.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    chapterId?: string;
    sectionId?: string;
    answers?: Record<string, unknown>;
    planTitle?: string;
    planType?: string;
    /** 켜면 본문을 조각 단위로 흘려준다(NDJSON) */
    stream?: boolean;
    priorSummary?: string;
    /** 플랜 전체 답변 — 재무 계산에 필요(입력이 여러 섹션에 흩어져 있음) */
    allAnswers?: Record<string, Record<string, unknown>>;
    business?: {
      name?: string;
      description?: string;
      role?: string;
      industry?: string;
      region?: string;
      stage?: string;
    };
  };

  const chapter = PLAN_BLUEPRINT.find((c) => c.id === body.chapterId);
  const section = chapter?.sections.find((s) => s.id === body.sectionId);
  if (!chapter || !section) {
    return NextResponse.json({ error: "unknown section" }, { status: 400 });
  }

  // 재무 관련 섹션이면 입력값으로 표를 계산해 확정 수치로 넘긴다.
  const FINANCIAL_SECTIONS = new Set([
    "financials/revenue",
    "financials/expenses",
    "financials/financing",
    "financials/staffing",
    "financials/assets",
    "market/products", // 가격·손익 언급
    "summary/executive",
  ]);
  let financialsMarkdown: string | undefined;
  const sectionKey = `${chapter.id}/${section.id}`;
  if (body.allAnswers && FINANCIAL_SECTIONS.has(sectionKey)) {
    const { inputs, growthLabel, staffIncluded } = collectFinancialInputs(body.allAnswers);
    const result = calculateFinancials(inputs);
    if (result.unit || result.monthly.length) {
      financialsMarkdown = financialsToMarkdown(result, {
        growthLabel,
        growthPct: inputs.monthlyGrowthPct,
        staffIncluded,
      });
    }
  }

  // 미해결 충돌을 프롬프트에 함께 넘긴다 — AI가 한쪽을 골라 단정하지 않도록.
  // 총평(요약) 섹션은 플랜 전체를 요약하므로 모든 충돌을 넘긴다.
  let conflicts: Array<{ title: string; detail: string }> | undefined;
  if (body.allAnswers) {
    const all = findConsistencyIssues(body.allAnswers);
    const relevant = sectionKey === "summary/executive" ? all : issuesForSection(all, sectionKey);
    if (relevant.length) conflicts = relevant.map(({ title, detail }) => ({ title, detail }));
  }

  const identity = await requireGuestIdentity();
  const config = resolveLLMConfig(identity.hash, "anthropic");
  const genInput = {
    chapter,
    section,
    answers: body.answers ?? {},
    planTitle: body.planTitle,
    planType: body.planType,
    business: body.business,
    priorSummary: body.priorSummary,
    financialsMarkdown,
    conflicts,
  };

  // 실시간 생성 — 한 줄에 JSON 하나씩 흘려보낸다.
  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        try {
          const { markdown, source } = await streamSection(config, genInput, (chunk) => send({ t: "delta", v: chunk }));
          let html = "";
          try {
            html = await renderPlanMarkdown(markdown);
          } catch {
            html = markdown.replace(/\n/g, "<br>");
          }
          send({ t: "done", markdown, html, source });
        } catch {
          send({ t: "error" });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const { markdown, source } = await generateSection(config, {
    chapter,
    section,
    answers: body.answers ?? {},
    planTitle: body.planTitle,
    planType: body.planType,
    business: body.business,
    priorSummary: body.priorSummary,
    financialsMarkdown,
    conflicts,
  });

  let html = "";
  try {
    html = await renderPlanMarkdown(markdown);
  } catch {
    html = markdown.replace(/\n/g, "<br>");
  }

  return NextResponse.json({ markdown, html, source });
}
