import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtime = process.env.RUNTIME_NODE_MODULES; assert(runtime, "RUNTIME_NODE_MODULES is required");
const { chromium } = createRequire(`${runtime}/package.json`)("playwright");
const temp = await mkdtemp("/private/tmp/oneul-image-crop-");
for (const entry of ["app", "components", "lib", "data", "package.json", "tsconfig.json", "next-env.d.ts"]) await cp(join(root, entry), join(temp, entry), { recursive: true, filter: path => !/^\.env(?:\.|$)|^\.dev\.vars|^\.git$/.test(basename(path)) });
await cp(join(root, "scripts/prelaunch-next.config.ts"), join(temp, "next.config.ts"));
await mkdir(join(temp, "app/dev/landing-image-crop"), { recursive: true });
await cp(join(root, "scripts/fixtures/landing-image-crop/page.tsx"), join(temp, "app/dev/landing-image-crop/page.tsx"));
await cp(join(root, "scripts/fixtures/landing-image-crop/layout.tsx"), join(temp, "app/layout.tsx"));
await symlink(join(root, "node_modules"), join(temp, "node_modules")); await symlink(join(root, "public"), join(temp, "public"));
const reserve = createServer(); await new Promise<void>(resolve => reserve.listen(0, "127.0.0.1", resolve));
const address = reserve.address(); assert(address && typeof address !== "string"); const port = address.port;
await new Promise<void>(resolve => reserve.close(() => resolve()));
const origin = `http://127.0.0.1:${port}`, output = join(root, "artifacts/landing-image-crop"); await mkdir(output, { recursive: true });
const server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: temp, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "development", PERSISTENCE_MODE: "memory", PAYMENTS_ENABLED: "false", PROPOSAL_AI_ENABLED: "false", OPERATING_AI_ENABLED: "false" }, stdio: ["ignore", "pipe", "pipe"] });
const exited = new Promise<void>(resolve => server.once("exit", () => resolve())); let logs = "", browser: any;
server.stdout.on("data", value => { logs = (logs + value).slice(-12000); }); server.stderr.on("data", value => { logs = (logs + value).slice(-12000); });
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    assert.equal(server.exitCode, null, logs);
    try { ready = (await fetch(`${origin}/dev/landing-image-crop`, { signal: AbortSignal.timeout(1500) })).ok; } catch {}
    if (ready) break; await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, logs); browser = await chromium.launch({ headless: true });
  const checks: string[] = [];
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 692 }, reducedMotion: "reduce", serviceWorkers: "block" });
    const uploads: string[] = [], errors: string[] = [];
    await context.route("**/*", (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/uploads") uploads.push(route.request().method());
      if (url.origin !== origin || url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, json: {} });
      return route.continue();
    });
    await context.addInitScript(() => {
      const native = HTMLCanvasElement.prototype.toBlob;
      const fixture = { hold: false, pending: [] as Array<() => void>, release() { this.hold = false; for (const run of this.pending.splice(0)) run(); }, urls: new Set<string>() };
      (window as any).cropEncoding = fixture;
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) { native.call(this, value => { if (fixture.hold) fixture.pending.push(() => callback(value)); else callback(value); }, type, quality); };
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = value => { const url = create(value); fixture.urls.add(url); return url; };
      URL.revokeObjectURL = url => { fixture.urls.delete(url); revoke(url); };
    });
    const page = await context.newPage(); page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.goto(`${origin}/dev/landing-image-crop`, { waitUntil: "networkidle" });
    const fixtureData = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 200;
      const ctx = canvas.getContext("2d")!;
      for (const [color, x, y] of [["#ff0000", 0, 0], ["#00ff00", 200, 0], ["#0000ff", 0, 100], ["#ffff00", 200, 100]] as const) { ctx.fillStyle = color; ctx.fillRect(x, y, 200, 100); }
      ctx.clearRect(0, 0, 20, 20);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    const bytes = Buffer.from(fixtureData, "base64");
    const pick = async (buffer = bytes, name = "fixture.png", mimeType = "image/png") => { await page.getByLabel("테스트 이미지").setInputFiles({ name, mimeType, buffer }); };
    const dialog = page.getByRole("dialog", { name: "사진 자르기" });
    await pick(); await dialog.getByRole("button", { name: "적용", exact: true }).waitFor();
    await page.waitForFunction(() => !!document.querySelector("canvas")?.width);
    assert.equal(await page.getByTestId("applied").textContent(), "0");
    assert.equal(await page.getByLabel("자르기 출력 크기").textContent(), "400 × 200px");
    assert.equal(await page.getByLabel("가로 위치", { exact: true }).isDisabled(), true);
    await page.getByLabel("비율", { exact: true }).selectOption("square");
    const squareSize = await page.getByRole("img", { name: "자른 이미지 미리보기" }).boundingBox();
    const zoom = page.getByRole("slider", { name: "확대", exact: true });
    await zoom.focus(); await zoom.press("Home"); await zoom.press("ArrowRight"); assert.equal(await zoom.inputValue(), "101");
    await zoom.fill("200");
    await page.getByRole("slider", { name: "가로 위치", exact: true }).fill("100");
    await page.getByRole("slider", { name: "세로 위치", exact: true }).fill("0");
    const preview = page.getByRole("img", { name: "자른 이미지 미리보기" });
    assert.deepEqual(await preview.evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext("2d")!.getImageData(50, 50, 1, 1).data)), [0, 255, 0, 255]);
    const previewBox = await preview.boundingBox(); assert(previewBox);
    assert(squareSize && Math.abs(previewBox.width - squareSize.width) < 1 && Math.abs(previewBox.height - squareSize.height) < 1, "zoom must not resize the preview frame");
    await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2); await page.mouse.down(); await page.mouse.move(previewBox.x + previewBox.width * 4, previewBox.y + previewBox.height / 2); await page.mouse.up();
    assert.equal(await page.getByRole("slider", { name: "가로 위치", exact: true }).inputValue(), "0");
    assert.equal(await preview.evaluate((canvas: HTMLCanvasElement) => canvas.getContext("2d")!.getImageData(10, 10, 1, 1).data[3]), 0, "PNG transparency preserved in preview");
    await page.getByRole("slider", { name: "가로 위치", exact: true }).fill("100");
    assert.equal(await page.getByLabel("자르기 출력 크기").textContent(), "100 × 100px");
    const box = await dialog.boundingBox(); assert(box && box.x >= 0 && box.x + box.width <= width + .1 && box.height <= 692);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await dialog.evaluate((node: HTMLElement) => getComputedStyle(node).animationName), "none");
    for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); assert(await dialog.evaluate((node: HTMLElement) => node.contains(document.activeElement))); }
    await page.screenshot({ path: join(output, `crop-${width}.png`) });
    await page.evaluate(() => { (window as any).cropEncoding.hold = true; });
    await dialog.getByRole("button", { name: "적용", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await page.waitForFunction(() => (window as any).cropEncoding.pending.length > 0);
    assert.equal(await page.evaluate(() => (window as any).cropEncoding.pending.length), 1, "duplicate apply clicks encode once");
    await page.keyboard.press("Escape"); await page.evaluate(() => (window as any).cropEncoding.release());
    assert.equal(await page.getByTestId("cancelled").textContent(), "1"); assert.equal(await page.getByTestId("applied").textContent(), "0");
    await page.getByRole("button", { name: "다시 열기" }).click();
    await page.getByLabel("비율", { exact: true }).selectOption("square"); await zoom.fill("200");
    await page.getByRole("slider", { name: "가로 위치", exact: true }).fill("100"); await page.getByRole("slider", { name: "세로 위치", exact: true }).fill("0");
    await dialog.getByRole("button", { name: "적용", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="result"]')?.textContent?.includes("cropped"));
    const result = JSON.parse(await page.getByTestId("result").textContent());
    assert.equal(result.name, "fixture-cropped.png"); assert.equal(result.type, "image/png");
    assert.equal(await page.getByTestId("applied").textContent(), "1"); assert.equal(await page.getByTestId("original").textContent(), String(bytes.length));
    const actual = await page.evaluate(async (url: string) => { const image = new Image(); image.src = url; await image.decode(); const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0); return { width: image.width, height: image.height, center: Array.from(ctx.getImageData(50, 50, 1, 1).data) }; }, result.url);
    assert.deepEqual(actual, { width: 100, height: 100, center: [0, 255, 0, 255] });
    await writeFile(join(output, `${width}.png`), Buffer.from(result.url.split(",")[1], "base64"));
    await pick(); await page.getByLabel("비율", { exact: true }).selectOption("wide"); await zoom.fill("200");
    await dialog.getByRole("button", { name: "원본으로 재설정", exact: true }).click();
    assert.equal(await zoom.inputValue(), "100"); assert.equal(await page.getByLabel("비율", { exact: true }).inputValue(), "original");
    assert.equal(await page.getByLabel("자르기 출력 크기").textContent(), "400 × 200px");
    await dialog.getByRole("button", { name: "원본 사용", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="result"]')?.textContent?.includes('"fixture.png"'));
    assert.equal(JSON.parse(await page.getByTestId("result").textContent()).url.split(",")[1], fixtureData, "original choice returns identical bytes");
    assert.equal(await page.getByTestId("applied").textContent(), "2");
    await pick();
    await page.evaluate(() => { (window as any).cropEncoding.hold = true; });
    await dialog.getByRole("button", { name: "적용", exact: true }).click(); await page.waitForFunction(() => (window as any).cropEncoding.pending.length > 0);
    await page.evaluate(() => window.cropFixture!.replace());
    await page.getByText("replacement.png", { exact: true }).waitFor();
    await page.evaluate(() => (window as any).cropEncoding.release()); assert.equal(await page.getByTestId("applied").textContent(), "2");
    await page.evaluate(() => { (window as any).cropEncoding.hold = true; });
    await dialog.getByRole("button", { name: "적용", exact: true }).click(); await page.waitForFunction(() => (window as any).cropEncoding.pending.length > 0);
    await page.evaluate(() => window.cropFixture!.unmount()); await dialog.waitFor({ state: "detached" }); await page.evaluate(() => (window as any).cropEncoding.release());
    assert.equal(await page.getByTestId("applied").textContent(), "2");
    await pick(Buffer.from("not-an-image")); await dialog.getByRole("alert").waitFor(); assert.equal(await dialog.getByRole("button", { name: "적용", exact: true }).isDisabled(), true);
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).cropEncoding.urls.size), 0, "all local object URLs released");
    assert.deepEqual(uploads, []); assert.deepEqual(errors, []);
    checks.push(`${width}px: keyboard/focus/drag, ratio/position/zoom, preview and encoded pixels/transparency, unchanged original choice, cancel/file replacement/unmount during encode, invalid file, reduced motion, no upload or URL leaks`);
    await context.close();
  }
  await writeFile(join(output, "report.json"), JSON.stringify({ checks, mode: "isolated local Next/Canvas; synthetic pixel fixture; no upload/network services" }, null, 2)); console.log(checks.join("\n"));
} catch (error) { console.error(logs); throw error; }
finally { await browser?.close(); server.kill("SIGTERM"); await exited; }
