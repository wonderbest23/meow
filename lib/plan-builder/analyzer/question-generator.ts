/*
 * 동적 질문 생성 — 코드가 고른 슬롯을 AI가 쉬운 한국어 질문으로 바꾼다.
 *
 * AI는 "무엇을 물을지"를 정하지 않는다. 슬롯은 Gap Analyzer 가 골랐고,
 * AI는 문장과(숫자 슬롯이면) 범위형 선택지만 만든다. AI가 목록에 없는 id 를
 * 내놓으면 버리고, 실패하면 팩의 기본 문장을 그대로 쓴다 — 질문이 비는 일은 없다.
 */
import { completeText, parseJsonObject, type LLMConfig } from "../../llm/complete";
import { z } from "zod";
import type { BusinessAnalysis } from "./domain";
import type { PackSlot, SlotInput } from "./packs";

export interface DynamicQuestion {
  /** 반드시 팩 슬롯 id — 화이트리스트 */
  id: string;
  q: string;
  why: string;
  label: string;
  input: SlotInput;
  /** 숫자 슬롯에 AI가 덧붙인 범위형 선택지 (예: "3만원대") — 없으면 직접 입력만 */
  suggestions?: string[];
  grade: PackSlot["grade"];
  allowUnknown: true;
}

export const UNKNOWN_LABEL = "아직 모르겠어요";

/** LLM 없이 팩 기본 문장으로 */
export function defaultQuestions(slots: PackSlot[]): DynamicQuestion[] {
  return slots.map((s) => ({ id: s.id, q: s.ask, why: s.why, label: s.label, input: s.input, grade: s.grade, allowUnknown: true }));
}

const outputSchema = z.object({
  intro: z.string().max(120).optional(),
  questions: z
    .array(
      z.object({
        id: z.string().max(60),
        q: z.string().min(5).max(160),
        why: z.string().max(80).optional(),
        suggestions: z.array(z.string().max(30)).max(4).optional(),
      }),
    )
    .max(8),
});

const SYSTEM = [
  "당신은 한국 예비창업자와 대화하는 창업 상담사입니다.",
  "주어진 '물어야 할 항목'을 초등학생도 답할 수 있는 쉬운 한국어 질문 한 문장으로 바꿉니다.",
  "- 전문용어(KPI·CAC·전환율·가동률·Unit Economics)는 쓰지 마세요. 꼭 필요하면 괄호로 풀어 쓰세요.",
  "- 질문은 사업 설명의 구체적인 내용(상품·고객)을 담아 '이 사업' 이야기처럼 들리게 하세요.",
  "- 항목 id 는 절대 바꾸거나 새로 만들지 마세요. 주어진 id 만 그대로 돌려주세요.",
  "- 숫자를 묻는 항목에는 suggestions 로 범위형 보기 3~4개를 줄 수 있습니다(예: \"3만원대\", \"5만원대\"). 정확한 숫자를 제시하지 마세요.",
  "- 답을 대신 정하거나 추천하지 마세요. 질문만 하세요.",
  "출력: {\"intro\": \"한 줄 안내\", \"questions\": [{\"id\": \"...\", \"q\": \"...\", \"why\": \"...\", \"suggestions\": [\"...\"]}]} JSON 객체 하나만.",
].join("\n");

function slotLine(s: PackSlot): string {
  const kind = s.input.kind === "number" ? `숫자(${s.input.unit})` : s.input.kind === "single" ? `선택: ${s.input.options.join(" / ")}` : "자유 서술";
  return `- id=${s.id} · ${s.label} · ${kind} · 기본 질문: "${s.ask}" · 이유: ${s.why}`;
}

/*
 * 운영에서 폴백이 얼마나 나는지 세기 위한 로그.
 * 사용자 답변 내용은 절대 싣지 않는다 — 슬롯 개수와 사유만.
 */
function logSource(source: "ai" | "fallback", slots: number, ai: number, reason?: string) {
  const parts = [`[plan-question] source=${source}`, `slots=${slots}`, `ai=${ai}`, `fallback=${slots - ai}`];
  if (reason) parts.push(`reason=${reason}`);
  console.log(parts.join(" "));
}

