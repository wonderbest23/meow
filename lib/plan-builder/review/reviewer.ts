/*
 * Reviewer — 사업계획서를 사업 컨설턴트 관점에서 한 번에 검토한다.
 *
 * 25개 섹션마다 부르지 않는다. 한 번에 문서 전체 + 원천 자료(확정 맥락·추정·공식 근거·
 * 계산된 재무·코드가 확정한 문제)를 넘겨, "문장이 좋아 보이는가"가 아니라
 * "본문이 원천 자료와 맞는가"를 보게 한다.
 *
 * Reviewer 는 숫자를 새로 만들 수 없다. 문제를 풀기 위해 시장규모·가격·경쟁사를
 * 지어내는 순간 검토의 의미가 사라지기 때문에, 프롬프트에서 반복해 막고
 * 출력은 Zod 로 걸러 낸다. 실패해도 사업계획서 기능은 막히지 않는다(부가기능).
 */
import { completeText, parseJsonObject, type LLMConfig } from "../../llm/complete";
import { financialsToReference } from "../financials";
import { toPromptEvidence } from "../market-research";
import type { MarketEvidence } from "../../market/domain";
import type { PlanBusinessContext } from "../context/build";
import type { DeterministicResult } from "./deterministic";
import {
  REVIEW_DIMENSIONS,
  REVIEW_VERSION,
  normalizeReviewOutput,
  salvageTruncatedJson,
  sortIssues,
  type BusinessPlanReview,
  type ReviewIssue,
} from "./domain";

/** 문서 전체를 그대로 넘기는 상한. 넘으면 섹션을 요약한다 */
const FULL_DOC_LIMIT = 60_000;
/** 요약할 때 섹션 하나에 허용하는 길이 */
const DIGEST_PER_SECTION = 1_400;

