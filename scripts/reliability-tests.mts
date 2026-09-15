import { spawnSync } from "node:child_process";

// Each suite runs in memory with credentials removed and external fetch disabled.
const suites = ["deck-job", "coach-deck-context", "coach-review-fallback", "llm", "llm-cache", "plan-section-service", "section-save-race", "document-edit", "document-table-roundtrip", "document-context", "coach-job-status", "plan-guest-persist", "plan-sync", "plan-account-linking", "plan-demo-store", "auth-session-input", "plan-cache-owner", "payment-security", "plan-payment-status", "business-hub", "business-journeys", "operating-records", "operating-analysis", "business-navigation", "launch-missions", "landing-from-plan", "plan-landing-chain", "landing-save", "landing-business-content"];
suites.push("synthetic-ai-budget", "admin-jobs", "llm-usage", "llm-alert", "landing-publication");
suites.push("staging-safety");
suites.push("prelaunch-db-safety");
suites.push("prelaunch-lifecycle-safety");
suites.push("nicepay-environment");
suites.push("nicepay-reconciliation");
suites.push("proposal-blueprint", "proposal-revision", "proposal-render", "proposal-generation");
suites.push("proposal-editor");
suites.push("proposal-rewrite");
suites.push("proposal-business");
suites.push("document-refresh");
suites.push("proposal-background");
suites.push("deck-export-state");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|TOKEN|SECRET|PASSWORD|SUPABASE|DATABASE_URL/.test(key)));
Object.assign(env, { NODE_ENV: "test", PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
let failures = 0;
for (const suite of suites) {
  const url = new URL(`./${suite}.test.ts`, import.meta.url).href;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `globalThis.fetch = async () => { throw new Error('External network disabled in reliability tests'); }; ${suite === "business-hub" ? "process.argv.push('--state-only');" : ""} await import(${JSON.stringify(url)});`], { cwd: new URL("..", import.meta.url), env, encoding: "utf8", timeout: 60000 });
  console.log(`\n[${suite}] ${result.status === 0 ? "PASS" : "FAIL"}\n${result.stdout}${result.stderr}`);
  if (result.status !== 0) failures++;
}
console.log(`${suites.length - failures}/${suites.length} reliability suites passed`);
process.exitCode = failures ? 1 : 0;
