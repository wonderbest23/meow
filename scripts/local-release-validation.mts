import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { LAB_ROOT, LAB_URL, localCredentials } from "./local-account-lab.mts";

// This runner never provisions resources, loads env files, enables AI, or deploys.
if (process.argv.length > 2) throw new Error("Local validation accepts no deployment or environment arguments");
const root = fileURLToPath(new URL("..", import.meta.url));
const runtime = process.env.RUNTIME_NODE_MODULES;
assert(runtime, "Set RUNTIME_NODE_MODULES to the installed browser dependency directory");
const startedAt = new Date().toISOString();
const output = join(root, "artifacts", "local-release-validation", startedAt.replace(/[:.]/g, "-"));
const budgetPath = join(root, "artifacts/synthetic-ai-launch/budget.json");
const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const budgetBefore = sha(await readFile(budgetPath));
await localCredentials();

async function sourceFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const path = join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Source symlinks are not accepted: ${relative(root, path)}`);
    if (entry.isDirectory()) result.push(...await sourceFiles(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
const paths = ["middleware.ts", "package.json", "package-lock.json"];
for (const directory of ["app", "components", "lib", "data"]) paths.push(...(await sourceFiles(join(root, directory))).map(path => relative(root, path)));
const source = createHash("sha256");
for (const path of paths.sort()) {
  const contents = await readFile(join(root, path));
  assert.equal(sha(await readFile(join(LAB_ROOT, "app", path))), sha(contents), `Refresh the isolated app copy before testing: ${path}`);
  source.update(`${path}\0${sha(contents)}\n`);
}
const sourceFingerprint = source.digest("hex");
const response = await fetch(LAB_URL, { redirect: "error", signal: AbortSignal.timeout(90000) });
assert.equal(response.status, 200, "Start the isolated local server before validation");
await mkdir(output, { recursive: true, mode: 0o700 });
const env: NodeJS.ProcessEnv = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  CI: "true", NEXT_TELEMETRY_DISABLED: "1", RUNTIME_NODE_MODULES: runtime,
  OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", PAYMENTS_ENABLED: "false",
  PROPOSAL_DOCUMENT_REFRESH_TEST: "1",
};
const suites = [
  { name: "reliability", script: "scripts/reliability-tests.mts", timeout: 300000 },
  { name: "account-and-operating", script: "scripts/local-account-integration.test.mts", timeout: 300000 },
  { name: "homepage-lifecycle", script: "scripts/local-homepage-lifecycle.test.mts", timeout: 300000 },
  { name: "homepage-browser", script: "scripts/local-homepage-browser.test.mts", timeout: 300000, requires: "homepage-lifecycle" },
  { name: "document-and-proposal-browser", script: "scripts/local-proposal-business.test.mts", timeout: 300000 },
  { name: "staging-config", script: "scripts/staging-preflight.mts", timeout: 60000 },
  { name: "typescript", script: "node_modules/typescript/bin/tsc", args: ["--noEmit", "--incremental", "false"], timeout: 180000 },
];
type Check = { name: string; status: "passed" | "failed" | "skipped"; exitCode?: number | null; elapsedMs: number; timedOut?: boolean };
const checks: Check[] = [];
let active: ReturnType<typeof spawn> | undefined;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { interrupted = true; active?.kill("SIGTERM"); });
const redact = (text: string) => text.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").replace(/(Bearer\s+)\S+/gi, "$1[redacted]");
async function run(suite: typeof suites[number]): Promise<Check> {
  if (interrupted || (suite.requires && !checks.some(check => check.name === suite.requires && check.status === "passed"))) return { name: suite.name, status: "skipped", elapsedMs: 0 };
  const started = Date.now();
  const args = suite.args ? [suite.script, ...suite.args] : ["--import", "tsx", suite.script];
  active = spawn(process.execPath, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  const child = active;
  let tail = "", timedOut = false, killTimer: ReturnType<typeof setTimeout> | undefined;
  const collect = (chunk: Buffer) => { tail = (tail + chunk.toString()).slice(-8000); };
  child.stdout?.on("data", collect); child.stderr?.on("data", collect);
  const timer = setTimeout(() => {
    timedOut = true; child.kill("SIGTERM");
    killTimer = setTimeout(() => child.kill("SIGKILL"), 10000);
  }, suite.timeout);
  const exitCode = await new Promise<number | null>(resolve => { child.once("error", () => resolve(null)); child.once("close", resolve); });
  clearTimeout(timer); clearTimeout(killTimer); active = undefined;
  const status = exitCode === 0 && !timedOut && !interrupted ? "passed" : "failed";
  console.log(`[${suite.name}] ${status} (${Math.round((Date.now() - started) / 1000)}s)`);
  if (status === "failed") console.error(redact(tail));
  return { name: suite.name, status, exitCode, timedOut, elapsedMs: Date.now() - started };
}
async function saveReport() {
  const budgetUnchanged = sha(await readFile(budgetPath)) === budgetBefore;
  let sourceUnchanged = true;
  const currentSource = createHash("sha256");
  for (const path of paths) currentSource.update(`${path}\0${sha(await readFile(join(root, path)))}\n`);
  sourceUnchanged = currentSource.digest("hex") === sourceFingerprint;
  const report = {
    startedAt, finishedAt: new Date().toISOString(), sourceFingerprint, sourceUnchanged,
    app: LAB_URL, localOnly: true, checks, budgetUnchanged, paidAiCalls: 0, realPayments: 0,
    localPassed: checks.length === suites.length && checks.every(check => check.status === "passed") && budgetUnchanged && sourceUnchanged,
    releaseReady: false, deployed: false,
    notVerified: ["Real document/PPT AI generation quality and hosted job recovery", "Staging Google provider login", "PG sandbox checkout, cancellation and refund", "Hosted database and Cloudflare application deployment", "Production alert delivery and real customer support operations"],
  };
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  return report;
}
for (const suite of suites) { checks.push(await run(suite)); await saveReport(); }
const report = await saveReport();
console.log(JSON.stringify({ localPassed: report.localPassed, releaseReady: false, report: join(output, "report.json") }, null, 2));
process.exitCode = report.localPassed ? 0 : 1;
