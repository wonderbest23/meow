import { createHash } from "node:crypto";
import { getServerSupabase, serverPersistenceMode } from "../persistence";
import {
  createProject,
  getProject,
  updateProjectPaymentStatus,
} from "../project-repository";
import type { ProjectRecord } from "../service-domain";
import {
  MANUAL_TRANSFER_DEPOSIT_HOURS,
} from "./manual-transfer";
import {
  PACKAGE_AMOUNT,
  PACKAGE_NAME,
  TERMS_VERSION,
  type CashReceiptType,
  type PaymentMethod,
  type PaymentOrder,
  type PaymentOrderStatus,
  type TossPaymentResponse,
} from "./domain";

type DemoPaymentStore = {
  orders: Map<string, PaymentOrder>;
  events: Set<string>;
};

declare global {
  var __venturePaymentStore: DemoPaymentStore | undefined;
}

const demo =
  globalThis.__venturePaymentStore ??
  (globalThis.__venturePaymentStore = { orders: new Map(), events: new Set() });

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mapOrder(row: Record<string, unknown>): PaymentOrder {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    guestTokenHash: row.guest_token_hash as string,
    amount: row.amount as number,
    currency: row.currency as "KRW",
    orderName: row.order_name as string,
    ownerId: (row.owner_id as string | null) ?? null,
    customerEmail: (row.customer_email as string | null) ?? null,
    method: row.method as PaymentMethod,
    status: row.status as PaymentOrderStatus,
    providerStatus: (row.provider_status as string | null) ?? null,
    paymentKey: (row.payment_key as string | null) ?? null,
    projectId: (row.project_id as string | null) ?? null,
    opportunity: row.opportunity as Record<string, unknown>,
    founderProfile: (row.founder_profile ?? {}) as Record<string, unknown>,
    termsVersion: row.terms_version as string,
    termsAgreedAt: row.terms_agreed_at as string,
    rawResponse: (row.raw_response as Record<string, unknown> | null) ?? null,
    failureCode: (row.failure_code as string | null) ?? null,
    failureMessage: (row.failure_message as string | null) ?? null,
    expiresAt: row.expires_at as string,
    confirmedAt: (row.confirmed_at as string | null) ?? null,
    depositorName: (row.depositor_name as string | null) ?? null,
    customerPhone: (row.customer_phone as string | null) ?? null,
    cashReceiptType: (row.cash_receipt_type as CashReceiptType | null) ?? null,
    cashReceiptIdentifier: (row.cash_receipt_identifier as string | null) ?? null,
    cashReceiptStatus: (row.cash_receipt_status as PaymentOrder["cashReceiptStatus"] | null) ?? "not_requested",
    cashReceiptIssuedAt: (row.cash_receipt_issued_at as string | null) ?? null,
    depositReportedAt: (row.deposit_reported_at as string | null) ?? null,
    adminNote: (row.admin_note as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function paymentPersistenceMode() {
  return serverPersistenceMode();
}

export async function createPaymentOrder(input: {
  guestTokenHash: string;
  ownerId: string | null;
  customerEmail: string | null;
  opportunity: Record<string, unknown>;
  founderProfile: Record<string, unknown>;
  method: PaymentMethod;
  customer?: {
    depositorName: string;
    phone: string;
    cashReceiptType: CashReceiptType;
    cashReceiptIdentifier: string;
  };
}): Promise<PaymentOrder> {
  const now = new Date();
  const order: PaymentOrder = {
    id: crypto.randomUUID(),
    orderId: `VL-${now.getTime().toString(36)}-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
    guestTokenHash: input.guestTokenHash,
    amount: PACKAGE_AMOUNT,
    currency: "KRW",
    orderName: PACKAGE_NAME,
    ownerId: input.ownerId,
    customerEmail: input.customerEmail,
    method: input.method,
    status: input.method === "TRANSFER" ? "awaiting_deposit" : "created",
    providerStatus: null,
    paymentKey: null,
    projectId: null,
    opportunity: input.opportunity,
    founderProfile: input.founderProfile,
    termsVersion: TERMS_VERSION,
    termsAgreedAt: now.toISOString(),
    rawResponse: null,
    failureCode: null,
    failureMessage: null,
    expiresAt: new Date(now.getTime() + (input.method === "TRANSFER" ? MANUAL_TRANSFER_DEPOSIT_HOURS * 60 * 60_000 : 30 * 60_000)).toISOString(),
    confirmedAt: null,
    depositorName: input.customer?.depositorName ?? null,
    customerPhone: input.customer?.phone ?? null,
    cashReceiptType: input.customer?.cashReceiptType ?? null,
    cashReceiptIdentifier: input.customer?.cashReceiptType === "NONE" ? null : input.customer?.cashReceiptIdentifier ?? null,
    cashReceiptStatus: input.customer ? "requested" : "not_requested",
    cashReceiptIssuedAt: null,
    depositReportedAt: null,
    adminNote: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const supabase = getServerSupabase();
  if (!supabase) {
    demo.orders.set(order.orderId, clone(order));
    return clone(order);
  }
  const { data, error } = await supabase
    .from("payment_orders")
    .insert({
      id: order.id,
      order_id: order.orderId,
      guest_token_hash: order.guestTokenHash,
      amount: order.amount,
      currency: order.currency,
      order_name: order.orderName,
      owner_id: order.ownerId,
      customer_email: order.customerEmail,
      method: order.method,
      status: order.status,
      opportunity: order.opportunity,
      founder_profile: order.founderProfile,
      terms_version: order.termsVersion,
      terms_agreed_at: order.termsAgreedAt,
      expires_at: order.expiresAt,
      depositor_name: order.depositorName,
      customer_phone: order.customerPhone,
      cash_receipt_type: order.cashReceiptType,
      cash_receipt_identifier: order.cashReceiptIdentifier,
      cash_receipt_status: order.cashReceiptStatus,
    })
    .select()
    .single();
  if (error) throw error;
  return mapOrder(data);
}

export async function getPaymentOrder(
  orderId: string,
  guestTokenHash?: string,
): Promise<PaymentOrder | null> {
  const supabase = getServerSupabase();
  if (!supabase) {
    const order = demo.orders.get(orderId);
    if (!order || (guestTokenHash && order.guestTokenHash !== guestTokenHash)) return null;
    return clone(order);
  }
  let query = supabase.from("payment_orders").select("*").eq("order_id", orderId);
  if (guestTokenHash) query = query.eq("guest_token_hash", guestTokenHash);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? mapOrder(data) : null;
}

export async function getPaymentOrderByKey(paymentKey: string): Promise<PaymentOrder | null> {
  const supabase = getServerSupabase();
  if (!supabase) {
    const order = [...demo.orders.values()].find((item) => item.paymentKey === paymentKey);
    return order ? clone(order) : null;
  }
  const { data, error } = await supabase
    .from("payment_orders")
    .select("*")
    .eq("payment_key", paymentKey)
    .maybeSingle();
  if (error) throw error;
  return data ? mapOrder(data) : null;
}

export async function completePaymentOrder(input: {
  order: PaymentOrder;
  provider: TossPaymentResponse | Record<string, unknown>;
  testPaid: boolean;
}): Promise<{ order: PaymentOrder; project: ProjectRecord }> {
  if (input.order.projectId) {
    const project = await getProject(input.order.projectId, input.order.guestTokenHash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    return { order: input.order, project };
  }
  const now = new Date().toISOString();
  const paymentKey =
    typeof input.provider.paymentKey === "string"
      ? input.provider.paymentKey
      : `test_${input.order.orderId}`;
  const providerStatus =
    typeof input.provider.status === "string" ? input.provider.status : "TEST_DONE";
  const supabase = getServerSupabase();
  if (!supabase) {
    const stored = demo.orders.get(input.order.orderId);
    if (!stored) throw new Error("PAYMENT_ORDER_NOT_FOUND");
    if (stored.projectId) {
      const existing = await getProject(stored.projectId, stored.guestTokenHash);
      if (!existing) throw new Error("PROJECT_NOT_FOUND");
      return { order: clone(stored), project: existing };
    }
    const project = await createProject(
      {
        opportunity: stored.opportunity,
        founderProfile: stored.founderProfile,
        paymentStatus: input.testPaid ? "test_paid" : "paid",
      },
      stored.guestTokenHash,
      stored.ownerId,
    );
    Object.assign(stored, {
      status: "done" as const,
      providerStatus,
      paymentKey,
      projectId: project.id,
      rawResponse: input.provider,
      confirmedAt: now,
      updatedAt: now,
    });
    return { order: clone(stored), project };
  }
  const { data, error } = await supabase.rpc("complete_payment_order", {
    p_order_id: input.order.orderId,
    p_guest_token_hash: input.order.guestTokenHash,
    p_payment_key: paymentKey,
    p_provider_status: providerStatus,
    p_raw_response: input.provider,
    p_test_paid: input.testPaid,
  });
  if (error) throw error;
  const projectId = typeof data === "string" ? data : (data as { project_id?: string })?.project_id;
  if (!projectId) throw new Error("PAYMENT_COMPLETION_FAILED");
  const [order, project] = await Promise.all([
    getPaymentOrder(input.order.orderId, input.order.guestTokenHash),
    getProject(projectId, input.order.guestTokenHash),
  ]);
  if (!order || !project) throw new Error("PAYMENT_COMPLETION_FAILED");
  return { order, project };
}

export async function markPaymentFailure(
  orderId: string,
  guestTokenHash: string,
  code: string,
  message: string,
) {
  const supabase = getServerSupabase();
  if (!supabase) {
    const order = demo.orders.get(orderId);
    if (!order || order.guestTokenHash !== guestTokenHash) return;
    order.status = "failed";
    order.failureCode = code;
    order.failureMessage = message;
    order.updatedAt = new Date().toISOString();
    return;
  }
  await supabase.from("payment_orders").update({
    status: "failed",
    failure_code: code,
    failure_message: message,
  }).eq("order_id", orderId).eq("guest_token_hash", guestTokenHash);
}

function localStatus(providerStatus: string): PaymentOrderStatus {
  if (providerStatus === "DONE") return "done";
  if (providerStatus === "CANCELED") return "canceled";
  if (providerStatus === "PARTIAL_CANCELED") return "partial_canceled";
  if (providerStatus === "ABORTED") return "aborted";
  if (providerStatus === "EXPIRED") return "expired";
  return "confirming";
}

export async function syncPaymentFromProvider(
  order: PaymentOrder,
  provider: TossPaymentResponse,
): Promise<PaymentOrder> {
  const status = localStatus(provider.status);
  const now = new Date().toISOString();
  const supabase = getServerSupabase();
  if (!supabase) {
    const stored = demo.orders.get(order.orderId);
    if (!stored) throw new Error("PAYMENT_ORDER_NOT_FOUND");
    stored.status = status;
    stored.providerStatus = provider.status;
    stored.paymentKey = provider.paymentKey;
    stored.rawResponse = provider;
    stored.updatedAt = now;
    if (order.projectId && ["canceled", "partial_canceled"].includes(status)) {
      await updateProjectPaymentStatus(
        order.projectId,
        status === "canceled" ? "refunded" : "paid",
      );
    }
    return clone(stored);
  }
  const { data, error } = await supabase
    .from("payment_orders")
    .update({
      status,
      provider_status: provider.status,
      payment_key: provider.paymentKey,
      raw_response: provider,
    })
    .eq("order_id", order.orderId)
    .select()
    .single();
  if (error) throw error;
  if (order.projectId && ["canceled", "partial_canceled"].includes(status)) {
    await updateProjectPaymentStatus(
      order.projectId,
      status === "canceled" ? "refunded" : "paid",
    );
  }
  return mapOrder(data);
}

export async function listManualTransferOrders(): Promise<PaymentOrder[]> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return [...demo.orders.values()]
      .filter((order) => order.method === "TRANSFER")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }
  const { data, error } = await supabase
    .from("payment_orders")
    .select("*")
    .eq("method", "TRANSFER")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(mapOrder);
}

export async function reportManualTransferDeposit(orderId: string, guestTokenHash: string): Promise<PaymentOrder> {
  const order = await getPaymentOrder(orderId, guestTokenHash);
  if (!order || order.method !== "TRANSFER") throw new Error("PAYMENT_ORDER_NOT_FOUND");
  if (order.status === "done") return order;
  if (Date.parse(order.expiresAt) <= Date.now()) throw new Error("PAYMENT_ORDER_EXPIRED");
  if (!["awaiting_deposit", "deposit_reported"].includes(order.status)) throw new Error("PAYMENT_ORDER_NOT_REPORTABLE");
  const now = new Date().toISOString();
  const supabase = getServerSupabase();
  if (!supabase) {
    const stored = demo.orders.get(orderId)!;
    stored.status = "deposit_reported";
    stored.depositReportedAt = now;
    stored.updatedAt = now;
    return clone(stored);
  }
  const { data, error } = await supabase.from("payment_orders").update({
    status: "deposit_reported",
    deposit_reported_at: now,
  }).eq("order_id", orderId).eq("guest_token_hash", guestTokenHash).select().single();
  if (error) throw error;
  return mapOrder(data);
}

export async function completeManualTransferOrder(order: PaymentOrder, adminNote: string): Promise<{ order: PaymentOrder; project: ProjectRecord }> {
  if (order.method !== "TRANSFER") throw new Error("MANUAL_TRANSFER_ONLY");
  if (order.status === "done" && order.projectId) return completePaymentOrder({ order, provider: order.rawResponse ?? {}, testPaid: false });
  if (!["awaiting_deposit", "deposit_reported"].includes(order.status)) throw new Error("PAYMENT_ORDER_NOT_CONFIRMABLE");
  if (Date.parse(order.expiresAt) <= Date.now()) throw new Error("PAYMENT_ORDER_EXPIRED");
  const provider = {
    paymentKey: `manual_${order.orderId}`,
    orderId: order.orderId,
    status: "MANUAL_CONFIRMED",
    method: "계좌이체",
    confirmedBy: "admin",
    adminNote,
    approvedAt: new Date().toISOString(),
  };
  const completed = await completePaymentOrder({ order, provider, testPaid: false });
  const supabase = getServerSupabase();
  if (!supabase) {
    const stored = demo.orders.get(order.orderId);
    if (stored) stored.adminNote = adminNote || null;
  } else {
    await supabase.from("payment_orders").update({ admin_note: adminNote || null }).eq("order_id", order.orderId);
  }
  return {
    order: (await getPaymentOrder(order.orderId, order.guestTokenHash)) ?? completed.order,
    project: completed.project,
  };
}

export async function cancelManualTransferOrder(orderId: string, adminNote: string): Promise<PaymentOrder> {
  const order = await getPaymentOrder(orderId);
  if (!order || order.method !== "TRANSFER") throw new Error("PAYMENT_ORDER_NOT_FOUND");
  if (order.status === "done" || order.status === "refunded") throw new Error("PAID_ORDER_CANNOT_BE_CANCELED");
  const supabase = getServerSupabase();
  if (!supabase) {
    const stored = demo.orders.get(orderId)!;
    stored.status = "canceled";
    stored.adminNote = adminNote || null;
    stored.updatedAt = new Date().toISOString();
    return clone(stored);
  }
  const { data, error } = await supabase.from("payment_orders").update({
    status: "canceled",
    admin_note: adminNote || null,
  }).eq("order_id", orderId).select().single();
  if (error) throw error;
  return mapOrder(data);
}

export async function refundManualTransferOrder(orderId: string, adminNote: string): Promise<PaymentOrder> {
  const order = await getPaymentOrder(orderId);
  if (!order || order.method !== "TRANSFER") throw new Error("PAYMENT_ORDER_NOT_FOUND");
  if (order.status !== "done" || !order.projectId) throw new Error("PAYMENT_ORDER_NOT_REFUNDABLE");
  if (adminNote.trim().length < 5) throw new Error("REFUND_EXCEPTION_REASON_REQUIRED");
  const supabase = getServerSupabase();
  if (!supabase) {
    const stored = demo.orders.get(orderId)!;
    stored.status = "refunded";
    stored.adminNote = adminNote || null;
    stored.updatedAt = new Date().toISOString();
    await updateProjectPaymentStatus(order.projectId, "refunded");
    return clone(stored);
  }
  const { data, error } = await supabase.from("payment_orders").update({
    status: "refunded",
    admin_note: adminNote || null,
  }).eq("order_id", orderId).select().single();
  if (error) throw error;
  await updateProjectPaymentStatus(order.projectId, "refunded");
  return mapOrder(data);
}

export async function markManualCashReceiptIssued(orderId: string, adminNote: string): Promise<PaymentOrder> {
  const order = await getPaymentOrder(orderId);
  if (!order || order.method !== "TRANSFER") throw new Error("PAYMENT_ORDER_NOT_FOUND");
  if (order.status !== "done") throw new Error("CASH_RECEIPT_PAYMENT_NOT_CONFIRMED");
  if (order.cashReceiptStatus !== "requested") throw new Error("CASH_RECEIPT_NOT_REQUESTED");
  const now = new Date().toISOString();
  const supabase = getServerSupabase();
  if (!supabase) {
    const stored = demo.orders.get(orderId)!;
    stored.cashReceiptStatus = "issued";
    stored.cashReceiptIssuedAt = now;
    stored.adminNote = adminNote || stored.adminNote;
    stored.updatedAt = now;
    return clone(stored);
  }
  const { data, error } = await supabase.from("payment_orders").update({
    cash_receipt_status: "issued",
    cash_receipt_issued_at: now,
    admin_note: adminNote || order.adminNote,
  }).eq("order_id", orderId).select().single();
  if (error) throw error;
  return mapOrder(data);
}

export async function recordPaymentEvent(
  transmissionId: string | null,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const eventId =
    transmissionId ??
    createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const supabase = getServerSupabase();
  if (!supabase) {
    if (demo.events.has(eventId)) return false;
    demo.events.add(eventId);
    return true;
  }
  const { error } = await supabase.from("payment_events").insert({
    transmission_id: eventId,
    event_type: eventType,
    payload,
  });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}
