import { getServerSupabase } from "../persistence";
import { REGEN_INCLUDED, REGEN_PACK_COUNT } from "../payments/domain";

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
  /** 이 플랜에 허용된 총 횟수 (기본 + 구매한 묶음) */
  allowed: number;
  /** 지금까지 쓴 횟수 (실패한 호출은 빼고) */
  used: number;
  /** 남은 횟수 */
  remaining: number;
}

const EMPTY: RegenQuota = { allowed: REGEN_INCLUDED, used: 0, remaining: REGEN_INCLUDED };

/**
 * 남은 재생성 횟수. 집계용 표가 아직 없거나 조회에 실패하면 막지 않는다 —
 * 세는 쪽이 고장 났다고 해서 이미 돈을 낸 손님의 작업을 멈추게 할 수는 없다.
 */
export async function resolveRegenQuota(planId?: string): Promise<RegenQuota> {
  if (!planId) return EMPTY;
  const supabase = getServerSupabase();
  if (!supabase) return EMPTY;

  try {
    const [usedRes, packRes] = await Promise.all([
      supabase.from("plan_regenerations").select("id", { count: "exact", head: true }).eq("plan_id", planId).eq("ok", true),
      supabase.from("plan_regen_packs").select("granted").eq("plan_id", planId),
    ]);

    if (usedRes.error || packRes.error) return EMPTY;

    const purchased = (packRes.data ?? []).reduce((sum, row) => sum + (Number(row.granted) || 0), 0);
    const allowed = REGEN_INCLUDED + purchased;
    const used = usedRes.count ?? 0;
    return { allowed, used, remaining: Math.max(0, allowed - used) };
  } catch {
    return EMPTY;
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
    await supabase.from("plan_regenerations").insert({ plan_id: planId, owner_hash: ownerHash, section_key: sectionKey, ok });
  } catch {
    // 집계 실패가 생성을 막으면 안 된다
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
