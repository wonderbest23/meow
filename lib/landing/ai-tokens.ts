import { getServerSupabase } from "../persistence";
import { purchasedTokenBatches } from "../payments/plan-orders";
import { tokenBalanceWithExpiry } from "./token-expiry";
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
  /** 남은 토큰 중 가장 먼저 사라지는 충전분의 만료 시각(충전일부터 1년). 없으면 null */
  expiresAt?: string | null;
}

export async function resolveTokenBalance(userId: string | null, planId: string): Promise<TokenBalance> {
  const packSize = TOKEN_PACK_TOKENS;
  const supabase = getServerSupabase();
  if (!supabase || !userId) return { purchased: 0, used: 0, remaining: 0, packSize };
  // 읽기 실패를 '잔액 0'으로 바꾸지 않는다(던진다) — 산 사람에게 다시 충전하라고 했다
  const batches = await purchasedTokenBatches(userId, planId);
  const purchased = batches.reduce((sum, batch) => sum + batch.tokens, 0);
  if (!purchased) return { purchased: 0, used: 0, remaining: 0, packSize };
  /*
   * 사용 기록을 끝까지 읽는다 — DB 한 번 응답은 최대 1000줄(supabase/config.toml max_rows)이라 예전처럼 한 번만 읽으면
   * 1000번을 넘게 쓴 사업은 잔액이 실제보다 많아 보였다.
   */
  const PAGE = 1000;
  const data: Array<{ input_tokens: unknown; output_tokens: unknown; created_at: unknown }> = [];
  for (let from = 0; from < 100_000; from += PAGE) {
    const page = await supabase
      .from("llm_usage")
      .select("input_tokens, output_tokens, created_at")
      .eq("kind", AI_EDIT_KIND)
      .eq("plan_id", planId)
      .eq("ok", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    data.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < PAGE) break;
  }
  // 충전일부터 1년 유효, 먼저 산 토큰부터 차감(환불 기준·결제 화면에 고지한 규칙).
  const uses = data.map((row) => ({ at: new Date(String(row.created_at)).getTime(), tokens: (Number(row.input_tokens) || 0) + (Number(row.output_tokens) || 0) }));
  const balance = tokenBalanceWithExpiry(batches, uses, Date.now());
  return { purchased: balance.purchased, used: balance.used, remaining: balance.remaining, packSize, expiresAt: balance.expiresAt };
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
