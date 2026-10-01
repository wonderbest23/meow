import { NextResponse } from "next/server";
import { z } from "zod";
import { listDomainPurchaseOrders, markDomainRegistered } from "../../../../../lib/payments/plan-orders";
import { hasAdminSession } from "../../../../../lib/support-chat/admin-auth";

export const runtime = "nodejs";

// 어드민 도메인 구매 대행 — 결제된 주문 목록과 '등록 완료' 표시.

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

async function authorize() {
  if (await hasAdminSession("payments")) return null;
  return privateJson({ error: { code: "ADMIN_AUTH_REQUIRED", message: "관리자 로그인이 필요합니다." } }, { status: 401 });
}

export async function GET() {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  try {
    return privateJson({ orders: await listDomainPurchaseOrders(), cnameTarget: process.env.CLOUDFLARE_SAAS_CNAME_TARGET?.trim() || "connect.oneulstart.com" });
  } catch {
    return privateJson({ error: { code: "DOMAIN_ORDERS_FAILED", message: "도메인 주문을 불러오지 못했습니다." } }, { status: 503 });
  }
}

const patchSchema = z.object({ orderId: z.string().min(1).max(128) });

export async function PATCH(request: Request) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: { code: "BAD_REQUEST", message: "주문번호를 확인해 주세요." } }, { status: 400 });
  try {
    if (!(await markDomainRegistered(parsed.data.orderId))) return privateJson({ error: { code: "NOT_FOUND", message: "결제된 도메인 구매 주문을 찾을 수 없습니다." } }, { status: 404 });
    return privateJson({ orders: await listDomainPurchaseOrders() });
  } catch {
    return privateJson({ error: { code: "DOMAIN_ORDER_UPDATE_FAILED", message: "등록 완료로 바꾸지 못했습니다." } }, { status: 503 });
  }
}
