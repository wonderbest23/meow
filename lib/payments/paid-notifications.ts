import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "../persistence";
import { productName, type PlanProduct } from "./plan-orders";
import { DOMAIN_PURCHASE_PRODUCT_NAME } from "./domain";
import { landingEmailConfiguration, sendLandingLeadEmail, SUPPORT_FOOTER, withSupportReplyTo, type LeadEmailPayload } from "../landing/lead-email";
import { displayOrderName } from "./order-display";
import { customerSmsConfig, operatorRelayConfig, relayUnsupported, sendRelayV4, stableEventId, type CustomerSmsConfig, type CustomerSmsResult } from "../notify/customer-sms";
import { notifyOperator } from "../ops-alerts";

/*
 * 결제 완료 알림 — 모든 상품.
 *   운영자: 문자(중계 v4 payment-paid). 문자를 보내려 했는데 안 됐으면(예전 중계·한도·확인 불가) 운영자 메일로.
 *   구매자: 결제 화면에 휴대폰을 적었으면 문자(payment-receipt), 계정 이메일이 있으면 영수증 메일.
 *
 * 결제 복귀(return)와 결과 확인(reconcile)이 둘 다 '완료'를 볼 수 있다 — 주문마다 한 번만 보내려고
 * payment_orders.paid_notified_at 이 비어 있을 때만 맡는다(조건부 update, 마이그레이션 0040).
 * 칸이 아직 없으면 '이번 요청에서 처음 완료된 주문'일 때만 보낸다(예전 도메인 구매 메일과 같은 기준).
 * 그래도 겹치면 중계는 같은 eventId 를, Resend 는 같은 Idempotency-Key 를 한 번만 받는다.
 * 오래된 주문(승인 24시간이 지난 것)은 결과 화면을 다시 열어도 알리지 않는다 — 배포 직후 옛 주문이 몰려 오지 않게.
 *
 * 절대 던지지 않는다 — 결제 경로가 알림 때문에 실패하면 안 된다.
 */

const PRODUCTS: PlanProduct[] = ["plan", "homepage", "bundle", "regen", "domain", "domain-purchase", "tokens"];
const COLUMNS = "order_id, amount, order_name, opportunity, customer_email, confirmed_at, method, provider_status";
const NOTICE_WINDOW_MS = 24 * 60 * 60_000;

export type PaidOrderRow = { order_id: string; amount: number; order_name: string; opportunity: Record<string, unknown> | null; customer_email: string | null; confirmed_at: string | null; method?: string | null; provider_status?: string | null };

/** 애플·구글 시험 결제(TestFlight·샌드박스, 앱 심사 포함) — 청구되지 않는다. 알림에 '시험'을 붙여 실제 매출과 헷갈리지 않게 */
export const isSandboxOrder = (row: Pick<PaidOrderRow, "provider_status">) => /_SANDBOX$/i.test(row.provider_status ?? "");

/* 영수증 안내 — 앱 결제는 애플·구글이 영수증을 보낸다(예전엔 모든 결제에 '나이스페이먼츠 매출전표'라고 적었다) */
function receiptNote(row: Pick<PaidOrderRow, "method">) {
  if (row.method === "APPLE_IAP") return "결제 영수증은 Apple이 Apple 계정 이메일로 따로 보내 드려요.";
  if (row.method === "GOOGLE_IAP") return "결제 영수증은 Google Play가 Google 계정 이메일로 따로 보내 드려요.";
  return "카드 매출전표는 카드사·나이스페이먼츠에서 따로 보내 드려요.";
}

/** 주문의 상품 열쇠 — opportunity.product 가 먼저, 옛 주문은 상품명으로 */
export function paidProduct(row: Pick<PaidOrderRow, "order_name" | "opportunity">): PlanProduct {
  const saved = row.opportunity?.product;
  if (typeof saved === "string" && (PRODUCTS as string[]).includes(saved)) return saved as PlanProduct;
  return PRODUCTS.find((product) => productName(product) === row.order_name) ?? "plan";
}

