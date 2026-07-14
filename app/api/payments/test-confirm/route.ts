import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { testConfirmSchema } from "../../../../lib/payments/domain";
import {
  completePaymentOrder,
  getPaymentOrder,
} from "../../../../lib/payments/repository";
import { recordServiceAudit } from "../../../../lib/service-audit/repository";
import { ensurePaidStarterLanding } from "../../../../lib/landing/auto-publish";

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: { code: "TEST_PAYMENT_DISABLED", message: "운영 환경에서는 테스트 결제를 사용할 수 없습니다." } },
        { status: 404 },
      );
    }
    const { orderId } = testConfirmSchema.parse(await request.json());
    const identity = await requireGuestIdentity();
    const order = await getPaymentOrder(orderId, identity.hash);
    if (!order) throw new Error("PAYMENT_ORDER_NOT_FOUND");
    if (new Date(order.expiresAt).getTime() < Date.now()) throw new Error("PAYMENT_ORDER_EXPIRED");
    const result = await completePaymentOrder({
      order,
      provider: {
        paymentKey: `test_${order.orderId}`,
        orderId: order.orderId,
        totalAmount: order.amount,
        status: "TEST_DONE",
      },
      testPaid: true,
    });
    const starterLanding = await ensurePaidStarterLanding(result.project, identity.hash).catch(() => null);
    await recordServiceAudit({
      projectId: result.project.id,
      guestTokenHash: identity.hash,
      action: "project.created",
      resourceType: "project",
      resourceId: result.project.id,
      status: "success",
      detail: "테스트 결제 후 프로젝트를 생성했습니다.",
      metadata: { orderId, amount: order.amount, testPaid: true },
    });
    await recordServiceAudit({
      projectId: result.project.id,
      guestTokenHash: identity.hash,
      action: "payment.confirmed",
      resourceType: "payment_order",
      resourceId: orderId,
      status: "success",
      detail: `${order.amount.toLocaleString("ko-KR")}원 테스트 결제를 승인했습니다.`,
      metadata: { testPaid: true },
    });
    if (starterLanding) {
      await recordServiceAudit({
        projectId: result.project.id,
        guestTokenHash: identity.hash,
        action: "landing.published",
        resourceType: "landing_site",
        resourceId: starterLanding.site.id,
        status: "success",
        detail: "테스트 결제 후 안내형 홈페이지를 자동 제작하고 공개했습니다.",
        metadata: { publicPath: starterLanding.publicPath, automatic: true },
      });
    }
    return NextResponse.json({ ...result, starterLanding });
  } catch (error) {
    const message = error instanceof Error ? error.message : "테스트 결제를 완료하지 못했습니다.";
    return NextResponse.json(
      { error: { code: message.endsWith("_NOT_FOUND") ? message : "TEST_PAYMENT_FAILED", message } },
      { status: message.endsWith("_NOT_FOUND") ? 404 : 400 },
    );
  }
}
