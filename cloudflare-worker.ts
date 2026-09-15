// @ts-expect-error The OpenNext worker is generated before Wrangler bundles this entrypoint.
import handler from "./.open-next/worker.js";
import { handleDraftPackageServiceRequest } from "./lib/draft-package/service";
import { handlePlanSectionServiceRequest } from "./lib/plan-builder/section-service";
import { customerSiteRequest, stagingUnavailable } from "./lib/staging/safety";

export { DraftPackageWorkflow } from "./lib/draft-package/workflow";
export { DirectPlanWorkflow } from "./lib/direct-plan/workflow";
export { PlanSectionsWorkflow } from "./lib/plan-builder/section-workflow";

export default {
  async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext) {
    const unavailable = stagingUnavailable({ ...env }, request.url);
    if (unavailable) return unavailable;
    const internalResponse = await handleDraftPackageServiceRequest(request, env);
    if (internalResponse) return internalResponse;
    const planSectionResponse = await handlePlanSectionServiceRequest(request, env);
    if (planSectionResponse) return planSectionResponse;
    return handler.fetch(customerSiteRequest(request, env.PLATFORM_APP_ORIGIN), env, context);
  },
} satisfies ExportedHandler<CloudflareEnv>;

// @ts-expect-error These OpenNext exports are generated during the Cloudflare build.
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
