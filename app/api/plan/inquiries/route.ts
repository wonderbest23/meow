import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { listOwnerInquiries } from "../../../../lib/landing/repository";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";

export const runtime = "nodejs";

/*
 * 내 문의 — 이 주인의 모든 홈페이지 문의를 한 번에(왼쪽 메뉴 숫자와 /plan/inquiries 가 같이 쓴다).
 * 예전엔 화면이 사업마다 /api/plan/landing → /api/projects/:id/landing 을 차례로 불렀고(사업 8개면 16번),
 * 이 기기에 저장된 사업만 봐서 다른 기기에서 만든 사업의 문의가 빠졌다.
 */
const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  try {
    const identity = await requireGuestIdentity();
    const [items, state] = await Promise.all([listOwnerInquiries(identity.hash), loadPlanState(identity.hash).catch(() => null)]);
    const titles = new Map((state?.plans ?? []).map(plan => [plan.id, plan.title]));
    return NextResponse.json({
      items: items.map(item => ({
        lead: item.lead,
        projectId: item.projectId,
        planId: item.planId ?? "",
        planTitle: (item.planId && titles.get(item.planId)) || item.projectTitle || item.businessName || "내 사업",
        businessName: item.businessName || "내 사업",
      })),
    }, { headers });
  } catch (error) {
    console.error("[plan/inquiries] failed", error);
    return NextResponse.json({ error: { code: "INQUIRIES_LOAD_FAILED", message: "문의를 불러오지 못했어요. 잠시 후 다시 확인해 주세요." } }, { status: 500, headers });
  }
}
