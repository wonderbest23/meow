import { getServerSupabase } from "../persistence";
import { notifyOperator } from "../ops-alerts";
import { DOMAIN_PURCHASE_PRODUCT_NAME } from "../payments/domain";
import { markDomainRegistered } from "../payments/plan-orders";
import { readDomainRequest, registrantContact, type DomainRegistrant } from "./domain-purchase";
import { startRegisteredDomainConnection } from "./domain-auto-connect";

/*
 * 도메인 구매 자동화 — Cloudflare Registrar API(공개 문서, 2026 베타).
 *
 * 결제가 끝나면(결제 복귀·결과 확인) 바로 확인(domain-check) → 등록(registrations, 비동기) 을 보내고,
 * 5분 예약 실행이 등록 상태(registration-status)를 확인해 끝나면 '등록 완료' 표시 + 홈페이지 연결 + 사장님 알림까지 한다.
 * 운영자가 가비아에서 손으로 사던 일을 .com 부터 없앤다.
 *
 * - API 로 되는 확장자만: 지금은 .com. .kr·.co.kr 은 Cloudflare 가 팔지 않아 예전처럼 운영자가 손으로(메일 알림 그대로)
 * - 프리미엄 도메인·등록 불가·API 미지원·오류는 자동으로 하지 않고 운영자에게 '손으로 처리' 메일
 * - 등록인은 결제 화면에서 받은 이용자(명의자) 정보 — 약관의 '이용자 명의 등록' 그대로. 명의자 정보가 없는 옛 주문은 손으로
 * - 같은 주문은 한 번만: 주문의 domainRequest.auto 에 진행 상태를 남기고, 이미 있으면 다시 보내지 않는다
 *
 * 환경 변수: CLOUDFLARE_REGISTRAR_TOKEN(Registrar write 권한 API 토큰), CLOUDFLARE_REGISTRAR_ACCOUNT_ID
 * Cloudflare 대시보드에서 결제수단·기본 등록인 연락처·등록 약관 동의가 먼저 돼 있어야 한다.
 */

export const REGISTRAR_API_TLDS = ["com"] as const;
export type AutoRegistrationState = "checking" | "in_progress" | "succeeded" | "manual";
export type AutoRegistration = { state: AutoRegistrationState; at: string; reason?: string; cost?: string };

type Fetch = typeof fetch;
export type RegistrarConfig = { token: string; accountId: string };

export function registrarConfig(env: Record<string, string | undefined> = process.env): RegistrarConfig | null {
  const token = env.CLOUDFLARE_REGISTRAR_TOKEN?.trim() ?? "", accountId = env.CLOUDFLARE_REGISTRAR_ACCOUNT_ID?.trim() ?? "";
  return token && /^[a-f0-9]{32}$/.test(accountId) ? { token, accountId } : null;
}

export function registrarSupports(domain: string): boolean {
  return REGISTRAR_API_TLDS.some((tld) => domain.endsWith(`.${tld}`) && domain.split(".").length === 2);
}