export const REVIEWER_SYSTEM = [
  "당신은 한국의 소상공인·스타트업 사업계획서를 검토하는 선임 사업전략가입니다.",
  "",
  "당신의 역할은 사업 성공을 예측하는 것이 아니라, 현재 사업계획서가 사용자가 제공한 사실과 계산된 자료에 근거해 논리적이고 실행 가능하게 작성되었는지 검토하는 것입니다.",
  "'이 사업은 성공하기 어렵다' 같은 사업 자체에 대한 단정은 하지 마세요. 대신 '어떤 정보가 없어서 무엇을 뒷받침하지 못하는지'를 쓰세요.",
  "",
  "[절대 규칙]",
  "- 새로운 시장규모·가격·매출·고객 수·성장률·경쟁사 실명·수상·특허·제휴·성과를 만들어 문제를 해결하지 마세요. 개선 방법에도 지어낸 숫자나 업체명을 넣지 마세요.",
  "- 재무 수치를 다시 계산하지 마세요. [계산된 재무]에 있는 값만 인용하세요.",
  "- [코드가 이미 확정한 문제] 목록은 검증된 사실입니다. 반박하거나 '문제 없다'고 판단하지 마세요. 같은 문제를 다시 만들어 중복시키지도 마세요.",
  "- 문제가 없으면 억지로 만들지 마세요. 좋은 문서에 대해 issue 를 적게 내는 것은 실패가 아닙니다.",
  "- 문장 취향(어투·문체)보다 사업의 논리와 사실관계를 우선하세요.",
  "",
  "[사실 신뢰성 검토 — 가장 중요합니다]",
  "본문에 나오는 사실과 숫자를 [사용자가 제공한 사실]·[공식 시장 근거]·[계산된 재무]와 대조하세요.",
  "이 자료 어디에도 없는데 본문이 확정형으로 서술하고 있으면 category=\"fact_safety\" 로 잡으세요.",
  "다만 다음은 환각이 아닙니다: 확정 단가를 이용한 명시적 시나리오 계산(예: \"유료고객이 100명이라면 월 매출은 190만원\"), 일반적인 기간 표현(12개월·첫 3개월), '~할 계획이다/~로 예상한다' 같은 조건형·계획형 서술.",
  "반면 근거 없이 \"12개월 후 고객 300명을 확보한다\"처럼 단정하면 문제입니다.",
  "",
  "[공식 근거 해석]",
  "공공 통계는 시장 환경을 보여주는 참고지표이지 우리 고객 수가 아닙니다.",
  "예를 들어 '양육가구 100만'을 '잠재 고객 100만 명'으로 옮겨 적었다면 category=\"market_evidence\" 로 잡으세요.",
  "'구매 가능 규모는 별도 검증이 필요하다'처럼 한계를 밝혔다면 정상입니다.",
  "",
  "[차별점 검토]",
  "'품질', '친절', '가격 경쟁력', '고객 만족', '맞춤형' 같은 표현만으로 차별점이 서술되어 있으면 경쟁 대안과 구분되지 않습니다. 무엇을 기준으로 어떻게 다른지가 없으면 category=\"competition\" 으로 잡으세요.",
  "",
  "[개선 방법]",
  "critical·warning 에는 반드시 구체적인 개선 방법을 쓰세요.",
  "나쁜 예: '시장조사를 더 해야 합니다.'",
  "좋은 예: '목표 지역에서 유사 클래스 3~5곳의 가격·후기 수·예약 가능 일정을 조사해 비교표를 추가하세요.'",
  "단 실제 업체명·가격을 지어내서 예시로 쓰지 마세요.",
  "",
  "[requiresUserInput / autoFixable]",
  "- requiresUserInput=true: 사용자가 새 정보를 줘야 풀리는 문제(대표자 경력 없음, 생산 능력 미입력 등)",
  "- autoFixable=true: 이미 있는 자료만으로 본문을 고쳐 풀 수 있는 문제(같은 내용 반복, 근거를 과장한 표현 완화 등)",
  "- 둘 다 false 일 수 있고, 둘 다 true 일 수는 없습니다.",
  "",
  "[점수]",
  "overallQualityScore 는 '사업계획서 완성도'(0~100)입니다. 정부지원 선정 가능성·투자 성공률·대출 승인 가능성·사업 성공 확률이 아닙니다. 그런 의미로 쓰거나 서술하지 마세요.",
  `dimensions 는 아래 7개 id 를 모두 0~5 점으로 채우세요: ${REVIEW_DIMENSIONS.map((d) => `${d.id}(${d.label} — ${d.hint})`).join(" / ")}`,
  "",
  "[출력]",
  "설명이나 코드펜스 없이 JSON 객체 하나만 출력하세요. 형식:",
  '{"overallQualityScore":0~100,',
  ' "dimensions":[{"id":"structure","score":0~5,"reason":"한 줄"}, …7개],',
  ' "issues":[{"severity":"critical|warning|improvement","category":"business_model|customer|problem_solution|competition|marketing|operation|finance|market_evidence|fact_safety|consistency|writing","sectionKey":"overview/summary","title":"짧은 제목","problem":"무엇이 문제인가","whyItMatters":"왜 중요한가","evidence":["본문 인용이나 근거"],"recommendation":"무엇을 확인하거나 고치면 되는가","requiresUserInput":true,"autoFixable":false}],',
  ' "strengths":["잘 된 점"], "topPriorities":["가장 먼저 볼 것"], "summary":"두세 문장"}',
  "issues 는 중요한 것부터 최대 8개까지만 쓰세요. 사소한 것을 채워 넣지 마세요.",
  "problem 은 2문장 이내, whyItMatters 는 1문장, recommendation 은 2문장 이내, evidence 는 2개 이내로 쓰세요. 길게 쓰면 응답이 잘려 검토 전체가 버려집니다.",
  "모든 문장은 한국어 존댓말로, 창업자가 바로 행동할 수 있게 쓰세요.",
].join("\n");

