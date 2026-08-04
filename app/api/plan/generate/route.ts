import { NextResponse } from "next/server";
import { renderPlanMarkdown } from "../../../../lib/plan-builder/markdown";
import { PLAN_BLUEPRINT, financialTableOwner, needsMultiYear } from "../../../../lib/plan-builder/blueprint";
import { generateSection, streamSection } from "../../../../lib/plan-builder/section-generator";
import { resolveLLMConfig } from "../../../../lib/llm/config";
import { collectFinancialInputs, calculateFinancials, financialsToMarkdown, financialsToReference, projectYears, yearsToMarkdown } from "../../../../lib/plan-builder/financials";
import { findConsistencyIssues, issuesForSection } from "../../../../lib/plan-builder/consistency";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { resolvePlanAccess, checkSectionAccess, FREE_SECTION_COUNT } from "../../../../lib/plan-builder/access";

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

  /*
   * 재무 수치는 여러 섹션이 참고하지만, 표와 차트를 본문에 싣는 곳은 한 섹션뿐이다.
   * 나머지 섹션에는 핵심 수치 요약만 넘겨 같은 표가 문서에 반복되지 않게 한다.
   */
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
  let financialsReference: string | undefined;
  const sectionKey = `${chapter.id}/${section.id}`;
  if (body.allAnswers && FINANCIAL_SECTIONS.has(sectionKey)) {
    const { inputs, growthLabel, staffIncluded } = collectFinancialInputs(body.allAnswers);
    const result = calculateFinancials(inputs);
    if (result.unit || result.monthly.length) {
      if (sectionKey === financialTableOwner(body.planType)) {
        financialsMarkdown = financialsToMarkdown(result, {
          growthLabel,
          growthPct: inputs.monthlyGrowthPct,
          staffIncluded,
          monthlyCapacity: inputs.monthlyCapacity,
        });
        // '정밀 재무 모델'은 카드에서 다년 예측을 약속한다 — 실제로 3년을 계산해 붙인다
        if (needsMultiYear(body.planType)) {
          const years = yearsToMarkdown(projectYears(inputs), { growthPct: inputs.monthlyGrowthPct, monthlyCapacity: inputs.monthlyCapacity });
          if (years) financialsMarkdown = `${financialsMarkdown}\n\n${years}`;
        }
      } else {
        financialsReference = financialsToReference(result);
      }
    }
  }

  // 미해결 충돌을 프롬프트에 함께 넘긴다 — AI가 한쪽을 골라 단정하지 않도록.
  // 총평(요약) 섹션은 플랜 전체를 요약하므로 모든 충돌을 넘긴다.
  let conflicts: Array<{ title: string; detail: string }> | undefined;
  if (body.allAnswers) {
    const all = findConsistencyIssues(body.allAnswers, body.business);
    const relevant = sectionKey === "summary/executive" ? all : issuesForSection(all, sectionKey);
    if (relevant.length) conflicts = relevant.map(({ title, detail }) => ({ title, detail }));
  }

  // 화면만 가려서는 우회할 수 있으므로 생성 자체를 서버에서 막는다.
  const access = await resolvePlanAccess(body.planType);
  const reason = checkSectionAccess(access, sectionKey);
  if (reason !== "ok") {
    return NextResponse.json(
      {
        error: reason,
        message:
          reason === "login_required"
            ? "로그인 후 이용할 수 있습니다."
            : `무료로는 앞 ${FREE_SECTION_COUNT}개 섹션까지 작성할 수 있습니다. 이어서 쓰려면 결제가 필요합니다.`,
      },
      { status: reason === "login_required" ? 401 : 402 },
    );
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
    financialsReference,
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
    financialsReference,
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
