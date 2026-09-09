import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { sanitizeSiteCopy, EDIT_SECTIONS } from "../lib/site-copy/domain";

async function main() {
  assert.deepEqual(sanitizeSiteCopy({ texts: { 'hero.title': 'old claim', 'reviews.notice': 'old demo', 'chatHome.title': '새 제목' }, hidden: ['reviews', 'price'] }), { texts: { 'chatHome.title': '새 제목' }, hidden: [] });
  assert.deepEqual(EDIT_SECTIONS.map(section => section.id), ['chatHome']);
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  await mkdir("artifacts/home-product-preview", { recursive: true });
  try {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900 });
      await page.setRequestInterception(true);
      page.on("request", req => {
        if (new URL(req.url()).pathname.startsWith("/api/")) void req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ texts: { 'hero.title': '사업, 오늘 하루면 충분합니다', 'price.subtitle': '완성 샘플 3부', 'stats.title': '숫자로 먼저 확인하세요' }, hidden: [], chat: { conversation: null, messages: [] } }) });
        else void req.continue();
      });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(String(error)));
      await page.goto("http://localhost:8083", { waitUntil: "networkidle0" });
      const section = 'section[aria-label="대화에서 사업계획서까지 영상 미리보기"]';
      const ring = 'button[aria-label="대화로 사업 기획 시작하기"]';
      await page.waitForSelector(section);
      const homeText = await page.$eval('main', el => el.textContent ?? '');
      assert.match(homeText, /챗GPT로 사업계획서/);
      for (const obsolete of ['실제 후기가 아닙니다', '숫자로 먼저 확인하세요', '지원·대출 심사용', '완성 샘플 3부', '오늘 하루면 충분합니다']) assert.equal(homeText.includes(obsolete), false, obsolete);
      assert.equal(await page.$('.home-reviews'), null);
      assert.equal(await page.$$eval('nav[aria-label="메인 안내"] a', links => links.every(link => !!document.querySelector(link.getAttribute('href')!))), true);
      await page.$eval('#difference', el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await page.screenshot({ path: `artifacts/home-product-preview/${width}-difference.png` });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.$eval('#price details:nth-child(2) summary', el => (el as HTMLElement).click());
      assert.equal(await page.$eval('#price details:nth-child(2)', el => el.hasAttribute('open')), true);
      await page.$eval('#price', el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await page.screenshot({ path: `artifacts/home-product-preview/${width}-usage.png` });
      await page.$eval(ring, el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      assert.equal(await page.$(ring + ' svg'), null, "링에 아이콘이 없어야 함");
      assert.equal(await page.$eval(ring + ' [class*="__send"]', el => el.textContent), '보내기');
      assert.equal(await page.$eval(ring, el => {
        const prompt = el.querySelector('[class*="__prompt"]')!;
        const send = el.querySelector('[class*="__send"]')!;
        return prompt.getBoundingClientRect().right <= send.getBoundingClientRect().left;
      }), true, '타이핑 문구와 보내기 영역이 겹치지 않아야 함');
      assert.equal(await page.$('[aria-label="미리보기 장면 선택"]'), null);
      await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.readyState >= 2 && v.currentTime > .1; });
      const media = await page.$eval('video', v => ({ src: v.currentSrc, width: v.videoWidth, height: v.videoHeight, muted: v.muted, inline: v.playsInline }));
      assert.match(media.src, width <= 600 ? /mobile-v2.mp4/ : /desktop-v2.mp4/);
      assert.equal(media.muted && media.inline, true);
      assert.equal(media.width, width <= 600 ? 720 : 1280);
      await page.screenshot({ path: `artifacts/home-product-preview/${width}-film-home.png` });
      const first = await page.$eval('video', v => v.currentTime);
      await new Promise(resolve => setTimeout(resolve, 600));
      assert.ok(await page.$eval('video', v => v.currentTime) > first, "실제 영상이 재생되어야 함");
      for (const time of [2.5, 7, 11]) {
        await page.$eval('video', (v, t) => { v.pause(); v.currentTime = t; }, time);
        await page.waitForFunction(t => { const v = document.querySelector('video'); return v && !v.seeking && Math.abs(v.currentTime - t) < .2; }, {}, time);
        await page.$eval(section, el => el.scrollIntoView({ block: 'center' }));
        await page.screenshot({ path: `artifacts/home-product-preview/${width}-film-${time}.png` });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      await page.click(ring + ' [class*="__send"]');
      await page.waitForSelector('[aria-label="사업 기획 대화로 이동 중"]');
      await page.waitForFunction(() => location.pathname === "/plan/chat");
      await page.waitForFunction(() => document.body.style.overflow !== 'hidden');
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await page.goto("http://localhost:8083", { waitUntil: "networkidle0" });
      await page.waitForSelector('video[hidden]');
      assert.ok(await page.$eval(section + ' img', img => img.complete && img.naturalWidth > 0));
      await page.click(ring);
      await page.waitForFunction(() => location.pathname === "/plan/chat");
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`rendered home film ${width}: passed`);
    }
  } finally { await browser.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
