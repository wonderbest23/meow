// 섹션 단위 AI 생성기 — 답변을 프롬프트로 만들어 Claude/OpenAI가 그 섹션 본문(마크다운)을 생성.
// 리얼리티 게이트 철학 유지: 근거 없는 경쟁사 실명·시장수치·인터뷰를 지어내지 않고 "추가 정의 필요"로 표기.

import { completeText, type LLMConfig } from "../llm/complete";
import type { PlanChapterDef, PlanSectionDef } from "./blueprint";

const SYSTEM_PROMPT = [
  "당신은 한국에서 실제로 실행할 사업계획서의 한 섹션을 작성하는 선임 사업전략가입니다.",
  "이 작업은 소설·광고 창작이 아닙니다. 오직 사용자가 제공한 답변만 확정 사실로 사용할 수 있습니다.",
  "고객 인터뷰·설문·매출·시장규모·성장률·경쟁사 실명·수상·특허·제휴·후기를 절대 만들어내지 마세요.",
  "근거가 없는 수치나 주장은 반드시 '추가 정의 필요' 또는 '검증 필요'로 표기하고, 미래형·조건형 문장을 사용하세요.",
  "섹션은 소제목(##, ###)으로 구조화하고, 비교·구성·수치 정리에 적합하면 마크다운 표를 사용하세요.",
  "각 문단은 이 사업에만 해당하는 구체적 내용으로 쓰고, 다른 업종에 복붙해도 말이 되는 범용 문장은 실패로 간주합니다.",
  "과장, 성공 보장, 가상 고객 인용, 존재하지 않는 경쟁사·URL을 금지합니다.",
  "출력은 해당 섹션의 마크다운 본문만 작성하세요. 최상위 제목(#)이나 코드펜스는 넣지 마세요.",
].join("\n");

function formatAnswers(answers: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(answers)) {
    if (v == null || v === "") continue;
    const val = Array.isArray(v) ? v.join(", ") : String(v);
    lines.push(`- ${k}: ${val}`);
  }
  return lines.length ? lines.join("\n") : "(제공된 답변 없음 — 일반 구조로 작성하되 모든 수치는 '추가 정의 필요'로 표기)";
}

export interface BusinessInfo {
  name?: string;
  description?: string;
  role?: string;
  industry?: string;
  region?: string;
  stage?: string;
}

export interface SectionGenInput {
  chapter: PlanChapterDef;
  section: PlanSectionDef;
  answers: Record<string, unknown>;
  planTitle?: string;
  /** 플랜 유형 — 누구에게 보여줄 문서인지에 따라 서술 관점이 달라진다 */
  planType?: string;
  /** 시작 단계에서 입력한 사업 정보 — 모든 섹션의 공통 맥락 */
  business?: BusinessInfo;
  /** 앞 섹션 요약(일관성용, 선택) */
  priorSummary?: string;
  /** 계산된 재무표(마크다운) — 재무 섹션에서 산식으로 만든 확정 수치 */
  financialsMarkdown?: string;
  /**
   * 아직 해결되지 않은 답변 충돌.
   * 어느 쪽이 맞는지 확정되지 않았으므로 AI가 한쪽을 골라 단정하지 않도록 알려준다.
   */
  conflicts?: Array<{ title: string; detail: string }>;
}

/** 충돌을 프롬프트 블록으로 — 지어내지 말고 미확정임을 드러내라고 지시한다. */
function formatConflicts(conflicts?: Array<{ title: string; detail: string }>): string {
  if (!conflicts?.length) return "";
  return [
    "\n[해결되지 않은 답변 충돌]",
    ...conflicts.map((c) => `- ${c.title}: ${c.detail}`),
    "",
    "위 항목은 사용자의 답변끼리 어긋나 어느 쪽이 맞는지 확정되지 않은 상태입니다.",
    "해당 내용을 단정적으로 서술하지 마세요. 두 값(또는 두 진술)이 모두 존재한다는 사실을 밝히고 '확정 필요'로 표기하세요.",
    "임의로 한쪽을 골라 사실처럼 쓰거나, 평균·중간값을 내어 새로운 수치를 만들지 마세요.",
    "충돌과 무관한 내용은 평소대로 작성하세요.",
  ].join("\n");
}

function formatBusiness(b?: BusinessInfo): string {
  if (!b) return "";
  const lines: string[] = [];
  if (b.name) lines.push(`- 사업명: ${b.name}`);
  if (b.description) lines.push(`- 사업 설명: ${b.description}`);
  if (b.industry) lines.push(`- 업종: ${b.industry}`);
  if (b.region) lines.push(`- 지역: ${b.region}`);
  if (b.role) lines.push(`- 대표자 역할: ${b.role}`);
  if (b.stage) lines.push(`- 진행 단계: ${b.stage}`);
  return lines.join("\n");
}

