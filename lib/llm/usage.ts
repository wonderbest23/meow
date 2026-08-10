import { getServerSupabase } from "../persistence";

/**
 * LLM 호출 1건을 기록한다 — 어드민 대시보드의 'API 사용량' 원천.
 * 로깅 실패가 본 기능을 깨면 안 되므로 어떤 오류도 삼킨다.
 * (llm_usage 테이블이 아직 없으면 그냥 조용히 넘어간다)
 */
export async function recordLlmUsage(kind: string, provider: string, ok: boolean): Promise<void> {
  try {
    const supabase = getServerSupabase();
    if (!supabase) return;
    await supabase.from("llm_usage").insert({ kind, provider, ok });
  } catch {
    // 집계용 로그일 뿐 — 실패해도 무시
  }
}
