/*
 * AI 호출 비용 — llm_usage 한 줄(토큰)을 달러·원으로 바꾼다.
 *
 * 요금은 100만 토큰당 달러(Anthropic 공개 요금). input_tokens 에는 캐시 몫이 이미 들어 있어,
 * 캐시가 아닌 입력 = input − cache_read − cache_write 로 나눠 각 요금을 곱한다.
 * 캐시 쓰기는 기본 5분 캐시 기준 입력 요금의 1.25배. 요금표에 없는 모델은 비용을 매기지 않고
 * '요금 미확인'으로 따로 센다(추정으로 섞지 않는다).
 *
 * 원화는 AI_COST_KRW_PER_USD(없으면 1,400원) 기준의 참고값 — 실제 청구는 카드사 환율을 따른다.
 */

export type ModelPrice = { input: number; output: number; cacheRead: number; cacheWrite: number };

const price = (input: number, output: number, cacheRead: number): ModelPrice => ({ input, output, cacheRead, cacheWrite: input * 1.25 });

/* 모델 id 앞부분으로 찾는다(날짜가 붙은 id 포함) */
export const MODEL_PRICES: Array<{ prefix: string; label: string; price: ModelPrice }> = [
  { prefix: "claude-opus-5-5", label: "Claude Opus 5.5", price: price(4, 20, 0.2) },
  { prefix: "claude-opus-5", label: "Claude Opus 5", price: price(5, 25, 0.5) },
  { prefix: "claude-fable-5-1", label: "Claude Fable 5.1", price: price(10, 50, 0.25) },
  { prefix: "claude-fable-5", label: "Claude Fable 5", price: price(10, 50, 1) },
];

export function priceFor(model: string | null | undefined): { label: string; price: ModelPrice } | null {
  const id = (model ?? "").trim().toLowerCase();
  if (!id) return null;
  // 더 긴(구체적인) 이름부터 — claude-opus-5-5 가 claude-opus-5 로 잡히지 않게
  return [...MODEL_PRICES].sort((a, b) => b.prefix.length - a.prefix.length).find((entry) => id.startsWith(entry.prefix)) ?? null;
}

export const DEFAULT_KRW_PER_USD = 1400;
export function krwPerUsd(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.AI_COST_KRW_PER_USD);
  return Number.isFinite(value) && value > 100 && value < 10000 ? value : DEFAULT_KRW_PER_USD;
}

export type UsageRow = {
  kind: string | null;
  model: string | null;
  ok: boolean | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
  plan_id?: string | null;
  created_at: string;
};

/*
 * 홈페이지 AI 수정은 호출 한 번에 두 줄이 남는다 — 공통 기록(모델·캐시 포함)과 토큰 차감용 줄
 * (plan_id 포함, 모델 없음, lib/landing/ai-tokens.ts). 비용은 공통 기록 한 줄로만 센다.
 * 홈페이지 AI 채우기 횟수 표시(landing-ai-fill-use, 토큰 0, lib/landing/ai-fill-usage.ts)도 호출이 아니다.
 */
export function isBillingDuplicate(row: UsageRow): boolean {
  return (row.kind === "landing-ai-edit" && !row.model) || row.kind === "landing-ai-fill-use";
}

/** 한 줄의 비용(달러). 요금표에 없는 모델이면 null */
export function rowCostUsd(row: UsageRow): number | null {
  const found = priceFor(row.model);
  if (!found) return null;
  const input = Math.max(0, Number(row.input_tokens) || 0);
  const output = Math.max(0, Number(row.output_tokens) || 0);
  const cacheRead = Math.max(0, Number(row.cache_read_tokens) || 0);
  const cacheWrite = Math.max(0, Number(row.cache_write_tokens) || 0);
  const plain = Math.max(0, input - cacheRead - cacheWrite);
  const { price: p } = found;
  return (plain * p.input + cacheRead * p.cacheRead + cacheWrite * p.cacheWrite + output * p.output) / 1_000_000;
}

