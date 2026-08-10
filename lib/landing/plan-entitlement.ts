import { getProject } from "../project-repository";
import { paidHomepagePlanIds } from "../payments/plan-orders";

/*
 * 사업계획서로 만든 홈페이지의 수정·공개 권한.
 *
 * 미리보기는 무료지만 고치고 공개하는 것은 결제 대상이다.
 * 화면에서 버튼을 숨기는 것만으로는 API를 직접 부르면 뚫리므로,
 * 저장·공개 라우트가 모두 이 함수를 거친다.
 */

export type LandingEditReason = "ok" | "login_required" | "payment_required" | "not_found";

export async function checkLandingEditAccess(
  projectId: string,
  guestTokenHash: string,
  userId: string | null,
): Promise<LandingEditReason> {
  const project = await getProject(projectId, guestTokenHash);
  if (!project) return "not_found";

  const opportunity = (project.opportunity ?? {}) as { source?: string; planId?: string };
  // 사업계획서에서 만든 홈페이지가 아니면(옛 진단 흐름) 기존 권한 규칙을 그대로 둔다
  if (opportunity.source !== "plan-builder") return "ok";

  if (!userId) return "login_required";
  const planId = opportunity.planId;
  if (!planId) return "payment_required";

  const purchased = await paidHomepagePlanIds(userId);
  return purchased.has(planId) ? "ok" : "payment_required";
}

export function landingEditErrorResponse(reason: Exclude<LandingEditReason, "ok">) {
  if (reason === "not_found") {
    return { status: 404, body: { error: { code: "PROJECT_NOT_FOUND", message: "홈페이지를 찾을 수 없습니다." } } };
  }
  if (reason === "login_required") {
    return { status: 401, body: { error: { code: "LOGIN_REQUIRED", message: "로그인 후 이용할 수 있습니다." } } };
  }
  return {
    status: 402,
    body: {
      error: {
        code: "HOMEPAGE_PAYMENT_REQUIRED",
        message: "홈페이지 수정과 공개는 결제 후 이용할 수 있습니다.",
      },
    },
  };
}
