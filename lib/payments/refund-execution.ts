import { getServerSupabase } from "../persistence";
import { updateProjectPaymentStatus } from "../project-repository";
import { cancelNicepayPaymentDetailed } from "./nicepay-client";
import { nicepayEnvironment } from "./nicepay-environment";
import { getPaymentOrder } from "./repository";
import { getRefundRequest, type RefundRequest } from "./refund-requests";

/*
 * 관리자 환불 처리 — '환불 완료'가 기록만 바꾸던 것을 실제 환급까지 잇는다.
 *
 * 순서가 중요하다.
 *  1. 요청을 received → processing 으로 '잡는다'(조건부 갱신). 두 탭·두 관리자가 동시에 눌러도 한 번만 통과한다.
 *  2. 카드 주문이면 나이스페이로 취소(전액 또는 입력한 금액만). 실패하면 요청을 received 로 되돌리고 사유를 그대로 보여 준다.
 *     옛 계좌이체 주문은 카드 취소가 없으니, 관리자가 계좌로 직접 돌려준 뒤 '계좌로 환급 완료'로만 기록할 수 있다.
 *  3. 주문을 refunded(전액) / partial_canceled(일부)로 바꾼다 — 이용 권한은 done 주문만 보므로 이 순간 그 상품이 닫힌다.
 *  4. 요청을 done 으로.
 * 2가 성공한 뒤 3·4에서 실패해도 돈은 이미 돌아갔다. 요청을 received 로 되돌리면 다시 눌러 이중 취소가 되므로,
 * 그때는 done 으로 두고 메모에 '확인 필요'를 남긴다.
 */

