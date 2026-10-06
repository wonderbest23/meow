import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../../lib/rate-limit";
import { setLandingLeadHandled } from "../../../../../../lib/landing/repository";

const headers = { "Cache-Control": "private, no-store" };

/*
 * 접수된 문의 '처리 완료' 표시 — 연락을 마친 문의와 아직 답할 문의를 나눈다.
 * 문의 목록(GET /landing)과 같은 주인 확인: 이 프로젝트의 주인 해시로 홈페이지를 찾고, 그 홈페이지의 문의만 바꾼다.
 */
const bodySchema = z.object({ leadId: z.string().uuid(), handled: z.boolean() }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const limited = await enforceRateLimit("landing-lead-handled", request, { limit: 120, windowMs: 10 * 60_000, message: "잠시 후 다시 시도해주세요." });
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "요청을 확인해 주세요." } }, { status: 400, headers });
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const result = await setLandingLeadHandled(projectId, identity.hash, parsed.data.leadId, parsed.data.handled);
    if (result === "unsupported") return NextResponse.json({ error: { code: "LEAD_STATUS_UNAVAILABLE", message: "처리 완료 표시는 아직 준비 중이에요." } }, { status: 503, headers });
    if (!result) return NextResponse.json({ error: { code: "LEAD_NOT_FOUND", message: "문의를 찾을 수 없어요. 새로고침해 주세요." } }, { status: 404, headers });
    return NextResponse.json({ leadId: parsed.data.leadId, handledAt: result.handledAt }, { headers });
  } catch (error) {
    const notFound = error instanceof Error && error.message === "PROJECT_NOT_FOUND";
    return NextResponse.json({ error: { code: notFound ? "PROJECT_NOT_FOUND" : "LEAD_UPDATE_FAILED", message: notFound ? "홈페이지를 찾을 수 없어요." : "처리 상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요." } }, { status: notFound ? 404 : 500, headers });
  }
}