const base = (config: RegistrarConfig) => `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/registrar`;
const authHeaders = (config: RegistrarConfig) => ({ Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" });

export type CheckResult = { registrable: boolean; premium: boolean; reason: string; cost: string };

export async function checkDomain(config: RegistrarConfig, domain: string, fetcher: Fetch = fetch): Promise<CheckResult | null> {
  const response = await fetcher(`${base(config)}/domain-check`, { method: "POST", headers: authHeaders(config), body: JSON.stringify({ domains: [domain] }) });
  const body = await response.json().catch(() => null) as { success?: boolean; result?: { domains?: Array<{ name?: string; registrable?: boolean; tier?: string; reason?: string; pricing?: { currency?: string; registration_cost?: string } }> } } | null;
  const item = body?.result?.domains?.find((entry) => entry.name === domain);
  if (!response.ok || !body?.success || !item) return null;
  return { registrable: item.registrable === true, premium: item.tier === "premium", reason: item.reason ?? "", cost: item.pricing ? `${item.pricing.registration_cost ?? "?"} ${item.pricing.currency ?? ""}`.trim() : "" };
}

export type RegistrationState = "in_progress" | "succeeded" | "failed" | "action_required" | "blocked" | "unknown";

function readState(body: unknown): RegistrationState {
  const state = (body as { result?: { state?: string } } | null)?.result?.state;
  return state === "in_progress" || state === "succeeded" || state === "failed" || state === "action_required" || state === "blocked" ? state : "unknown";
}

/** 등록 요청 — 응답을 오래 기다리지 않게 비동기(Prefer: respond-async)로. 결과는 예약 실행이 확인한다 */
export async function registerDomain(config: RegistrarConfig, domain: string, owner: { registrant: DomainRegistrant; email: string }, fetcher: Fetch = fetch): Promise<RegistrationState> {
  const response = await fetcher(`${base(config)}/registrations`, {
    method: "POST", headers: { ...authHeaders(config), Prefer: "respond-async" },
    body: JSON.stringify({ domain_name: domain, auto_renew: true, privacy_mode: "redaction", contacts: { registrant: registrantContact(owner.registrant, owner.email) } }),
  });
  const body = await response.json().catch(() => null);
  if (response.status === 201 || response.status === 200 || response.status === 202) return readState(body) === "unknown" ? (response.status === 202 ? "in_progress" : "succeeded") : readState(body);
  console.error("[domain-registrar] register rejected", response.status, JSON.stringify(body).slice(0, 300));
  return "failed";
}

export async function registrationStatus(config: RegistrarConfig, domain: string, fetcher: Fetch = fetch): Promise<RegistrationState> {
  const response = await fetcher(`${base(config)}/registrations/${encodeURIComponent(domain)}/registration-status`, { headers: authHeaders(config) });
  if (!response.ok) return "unknown";
  return readState(await response.json().catch(() => null));
}

/* ── 주문에 진행 상태 남기기 ── */

type OrderRow = { order_id: string; opportunity: Record<string, unknown> | null; amount?: number; customer_email?: string | null };

async function loadOrder(orderId: string): Promise<OrderRow | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from("payment_orders").select("order_id, opportunity, amount, customer_email")
    .eq("order_id", orderId).eq("order_name", DOMAIN_PURCHASE_PRODUCT_NAME).eq("status", "done").maybeSingle();
  if (error) throw error;
  return (data as OrderRow | null) ?? null;
}

async function saveAuto(order: OrderRow, auto: AutoRegistration): Promise<void> {
  const opportunity = order.opportunity ?? {};
  const request = (opportunity.domainRequest ?? {}) as Record<string, unknown>;
  const next = { ...opportunity, domainRequest: { ...request, auto } };
  const { error } = await getServerSupabase()!.from("payment_orders").update({ opportunity: next, updated_at: new Date().toISOString() }).eq("order_id", order.order_id).eq("status", "done");
  if (error) throw error;
  order.opportunity = next;
}

/* 자동 등록을 이 실행이 맡는다 — 결제 복귀와 결과 확인이 동시에 와도 한쪽만 true(같은 도메인을 두 번 등록하지 않게) */
async function claimAuto(order: OrderRow, auto: AutoRegistration): Promise<boolean> {
  const opportunity = order.opportunity ?? {};
  const request = (opportunity.domainRequest ?? {}) as Record<string, unknown>;
  const next = { ...opportunity, domainRequest: { ...request, auto } };
  const { data, error } = await getServerSupabase()!.from("payment_orders").update({ opportunity: next, updated_at: new Date().toISOString() })
    .eq("order_id", order.order_id).eq("status", "done").is("opportunity->domainRequest->auto", null).select("order_id");
  if (error) throw error;
  if (!data?.length) return false;
  order.opportunity = next;
  return true;
}

export function readAuto(opportunity: Record<string, unknown> | null | undefined): AutoRegistration | null {
  const auto = (opportunity?.domainRequest as { auto?: AutoRegistration } | undefined)?.auto;
  return auto && typeof auto.state === "string" ? auto : null;
}

async function handOver(order: OrderRow, domain: string, reason: string) {
  await saveAuto(order, { state: "manual", at: new Date().toISOString(), reason });
  await notifyOperator(`도메인 자동 등록을 못 했습니다 — 손으로 처리: ${domain}`, [
    `주문번호: ${order.order_id}`, `도메인: ${domain}`, `이유: ${reason}`, "",
    "등록업체에서 직접 등록한 뒤 /admin/domains 에서 '등록 완료'를 눌러 주세요(연결과 사장님 알림은 그때 자동).",
  ]);
}

async function finish(order: OrderRow, domain: string) {
  await saveAuto(order, { ...(readAuto(order.opportunity) ?? { at: new Date().toISOString() }), state: "succeeded", at: new Date().toISOString() });
  await markDomainRegistered(order.order_id);
  const connection = await startRegisteredDomainConnection(order.order_id);
  if (connection.warning) await notifyOperator(`도메인 등록 완료, 연결은 확인 필요: ${domain}`, [`주문번호: ${order.order_id}`, `경고: ${connection.warning}`]);
}

export type AutoRegisterResult = { started: boolean; state?: AutoRegistrationState | RegistrationState; reason?: string };

/**
 * 결제 직후 — 이 주문을 자동 등록할 수 있으면 시작한다. 던지지 않는다(결제 결과 화면을 막지 않게).
 * 자동이 꺼져 있거나 .kr 같은 확장자면 아무것도 하지 않는다(운영자 메일은 기존 알림이 보낸다).
 */
export async function startAutoRegistration(orderId: string, deps: { config?: RegistrarConfig | null; fetcher?: Fetch } = {}): Promise<AutoRegisterResult> {
  const config = deps.config === undefined ? registrarConfig() : deps.config;
  if (!config) return { started: false, reason: "REGISTRAR_OFF" };
  try {
    const order = await loadOrder(orderId);
    const request = readDomainRequest(order?.opportunity?.domainRequest);
    if (!order || !request || request.status === "registered") return { started: false, reason: "NOT_PENDING" };
    if (!registrarSupports(request.domain)) return { started: false, reason: "TLD_MANUAL" };
    if (readAuto(order.opportunity)) return { started: false, reason: "ALREADY_STARTED" };
    // 이용자 명의로만 등록한다 — 명의자 정보·이메일이 없으면(옛 주문) 운영자가 받아서 손으로
    const email = order.customer_email?.trim() ?? "";
    // 먼저 이 실행이 맡는다 — 동시에 온 다른 실행은 여기서 멈춰 '손으로 처리' 메일도 한 번만 간다
    if (!(await claimAuto(order, { state: "checking", at: new Date().toISOString() }))) return { started: false, reason: "ALREADY_STARTED" };
    if (!request.registrant || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { await handOver(order, request.domain, "명의자 정보 또는 이메일이 없음 — 사장님께 받아 주세요"); return { started: false, state: "manual" }; }
    const check = await checkDomain(config, request.domain, deps.fetcher);
    if (!check) { await handOver(order, request.domain, "등록 가능 여부를 확인하지 못함(API 오류)"); return { started: false, state: "manual" }; }
    if (!check.registrable) { await handOver(order, request.domain, `등록 불가${check.reason ? ` (${check.reason})` : " — 이미 누가 등록했을 수 있음"}`); return { started: false, state: "manual" }; }
    if (check.premium) { await handOver(order, request.domain, `프리미엄 도메인(${check.cost}) — 결제 금액 확인 필요`); return { started: false, state: "manual" }; }
    const state = await registerDomain(config, request.domain, { registrant: request.registrant, email }, deps.fetcher);
    if (state === "succeeded") { await finish(order, request.domain); return { started: true, state }; }
    if (state === "in_progress" || state === "unknown") { await saveAuto(order, { state: "in_progress", at: new Date().toISOString(), cost: check.cost }); return { started: true, state: "in_progress" }; }
    await handOver(order, request.domain, `등록 요청 거절(${state})`);
    return { started: false, state: "manual" };
  } catch (error) {
    console.error("[domain-registrar] start failed", orderId, error);
    return { started: false, reason: "ERROR" };
  }
}

/** 5분 예약 실행 — 진행 중인 자동 등록을 확인해 끝난 것은 연결까지, 실패는 운영자에게 */
export async function pollAutoRegistrations(deps: { config?: RegistrarConfig | null; fetcher?: Fetch } = {}): Promise<{ checked: number; done: number; manual: number }> {
  const config = deps.config === undefined ? registrarConfig() : deps.config;
  const supabase = getServerSupabase();
  const result = { checked: 0, done: 0, manual: 0 };
  if (!config || !supabase) return result;
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data, error } = await supabase.from("payment_orders").select("order_id, opportunity, amount, customer_email")
    .eq("order_name", DOMAIN_PURCHASE_PRODUCT_NAME).eq("status", "done").gte("created_at", since).limit(100);
  if (error) throw error;
  for (const row of (data ?? []) as OrderRow[]) {
    const auto = readAuto(row.opportunity);
    const request = readDomainRequest(row.opportunity?.domainRequest);
    if (!request || request.status === "registered" || auto?.state !== "in_progress") continue;
    result.checked++;
    const state = await registrationStatus(config, request.domain, deps.fetcher);
    if (state === "succeeded") { await finish(row, request.domain); result.done++; }
    else if (state === "failed" || state === "action_required" || state === "blocked") { await handOver(row, request.domain, `등록 ${state}`); result.manual++; }
    // 하루가 넘도록 진행 중이면 사람이 본다
    else if (Date.now() - Date.parse(auto.at) > 86_400_000) { await handOver(row, request.domain, "하루 넘게 진행 중"); result.manual++; }
  }
  return result;
}
