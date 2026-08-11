// 섹션 단위 AI 생성기 — 답변을 프롬프트로 만들어 Claude/OpenAI가 그 섹션 본문(마크다운)을 생성.
// 리얼리티 게이트 철학 유지: 근거 없는 경쟁사 실명·시장수치·인터뷰를 지어내지 않고 "추가 정의 필요"로 표기.

import { completeText, streamText, type LLMConfig } from "../llm/complete";
import type { PlanChapterDef, PlanSectionDef } from "./blueprint";
import { questionsForSection } from "./questions";
import { planTypeGuidanceBlock } from "./plan-type-guidance";

const SYSTEM_PROMPT = [
  "당신은 한국에서 실제로 실행할 사업계획서의 한 섹션을 작성하는 선임 사업전략가입니다.",
  "이 작업은 소설·광고 창작이 아닙니다. 오직 사용자가 제공한 답변만 확정 사실로 사용할 수 있습니다.",
  "고객 인터뷰·설문·매출·시장규모·성장률·경쟁사 실명·수상·특허·제휴·후기를 절대 만들어내지 마세요.",
  "근거가 없는 수치나 주장은 반드시 '추가 정의 필요' 또는 '검증 필요'로 표기하고, 미래형·조건형 문장을 사용하세요.",
  "다만 그 표기를 문장마다 반복하지 마세요. 본문에서는 미확정임이 드러나게 서술만 하고, 섹션 끝에 '추가 정의 필요 항목' 목록 하나로 모으세요. 같은 표기가 한 섹션에 세 번을 넘으면 실패로 간주합니다.",
  "그 목록의 각 항목에는 '어디서 어떻게 확인하는지'를 한 줄로 붙이세요. 모른다고만 하는 문서는 읽는 사람이 다음 행동을 할 수 없습니다. 예: 상권·유동인구는 소상공인 상권정보시스템(sg.sbiz.or.kr), 업종·시장 통계는 KOSIS 국가통계포털, 임대료·설비 비용은 실제 견적서 2~3곳 비교, 인허가는 관할 시·군·구청 담당 부서 문의.",
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
  /** 계산된 재무표(마크다운) — 표·차트를 본문에 싣는 '한 섹션'에만 넘긴다 */
  financialsMarkdown?: string;
  /** 표 없이 핵심 수치만 — 다른 섹션이 같은 숫자를 인용할 때 쓴다 */
  financialsReference?: string;
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

/**
 * 시스템 프롬프트 조립 — 한 플랜의 25개 섹션에서 '글자 하나까지 똑같은' 부분만 담는다.
 *
 * 프롬프트 캐시는 앞에서부터 똑같은 만큼만 걸린다. 그래서 작성 규칙·사업 정보·
 * 문서 성격처럼 섹션이 바뀌어도 안 변하는 것을 전부 여기로 옮겼다.
 * 섹션마다 달라지는 것(챕터·질문 답변·앞 섹션 요약)은 사용자 쪽에 남는다.
 *
 * 여기에 섹션별로 달라지는 값을 넣으면 캐시가 통째로 무너진다 — 조용히,
 * 오류 없이. 이 함수에 무언가 추가할 때는 그게 25번 내내 같은지 먼저 확인할 것.
 */
export function sectionSystemPrompt(input: SectionGenInput): string {
  const biz = formatBusiness(input.business);
  return [
    SYSTEM_PROMPT,
    biz ? `\n[사업 정보]\n${biz}` : `\n사업명: ${input.planTitle ?? "(미정)"}`,
    planTypeGuidanceBlock(input.planType),
  ]
    .filter(Boolean)
    .join("\n");
}

/** 사용자 프롬프트 조립 (테스트에서 직접 확인할 수 있게 공개) */
export function buildUserPrompt(input: SectionGenInput): string {
  return [
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
          /*
           * 예전에는 표를 '그대로 옮겨 적으라'고 시켰다. 그러면 차트 펜스가
           * '코드펜스 금지' 규칙과 충돌해 AI가 임의로 떨어뜨리는 일이 생겼다.
           * 표·차트는 생성이 끝난 뒤 시스템이 본문 끝에 그대로 붙이므로,
           * AI는 해석만 쓴다.
           */
          "\n위 표와 그래프는 시스템이 본문 끝에 자동으로 붙입니다. 표·수치·그래프를 본문에 옮겨 적지 마세요.",
          "당신은 이 수치가 무엇을 뜻하는지, 어떤 가정 위에 서 있는지, 무엇을 주의해야 하는지 해석만 쓰세요.",
        ].join("\n")
      : "",
    input.financialsReference && !input.financialsMarkdown
      ? [
          "\n[계산된 재무 수치 — 참고용]",
          input.financialsReference,
          "\n이 숫자는 다른 섹션의 재무표에 이미 실려 있습니다.",
          "본문에 표나 그래프로 다시 옮기지 말고, 필요한 값만 문장 속에서 인용하세요.",
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

/** 받침 유무로 을/를을 고른다 — "구성을(를)" 같은 기계적 표기를 없앤다. */
function eulReul(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "를";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

/** 답변 값을 사람이 읽는 형태로 — yes/no는 예/아니오, 배열은 쉼표로 */
function readableValue(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => readableValue(x)).join(", ");
  const s = String(v);
  if (s === "yes") return "예";
  if (s === "no") return "아니오";
  return s;
}

/**
 * 확정 재무 블록(표+차트)을 본문 끝에 붙인다.
 * AI가 이미 12개월 표를 통째로 옮겨 적었다면(지시 위반) 중복을 피해 붙이지 않는다.
 */
export function appendFinancials(markdown: string, input: Pick<SectionGenInput, "financialsMarkdown">): string {
  const block = input.financialsMarkdown?.trim();
  if (!block) return markdown;
  const aiCopied = markdown.includes("| 1월 |") && markdown.includes("| 12월 |");
  if (aiCopied) return markdown;
  return `${markdown}\n\n${block}`;
}

/** 키가 없을 때 쓰는 결정론적 폴백 — 답변으로 구조화된 본문을 만든다(데모 동작 보장). */
export function fallbackSection(input: SectionGenInput): string {
  const { section, answers } = input;
  const answered = Object.entries(answers).filter(([, v]) => v != null && v !== "");
  const parts: string[] = [];
  parts.push(`## ${section.title} 개요`);
  parts.push(`이 섹션은 ${section.summary}${eulReul(section.summary)} 다룹니다. 아래 내용은 입력하신 답변을 바탕으로 정리한 초안이며, 근거가 필요한 항목은 '추가 정의 필요'로 표시했습니다.`);
  if (answered.length) {
    parts.push(`## 입력 기반 정리`);
    // 질문 ID(needs_assets)가 아니라 사용자가 본 질문 문구를 항목명으로 쓴다
    const labelOf = new Map(
      questionsForSection(`${input.chapter.id}/${section.id}`, section.title, input.planType)
        .flatMap((g) => g.questions)
        .map((q) => [q.id, q.q] as const),
    );
    const rows = ["| 항목 | 입력 내용 | 상태 |", "| --- | --- | --- |"];
    for (const [k, v] of answered) {
      rows.push(`| ${labelOf.get(k) ?? k} | ${readableValue(v)} | 확인됨 |`);
    }
    parts.push(rows.join("\n")); // 표는 한 블록으로(행 사이 단일 줄바꿈)
  }
  if (input.financialsMarkdown) {
    parts.push(`## 재무 계산`);
    parts.push(input.financialsMarkdown);
  } else if (input.financialsReference) {
    parts.push(`## 참고한 재무 수치`);
    parts.push(input.financialsReference);
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
 * 섹션 본문(마크다운) 생성.
 *
 * source의 뜻을 셋으로 나눈다 — 예전에는 둘을 뭉뚱그려 사고를 못 봤다.
 *  - ai:       모델이 쓴 본문
 *  - fallback: 키 자체가 없다(로컬 개발). 답변을 표로 정리해 돌려준다
 *  - failed:   키는 있는데 호출이 실패했다. 운영 사고이므로 본문을 만들지 않는다
 *
 * 예전에는 실패해도 fallback을 200으로 돌려줬고, 화면은 그걸 그대로 저장해
 * '완료'로 표시했다. 결제한 사람이 AI가 쓴 글 대신 표를 받고도 알 수 없었다.
 */
export async function generateSection(config: LLMConfig | null, input: SectionGenInput): Promise<{ markdown: string; source: "ai" | "fallback" | "failed" }> {
  if (!config) {
    return { markdown: fallbackSection(input), source: "fallback" };
  }
  const text = await completeText(config, {
    kind: "generate",
    system: sectionSystemPrompt(input),
    user: buildUserPrompt(input),
    maxOutputTokens: 4000,
    effort: "medium",
    // 한 플랜당 25번 부른다 — 앞부분을 캐시에 올려 두면 24번은 읽기 요금만 낸다
    cache: true,
  });
  if (!text || text.trim().length < 40) {
    // 키가 있는데 못 받았다 = 사고. 표를 본문인 척 내주지 않는다
    return { markdown: "", source: "failed" };
  }
  return { markdown: appendFinancials(text.trim(), input), source: "ai" };
}

/**
 * 섹션 본문을 조각 단위로 흘려주며 생성한다.
 * 실시간으로 써지는 모습을 보여주기 위한 것으로, 최종 결과는 generateSection과 같다.
 */
export async function streamSection(
  config: LLMConfig | null,
  input: SectionGenInput,
  onDelta: (chunk: string) => void,
): Promise<{ markdown: string; source: "ai" | "fallback" | "failed" }> {
  if (!config) return { markdown: fallbackSection(input), source: "fallback" };
  const text = await streamText(
    config,
    { kind: "generate", system: sectionSystemPrompt(input), user: buildUserPrompt(input), maxOutputTokens: 4000, effort: "medium", cache: true },
    onDelta,
  );
  if (!text || text.trim().length < 40) return { markdown: "", source: "failed" };
  /*
   * 스트리밍 화면에는 재무 블록이 델타로 흐르지 않지만, 최종 저장본에는 붙는다.
   * 클라이언트는 마지막 done 페이로드의 markdown/html로 갈아끼우므로 문제없다.
   */
  return { markdown: appendFinancials(text.trim(), input), source: "ai" };
}
