import { getServerSupabase } from "../persistence";
import { updateProjectPaymentStatus } from "../project-repository";
import { cancelNicepayPaymentDetailed, lookupNicepayPayment } from "./nicepay-client";
import { nicepayEnvironment } from "./nicepay-environment";
import { getPaymentOrder } from "./repository";
import { getRefundRequest, type RefundRequest } from "./refund-requests";
import { closeRefundedProduct, orderProduct } from "./refund-effects";

/*
 * 관리자 환불 처리 — '환불 완료'가 기록만 바꾸던 것을 실제 환급까지 잇는다.
 *
 * 순서가 중요하다.
 *  1. 요청을 received → processing 으로 '잡는다'(조건부 갱신). 두 탭·두 관리자가 동시에 눌러도 한 번만 통과한다.
 *  2. 카드 주문이면 나이스페이로 취소(전액 또는 입력한 금액만). 실패하면 요청을 received 로 되돌리고 사유를 그대로 보여 준다.
 *     옛 계좌이체 주문은 카드 취소가 없으니, 관리자가 계좌로 직접 돌려준 뒤 '계좌로 환급 완료'로만 기록할 수 있다.
 *  3. 주문을 refunded(전액) / partial_canceled(일부)로 바꾼다 — 이용 권한은 done 주문만 보므로 결제 확인이 닫히고,
 *     이미 만들어진 것(다시 생성 추가분·공개 홈페이지·연결한 도메인)은 refund-effects.ts 가 닫는다.
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
/** 나이스페이 조회로 '이미 취소됨'을 확인 — 전액이면 cancelled, 일부면 남은 금액(balanceAmt)까지 맞아야 한다 */
async function alreadyCanceledAtNicepay(tid: string, orderAmount: number, expectedBalance: number): Promise<boolean> {
  const found = await lookupNicepayPayment(tid, orderAmount).catch(() => null);
  if (!found || found.resultCode !== "0000" || found.tid !== tid) return false;
  if (expectedBalance === 0) return found.status === "cancelled";
  return found.status === "partialCancelled" && found.raw.balanceAmt === expectedBalance;
}

const STUCK_AFTER_MS = 2 * 60_000;

/**
 * '처리 중'에 멈춘 요청 마무리 — 카드 취소 뒤 기록 단계에서 끊긴 경우.
 * 주문이 이미 환불 상태면 요청을 완료로 닫고, 아니면 '접수됨'으로 되돌려 다시 처리할 수 있게 한다
 * (다시 누르면 위의 '이미 취소됨' 확인이 두 번 취소되지 않게 막는다).
 */
export async function recoverStuckRefund(id: string): Promise<RefundRequest> {
  const request = await getRefundRequest(id);
  if (!request) throw new RefundError("환불 요청을 찾을 수 없습니다.", 404);
  if (request.status !== "processing") throw new RefundError("처리 중인 요청이 아닙니다. 새로고침해 주세요.", 409);
  if (Date.now() - Date.parse(request.updatedAt) < STUCK_AFTER_MS) throw new RefundError("방금 처리를 시작한 요청이에요. 2분 뒤에도 그대로면 다시 눌러 주세요.", 409);
  const order = await getPaymentOrder(request.orderId);
  if (order && (order.status === "refunded" || order.status === "partial_canceled")) {
    const done = await setRequestStatus(id, "processing", "done", `${request.adminNote ? `${request.adminNote} · ` : ""}주문은 이미 환불 상태 — 기록만 마무리`);
    if (!done) throw new RefundError("요청 기록을 바꾸지 못했습니다. 새로고침 후 확인해 주세요.", 500);
    return done;
  }
  const back = await setRequestStatus(id, "processing", "received");
  if (!back) throw new RefundError("요청 상태를 바꾸지 못했습니다. 새로고침해 주세요.", 409);
  return back;
}

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
  let alreadyCanceled = false;
  if (card) {
    const result = await cancelNicepayPaymentDetailed(order.paymentKey!, `고객 환불 요청 처리(${request.reason.slice(0, 40)})`, full ? undefined : amount);
    // 응답만 잃어버리고 취소는 된 경우 — 다시 누르면 '이미 취소된 거래'로 거절된다. 나이스페이 조회로 이미 취소됐는지 본다
    if (!result.ok && await alreadyCanceledAtNicepay(order.paymentKey!, order.amount, full ? 0 : order.amount - amount)) {
      alreadyCanceled = true;
    } else if (!result.ok) {
      await setRequestStatus(id, "processing", "received").catch(() => null);
      throw new RefundError(`카드 취소에 실패했습니다: ${result.message}. 요청은 '접수됨'으로 그대로 두었습니다.`, 502);
    }
  }

  // 3·4. 주문 닫기와 요청 완료 — 여기서 실패해도 되돌리지 않는다(위 설명)
  const how = card ? `${full ? "카드 전액 취소" : "카드 부분 취소"}${alreadyCanceled ? "(나이스페이에서 이미 취소된 것 확인)" : ""}` : "계좌 환급";
  const summary = `${won(amount)} ${how}${input.note.trim() ? ` · ${input.note.trim()}` : ""}`;
  /*
   * 묶음(계획서+홈페이지)을 일부만 돌려주면 홈페이지만 닫고 계획서는 남긴다(운영 정책).
   * 권한은 done 주문만 보므로 주문은 done 으로 두고 '홈페이지 환불됨' 표시만 단다(paidHomepagePlanIds 가 거른다).
   */
  const bundlePartial = orderProduct(order) === "bundle" && !full;
  let warning = "";
  try {
    const supabase = getServerSupabase()!;
    const { error } = await supabase
      .from("payment_orders")
      .update(bundlePartial
        ? { admin_note: summary, opportunity: { ...order.opportunity, homepageRefunded: true } }
        : { status: full ? "refunded" : "partial_canceled", admin_note: summary })
      .eq("order_id", order.orderId)
      .eq("status", "done");
    if (error) throw error;
    if (order.projectId) await updateProjectPaymentStatus(order.projectId, "refunded");
  } catch {
    warning = " (주문 상태 자동 변경 실패 — 결제 주문을 직접 확인해 주세요)";
  }
  // 이미 만들어진 것 닫기 — 다시 생성 추가분, 공개 홈페이지, 연결한 도메인
  const effects = await closeRefundedProduct(order, { homepageOnly: bundlePartial });
  if (effects) warning += ` (${effects})`;
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
