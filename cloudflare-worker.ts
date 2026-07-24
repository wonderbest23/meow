// @ts-expect-error The OpenNext worker is generated before Wrangler bundles this entrypoint.
import handler from "./.open-next/worker.js";
import { handleDraftPackageServiceRequest } from "./lib/draft-package/service";

export { DraftPackageWorkflow } from "./lib/draft-package/workflow";
export { DirectPlanWorkflow } from "./lib/direct-plan/workflow";

const platformHosts = new Set([
  "oneulstart.com",
  "www.oneulstart.com",
  "connect.oneulstart.com",
  "today-startup.rena35200.workers.dev",
]);

function customerSiteRequest(request: Request) {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  const isCustomerHostname = !platformHosts.has(hostname)
    && hostname !== "localhost"
    && !hostname.endsWith(".localhost");
  if (!isCustomerHostname || (request.method !== "GET" && request.method !== "HEAD")) return request;
  if (url.pathname !== "/") return request;
  url.pathname = "/customer-site";
  return new Request(url, request);
}

export default {
  async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext) {
    const internalResponse = await handleDraftPackageServiceRequest(request, env);
    if (internalResponse) return internalResponse;
    return handler.fetch(customerSiteRequest(request), env, context);
  },
} satisfies ExportedHandler<CloudflareEnv>;

// @ts-expect-error These OpenNext exports are generated during the Cloudflare build.
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
