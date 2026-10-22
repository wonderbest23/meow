import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * 어드민 매출 — 받은 돈(매출), 돌려준 돈(환불), 남은 돈(순매출).
 *
 * 돌려준 금액은 두 군데에서 온다.
 *  - 웹 결제(카드·계좌): 환불 요청을 완료하면 처리 메모 맨 앞에 '12,000원 카드 취소 …' 로 남는다(refund-execution.ts).
 *    부분 환불·묶음 일부 환불은 주문이 done/partial_canceled 로 남으므로 이 메모 금액만 뺀다.
 *  - 앱 결제(Apple·Google): 스토어 환불 알림이 주문을 refunded 로 바꿀 뿐 환불 요청 기록이 없다(markStoreOrderRefunded).
 *    예전 집계는 메모만 빼서 앱 환불이 매출에 그대로 남았다 — 메모가 없는 refunded 주문은 전액을 돌려준 것으로 본다
 *    (관리자가 계좌이체 주문을 바로 환불한 refundManualTransferOrder 도 같은 경우다).
 */

const PAGE = 1000;
const MAX_ROWS = 100_000;
/** 매출에 넣는 주문 상태 — 부분·전액 환불된 주문도 한 번은 받은 돈이다 */
export const REVENUE_STATUSES = ["done", "partial_canceled", "refunded"] as const;
const STORE_METHODS = new Set(["APPLE_IAP", "GOOGLE_IAP"]);

export type RevenueOrderRow = { order_id: string; amount: number; status: string; method: string };
export type RefundNoteRow = { order_id: string; admin_note: string | null };
export type RevenueSummary = {
  /** 받은 돈 합계 */
  gross: number;
  /** 돌려준 돈 합계(웹 + 앱) */
  refunded: number;
  /** 그중 앱 스토어(Apple·Google) 환불 */
  storeRefunded: number;
  /** 매출 − 환불 */
  net: number;
};

/** 환불 처리 메모의 맨 앞 금액 — completeRefundRequest 가 '12,000원 …' 으로 남긴다 */
export function refundedWon(note: unknown): number {
  const match = /^\s*([\d,]+)원/.exec(String(note ?? ""));
  return match ? Number(match[1].replace(/,/g, "")) || 0 : 0;
}

/** 주문별로 돌려준 금액을 정해 합친다 — 메모 금액이 있으면 그것(주문 금액 넘지 않게), 없고 refunded 면 전액 */
export function summarizeRevenue(orders: RevenueOrderRow[], refundNotes: RefundNoteRow[]): RevenueSummary {
  const noted = new Map<string, number>();
  for (const row of refundNotes) {
    const won = refundedWon(row.admin_note);
    if (won > 0) noted.set(row.order_id, (noted.get(row.order_id) ?? 0) + won);
  }
  let gross = 0, refunded = 0, storeRefunded = 0;
  for (const order of orders) {
    if (!(REVENUE_STATUSES as readonly string[]).includes(order.status)) continue;
    const amount = Math.max(0, Number(order.amount) || 0);
    gross += amount;
    const back = noted.has(order.order_id) ? Math.min(amount, noted.get(order.order_id)!) : order.status === "refunded" ? amount : 0;
    refunded += back;
    if (STORE_METHODS.has(order.method)) storeRefunded += back;
  }
  return { gross, refunded, storeRefunded, net: Math.max(0, gross - refunded) };
}

/**
 * 매출 집계를 읽는다. Supabase 는 한 번에 최대 1000행만 돌려주므로 끝까지 페이지로 읽고,
 * 중간에 실패하면 틀린 숫자 대신 null 을 돌려준다(화면은 '—').
 */
export async function loadRevenueSummary(supabase: SupabaseClient): Promise<RevenueSummary | null> {
  const orders: RevenueOrderRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await supabase
      .from("payment_orders")
      .select("order_id, amount, status, method")
      .in("status", [...REVENUE_STATUSES])
      .order("order_id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return null;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    for (const row of rows) orders.push({ order_id: String(row.order_id ?? ""), amount: Number(row.amount ?? 0), status: String(row.status ?? ""), method: String(row.method ?? "") });
    if (rows.length < PAGE) break;
  }
  // 완료된 환불 요청의 처리 메모(돌려준 금액) — 주문 번호로 짝을 짓는다(주문당 요청 하나, unique)
  const notes: RefundNoteRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await supabase
      .from("refund_requests")
      .select("order_id, admin_note")
      .eq("status", "done")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return null;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    for (const row of rows) notes.push({ order_id: String(row.order_id ?? ""), admin_note: row.admin_note == null ? null : String(row.admin_note) });
    if (rows.length < PAGE) break;
  }
  return summarizeRevenue(orders, notes);
}
