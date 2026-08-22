// 플랜 빌더 결제 주문.
// 기존 진단 흐름 주문과 같은 payment_orders 테이블을 쓰되, order_name으로 상품을 구분한다.
// (진단 상품을 산 사람에게 플랜 빌더가 덤으로 열리면 안 되고, 그 반대도 마찬가지)

import { randomUUID } from "node:crypto";
import { getServerSupabase } from "../persistence";
import { PACKAGE_AMOUNT, REGEN_PACK_AMOUNT, REGEN_PACK_NAME, TERMS_VERSION, DOMAIN_PRODUCT_NAME, DOMAIN_PRODUCT_AMOUNT, DOMAIN_PRODUCT_DAYS, TOKEN_PACK_NAME, TOKEN_PACK_AMOUNT, TOKEN_PACK_TOKENS } from "./domain";

/** 파는 것 — 계획서 / 홈페이지 / 다시 생성 묶음 / 도메인 연결+호스팅 / AI 수정 토큰 */
export type PlanProduct = "plan" | "homepage" | "regen" | "domain" | "tokens";

export function productAmount(product: PlanProduct, planType: string): number {
  switch (product) {
    case "regen": return REGEN_PACK_AMOUNT;
    case "homepage": return HOMEPAGE_PRODUCT_AMOUNT;
    case "domain": return DOMAIN_PRODUCT_AMOUNT;
    case "tokens": return TOKEN_PACK_AMOUNT;
    default: return planPrice(planType);
  }
}
export function productName(product: PlanProduct): string {
  switch (product) {
    case "regen": return REGEN_PACK_NAME;
    case "homepage": return HOMEPAGE_PRODUCT_NAME;
    case "domain": return DOMAIN_PRODUCT_NAME;
    case "tokens": return TOKEN_PACK_NAME;
    default: return PLAN_PRODUCT_NAME;
  }
}

/** 플랜 빌더 상품명 — 이 값으로 권한을 판정하므로 바꾸면 기존 구매자가 잠긴다 */
export const PLAN_PRODUCT_NAME = "사업계획서 플랜 빌더";
/*
 * 홈페이지는 계획서와 별개로 파는 상품이다.
 * 만든 홈페이지를 보는 것(미리보기)은 무료, 고치고 공개하는 것이 결제 대상.
 */
export const HOMEPAGE_PRODUCT_NAME = "사업계획서 홈페이지";
export const HOMEPAGE_PRODUCT_AMOUNT = 149_000;
export const PLAN_PRODUCT_AMOUNT = PACKAGE_AMOUNT;

/*
 * 문서(플랜) 1부당 가격.
 * 결제 단위가 계정 전체 이용권에서 문서 단위로 바뀌었다 — 같은 계정이
 * 유형·문서마다 따로 결제한다. 가격은 분량·용도 무게로 나눴다.
 * 여기 없는 유형(과거 데이터)은 기본가로 판다.
 */
export const PLAN_TYPE_PRICING: Record<string, number> = {
  "간단 · 사업계획서": 149_000,
  "내부용 · 사업계획서": 149_000,
  "창업 초기 · 재무 예측": 149_000,
  "창업 초기 · 사업계획서": 149_000,
  "성장·확장 · 사업계획서": 149_000,
  "정밀 · 재무 모델": 149_000,
  "정부지원 · PSST 사업계획서": 149_000,
};
export const PLAN_DEFAULT_PRICE = 149_000;

export function planPrice(planType?: string): number {
  return (planType && PLAN_TYPE_PRICING[planType]) || PLAN_DEFAULT_PRICE;
}

/** 결제창을 띄우기 전에 만들어 두는 주문 */
export interface PlanOrder {
  orderId: string;
  amount: number;
  orderName: string;
  status: string;
  ownerId: string;
}

