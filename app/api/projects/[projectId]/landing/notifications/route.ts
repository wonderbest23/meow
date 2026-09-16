import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedIdentity } from "../../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../../lib/rate-limit";
import { listLandingLeadNotifications, retryLandingLeadNotification } from "../../../../../../lib/landing/lead-notifications";

function failure(error: unknown) {
  const known = ["ACCOUNT_LOGIN_REQUIRED", "PROJECT_NOT_FOUND", "LANDING_NOT_FOUND", "LANDING_LEAD_NOT_FOUND"];
  const code = error instanceof Error && known.includes(error.message) ? error.message : "LANDING_NOTIFICATIONS_UNAVAILABLE";
  const status = code === "ACCOUNT_LOGIN_REQUIRED" ? 401 : ["PROJECT_NOT_FOUND", "LANDING_NOT_FOUND", "LANDING_LEAD_NOT_FOUND"].includes(code) ? 404 : 503;
  return NextResponse.json({ error: { code, message: status === 401 ? "로그인 후 이용해주세요." : status === 404 ? "문의를 찾을 수 없습니다." : "메일 알림 상태를 확인하지 못했습니다. 문의 내용은 저장된 목록에서 확인할 수 있습니다." } }, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const identity = await requireAuthenticatedIdentity();
    const { projectId } = await context.params;
    return NextResponse.json({ notifications: await listLandingLeadNotifications(projectId, identity.hash) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const limited = await enforceRateLimit("landing-notification-retry", request, { limit: 10, windowMs: 10 * 60_000, message: "잠시 후 다시 시도해주세요." });
  if (limited) return limited;
  try {
    const identity = await requireAuthenticatedIdentity();
    const { projectId } = await context.params;
    const parsed = z.object({ leadId: z.string().uuid() }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "문의 번호를 확인해주세요." } }, { status: 400 });
    await retryLandingLeadNotification(projectId, identity.hash, parsed.data.leadId);
    return NextResponse.json({ notifications: await listLandingLeadNotifications(projectId, identity.hash) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