function fieldLines(ctx: PlanBusinessContext): { confirmed: string[]; inferred: string[] } {
  const confirmed: string[] = [];
  const inferred: string[] = [];
  const groups: Array<[string, Record<string, { value: unknown; status: string } | undefined>]> = [
    ["사업", ctx.identity as never], ["분류", ctx.classification as never], ["고객", ctx.customer as never],
    ["문제", ctx.problem as never], ["해결", ctx.solution as never], ["수익", ctx.revenue as never],
    ["운영", ctx.operations as never], ["마케팅", ctx.marketing as never], ["경쟁", ctx.competition as never],
    ["성과", ctx.traction as never], ["팀", ctx.team as never], ["자금", ctx.funding as never], ["목표", ctx.goals as never],
  ];
  for (const [label, group] of groups) {
    for (const [key, f] of Object.entries(group)) {
      if (!f || f.value == null || f.status === "unknown") continue;
      const v = Array.isArray(f.value) ? f.value.join(", ") : String(f.value);
      if (!v.trim()) continue;
      (f.status === "confirmed" ? confirmed : inferred).push(`- ${label}·${key}: ${v}`);
    }
  }
  return { confirmed, inferred };
}

/** 길면 줄이되 숫자·표·소제목은 남긴다 — 검토의 근거가 사라지면 안 된다 */
export function digestSection(markdown: string, limit = DIGEST_PER_SECTION): string {
  if (markdown.length <= limit) return markdown;
  const keep: string[] = [];
  const rest: string[] = [];
  for (const line of markdown.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#") || t.startsWith("|") || t.startsWith("-") || /\d/.test(t)) keep.push(line);
    else rest.push(line);
  }
  let out = keep.join("\n");
  for (const line of rest) {
    if (out.length + line.length > limit) break;
    out += `\n${line}`;
  }
  return `${out.slice(0, limit)}\n…(이하 생략 — 숫자·표·소제목은 위에 모두 포함)`;
}

/*
 * 사용자가 답한 원문.
 *
 * 없으면 안 된다. PlanBusinessContext 는 골라 담은 요약이라, 본문이 인용한 답변이
 * 거기 없으면 Reviewer 가 "확정 사실에 없다"며 정상 서술을 환각으로 잡는다.
 * 운영 실측에서 실제로 그랬다(knows_breakeven·asset_own 을 근거 없는 값으로 지목).
 * 사실 대조의 기준선은 Writer 가 받은 것과 같아야 한다.
 */
function answerLines(answers: Record<string, Record<string, unknown>>): string[] {
  const out: string[] = [];
  for (const [sectionKey, map] of Object.entries(answers)) {
    if (sectionKey.startsWith("__") || sectionKey.includes("__review")) continue;
    for (const [qid, value] of Object.entries(map ?? {})) {
      if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
      const v = Array.isArray(value) ? value.join(", ") : String(value);
      out.push(`- ${sectionKey}.${qid}: ${v === "yes" ? "예" : v === "no" ? "아니오" : v.slice(0, 200)}`);
    }
  }
  return out;
}

export interface ReviewerInput {
  planTitle: string;
  planType?: string;
  business: { name?: string; description?: string; industry?: string; region?: string; stage?: string };
  /** 생성된 본문 — key = `${chapter}/${section}` */
  sections: Array<{ key: string; title: string; markdown: string }>;
  /** 사용자가 답한 원문 — 사실 대조의 기준선 */
  answers?: Record<string, Record<string, unknown>>;
  evidence: MarketEvidence[];
  deterministic: DeterministicResult;
}

