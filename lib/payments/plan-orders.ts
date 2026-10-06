// 플랜 빌더 결제 주문.
// 기존 진단 흐름 주문과 같은 payment_orders 테이블을 쓰되, order_name으로 상품을 구분한다.
// (진단 상품을 산 사람에게 플랜 빌더가 덤으로 열리면 안 되고, 그 반대도 마찬가지)

import { randomUUID } from "node:crypto";
import { getServerSupabase } from "../persistence";
import { readDomainRequest, type DomainRequest } from "../landing/domain-purchase";
import { PACKAGE_AMOUNT, HOMEPAGE_PRODUCT_AMOUNT, BUNDLE_PRODUCT_AMOUNT, BUNDLE_PRODUCT_NAME, REGEN_PACK_AMOUNT, REGEN_PACK_NAME, TERMS_VERSION, DOMAIN_PRODUCT_NAME, DOMAIN_PRODUCT_AMOUNT, DOMAIN_PRODUCT_DAYS, DOMAIN_PURCHASE_PRODUCT_NAME, DOMAIN_PURCHASE_PRODUCT_AMOUNT, TOKEN_PACK_NAME, TOKEN_PACK_AMOUNT, TOKEN_PACK_TOKENS } from "./domain";

/** 파는 것 — 계획서 / 홈페이지 / 다시 생성 묶음 / 도메인 연결+호스팅 / 도메인 구매+연결 / AI 수정 토큰 */
export type PlanProduct = "plan" | "homepage" | "bundle" | "regen" | "domain" | "domain-purchase" | "tokens";