/** 사용자 프롬프트 조립 (테스트에서 직접 확인할 수 있게 공개) */
export function buildUserPrompt(input: SectionGenInput): string {
  const biz = formatBusiness(input.business);
  return [
    biz ? `[사업 정보]\n${biz}\n` : `사업명: ${input.planTitle ?? "(미정)"}`,
    input.planType ? `문서 유형: ${input.planType} — 이 용도에 맞는 관점과 강조점으로 서술하세요.` : "",
    `챕터: ${input.chapter.title}`,
    `작성할 섹션: ${input.section.title}`,
    `섹션 목적: ${input.section.summary}`,
    input.priorSummary ? `\n[앞서 작성한 섹션 요약]\n${input.priorSummary}` : "",
    "\n[이 섹션 사용자 답변]",
    formatAnswers(input.answers),
    input.financialsMarkdown
      ? [
          "\n[계산된 재무 데이터 — 사용자 입력에 산식을 적용한 확정 수치]",
          input.financialsMarkdown,
          "\n위 재무 표는 이미 계산이 끝난 확정 자료입니다. 표를 **그대로 본문에 포함**하고, 숫자를 임의로 바꾸거나 새로 만들지 마세요.",
          "표 앞뒤에 그 수치가 무엇을 뜻하는지, 어떤 점을 주의해야 하는지 해석을 덧붙이세요.",
        ].join("\n")
      : "",
    formatConflicts(input.conflicts),
    "\n위 사업 정보와 답변만 근거로, 이 섹션의 본문을 소제목으로 구조화해 작성하세요. 근거 없는 값은 '추가 정의 필요'로 표기하세요.",
    input.priorSummary
      ? "앞서 작성한 섹션과 용어·숫자·전략 방향이 어긋나지 않게 하고, 같은 내용을 그대로 반복하지 말고 이 섹션의 관점에서 이어서 쓰세요."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 키가 없을 때 쓰는 결정론적 폴백 — 답변으로 구조화된 본문을 만든다(데모 동작 보장). */
export function fallbackSection(input: SectionGenInput): string {
  const { section, answers } = input;
  const answered = Object.entries(answers).filter(([, v]) => v != null && v !== "");
  const parts: string[] = [];
  parts.push(`## ${section.title} 개요`);
  parts.push(`이 섹션은 ${section.summary}을(를) 다룹니다. 아래 내용은 입력하신 답변을 바탕으로 정리한 초안이며, 근거가 필요한 항목은 '추가 정의 필요'로 표시했습니다.`);
  if (answered.length) {
    parts.push(`## 입력 기반 정리`);
    const rows = ["| 항목 | 입력 내용 | 상태 |", "| --- | --- | --- |"];
    for (const [k, v] of answered) {
      const val = Array.isArray(v) ? v.join(", ") : String(v);
      rows.push(`| ${k} | ${val} | 확인됨 |`);
    }
    parts.push(rows.join("\n")); // 표는 한 블록으로(행 사이 단일 줄바꿈)
  }
  if (input.financialsMarkdown) {
    parts.push(`## 재무 계산`);
    parts.push(input.financialsMarkdown);
  }
  if (input.conflicts?.length) {
    parts.push(`## 확정 필요 — 답변이 서로 어긋난 부분`);
    parts.push(input.conflicts.map((c) => `- **${c.title}** — ${c.detail}`).join("\n"));
  }
  parts.push(`## 추가 정의 필요 영역`);
  parts.push(`시장 규모, 경쟁사 비교 수치, 고객 검증 데이터 등은 실제 조사·증빙이 연결될 때 확정합니다. 현재 초안에서는 가정으로만 다루며, 제출 전 실제 값으로 교체합니다.`);
  return parts.join("\n\n");
}

/**
 * 섹션 본문(마크다운) 생성. config가 없으면(키 미설정) 폴백을 반환.
 */
export async function generateSection(config: LLMConfig | null, input: SectionGenInput): Promise<{ markdown: string; source: "ai" | "fallback" }> {
  if (!config) {
    return { markdown: fallbackSection(input), source: "fallback" };
  }
  const text = await completeText(config, {
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(input),
    maxOutputTokens: 4000,
    effort: "medium",
  });
  if (!text || text.trim().length < 40) {
    return { markdown: fallbackSection(input), source: "fallback" };
  }
  return { markdown: text.trim(), source: "ai" };
}
