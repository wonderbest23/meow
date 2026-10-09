/*
 * 사업 1건당 '무료로 쓰는' AI 비용 상한(가격 개편 2026-10-09).
 *
 * 계획서 항목 작성·검토·고쳐 쓰기는 계획서 가격과 다시 생성 횟수로 값을 받는다. 그 밖의 대화(질문 정리·사업 방향 정리·
 * 수정 요청 해석 등)는 따로 받지 않아서, 하루 한도만으로는 한 사업이 몇 주에 걸쳐 끝없이 AI 를 쓸 수 있다.
 * 사업마다 이 비용이 상한을 넘으면 AI 대화를 멈춘다(직접 고치기·저장은 계속된다).
 *
 * 조회가 실패하면 막지 않는다 — 기록을 못 읽었다고 손님 대화를 끊으면 안 되고, 하루 한도는 그대로 남아 있다.
 */
import { getServerSupabase } from "../persistence";
import { isBillingDuplicate, krwPerUsd, rowCostUsd, type UsageRow } from "./cost";

export const PLAN_FREE_AI_CAP_KRW = 20_000;
export const PLAN_FREE_AI_CAP_MESSAGE = "이 사업에서 쓸 수 있는 AI 대화 한도에 도달했어요. 계획서 글을 직접 고치는 것은 계속할 수 있어요. 더 필요하면 고객센터로 문의해 주세요";

/* 결제로 값을 받는 작업 — 상한 계산에서 뺀다 */
const PAID_KINDS = new Set([
  "generate", "plan-outline", "business-plan-review", "business-plan-patch", "business-plan-repair", "business-plan-quality-patch",
  "landing-ai-fill", "landing-ai-edit",
]);

/** 결제로 값을 받지 않는 AI 호출 비용의 합(원) */
export function freeAiCostKrw(rows: UsageRow[], rate = krwPerUsd()): number {
  let usd = 0;
  for (const row of rows) {
    if (isBillingDuplicate(row) || PAID_KINDS.has(row.kind ?? "")) continue;
    usd += rowCostUsd(row) ?? 0;
  }
  return Math.round(usd * rate);
}

/** 이 사업의 무료 AI 비용(원). 기록에 사업이 없거나 조회하지 못하면 null */
export async function planFreeAiCostKrw(planId: string | undefined): Promise<number | null> {
  if (!planId) return null;
  try {
    const supabase = getServerSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("llm_usage")
      .select("kind, model, ok, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, created_at")
      .eq("plan_id", planId)
      .limit(5000);
    if (error || !Array.isArray(data)) {
      console.error("[plan-cost-cap]", JSON.stringify({ event: "lookup_failed", planId, code: error?.code ?? null }));
      return null;
    }
    return freeAiCostKrw(data as UsageRow[]);
  } catch {
    return null;
  }
}

export async function planFreeAiCapReached(planId: string | undefined): Promise<boolean> {
  const krw = await planFreeAiCostKrw(planId);
  return krw !== null && krw >= PLAN_FREE_AI_CAP_KRW;
}
