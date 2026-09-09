import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

async function main() {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  await mkdir("artifacts/home-scroll-story", { recursive: true });
  try {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900 });
      await page.setRequestInterception(true);
      page.on("request", request => {
        if (new URL(request.url()).pathname.startsWith("/api/")) void request.respond({ status: 200, contentType: "application/json", body: '{"texts":{},"hidden":[],"chat":{"conversation":null,"messages":[]}}' });
        else void request.continue();
      });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(String(error)));
      await page.goto("http://localhost:8083", { waitUntil: "networkidle0" });
      await page.waitForSelector('[data-scroll-story][data-motion="on"]');
      for (const [progress, expected] of [[.08, 0], [.48, 1], [.9, 2], [.08, 0]]) {
        await page.$eval('[data-scroll-story]', (element, p) => {
          const surface = element.firstElementChild as HTMLElement;
          const top = parseFloat(getComputedStyle(surface).top);
          window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - top + ((element as HTMLElement).offsetHeight - surface.offsetHeight) * p, behavior: 'instant' });
        }, progress);
        await page.waitForFunction(step => document.querySelector('[data-scroll-story]')?.getAttribute('data-step') === String(step), {}, expected);
        await page.waitForFunction(() => {
          const active = document.querySelector('[data-story-scene][data-active="true"]');
          return active && Math.abs(active.getBoundingClientRect().top - active.parentElement!.getBoundingClientRect().top) < 1;
        });
        const bounds = await page.$eval('[data-story-scene][data-active="true"]', element => {
          const frame = element.getBoundingClientRect();
          const title = element.querySelector('h3')!.getBoundingClientRect();
          return { fits: title.left >= frame.left && title.right <= frame.right && title.top >= frame.top && title.bottom <= frame.bottom, onscreen: frame.top >= 0 && frame.bottom <= innerHeight };
        });
        assert.equal(bounds.fits && bounds.onscreen, true, '현재 장면이 잘리거나 겹치면 안 됨');
        assert.equal(await page.evaluate(() => {
          const progress = document.querySelector('[data-scroll-story] [class*="__progress"]')?.getBoundingClientRect();
          const support = document.querySelector('.support-chat-toggle')?.getBoundingClientRect();
          return !progress || !support || progress.right <= support.left || progress.left >= support.right || progress.bottom <= support.top || progress.top >= support.bottom;
        }), true, '상담 버튼이 진행 표시를 가리면 안 됨');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: `artifacts/home-scroll-story/${width}-scene-${expected}.png` });
      }
      await page.$eval('#difference', element => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
      await page.waitForFunction(() => document.querySelector('#difference [data-reveal]')?.getAttribute('data-seen') === 'true');
      await page.waitForFunction(() => document.querySelector('#difference [data-reveal]')!.getAnimations().every(animation => animation.playState === 'finished'));
      await page.screenshot({ path: `artifacts/home-scroll-story/${width}-difference.png` });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.waitForSelector('[data-scroll-story][data-motion="off"]');
      assert.equal(await page.$$eval('[data-story-scene]', scenes => scenes.every(scene => getComputedStyle(scene).position !== 'absolute' && getComputedStyle(scene).transform === 'none')), true);
      await page.setViewport({ width, height: 500 });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
      await page.waitForSelector('[data-scroll-story][data-motion="off"]');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.setJavaScriptEnabled(false);
      await page.goto("http://localhost:8083", { waitUntil: "networkidle0" });
      assert.equal(await page.$$eval('[data-story-scene]', scenes => scenes.length === 3 && scenes.every(scene => getComputedStyle(scene).position !== 'absolute')), true, 'JS가 없어도 세 장면의 내용이 모두 보여야 함');
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`scroll story ${width}: passed`);
    }
  } finally { await browser.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
