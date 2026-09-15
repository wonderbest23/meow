import { getServerSupabase } from "../persistence";

/**
 * LLM 호출 1건을 기록한다 — 어드민 대시보드의 'API 사용량' 원천.
 * 로깅 실패가 본 기능을 깨면 안 되므로 어떤 오류도 삼킨다.
 * (llm_usage 테이블이 아직 없으면 그냥 조용히 넘어간다)
 */
export async function recordLlmUsage(kind: string, provider: string, ok: boolean, usage?: { inputTokens: number; outputTokens: number }, metadata?: { model: string; elapsedMs: number; failureCode?: string }): Promise<void> {
  try {
    const supabase = getServerSupabase();
    if (!supabase) return;
    const row = { kind, provider, ok, ...(usage ? { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens } : {}) };
    let result = await supabase.from("llm_usage").insert({ ...row, ...(metadata ? { model: metadata.model, elapsed_ms: Math.max(0, Math.min(2147483647, Math.round(metadata.elapsedMs))), failure_code: metadata.failureCode ?? null } : {}) });
    // Older deployments retain token/count logging before the new migration is applied.
    if (result.error && metadata && ["42703", "PGRST204"].includes(result.error.code)) result = await supabase.from("llm_usage").insert(row);
    if (result.error && usage && ["42703", "PGRST204"].includes(result.error.code)) await supabase.from("llm_usage").insert({ kind, provider, ok });
  } catch {
    // 집계용 로그일 뿐 — 실패해도 무시
  }
}
