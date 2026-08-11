import { NextResponse } from "next/server";
import { resolveLLMConfig } from "../../../../lib/llm/config";
import { completeText } from "../../../../lib/llm/complete";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";

export const runtime = "nodejs";

// 질문별 AI 답안 추천 — "제한된(scoped) 프롬프트": 딱 이 질문에 대한 답안 후보만 생성.
// 근거 없는 수치·경쟁사 실명은 넣지 않음(리얼리티 게이트 철학).

const SYSTEM = [
  "당신은 한국 사업계획 작성을 돕는 도우미입니다.",
  "주어진 '한 질문'에 대한 답안 후보만 제안합니다. 사용자가 고르거나 다듬을 초안이며 확정 사실이 아닙니다.",
  "근거 없는 매출·시장규모·성장률·경쟁사 실명·수상 이력·특허는 절대 넣지 마세요.",
  "각 후보는 한 문장 또는 짧은 구로, 서로 다른 각도에서 제안하세요.",
  "제안은 반드시 주어진 '사업 맥락'의 업종·상품·고객에 맞춰야 합니다. 맥락에 없는 다른 업종(예: 꽃집, 카페)을 임의로 가정하지 마세요.",
  "사업 맥락이 비어 있으면 특정 업종을 지어내지 말고, 어떤 사업에도 적용되는 일반적인 형태로 제안하세요.",
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

/** 저장된 플랜에서 사업 맥락을 만든다 — 화면이 보낸 맥락과 합친다 */
async function serverContext(ownerHash: string, clientContext: string): Promise<string> {
  const parts: string[] = [];
  try {
    const state = await loadPlanState(ownerHash);
    const b = state.business;
    const bizLines = [
      b.name && `사업명: ${b.name}`,
      b.description && `사업 설명: ${b.description}`,
      b.industry && `업종: ${b.industry}`,
      b.region && `지역: ${b.region}`,
      b.stage && `진행 단계: ${b.stage}`,
    ].filter(Boolean);
    if (bizLines.length) parts.push(`[사업 정보]\n${bizLines.join("\n")}`);

    const plan = state.plans.find((p) => p.id === state.activePlanId) ?? state.plans[0];
    if (plan) {
      const answered: string[] = [];
      for (const [key, map] of Object.entries(plan.answers ?? {})) {
        for (const [, value] of Object.entries(map ?? {})) {
          if (value == null || value === "") continue;
          answered.push(`- ${Array.isArray(value) ? value.join(", ") : String(value)}`);
        }
        if (answered.length > 40) break;
        void key;
      }
      if (answered.length) parts.push(`[지금까지 답한 내용]\n${answered.slice(0, 40).join("\n")}`);
    }
  } catch {
    // 저장분을 못 읽어도 화면이 보낸 맥락은 쓴다
  }
  // 화면이 보낸 맥락에는 방금 입력해 아직 저장되지 않은 답도 들어 있다
  if (clientContext.trim()) parts.push(clientContext.slice(0, 1500));
  return parts.join("\n\n");
}

export async function POST(req: Request) {
  // AI·렌더 비용이 드는 호출 — 화면 제어와 별개로 서버에서 빈도를 제한한다
  const limited = await enforceRateLimit("plan-suggest", req, { limit: 80, windowMs: 10 * 60_000, message: "AI 추천 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  if (limited) return limited;
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

  /*
   * 사업 맥락은 서버에서도 직접 읽는다.
   *
   * 화면이 보내주는 맥락에만 기대면, 로컬 상태가 비어 있는 순간(다른 기기·
   * 새로고침·세션 문제) 맥락 없이 호출되어 엉뚱한 업종의 답이 나온다.
   * 저장된 플랜이 진짜 근거다.
   */
  const context = await serverContext(identity.hash, body.context ?? "");

  const user = [
    `질문: ${question}`,
    body.help ? `설명: ${body.help}` : "",
    context ? `사업 맥락(사용자가 지금까지 답한 내용):\n${context.slice(0, 2000)}` : "",
    "",
    `위 질문에 대한 답안 후보 ${count}개를 JSON 문자열 배열로만 출력하세요.`,
  ]
    .filter(Boolean)
    .join("\n");

  const text = await completeText(config, { kind: "suggest", system: SYSTEM, user, maxOutputTokens: 700, effort: "low" });
  const suggestions = parseArray(text) ?? fallbackSuggest(question);
  return NextResponse.json({ suggestions: suggestions.slice(0, count), source: text ? "ai" : "fallback" });
}
