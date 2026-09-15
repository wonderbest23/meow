import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtime = process.env.RUNTIME_NODE_MODULES;
assert(runtime, "RUNTIME_NODE_MODULES is required");
const { chromium } = createRequire(`${runtime}/package.json`)("playwright");
const temp = await mkdtemp("/private/tmp/oneul-deck-status-");
const safeFile = (path: string) => !/^\.env(?:\.|$)|^\.dev\.vars|^\.git$/.test(basename(path));
for (const entry of ["app", "components", "lib", "data", "public", "package.json", "tsconfig.json", "next-env.d.ts"]) {
  await cp(join(root, entry), join(temp, entry), { recursive: true, mode: constants.COPYFILE_FICLONE, filter: safeFile });
}
await cp(join(root, "scripts/prelaunch-next.config.ts"), join(temp, "next.config.ts"));
await symlink(join(root, "node_modules"), join(temp, "node_modules"), "dir");
const reserve = createServer();
await new Promise<void>(resolve => reserve.listen(0, "127.0.0.1", resolve));
const address = reserve.address();
assert(address && typeof address !== "string");
const port = address.port;
await new Promise<void>((resolve, reject) => reserve.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const output = join(root, `artifacts/local-deck-status/${Date.now()}`);
await mkdir(output, { recursive: true, mode: 0o700 });
const app = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: temp,
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", APP_ENV: "staging", PERSISTENCE_MODE: "demo-memory", PAYMENTS_ENABLED: "false", OPERATING_AI_ENABLED: "false", PROPOSAL_AI_ENABLED: "false", NEXT_PUBLIC_PPT_GENERATION_VERIFIED: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
app.stdout.on("data", data => { logs += String(data); });
app.stderr.on("data", data => { logs += String(data); });
const exited = new Promise<void>(resolve => app.once("exit", () => resolve()));
const checks: string[] = [], errors: string[] = [], screenshots: string[] = [];
const blockedOrigins = new Set<string>();
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (app.exitCode !== null) throw new Error(`Temporary app exited: ${app.exitCode}`);
    try { ready = (await fetch(`${origin}/dev/deck-export`, { signal: AbortSignal.timeout(1000) })).status === 200; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Temporary app did not become ready");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, reducedMotion: "reduce" });
  await context.route("**/*", (route: any) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    blockedOrigins.add(url.origin); return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error: Error) => errors.push(error.message));
  await page.goto(`${origin}/dev/deck-export`, { waitUntil: "networkidle" });
  const counts = async () => (await page.getByTestId("request-counts").textContent()).match(/\d+/g).map(Number);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "중단된 초안과 제공 준비 중", exact: true }).click();
    const button = page.getByRole("button", { name: "PPT 제공 상태 확인", exact: true });
    await button.waitFor();
    assert(await button.isEnabled());
    assert.match(await page.getByRole("status").textContent(), /초안과 작업 기록.*보관/);
    assert.doesNotMatch(await page.getByRole("status").textContent(), /다시 시도하면|검토부터 이어갑니다/);
    const before = await counts();
    await button.click();
    await page.waitForFunction((reads: number) => Number(document.querySelector('[data-testid="request-counts"]')!.textContent!.match(/\d+/)![0]) > reads, before[0]);
    assert.equal((await counts())[1], 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const box = await button.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= width);
    const screenshot = join(output, `closed-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }); screenshots.push(screenshot);
  }
  checks.push("mobile and desktop closed-generation screens allow GET-only refresh without impossible retry copy");
  await page.getByRole("button", { name: "서버 제공 재개", exact: true }).click();
  await page.getByRole("button", { name: "PPT 제공 상태 확인", exact: true }).click();
  await page.getByRole("button", { name: "발표자료 다시 시도", exact: true }).waitFor();
  assert.equal((await counts())[1], 0);
  checks.push("server capability changes are refreshed without implicitly starting generation");
  await page.getByRole("button", { name: "중복 클릭 검증", exact: true }).click();
  await page.getByRole("button", { name: "발표자료 제작 중", exact: true }).waitFor();
  assert.equal((await counts())[1], 1);
  await page.getByRole("button", { name: "문서 다시 열기", exact: true }).click();
  await page.getByRole("button", { name: "발표자료 제작 중", exact: true }).waitFor();
  assert.equal((await counts())[1], 1);
  checks.push("duplicate clicks and document remount reuse one mocked running job");
  await page.getByRole("button", { name: "중단된 초안과 제공 준비 중", exact: true }).click();
  await page.getByRole("button", { name: "PPT 제공 상태 확인", exact: true }).waitFor();
  await page.getByRole("button", { name: "서버 완료", exact: true }).click();
  const files: Buffer[] = [];
  for (let index = 0; index < 2; index++) {
    const button = page.getByRole("button", { name: "완성된 PPT 내려받기", exact: true });
    await button.waitFor();
    const event = page.waitForEvent("download");
    await button.click();
    const download = await event;
    const path = join(output, `sample-${index + 1}.pptx`);
    await download.saveAs(path);
    files.push(await readFile(path));
    const zip = await JSZip.loadAsync(files[index], { checkCRC32: true });
    assert.equal(Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length, 10);
    assert.equal((await counts())[1], 0);
    await page.getByRole("button", { name: "문서 다시 열기", exact: true }).click();
  }
  assert(files[0].equals(files[1]));
  checks.push("completed public sample downloads identically after reopening with generation disabled (10-slide valid PPTX)");
  assert.deepEqual(errors, []);
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await browser?.close();
  app.kill("SIGTERM");
  const timer = setTimeout(() => app.kill("SIGKILL"), 5000);
  await exited; clearTimeout(timer);
  await writeFile(join(output, "server.log"), logs, { mode: 0o600 });
  const report = { passed: errors.length === 0, checks, errors, screenshots, blockedOrigins: [...blockedOrigins], isolatedRoot: temp, environmentFilesLoaded: false, localOnly: true, apiResponsesMocked: true, publicSampleDownloads: true, paidAiCalls: 0, paymentCalls: 0, serverStopped: true };
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ output, ...report }, null, 2));
}
