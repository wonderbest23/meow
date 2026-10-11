import { getServerSupabase } from "../persistence";
import { currentUsageContext } from "./usage-context-reader";

type UsageEntry = { kind: string; provider: string; ok: boolean; model: string | null; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
let usageListener: ((entry: UsageEntry) => void) | null = null;
/** 시험 도구(scripts/plan-eval)가 DB 없이 호출별 원가를 모으는 자리 — 운영에서는 비어 있다 */
export function setLlmUsageListener(listener: ((entry: UsageEntry) => void) | null) { usageListener = listener; }

/**
 * LLM 호출 1건을 기록한다 — 어드민 대시보드의 'API 사용량' 원천.
 * 로깅 실패가 본 기능을 깨면 안 되므로 어떤 오류도 삼킨다.
 * (llm_usage 테이블이 아직 없으면 그냥 조용히 넘어간다)
 */
export async function recordLlmUsage(kind: string, provider: string, ok: boolean, usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }, metadata?: { model: string; elapsedMs: number; failureCode?: string }): Promise<void> {
  try {
    usageListener?.({ kind, provider, ok, model: metadata?.model ?? null, inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0, cacheReadTokens: usage?.cacheReadTokens ?? 0, cacheWriteTokens: usage?.cacheWriteTokens ?? 0 });
  } catch {
    // 집계용 — 무시
  }
  try {
    const supabase = getServerSupabase();
    if (!supabase) return;
    const row = { kind, provider, ok, ...(usage ? { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens } : {}) };
    const meta = metadata ? { model: metadata.model, elapsed_ms: Math.max(0, Math.min(2147483647, Math.round(metadata.elapsedMs))), failure_code: metadata.failureCode ?? null } : {};
    // 캐시 몫(0037) — 원가를 실제 청구 기준으로 계산하려고 따로 남긴다(inputTokens 에는 이미 포함)
    const cache = usage && (usage.cacheReadTokens !== undefined || usage.cacheWriteTokens !== undefined)
      ? { cache_read_tokens: Math.max(0, Math.round(usage.cacheReadTokens ?? 0)), cache_write_tokens: Math.max(0, Math.round(usage.cacheWriteTokens ?? 0)) } : null;
    const missingColumn = (error: { code?: string } | null) => !!error && ["42703", "PGRST204"].includes(error.code ?? "");
    /*
     * 어느 사업의 호출인지(입구에서 정한 usage-context) — 사업별 비용 집계용.
     * 홈페이지 AI 수정은 토큰 차감용 줄이 plan_id 로 따로 남으므로(ai-tokens.ts), 이 줄에는 붙이지 않는다
     * — 붙이면 차감이 두 번 된다.
     */
    const context = currentUsageContext();
    const owner = context?.planId && kind !== "landing-ai-edit" ? { plan_id: context.planId.slice(0, 80), owner_hash: context.ownerHash?.slice(0, 128) ?? null } : null;
    // 마이그레이션이 덜 된 DB에서는 새 칸부터 하나씩 빼며 다시 넣는다 — 집계 로그가 통째로 사라지지 않게
    let result = await supabase.from("llm_usage").insert({ ...row, ...meta, ...(cache ?? {}), ...(owner ?? {}) });
    if (owner && missingColumn(result.error)) result = await supabase.from("llm_usage").insert({ ...row, ...meta, ...(cache ?? {}) });
    if (cache && missingColumn(result.error)) result = await supabase.from("llm_usage").insert({ ...row, ...meta });
    if (metadata && missingColumn(result.error)) result = await supabase.from("llm_usage").insert(row);
    if (usage && missingColumn(result.error)) await supabase.from("llm_usage").insert({ kind, provider, ok });
  } catch {
    // 집계용 로그일 뿐 — 실패해도 무시
  }
}
