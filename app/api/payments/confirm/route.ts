import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { confirmPaymentSchema } from "../../../../lib/payments/domain";
import {
  completePaymentOrder,
  getPaymentOrder,
  markPaymentFailure,
} from "../../../../lib/payments/repository";
import {
  confirmTossPayment,
  TossPaymentError,
} from "../../../../lib/payments/toss-client";
import { recordServiceAudit } from "../../../../lib/service-audit/repository";
import { ensurePaidStarterLanding } from "../../../../lib/landing/auto-publish";

export async function POST(request: Request) {
  let orderId = "";
  let guestTokenHash = "";
  try {
    const input = confirmPaymentSchema.parse(await request.json());
    orderId = input.orderId;
    const identity = await requireGuestIdentity();
    guestTokenHash = identity.hash;
    const order = await getPaymentOrder(input.orderId, identity.hash);
    if (!order) throw new Error("PAYMENT_ORDER_NOT_FOUND");
    if (order.amount !== input.amount) throw new Error("PAYMENT_AMOUNT_MISMATCH");
    if (new Date(order.expiresAt).getTime() < Date.now()) throw new Error("PAYMENT_ORDER_EXPIRED");

    if (order.status === "done" && order.projectId) {
      const result = await completePaymentOrder({
        order,
        provider: order.rawResponse ?? { paymentKey: order.paymentKey, status: order.providerStatus },
        testPaid: false,
      });
      const starterLanding = await ensurePaidStarterLanding(result.project, identity.hash).catch(() => null);
      return NextResponse.json({ ...result, starterLanding });
    }

    const provider = await confirmTossPayment(input);
    if (
      provider.orderId !== order.orderId ||
      provider.totalAmount !== order.amount ||
      provider.paymentKey !== input.paymentKey
    ) {
      throw new Error("PAYMENT_PROVIDER_MISMATCH");
    }
    if (provider.status !== "DONE") {
      throw new Error(`PAYMENT_NOT_COMPLETED:${provider.status}`);
    }
    const result = await completePaymentOrder({ order, provider, testPaid: false });
    const starterLanding = await ensurePaidStarterLanding(result.project, identity.hash).catch(() => null);
    await recordServiceAudit({
      projectId: result.project.id,
      guestTokenHash: identity.hash,
      action: "project.created",
      resourceType: "project",
      resourceId: result.project.id,
      status: "success",
      detail: "결제 승인 후 프로젝트를 생성했습니다.",
      metadata: { orderId: input.orderId, amount: input.amount },
    });
    await recordServiceAudit({
      projectId: result.project.id,
      guestTokenHash: identity.hash,
      action: "payment.confirmed",
      resourceType: "payment_order",
      resourceId: input.orderId,
      status: "success",
      detail: `${input.amount.toLocaleString("ko-KR")}원 결제를 승인했습니다.`,
      metadata: { paymentKey: input.paymentKey },
    });
    if (starterLanding) {
      await recordServiceAudit({
        projectId: result.project.id,
        guestTokenHash: identity.hash,
        action: "landing.published",
        resourceType: "landing_site",
        resourceId: starterLanding.site.id,
        status: "success",
        detail: "결제 완료 후 안내형 홈페이지를 자동 제작하고 공개했습니다.",
        metadata: { publicPath: starterLanding.publicPath, automatic: true },
      });
    }
    return NextResponse.json({ ...result, starterLanding });
  } catch (error) {
    const code =
      error instanceof TossPaymentError
        ? error.code
        : error instanceof Error && /^[A-Z_]+/.test(error.message)
          ? error.message.split(":")[0]
          : "PAYMENT_CONFIRM_FAILED";
    const message = error instanceof Error ? error.message : "결제를 승인하지 못했습니다.";
    if (orderId && guestTokenHash) {
      await markPaymentFailure(orderId, guestTokenHash, code, message).catch(() => undefined);
      const failedOrder = await getPaymentOrder(orderId, guestTokenHash).catch(() => null);
      if (failedOrder?.projectId) {
        await recordServiceAudit({
          projectId: failedOrder.projectId,
          guestTokenHash,
          action: "payment.failed",
          resourceType: "payment_order",
          resourceId: orderId,
          status: "error",
          detail: message,
          metadata: { code },
        }).catch(() => undefined);
      }
    }
    const status =
      code === "PAYMENT_ORDER_NOT_FOUND" ? 404 :
      code === "TOSS_NOT_CONFIGURED" ? 503 :
      code === "PAYMENT_AMOUNT_MISMATCH" || code === "PAYMENT_PROVIDER_MISMATCH" ? 409 :
      error instanceof TossPaymentError ? error.status : 400;
    return NextResponse.json(
      { error: { code, message, retryable: status >= 500 } },
      { status },
    );
  }
}
