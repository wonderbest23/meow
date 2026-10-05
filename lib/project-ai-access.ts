import { NextResponse } from "next/server";
import { enforceRateLimit } from "./rate-limit";
import { checkLandingEditAccess } from "./landing/plan-entitlement";
import { isEditorPreviewAccount } from "./landing/editor-preview";
import { paidHomepagePlanIds } from "./payments/plan-orders";
import type { ProjectRecord } from "./service-domain";

/*
 * 사업(프로젝트) 안에서 AI·웹검색을 부르는 라우트의 공통 관문.
 *
 * 소유권만 확인하면, 무료 계정이 /api/plan/landing 으로 받은 프로젝트(그릇은 paid 로
 * 만들어진다)로 생성·검토 라우트를 반복 호출해 모델 비용을 무한히 쓸 수 있다.
 * 그래서 (1) 결제한 사업인지 서버에서 다시 보고 (2) 사람 단위로 호출 횟수를 묶는다.
 *  - 옛 결제 흐름 프로젝트: paymentStatus 가 paid / test_paid
 *  - 사업계획서에서 만든 프로젝트(source 가 plan-builder 이거나 planId 가 있다): 홈페이지 편집
 *    권한(= 해당 계획서 결제)이 있어야 한다. ensure_plan_project(0030 마이그레이션)가 무료 사용자
 *    에게도 payment_status='paid' 로 그릇을 만들기 때문에 paymentStatus 만으로는 열지 않는다.
 */

const PAYMENT_REQUIRED_MESSAGE = "이 기능은 결제한 사업에서 쓸 수 있어요.";

export async function requireProjectAiAccess(
  request: Request,
  project: ProjectRecord,
  identity: { hash: string; userId: string | null; email?: string | null },
): Promise<Response | null> {
  const opportunity = (project.opportunity ?? {}) as { source?: string; planId?: unknown };
  const planId = typeof opportunity.planId === "string" ? opportunity.planId.trim() : "";
  if (opportunity.source === "plan-builder" || planId) {
    // 그릇은 paid 로 만들어지므로 paymentStatus 를 믿으면 안 된다 — 계획서 결제 여부를 본다
    const reason = opportunity.source === "plan-builder"
      ? await checkLandingEditAccess(project.id, identity.hash, identity.userId, identity.email ?? null)
      : await planEntitlement(planId, identity.userId, identity.email ?? null);
    if (reason === "login_required") {
      return NextResponse.json({ error: { code: "LOGIN_REQUIRED", message: "로그인 후 이용할 수 있습니다." } }, { status: 401 });
    }
    if (reason === "not_found") {
      return NextResponse.json({ error: { code: "PROJECT_NOT_FOUND", message: "프로젝트를 찾을 수 없습니다." } }, { status: 404 });
    }
    if (reason !== "ok") {
      return NextResponse.json({ error: { code: "PROJECT_PAYMENT_REQUIRED", message: PAYMENT_REQUIRED_MESSAGE } }, { status: 402 });
    }
  } else if (project.paymentStatus !== "paid" && project.paymentStatus !== "test_paid") {
    return NextResponse.json({ error: { code: "PROJECT_PAYMENT_REQUIRED", message: PAYMENT_REQUIRED_MESSAGE } }, { status: 402 });
  }

  // 쿠키 없이 IP 만 바꿔 오는 경우도 막도록 계정(없으면 소유 토큰) 단위로 센다
  return enforceRateLimit("project-ai", request, {
    limit: 20,
    windowMs: 60 * 60_000,
    key: identity.userId ?? identity.hash,
    message: "AI 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
}

/*
 * planId 는 있는데 source 가 plan-builder 가 아닌 프로젝트 — checkLandingEditAccess 는 이 경우
 * "ok" 를 돌려주므로(옛 진단 흐름 호환), 같은 결제 규칙을 여기서 직접 적용한다.
 */
async function planEntitlement(planId: string, userId: string | null, email: string | null) {
  if (!userId) return "login_required" as const;
  if ((await paidHomepagePlanIds(userId)).has(planId)) return "ok" as const;
  if (email && isEditorPreviewAccount(email)) return "ok" as const;
  return "payment_required" as const;
}
