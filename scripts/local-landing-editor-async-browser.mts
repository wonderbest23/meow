import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { cp, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtime = process.env.RUNTIME_NODE_MODULES;
assert(runtime, "RUNTIME_NODE_MODULES is required");
const { chromium } = createRequire(`${runtime}/package.json`)("playwright");
const temp = await mkdtemp("/private/tmp/oneul-landing-async-");
for (const entry of ["app", "components", "lib", "data", "public", "package.json", "tsconfig.json", "next-env.d.ts"]) {
  await cp(join(root, entry), join(temp, entry), { recursive: true, mode: constants.COPYFILE_FICLONE, filter: path => !/^\.env(?:\.|$)|^\.dev\.vars|^\.git$/.test(basename(path)) });
}
await cp(join(root, "scripts/prelaunch-next.config.ts"), join(temp, "next.config.ts"));
await symlink(join(root, "node_modules"), join(temp, "node_modules"), "dir");
const reserve = createServer();
await new Promise<void>(resolve => reserve.listen(0, "127.0.0.1", resolve));
const address = reserve.address(); assert(address && typeof address !== "string");
const port = address.port;
await new Promise<void>((resolve, reject) => reserve.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const output = join(root, `artifacts/landing-editor-async/${Date.now()}`);
await mkdir(output, { recursive: true, mode: 0o700 });
const server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: temp, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", PERSISTENCE_MODE: "demo-memory", PAYMENTS_ENABLED: "false", PROPOSAL_AI_ENABLED: "false", OPERATING_AI_ENABLED: "false" }, stdio: ["ignore", "pipe", "pipe"] });
let logs = "";
server.stdout.on("data", data => { logs += String(data); }); server.stderr.on("data", data => { logs += String(data); });
const exited = new Promise<void>(resolve => server.once("exit", () => resolve()));
const checks: string[] = [], errors: string[] = [], screenshots: string[] = [];
let browser: any, page: any;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error("Temporary server exited");
    try { ready = (await fetch(`${origin}/dev/landing-editor`, { signal: AbortSignal.timeout(1500) })).status === 200; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Temporary server not ready");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.route("**/*", async (route: any) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.endsWith("/ai-tokens")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ balance: { remaining: 100000, purchased: 100000, used: 0, packSize: 100000 }, planId: "qa-editor-only" }) });
    return route.continue();
  });
  page = await context.newPage();
  page.on("pageerror", (error: Error) => errors.push(error.message));
  await page.goto(`${origin}/dev/landing-editor`, { waitUntil: "networkidle" });
  const title = page.locator('[data-bw-text="0:414"]');
  await title.waitFor();
  const edit = async (id: string, value: string, finish = true) => {
    await page.locator(`[data-bw-text="${id}"]`).click();
    const panel = page.getByRole("dialog", { name: "텍스트 편집", exact: true });
    await panel.locator("textarea").fill(value);
    if (finish) await panel.getByRole("button", { name: "완료", exact: true }).click();
  };
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  let began = new Promise<void>(resolve => { started = resolve; });
  let response = { "0:414": "AI 제안 제목", "0:415": "AI 제안 설명" };
  await page.route("**/ai-edit", async (route: any) => {
    started?.();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ texts: response, changed: 2 }) }).catch(() => {});
  });
  await page.getByTitle("AI 로 고치기", { exact: true }).click();
  await page.getByPlaceholder(/말투|바꿔|고쳐/).fill("제목과 설명을 고쳐 주세요");
  await page.getByRole("button", { name: "AI 로 고치기", exact: true }).click();
  await began;
  await edit("0:414", "직접 고친 제목", false);
  release!();
  const conflicts = page.getByRole("region", { name: "변경 내용 비교" });
  await conflicts.waitFor();
  assert.match(await conflicts.textContent(), /직접 고친 제목/);
  await conflicts.getByRole("button", { name: "내 수정 유지" }).click();
  assert.equal(await title.innerText(), "직접 고친 제목");
  assert.equal(await page.locator('[data-bw-text="0:415"]').innerText(), "AI 제안 설명");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByText("저장 완료", { exact: true }).waitFor();
  const saved = JSON.parse(await page.getByTestId("saved-editor-data").textContent());
  assert.equal(saved.brainwave.texts["0:414"], "직접 고친 제목");
  assert.equal(saved.brainwave.texts["0:415"], "AI 제안 설명");
  checks.push("AI response during active text edit keeps manual title, applies untouched description, saves both");
  began = new Promise<void>(resolve => { started = resolve; });
  response = { "0:414": "되돌린 뒤 도착한 제목", "0:415": "되돌린 뒤 도착한 설명" };
  await page.getByPlaceholder(/말투|바꿔|고쳐/).fill("다시 수정해 주세요");
  await page.getByRole("button", { name: "AI 로 고치기", exact: true }).click();
  await began;
  await page.getByTitle("되돌리기").click();
  release!();
  await page.waitForTimeout(250);
  assert.notEqual(await title.innerText(), "되돌린 뒤 도착한 제목");
  checks.push("undo invalidates in-flight AI responses");
  let uploadStarted: (() => void) | undefined, finishUpload: (() => void) | undefined, discarded: (() => void) | undefined;
  let discardedCount = 0;
  let uploadCount = 0;
  let uploadBegan = new Promise<void>(resolve => { uploadStarted = resolve; });
  const discardedUpload = new Promise<void>(resolve => { discarded = resolve; });
  await page.route("**/api/uploads", async (route: any) => {
    if (route.request().method() === "DELETE") { discardedCount++; discarded?.(); return route.fulfill({ contentType: "application/json", body: JSON.stringify({ removed: true }) }); }
    uploadCount++;
    uploadStarted?.();
    await new Promise<void>(resolve => { finishUpload = resolve; });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ url: "/brainwave/0-2385/imgCard2.png", cleanupToken: "local-receipt-only" }) });
  });
  const pickPhoto = async (apply = true) => {
    const beforeUpload = uploadCount;
    const photo = page.locator("[data-bw-image]").last();
    const id = await photo.getAttribute("data-bw-image");
    await photo.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await photo.click({ button: "right" });
    await page.getByRole("menuitem", { name: "사진 바꾸기", exact: true }).waitFor({ timeout: 2000 });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: "사진 바꾸기", exact: true }).click()]);
    await chooser.setFiles({ name: "fixture.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64") });
    const crop = page.getByRole("dialog", { name: "사진 자르기", exact: true });
    await crop.waitFor();
    assert.equal(uploadCount, beforeUpload, "Image must stay local until crop approval");
    await crop.getByRole("button", { name: apply ? "적용" : "취소", exact: true }).click();
    return id;
  };
  await pickPhoto(false);
  assert.equal(uploadCount, 0);
  checks.push("crop preview and cancellation perform no upload");
  const photoId = await pickPhoto();
  await uploadBegan;
  await edit("0:415", "사진 업로드 중 수정한 설명", false);
  finishUpload!();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByText("저장 완료", { exact: true }).waitFor();
  const withPhoto = JSON.parse(await page.getByTestId("saved-editor-data").textContent());
  assert.equal(withPhoto.brainwave.texts["0:415"], "사진 업로드 중 수정한 설명");
  assert.equal(withPhoto.brainwave.images[photoId], "/brainwave/0-2385/imgCard2.png");
  checks.push("image upload completion preserves edits made while waiting");
  uploadBegan = new Promise<void>(resolve => { uploadStarted = resolve; });
  await pickPhoto(); await uploadBegan;
  page.once("dialog", (dialog: any) => dialog.accept());
  await page.locator(".bw-editor-right").getByTitle("닫기", { exact: true }).click();
  await page.getByRole("button", { name: "편집기 다시 열기", exact: true }).waitFor();
  finishUpload!(); await discardedUpload;
  checks.push("closing during upload discards the late image with its cleanup receipt");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${origin}/dev/landing-editor?fail=1`, { waitUntil: "networkidle" });
  await edit("0:414", "새로고침 후 복구할 제목");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "검증용 저장 실패" }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "수정 내용 복구", exact: true }).click();
  assert.equal(await title.innerText(), "새로고침 후 복구할 제목");
  checks.push("failed save preserves a tab-local draft and restores after reload");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.getByRole("button", { name: width <= 640 ? "모바일" : "PC", exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow at ${width}`);
    const tools = await page.locator(".bw-editor-bar button").evaluateAll((buttons: HTMLButtonElement[]) => buttons.filter(button => button.getClientRects().length).map(button => ({ title: button.title || button.textContent, left: button.getBoundingClientRect().left, right: button.getBoundingClientRect().right })));
    assert(tools.every((button: { left: number; right: number }) => button.left >= 0 && button.right <= width), `toolbar clipped at ${width}: ${JSON.stringify(tools)}`);
    const screenshot = join(output, `editor-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }); screenshots.push(screenshot);
  }
  checks.push("editor page fits 320/390/768/1440 viewports");
  await page.goto(`${origin}/dev/landing-editor?media=1`, { waitUntil: "networkidle" });
  const chooseFieldImage = async () => {
    uploadBegan = new Promise<void>(resolve => { uploadStarted = resolve; });
    await page.locator('input[type="file"]').setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64") });
    await page.getByRole("dialog", { name: "사진 자르기", exact: true }).getByRole("button", { name: "적용", exact: true }).click();
    await uploadBegan;
  };
  await chooseFieldImage();
  await page.getByLabel("사업 이름", { exact: true }).fill("업로드 중 변경한 이름");
  finishUpload!();
  await page.getByRole("button", { name: "이미지 선택", exact: true }).waitFor();
  assert.equal(JSON.parse(await page.getByTestId("media-field-data").textContent()).name, "업로드 중 변경한 이름");
  await chooseFieldImage();
  await page.getByRole("button", { name: "대표 이미지 삭제", exact: true }).click();
  finishUpload!();
  await page.getByRole("button", { name: "현재 사진 유지", exact: true }).click();
  assert.equal(JSON.parse(await page.getByTestId("media-field-data").textContent()).image, "");
  const beforeDiscard = discardedCount;
  await chooseFieldImage();
  await page.getByRole("button", { name: "템플릿 전환", exact: true }).click();
  finishUpload!();
  for (let attempt = 0; attempt < 40 && discardedCount === beforeDiscard; attempt++) await page.waitForTimeout(50);
  assert(discardedCount > beforeDiscard);
  assert.equal(JSON.parse(await page.getByTestId("media-field-data").textContent()).image, "");
  checks.push("legacy image fields preserve unrelated edits, confirm same-field conflicts and discard old-template uploads");
} catch (error) {
  errors.push(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1;
  if (page) { const shot = join(output, "failure.png"); await page.screenshot({ path: shot, fullPage: true }).catch(() => {}); screenshots.push(shot); }
}
finally {
  await browser?.close(); server.kill("SIGTERM");
  const timer = setTimeout(() => server.kill("SIGKILL"), 5000); await exited; clearTimeout(timer);
  await writeFile(join(output, "server.log"), logs, { mode: 0o600 });
  const report = { passed: !errors.length, checks, errors, screenshots, isolatedRoot: temp, environmentFilesLoaded: false, mockedAi: true, paidAiCalls: 0, paymentCalls: 0, serverStopped: true };
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ...report, reportPath: join(output, "report.json") }, null, 2));
}
