import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { cp, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUSINESS_TEMPLATE_IDS } from "../lib/landing/brainwave/business-content";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtime = process.env.RUNTIME_NODE_MODULES;
assert(runtime, "RUNTIME_NODE_MODULES is required");
const { chromium } = createRequire(`${runtime}/package.json`)("playwright");
const temp = await mkdtemp("/private/tmp/oneul-homepage-source-");
for (const entry of ["app", "components", "lib", "data", "public", "package.json", "tsconfig.json", "next-env.d.ts"]) {
  await cp(join(root, entry), join(temp, entry), { recursive: true, mode: constants.COPYFILE_FICLONE, filter: path => !/^\.env(?:\.|$)|^\.dev\.vars|^\.git$/.test(basename(path)) });
}
await cp(join(root, "scripts/prelaunch-next.config.ts"), join(temp, "next.config.ts"));
await symlink(join(root, "node_modules"), join(temp, "node_modules"), "dir");
const reserve = createServer(); await new Promise<void>(resolve => reserve.listen(0, "127.0.0.1", resolve));
const address = reserve.address(); assert(address && typeof address !== "string"); const port = address.port;
await new Promise<void>((resolve, reject) => reserve.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const output = join(root, `artifacts/homepage-source/${Date.now()}`); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: temp, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", PERSISTENCE_MODE: "demo-memory", PAYMENTS_ENABLED: "false", PROPOSAL_AI_ENABLED: "false", OPERATING_AI_ENABLED: "false" }, stdio: ["ignore", "pipe", "pipe"] });
let logs = ""; server.stdout.on("data", data => { logs += data; }); server.stderr.on("data", data => { logs += data; });
const exited = new Promise<void>(resolve => server.once("exit", () => resolve()));
let browser: any; let page: any; const checks: string[] = []; const errors: string[] = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error("Temporary server exited");
    try { ready = (await fetch(`${origin}/dev/landing-source`, { signal: AbortSignal.timeout(1500) })).status === 200; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Temporary server not ready");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.route("**/*", (route: any) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  page = await context.newPage(); page.on("pageerror", (error: Error) => errors.push(error.message));
  await page.goto(`${origin}/dev/landing-source`, { waitUntil: "networkidle" });
  const preview = JSON.parse(await page.getByTestId("fixture-preview").textContent());
  const site = JSON.parse(await page.getByTestId("fixture-site").textContent());
  await page.route("**/api/plan/landing/source?*", (route: any) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ preview }) }));
  const requests: any[] = [];
  await page.route("**/api/plan/artifact-updates", (route: any) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) return route.abort();
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ site: { ...site, draft: preview.homepage.after, updatedAt: "2026-09-15T00:00:01Z" } }) });
  });
  await page.getByRole("button", { name: "최신 사업정보", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "최신 사업정보 비교" }); await dialog.waitFor();
  assert(await dialog.getByRole("button", { name: "비교 닫기" }).locator("svg").isVisible(), "Close control must retain its icon despite legacy global button styles");
  const manual = dialog.locator("label").filter({ hasText: "직접 작성한 제목" });
  assert.equal(await manual.locator("input").isChecked(), false);
  await manual.locator("input").check(); await manual.locator("input").uncheck();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await dialog.evaluate((el: HTMLElement) => el.scrollWidth <= el.clientWidth), `dialog overflow at ${width}`);
    await page.screenshot({ path: join(output, `compare-${width}.png`) });
  }
  await dialog.getByRole("button", { name: /개 초안에 반영/ }).click();
  await dialog.getByRole("button", { name: "같은 요청 다시 확인" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]);
  const conflict = preview.homepage.sourcePreview.changes.find((change: any) => change.before === "직접 작성한 제목");
  assert.equal(requests[0].command.choices[conflict.id], "keep");
  const saved = JSON.parse(await page.getByTestId("fixture-site").textContent());
  assert.equal(saved.draft.priceLabel, "180만원"); assert.equal(saved.publishedVersion, 1);
  await page.getByRole("button", { name: "로컬 미저장 수정" }).click();
  assert(await page.getByRole("button", { name: "최신 사업정보", exact: true }).isDisabled());
  checks.push("owner compare UI: manual conflict defaults keep, four widths, uncertain-response UUID replay, draft-only update, unsaved-edit guard (mock API)");

  await page.goto(`${origin}/dev/landing-source`, { waitUntil: "networkidle" });
  await page.unroute("**/api/plan/artifact-updates");
  for (const status of [403, 409]) {
    const message = status === 403 ? "이 사업정보를 수정할 권한이 없습니다" : "사업정보 버전이 바뀌었습니다 다시 비교해주세요";
    await page.route("**/api/plan/artifact-updates", (route: any) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code: `QA_${status}`, message }) }));
    await page.getByRole("button", { name: "최신 사업정보", exact: true }).click();
    await dialog.getByRole("button", { name: /개 초안에 반영/ }).click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(await dialog.getByRole("alert").textContent(), message);
    await dialog.getByRole("button", { name: "비교 닫기" }).click();
    await page.unroute("**/api/plan/artifact-updates");
  }
  // Ignore transport cancellation deliberately, so stale success/error completions reach the component.
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (input, init) => original(input, /\/api\/plan\/(landing\/source|artifact-updates)/.test(String(input)) ? { ...init, signal: undefined } : init);
  });
  const heldPreviews: { route: any; done: () => void }[] = [];
  const heldApplies: { route: any; done: () => void }[] = [];
  await page.unroute("**/api/plan/landing/source?*");
  await page.route("**/api/plan/landing/source?*", (route: any) => new Promise<void>(done => heldPreviews.push({ route, done })));
  await page.route("**/api/plan/artifact-updates", (route: any) => new Promise<void>(done => heldApplies.push({ route, done })));
  const waitForCount = async (items: unknown[], count: number) => {
    for (let attempt = 0; items.length < count && attempt < 200; attempt++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(items.length, count, "Expected held API request");
  };
  const switchProject = async () => {
    // Simulate a parent prop change while the modal makes the underlying UI inert.
    await page.getByTestId("switch-project").evaluate((button: HTMLButtonElement) => button.click());
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("button", { name: "최신 사업정보", exact: true }).isDisabled(), false);
  };
  await page.getByRole("button", { name: "최신 사업정보", exact: true }).click();
  await waitForCount(heldPreviews, 1);
  await switchProject(); await switchProject();
  await page.getByRole("button", { name: "최신 사업정보", exact: true }).click();
  await waitForCount(heldPreviews, 2);
  await heldPreviews[0].route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "이전 프로젝트의 지연 오류" }) }); heldPreviews[0].done();
  await page.waitForTimeout(50);
  assert(await dialog.getByRole("status").isVisible(), "Old completion cannot clear the new request's busy state");
  assert.equal(await dialog.getByRole("alert").count(), 0);
  assert.equal(await dialog.locator('input[type="checkbox"]').count(), 0, "Old preview and choices must be cleared");
  await heldPreviews[1].route.fulfill({ contentType: "application/json", body: JSON.stringify({ preview }) }); heldPreviews[1].done();
  await dialog.locator('input[type="checkbox"]').first().waitFor();
  await dialog.getByRole("button", { name: /개 초안에 반영/ }).click();
  await waitForCount(heldApplies, 1);
  await switchProject();
  await page.getByRole("button", { name: "최신 사업정보", exact: true }).click();
  await waitForCount(heldPreviews, 3);
  const otherPreview = structuredClone(preview); otherPreview.planId = "qa-plan-other"; otherPreview.homepage.sourcePreview.projectId = "qa-project-other";
  await heldPreviews[2].route.fulfill({ contentType: "application/json", body: JSON.stringify({ preview: otherPreview }) }); heldPreviews[2].done();
  await dialog.locator('input[type="checkbox"]').first().waitFor();
  assert.equal(await dialog.getByRole("button", { name: "같은 요청 다시 확인" }).count(), 0, "Old receipt must not leak into a different project");
  assert.equal(await dialog.getByRole("alert").count(), 0);
  await heldApplies[0].route.fulfill({ contentType: "application/json", body: JSON.stringify({ site: { ...site, draft: preview.homepage.after } }) }); heldApplies[0].done();
  await page.waitForTimeout(50);
  assert.equal(JSON.parse(await page.getByTestId("fixture-site").textContent()).projectId, "qa-project-other", "Late apply cannot replace the current project");
  assert(await dialog.isVisible());
  assert.equal(await dialog.getByRole("button", { name: /개 초안에 반영/ }).isDisabled(), false);
  await dialog.getByRole("button", { name: "비교 닫기" }).click();
  checks.push("source lifecycle: top-level 403/409 messages, project switch during preview and apply, full dialog/state reset, ignored-abort stale responses, same-project return request isolation (mock API)");

  if (!process.argv.includes("--source-only")) {
  const pixels = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 600; const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 900, 600); const light = canvas.toDataURL(); ctx.fillStyle = "#101418"; ctx.fillRect(0, 0, 900, 600); return { light, dark: canvas.toDataURL() }; });
  await page.route("**/qa-*-photo.png", (route: any) => route.fulfill({ contentType: "image/png", body: Buffer.from(pixels[route.request().url().includes("dark") ? "dark" : "light"].split(",")[1], "base64") }));
  for (const template of BUSINESS_TEMPLATE_IDS) for (const image of ["light", "dark"]) {
    await page.goto(`${origin}/dev/landing-source?view=contrast&template=${template}&image=${image}`, { waitUntil: "networkidle" });
    await page.locator(".bwmob h1").waitFor();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(60);
      const result = await page.evaluate(() => {
        const title = document.querySelector<HTMLElement>(".bwmob h1")!;
        const photo = document.querySelector<HTMLImageElement>(".bwmob img")!;
        const a = title.getBoundingClientRect(), b = photo.getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth, color: getComputedStyle(title).color, background: getComputedStyle(title.closest(".bwmob")!).backgroundColor, overlap: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, imageLoaded: photo.complete && photo.naturalWidth > 0, imageRatio: Math.abs(photo.clientWidth / photo.clientHeight - photo.naturalWidth / photo.naturalHeight), titleFits: title.scrollWidth <= title.clientWidth };
      });
      assert.equal(result.overflow, false, `${template}/${image}/${width}: page overflow`);
      assert.equal(result.overlap, false, `${template}/${image}/${width}: title overlays media`);
      assert.equal(result.color, "rgb(25, 33, 43)"); assert.equal(result.background, "rgb(255, 255, 255)");
      assert.ok(result.imageLoaded); assert.ok(result.imageRatio < .02); assert.ok(result.titleFits);
      if (width === 390 || width === 1440) await page.screenshot({ path: join(output, `${template}-${image}-${width}.png`) });
    }
  }
  checks.push("10 templates x 2 light/dark synthetic images x 4 widths: legible long title, uncropped photo, no overlap/viewport overflow");
  }
  assert.deepEqual(errors, []);
  await writeFile(join(output, "report.json"), JSON.stringify({ ok: true, checks, externalApiCalls: 0, emailSent: false, output }, null, 2));
  console.log(JSON.stringify({ ok: true, checks, output }));
} catch (error) {
  await page?.screenshot({ path: join(output, "failure.png") }).catch(() => {});
  await writeFile(join(output, "report.json"), JSON.stringify({ ok: false, checks, error: error instanceof Error ? error.message : "failed" }, null, 2));
  throw error;
} finally {
  await browser?.close(); server.kill("SIGTERM");
  const kill = setTimeout(() => server.kill("SIGKILL"), 8000); await exited; clearTimeout(kill);
  await writeFile(join(output, "server.log"), logs);
}
