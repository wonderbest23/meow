import { AppleIapError, verifyAppleJws, type AppleTransaction } from "./apple-iap";
import { APP_BUNDLE_ID, iapProductFromStoreId } from "./iap-products";
import { iapOrderId } from "./iap-orders";
import { closeRefundedProduct, orderProduct } from "./refund-effects";
import { getPaymentOrder, markStoreOrderRefunded, recordPaymentEvent } from "./repository";
import { getServerSupabase } from "../persistence";
import { notifyOperator } from "../ops-alerts";
import type { PaymentOrder } from "./domain";

/*
 * App Store 서버 알림(Version 2) 처리 — 애플이 환불·취소 등을 우리 서버에 알려 온다.
 *
 * 확인 순서(하나라도 어긋나면 400 — 애플은 2xx 가 아니면 다시 보내지만, 서명이 틀린 것은 받지 않는다):
 *  1) 바깥 JWS(signedPayload)를 거래 영수증과 같은 방법으로 확인한다(고정한 애플 루트 G3 · 인증서 용도 · ES256 서명, apple-iap.ts).
 *  2) 우리 앱(번들 ID)의 알림인지.
 *  3) 안에 든 거래(data.signedTransactionInfo)도 같은 방법으로 확인하고, 번들 ID·환경(Production/Sandbox)이 바깥과 같은지.
 *
 * 처리:
 *  - REFUND·REVOKE: 그 거래의 주문(order_id = iapOrderId('ios', transactionId))이 '완료'면 refunded 로 바꾸고,
 *    카드 환불과 같은 refund-effects.ts 로 이미 만들어진 것을 닫는다(다시 생성 추가분 회수·공개 홈페이지 내리기).
 *    계획서·홈페이지 이용 권한은 done 주문만 보므로 상태를 바꾸는 것으로 닫힌다. 주문의 환경(APPLE_PRODUCTION/APPLE_SANDBOX)·
 *    상품이 알림과 다르면 바꾸지 않고 운영자에게 알린다.
 *  - CONSUMPTION_REQUEST: 애플이 소모성 상품 사용 정보를 묻는다 — 답하려면 App Store Server API 열쇠가 필요해 지금은 기록·알림만.
 *  - REFUND_REVERSED: 자동으로 다시 열지 않는다(운영자가 확인) — 기록·알림만.
 *  - TEST·그 밖: 기록만.
 *  - 주문을 찾지 못하면: 기록·알림 후 200(다시 보내도 결과가 같으므로 애플이 계속 재시도하지 않게).
 *
 * 같은 알림이 여러 번 와도 한 번만 반영된다:
 *  - 모든 알림은 notificationUUID 로 payment_events 에 남긴다(unique) — 처음 온 것인지 알 수 있다.
 *  - 환불 반영 자체는 'done 일 때만 refunded 로'라는 조건부 갱신이라, 다시 오거나 동시에 와도 한 번만 바뀌고 권한 닫기도 한 번만 한다.
 *  - 운영자 알림은 환불이 실제로 반영됐을 때, 또는 그 밖의 알림이 처음 왔을 때만 보낸다.
 *  - 처리 중 저장소 오류는 500 — 애플이 다시 보내면 위 조건부 갱신 덕분에 안전하게 이어서 처리한다.
 */

type NotificationData = {
  appAppleId?: number;
  bundleId?: string;
  bundleVersion?: string;
  environment?: string;
  signedTransactionInfo?: string;
  signedRenewalInfo?: string;
  consumptionRequestReason?: string;
};

type NotificationPayload = {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  version?: string;
  signedDate?: number;
  data?: NotificationData;
  summary?: { bundleId?: string; environment?: string };
  externalPurchaseToken?: { bundleId?: string };
};

type NotificationTransaction = AppleTransaction & { revocationReason?: number };

export type AppleNotificationResult = {
  status: 200 | 400 | 500;
  body: { ok: boolean; result?: string; error?: string };
};

export type AppleNotificationOptions = {
  /** 시험용 — 인증서 유효 기간을 볼 시각 */
  now?: Date;
  /** 시험용 — 시험 루트 인증서 지문(기본은 진짜 애플 G3) */
  rootFingerprint?: string;
  bundleId?: string;
  /** 시험용 — 운영자 알림을 가로챈다 */
  notify?: (subject: string, lines: string[]) => Promise<void>;
};

const MAX_SIGNED_PAYLOAD = 100_000;
const REVOKING_TYPES = new Set(["REFUND", "REVOKE"]);

const reject = (error: string): AppleNotificationResult => ({ status: 400, body: { ok: false, error } });
const accepted = (result: string): AppleNotificationResult => ({ status: 200, body: { ok: true, result } });
const text = (value: unknown, max = 200) => (typeof value === "string" ? value.slice(0, max) : "");

