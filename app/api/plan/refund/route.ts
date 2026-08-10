import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "../../../../lib/account-auth";
import { listPaymentHistory } from "../../../../lib/payments/plan-orders";
import { createRefundRequest, listMyRefundRequests } from "../../../../lib/payments/refund-requests";
import { enforceRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

// 환불 요청 — 본인 결제(done)에 한해 접수하고, 처리 현황을 조회한다.

const createSchema = z.object({
  orderId: z.string().trim().min(6).max(64),
  reason: z.string().trim().min(5).max(1000),
});

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return privateJson({ error: { code: "AUTH_REQUIRED", message: "로그인이 필요합니다." } }, { status: 401 });
  try {
    return privateJson({ requests: await listMyRefundRequests(user.id) });
  } catch {
    return privateJson({ requests: [] });
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("refund-request", request, { limit: 5, windowMs: 60 * 60_000 });
  if (limited) return limited;

  const user = await getAuthenticatedUser();
  if (!user) return privateJson({ error: { code: "AUTH_REQUIRED", message: "로그인이 필요합니다." } }, { status: 401 });

  try {
    const input = createSchema.parse(await request.json());
    // 본인 주문·결제 완료 여부를 서버에서 검증한다 — 화면 값을 믿지 않는다
    const history = await listPaymentHistory(user.id);
    const order = history.find((item) => item.orderId === input.orderId);
    if (!order) return privateJson({ error: { code: "ORDER_NOT_FOUND", message: "본인 주문을 찾을 수 없습니다." } }, { status: 404 });
    if (order.status !== "done") {
      return privateJson({ error: { code: "ORDER_NOT_REFUNDABLE", message: "결제 완료된 주문만 환불을 요청할 수 있습니다." } }, { status: 400 });
    }
    const created = await createRefundRequest({
      ownerId: user.id,
      customerEmail: user.email ?? "",
      orderId: order.orderId,
      orderName: order.orderName,
      amount: order.amount,
      reason: input.reason,
    });
    return privateJson({ request: created });
  } catch (error) {
    const code = error instanceof Error ? error.message : "REFUND_REQUEST_FAILED";
    const messages: Record<string, string> = {
      REFUND_ALREADY_REQUESTED: "이미 환불을 요청한 주문입니다. 처리 결과를 기다려주세요.",
      REFUND_STORE_UNAVAILABLE: "환불 접수함이 아직 준비되지 않았습니다. 1:1 문의로 남겨주세요.",
    };
    const known = messages[code];
    return privateJson(
      { error: { code, message: known ?? "환불 요청을 접수하지 못했습니다. 잠시 후 다시 시도해주세요." } },
      { status: known ? 400 : 500 },
    );
  }
}
