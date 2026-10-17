import { getServerSupabase } from "../persistence";
import { approveNicepayPayment, lookupNicepayPayment, type NicepayApproveResult } from "./nicepay-client";
import { nicepayEnvironment } from "./nicepay-environment";
import { getPlanOrder } from "./plan-orders";

export type ReconciliationResult = { status: "ok" | "pending" | "fail"; reason?: string };
const pending = (): ReconciliationResult => ({ status: "pending", reason: "카드사 승인 결과가 아직 오지 않았어요. 다시 결제하지 말고 잠시 뒤 아래 단추로 다시 확인해 주세요." });
const failed = (): ReconciliationResult => ({ status: "fail", reason: "완료되지 않은 결제입니다. 주문 내역을 확인해주세요." });

function verified(result: NicepayApproveResult | null, orderId: string, tid: string, amount: number) {
  return result?.resultCode === "0000" && result.orderId === orderId && result.tid === tid
    && result.amount === amount && result.raw.currency === "KRW";
}

export async function reconcileNicepayOrder(input: { orderId: string; tid?: string; allowApproval?: boolean; ownerId?: string }): Promise<ReconciliationResult> {
  const db = getServerSupabase();
  if (!db) return pending();
  let order = await getPlanOrder(input.orderId);
  if (!order || (input.ownerId !== undefined && order.ownerId !== input.ownerId)) throw new Error("PAYMENT_ORDER_NOT_FOUND");
  const tid = input.tid ?? order.paymentKey;
  if (!tid || (order.paymentKey && order.paymentKey !== tid)) return failed();
  if (order.status === "done") return { status: "ok" };
  if (!["created", "confirming"].includes(order.status)) return failed();
  const environment = nicepayEnvironment().mode;
  let claimed = false;
  if (order.status === "created") {
    if (!input.allowApproval) return failed();
    if (!Number.isFinite(Date.parse(order.expiresAt)) || Date.parse(order.expiresAt) <= Date.now()) return failed();
    const claim = await db.rpc("claim_nicepay_plan_order", { p_order_id: order.orderId, p_tid: tid, p_environment: environment });
    if (claim.error) return pending();
    claimed = claim.data === true;
    order = await getPlanOrder(order.orderId);
    if (!order) return pending();
  }
  if (order.paymentKey !== tid || order.providerStatus !== `NICEPAY_${environment}`) return failed();
  if (order.status === "done") return { status: "ok" };
  if (order.status !== "confirming") return failed();
  // The durable claim is never released for another approval attempt, even after a crash.
  let result = claimed ? await approveNicepayPayment(tid, order.amount).catch(() => null) : null;
  if (!result?.ok || !verified(result, order.orderId, tid, order.amount)) {
    result = await lookupNicepayPayment(tid, order.amount).catch(() => null);
  }
  if (!verified(result, order.orderId, tid, order.amount) || !["paid", "failed", "cancelled", "partialCancelled", "expired"].includes(result!.status ?? "")) return pending();
  // Store only reconciliation fields, never buyer details or authentication tokens.
  const raw = { resultCode: result!.resultCode, tid, orderId: order.orderId, amount: result!.amount, currency: "KRW", status: result!.status, paidAt: result!.paidAt };
  const settled = await db.rpc("settle_nicepay_plan_order", { p_order_id: order.orderId, p_tid: tid, p_environment: environment, p_raw: raw });
  if (settled.error) return pending();
  return settled.data === "done" ? { status: "ok" } : failed();
}