function won(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function envLabel(environment: string) {
  return environment === "Sandbox" ? "Sandbox(시험 결제 — 실제로 청구되지 않음)" : environment || "(알 수 없음)";
}

function orderLines(order: PaymentOrder | null, orderId: string) {
  if (!order) return [`주문번호: ${orderId} (우리 결제 기록에 없음)`];
  return [
    `주문번호: ${order.orderId}`,
    `상품: ${order.orderName}`,
    `금액: ${won(order.amount)}`,
    `구매자 이메일: ${order.customerEmail ?? "(없음)"}`,
    `주문 상태: ${order.status}`,
  ];
}

/** 이 주문이 이 알림의 거래와 같은 것인지 — 애플 결제·같은 환경·같은 상품 */
function orderMismatch(order: PaymentOrder, transaction: NotificationTransaction, environment: string): string | null {
  if ((order.method as string) !== "APPLE_IAP") return "애플 결제 주문이 아님";
  if (order.providerStatus !== `APPLE_${environment.toUpperCase()}`) return `결제 환경이 다름(주문 ${order.providerStatus ?? "없음"}, 알림 ${environment})`;
  const product = iapProductFromStoreId(transaction.productId);
  if (!product || orderProduct(order) !== product) return `상품이 다름(주문 ${orderProduct(order)}, 알림 ${transaction.productId})`;
  return null;
}

async function appendAdminNote(orderId: string, note: string) {
  const supabase = getServerSupabase();
  if (!supabase) return;
  const { data } = await supabase.from("payment_orders").select("admin_note").eq("order_id", orderId).maybeSingle();
  const current = (data as { admin_note?: string | null } | null)?.admin_note ?? "";
  await supabase.from("payment_orders").update({ admin_note: `${current ? `${current} · ` : ""}${note}`.slice(0, 2000) }).eq("order_id", orderId);
}

export async function handleAppleNotification(signedPayload: unknown, options: AppleNotificationOptions = {}): Promise<AppleNotificationResult> {
  const now = options.now ?? new Date();
  const bundleId = options.bundleId ?? APP_BUNDLE_ID;
  const notify = options.notify ?? notifyOperator;
  if (typeof signedPayload !== "string" || !signedPayload || signedPayload.length > MAX_SIGNED_PAYLOAD) return reject("APPLE_NOTIFICATION_MALFORMED");

  // 1·2) 바깥 서명과 우리 앱인지
  let notification: NotificationPayload;
  let transaction: NotificationTransaction | null = null;
  try {
    notification = verifyAppleJws<NotificationPayload>(signedPayload, now, options.rootFingerprint);
  } catch (error) {
    return reject(error instanceof AppleIapError ? error.code : "APPLE_NOTIFICATION_MALFORMED");
  }
  const type = text(notification.notificationType, 60);
  const uuid = text(notification.notificationUUID, 100);
  if (!type || !uuid) return reject("APPLE_NOTIFICATION_MALFORMED");
  const data = notification.data && typeof notification.data === "object" ? notification.data : null;
  const notifiedBundle = data?.bundleId ?? notification.summary?.bundleId ?? notification.externalPurchaseToken?.bundleId;
  if (notifiedBundle !== bundleId) return reject("APPLE_BUNDLE_MISMATCH");
  const environment = text(data?.environment ?? notification.summary?.environment, 20);

  // 3) 안에 든 거래 — 같은 방법으로 확인, 바깥과 같은 앱·같은 환경이어야 한다
  if (data?.signedTransactionInfo !== undefined) {
    if (typeof data.signedTransactionInfo !== "string" || data.signedTransactionInfo.length > MAX_SIGNED_PAYLOAD) return reject("APPLE_NOTIFICATION_MALFORMED");
    try {
      transaction = verifyAppleJws<NotificationTransaction>(data.signedTransactionInfo, now, options.rootFingerprint);
    } catch (error) {
      return reject(error instanceof AppleIapError ? error.code : "APPLE_NOTIFICATION_MALFORMED");
    }
    if (transaction.bundleId !== bundleId) return reject("APPLE_BUNDLE_MISMATCH");
    if (transaction.environment !== environment) return reject("APPLE_ENVIRONMENT_MISMATCH");
    if (typeof transaction.transactionId !== "string" || !transaction.transactionId) return reject("APPLE_NOTIFICATION_MALFORMED");
  }

  const subtype = text(notification.subtype, 60);
  const orderId = transaction ? iapOrderId("ios", transaction.transactionId) : "";
  const summary = [
    `알림 종류: ${type}${subtype ? ` / ${subtype}` : ""}`,
    `환경: ${envLabel(environment)}`,
    ...(transaction ? [`애플 거래번호: ${transaction.transactionId}`, `애플 상품: ${text(transaction.productId, 80)}`] : []),
    `알림 ID: ${uuid}`,
  ];

  try {
    // 모든 알림을 남긴다 — 같은 notificationUUID 는 한 번만 들어간다(처음 온 것인지 판단)
    const firstDelivery = await recordPaymentEvent(`apple-notification:${uuid}`, `apple.${type}${subtype ? `.${subtype}` : ""}`.slice(0, 120), {
      source: "app_store_server_notification_v2",
      notificationType: type,
      subtype: subtype || null,
      notificationUUID: uuid,
      environment: environment || null,
      signedDate: typeof notification.signedDate === "number" ? notification.signedDate : null,
      orderId: orderId || null,
      transactionId: transaction?.transactionId ?? null,
      originalTransactionId: transaction?.originalTransactionId ?? null,
      productId: transaction?.productId ?? null,
      revocationDate: transaction?.revocationDate ?? null,
      revocationReason: transaction?.revocationReason ?? null,
      consumptionRequestReason: text(data?.consumptionRequestReason, 60) || null,
    });

    if (REVOKING_TYPES.has(type)) {
      if (!transaction) {
        if (firstDelivery) await notify("App Store 환불 알림 — 거래 정보 없음, 직접 확인 필요", summary);
        return accepted("no_transaction");
      }
      const order = await getPaymentOrder(orderId);
      if (!order) {
        if (firstDelivery) await notify("App Store 환불 알림 — 주문을 찾지 못함, 직접 확인 필요", [...orderLines(null, orderId), ...summary]);
        return accepted("unknown_order");
      }
      const mismatch = orderMismatch(order, transaction, environment);
      if (mismatch) {
        if (firstDelivery) await notify("App Store 환불 알림 — 주문과 맞지 않아 반영하지 않음", [`이유: ${mismatch}`, ...orderLines(order, orderId), ...summary]);
        return accepted("order_mismatch");
      }
      if (order.status === "refunded") return accepted("already_refunded");
      if (order.status !== "done") {
        if (firstDelivery) await notify("App Store 환불 알림 — 완료 상태가 아닌 주문, 직접 확인 필요", [...orderLines(order, orderId), ...summary]);
        return accepted("not_refundable");
      }
      const when = new Date(transaction.revocationDate ?? now.getTime()).toISOString().slice(0, 10);
      const note = type === "REVOKE" ? `Apple 결제 취소(REVOKE, App Store 서버 알림) ${when}` : `Apple 환불 (App Store 서버 알림) ${when}`;
      // done → refunded 는 한 번만 일어난다 — 다시 오거나 동시에 온 알림은 여기서 null
      const refunded = await markStoreOrderRefunded(order, note);
      if (!refunded) return accepted("already_refunded");
      // 이미 만들어진 것 닫기 — 카드 환불과 같은 경로(다시 생성 추가분은 이미 쓴 만큼만 남긴다, 공개 홈페이지는 내린다)
      const warnings = await closeRefundedProduct(refunded);
      if (warnings) await appendAdminNote(orderId, `환불 후 정리: ${warnings}`).catch(() => undefined);
      await notify(type === "REVOKE" ? "App Store 결제 취소(REVOKE) 반영 — 이용 권한을 닫았습니다" : "App Store 환불 반영 — 이용 권한을 닫았습니다", [
        ...orderLines(refunded, orderId),
        ...summary,
        ...(warnings ? ["", `확인 필요: ${warnings}`] : []),
        "",
        "결제 주문 보기: https://oneulstart.com/admin/payments",
      ]);
      return accepted("refunded");
    }

    if (type === "CONSUMPTION_REQUEST" || type === "REFUND_REVERSED") {
      if (firstDelivery) {
        const order = orderId ? await getPaymentOrder(orderId) : null;
        await notify(type === "CONSUMPTION_REQUEST"
          ? "App Store 사용 정보 요청(CONSUMPTION_REQUEST) — 손님이 환불을 요청했습니다"
          : "App Store 환불 취소(REFUND_REVERSED) — 자동으로 다시 열지 않음, 직접 확인 필요", [
          ...(orderId ? orderLines(order, orderId) : []),
          ...summary,
          ...(type === "CONSUMPTION_REQUEST" ? [`요청 이유: ${text(data?.consumptionRequestReason, 60) || "(없음)"}`, "", "사용 정보 회신에는 App Store Server API 열쇠가 필요해 지금은 자동으로 답하지 않습니다."] : []),
        ]);
      }
      return accepted("recorded");
    }

    return accepted(firstDelivery ? "recorded" : "duplicate");
  } catch (error) {
    console.error("[apple-notifications] 처리 오류:", type, error instanceof Error ? error.message : error);
    await notify("App Store 알림 처리 실패 — 애플이 다시 보냅니다", [...summary, ...(orderId ? [`주문번호: ${orderId}`] : [])]);
    return { status: 500, body: { ok: false, error: "APPLE_NOTIFICATION_FAILED" } };
  }
}
