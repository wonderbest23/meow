/*
 * 사업 검토(Reviewer) — 타입·검증·보관 판정.
 *
 * Reviewer 는 심사위원이 아니라 사업계획서를 같이 읽어 주는 컨설턴트다.
 * 사업의 성공 여부를 예측하지 않고, "지금 문서가 사용자가 준 사실·계산값과
 * 맞물려 있는가"만 본다. 그래서 점수 이름도 '완성도'이고, 합격 가능성이 아니다.
 *
 * 두 종류의 문제가 한 보고서에 담긴다.
 *  - deterministic: 코드가 이미 확실히 아는 것(정합성·재무·capacity). 추측이 아니다.
 *  - ai: 위 자료와 본문을 대조해 LLM 이 찾은 것.
 * LLM 은 deterministic 결과를 뒤집을 수 없다(프롬프트에서 명시하고, 병합 시 앞에 둔다).
 */
import { z } from "zod";

/** 이 스키마 버전 — 저장된 보고서를 읽을 때 맞지 않으면 버린다 */
export const REVIEW_VERSION = "general-review-v1";

/** plan.answers 안의 가상 섹션 키 (분석과 같은 방식 — DB 마이그레이션 없음) */
export const REVIEW_KEY = "__review";

export type ReviewSeverity = "critical" | "warning" | "improvement";

export type ReviewCategory =
  | "business_model"
  | "customer"
  | "problem_solution"
  | "competition"
  | "marketing"
  | "operation"
  | "finance"
  | "market_evidence"
  | "fact_safety"
  | "consistency"
  | "writing";

export const REVIEW_CATEGORY_LABEL: Record<ReviewCategory, string> = {
  business_model: "사업 구조",
  customer: "고객",
  problem_solution: "문제와 해결",
  competition: "경쟁·차별점",
  marketing: "고객 확보",
  operation: "운영 가능성",
  finance: "재무",
  market_evidence: "시장 근거",
  fact_safety: "사실 신뢰성",
  consistency: "일관성",
  writing: "문서 품질",
};

export const SEVERITY_LABEL: Record<ReviewSeverity, string> = {
  critical: "먼저 고쳐야 할 것",
  warning: "보완하면 좋은 것",
  improvement: "다듬을 것",
};

export interface ReviewIssue {
  id: string;
  severity: ReviewSeverity;
  category: ReviewCategory;
  /** 관련 섹션 키 (`overview/summary`) — 화면이 바로 이동시킨다 */
  sectionKey?: string;
  title: string;
  /** 무엇이 문제인가 */
  problem: string;
  /** 왜 중요한가 */
  whyItMatters: string;
  /** 판단 근거 — 본문 인용, 계산값, 사용자 답변 */
  evidence: string[];
  /** 무엇을 확인하거나 고치면 되는가 */
  recommendation: string;
  /** 사용자가 새 정보를 줘야 풀리는 문제인가 */
  requiresUserInput: boolean;
  /** 있는 자료만으로 본문을 고쳐 풀 수 있는 문제인가 (다음 단계 Repair 대상) */
  autoFixable: boolean;
  /** 이 문제를 누가 찾았는가 — 코드가 확정한 것과 AI 판단을 구분해 보여준다 */
  origin: "deterministic" | "ai";
}

export interface ReviewDimension {
  id: string;
  label: string;
  /** 0~5 */
  score: number;
  reason: string;
}

export interface BusinessPlanReview {
  version: string;
  /** 0~100 — 사업계획서 '완성도'다. 선정·투자·대출 가능성이 아니다 */
  overallQualityScore: number;
  dimensions: ReviewDimension[];
  issues: ReviewIssue[];
  strengths: string[];
  topPriorities: string[];
  summary: string;
}

/** 저장 레코드 — 본문이 바뀌면 낡은 것으로 판정해야 한다 */
export interface ReviewRecord {
  version: string;
  reviewedAt: string;
  /** 어느 플랜에서 만든 보고서인가 — 답변 이어받기로 복사돼 와도 여기서 걸린다 */
  planId: string;
  /** 검토한 본문의 지문 */
  contentHash: string;
  result: BusinessPlanReview;
}

/* ───────── 평가 차원 (7개 고정) ───────── */

export const REVIEW_DIMENSIONS: Array<{ id: string; label: string; hint: string }> = [
  { id: "structure", label: "사업 구조 명확성", hint: "고객·문제·해결·수익모델이 하나로 이어지는가" },
  { id: "market", label: "시장·고객 근거", hint: "타깃이 구체적이고 근거가 뒷받침하는가" },
  { id: "differentiation", label: "차별성", hint: "경쟁 대안 대비 고를 이유가 있는가" },
  { id: "feasibility", label: "실행 가능성", hint: "인력·공간·시간으로 목표를 감당할 수 있는가" },
  { id: "finance", label: "수익성·재무 논리", hint: "계산된 재무와 계획이 맞물리는가" },
  { id: "marketing", label: "마케팅 현실성", hint: "고객을 어떻게 데려올지가 구체적인가" },
  { id: "trust", label: "문서 일관성·신뢰성", hint: "모순·근거 없는 사실·반복이 없는가" },
];