export class RefundError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function won(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

async function setRequestStatus(id: string, from: string, to: string, adminNote?: string): Promise<RefundRequest | null> {
  const supabase = getServerSupabase();
  if (!supabase) throw new RefundError("환불 저장소에 연결하지 못했습니다.", 503);
  const { data, error } = await supabase
    .from("refund_requests")
    .update({ status: to, ...(adminNote !== undefined ? { admin_note: adminNote } : {}), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (error) throw new RefundError("환불 요청 상태를 바꾸지 못했습니다.", 503);
  if (!data?.length) return null;
  return getRefundRequest(id);
}

/** 거절 — 접수 상태인 요청만. 사유는 고객 마이페이지에 보인다. */
export async function rejectRefundRequest(id: string, note: string): Promise<RefundRequest> {
  if (note.trim().length < 5) throw new RefundError("거절 사유를 5자 이상 적어 주세요. 고객에게 그대로 보입니다.");
  const updated = await setRequestStatus(id, "received", "rejected", note.trim());
  if (!updated) throw new RefundError("이미 처리된 요청입니다. 새로고침해 주세요.", 409);
  return updated;
}

/** 환불 완료 — 카드 주문은 실제 취소까지, 계좌이체 주문은 manualTransfer 확인이 있어야 기록한다. */
export async function completeRefundRequest(id: string, input: { amount: number; note: string; manualTransfer?: boolean }): Promise<RefundRequest> {
  const request = await getRefundRequest(id);
  if (!request) throw new RefundError("환불 요청을 찾을 수 없습니다.", 404);
  if (request.status !== "received") throw new RefundError("이미 처리된 요청입니다. 새로고침해 주세요.", 409);

  const order = await getPaymentOrder(request.orderId);
  if (!order) throw new RefundError("이 요청의 결제 주문을 찾을 수 없습니다.", 404);
  if (order.status !== "done") throw new RefundError("결제 완료 상태의 주문만 환불할 수 있습니다. 이미 취소·환불된 주문인지 확인해 주세요.", 409);
  const amount = Math.floor(input.amount);
  if (!Number.isFinite(amount) || amount < 1 || amount > order.amount) {
    throw new RefundError(`환불 금액은 1원 이상 ${won(order.amount)} 이하로 적어 주세요.`);
  }
  const full = amount === order.amount;
  const card = order.method !== "TRANSFER" && Boolean(order.paymentKey);
  if (!card && !input.manualTransfer) {
    throw new RefundError("계좌이체 주문입니다. 고객 계좌로 직접 돌려드린 뒤 '계좌로 환급 완료'로 기록해 주세요.");
  }
  if (card) {
    const mode = nicepayEnvironment().mode;
    if (order.providerStatus?.startsWith("NICEPAY_") && order.providerStatus !== `NICEPAY_${mode}`) {
      throw new RefundError("다른 결제 환경(테스트/실결제)에서 결제된 주문이라 여기서 취소할 수 없습니다. 나이스페이 관리자에서 처리해 주세요.");
    }
  }

  // 1. 잡기 — 동시에 두 번 눌러도 한 번만 진행
  if (!(await setRequestStatus(id, "received", "processing"))) throw new RefundError("이미 처리 중이거나 처리된 요청입니다. 새로고침해 주세요.", 409);

  // 2. 실제 환급
  if (card) {
    const result = await cancelNicepayPaymentDetailed(order.paymentKey!, `고객 환불 요청 처리(${request.reason.slice(0, 40)})`, full ? undefined : amount);
    if (!result.ok) {
      await setRequestStatus(id, "processing", "received").catch(() => null);
      throw new RefundError(`카드 취소에 실패했습니다: ${result.message}. 요청은 '접수됨'으로 그대로 두었습니다.`, 502);
    }
  }

  // 3·4. 주문 닫기와 요청 완료 — 여기서 실패해도 되돌리지 않는다(위 설명)
  const how = card ? (full ? "카드 전액 취소" : "카드 부분 취소") : "계좌 환급";
  const summary = `${won(amount)} ${how}${input.note.trim() ? ` · ${input.note.trim()}` : ""}`;
  let warning = "";
  try {
    const supabase = getServerSupabase()!;
    const { error } = await supabase
      .from("payment_orders")
      .update({ status: full ? "refunded" : "partial_canceled", admin_note: summary })
      .eq("order_id", order.orderId)
      .eq("status", "done");
    if (error) throw error;
    if (order.projectId) await updateProjectPaymentStatus(order.projectId, "refunded");
  } catch {
    warning = " (주문 상태 자동 변경 실패 — 결제 주문을 직접 확인해 주세요)";
  }
  const done = await setRequestStatus(id, "processing", "done", summary + warning);
  if (!done) throw new RefundError(`환급은 끝났지만 요청 기록을 바꾸지 못했습니다. 새로고침 후 확인해 주세요.${warning}`, 500);
  return done;
}

/**
 * 고객 요청 없이 관리자가 먼저 환불할 때(예: 등록할 수 없는 도메인).
 * 같은 처리 순서를 타도록 요청 한 건을 만들어(주문당 하나, unique) 그 요청을 완료한다.
 */
export async function refundOrderByAdmin(orderId: string, input: { amount: number; note: string }): Promise<RefundRequest> {
  if (input.note.trim().length < 5) throw new RefundError("환불 사유를 5자 이상 적어 주세요.");
  const supabase = getServerSupabase();
  if (!supabase) throw new RefundError("환불 저장소에 연결하지 못했습니다.", 503);
  const order = await getPaymentOrder(orderId);
  if (!order) throw new RefundError("결제 주문을 찾을 수 없습니다.", 404);
  const existing = await supabase.from("refund_requests").select("id,status").eq("order_id", orderId).maybeSingle();
  if (existing.error) throw new RefundError("환불 요청을 확인하지 못했습니다.", 503);
  let id = existing.data?.id as string | undefined;
  if (!id) {
    const created = await supabase.from("refund_requests").insert({
      owner_id: order.ownerId ?? "",
      customer_email: order.customerEmail ?? "",
      order_id: order.orderId,
      order_name: order.orderName,
      amount: order.amount,
      reason: `관리자 환불: ${input.note.trim()}`,
    }).select("id").single();
    if (created.error) throw new RefundError("환불 요청을 만들지 못했습니다.", 503);
    id = created.data.id as string;
  }
  return completeRefundRequest(id, input);
}
