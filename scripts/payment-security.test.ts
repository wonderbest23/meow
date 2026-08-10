import assert from "node:assert/strict";
import {
  PACKAGE_AMOUNT,
  confirmPaymentSchema,
  createPaymentOrderSchema,
  manualTransferCustomerSchema,
} from "../lib/payments/domain";
import {
  cancelManualTransferOrder,
  completeManualTransferOrder,
  completePaymentOrder,
  createPaymentOrder,
  getPaymentOrder,
  markManualCashReceiptIssued,
  recordPaymentEvent,
  refundManualTransferOrder,
  reportManualTransferDeposit,
  syncPaymentFromProvider,
} from "../lib/payments/repository";
import { ensurePaidStarterLanding } from "../lib/landing/auto-publish";
import { getPublishedLandingBySlug } from "../lib/landing/repository";
import { getProject } from "../lib/project-repository";

async function main() {
const opportunity = {
  id: "payment-test",
  title: "초기 창업 결제 확인",
  oneLiner: "서버 주문 검증",
  sector: "서비스",
  model: "디지털 서비스",
  customer: "초기 창업자",
  capital: "소액" as const,
  launchTime: "21일",
  revenue: "패키지",
  stage: "검증",
  riasec: [],
  founder: [],
  market: 70,
  novelty: 60,
  feasibility: 80,
  regulation: 20,
  skills: [],
  risk: "결제",
  firstTest: "주문",
  color: "#000",
};

assert.equal(createPaymentOrderSchema.safeParse({
  opportunity,
  founderProfile: {},
  method: "CARD",
  terms: { service: true, privacy: true, refund: false, aiLimitations: true },
}).success, false, "필수 약관 일부 미동의 주문은 거절해야 합니다.");
assert.equal(createPaymentOrderSchema.safeParse({
  opportunity,
  founderProfile: {},
  method: "CARD",
  terms: { service: true, privacy: true, refund: true, aiLimitations: true, digitalSupply: true },
}).success, false, "맞춤 제작 후 단순 변심 환불 제한에 별도 동의하지 않은 주문은 거절해야 합니다.");
assert.equal(createPaymentOrderSchema.safeParse({
  opportunity,
  founderProfile: {},
  method: "CARD",
  terms: { service: true, privacy: true, refund: true, aiLimitations: true, digitalSupply: true, personalizedDigitalNoRefund: true },
}).success, true, "모든 필수 항목과 맞춤 제작 환불 제한에 동의한 주문은 통과해야 합니다.");
assert.equal(manualTransferCustomerSchema.safeParse({
  depositorName: "김테스트",
  phone: "010-1234-5678",
  cashReceiptType: "PERSONAL",
  cashReceiptIdentifier: "010-1234-5678",
}).success, true, "개인 구매자는 휴대전화로 소득공제용 현금영수증을 신청할 수 있어야 합니다.");
assert.equal(manualTransferCustomerSchema.safeParse({
  depositorName: "김테스트",
  phone: "010-1234-5678",
  cashReceiptType: "BUSINESS",
  cashReceiptIdentifier: "12345",
}).success, false, "지출증빙 번호가 올바르지 않으면 주문을 거절해야 합니다.");

const guestTokenHash = "guest-hash-payment-test";
const order = await createPaymentOrder({
  guestTokenHash,
  ownerId: null,
  customerEmail: null,
  opportunity,
  founderProfile: { source: "test" },
  method: "CARD",
});
assert.equal(order.amount, PACKAGE_AMOUNT, "금액은 클라이언트 입력이 아니라 서버 상수여야 합니다.");
assert.equal(await getPaymentOrder(order.orderId, "other-guest"), null, "다른 브라우저 주문을 읽으면 안 됩니다.");
assert.equal(confirmPaymentSchema.safeParse({
  paymentKey: "valid-payment-key",
  orderId: order.orderId,
  amount: PACKAGE_AMOUNT - 1,
}).success, true, "스키마 통과 후 서버 저장 금액과 별도로 비교해야 합니다.");

const provider = {
  paymentKey: `test_${order.orderId}`,
  orderId: order.orderId,
  orderName: order.orderName,
  status: "TEST_DONE",
  totalAmount: order.amount,
  balanceAmount: order.amount,
  method: "카드",
  approvedAt: new Date().toISOString(),
};
const first = await completePaymentOrder({ order, provider, testPaid: true });
const starterLanding = await ensurePaidStarterLanding(first.project, guestTokenHash);
const publishedLanding = await getPublishedLandingBySlug(starterLanding.site.slug);
assert.equal(starterLanding.site.status, "published", "결제 완료 후 홈페이지가 바로 공개되어야 합니다.");
assert.equal(starterLanding.site.publishedVersion, 1);
assert.equal(publishedLanding?.config.leadCaptureEnabled, false, "사업자·개인정보 설정 전에는 개인정보를 받지 않아야 합니다.");
assert.ok(publishedLanding?.config.heroImageUrl, "업종별 대표 이미지가 포함되어야 합니다.");
assert.equal(starterLanding.publicPath, `/launch/${starterLanding.site.slug}`);
const completedOrder = await getPaymentOrder(order.orderId, guestTokenHash);
assert.ok(completedOrder?.projectId);
const second = await completePaymentOrder({
  order: completedOrder!,
  provider,
  testPaid: true,
});
assert.equal(first.project.id, second.project.id, "승인 재시도는 같은 프로젝트를 반환해야 합니다.");
assert.equal(first.project.paymentStatus, "test_paid");

const canceled = await syncPaymentFromProvider(completedOrder!, {
  ...provider,
  status: "CANCELED",
  balanceAmount: 0,
});
assert.equal(canceled.status, "canceled");
assert.equal((await getProject(first.project.id, guestTokenHash))?.paymentStatus, "refunded");

assert.equal(await recordPaymentEvent("same-transmission", "PAYMENT_STATUS_CHANGED", {}), true);
assert.equal(await recordPaymentEvent("same-transmission", "PAYMENT_STATUS_CHANGED", {}), false);

const transferGuestHash = "guest-hash-manual-transfer";
const transferOrder = await createPaymentOrder({
  guestTokenHash: transferGuestHash,
  ownerId: null,
  customerEmail: "buyer@example.com",
  opportunity: { ...opportunity, id: "manual-transfer-test", title: "계좌이체 창업 자료" },
  founderProfile: { source: "manual-transfer-test" },
  method: "TRANSFER",
  customer: {
    depositorName: "김테스트",
    phone: "010-1234-5678",
    cashReceiptType: "PERSONAL",
    cashReceiptIdentifier: "010-1234-5678",
  },
});
assert.equal(transferOrder.status, "awaiting_deposit");
assert.equal(transferOrder.cashReceiptStatus, "requested");
assert.equal(await getPaymentOrder(transferOrder.orderId, "other-guest"), null, "다른 사용자는 계좌이체 주문도 읽을 수 없어야 합니다.");

const reported = await reportManualTransferDeposit(transferOrder.orderId, transferGuestHash);
assert.equal(reported.status, "deposit_reported");
assert.ok(reported.depositReportedAt);

const manualCompleted = await completeManualTransferOrder(reported, "테스트 입금 확인");
assert.equal(manualCompleted.order.status, "done");
assert.equal(manualCompleted.project.paymentStatus, "paid");
const manualCompletedAgain = await completeManualTransferOrder(manualCompleted.order, "중복 확인");
assert.equal(manualCompletedAgain.project.id, manualCompleted.project.id, "관리자가 확인을 다시 눌러도 프로젝트는 하나만 생성해야 합니다.");

const receiptIssued = await markManualCashReceiptIssued(transferOrder.orderId, "홈택스 발급 완료");
assert.equal(receiptIssued.cashReceiptStatus, "issued");
assert.ok(receiptIssued.cashReceiptIssuedAt);
await assert.rejects(
  () => refundManualTransferOrder(transferOrder.orderId, ""),
  /REFUND_EXCEPTION_REASON_REQUIRED/,
  "제작 시작 후 환급은 법정 예외 사유를 기록해야 합니다.",
);
const refunded = await refundManualTransferOrder(transferOrder.orderId, "약정한 핵심 결과물 미제공 확인, 실제 계좌 환급 완료");
assert.equal(refunded.status, "refunded");
assert.equal((await getProject(manualCompleted.project.id, transferGuestHash))?.paymentStatus, "refunded");

const noIdentifierOrder = await createPaymentOrder({
  guestTokenHash: "guest-hash-no-receipt-number",
  ownerId: null,
  customerEmail: null,
  opportunity: { ...opportunity, id: "manual-transfer-no-number" },
  founderProfile: {},
  method: "TRANSFER",
  customer: { depositorName: "박테스트", phone: "010-9999-8888", cashReceiptType: "NONE", cashReceiptIdentifier: "" },
});
assert.equal(noIdentifierOrder.cashReceiptStatus, "requested", "구매자 번호가 없어도 현금영수증 발급 업무는 남아야 합니다.");
assert.equal(noIdentifierOrder.cashReceiptIdentifier, null);
const canceledTransfer = await cancelManualTransferOrder(noIdentifierOrder.orderId, "입금 전 고객 취소");
assert.equal(canceledTransfer.status, "canceled");

console.log(JSON.stringify({
  passed: 34,
  sample: {
    orderAmount: order.amount,
    orderStatus: canceled.status,
    projectIdStable: first.project.id === second.project.id,
    refunded: (await getProject(first.project.id, guestTokenHash))?.paymentStatus,
    starterHomepage: starterLanding.publicPath,
    manualTransferStatus: refunded.status,
    cashReceipt: receiptIssued.cashReceiptStatus,
  },
}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
