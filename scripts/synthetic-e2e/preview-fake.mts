import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { cp, mkdtemp, open, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const intake = process.argv.includes("--intake");
const directory = await mkdtemp(intake ? "/private/tmp/oneul-intake-preview-" : "/private/tmp/oneul-productization-preview-");
for (const entry of ["app", "components", "lib", "data", "public", "package.json", "tsconfig.json", "next-env.d.ts"]) {
  await cp(join(root, entry), join(directory, entry), { recursive: true, mode: constants.COPYFILE_FICLONE,
    filter: path => !/^\.env(?:\.|$)|^\.dev\.vars|^\.git$/.test(basename(path)) });
}
await cp(join(root, "scripts/prelaunch-next.config.ts"), join(directory, "next.config.ts"));
await cp(join(root, "scripts/synthetic-e2e/inject"), directory, { recursive: true });
// 복사본에만: 합성 로그인(쿠키 syn_uid) — 실제 저장소·운영 코드는 그대로
{
  const { readFile, writeFile: wf } = await import("node:fs/promises");
  const authPath = join(directory, "lib/account-auth.ts");
  const src = await readFile(authPath, "utf8");
  const marker = "export async function getAuthenticatedUser(): Promise<User | null> {";
  if (!src.includes(marker)) throw new Error("auth marker missing");
  await wf(authPath, src.replace(marker, marker + `
  if (process.env.SYNTHETIC_AUTH === "1") { const uid = (await cookies()).get("syn_uid")?.value; return uid ? ({ id: uid, email: uid + "@synthetic.invalid", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date(0).toISOString() } as unknown as User) : null; }`));
}
await symlink(join(root, "node_modules"), join(directory, "node_modules"), "dir");
const reservation = createServer();
await new Promise<void>((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
const address = reservation.address();
if (!address || typeof address === "string") throw new Error("Local preview port unavailable");
const port = address.port;
await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
const log = await open(join(directory, "server.log"), "a", 0o600);
const child = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: directory, detached: true, stdio: ["ignore", log.fd, log.fd],
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1",
    PERSISTENCE_MODE: "demo-memory", ANTHROPIC_API_KEY: "synthetic-not-a-real-key", SYNTHETIC_AUTH: "1", AUTH_PROJECT_SECRET: "synthetic-preview-only-secret", BUSINESS_JOURNEY_LAB: "true", HOMEPAGE_EDITOR_PREVIEW_EMAILS: "syn-1@synthetic.invalid,syn-2@synthetic.invalid,syn-3@synthetic.invalid,syn-4@synthetic.invalid,syn-5@synthetic.invalid,syn-6@synthetic.invalid,syn-7@synthetic.invalid,syn-8@synthetic.invalid,syn-9@synthetic.invalid,syn-10@synthetic.invalid", LLM_TEXT_PROVIDER: "anthropic", NODE_OPTIONS: "--import " + join(root, "scripts/synthetic-e2e/fake-anthropic.mjs"), PAYMENTS_ENABLED: "false", PROPOSAL_AI_ENABLED: "false", OPERATING_AI_ENABLED: "false", NEXT_PUBLIC_BUSINESS_INTAKE_V2: intake ? "1" : "0" },
});
child.unref(); await log.close();
const origin = `http://127.0.0.1:${port}`;
const entryPath = intake ? "/plan/chat?new=1" : "/dev/landing-editor";
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error("Preview process exited");
    try { ready = (await fetch(`${origin}${entryPath}`, { signal: AbortSignal.timeout(1500) })).status === 200; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Preview startup timed out");
  const manifest = { origin, editor: `${origin}${entryPath}`, pid: child.pid, directory, source: root, createdAt: new Date().toISOString(), synthetic: true, paidApisEnabled: false, fakeAnthropic: true, persistence: "demo-memory" };
  await writeFile(join(directory, "preview.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(manifest));
} catch (error) {
  if (child.pid) try { process.kill(-child.pid, "SIGTERM"); } catch {}
  throw error;
}
