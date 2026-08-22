import { getServerSupabase } from "../persistence";
import { purchasedTokens } from "../payments/plan-orders";
import { TOKEN_PACK_TOKENS } from "../payments/domain";

/*
 * 홈페이지 AI 수정 토큰 잔액.
 *
 *   잔액 = 산 팩 × 20만 − 지금까지 쓴 토큰(llm_usage, kind='landing-ai-edit')
 *
 * 판정은 서버에서만 한다. 실패한 호출(ok=false)은 빼지 않는다 — 손님 잘못이
 * 아니다. 집계 표를 못 읽으면 '잔액 0' 으로 본다: 재생성 횟수와 달리 이건
 * 호출마다 실비가 나가는 기능이라, 세는 쪽이 고장 났을 때 열어 두면 손실이
 * 그대로 쌓인다.
 *
 * llm_usage 에 필요한 열(없으면 SQL 로 추가):
 *   plan_id text, owner_hash text, input_tokens int default 0, output_tokens int default 0
 */
export const AI_EDIT_KIND = "landing-ai-edit";

export interface TokenBalance {
  purchased: number;
  used: number;
  remaining: number;
  packSize: number;
}

export async function resolveTokenBalance(userId: string | null, planId: string): Promise<TokenBalance> {
  const packSize = TOKEN_PACK_TOKENS;
  const supabase = getServerSupabase();
  if (!supabase || !userId) return { purchased: 0, used: 0, remaining: 0, packSize };
  const purchased = await purchasedTokens(userId, planId).catch(() => 0);
  if (!purchased) return { purchased: 0, used: 0, remaining: 0, packSize };
  const { data, error } = await supabase
    .from("llm_usage")
    .select("input_tokens, output_tokens")
    .eq("kind", AI_EDIT_KIND)
    .eq("plan_id", planId)
    .eq("ok", true)
    .limit(5000);
  if (error) return { purchased, used: purchased, remaining: 0, packSize };
  const used = (data ?? []).reduce((sum, row) => sum + (Number(row.input_tokens) || 0) + (Number(row.output_tokens) || 0), 0);
  return { purchased, used, remaining: Math.max(0, purchased - used), packSize };
}

/** 호출 1건의 토큰을 기록한다 — 차감의 원천. 기록이 실패하면 호출 자체를 실패로 돌려 공짜 사용을 막는다. */
export async function recordAiEditUsage(input: {
  planId: string;
  ownerHash: string;
  provider: string;
  ok: boolean;
  inputTokens: number;
  outputTokens: number;
}): Promise<boolean> {
  const supabase = getServerSupabase();
  if (!supabase) return true; // 로컬 데모
  const { error } = await supabase.from("llm_usage").insert({
    kind: AI_EDIT_KIND,
    provider: input.provider,
    ok: input.ok,
    plan_id: input.planId,
    owner_hash: input.ownerHash,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
  });
  if (error) console.error("[ai-tokens] usage insert failed:", error.message);
  return !error;
}
