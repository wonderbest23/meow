// @ts-expect-error The OpenNext worker is generated before Wrangler bundles this entrypoint.
import handler from "./.open-next/worker.js";
import { handleDraftPackageServiceRequest } from "./lib/draft-package/service";
import { PLAN_SECTION_INTERNAL_PATH, PLAN_SECTION_API_PATH } from "./lib/plan-builder/section-protocol";
import { customerSiteRequest, stagingUnavailable } from "./lib/staging/safety";
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
} satisfies ExportedHandler<CloudflareEnv>;

// @ts-expect-error These OpenNext exports are generated during the Cloudflare build.
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
