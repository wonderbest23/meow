import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "../../../../lib/support-chat/admin-auth";
import { SERVICE_REQUEST_STATUSES } from "../../../../lib/services/requests";
import { listAllServiceRequests, ServiceRequestError, updateServiceRequestStatus } from "../../../../lib/services/request-store";

export const runtime = "nodejs";

// 어드민 서비스 신청함 — 최신순 목록과 상태 변경(화면이 본 상태일 때만 바꾸는 조건부 갱신).

const patchSchema = z.object({
  id: z.string().uuid(),
  expected: z.enum(SERVICE_REQUEST_STATUSES),
  status: z.enum(SERVICE_REQUEST_STATUSES),
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
    return privateJson({ requests: await listAllServiceRequests() });
  } catch (error) {
    console.error("[admin/service-requests] list failed", error);
    return privateJson({ error: { code: "SERVICE_REQUEST_LIST_FAILED", message: "신청을 불러오지 못했습니다. 잠시 후 새로고침해 주세요." } }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: { code: "BAD_REQUEST", message: "바꿀 상태를 확인해 주세요." } }, { status: 400 });
  try {
    return privateJson({ request: await updateServiceRequestStatus(parsed.data.id, parsed.data.expected, parsed.data.status) });
  } catch (error) {
    if (error instanceof ServiceRequestError) {
      const message = error.code === "STATUS_CONFLICT" ? "그새 다른 상태로 바뀌었습니다. 새로고침 후 다시 확인해 주세요." : error.code === "NOT_FOUND" ? "신청을 찾을 수 없습니다." : "신청 테이블이 아직 없습니다. 마이그레이션을 적용해 주세요.";
      return privateJson({ error: { code: error.code, message } }, { status: error.status });
    }
    console.error("[admin/service-requests] update failed", error);
    return privateJson({ error: { code: "SERVICE_REQUEST_UPDATE_FAILED", message: "상태를 바꾸지 못했습니다." } }, { status: 500 });
  }
}
