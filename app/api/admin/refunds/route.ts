import { NextResponse } from "next/server";
import { z } from "zod";
import { listAllRefundRequests, updateRefundRequest } from "../../../../lib/payments/refund-requests";
import { hasAdminSession } from "../../../../lib/support-chat/admin-auth";

export const runtime = "nodejs";

// 어드민 환불 접수함 — 목록 조회와 처리(환불 완료/거절).

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["received", "done", "rejected"]),
  note: z.string().trim().max(500).default(""),
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
    return privateJson({ error: { code: "REFUND_LIST_FAILED", message: error instanceof Error ? error.message : "환불 요청을 불러오지 못했습니다." } }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  try {
    const input = patchSchema.parse(await request.json());
    return privateJson({ request: await updateRefundRequest(input.id, input.status, input.note) });
  } catch (error) {
    return privateJson({ error: { code: "REFUND_UPDATE_FAILED", message: error instanceof Error ? error.message : "환불 요청을 처리하지 못했습니다." } }, { status: 400 });
  }
}
