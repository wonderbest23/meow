import { getServerSupabase } from "../persistence";

/**
 * 환불 요청 접수함.
 * 사용자: 결제 완료(done) 주문에 대해 사유와 함께 접수.
 * 어드민: received → done(환불 완료) | rejected(거절) 처리.
 * 실제 환급(카드 취소·계좌 이체)은 외부에서 하고 여기에는 결과만 기록한다.
 */

export type RefundStatus = "received" | "done" | "rejected";

export interface RefundRequest {
  id: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  customerEmail: string;
  orderId: string;
  orderName: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  adminNote: string;
}

function mapRow(row: Record<string, unknown>): RefundRequest {
  return {
    id: String(row.id ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    ownerId: String(row.owner_id ?? ""),
    customerEmail: String(row.customer_email ?? ""),
    orderId: String(row.order_id ?? ""),
    orderName: String(row.order_name ?? ""),
    amount: Number(row.amount ?? 0),
    reason: String(row.reason ?? ""),
    status: (String(row.status ?? "received") as RefundStatus),
    adminNote: String(row.admin_note ?? ""),
  };
}

/** 테이블 미생성(마이그레이션 전) 오류인지 */
function isMissingTable(error: { message?: string } | null): boolean {
  return Boolean(error?.message?.includes("refund_requests"));
}

export async function listMyRefundRequests(ownerId: string): Promise<RefundRequest[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("refund_requests")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => mapRow(row));
}

export async function createRefundRequest(input: {
  ownerId: string;
  customerEmail: string;
  orderId: string;
  orderName: string;
  amount: number;
  reason: string;
}): Promise<RefundRequest> {
  const supabase = getServerSupabase();
  if (!supabase) throw new Error("REFUND_STORE_UNAVAILABLE");
  const { data, error } = await supabase
    .from("refund_requests")
    .insert({
      owner_id: input.ownerId,
      customer_email: input.customerEmail,
      order_id: input.orderId,
      order_name: input.orderName,
      amount: input.amount,
      reason: input.reason,
    })
    .select("*")
    .single();
  if (error) {
    if (error.message?.includes("duplicate") || error.code === "23505") throw new Error("REFUND_ALREADY_REQUESTED");
    if (isMissingTable(error)) throw new Error("REFUND_STORE_UNAVAILABLE");
    throw error;
  }
  return mapRow(data as Record<string, unknown>);
}

export async function listAllRefundRequests(): Promise<RefundRequest[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("refund_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => mapRow(row));
}

export async function updateRefundRequest(id: string, status: RefundStatus, adminNote: string): Promise<RefundRequest> {
  const supabase = getServerSupabase();
  if (!supabase) throw new Error("REFUND_STORE_UNAVAILABLE");
  const { data, error } = await supabase
    .from("refund_requests")
    .update({ status, admin_note: adminNote, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

/** 접수 상태(대기) 건수 — 대시보드용. 테이블 없으면 null. */
export async function countPendingRefundRequests(): Promise<number | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { count, error } = await supabase
    .from("refund_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "received");
  if (error || count === null) return null;
  return count;
}
