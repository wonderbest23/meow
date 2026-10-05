import { NextResponse } from "next/server";
import { z } from "zod";
import { getRefundRequest, listAllRefundRequests } from "../../../../lib/payments/refund-requests";
import { RefundError, completeRefundRequest, rejectRefundRequest } from "../../../../lib/payments/refund-execution";
import { hasAdminSession } from "../../../../lib/support-chat/admin-auth";

export const runtime = "nodejs";

// 어드민 환불 접수함 — 목록 조회와 처리(환불 완료: 카드 취소까지 / 거절).

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["done", "rejected"]),
  note: z.string().trim().max(500).default(""),
  /** 환불 금액(원). 비우면 요청 금액 전액 */
  amount: z.number().int().positive().optional(),
  /** 옛 계좌이체 주문 — 관리자가 계좌로 직접 돌려준 뒤 기록만 */
  manualTransfer: z.boolean().optional(),
});

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

async function authorize() {
  if (await hasAdminSession("support")) return null;
  return privateJson({ error: { code: "ADMIN_AUTH_REQUIRED", message: "관리자 로그인이 필요합니다." } }, { status: 401 });
}

export async function GET() {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  try {
    return privateJson({ requests: await listAllRefundRequests() });
  } catch (error) {
    console.error("[admin/refunds] list failed", error);
    return privateJson({ error: { code: "REFUND_LIST_FAILED", message: "환불 요청을 불러오지 못했습니다. 잠시 후 새로고침해 주세요." } }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: { code: "BAD_REQUEST", message: "처리 내용을 확인해 주세요(금액은 숫자, 메모는 500자 이내)." } }, { status: 400 });
  const input = parsed.data;
  try {
    if (input.status === "rejected") return privateJson({ request: await rejectRefundRequest(input.id, input.note) });
    const current = await getRefundRequest(input.id);
    return privateJson({ request: await completeRefundRequest(input.id, { amount: input.amount ?? current?.amount ?? 0, note: input.note, manualTransfer: input.manualTransfer }) });
  } catch (error) {
    if (error instanceof RefundError) return privateJson({ error: { code: "REFUND_UPDATE_FAILED", message: error.message } }, { status: error.status });
    console.error("[admin/refunds] update failed", error);
    return privateJson({ error: { code: "REFUND_UPDATE_FAILED", message: "환불을 처리하지 못했습니다. 새로고침 후 상태를 확인해 주세요." } }, { status: 500 });
  }
}
