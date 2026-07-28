import { NextResponse } from "next/server";
import { marked } from "marked";
import { PLAN_BLUEPRINT } from "../../../../lib/plan-builder/blueprint";
import { generateSection } from "../../../../lib/plan-builder/section-generator";
import { resolveLLMConfig } from "../../../../lib/llm/config";

export const runtime = "nodejs";

// 섹션 생성 — 답변을 프롬프트로 만들어 Claude/OpenAI가 그 섹션 본문(마크다운) 생성 → HTML까지 렌더.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    chapterId?: string;
    sectionId?: string;
    answers?: Record<string, unknown>;
    planTitle?: string;
    priorSummary?: string;
  };

  const chapter = PLAN_BLUEPRINT.find((c) => c.id === body.chapterId);
  const section = chapter?.sections.find((s) => s.id === body.sectionId);
  if (!chapter || !section) {
    return NextResponse.json({ error: "unknown section" }, { status: 400 });
  }

  const config = resolveLLMConfig("", "anthropic");
  const { markdown, source } = await generateSection(config, {
    chapter,
    section,
    answers: body.answers ?? {},
    planTitle: body.planTitle,
    priorSummary: body.priorSummary,
  });

  let html = "";
  try {
    html = await marked.parse(markdown, { async: true });
  } catch {
    html = markdown.replace(/\n/g, "<br>");
  }

  return NextResponse.json({ markdown, html, source });
}