/** 결제 시작 — 승인 전 주문을 먼저 남겨 금액을 서버가 쥐고 있게 한다. */
export async function createPlanOrder(input: {
  ownerId: string;
  guestTokenHash: string;
  customerEmail: string | null;
  /** 이 결제로 열리는 플랜 — 문서 단위 결제의 연결 고리 */
  planId: string;
  planType: string;
  /** 무엇을 사는 결제인지 — 계획서(기본) / 홈페이지 / 다시 생성 묶음 / 도메인 / 토큰 */
  product?: PlanProduct;
}): Promise<PlanOrder> {
  const now = new Date();
  const orderId = `PB-${now.getTime().toString(36)}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const product: PlanProduct = input.product ?? "plan";
  /*
   * 금액은 서버가 정한다. 화면이 보낸 값을 쓰면 4,900원짜리를 100원으로
   * 바꿔 보내는 요청 하나로 뚫린다.
   */
  const order: PlanOrder = {
    orderId,
    amount: productAmount(product, input.planType),
    orderName: productName(product),
    status: "created",
    ownerId: input.ownerId,
  };

  const supabase = getServerSupabase();
  if (!supabase) return order; // 로컬 데모에서는 저장하지 않는다

  const { error } = await supabase.from("payment_orders").insert({
    id: randomUUID(),
    order_id: order.orderId,
    guest_token_hash: input.guestTokenHash,
    amount: order.amount,
    currency: "KRW",
    order_name: order.orderName,
    owner_id: input.ownerId,
    customer_email: input.customerEmail,
    method: "CARD",
    status: "created",
    // 문서 단위 권한의 연결 고리 — 어떤 플랜을 여는 결제인지 여기 남긴다
    // (opportunity는 진단 흐름의 NOT NULL jsonb 컬럼을 재사용)
    // product 를 함께 남긴다 — 승인 시 무엇을 열어 줄지 여기서 읽는다
    opportunity: { planId: input.planId, planType: input.planType, product: input.product ?? "plan" },
    founder_profile: {},
    terms_version: TERMS_VERSION,
    terms_agreed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 30 * 60_000).toISOString(),
  });
  if (error) throw error;
  return order;
}

/** 승인 직전에 주문을 다시 읽어 금액·소유자를 대조한다. */
export async function getPlanOrder(orderId: string): Promise<{
  orderId: string;
  amount: number;
  ownerId: string | null;
  status: string;
  orderName: string;
  expiresAt: string;
  planId: string | null;
  planType: string | null;
  /** 무엇을 산 주문인지 — 승인 뒤 무엇을 열어 줄지 여기서 갈린다 */
  product: PlanProduct;
} | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("payment_orders")
    .select("order_id, amount, owner_id, status, order_name, expires_at, opportunity")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    orderId: data.order_id as string,
    amount: data.amount as number,
    ownerId: (data.owner_id as string | null) ?? null,
    status: data.status as string,
    orderName: data.order_name as string,
    expiresAt: data.expires_at as string,
    planId: ((data.opportunity as { planId?: string } | null)?.planId ?? null),
    planType: ((data.opportunity as { planType?: string } | null)?.planType ?? null),
    /* 옛 주문에는 product 가 없다 — 그때는 전부 계획서 결제였다 */
    product: (((data.opportunity as { product?: string } | null)?.product ?? "plan") as PlanProduct),
  };
}

/** 승인 성공 — 여기서 status가 done이 되어야 잠금이 풀린다. */
export async function markPlanOrderPaid(input: {
  orderId: string;
  tid: string;
  raw: Record<string, unknown>;
}): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from("payment_orders")
    .update({
      status: "done",
      provider_status: "PAID",
      payment_key: input.tid,
      raw_response: input.raw,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", input.orderId);
  if (error) throw error;
}

/** 승인 실패 — 왜 실패했는지 남겨 둔다. */
export async function markPlanOrderFailed(input: {
  orderId: string;
  code: string;
  message: string;
  raw?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) return;
  await supabase
    .from("payment_orders")
    .update({
      status: "failed",
      failure_code: input.code,
      failure_message: input.message,
      raw_response: input.raw ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", input.orderId);
}

export interface PaidPlanEntitlement {
  /** 구 전체 이용권(문서 연결 없는 결제) — 모든 플랜이 열린다 */
  allAccess: boolean;
  /** 문서 단위 결제로 열린 플랜 id들 */
  planIds: Set<string>;
}

/**
 * 이 사용자의 결제 권한.
 * 문서 단위 결제(opportunity.planId 있음)는 그 플랜만 열고,
 * 과거 전체 이용권(planId 없음)은 전부 연다 — 기존 구매자를 잠그지 않는다.
 */
export async function paidPlanEntitlement(userId: string): Promise<PaidPlanEntitlement> {
  const supabase = getServerSupabase();
  if (!supabase) return { allAccess: true, planIds: new Set() }; // 로컬 데모에서는 잠그지 않는다
  const { data, error } = await supabase
    .from("payment_orders")
    .select("opportunity")
    .eq("owner_id", userId)
    .eq("order_name", PLAN_PRODUCT_NAME)
    .eq("status", "done")
    .limit(200);
  if (error) throw error;
  const planIds = new Set<string>();
  let allAccess = false;
  for (const row of data ?? []) {
    const planId = (row.opportunity as { planId?: string } | null)?.planId;
    if (planId) planIds.add(String(planId));
    else allAccess = true;
  }
  return { allAccess, planIds };
}

/**
 * 홈페이지를 결제한 플랜들.
 *
 * 계획서 결제와 별개다 — 계획서를 샀다고 홈페이지가 열리지는 않는다.
 * planId 없는 주문(구 전체 이용권)은 여기서는 인정하지 않는다.
 */
export async function paidHomepagePlanIds(userId: string): Promise<Set<string>> {
  const supabase = getServerSupabase();
  if (!supabase) return new Set(); // 로컬 데모 — 결제 없이 열지 않는다(잠금 동작을 그대로 확인하려고)
  const { data, error } = await supabase
    .from("payment_orders")
    .select("opportunity")
    .eq("owner_id", userId)
    .eq("order_name", HOMEPAGE_PRODUCT_NAME)
    .eq("status", "done")
    .limit(200);
  if (error) throw error;
  const planIds = new Set<string>();
  for (const row of data ?? []) {
    const planId = (row.opportunity as { planId?: string } | null)?.planId;
    if (planId) planIds.add(String(planId));
  }
  return planIds;
}

/** 결제 이력이 하나라도 있는지 (샘플 노출 판단용) */
export async function hasAnyPaidPlanOrder(userId: string): Promise<boolean> {
  const e = await paidPlanEntitlement(userId);
  return e.allAccess || e.planIds.size > 0;
}


export interface PaymentHistoryItem {
  orderId: string;
  orderName: string;
  amount: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  method: string | null;
}

/**
 * 이 사용자의 결제 내역.
 * 플랜 빌더뿐 아니라 이 계정으로 낸 모든 결제를 최신순으로 돌려준다.
 */
export async function listPaymentHistory(userId: string): Promise<PaymentHistoryItem[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("payment_orders")
    .select("order_id, order_name, amount, status, created_at, confirmed_at, method")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    orderId: String(row.order_id),
    orderName: String(row.order_name ?? ""),
    amount: Number(row.amount ?? 0),
    status: String(row.status ?? ""),
    createdAt: String(row.created_at ?? ""),
    paidAt: row.confirmed_at ? String(row.confirmed_at) : null,
    method: row.method ? String(row.method) : null,
  }));
}

/*
 * 도메인 연결+호스팅 — 플랜(홈페이지)마다 1년. 승인일(confirmed_at) + 365일.
 * 만료돼도 연결을 끊지는 않는다(손님 사이트가 갑자기 죽으면 안 된다) —
 * 새 연결·변경만 막고 갱신을 안내한다.
 */
export async function domainEntitlement(userId: string | null, planId: string): Promise<{ active: boolean; expiresAt: string | null }> {
  const supabase = getServerSupabase();
  if (!supabase || !userId) return { active: false, expiresAt: null };
  const { data, error } = await supabase
    .from("payment_orders")
    .select("opportunity, confirmed_at, created_at")
    .eq("owner_id", userId)
    .eq("order_name", DOMAIN_PRODUCT_NAME)
    .eq("status", "done")
    .limit(50);
  if (error) throw error;
  let latest: number | null = null;
  for (const row of data ?? []) {
    if (String((row.opportunity as { planId?: string } | null)?.planId ?? "") !== planId) continue;
    const at = new Date((row.confirmed_at as string | null) ?? (row.created_at as string)).getTime() + DOMAIN_PRODUCT_DAYS * 86_400_000;
    if (latest === null || at > latest) latest = at;
  }
  if (latest === null) return { active: false, expiresAt: null };
  return { active: latest > Date.now(), expiresAt: new Date(latest).toISOString() };
}

/** 산 토큰 합계 — 플랜 단위. 실제 잔액은 llm_usage 차감분을 뺀 값(lib/landing/ai-tokens.ts) */
export async function purchasedTokens(userId: string | null, planId: string): Promise<number> {
  const supabase = getServerSupabase();
  if (!supabase || !userId) return 0;
  const { data, error } = await supabase
    .from("payment_orders")
    .select("opportunity")
    .eq("owner_id", userId)
    .eq("order_name", TOKEN_PACK_NAME)
    .eq("status", "done")
    .limit(500);
  if (error) throw error;
  return (data ?? []).filter((row) => String((row.opportunity as { planId?: string } | null)?.planId ?? "") === planId).length * TOKEN_PACK_TOKENS;
}
