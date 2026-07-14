import assert from "node:assert/strict";
import {
  PACKAGE_AMOUNT,
  confirmPaymentSchema,
  createPaymentOrderSchema,
} from "../lib/payments/domain";
import {
  completePaymentOrder,
  createPaymentOrder,
  getPaymentOrder,
  recordPaymentEvent,
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

const guestTokenHash = "guest-hash-payment-test";
const order = await createPaymentOrder({
  guestTokenHash,
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

console.log(JSON.stringify({
  passed: 15,
  sample: {
    orderAmount: order.amount,
    orderStatus: canceled.status,
    projectIdStable: first.project.id === second.project.id,
    refunded: (await getProject(first.project.id, guestTokenHash))?.paymentStatus,
    starterHomepage: starterLanding.publicPath,
  },
}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