/**
 * 슬롯 → 질문. LLM 실패·검증 실패는 기본 문장으로 조용히 대체한다.
 * 반환하는 questions 의 순서와 개수는 입력 slots 와 같다.
 *
 * 이 함수는 어떤 경우에도 던지지 않는다. completeText 는 타임아웃·HTTP 오류·
 * 프로바이더 장애를 전부 null 로 돌려주지만, 그 약속이 미래에 깨지거나 이 안의
 * 다른 코드가 터져도 질문 라운드 전체가 죽으면 안 된다 — 마지막 잡이를 둔다.
 */
export async function generateQuestions(
  config: LLMConfig | null,
  analysis: BusinessAnalysis,
  slots: PackSlot[],
  round: number,
): Promise<{ intro: string; questions: DynamicQuestion[]; source: "ai" | "fallback" }> {
  const base = defaultQuestions(slots);
  const fallbackIntro = round === 1 ? "조금만 더 알려주세요. 숫자가 있어야 손익을 계산할 수 있어요." : "거의 다 됐어요. 몇 가지만 더요.";
  if (!slots.length) return { intro: fallbackIntro, questions: base, source: "fallback" };
  if (!config) {
    logSource("fallback", slots.length, 0, "no_config");
    return { intro: fallbackIntro, questions: base, source: "fallback" };
  }

  try {
    const user = [
      "[사업 요약]",
      analysis.summaryForUser,
      analysis.customer.value ? `- 고객: ${analysis.customer.value}` : "",
      analysis.solution.value ? `- 제공: ${analysis.solution.value}` : "",
      "",
      `[물어야 할 항목 ${slots.length}개 — id 는 그대로]`,
      ...slots.map(slotLine),
      "",
      "각 항목을 쉬운 질문으로 바꿔 JSON 객체 하나만 출력하세요.",
    ]
      .filter((l) => l !== "")
      .join("\n");

    const text = await completeText(config, {
      kind: "plan-questions",
      system: SYSTEM,
      user,
      maxOutputTokens: 900,
      effort: "low",
      jsonObject: true,
      cache: true,
      timeoutMs: 30_000,
    });
    if (!text) {
      /* 1차·(있다면) 2차 프로바이더까지 전부 실패한 경우다 — completeText 가 교차 폴백을 이미 했다 */
      logSource("fallback", slots.length, 0, "provider_failed");
      return { intro: fallbackIntro, questions: base, source: "fallback" };
    }
    const obj = parseJsonObject(text);
    if (!obj) {
      logSource("fallback", slots.length, 0, "malformed_json");
      return { intro: fallbackIntro, questions: base, source: "fallback" };
    }
    const parsed = outputSchema.safeParse(obj);
    if (!parsed.success) {
      logSource("fallback", slots.length, 0, "schema_mismatch");
      return { intro: fallbackIntro, questions: base, source: "fallback" };
    }

    const byId = new Map(parsed.data.questions.map((q) => [q.id, q]));
    let used = 0;
    const questions = base.map((b) => {
      const ai = byId.get(b.id); // 목록에 없는 id 는 여기서 자연히 버려진다
      if (!ai) return b;
      used += 1;
      const suggestions = b.input.kind === "number" ? (ai.suggestions ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4) : undefined;
      return { ...b, q: ai.q.trim(), why: ai.why?.trim() || b.why, ...(suggestions?.length ? { suggestions } : {}) };
    });
    /* 일부만 AI 가 채웠으면 나머지는 팩 문장 — 부분 폴백도 로그에서 보인다 */
    logSource(used ? "ai" : "fallback", slots.length, used, used && used < slots.length ? "partial" : undefined);
    return { intro: parsed.data.intro?.trim() || fallbackIntro, questions, source: used ? "ai" : "fallback" };
  } catch (err) {
    console.error("[plan-question] 예상 밖 오류 — 팩 기본 문장으로 폴백:", err instanceof Error ? err.message : err);
    logSource("fallback", slots.length, 0, "unexpected_error");
    return { intro: fallbackIntro, questions: base, source: "fallback" };
  }
}