const DIMENSION_IDS = new Set(REVIEW_DIMENSIONS.map((d) => d.id));

/* ───────── Zod — LLM 출력 검증 ───────── */

const severity = z.enum(["critical", "warning", "improvement"]);
const category = z.enum([
  "business_model", "customer", "problem_solution", "competition", "marketing",
  "operation", "finance", "market_evidence", "fact_safety", "consistency", "writing",
]);

/** 문제 하나 — 여기서 걸리면 그 문제만 버린다(보고서 전체를 잃지 않는다) */
export const reviewIssueSchema = z.object({
  severity,
  category,
  sectionKey: z.string().max(60).optional(),
  title: z.string().min(2).max(80),
  problem: z.string().min(5).max(600),
  whyItMatters: z.string().min(5).max(400),
  evidence: z.array(z.string().max(300)).max(5).optional(),
  recommendation: z.string().min(5).max(700),
  requiresUserInput: z.boolean().optional(),
  autoFixable: z.boolean().optional(),
});

/*
 * 바깥 껍데기는 느슨하게 받는다.
 * 문제 하나의 설명이 짧다고 나머지 열한 개까지 버리면, 쓸 만한 검토를 통째로 잃는다.
 * 형식이 어긋난 항목만 걸러 내고 나머지는 살린다.
 */
export const reviewOutputSchema = z.object({
  overallQualityScore: z.number().min(0).max(100),
  dimensions: z.array(z.unknown()).max(40).optional(),
  issues: z.array(z.unknown()).max(60).optional(),
  // 길이는 여기서 막지 않고 normalize 에서 자른다 — 요약이 길다고 검토를 통째로 버릴 이유가 없다
  strengths: z.array(z.string()).optional(),
  topPriorities: z.array(z.string()).optional(),
  summary: z.string().optional(),
});

function cut(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

/*
 * 잘린 JSON 복구.
 *
 * 한국어 검토는 출력이 길어 상한에 걸리는 일이 실제로 있었다(운영 실측 out=6000, out=10000).
 * 잘린 응답을 통째로 버리면 다 쓴 문제 여섯 개까지 함께 잃는다.
 * 마지막으로 완결된 값까지만 남기고 열린 괄호를 닫아 되살린다.
 */
export function salvageTruncatedJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  const body = text.slice(start);
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let cutAt = -1;
  let cutStack: string[] = [];
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") { stack.push(ch === "{" ? "}" : "]"); continue; }
    if (ch === "}" || ch === "]") {
      stack.pop();
      // 값 하나가 완결된 지점 — 여기까지는 안전하게 살릴 수 있다
      cutAt = i + 1;
      cutStack = [...stack];
    }
  }
  if (cutAt < 0 || !cutStack.length) return null;
  const repaired = body.slice(0, cutAt).replace(/,\s*$/, "") + cutStack.reverse().join("");
  try {
    const parsed = JSON.parse(repaired) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const dimensionSchema = z.object({ id: z.string().max(40), score: z.number().min(0).max(5), reason: z.string().max(300).optional() });

/**
 * LLM 출력 → 검증된 issue·dimension.
 * 스키마에 어긋나면 null — 호출부는 deterministic 결과만으로 보고서를 만든다(부가기능이므로 막지 않는다).
 */
export function normalizeReviewOutput(
  input: unknown,
  knownSections: ReadonlySet<string>,
): { issues: ReviewIssue[]; dimensions: ReviewDimension[]; strengths: string[]; topPriorities: string[]; summary: string; score: number } | null {
  const parsed = reviewOutputSchema.safeParse(input);
  if (!parsed.success) {
    // 왜 버렸는지 남긴다 — 운영에서 조용히 폴백되면 원인을 찾을 수 없다
    console.error("[review] 출력 검증 실패:", parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join(" / "));
    return null;
  }
  const r = parsed.data;

  // 형식이 맞는 문제만 남긴다. 최대 12개 — 화면이 감당할 수 있는 양이다
  const valid = (r.issues ?? [])
    .map((raw) => reviewIssueSchema.safeParse(raw))
    .filter((p): p is { success: true; data: z.infer<typeof reviewIssueSchema> } => p.success)
    .map((p) => p.data)
    .slice(0, 12);

  const issues: ReviewIssue[] = valid.map((it, i) => ({
    id: `ai-${i + 1}`,
    severity: it.severity,
    category: it.category,
    // 모르는 섹션 키를 화면이 링크로 만들면 빈 화면으로 보낸다 — 아는 키만 남긴다
    ...(it.sectionKey && knownSections.has(it.sectionKey) ? { sectionKey: it.sectionKey } : {}),
    title: it.title.trim(),
    problem: it.problem.trim(),
    whyItMatters: it.whyItMatters.trim(),
    evidence: (it.evidence ?? []).map((e) => e.trim()).filter(Boolean),
    recommendation: it.recommendation.trim(),
    requiresUserInput: it.requiresUserInput ?? false,
    autoFixable: it.autoFixable ?? false,
    origin: "ai",
  }));

  const dims = (r.dimensions ?? [])
    .map((raw) => dimensionSchema.safeParse(raw))
    .filter((p): p is { success: true; data: z.infer<typeof dimensionSchema> } => p.success)
    .map((p) => p.data);
  const byId = new Map(dims.map((d) => [d.id, d]));
  const dimensions: ReviewDimension[] = REVIEW_DIMENSIONS.map((d) => {
    const got = byId.get(d.id);
    return { id: d.id, label: d.label, score: got ? clamp(got.score, 0, 5) : 0, reason: got?.reason?.trim() || "판단 근거가 제공되지 않았습니다." };
  });
  // 목록 밖 차원은 버린다 — 항목이 마음대로 늘어나면 화면이 매번 달라진다
  void DIMENSION_IDS;

  return {
    issues,
    dimensions,
    strengths: (r.strengths ?? []).map((s) => cut(s, 200)).filter(Boolean).slice(0, 6),
    topPriorities: (r.topPriorities ?? []).map((s) => cut(s, 200)).filter(Boolean).slice(0, 5),
    summary: cut(r.summary ?? "", 600),
    score: clamp(Math.round(r.overallQualityScore), 0, 100),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n * 10) / 10));
}

