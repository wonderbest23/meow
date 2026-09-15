import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { googleClientId } from "../lib/google-client-id";
import { stagingConfigIssues } from "../lib/staging/config";
import { customerSiteRequest, stagingOrigin, stagingRuntimeIssues, stagingUnavailable, PROTECTED_SUPABASE_REFS, isStagingDatabaseRef } from "../lib/staging/safety";
import bootstrapWorker from "../staging/bootstrap-worker";

const origin = "https://today-startup-staging.rena35200.workers.dev";
const valid = {
  APP_ENV: "staging", STAGING_READY: "true", PLATFORM_APP_ORIGIN: origin,
  STAGING_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst", SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-key", AUTH_PROJECT_SECRET: "synthetic-secret".repeat(3),
  PERSISTENCE_MODE: "supabase", PLAN_ACCOUNT_LINKING_ENABLED: "true",
  PAYMENTS_ENABLED: "false", OPERATING_AI_ENABLED: "false", PROPOSAL_AI_ENABLED: "false", NEXT_PUBLIC_PPT_GENERATION_VERIFIED: "false",
};
assert.deepEqual(stagingRuntimeIssues(valid), []);
assert.equal(stagingUnavailable(valid), null);
assert.equal(stagingUnavailable({ APP_ENV: "production" }), null);
assert.equal(stagingUnavailable({}, `${origin}/account`)?.status, 503);
assert.equal(stagingUnavailable({ ...valid, APP_ENV: "production" }, origin)?.status, 503);
for (const env of [{ ...valid, STAGING_READY: "false" }, { ...valid, SUPABASE_SERVICE_ROLE_KEY: "" }, { ...valid, AUTH_PROJECT_SECRET: "short" }]) {
  const response = stagingUnavailable(env)!;
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("x-robots-tag")!, /noindex/);
}
for (const key of ["PAYMENTS_ENABLED", "OPERATING_AI_ENABLED", "PROPOSAL_AI_ENABLED", "NEXT_PUBLIC_PPT_GENERATION_VERIFIED"]) {
  assert.ok(stagingRuntimeIssues({ ...valid, [key]: "true" }).length);
  assert.ok(stagingRuntimeIssues({ ...valid, [key]: undefined }).length);
}
for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "NICEPAY_CLIENT_KEY", "NICEPAY_SECRET_KEY", "NICEPAY_SANDBOX_CLIENT_KEY", "NICEPAY_SANDBOX_SECRET_KEY", "TOSS_CLIENT_KEY", "TOSS_SECRET_KEY", "CLOUDFLARE_SAAS_API_TOKEN", "CLOUDFLARE_ZONE_ID", "LLM_ALERT_WEBHOOK_URL"]) {
  assert.ok(stagingRuntimeIssues({ ...valid, [key]: "synthetic" }).includes(`STAGING_${key}_NOT_ALLOWED`));
}
assert.ok(stagingRuntimeIssues({ ...valid, STAGING_SUPABASE_PROJECT_REF: "hagzlppubxxzxllsehbr", SUPABASE_URL: "https://hagzlppubxxzxllsehbr.supabase.co" }).includes("STAGING_DATABASE_REQUIRED"));
assert.ok(stagingRuntimeIssues({ ...valid, SUPABASE_URL: "https://hagzlppubxxzxllsehbr.supabase.co" }).includes("STAGING_DATABASE_MISMATCH"));
for (const ref of PROTECTED_SUPABASE_REFS) {
  assert.equal(isStagingDatabaseRef(ref), false);
  const protectedEnv = { ...valid, STAGING_SUPABASE_PROJECT_REF: ref, SUPABASE_URL: `https://${ref}.supabase.co` };
  assert.ok(stagingRuntimeIssues(protectedEnv).includes("STAGING_DATABASE_REQUIRED"));
  assert.equal(stagingUnavailable(protectedEnv)?.status, 503);
}
for (const ref of [undefined, "", "newapp", "abcdefghijklmnopqrst/path", "abcdefghijklmnopqrst "]) assert.equal(isStagingDatabaseRef(ref), false);
assert.equal(stagingOrigin(origin), origin);
for (const bad of ["https://oneulstart.com", `${origin}.example.com`, `${origin}/path`, `${origin}?foo=1`, origin.replace("https", "http"), origin.replace("https://", "https://user@")]) assert.equal(stagingOrigin(bad), null);
for (const url of [origin, "https://oneulstart.com", "https://www.oneulstart.com", "https://connect.oneulstart.com", "https://today-startup.rena35200.workers.dev", "http://localhost:8083", "http://127.0.0.1:8094"]) {
  assert.equal(new URL(customerSiteRequest(new Request(url), origin).url).pathname, "/");
}
assert.equal(new URL(customerSiteRequest(new Request("https://customer.example"), origin).url).pathname, "/customer-site");
assert.equal(new URL(customerSiteRequest(new Request("https://customer.example/api/test"), origin).url).pathname, "/api/test");
assert.equal(new URL(customerSiteRequest(new Request("https://customer.example", { method: "POST" }), origin).url).pathname, "/");
assert.equal(googleClientId(undefined, "staging"), "");
assert.equal(googleClientId(" test-client ", "staging"), "test-client");
assert.ok(googleClientId(undefined, "production").endsWith(".apps.googleusercontent.com"));
const config = JSON.parse(readFileSync(new URL("../wrangler.staging.jsonc", import.meta.url), "utf8"));
assert.deepEqual(stagingConfigIssues(config), []);
assert.deepEqual(stagingConfigIssues({ ...config, vars: { ...config.vars, STAGING_SUPABASE_PROJECT_REF: valid.STAGING_SUPABASE_PROJECT_REF, SUPABASE_URL: valid.SUPABASE_URL } }), []);
for (const ref of PROTECTED_SUPABASE_REFS) {
  assert.ok(stagingConfigIssues({ ...config, vars: { ...config.vars, STAGING_SUPABASE_PROJECT_REF: ref, SUPABASE_URL: `https://${ref}.supabase.co` } }).includes("CONFIG_STAGING_DATABASE"));
}
for (const vars of [
  { ...config.vars, SUPABASE_URL: valid.SUPABASE_URL },
  { ...config.vars, STAGING_SUPABASE_PROJECT_REF: valid.STAGING_SUPABASE_PROJECT_REF },
  { ...config.vars, STAGING_SUPABASE_PROJECT_REF: valid.STAGING_SUPABASE_PROJECT_REF, SUPABASE_URL: "https://hagzlppubxxzxllsehbr.supabase.co" },
]) assert.ok(stagingConfigIssues({ ...config, vars }).includes("CONFIG_STAGING_DATABASE"));
assert.ok(stagingConfigIssues({ ...config, workflows: config.workflows.map((workflow: object) => ({ ...workflow, script_name: "today-startup" })) }).includes("CONFIG_WORKFLOW_ISOLATION"));
assert.deepEqual(stagingConfigIssues({ ...config, workflows: config.workflows.map((workflow: object) => ({ ...workflow, script_name: "today-startup-staging" })) }), []);
assert.ok(stagingConfigIssues({ ...config, services: [{ ...config.services[0], environment: "production" }] }).includes("CONFIG_SELF_BINDING"));
for (const patch of [{ name: "today-startup" }, { workers_dev: true }, { preview_urls: true }, { routes: ["oneulstart.com/*"] }, { services: [{ binding: "WORKER_SELF_REFERENCE", service: "today-startup" }] }, { workflows: config.workflows.slice(1) }, { vars: { ...config.vars, OPENAI_API_KEY: "synthetic" } }, { vars: { ...config.vars, PAYMENTS_ENABLED: "true" } }]) {
  assert.ok(stagingConfigIssues({ ...config, ...patch }).length);
}
const bootstrap = JSON.parse(readFileSync(new URL("../wrangler.staging.bootstrap.json", import.meta.url), "utf8"));
assert.deepEqual(stagingConfigIssues(bootstrap, true), []);
assert.ok(stagingConfigIssues({ ...bootstrap, vars: { OPENAI_API_KEY: "synthetic" } }, true).length);
bootstrapWorker.fetch().then(response => {
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  console.log("PASS staging isolation, fail-closed configuration, host routing and Google client selection");
}).catch(error => { console.error(error); process.exitCode = 1; });