export function productAmount(product: PlanProduct, planType: string): number {
  switch (product) {
    case "regen": return REGEN_PACK_AMOUNT;
    case "homepage": return HOMEPAGE_PRODUCT_AMOUNT;
    case "bundle": return BUNDLE_PRODUCT_AMOUNT;
    case "domain": return DOMAIN_PRODUCT_AMOUNT;
    case "domain-purchase": return DOMAIN_PURCHASE_PRODUCT_AMOUNT;
    case "tokens": return TOKEN_PACK_AMOUNT;
    default: return planPrice(planType);
  }
}
export function productName(product: PlanProduct): string {
  switch (product) {
    case "regen": return REGEN_PACK_NAME;
    case "homepage": return HOMEPAGE_PRODUCT_NAME;
    case "bundle": return BUNDLE_PRODUCT_NAME;
    case "domain": return DOMAIN_PRODUCT_NAME;
    case "domain-purchase": return DOMAIN_PURCHASE_PRODUCT_NAME;
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
export { HOMEPAGE_PRODUCT_AMOUNT };
export const PLAN_PRODUCT_AMOUNT = PACKAGE_AMOUNT;

/*
 * 문서(플랜) 1부당 가격.
 * 결제 단위가 계정 전체 이용권에서 문서 단위로 바뀌었다 — 같은 계정이
 * 유형·문서마다 따로 결제한다. 가격은 분량·용도 무게로 나눴다.
 * 여기 없는 유형(과거 데이터)은 기본가로 판다.
 */
export const PLAN_TYPE_PRICING: Record<string, number> = {
  "간단 · 사업계획서": PACKAGE_AMOUNT,
  "내부용 · 사업계획서": PACKAGE_AMOUNT,
  "창업 초기 · 재무 예측": PACKAGE_AMOUNT,
  "창업 초기 · 사업계획서": PACKAGE_AMOUNT,
  "성장·확장 · 사업계획서": PACKAGE_AMOUNT,
  "정밀 · 재무 모델": PACKAGE_AMOUNT,
  "정부지원 · PSST 사업계획서": PACKAGE_AMOUNT,
};
export const PLAN_DEFAULT_PRICE = PACKAGE_AMOUNT;

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
  /** 결제 화면에서 받은 필수 동의 항목(모두 true). terms_agreed_at과 함께 주문에 남긴다. */
  terms?: Record<string, boolean>;
  /** 도메인 구매 대행 — 사 달라고 한 주소. 운영자가 등록하면 status 가 registered 로 바뀐다 */
  domainRequest?: DomainRequest;
  /** 결제 안내 문자 받을 휴대폰(선택, 010 11자리) — 결제 완료 문자에만 쓴다(lib/payments/paid-notifications.ts) */
  noticePhone?: string;
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
    opportunity: { planId: input.planId, planType: input.planType, product: input.product ?? "plan", ...(input.terms ? { terms: input.terms } : {}), ...(input.domainRequest ? { domainRequest: input.domainRequest } : {}), ...(input.noticePhone && /^010\d{8}$/.test(input.noticePhone) ? { noticePhone: input.noticePhone } : {}) },
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
  paymentKey: string | null;
  providerStatus: string | null;
  planId: string | null;
  planType: string | null;
  /** 무엇을 산 주문인지 — 승인 뒤 무엇을 열어 줄지 여기서 갈린다 */
  product: PlanProduct;
  /** 도메인 구매 대행 주문이면 살 주소 */
  domain: string | null;
  /** 도메인 구매 주문이 이미 사 드린 주소의 갱신인지 */
  renewal?: boolean;
} | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("payment_orders")
    .select("order_id, amount, owner_id, status, order_name, expires_at, opportunity, payment_key, provider_status")
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
    paymentKey: (data.payment_key as string | null) ?? null,
    providerStatus: (data.provider_status as string | null) ?? null,
    planId: ((data.opportunity as { planId?: string } | null)?.planId ?? null),
    planType: ((data.opportunity as { planType?: string } | null)?.planType ?? null),
    /* 옛 주문에는 product 가 없다 — 그때는 전부 계획서 결제였다 */
    product: (((data.opportunity as { product?: string } | null)?.product ?? "plan") as PlanProduct),
    domain: readDomainRequest((data.opportunity as { domainRequest?: unknown } | null)?.domainRequest)?.domain ?? null,
    renewal: readDomainRequest((data.opportunity as { domainRequest?: unknown } | null)?.domainRequest)?.renewal === true,
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
  const { data, error } = await supabase
    .from("payment_orders")
    .update({
      status: "done",
      provider_status: "PAID",
      payment_key: input.tid,
      raw_response: input.raw,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", input.orderId)
    .eq("status", "created")
    .select("order_id")
    .maybeSingle();
  if (error) throw error;
  if (data) return;
  // A repeated acknowledgement is safe only for the same already-paid transaction.
  const existing = await supabase.from("payment_orders").select("status,payment_key").eq("order_id", input.orderId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === "done" && existing.data.payment_key === input.tid) return;
  throw new Error("PAYMENT_STATE_CONFLICT");
}

/** Only an uncompleted order may fail; late callbacks cannot revoke paid access. */
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
    .eq("order_id", input.orderId)
    .eq("status", "created");
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
    .select("opportunity, order_name")
    .eq("owner_id", userId)
    .in("order_name", [PLAN_PRODUCT_NAME, BUNDLE_PRODUCT_NAME])
    .eq("status", "done")
    .limit(200);
  if (error) throw error;
  const planIds = new Set<string>();
  let allAccess = false;
  for (const row of data ?? []) {
    const planId = (row.opportunity as { planId?: string } | null)?.planId;
    if (planId) planIds.add(String(planId));
    // 과거 전체 이용권(planId 없는 계획서 주문)만 전부 연다. 묶음 주문은 항상 한 문서용이다.
    else if (row.order_name === PLAN_PRODUCT_NAME) allAccess = true;
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
    .in("order_name", [HOMEPAGE_PRODUCT_NAME, BUNDLE_PRODUCT_NAME])
    .eq("status", "done")
    .limit(200);
  if (error) throw error;
  const planIds = new Set<string>();
  for (const row of data ?? []) {
    const opportunity = row.opportunity as { planId?: string; homepageRefunded?: boolean } | null;
    // 묶음을 일부 환불해 홈페이지만 닫은 주문(refund-execution.ts) — 계획서는 남고 홈페이지는 아니다
    if (opportunity?.homepageRefunded) continue;
    if (opportunity?.planId) planIds.add(String(opportunity.planId));
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
 * '도메인 구매 + 연결' 상품도 같은 1년 연결 권한을 준다. 가장 최근 구매 대행 주문은 purchase 로 알려 준다
 * (등록 진행 중인지, 어떤 주소인지 — 연결 화면과 갱신 링크가 쓴다).
 */
export type DomainPurchaseInfo = DomainRequest & { orderId: string; paidAt: string };

export function summarizeDomainOrders(rows: Array<{ order_id?: unknown; order_name?: unknown; opportunity?: unknown; confirmed_at?: unknown; created_at?: unknown }>, planId: string, now = Date.now()): { active: boolean; expiresAt: string | null; purchase: DomainPurchaseInfo | null } {
  let latest: number | null = null;
  let purchase: (DomainPurchaseInfo & { at: number }) | null = null;
  /*
   * 갱신은 이어 붙인다 — 결제 순서대로, 각 1년은 '결제일'과 '그때까지의 만료일' 중 늦은 날부터 센다.
   * 예전엔 결제일부터만 세서, 만료 30일 전에 갱신하면 남은 30일이 사라졌다(1년을 사고 335일).
   */
  const paidRows = rows.map(row => ({ row, paidAt: String(row.confirmed_at ?? row.created_at ?? "") }))
    .map(item => ({ ...item, paid: new Date(item.paidAt).getTime() }))
    .sort((a, b) => a.paid - b.paid);
  for (const { row, paidAt, paid } of paidRows) {
    const opportunity = (row.opportunity ?? null) as { planId?: string; domainRequest?: unknown } | null;
    if (String(opportunity?.planId ?? "") !== planId) continue;
    if (!Number.isFinite(paid)) continue;
    latest = Math.max(paid, latest ?? paid) + DOMAIN_PRODUCT_DAYS * 86_400_000;
    const request = row.order_name === DOMAIN_PURCHASE_PRODUCT_NAME ? readDomainRequest(opportunity?.domainRequest) : null;
    if (request && (!purchase || paid > purchase.at)) purchase = { ...request, orderId: String(row.order_id ?? ""), paidAt, at: paid };
  }
  const info = purchase ? (({ at: _at, ...rest }) => rest)(purchase) : null;
  if (latest === null) return { active: false, expiresAt: null, purchase: info };
  return { active: latest > now, expiresAt: new Date(latest).toISOString(), purchase: info };
}

export async function domainEntitlement(userId: string | null, planId: string): Promise<{ active: boolean; expiresAt: string | null; purchase: DomainPurchaseInfo | null }> {
  const supabase = getServerSupabase();
  if (!supabase || !userId) return { active: false, expiresAt: null, purchase: null };
  const { data, error } = await supabase
    .from("payment_orders")
    .select("order_id, order_name, opportunity, confirmed_at, created_at")
    .eq("owner_id", userId)
    .in("order_name", [DOMAIN_PRODUCT_NAME, DOMAIN_PURCHASE_PRODUCT_NAME])
    .eq("status", "done")
    .limit(50);
  if (error) throw error;
  return summarizeDomainOrders(data ?? [], planId);
}

export type DomainPurchaseOrder = DomainPurchaseInfo & { customerEmail: string | null; planId: string; amount: number };

/** 관리자: 결제된 도메인 구매 대행 주문(최신순) */
export async function listDomainPurchaseOrders(limit = 100): Promise<DomainPurchaseOrder[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("payment_orders")
    .select("order_id, opportunity, confirmed_at, created_at, customer_email, amount")
    .eq("order_name", DOMAIN_PURCHASE_PRODUCT_NAME)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const opportunity = (row.opportunity ?? null) as { planId?: string; domainRequest?: unknown } | null;
    const request = readDomainRequest(opportunity?.domainRequest);
    if (!request) return [];
    // 자동 등록(.com) 진행 상태 — lib/landing/domain-registrar.ts 가 domainRequest.auto 에 남긴다
    const auto = ((opportunity?.domainRequest ?? null) as { auto?: { state?: string; at?: string; reason?: string } } | null)?.auto;
    return [{ ...request, orderId: String(row.order_id), paidAt: String(row.confirmed_at ?? row.created_at ?? ""), customerEmail: (row.customer_email as string | null) ?? null, planId: String(opportunity?.planId ?? ""), amount: Number(row.amount ?? 0), ...(auto?.state ? { auto: { state: auto.state, at: auto.at ?? "", reason: auto.reason ?? "" } } : {}) }];
  });
}

/** 관리자: 등록을 마쳤다고 표시 — 사장님 연결 화면이 '연결 시작'으로 바뀐다 */
export async function markDomainRegistered(orderId: string, at = new Date().toISOString()): Promise<boolean> {
  const supabase = getServerSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("payment_orders")
    .select("opportunity")
    .eq("order_id", orderId)
    .eq("order_name", DOMAIN_PURCHASE_PRODUCT_NAME)
    .eq("status", "done")
    .maybeSingle();
  if (error) throw error;
  const opportunity = (data?.opportunity ?? null) as Record<string, unknown> | null;
  const request = readDomainRequest(opportunity?.domainRequest);
  if (!opportunity || !request) return false;
  if (request.status === "registered") return true;
  const { error: updateError } = await supabase
    .from("payment_orders")
    // 원래 domainRequest 를 펼쳐 쓴다 — readDomainRequest 는 자동 등록 상태(auto)를 버려, 등록 완료 뒤 관리자 화면에서 사라졌다
    .update({ opportunity: { ...opportunity, domainRequest: { ...(opportunity.domainRequest as Record<string, unknown>), ...request, status: "registered", registeredAt: at } }, updated_at: at })
    .eq("order_id", orderId)
    .eq("status", "done");
  if (updateError) throw updateError;
  return true;
}

/** 토큰 충전 건별 시각·수량 — 유효기간(충전일부터 1년) 계산용. 플랜 단위. */
export async function purchasedTokenBatches(userId: string | null, planId: string): Promise<Array<{ at: number; tokens: number; endsAt?: number }>> {
  const supabase = getServerSupabase();
  if (!supabase || !userId) return [];
  // 환불한 충전분도 가져온다(환불 시각까지만 유효) — 차감 순서가 어긋나지 않게(lib/landing/token-expiry.ts)
  const { data, error } = await supabase
    .from("payment_orders")
    .select("opportunity, confirmed_at, created_at, updated_at, status")
    .eq("owner_id", userId)
    .eq("order_name", TOKEN_PACK_NAME)
    .in("status", ["done", "refunded", "partial_canceled"])
    .limit(500);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => String((row.opportunity as { planId?: string } | null)?.planId ?? "") === planId)
    .filter((row) => row.status === "done" || row.confirmed_at)
    .map((row) => ({
      at: new Date((row.confirmed_at as string | null) ?? (row.created_at as string)).getTime(),
      tokens: TOKEN_PACK_TOKENS,
      ...(row.status === "done" ? {} : { endsAt: new Date((row.updated_at as string | null) ?? Date.now()).getTime() }),
    }));
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
