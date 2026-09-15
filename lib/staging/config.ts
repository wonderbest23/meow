import { STAGING_WORKER, stagingOrigin, isStagingDatabaseRef } from "./safety";

const object = (raw: unknown): Record<string, unknown> => raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
const rows = (raw: unknown) => Array.isArray(raw) ? raw.map(object) : [];

export const STAGING_PUBLIC_KEYS = [
  "APP_ENV", "NEXT_PUBLIC_APP_ENV", "STAGING_READY", "PLATFORM_APP_ORIGIN",
  "STAGING_SUPABASE_PROJECT_REF", "SUPABASE_URL", "PERSISTENCE_MODE",
  "PLAN_ACCOUNT_LINKING_ENABLED", "PAYMENTS_ENABLED", "OPERATING_AI_ENABLED", "PROPOSAL_AI_ENABLED",
  "NEXT_PUBLIC_PPT_GENERATION_VERIFIED", "NEXT_PUBLIC_GOOGLE_CLIENT_ID", "RATE_LIMIT_BACKEND",
];

export function stagingConfigIssues(raw: unknown, bootstrap = false): string[] {
  const config = object(raw);
  const issues: string[] = [];
  if (config.name !== STAGING_WORKER) issues.push("CONFIG_WORKER_NAME");
  if (config.main !== (bootstrap ? "staging/bootstrap-worker.ts" : "cloudflare-worker.ts")) issues.push("CONFIG_ENTRYPOINT");
  if (config.workers_dev !== false || config.preview_urls !== false) issues.push("CONFIG_PUBLIC_URLS_DISABLED");
  if (!Array.isArray(config.routes) || config.routes.length !== 0 || config.route) issues.push("CONFIG_NO_ROUTES");
  if (config.env) issues.push("CONFIG_NO_INHERITED_ENVIRONMENTS");
  for (const key of ["kv_namespaces", "r2_buckets", "d1_databases", "hyperdrive", "queues", "durable_objects"]) {
    if (config[key]) issues.push(`CONFIG_UNREVIEWED_${key.toUpperCase()}`);
  }
  if (bootstrap) {
    for (const key of ["vars", "services", "workflows", "assets"]) if (config[key]) issues.push(`CONFIG_BOOTSTRAP_NO_${key.toUpperCase()}`);
    return issues;
  }
  const vars = object(config.vars);
  for (const key of Object.keys(vars)) if (!STAGING_PUBLIC_KEYS.includes(key)) issues.push("CONFIG_UNREVIEWED_VARIABLE");
  if (vars.APP_ENV !== "staging" || vars.NEXT_PUBLIC_APP_ENV !== "staging") issues.push("CONFIG_STAGING_ENV");
  if (vars.STAGING_READY !== "false") issues.push("CONFIG_START_CLOSED");
  if (!stagingOrigin(vars.PLATFORM_APP_ORIGIN)) issues.push("CONFIG_STAGING_ORIGIN");
  const ref = vars.STAGING_SUPABASE_PROJECT_REF, url = vars.SUPABASE_URL;
  if ((ref !== "" || url !== "") && (!isStagingDatabaseRef(ref) || url !== `https://${ref}.supabase.co`)) issues.push("CONFIG_STAGING_DATABASE");
  for (const key of ["PAYMENTS_ENABLED", "OPERATING_AI_ENABLED", "PROPOSAL_AI_ENABLED", "NEXT_PUBLIC_PPT_GENERATION_VERIFIED"]) {
    if (vars[key] !== "false") issues.push(`CONFIG_${key}_OFF`);
  }
  if (vars.PERSISTENCE_MODE !== "supabase" || vars.PLAN_ACCOUNT_LINKING_ENABLED !== "true" || vars.RATE_LIMIT_BACKEND !== "supabase") issues.push("CONFIG_PERSISTENCE");
  const services = rows(config.services);
  if (services.length !== 1 || services[0].binding !== "WORKER_SELF_REFERENCE" || services[0].service !== STAGING_WORKER || services[0].environment) issues.push("CONFIG_SELF_BINDING");
  const workflows = rows(config.workflows);
  const expected = [
    ["draft-package", "DRAFT_PACKAGE_WORKFLOW", "DraftPackageWorkflow"],
    ["direct-plan", "DIRECT_PLAN_WORKFLOW", "DirectPlanWorkflow"],
    ["plan-sections", "PLAN_SECTIONS_WORKFLOW", "PlanSectionsWorkflow"],
  ];
  if (workflows.some(row => row.script_name && row.script_name !== STAGING_WORKER) || workflows.length !== expected.length || expected.some(([suffix, binding, className]) => !workflows.some(row => row.name === `${STAGING_WORKER}-${suffix}` && row.binding === binding && row.class_name === className))) issues.push("CONFIG_WORKFLOW_ISOLATION");
  return issues;
}
