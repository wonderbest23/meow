import { execFile, spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile, symlink, access } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";

const exec = promisify(execFile);
export const LAB_ROOT = "/private/tmp/oneul-account-lab-20260912";
export const LAB_PROJECT = "oneul-account-lab-20260912";
export const LAB_URL = "http://127.0.0.1:8094";
export const LAB_DB_URL = "http://127.0.0.1:55431";
const marker = "oneul-local-account-lab-v1";

export async function localCredentials() {
  if ((await readFile(join(LAB_ROOT, "lab-marker"), "utf8")) !== marker) throw new Error("Unrecognized test workspace");
  const { stdout } = await exec("supabase", ["status", "--workdir", LAB_ROOT, "-o", "json"], { maxBuffer: 1024 * 1024 });
  const data = JSON.parse(stdout);
  if (data.API_URL !== LAB_DB_URL || new URL(data.DB_URL).hostname !== "127.0.0.1") throw new Error("Only the isolated local Supabase instance is allowed");
  return { apiUrl: data.API_URL as string, serviceKey: data.SERVICE_ROLE_KEY as string, anonKey: data.ANON_KEY as string, dbUrl: data.DB_URL as string, authSecret: await readFile(join(LAB_ROOT, "auth-secret"), "utf8") };
}

async function prepare() {
  await mkdir(LAB_ROOT, { recursive: true, mode: 0o700 });
  try {
    if (await readFile(join(LAB_ROOT, "lab-marker"), "utf8") !== marker) throw new Error("Unrecognized test workspace");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(join(LAB_ROOT, "lab-marker"), marker, { mode: 0o600, flag: "wx" });
  }
  await mkdir(join(LAB_ROOT, "supabase"), { recursive: true });
  await cp(resolve("supabase/migrations"), join(LAB_ROOT, "supabase/migrations"), { recursive: true });
  await writeFile(join(LAB_ROOT, "supabase/config.toml"), `project_id = "${LAB_PROJECT}"
[api]
enabled = true
port = 55431
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 55432
shadow_port = 55430
major_version = 17
[db.seed]
enabled = false
[studio]
enabled = false
[inbucket]
enabled = true
port = 55434
[auth]
enabled = true
site_url = "${LAB_URL}"
additional_redirect_urls = ["${LAB_URL}/account", "http://localhost:8094/account"]
enable_signup = true
minimum_password_length = 8
[auth.email]
enable_signup = true
enable_confirmations = false
max_frequency = "1s"
[analytics]
enabled = false
[edge_runtime]
enabled = false
`, { mode: 0o600 });
  try { await access(join(LAB_ROOT, "auth-secret")); } catch { await writeFile(join(LAB_ROOT, "auth-secret"), randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" }); }
  console.log("[lab] Starting isolated Supabase on ports 55431/55432; no cloud project is linked");
  try {
    await exec("supabase", ["start", "--workdir", LAB_ROOT, "--exclude", "realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"], { timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    const output = String((error as { stderr?: string }).stderr ?? (error as Error).message);
    throw new Error(output.replace(/eyJ[A-Za-z0-9._-]+/g, "[local token redacted]").slice(-4000));
  }
  await localCredentials();
  console.log("[lab] Local database and authentication are ready; credentials remain in the local CLI");
}

async function serve() {
  const credentials = await localCredentials();
  const appRoot = join(LAB_ROOT, "app");
  await mkdir(appRoot, { recursive: true });
  for (const entry of ["app", "components", "lib", "public", "data", "middleware.ts", "tsconfig.json", "package.json", "package-lock.json", "cloudflare-env.d.ts", "cloudflare-runtime-shim.d.ts"]) {
    await cp(resolve(entry), join(appRoot, entry), { recursive: true });
  }
  try { await access(join(appRoot, "node_modules")); } catch { await symlink(resolve("node_modules"), join(appRoot, "node_modules"), "dir"); }
  // This lab validates Next routes and local Supabase, not Cloudflare Workflow bindings.
  await writeFile(join(appRoot, "next.config.ts"), "export default { devIndicators: false };\n");
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", PERSISTENCE_MODE: "supabase",
    SUPABASE_URL: credentials.apiUrl, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey,
    AUTH_PROJECT_SECRET: credentials.authSecret, PLAN_ACCOUNT_LINKING_ENABLED: "true",
    PAYMENTS_ENABLED: "false", NEXT_PUBLIC_PPT_GENERATION_VERIFIED: "false",
  };
  console.log(`[lab] Serving ${LAB_URL}; production env files, AI, payment and messaging credentials are excluded`);
  const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "8094"], { cwd: appRoot, env, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
  child.on("exit", code => { process.exitCode = code ?? 0; });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/local-account-lab.mts")) {
  const command = process.argv[2];
  try {
    if (command === "prepare") await prepare();
    else if (command === "serve") await serve();
    else if (command === "migrate") {
      await localCredentials();
      await cp(resolve("supabase/migrations"), join(LAB_ROOT, "supabase/migrations"), { recursive: true });
      await exec("supabase", ["migration", "up", "--local", "--workdir", LAB_ROOT]);
      console.log("[lab] Pending migrations applied only to the isolated local database");
    }
    else if (command === "stop") {
      await localCredentials();
      await exec("supabase", ["stop", "--workdir", LAB_ROOT]);
      console.log("[lab] Only the isolated test Supabase instance was stopped; local data was retained");
    } else throw new Error("Usage: node --import tsx scripts/local-account-lab.mts prepare|migrate|serve|stop");
  } catch (error) { console.error(error instanceof Error ? error.message : "Local lab failed"); process.exitCode = 1; }
}
