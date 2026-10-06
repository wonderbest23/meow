// @ts-expect-error The OpenNext worker is generated before Wrangler bundles this entrypoint.
import handler from "./.open-next/worker.js";
import { handleDraftPackageServiceRequest } from "./lib/draft-package/service";
import { PLAN_SECTION_INTERNAL_PATH, PLAN_SECTION_API_PATH } from "./lib/plan-builder/section-protocol";
import { customerSiteRequest, stagingUnavailable } from "./lib/staging/safety";
import { signBody } from "./lib/plan-builder/section-signature";
import { betaApiBoundary } from "./lib/staging/beta-boundary";

export { DraftPackageWorkflow } from "./lib/draft-package/workflow";
export { DirectPlanWorkflow } from "./lib/direct-plan/workflow";
export { PlanSectionsWorkflow } from "./lib/plan-builder/section-workflow";

export default {
  async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext) {
    const betaBlocked = betaApiBoundary(request, (env as unknown as Record<string, unknown>).INTAKE_BETA_SAFETY);
    if (betaBlocked) return betaBlocked;
    const unavailable = stagingUnavailable({ ...env }, request.url);
    if (unavailable) return unavailable;
    const internalResponse = await handleDraftPackageServiceRequest(request, env);
    if (internalResponse) return internalResponse;
    if (new URL(request.url).pathname === PLAN_SECTION_INTERNAL_PATH) {
      const target = new URL(request.url);
      target.pathname = PLAN_SECTION_API_PATH;
      return handler.fetch(new Request(target, request), env, context);
    }
    return handler.fetch(customerSiteRequest(request, env.PLATFORM_APP_ORIGIN), env, context);
  },
  /*
   * 예약 실행(wrangler.jsonc triggers.crons): 홈페이지 문의 알림 중 재시도 시각이 된 것을 다시 보낸다.
   * 같은 실행에서 주간 리포트(월 9시~)와 세금 신고 마감 문자(마감 7일·1일 전 9시~, 하루 한 번은 표가 지킨다)도 돈다.
   * 섹션 생성과 같은 서명된 내부 경로로 앱 안의 처리기를 부른다(외부에서는 서명 없이 부를 수 없다).
   */
  async scheduled(_controller: ScheduledController, env: CloudflareEnv, context: ExecutionContext) {
    const secret = (env as unknown as Record<string, string | undefined>).SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) return;
    const body = JSON.stringify({ operation: "sweepLeadNotifications", job: {} });
    const timestamp = Date.now().toString();
    const request = new Request(`https://scheduled.internal${PLAN_SECTION_API_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-plan-timestamp": timestamp, "x-plan-signature": await signBody(secret, timestamp, body) },
      body,
    });
    const response = await handler.fetch(request, env, context);
    console.info("[lead-notifications] sweep", response.status, (await response.text()).slice(0, 200));
  },
} satisfies ExportedHandler<CloudflareEnv>;

// @ts-expect-error These OpenNext exports are generated during the Cloudflare build.
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
