import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { phoneScrollProgress, phoneStoryPins } from "../lib/home-phone-motion";

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
      const pinned = phoneStoryPins(width, height);
      await page.screenshot({ path: `artifacts/home-scroll-story/${width}x${height}-hero.png` });
      await page.$eval('#how', element => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
      await page.waitForSelector(`[data-scroll-story][data-motion="${pinned ? "on" : "off"}"]`);
      await page.waitForSelector('[data-scroll-story][data-renderer="webgl"][data-rendered="true"]');
      if (pinned) {
        const states: string[] = [];
        for (const progress of [.02, .18, .42, .46, .8, .97, .42]) {
          await page.$eval('[data-scroll-story]', (element, value) => {
            const pin = element.querySelector<HTMLElement>('[data-pin]')!;
            scrollTo({ top: element.getBoundingClientRect().top + scrollY - 64 + ((element as HTMLElement).offsetHeight - pin.offsetHeight) * value, behavior: 'instant' });
          }, progress);
          const expected = width > 700 ? phoneScrollProgress(progress) : progress;
          await page.waitForFunction(value => Math.abs(Number(document.querySelector<HTMLElement>('[data-scroll-story]')?.dataset.progress) - value) < .002, {}, expected);
          const state = await page.$eval('[data-scroll-story]', element => ({
            progress: Number((element as HTMLElement).dataset.progress),
            transform: getComputedStyle(element.querySelector('[data-phone-mount] [data-phone-focus]')!).transform,
            pin: element.querySelector('[data-pin]')!.getBoundingClientRect().top,
          }));
          assert.ok(Math.abs(state.progress - expected) < .015, 'Scroll follows the reading-time choreography in both directions');
          assert.ok(Math.abs(state.pin - 64) < 2);
          states.push(state.transform);
          await page.screenshot({ path: `artifacts/home-scroll-story/${width}x${height}-progress-${progress}.png` });
        }
        assert.notEqual(states[2], states[3], 'Intermediate motion must not snap between discrete scenes');
        assert.equal(states[2], states[6], 'Reversing scroll restores the same visual state');
      } else {
        assert.equal(await page.$eval('[data-pin]', el => getComputedStyle(el).position), 'relative');
        assert.ok(await page.$eval('[data-phone-mount] [data-phone-screen]', el => el.getBoundingClientRect().height > 250));
        await page.screenshot({ path: `artifacts/home-scroll-story/${width}x${height}-unpinned-phone.png` });
      }
      assert.equal(await page.$$eval('#how button', elements => elements.length), 0, 'Playback uses a single scrubber without extra buttons');
      assert.ok(await page.$eval('[data-phone-progress]', el => el.getBoundingClientRect().height >= 44), 'The scrubber retains a touch-sized target');
      await page.focus('[data-phone-progress]');
      await page.keyboard.press('End');
      assert.equal(await page.$eval('#how [data-scroll-story]', el => (el as HTMLElement).dataset.progress), '1.00000');
      await page.keyboard.press('Home');
      assert.equal(await page.$eval('#how [data-scroll-story]', el => (el as HTMLElement).dataset.progress), '0.00000');
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
      assert.ok(await page.$('[aria-labelledby="home-website-title"] a[href="/plan/homepage"]'));
      assert.equal(await page.$$eval('[data-portrait] figcaption', elements => elements.length), 10);
      assert.equal(await page.$eval('[data-portrait]:nth-child(6) figcaption', el => el.textContent), '꽃집 창업');
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.waitForSelector('[data-scroll-story][data-motion="off"]');
      assert.equal(await page.$eval('[data-pin]', el => getComputedStyle(el).position), 'relative');
      await page.$eval('#how', element => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
      await pause(300);
      const reducedProgress = await page.$eval('[data-scroll-story]', el => (el as HTMLElement).dataset.progress);
      await pause(500);
      assert.equal(await page.$eval('[data-scroll-story]', el => (el as HTMLElement).dataset.progress), reducedProgress, 'Reduced motion must not autoplay');
      assert.ok(await page.$eval('[data-phone-mount] [data-phone-screen]', el => el.getBoundingClientRect().height > 250), 'Reduced motion keeps the product screen visible');
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
