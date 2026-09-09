import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  await mkdir("artifacts/home-scroll-story", { recursive: true });
  try {
    for (const [width, height] of [[320, 740], [390, 844], [768, 900], [1440, 670], [1440, 900]]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.setRequestInterception(true);
      page.on("request", request => {
        if (new URL(request.url()).pathname.startsWith("/api/")) void request.respond({ status: 200, contentType: "application/json", body: '{"texts":{},"hidden":[],"chat":{"conversation":null,"messages":[]}}' });
        else void request.continue();
      });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(String(error)));
      await page.goto("http://localhost:8083", { waitUntil: "networkidle0" });
      const pinned = width >= 960;
      await page.waitForSelector(`[data-scroll-story][data-motion="${pinned ? "on" : "off"}"]`);
      await page.screenshot({ path: `artifacts/home-scroll-story/${width}x${height}-hero.png` });
      if (pinned) {
        const states: string[] = [];
        for (const progress of [0, .25, .4, .5, .7, 1, .25]) {
          await page.$eval('[data-scroll-story]', (element, value) => {
            const pin = element.querySelector<HTMLElement>('[data-pin]')!;
            scrollTo({ top: element.getBoundingClientRect().top + scrollY - 64 + ((element as HTMLElement).offsetHeight - pin.offsetHeight) * value, behavior: 'instant' });
          }, progress);
          await pause(100);
          const state = await page.$eval('[data-scroll-story]', element => ({
            progress: Number((element as HTMLElement).dataset.progress),
            transform: getComputedStyle(element.querySelector('[class*="__briefLayer"]')!).transform,
            pin: element.querySelector('[data-pin]')!.getBoundingClientRect().top,
          }));
          assert.ok(Math.abs(state.progress - progress) < .015, 'Scroll must be continuous in both directions');
          assert.ok(Math.abs(state.pin - 64) < 2);
          states.push(state.transform);
          await page.screenshot({ path: `artifacts/home-scroll-story/${width}x${height}-progress-${progress}.png` });
        }
        assert.notEqual(states[2], states[3], 'Intermediate motion must not snap between discrete scenes');
        assert.equal(states[1], states[6], 'Reversing scroll restores the same visual state');
      } else {
        assert.equal(await page.$eval('[data-pin]', el => getComputedStyle(el).display), 'none');
        for (const index of [1, 2]) {
          await page.$eval(`[data-scroll-story] article:nth-child(${index})`, element => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
          await pause(1000);
          await page.screenshot({ path: `artifacts/home-scroll-story/${width}x${height}-mobile-step-${index}.png` });
        }
      }
      for (const selector of ['#deliverables', '[data-founder-wall]', '#difference', '[aria-labelledby="home-website-title"]', '#price']) {
        await page.$eval(selector, element => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
        await pause(1000);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${selector} horizontal overflow`);
        await page.screenshot({ path: `artifacts/home-scroll-story/${width}x${height}-${selector.replace(/[^a-z]/g, '')}.png` });
      }
      await page.$$eval('img[loading="lazy"]', images => images.forEach(img => (img as HTMLImageElement).loading = 'eager'));
      await page.waitForFunction(() => [...document.querySelectorAll('main img')].every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0));
      assert.equal(await page.$eval('a[href="/samples/sample_coffee.pdf"]', a => a.getAttribute('target')), '_blank');
      assert.equal(await page.$eval('a[href="/samples/sample_coffee.pptx"]', a => a.hasAttribute('download')), true);
      await page.$eval('[aria-labelledby="home-website-title"] button', element => (element as HTMLButtonElement).click());
      await page.waitForFunction(() => [...document.querySelectorAll('textarea')].some(textarea => textarea.value.includes('홈페이지 제작을 상담하고 싶어요')));
      await page.keyboard.press('Escape');
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.waitForSelector('[data-scroll-story][data-motion="off"]');
      assert.equal(await page.$eval('[data-pin]', el => getComputedStyle(el).display), 'none');
      // The application needs hydration; disabling the animation layer must not hide its content.
      await page.$eval('[data-scroll-story]', el => el.removeAttribute('data-motion'));
      assert.equal(await page.$$eval('[data-scroll-story] article', elements => elements.length === 2 && elements.every(el => el.getBoundingClientRect().height > 300)), true, 'The static fallback must show both sections');
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`continuous home story ${width}x${height}: passed`);
    }
  } finally {
    const cleanup = setTimeout(() => browser.process()?.kill("SIGTERM"), 5000);
    try { await browser.close(); } finally { clearTimeout(cleanup); }
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
