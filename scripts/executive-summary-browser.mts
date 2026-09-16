import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";
import { executiveFixture } from "./executive-summary-fixture";
import { chaptersForType } from "../lib/plan-builder/blueprint";
import { buildExecutiveSummary } from "../lib/plan-builder/executive-summary";
import { renderPdf, renderDocx } from "../lib/delivery/document-renderer";

const root = resolve(new URL("..", import.meta.url).pathname);
const modules = process.env.RUNTIME_NODE_MODULES; assert(modules, "Set bundled RUNTIME_NODE_MODULES");
const { chromium } = createRequire(`${modules}/package.json`)("playwright");
const temp = await mkdtemp("/private/tmp/oneul-summary-browser-");
for (const entry of ["app", "components", "lib", "data", "middleware.ts", "tsconfig.json", "package.json", "cloudflare-env.d.ts", "cloudflare-runtime-shim.d.ts"]) {
  await cp(join(root, entry), join(temp, entry), { recursive: true, filter: path => !/^\.env(?:\.|$)|^\.dev\.vars|^\.git$/.test(basename(path)) });
}
await cp(join(root, "scripts/prelaunch-next.config.ts"), join(temp, "next.config.ts"));
await symlink(join(root, "node_modules"), join(temp, "node_modules"));
await symlink(join(root, "public"), join(temp, "public"));
const port = await new Promise<number>((accept, reject) => {
  const server = createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const address = server.address(); assert(address && typeof address !== "string"); server.close(() => accept(address.port)); });
});
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: temp, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "development", PERSISTENCE_MODE: "memory", APP_ENV: "local", PAYMENTS_ENABLED: "false", NEXT_PUBLIC_PPT_GENERATION_VERIFIED: "false", PROPOSAL_AI_ENABLED: "false", OPERATING_AI_ENABLED: "false" }, stdio: ["ignore", "pipe", "pipe"],
});
const exit = new Promise<void>(accept => app.once("exit", () => accept()));
let logs = ""; app.stdout.on("data", data => { logs = (logs + data).slice(-15000); }); app.stderr.on("data", data => { logs = (logs + data).slice(-15000); });
const output = join(root, "artifacts/executive-summary/browser"); await mkdir(output, { recursive: true });
let browser: any;
try {
  for (let i = 0; i < 90; i++) {
    assert.equal(app.exitCode, null, logs);
    try { if ((await fetch(`${origin}/api/auth/session`, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
    await new Promise(accept => setTimeout(accept, 500));
  }
  const font = await readFile(join(root, "public/fonts/NanumGothic-Regular.ttf"));
  const plan = executiveFixture("operating");
  for (const chapter of chaptersForType(plan.planType)) for (const section of chapter.sections) plan.sections[`${chapter.id}/${section.id}`] = { markdown: "## 현재 제공안\n\n지역 제조사에 제품 소개 자료와 납품용 원본을 제공합니다. 고객이 입력한 수정 조건을 확인하고 다음 제작 범위를 결정합니다.", html: "<h2>현재 제공안</h2><p>지역 제조사에 제품 소개 자료와 납품용 원본을 제공합니다. 고객이 입력한 수정 조건을 확인하고 다음 제작 범위를 결정합니다.</p>", generatedAt: plan.updatedAt, coachRevision: 2 };
  const summary = buildExecutiveSummary(plan);
  const project = { title: plan.title, sector: "기업 서비스", model: plan.planType, customer: "지역 제조사", generatedAt: plan.updatedAt, sample: true };
  const file = { id: "summary", title: plan.title, type: plan.planType, versionLabel: "요약", markdown: "", executiveSummary: summary };
  const pdf = await renderPdf([file], project, font), docx = await renderDocx([file], project, font);
  browser = await chromium.launch({ headless: true });
  const checks: string[] = [];
  for (const width of [320, 390, 768, 1440]) {
    let emptySections = false;
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", serviceWorkers: "block", acceptDownloads: true });
    const exports: any[] = []; const errors: string[] = [];
    await context.route("**/*", async (route: any) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/api/plan/state") return route.fulfill({ json: { authenticated: false, business: { name: "", description: "", role: "", industry: "", region: "", stage: "" }, activePlanId: plan.id, plans: [{ ...plan, ...(emptySections ? { sections: {} } : {}) }] } });
      if (url.pathname === "/api/plan/access") return route.fulfill({ json: { paid: true, price: 149000 } });
      if (url.pathname === "/api/plan/deck") return route.fulfill({ json: { status: "idle" } });
      if (url.pathname === "/api/plan/document") {
        const request = route.request().postDataJSON(); exports.push(request);
        if (request.view === "summary") {
          assert.equal(request.sourceVersion, summary.sourceVersion);
          return route.fulfill({ contentType: request.format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf", body: request.format === "docx" ? docx : pdf });
        }
        return route.fulfill({ contentType: "application/pdf", body: pdf });
      }
      return route.continue();
    });
    const page = await context.newPage(); page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.goto(`${origin}/plan/document?planId=${plan.id}`, { waitUntil: "networkidle", timeout: 120000 });
    await page.getByRole("group", { name: "문서 보기 방식" }).getByRole("button", { name: "한 장 요약", exact: true }).click();
    await page.getByLabel("한 장 사업 요약", { exact: true }).waitFor();
    assert(await page.getByLabel("한 장 사업 요약", { exact: true }).innerText().then((value: string) => value.includes("5,400,000원") && value.includes("지출 미입력")));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(output, `summary-${width}.png`) });
    await page.getByRole("button", { name: "내려받기", exact: true }).click();
    const dialog = page.getByRole("dialog");
    assert(await dialog.getByRole("button", { name: "한 장 요약", exact: true }).getAttribute("aria-pressed") === "true");
    for (const format of ["PDF", "Word"]) {
      const pending = page.waitForEvent("download");
      await dialog.getByRole("button", { name: new RegExp(`한 장 요약 ${format}`) }).click();
      const download = await pending; await download.saveAs(join(output, `${width}.${format === "PDF" ? "pdf" : "docx"}`));
      assert(download.suggestedFilename().includes("한 장 요약"));
    }
    assert.equal(exports.length, 2); assert(exports.every(item => item.view === "summary"));
    await dialog.getByRole("button", { name: "상세 계획서", exact: true }).click();
    await dialog.getByRole("button", { name: "PDF 인쇄하거나 공유할 때", exact: true }).click();
    await page.waitForTimeout(200);
    assert.equal(exports.at(-1).view, "detailed");
    assert.equal(exports.at(-1).sections.length, Object.keys(plan.sections).length);
    await page.keyboard.press("Escape"); await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("group", { name: "문서 보기 방식" }).getByRole("button", { name: "한 장 요약", exact: true }).click();
    assert(await page.getByLabel("한 장 사업 요약", { exact: true }).innerText().then((value: string) => value.includes("5,400,000원")));
    emptySections = true;
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByLabel("한 장 사업 요약", { exact: true }).waitFor();
    await page.getByRole("button", { name: "내려받기", exact: true }).click();
    assert(await page.getByRole("dialog").getByRole("button", { name: /한 장 요약 PDF/ }).isEnabled(), "saved business facts can be summarized before detailed sections exist");
    assert.deepEqual(errors, []);
    checks.push(`${width}px: summary selection, PDF/Word downloads with actual rendered bytes, detailed request, reload, summary before detailed generation, no overflow/errors`);
    await context.close();
  }
  await writeFile(join(output, "report.json"), JSON.stringify({ checks, mode: "isolated Next app; mocked business state/access/export transport; real summary renderer; no paid calls" }, null, 2));
  console.log(checks.join("\n"));
} catch (error) { console.error(logs); throw error; }
finally { await browser?.close(); app.kill("SIGTERM"); await exit; }