export function buildReviewerPrompt(input: ReviewerInput): string {
  const { deterministic: det } = input;
  const { confirmed, inferred } = fieldLines(det.context);
  const total = input.sections.reduce((n, s) => n + s.markdown.length, 0);
  const digest = total > FULL_DOC_LIMIT;

  const parts: string[] = [];
  parts.push(
    "[검토 대상]",
    `사업명: ${input.business.name || input.planTitle}`,
    input.planType ? `문서 유형: ${input.planType}` : "",
    input.business.industry ? `업종: ${input.business.industry}` : "",
    input.business.region ? `지역: ${input.business.region}` : "",
    input.business.stage ? `진행 단계: ${input.business.stage}` : "",
    input.business.description ? `사업 설명(사용자 원문): ${input.business.description}` : "",
  );

  parts.push("", "[사용자가 제공한 사실 — 확정]", confirmed.length ? confirmed.join("\n") : "- (없음)");

  const raw = answerLines(input.answers ?? {});
  if (raw.length) {
    parts.push(
      "",
      "[사용자가 질문에 답한 원문 — 전부 확정 사실입니다]",
      ...raw,
      "본문이 위 답변을 인용하는 것은 정상입니다. 환각으로 잡지 마세요.",
    );
  }

  if (det.context.metrics.length) {
    parts.push(
      "",
      "[사용자가 확인한 사업 지표 — 확정]",
      ...det.context.metrics.map((m) => `- ${m.label}: ${m.value}${m.unit && !m.value.includes(m.unit) ? m.unit : ""}${m.source === "calculation" ? " (계산값·사용자 확인함)" : ""}`),
    );
  }

  parts.push(
    "",
    "[AI 추정 참고정보 — 사용자가 확인하지 않음]",
    inferred.length ? inferred.join("\n") : "- (없음)",
    "본문이 위 추정을 확정 사실처럼 서술하고 있으면 fact_safety 문제입니다.",
  );

  const ev = toPromptEvidence(input.evidence);
  parts.push(
    "",
    "[공식 시장 근거]",
    ev.length
      ? ev.map((e, i) => `${i + 1}. ${e.metric}: ${e.value}${e.unit ?? ""} — ${e.sourceName} (${e.observedAt || "기준일 미상"})`).join("\n")
      : "- (연결된 근거 없음. 본문이 외부 통계를 인용하고 있다면 출처가 어디인지 확인이 필요합니다)",
  );

  const finRef = det.financials ? financialsToReference(det.financials) : "";
  parts.push("", "[계산된 재무 — 시스템이 사용자 입력에 산식을 적용한 값]", finRef || "- (계산에 필요한 입력이 부족해 산출되지 않음)");
  if (det.capacity) parts.push(`- 확인된 운영 상한: 월 ${det.capacity.value.toLocaleString("ko-KR")}건 (${det.capacity.basis})`);

  parts.push(
    "",
    "[코드가 이미 확정한 문제 — 검증됨. 반박·중복 금지]",
    det.issues.length
      ? det.issues.map((i) => `- [${i.severity}/${i.category}] ${i.title}: ${i.problem}`).join("\n")
      : "- (없음)",
  );

  parts.push("", `[사업계획서 본문]${digest ? " (길어서 각 섹션을 줄였습니다 — 숫자·표·소제목은 그대로입니다)" : ""}`);
  for (const s of input.sections) {
    parts.push("", `### ${s.key} — ${s.title}`, digest ? digestSection(s.markdown) : s.markdown);
  }

  parts.push(
    "",
    "위 원천 자료와 본문을 대조해 검토 결과를 JSON 객체 하나로 출력하세요.",
    "sectionKey 는 위 본문에 나온 `챕터/섹션` 형식 키를 그대로 쓰세요.",
  );
  return parts.filter((l) => l !== "").join("\n");
}

/** deterministic 과 AI 문제를 합친다 — 확정 문제가 앞이고, 비슷한 AI 문제는 버린다 */
export function mergeIssues(det: ReviewIssue[], ai: ReviewIssue[]): ReviewIssue[] {
  const seen = det.map((d) => `${d.category}|${d.sectionKey ?? ""}`);
  const kept = ai.filter((a) => {
    // 같은 카테고리·같은 섹션의 문제를 코드가 이미 확정했다면 AI 판단은 중복으로 본다
    if (a.category === "consistency") return false;
    return !seen.includes(`${a.category}|${a.sectionKey ?? ""}`);
  });
  return sortIssues([...det, ...kept]);
}

