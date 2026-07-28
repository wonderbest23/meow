import { NextResponse } from "next/server";
import { resolveLLMConfig } from "../../../../lib/llm/config";
import { completeText } from "../../../../lib/llm/complete";
import { requireGuestIdentity } from "../../../../lib/api-auth";

export const runtime = "nodejs";

// 질문별 AI 답안 추천 — "제한된(scoped) 프롬프트": 딱 이 질문에 대한 답안 후보만 생성.
// 근거 없는 수치·경쟁사 실명은 넣지 않음(리얼리티 게이트 철학).

const SYSTEM = [
  "당신은 한국 사업계획 작성을 돕는 도우미입니다.",
  "주어진 '한 질문'에 대한 답안 후보만 제안합니다. 사용자가 고르거나 다듬을 초안이며 확정 사실이 아닙니다.",
  "근거 없는 매출·시장규모·성장률·경쟁사 실명·수상 이력·특허는 절대 넣지 마세요.",
  "각 후보는 한 문장 또는 짧은 구로, 서로 다른 각도에서 제안하세요.",
  "반드시 문자열 배열 형태의 JSON만 출력하세요. 예: [\"...\", \"...\", \"...\"]",
].join("\n");

function parseArray(text: string | null): string[] | null {
  if (!text) return null;
  let t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) t = fenced[1].trim();
  try {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
  } catch {
    // 줄 단위 폴백
    const lines = t
      .split("\n")
      .map((l) => l.replace(/^[-*\d.)\s"]+/, "").replace(/"$/, "").trim())
      .filter((l) => l.length > 1 && l.length < 200);
    if (lines.length) return lines;
  }
  return null;
}

function fallbackSuggest(question: string): string[] {
  return [
    "(예시) 이 부분은 직접 작성하거나 실제 근거를 연결해 채워주세요.",
    `(예시) '${question.slice(0, 20)}'에 대한 우리 사업만의 답을 한 문장으로 정리`,
  ];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    question?: string;
    help?: string;
    context?: string;
    count?: number;
  };
  const question = (body.question ?? "").slice(0, 300);
  if (!question) return NextResponse.json({ suggestions: [], source: "empty" });
  const count = Math.min(Math.max(body.count ?? 4, 2), 6);

  const identity = await requireGuestIdentity();
  const config = resolveLLMConfig(identity.hash, "anthropic");
  if (!config) {
    return NextResponse.json({ suggestions: fallbackSuggest(question), source: "fallback" });
  }

  const user = [
    `질문: ${question}`,
    body.help ? `설명: ${body.help}` : "",
    body.context ? `사업 맥락(사용자가 지금까지 답한 내용):\n${body.context.slice(0, 1500)}` : "",
    "",
    `위 질문에 대한 답안 후보 ${count}개를 JSON 문자열 배열로만 출력하세요.`,
  ]
    .filter(Boolean)
    .join("\n");

  const text = await completeText(config, { system: SYSTEM, user, maxOutputTokens: 700, effort: "low" });
  const suggestions = parseArray(text) ?? fallbackSuggest(question);
  return NextResponse.json({ suggestions: suggestions.slice(0, count), source: text ? "ai" : "fallback" });
}