/** 결제 화면에서 받은 '결제 안내 받을 휴대폰'(선택) */
export function noticePhoneOf(row: Pick<PaidOrderRow, "opportunity">): string | null {
  const phone = row.opportunity?.noticePhone;
  return typeof phone === "string" && /^010\d{8}$/.test(phone) ? phone : null;
}

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

/** '2026년 10월 22일 00:30 (한국 시간)' — 예전엔 '2026. 10. 22. 오전 12:30:00'(자정이 '오전 12시'로 읽혔다) */
export function formatKoreanDateTime(iso: string | null | undefined): string {
  const time = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return "";
  const kst = new Date(time + 9 * 60 * 60_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())} (한국 시간)`;
}

/** 결제 내역은 마이페이지(/plan/me)에 있다 — /account 는 로그인 화면이라 내역이 없다 */
export const PAYMENT_HISTORY_URL = "https://oneulstart.com/plan/me";

export function buildPaymentReceiptEmail(from: string, to: string, row: PaidOrderRow): LeadEmailPayload {
  const paidAt = formatKoreanDateTime(row.confirmed_at);
  // 저장된 상품 이름(권한 판정용)은 그대로 두고, 손님이 읽는 이름만 바꾼다
  const name = displayOrderName(row.order_name);
  return {
    from, to,
    subject: `[오늘창업] ${isSandboxOrder(row) ? "[시험 결제] " : ""}결제가 완료됐어요 · ${name}`,
    text: [
      "오늘창업 결제가 완료됐어요.",
      ...(isSandboxOrder(row) ? ["(TestFlight·심사용 시험 결제라 실제로 청구되지 않았어요.)"] : []),
      "",
      `상품: ${name}`,
      `금액: ${won(row.amount)} (부가세 포함)`,
      `주문번호: ${row.order_id}`,
      ...(paidAt ? [`결제 시각: ${paidAt}`] : []),
      "",
      `결제 내역 보기: ${PAYMENT_HISTORY_URL}`,
      "취소·환불 기준: https://oneulstart.com/refund",
      "",
      receiptNote(row),
      "",
      SUPPORT_FOOTER,
    ].join("\n"),
  };
}

export type PaymentNoticeDependencies = {
  db: SupabaseClient | null;
  email: ReturnType<typeof landingEmailConfiguration>;
  sms: CustomerSmsConfig | null;
  operator: (CustomerSmsConfig & { ownerPhone: string }) | null;
  operatorEmail: (subject: string, lines: string[]) => Promise<void>;
  smsTransport?: typeof fetch;
  emailTransport?: typeof fetch;
  now?: number;
};

export type PaymentNoticeResult = {
  claimed: "marker" | "first-completion" | "skipped";
  operator?: string; buyerSms?: string; buyerEmail?: string;
};

const delivered = (result: CustomerSmsResult) => result.status === "accepted" || result.status === "test_accepted";

/** 결제가 완료된 뒤 부른다. firstCompletion: 이 요청이 들어올 때는 아직 done 이 아니었던 주문인지 */
export async function notifyPaymentComplete(orderId: string, firstCompletion: boolean, dependencies?: PaymentNoticeDependencies): Promise<PaymentNoticeResult> {
  const deps: PaymentNoticeDependencies = dependencies ?? {
    db: getServerSupabase(), email: landingEmailConfiguration(), sms: customerSmsConfig(), operator: operatorRelayConfig(), operatorEmail: notifyOperator,
  };
  try {
    const { db } = deps;
    if (!db) return { claimed: "skipped" };
    const now = deps.now ?? Date.now();
    const claim = await db.from("payment_orders").update({ paid_notified_at: new Date(now).toISOString() })
      .eq("order_id", orderId).eq("status", "done").is("paid_notified_at", null)
      .gte("confirmed_at", new Date(now - NOTICE_WINDOW_MS).toISOString()).select(COLUMNS);
    let row: PaidOrderRow | null;
    let claimed: PaymentNoticeResult["claimed"];
    if (!claim.error) {
      row = ((claim.data ?? []) as unknown as PaidOrderRow[])[0] ?? null;
      claimed = "marker";
    } else {
      // 0040 전 — 칸이 없다. 이번 요청이 완료시킨 주문일 때만
      if (!firstCompletion) return { claimed: "skipped" };
      const read = await db.from("payment_orders").select(COLUMNS).eq("order_id", orderId).eq("status", "done").maybeSingle();
      row = read.error ? null : (read.data as unknown as PaidOrderRow | null);
      claimed = "first-completion";
    }
    if (!row) return { claimed: "skipped" };
    const paid = row;
    const product = paidProduct(paid);
    const result: PaymentNoticeResult = { claimed };

    const operatorTask = async () => {
      // 시험 결제(앱 심사·TestFlight)는 문자 없이 '시험'을 붙인 메일로만 — 실제 매출처럼 '결제 완료 49,000원' 문자가 오면 헷갈린다
      if (isSandboxOrder(paid)) {
        await deps.operatorEmail(`시험 결제 · ${paid.order_name} ${won(paid.amount)}`, [`상품: ${paid.order_name}`, `금액: ${won(paid.amount)} (청구 안 됨)`, `주문번호: ${paid.order_id}`, "", "애플·구글 시험 결제(TestFlight·앱 심사)예요. 실제 매출이 아니에요."]);
        result.operator = "sandbox:email";
        return;
      }
      if (!deps.operator) {
        result.operator = "disabled";
        // 문자 설정이 꺼져 있어도 결제는 알아야 한다 — 도메인 구매는 등록 안내 메일(notifyDomainPurchasePaid)이 따로 간다
        if (paid.order_name === DOMAIN_PURCHASE_PRODUCT_NAME) return;
        await deps.operatorEmail(`결제 완료 · ${paid.order_name} ${won(paid.amount)}`, [`상품: ${paid.order_name}`, `금액: ${won(paid.amount)}`, `주문번호: ${paid.order_id}`]);
        result.operator += ":email";
        return;
      }
      const sent = await sendRelayV4(deps.operator, { eventId: await stableEventId(`payment-paid:${paid.order_id}`), eventType: "payment-paid", ownerPhone: deps.operator.ownerPhone, params: { product, amount: paid.amount, orderId: paid.order_id } }, deps.smsTransport);
      result.operator = `sms:${sent.status}:${sent.code}`;
      if (delivered(sent)) return;
      // 문자가 안 됐으면(예전 중계·한도·확인 불가) 운영자 메일로 — 놓치지 않게
      await deps.operatorEmail(`결제 완료 · ${paid.order_name} ${won(paid.amount)}`, [`상품: ${paid.order_name}`, `금액: ${won(paid.amount)}`, `주문번호: ${paid.order_id}`, "", `문자 알림을 보내지 못해 메일로 알려요(${relayUnsupported(sent) ? "중계 업그레이드 필요" : sent.code}).`]);
      result.operator += ":email";
    };
    const buyerSmsTask = async () => {
      const phone = noticePhoneOf(paid);
      if (!phone || !deps.sms) { result.buyerSms = phone ? "disabled" : "no_phone"; return; }
      const sent = await sendRelayV4(deps.sms, { eventId: await stableEventId(`payment-receipt:${paid.order_id}`), eventType: "payment-receipt", recipient: phone, params: { product, orderId: paid.order_id } }, deps.smsTransport);
      result.buyerSms = `${sent.status}:${sent.code}`;
    };
    const buyerEmailTask = async () => {
      const to = paid.customer_email?.trim();
      if (!to || !deps.email) { result.buyerEmail = to ? "disabled" : "no_email"; return; }
      const sent = await sendLandingLeadEmail(withSupportReplyTo(buildPaymentReceiptEmail(deps.email.from, to, paid), deps.email), deps.email.key, `payment-receipt/${paid.order_id}`, deps.emailTransport);
      result.buyerEmail = sent.ok ? "sent" : sent.code;
    };
    const settled = await Promise.allSettled([operatorTask(), buyerSmsTask(), buyerEmailTask()]);
    if (settled.some((item) => item.status === "rejected")) console.warn("[payment-notice] 알림 일부 실패");
    console.info(`[payment-notice] ${claimed} operator=${result.operator} buyerSms=${result.buyerSms} buyerEmail=${result.buyerEmail}`);
    return result;
  } catch (error) {
    console.warn(`[payment-notice] 알림 건너뜀: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200));
    return { claimed: "skipped" };
  }
}
