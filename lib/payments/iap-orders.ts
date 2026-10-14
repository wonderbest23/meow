import { randomUUID } from "node:crypto";
import { getServerSupabase } from "../persistence";
import { REGEN_PACK_COUNT, TERMS_VERSION } from "./domain";
import type { IapProduct } from "./iap-products";
import { productAmount, productName } from "./plan-orders";

/*
 * 스토어(애플·구글)가 확인해 준 결제를 우리 결제 기록(payment_orders)에 남긴다.
 *
 * 카드 결제와 같은 표에 '완료(done)'로 넣기 때문에 계획서·홈페이지 열림 확인(paidPlanEntitlement 등)은 바꾸지 않아도 된다.
 * 주문번호는 스토어 거래 번호로 정한다 — 같은 영수증을 두 번 보내도 한 번만 반영되고(주문번호 unique),
 * 다른 계정이 남의 영수증을 쓰려 하면 거절한다.
 * 금액은 우리 가격표 값으로 남긴다(스토어 수수료를 뺀 정산액이 아니다 — 정산은 스토어 보고서로 본다).
 */
export type IapRecordInput = {
  platform: "ios" | "android";
  /** 애플 transactionId, 구글 orderId */
  storeTransactionId: string;
  product: IapProduct;
  planId: string;
  planType: string;
  userId: string;
  guestTokenHash: string;
  email: string | null;
  /** 애플 Production/Sandbox — 심사·테스트 결제(Sandbox)도 기록은 하되 표시해 둔다 */
  environment: string;
  raw: Record<string, unknown>;
};

export class IapOrderError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) { super(message); }
}

export function iapOrderId(platform: "ios" | "android", storeTransactionId: string) {
  return `IAP-${platform === "ios" ? "A" : "G"}-${storeTransactionId.replace(/[^A-Za-z0-9.-]/g, "").slice(0, 52)}`;
}

/** 결제를 기록한다. 이미 같은 계정으로 기록된 거래면 그대로 성공으로 본다(재시도 안전) */
export async function recordIapPurchase(input: IapRecordInput): Promise<{ orderId: string; firstCompletion: boolean }> {
  const orderId = iapOrderId(input.platform, input.storeTransactionId);
  const supabase = getServerSupabase();
  if (!supabase) throw new IapOrderError("IAP_STORE_UNAVAILABLE", "결제 기록 저장소에 연결하지 못했습니다.", 503);
  const now = new Date().toISOString();
  const amount = productAmount(input.product, input.planType);
  const { error } = await supabase.from("payment_orders").insert({
    id: randomUUID(),
    order_id: orderId,
    guest_token_hash: input.guestTokenHash,
    amount,
    currency: "KRW",
    order_name: productName(input.product),
    owner_id: input.userId,
    customer_email: input.email,
    method: input.platform === "ios" ? "APPLE_IAP" : "GOOGLE_IAP",
    status: "done",
    provider_status: `${input.platform === "ios" ? "APPLE" : "GOOGLE"}_${input.environment.toUpperCase()}`,
    payment_key: `${input.platform}:${input.storeTransactionId}`.slice(0, 200),
    opportunity: { planId: input.planId, planType: input.planType, product: input.product, iap: { platform: input.platform, environment: input.environment } },
    founder_profile: {},
    terms_version: TERMS_VERSION,
    terms_agreed_at: now,
    expires_at: now,
    confirmed_at: now,
    raw_response: input.raw,
  });
  let firstCompletion = true;
  if (error) {
    if (error.code !== "23505") throw error;
    // 같은 거래가 이미 있다 — 같은 계정이면 재시도로 보고, 아니면 남의 영수증이다
    const { data } = await supabase.from("payment_orders").select("owner_id, opportunity, status").eq("order_id", orderId).maybeSingle();
    const existing = data as { owner_id?: string; opportunity?: { planId?: string; product?: string }; status?: string } | null;
    if (!existing || existing.owner_id !== input.userId) throw new IapOrderError("IAP_RECEIPT_USED", "이미 다른 계정에 반영된 결제입니다.");
    if (existing.opportunity?.planId !== input.planId || existing.opportunity?.product !== input.product) throw new IapOrderError("IAP_RECEIPT_USED", "이미 다른 사업에 반영된 결제입니다.");
    firstCompletion = false;
  }
  // 다시 생성 묶음은 횟수를 넣는다 — 카드 결제(settle_nicepay_plan_order)와 같은 표·같은 값. 주문번호가 같으면 다시 넣지 않는다
  if (input.product === "regen") {
    const { error: packError } = await supabase.from("plan_regen_packs").upsert(
      { plan_id: input.planId, owner_hash: input.userId, order_id: orderId, granted: REGEN_PACK_COUNT, amount },
      { onConflict: "order_id", ignoreDuplicates: true },
    );
    if (packError) throw packError;
  }
  return { orderId, firstCompletion };
}
