import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { stagingConfigIssues } from "../lib/staging/config.ts";
import { stagingRuntimeIssues } from "../lib/staging/safety.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--runtime")) throw new Error("Only --runtime is supported; production environment files must not be loaded");
const issues = [
  ...stagingConfigIssues(JSON.parse(readFileSync(resolve(root, "wrangler.staging.jsonc"), "utf8"))),
  ...stagingConfigIssues(JSON.parse(readFileSync(resolve(root, "wrangler.staging.bootstrap.json"), "utf8")), true),
];
if (args.includes("--runtime")) {
  const path = resolve(root, ".env.staging.local");
  if (!existsSync(path)) issues.push("STAGING_ENV_FILE_MISSING");
  else {
    const env = parseEnv(readFileSync(path, "utf8"));
    issues.push(...stagingRuntimeIssues(env));
    if (env.NEXT_PUBLIC_APP_ENV !== "staging") issues.push("STAGING_PUBLIC_ENV_REQUIRED");
    if (!env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.endsWith(".apps.googleusercontent.com")) issues.push("STAGING_GOOGLE_CLIENT_REQUIRED");
    if (env.STAGING_READY !== "false") issues.push("STAGING_START_CLOSED");
    for (const key of ["ADMIN_CHAT_PASSWORD", "ADMIN_SESSION_SECRET"]) {
      if ((env[key]?.length ?? 0) < 32) issues.push(`STAGING_${key}_REQUIRED`);
    }
  }
}
console.log(JSON.stringify({ scope: args.includes("--runtime") ? "staging-runtime-readiness" : "staging-config-only", ready: !issues.length, issues: [...new Set(issues)], productionEnvironmentLoaded: false, providerCallsMade: false }, null, 2));
process.exitCode = issues.length ? 1 : 0;