type Bucket = { calls: number; failed: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; usd: number; unpriced: number };
const emptyBucket = (): Bucket => ({ calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, usd: 0, unpriced: 0 });
function add(bucket: Bucket, row: UsageRow, usd: number | null) {
  bucket.calls += 1;
  if (row.ok === false) bucket.failed += 1;
  bucket.inputTokens += Math.max(0, Number(row.input_tokens) || 0);
  bucket.outputTokens += Math.max(0, Number(row.output_tokens) || 0);
  bucket.cacheReadTokens += Math.max(0, Number(row.cache_read_tokens) || 0);
  if (usd === null) { if ((Number(row.input_tokens) || 0) + (Number(row.output_tokens) || 0) > 0) bucket.unpriced += 1; }
  else bucket.usd += usd;
}

export type CostSummary = {
  total: Bucket;
  byKind: Array<{ kind: string } & Bucket>;
  byDay: Array<{ day: string } & Bucket>;
  byModel: Array<{ model: string } & Bucket>;
  byPlan: Array<{ planId: string } & Bucket>;
  /** 계획서가 기록되지 않은 호출(예전 기록·계획서 밖의 호출) */
  unattributed: Bucket;
  krwPerUsd: number;
};

/** 한국 시간 기준 날짜(YYYY-MM-DD) */
export function kstDay(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "unknown";
  return new Date(time + 9 * 60 * 60_000).toISOString().slice(0, 10);
}

export function summarizeUsage(rows: UsageRow[], rate = krwPerUsd()): CostSummary {
  const total = emptyBucket();
  const unattributed = emptyBucket();
  const kinds = new Map<string, Bucket>(), days = new Map<string, Bucket>(), models = new Map<string, Bucket>(), plans = new Map<string, Bucket>();
  const into = (map: Map<string, Bucket>, key: string) => { let bucket = map.get(key); if (!bucket) { bucket = emptyBucket(); map.set(key, bucket); } return bucket; };
  for (const row of rows) {
    if (isBillingDuplicate(row)) continue;
    const usd = rowCostUsd(row);
    add(total, row, usd);
    add(into(kinds, row.kind || "etc"), row, usd);
    add(into(days, kstDay(row.created_at)), row, usd);
    add(into(models, row.model || "모델 미기록"), row, usd);
    if (row.plan_id) add(into(plans, row.plan_id), row, usd);
    else add(unattributed, row, usd);
  }
  const list = <K extends string>(map: Map<string, Bucket>, key: K) => [...map].map(([name, bucket]) => ({ [key]: name, ...bucket }) as { [P in K]: string } & Bucket);
  return {
    total,
    byKind: list(kinds, "kind").sort((a, b) => b.usd - a.usd || b.calls - a.calls),
    byDay: list(days, "day").sort((a, b) => b.day.localeCompare(a.day)),
    byModel: list(models, "model").sort((a, b) => b.usd - a.usd),
    byPlan: list(plans, "planId").sort((a, b) => b.usd - a.usd).slice(0, 50),
    unattributed,
    krwPerUsd: rate,
  };
}

/* 관리자 화면에 보일 호출 종류 이름 */
export const USAGE_KIND_LABELS: Record<string, string> = {
  "generate": "계획서 장 작성", "stage-generate": "단계별 계획서 작성", "direct-plan": "계획서 바로 만들기",
  "business-plan-review": "계획서 검토", "business-plan-repair": "계획서 보완", "business-plan-patch": "계획서 부분 보완", "plan-outline": "문서 설계도", "deck-review": "발표자료 검토", "plan-review": "계획서 리뷰",
  "deck": "발표자료(PPT)", "presentation-assist": "발표자료 도움",
  "intake-design": "사업 설계", "intake-extract": "답변 정리", "intake-suggestions": "답변 추천", "intake-help": "질문 도움말", "intake-ideas": "아이디어 추천",
  "business-coach": "사업 대화", "business-brief": "사업 요약", "idea": "아이디어 제안",
  "plan-analyze": "사업 분석", "plan-questions": "추가 질문 만들기", "operating-analysis": "운영 개선 분석",
  "document-refresh": "문서 고치기", "document-refresh-review": "문서 고치기 검토", "document-assist": "문서 도움",
  "proposal-rewrite": "제안서 다시 쓰기", "proposal-rewrite-review": "제안서 검토", "refinement-review": "다듬기 검토",
  "landing-ai-fill": "홈페이지 AI 채우기", "landing-ai-edit": "홈페이지 AI 수정",
  "suggest": "입력 도우미", "support-assistant": "고객센터 AI", "etc": "기타",
};
