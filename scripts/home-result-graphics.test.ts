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
      assert.notEqual(await page.$eval('[aria-label="그래픽 애니메이션 일시 정지"] svg', el => getComputedStyle(el).display), "none", "Pause control icon must not be hidden by global button styles");
      for (const name of ["business-plan", "presentation", "workspace"]) {
        const selector = `[data-graphic="${name}"]`;
        await page.$eval(selector, element => element.scrollIntoView({ block: "center", behavior: "instant" }));
        await page.waitForSelector(`${selector}[data-running="true"]`);
        await page.waitForFunction((s) => {
          const img = document.querySelector<HTMLImageElement>(`${s} img`);
          return img?.complete && img.naturalWidth > 0;
        }, {}, selector);
        await pause(2000);
        const dimensions = await page.$eval(selector, element => {
          const rect = element.getBoundingClientRect();
          const img = element.querySelector("img")!;
          return { width: rect.width, height: rect.height, fit: getComputedStyle(img).objectFit, src: img.getAttribute("src") };
        });
        assert.ok(Math.abs(dimensions.width - dimensions.height) < 2, "Graphic stage stays square");
        assert.equal(dimensions.fit, "contain");
        assert.equal(dimensions.src, `/home-media/${name}-graphic.png`);
        const transform = () => page.$eval(`${selector} [class*="__graphicMotion"]`, element => getComputedStyle(element).transform);
        const before = await transform();
        await pause(650);
        assert.notEqual(await transform(), before, "Visible graphics must actually animate");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: `artifacts/home-result-graphics/${width}-${name}.png` });
      }
      await page.$eval('[aria-label="그래픽 애니메이션 일시 정지"]', element => (element as HTMLButtonElement).click());
      await page.waitForFunction(() => [...document.querySelectorAll("[data-graphic]")].every(el => (el as HTMLElement).dataset.running === "false"));
      await pause(100);
      const motion = '[data-graphic="workspace"] [class*="__graphicMotion"]';
      const stopped = await page.$eval(motion, el => getComputedStyle(el).transform);
      await pause(300);
      assert.equal(await page.$eval(motion, el => getComputedStyle(el).transform), stopped);
      await page.$eval('[aria-label="그래픽 애니메이션 재생"]', element => (element as HTMLButtonElement).click());
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForFunction(() => [...document.querySelectorAll("[data-graphic]")].every(el => (el as HTMLElement).dataset.running === "false"));
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await page.$eval('[data-graphic="workspace"]', element => element.scrollIntoView({ block: "center", behavior: "instant" }));
      await pause(200);
      assert.equal(await page.$eval(motion, el => getComputedStyle(el).animationName), "none");
      assert.equal(await page.$eval('[data-graphic="workspace"] img', el => getComputedStyle(el).visibility), "visible");
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