/* ───────── 본문 지문 · 낡음 판정 ───────── */

/** FNV-1a 32bit — 외부 의존 없이 서버·브라우저에서 같은 값이 나온다 */
export function contentHash(sections: Record<string, { markdown?: string } | undefined>): string {
  let h = 0x811c9dc5;
  const keys = Object.keys(sections).filter((k) => (sections[k]?.markdown ?? "").trim()).sort();
  const payload = `${REVIEW_VERSION} ${keys.map((k) => `${k} ${sections[k]!.markdown}`).join("")}`;
  for (let i = 0; i < payload.length; i += 1) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + "-" + keys.length;
}

export interface ReviewState {
  status: "none" | "stale" | "fresh";
  record: ReviewRecord | null;
}

/**
 * 저장된 보고서를 읽고 지금 본문에 유효한지 판정한다.
 *
 * 낡음으로 보는 경우:
 *  - 스키마 버전이 다름
 *  - 다른 플랜에서 만든 보고서(답변 이어받기로 복사돼 온 것)
 *  - 검토한 뒤 본문이 바뀜
 * 낡은 보고서를 최신인 것처럼 보여 주면 사용자가 이미 고친 문제를 다시 고치려 든다.
 */
export function readReview(
  answers: Record<string, Record<string, unknown>> | undefined,
  plan: { id: string; sections: Record<string, { markdown?: string } | undefined> },
): ReviewState {
  const raw = answers?.[REVIEW_KEY] as Partial<ReviewRecord> | undefined;
  if (!raw || typeof raw !== "object" || !raw.result || raw.version !== REVIEW_VERSION) return { status: "none", record: null };
  const record: ReviewRecord = {
    version: raw.version,
    reviewedAt: typeof raw.reviewedAt === "string" ? raw.reviewedAt : "",
    planId: typeof raw.planId === "string" ? raw.planId : "",
    contentHash: typeof raw.contentHash === "string" ? raw.contentHash : "",
    result: raw.result as BusinessPlanReview,
  };
  if (record.planId !== plan.id) return { status: "none", record: null };
  if (record.contentHash !== contentHash(plan.sections)) return { status: "stale", record };
  return { status: "fresh", record };
}

/** 심각도 순 정렬 — 화면과 topPriorities 가 같은 순서를 쓴다 */
const SEVERITY_ORDER: Record<ReviewSeverity, number> = { critical: 0, warning: 1, improvement: 2 };
export function sortIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return [...issues].sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    // 같은 심각도면 코드가 확정한 문제를 먼저 — 추측보다 확실하다
    if (a.origin !== b.origin) return a.origin === "deterministic" ? -1 : 1;
    return 0;
  });
}

export function countBySeverity(issues: ReviewIssue[]): Record<ReviewSeverity, number> {
  const out: Record<ReviewSeverity, number> = { critical: 0, warning: 0, improvement: 0 };
  for (const i of issues) out[i.severity] += 1;
  return out;
}
