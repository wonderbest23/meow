import { getServerSupabase } from "../persistence";
import { reconcileNicepayOrder } from "./nicepay-reconciliation";
import { getPlanOrder } from "./plan-orders";
import { notifyPaymentComplete } from "./paid-notifications";
import { notifyDomainPurchasePaid, notifyOperator } from "../ops-alerts";
import { startAutoRegistration } from "../landing/domain-registrar";

/*
 * 승인 응답을 놓친 카드 결제 되살리기 — 결과 화면을 닫아 버리면 주문이 confirming 에 남고,
 * 카드는 결제됐는데 권한이 안 열리며 같은 상품 재결제도 '확인 중'으로 막힌다.
 * 5분 예약 실행에서 5분 넘게 멈춘 주문을 나이스페이 조회(읽기만, 재승인 없음)로 다시 맞춘다.
 * 완료되면 결과 화면 경로와 같은 후속(도메인 구매 알림·자동 등록, 결제 완료 알림)을 한 번 한다.
 * 30분이 지나도 확인이 안 되면 운영자에게 한 번 메일(5분 간격 실행이라 30~35분 창에 한 번만 걸린다).
 */

const MIN_AGE_MS = 5 * 60_000;
const ALERT_AFTER_MS = 30 * 60_000;
const ALERT_WINDOW_MS = 5 * 60_000;
const MAX_AGE_MS = 7 * 86_400_000;

export async function sweepConfirmingOrders(limit = 10, now = Date.now()): Promise<{ checked: number; settled: number; alerted: number; reason?: string }> {
  const db = getServerSupabase();
  if (!db) return { checked: 0, settled: 0, alerted: 0, reason: "no_database" };
  const { data, error } = await db.from("payment_orders").select("order_id, order_name, amount, created_at")
    .eq("status", "confirming").like("provider_status", "NICEPAY_%")
    .lt("created_at", new Date(now - MIN_AGE_MS).toISOString()).gt("created_at", new Date(now - MAX_AGE_MS).toISOString())
    .order("created_at", { ascending: true }).limit(limit);
  if (error) return { checked: 0, settled: 0, alerted: 0, reason: `query_failed:${error.code ?? "unknown"}` };
  const result = { checked: 0, settled: 0, alerted: 0 };
  for (const row of (data ?? []) as Array<{ order_id: string; order_name: string; amount: number; created_at: string }>) {
    result.checked += 1;
    const before = await getPlanOrder(row.order_id).catch(() => null);
    const settled = await reconcileNicepayOrder({ orderId: row.order_id }).catch(() => ({ status: "pending" as const }));
    if (settled.status === "ok") {
      result.settled += 1;
      if (before?.product === "domain-purchase") {
        await notifyDomainPurchasePaid(before).catch(() => undefined);
        await startAutoRegistration(row.order_id).catch(() => undefined);
      }
      await notifyPaymentComplete(row.order_id, true).catch(() => undefined);
      continue;
    }
    const age = now - Date.parse(row.created_at);
    if (settled.status === "pending" && age >= ALERT_AFTER_MS && age < ALERT_AFTER_MS + ALERT_WINDOW_MS) {
      result.alerted += 1;
      await notifyOperator(`카드 결제 확인 안 됨 · ${row.order_name}`, [
        `주문번호: ${row.order_id}`, `금액: ${Number(row.amount).toLocaleString("ko-KR")}원`,
        "30분째 '승인 확인 중'이에요. 나이스페이 관리자에서 이 거래가 승인됐는지 확인해 주세요.",
        "승인됐다면 고객이 /plan/me 에서 '결제 다시 확인'을 누르거나, 5분마다 자동으로 다시 확인해요.",
      ]).catch(() => undefined);
    }
  }
  return result;
}
