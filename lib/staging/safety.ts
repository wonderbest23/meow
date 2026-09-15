export const STAGING_WORKER = "today-startup-staging";
export const PRODUCTION_SUPABASE_REFS = ["hagzlppubxxzxllsehbr"];
// Existing projects are not disposable staging targets, even when paused or named "test".
export const PROTECTED_SUPABASE_REFS = [
  ...PRODUCTION_SUPABASE_REFS,
  "nurpesdatxgspsifsllu",
  "teaelrzxuigiocnukwha",
  "tmzpoqpyaofkfcnwjpff",
];
export function isStagingDatabaseRef(ref: unknown): ref is string {
  return typeof ref === "string" && /^[a-z]{20}$/.test(ref) && !PROTECTED_SUPABASE_REFS.includes(ref);
}
export const PRODUCTION_HOSTS = new Set([
  "oneulstart.com", "www.oneulstart.com", "connect.oneulstart.com",
  "today-startup.rena35200.workers.dev",
]);

export type StagingEnvironment = Record<string, unknown>;
const value = (env: StagingEnvironment, key: string) => typeof env[key] === "string" ? env[key].trim() : "";

export function stagingOrigin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && /^today-startup-staging\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)
      && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

/** Phase one is authentication and persistence only. Paid providers stay disconnected. */
export function stagingRuntimeIssues(env: StagingEnvironment): string[] {
  const issues: string[] = [];
  if (value(env, "APP_ENV") !== "staging") issues.push("STAGING_ENV_REQUIRED");
  if (!stagingOrigin(value(env, "PLATFORM_APP_ORIGIN"))) issues.push("STAGING_ORIGIN_REQUIRED");
  const ref = value(env, "STAGING_SUPABASE_PROJECT_REF");
  if (!isStagingDatabaseRef(ref)) issues.push("STAGING_DATABASE_REQUIRED");
  if (value(env, "SUPABASE_URL") !== `https://${ref}.supabase.co`) issues.push("STAGING_DATABASE_MISMATCH");
  if (value(env, "PERSISTENCE_MODE") !== "supabase") issues.push("STAGING_PERSISTENCE_REQUIRED");
  if (!value(env, "SUPABASE_SERVICE_ROLE_KEY")) issues.push("STAGING_DATABASE_KEY_REQUIRED");
  if (value(env, "AUTH_PROJECT_SECRET").length < 32) issues.push("STAGING_AUTH_SECRET_REQUIRED");
  if (value(env, "PLAN_ACCOUNT_LINKING_ENABLED") !== "true") issues.push("STAGING_ACCOUNT_LINKING_REQUIRED");
  for (const key of ["PAYMENTS_ENABLED", "OPERATING_AI_ENABLED", "PROPOSAL_AI_ENABLED", "NEXT_PUBLIC_PPT_GENERATION_VERIFIED"]) {
    if (value(env, key) !== "false") issues.push(`STAGING_${key}_MUST_BE_OFF`);
  }
  for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "NICEPAY_CLIENT_KEY", "NICEPAY_SECRET_KEY", "NICEPAY_SANDBOX_CLIENT_KEY", "NICEPAY_SANDBOX_SECRET_KEY", "TOSS_CLIENT_KEY", "TOSS_SECRET_KEY", "CLOUDFLARE_SAAS_API_TOKEN", "CLOUDFLARE_ZONE_ID", "LLM_ALERT_WEBHOOK_URL"]) {
    if (value(env, key)) issues.push(`STAGING_${key}_NOT_ALLOWED`);
  }
  return issues;
}

export function stagingUnavailable(env: StagingEnvironment, requestUrl?: string): Response | null {
  const isStagingHost = requestUrl ? Boolean(stagingOrigin(new URL(requestUrl).origin)) : false;
  if (value(env, "APP_ENV") !== "staging" && !isStagingHost) return null;
  if (value(env, "STAGING_READY") === "true" && stagingRuntimeIssues(env).length === 0) return null;
  return Response.json({ error: { code: "STAGING_NOT_READY" } }, {
    status: 503,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
  });
}

export function customerSiteRequest(request: Request, configuredOrigin?: string): Request {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  const platform = PRODUCTION_HOSTS.has(hostname) || hostname === "localhost" || hostname === "127.0.0.1"
    || hostname.endsWith(".localhost") || url.origin === stagingOrigin(configuredOrigin);
  if (platform || !["GET", "HEAD"].includes(request.method) || url.pathname !== "/") return request;
  url.pathname = "/customer-site";
  return new Request(url, request);
}