/**
 * 검토 실행. LLM 이 실패하면 deterministic 결과만으로 보고서를 만든다.
 * 어떤 경우에도 예외를 던지지 않는다 — 검토는 부가기능이고, 문서 생성·다운로드를 막으면 안 된다.
 */
export async function reviewPlan(
  config: LLMConfig | null,
  input: ReviewerInput,
): Promise<{ review: BusinessPlanReview; source: "ai" | "deterministic" }> {
  const det = input.deterministic.issues;
  const knownSections = new Set(input.sections.map((s) => s.key));

  let ai: ReturnType<typeof normalizeReviewOutput> = null;
  if (config && input.sections.length) {
    const text = await completeText(config, {
      kind: "plan-review",
      system: REVIEWER_SYSTEM,
      user: buildReviewerPrompt(input),
      /*
       * 출력 상한.
       *
       * 처음에는 6,000 이었는데 운영에서 재 보니 out=6000 으로 정확히 상한에 걸렸다 —
       * 다 쓰고 멈춘 게 아니라 잘린 것이고, 잘린 JSON 은 파싱에 실패해 검토가 통째로 버려졌다.
       * 한국어로 문제 8건을 근거·개선방법까지 쓰면 6,000 에 들어가지 않는다.
       * 넉넉히 두어도 할 말을 마치면 그만 쓰므로 평소 비용은 거의 그대로다.
       */
      maxOutputTokens: 16_000,
      effort: "medium",
      jsonObject: true,
      cache: true,
      timeoutMs: 150_000,
    }).catch(() => null);
    /*
     * 잘려도 살린다.
     * 출력이 상한에 걸리면 JSON 이 닫히지 않아 통째로 버려졌다(운영 실측 2회).
     * 정상 파싱을 먼저 해 보고, 실패하면 완결된 부분까지 복구해 쓴다.
     */
    let obj = text ? parseJsonObject(text) : null;
    if (!obj && text) {
      obj = salvageTruncatedJson(text);
      if (obj) console.warn("[review] 응답이 잘려 완결된 부분만 복구했습니다");
    }
    ai = obj ? normalizeReviewOutput(obj, knownSections) : null;
    if (text && !ai) console.error("[review] LLM 응답을 쓰지 못해 확정 문제만으로 보고서를 만듭니다");
  }

  if (!ai) {
    return { review: fallbackReview(det), source: "deterministic" };
  }

  const issues = mergeIssues(det, ai.issues);
  return {
    review: {
      version: REVIEW_VERSION,
      overallQualityScore: ai.score,
      dimensions: ai.dimensions,
      issues,
      strengths: ai.strengths,
      topPriorities: ai.topPriorities.length ? ai.topPriorities : issues.filter((i) => i.severity === "critical").slice(0, 3).map((i) => i.title),
      summary: ai.summary,
    },
    source: "ai",
  };
}

/** AI 없이 만드는 최소 보고서 — 확정 문제만 보여 준다. 점수는 매기지 않는다(0이 아니라 '미산출') */
export function fallbackReview(det: ReviewIssue[]): BusinessPlanReview {
  const sorted = sortIssues(det);
  return {
    version: REVIEW_VERSION,
    overallQualityScore: -1,
    dimensions: [],
    issues: sorted,
    strengths: [],
    topPriorities: sorted.filter((i) => i.severity === "critical").slice(0, 3).map((i) => i.title),
    summary:
      sorted.length > 0
        ? `AI 검토를 완료하지 못해, 시스템이 확인한 문제 ${sorted.length}건만 보여 드립니다. 잠시 후 다시 검토해 보세요.`
        : "AI 검토를 완료하지 못했습니다. 시스템이 자동으로 확인하는 항목에서는 문제가 발견되지 않았습니다.",
  };
}
