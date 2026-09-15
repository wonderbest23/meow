import { constants } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { stagingConfigIssues } from "../lib/staging/config.ts";

// No environment file is accepted by this build-only rehearsal. Runtime provisioning is a separate gate.
if (process.argv.length > 2) throw new Error("This isolated build accepts no environment files or deploy options");
const root = fileURLToPath(new URL("..", import.meta.url));
const configText = await readFile(join(root, "wrangler.staging.jsonc"), "utf8");
const config = JSON.parse(configText);
const issues = stagingConfigIssues(config);
if (issues.length) throw new Error(issues.join(", "));
const buildRoot = await mkdtemp("/private/tmp/oneul-staging-build-");
await mkdir(buildRoot, { mode: 0o700, recursive: true });
const entries = ["app", "components", "lib", "public", "data", "scripts", "staging", "middleware.ts", "next.config.ts", "open-next.config.ts", "tsconfig.json", "package.json", "package-lock.json", "next-env.d.ts", "cloudflare-env.d.ts", "cloudflare-runtime-shim.d.ts", "cloudflare-worker.ts", "wrangler.staging.jsonc", "wrangler.staging.bootstrap.json"];
const safeFile = (path: string) => !/^\.env(?:\.|$)|^\.dev\.vars|^\.git$/.test(basename(path));
for (const entry of entries) await cp(join(root, entry), join(buildRoot, entry), { recursive: true, filter: safeFile, verbatimSymlinks: true });
// An isolated dependency tree keeps Next's file tracing out of the live checkout. APFS can clone files.
console.log(`[staging] Preparing dependency copy in ${buildRoot}`);
await cp(join(root, "node_modules"), join(buildRoot, "node_modules"), { recursive: true, mode: constants.COPYFILE_FICLONE, filter: safeFile, verbatimSymlinks: true });
// Next's dev adapter can inspect the default Wrangler file even when the build CLI gets --config.
await writeFile(join(buildRoot, "wrangler.jsonc"), configText, { mode: 0o600 });
const env: NodeJS.ProcessEnv = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_ENV: "production", CI: "true", BUILD_LOW_MEMORY: "1", NEXT_TELEMETRY_DISABLED: "1",
  WRANGLER_SEND_METRICS: "false", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  ...config.vars,
};
console.log("[staging] Building OpenNext without production env files, database credentials, AI or payment keys");
const child = spawn(process.execPath, [join(buildRoot, "node_modules/@opennextjs/cloudflare/dist/cli/index.js"), "build", "--config", "wrangler.staging.jsonc"], { cwd: buildRoot, env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
const code = await new Promise<number>((resolve, reject) => { child.on("error", reject); child.on("exit", code => resolve(code ?? 1)); });
const report: Record<string, unknown> = { buildRoot, passed: code === 0, exitCode: code, productionEnvironmentLoaded: false, deployed: false, runtimeReady: false };
if (code === 0) {
  const compiled = await readFile(join(buildRoot, ".open-next/cloudflare/next-env.mjs"), "utf8");
  const declarations = compiled.trim().split("\n");
  const empty = declarations.length === 3 && declarations.every(line => /^export const (production|development|test) = \{\};$/.test(line));
  const envFiles = (await readdir(buildRoot)).filter(name => /^\.env(?:\.|$)|^\.dev\.vars/.test(name));
  report.compiledEnvironmentEmpty = empty;
  report.environmentFiles = envFiles;
  report.passed = empty && envFiles.length === 0;
}
await writeFile(join(buildRoot, "staging-build-report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
