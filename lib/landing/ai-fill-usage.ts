import { getServerSupabase } from "../persistence";

/*
 * AI 채우기 횟수 — 계획서(플랜)마다 센다. 호출마다 실비가 나가는 기능이라,
 * 세는 표를 못 읽으면 null 을 돌려 호출을 막는다(열어 두면 손실이 쌓인다).
 * 토큰 양은 llm_usage(kind='landing-ai-fill')에 따로 남으므로 여기서는 횟수만 적는다.
 */
export const AI_FILL_USE_KIND = "landing-ai-fill-use";

export async function countAiFills(planId: string): Promise<number | null> {
  const supabase = getServerSupabase();
  if (!supabase) return 0; // 로컬 데모
  const { count, error } = await supabase
    .from("llm_usage")
    .select("kind", { count: "exact", head: true })
    .eq("kind", AI_FILL_USE_KIND)
    .eq("plan_id", planId)
    .eq("ok", true);
  // 개수만 묻는 요청은 표·칸이 없어도 오류 없이 개수만 비어 올 수 있다 — 그때도 0번이 아니라 '모름'(막음)
  return error || count === null ? null : count;
}

export async function recordAiFill(planId: string, ownerHash: string): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("llm_usage").insert({ kind: AI_FILL_USE_KIND, provider: "anthropic", ok: true, plan_id: planId, owner_hash: ownerHash, input_tokens: 0, output_tokens: 0 });
  if (error) console.error("[ai-fill] usage insert failed:", error.message);
}
