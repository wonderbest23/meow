import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const base = process.env.TEST_URL || "http://localhost:8083";

async function main() {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  await mkdir("artifacts/home-result-graphics", { recursive: true });
  try {
    for (const width of [320, 390, 737, 1440]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900 });
      await page.setRequestInterception(true);
      page.on("request", request => {
        if (new URL(request.url()).pathname.startsWith("/api/")) void request.respond({ status: 200, contentType: "application/json", body: '{"texts":{},"hidden":[],"chat":{"conversation":null,"messages":[]}}' });
        else void request.continue();
      });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(String(error)));
      await page.goto(base, { waitUntil: "networkidle0" });
      assert.equal(await page.$$eval("[data-graphic]", elements => elements.length), 3);
      assert.equal(await page.$$eval('#deliverables button', elements => elements.filter(element => !element.closest('[inert]')).length), 0, "Result graphics do not show playback buttons; embedded app buttons stay inert");
      for (const name of ["business-plan", "presentation", "workspace"]) {
        const selector = `[data-graphic="${name}"]`;
        await page.$eval(selector, element => element.scrollIntoView({ block: "center", behavior: "instant" }));
        await page.waitForSelector(`${selector}[data-running="true"]`);
        await page.waitForFunction((s) => [...document.querySelectorAll<HTMLImageElement>(`${s} img`)].every(img => img.complete && img.naturalWidth > 0), {}, selector);
        await pause(2000);
        const dimensions = await page.$eval(selector, element => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height, layers: element.querySelectorAll('[data-motion-layer]').length };
        });
        if (name === "workspace") {
          assert.ok(Math.abs(dimensions.height / dimensions.width - (width < 960 ? 1.25 : 1)) < .02, "Workspace preview has a stable responsive frame");
          const before = await page.$eval(selector, element => Number((element as HTMLElement).dataset.progress));
          await pause(650);
          assert.ok(await page.$eval(selector, element => Number((element as HTMLElement).dataset.progress)) > before, "Workspace use sequence advances while visible");
          assert.ok(await page.$(`${selector} [inert] [data-workspace-open-document]`));
          assert.ok(await page.$(`${selector} input[type=range]`));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await page.screenshot({ path: `artifacts/home-result-graphics/${width}-${name}.png` });
          continue;
        }
        assert.ok(Math.abs(dimensions.width - dimensions.height) < 2, "Document graphic stage stays square");
        assert.ok(dimensions.layers >= 3, "Graphics need independently animated internal layers");
        if (name !== "workspace") {
          const sources = await page.$$eval(`${selector} img`, images => images.map(image => image.getAttribute("src")));
          assert.ok(sources.length >= 3);
          assert.ok(sources.every(source => source?.startsWith("/home-media/results/")), "Use rendered sample pages, not unrelated brand photos");
        }
        if (name === "presentation") {
          const duration = await page.$eval(`${selector} [data-motion-layer]`, image => getComputedStyle(image).animationDuration);
          assert.equal(duration, "24s", "Three slides hold for eight seconds each");
          const captionTop = await page.$eval(`${selector} > span`, el => el.getBoundingClientRect().top);
          const thumbnailBottom = await page.$eval(`${selector} [class*="slideStrip"]`, el => el.getBoundingClientRect().bottom);
          assert.ok(thumbnailBottom < captionTop, "PPT thumbnails must not overlap the caption");
        }
        const time = () => page.$eval(`${selector} [data-motion-layer]`, element => Number(element.getAnimations()[0]?.currentTime));
        const before = await time();
        await pause(650);
        assert.ok(await time() > before, "Visible layer timelines must advance");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: `artifacts/home-result-graphics/${width}-${name}.png` });
      }
      const motion = '[data-graphic="workspace"]';
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForFunction(() => [...document.querySelectorAll("[data-graphic]")].every(el => (el as HTMLElement).dataset.running === "false"));
      const stopped = await page.$eval(motion, el => (el as HTMLElement).dataset.progress);
      await pause(300);
      assert.equal(await page.$eval(motion, el => (el as HTMLElement).dataset.progress), stopped);
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await page.$eval('[data-graphic="workspace"]', element => element.scrollIntoView({ block: "center", behavior: "instant" }));
      await pause(200);
      assert.equal(await page.$eval(motion, el => (el as HTMLElement).dataset.running), "false");
      assert.equal(await page.$eval('[data-graphic="workspace"]', el => getComputedStyle(el).visibility), "visible");
      assert.equal(await page.$eval('#deliverables a[href="/samples/sample_coffee.pdf"]', el => el.getAttribute("target")), "_blank");
      assert.equal(await page.$eval('#deliverables a[href="/samples/sample_coffee.pptx"]', el => el.hasAttribute("download")), true);
      assert.ok(await page.$('#deliverables a[href="/plan"]'));
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`result graphics ${width}: passed`);
    }
  } finally {
    const cleanup = setTimeout(() => browser.process()?.kill("SIGTERM"), 5000);
    try { await browser.close(); } finally { clearTimeout(cleanup); }
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
