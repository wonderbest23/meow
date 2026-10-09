import { getServerSupabase } from "../persistence";
import { BUNDLE_PRODUCT_NAME, isCurrentAllowanceTerms, LEGACY_REGEN_INCLUDED, REGEN_INCLUDED, REGEN_PACK_COUNT } from "../payments/domain";
import { PLAN_PRODUCT_NAME } from "../payments/plan-orders";
import { FREE_REFLECTS_TOTAL, LEGACY_FREE_REFLECTS_TOTAL } from "./free-reflect";

/*
 * 섹션 '다시 생성' 잔여 횟수.
 *
 * 무제한으로 팔면 AI 실비가 그대로 손실이 된다. 다만 실비로 끊으면 손님이
 * 언제 막힐지 예측할 수 없으므로 횟수로 판다.
 *
 * 세는 것은 '이미 쓰인 섹션을 AI 로 다시 만든 것'뿐이다. 첫 생성과, 손님이
 * 직접 글을 고쳐 쓰는 것은 비용이 들지 않으므로 세지 않는다.
 *
 * 판정은 반드시 서버에서 한다. 화면이 보낸 횟수를 믿으면 무한히 우회된다.
 */

export interface RegenQuota {
  /** 이 플랜에 허용된 총 횟수 (결제 때 약속한 기본 + 구매한 묶음) */
  allowed: number;
  /** 지금까지 쓴 횟수 (실패한 호출은 빼고) */
  used: number;
  /** 남은 횟수 */
  remaining: number;
  /** Accounting could not be verified; callers must not authorize regeneration. */
  unavailable?: true;
}

const UNAVAILABLE: RegenQuota = { allowed: 0, used: 0, remaining: 0, unavailable: true };

/** 계획서 결제에 딸린 포함량 — 다시 생성 횟수와 무료 반영 횟수 */
export interface PlanAllowance { regenIncluded: number; freeReflects: number }
const CURRENT_ALLOWANCE: PlanAllowance = { regenIncluded: REGEN_INCLUDED, freeReflects: FREE_REFLECTS_TOTAL };
const LEGACY_ALLOWANCE: PlanAllowance = { regenIncluded: LEGACY_REGEN_INCLUDED, freeReflects: LEGACY_FREE_REFLECTS_TOTAL };

/*
 * 포함량은 손님이 결제할 때 동의한 약관 버전으로 정한다(2026-10-09 가격 개편).
 * 이 계획서의 결제 주문이 모두 새 약관이면 새 포함량, 하나라도 예전 약관이거나 주문을 찾지 못하면 예전 포함량이다.
 * 주문이 없는 경우는 개편 전 전체 이용권·운영자 계정처럼 결제 날짜로 가를 수 없는 경우뿐이라 손님 쪽으로 넉넉하게 본다
 * (결제 전 계획서는 본문을 쓰지 않으므로 포함량을 쓸 일이 없다). 조회가 실패하면 null — 호출한 쪽이 막는다.
 */
export async function resolvePlanAllowance(planId: string): Promise<PlanAllowance | null> {
  try {
    const supabase = getServerSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("payment_orders")
      .select("terms_version")
      .eq("status", "done")
      .in("order_name", [PLAN_PRODUCT_NAME, BUNDLE_PRODUCT_NAME])
      .eq("opportunity->>planId", planId)
      .limit(20);
    if (error || !Array.isArray(data)) return null;
    if (!data.length || data.some(row => !isCurrentAllowanceTerms(row?.terms_version))) return { ...LEGACY_ALLOWANCE };
    return { ...CURRENT_ALLOWANCE };
  } catch {
    return null;
  }
}

/** Unavailable or malformed accounting never grants a default allowance. */
export async function resolveRegenQuota(planId?: string): Promise<RegenQuota> {
  try {
    if (!planId) return { ...UNAVAILABLE };
    const supabase = getServerSupabase();
    if (!supabase) return { ...UNAVAILABLE };
    const [usedRes, packRes, allowance] = await Promise.all([
      supabase.from("plan_regenerations").select("id", { count: "exact", head: true }).eq("plan_id", planId).eq("ok", true),
      supabase.from("plan_regen_packs").select("granted").eq("plan_id", planId),
      resolvePlanAllowance(planId),
    ]);

    if (!allowance || usedRes.error || packRes.error || !Number.isSafeInteger(usedRes.count) || usedRes.count! < 0 || !Array.isArray(packRes.data)) return { ...UNAVAILABLE };

    if (packRes.data.some(row => !row || !Number.isSafeInteger(row.granted) || row.granted < 0)) return { ...UNAVAILABLE };
    const purchased = packRes.data.reduce((sum, row) => sum + row.granted, 0);
    const allowed = allowance.regenIncluded + purchased;
    if (!Number.isSafeInteger(allowed)) return { ...UNAVAILABLE };
    const used = usedRes.count!;
    return { allowed, used, remaining: Math.max(0, allowed - used) };
  } catch {
    return { ...UNAVAILABLE };
  }
}

/**
 * 재생성 1회를 기록한다.
 * 실패한 생성은 ok=false 로 남겨 잔여 횟수에서 빼지 않는다 — 손님 잘못이 아니다.
 */
export async function recordRegen(planId: string, ownerHash: string, sectionKey: string, ok: boolean): Promise<void> {
  try {
    const supabase = getServerSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("plan_regenerations").insert({ plan_id: planId, owner_hash: ownerHash, section_key: sectionKey, ok });
    // 집계 실패가 생성을 막으면 안 된다 — 다만 남긴다(세지 못한 재생성은 남은 횟수가 줄지 않는다)
    if (error) console.error("[regen-quota]", JSON.stringify({ event: "record_failed", planId, sectionKey, ok, code: error.code ?? null }));
  } catch (error) {
    console.error("[regen-quota]", JSON.stringify({ event: "record_failed", planId, sectionKey, ok, message: error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN" }));
  }
}

/** 추가로 산 묶음을 반영한다. 같은 주문이 두 번 들어와도 한 번만 늘어난다. */
export async function grantRegenPack(planId: string, ownerHash: string, orderId: string, amount: number): Promise<boolean> {
  const supabase = getServerSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from("plan_regen_packs")
    .insert({ plan_id: planId, owner_hash: ownerHash, order_id: orderId, granted: REGEN_PACK_COUNT, amount });
  /* unique(order_id) 위반 = 이미 반영된 결제 — 성공으로 본다 */
  if (error) return error.code === "23505";
  return true;
}
