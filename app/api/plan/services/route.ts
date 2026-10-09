import { NextResponse } from "next/server";
import { requireAuthenticatedIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { notifyOperator } from "../../../../lib/ops-alerts";
import { notifyOwnerBySms } from "../../../../lib/notify/owner-sms";
import { findService } from "../../../../lib/services/catalog";
import { formatKoreanPhone } from "../../../../lib/contact-links";
import { validateServiceRequest } from "../../../../lib/services/requests";
import { createServiceRequest, listMyServiceRequests, ownedPlan, ServiceRequestError, suggestedServicePhone } from "../../../../lib/services/request-store";

export const runtime = "nodejs";

/*
 * '다음 단계' 서비스 신청 — 사업자등록·통신판매업 신고·블로그 배포 같은 대행 상담.
 *
 * GET  ?planId= — 이 사업에 낸 신청과 처리 상태, 연락받을 번호 미리 채우기.
 * POST         — 신청 접수 후 운영자에게 메일. 로그인 + 내 사업일 때만(남의 planId 는 404).
 * 가격은 아직 없다 — 상담 신청만 받고 운영자가 전화로 안내한다.
 */

const headers = { "Cache-Control": "private, no-store, max-age=0" };

function failure(error: unknown) {
  if (error instanceof Error && error.message === "ACCOUNT_LOGIN_REQUIRED") {
    return NextResponse.json({ error: { code: "ACCOUNT_LOGIN_REQUIRED", message: "로그인 후 신청할 수 있어요." } }, { status: 401, headers });
  }
  if (error instanceof ServiceRequestError) {
    const messages: Record<ServiceRequestError["code"], string> = {
      PLAN_NOT_FOUND: "사업을 찾을 수 없어요. 내 사업에서 다시 열어 주세요.",
      SERVICE_NOT_FOUND: "없는 서비스예요. 새로고침 후 다시 골라 주세요.",
      ALREADY_REQUESTED: "이미 신청하신 서비스예요. 담당자가 곧 연락드릴게요.",
      SERVICE_STORE_UNAVAILABLE: "신청 접수가 아직 준비되지 않았어요. 1:1 상담으로 남겨 주세요.",
      STATUS_CONFLICT: "상태가 바뀌었어요. 새로고침해 주세요.",
      NOT_FOUND: "신청을 찾을 수 없어요.",
    };
    return NextResponse.json({ error: { code: error.code, message: messages[error.code] } }, { status: error.status, headers });
  }
  console.error("[plan/services] failed", error);
  return NextResponse.json({ error: { code: "SERVICE_REQUEST_FAILED", message: "신청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." } }, { status: 500, headers });
}

export async function GET(request: Request) {
  const planId = new URL(request.url).searchParams.get("planId")?.trim();
  if (!planId) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "사업을 골라 주세요." } }, { status: 400, headers });
  try {
    const identity = await requireAuthenticatedIdentity();
    if (!(await ownedPlan(identity.hash, planId))) throw new ServiceRequestError("PLAN_NOT_FOUND", 404);
    const requests = await listMyServiceRequests(identity.userId, planId);
    const suggestedPhone = await suggestedServicePhone(identity.hash, planId, requests);
    return NextResponse.json({ requests, suggestedPhone }, { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("plan-service-request", request, { limit: 10, windowMs: 60 * 60_000, message: "신청이 너무 많아요. 잠시 후 다시 시도해 주세요." });
  if (limited) return limited;
  const checked = validateServiceRequest(await request.json().catch(() => null));
  if (!checked.ok) return NextResponse.json({ error: { code: checked.code, message: checked.message } }, { status: 400, headers });
  try {
    const identity = await requireAuthenticatedIdentity();
    const { request: created, planTitle } = await createServiceRequest({ ...checked.value, ownerId: identity.userId, ownerHash: identity.hash, customerEmail: identity.email ?? "" });
    const service = findService(created.serviceId);
    // 상담 신청은 빨리 전화해야 의미가 있다 — 운영자에게 메일과 문자를 함께 보낸다. 알림 실패는 접수 결과를 바꾸지 않는다(둘 다 던지지 않는다).
    // 문자는 중계 서버의 고정 문구(support-inquiry, '새 고객센터 문의')를 쓴다 — 자세한 내용은 메일과 /admin/services 에서 본다
    await Promise.allSettled([notifyOwnerBySms(created.id), notifyOperator(`서비스 상담 신청: ${service?.title ?? created.serviceId}`, [
      `서비스: ${service?.title ?? created.serviceId}`,
      `사업: ${planTitle || "(이름 없음)"}`,
      `연락처: ${formatKoreanPhone(created.phone)}`,
      `희망 연락 시간: ${created.preferredTime || "(없음)"}`,
      `메모: ${created.memo ? created.memo.slice(0, 800) : "(없음)"}`,
      `계정: ${identity.email ?? "(이메일 없음)"}`,
      "",
      "처리하기: https://oneulstart.com/admin/services",
    ])]);
    return NextResponse.json({ ok: true, request: created }, { headers });
  } catch (error) {
    return failure(error);
  }
}
