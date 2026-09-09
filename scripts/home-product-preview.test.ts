import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

async function main() {
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
await mkdir("artifacts/home-product-preview", { recursive: true });
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", req => {
      if (new URL(req.url()).pathname.startsWith("/api/")) {
        void req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ texts: {}, hidden: [], chat: { conversation: null, messages: [] } }) });
      } else void req.continue();
    });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto("http://localhost:8083", { waitUntil: "networkidle0" });
    const section = 'section[aria-label="사업 기획 과정 미리보기"]';
    await page.waitForSelector(section);
    await page.screenshot({ path: `artifacts/home-product-preview/${width}-home.png` });
    assert.equal(await page.$eval('button[aria-label="대화로 사업 기획 시작하기"]', el => getComputedStyle(el).borderTopLeftRadius), '36px');
    assert.equal(await page.$('[aria-label="미리보기 장면 선택"]'), null);
    assert.notEqual(await page.$eval('button[aria-label="대화로 사업 기획 시작하기"]', el => getComputedStyle(el, '::before').animationName), 'none');
    await page.$eval(section, el => el.scrollIntoView({ block: 'center' }));
    for (let index = 0; index < 3; index++) {
      await page.waitForFunction((selector, value) => document.querySelector(selector)?.getAttribute('data-stage') === String(value), {}, section, index);
      await new Promise(resolve => setTimeout(resolve, 2400));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `overflow at ${width}/${index}`);
      assert.equal(await page.$eval(`${section} [class*="__scene"]`, el => {
        const child = el.firstElementChild;
        return !child || child.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom + 1;
      }), true, `scene content clipped at ${width}/${index}`);
      const sceneText = await page.$eval(section, el => el.textContent);
      assert.match(sceneText || "", [/한마디에서 시작/, /시험 가격 · 가정/, /내 사업계획서/][index]);
      await page.screenshot({ path: `artifacts/home-product-preview/${width}-${index}.png`, fullPage: false });
    }
    await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-stage') === '0', {}, section);
    await page.click('button[aria-label="서비스 이용 문의 열기"]');
    await page.waitForSelector('[role="dialog"]');
    assert.match(await page.$eval('[role="dialog"] header', el => el.textContent || ""), /서비스 이용 문의/);
    assert.equal(await page.$eval('a.consult-to-support', el => el.getAttribute("href")), "/plan/chat");
    await page.click('button[aria-label="문의창 닫기"]');
    await page.click('button[aria-label="대화로 사업 기획 시작하기"]');
    await page.waitForSelector('[aria-label="사업 기획 대화로 이동 중"]');
    await new Promise(resolve => setTimeout(resolve, 180));
    await page.screenshot({ path: `artifacts/home-product-preview/${width}-enter.png` });
    await page.waitForFunction(() => location.pathname === "/plan/chat");
    await page.waitForFunction(() => document.body.style.overflow !== 'hidden');
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.goto('http://localhost:8083', { waitUntil: "networkidle0" });
    await page.waitForSelector(`${section}[data-playing=false]`);
    await page.click('button[aria-label="대화로 사업 기획 시작하기"]');
    await page.waitForFunction(() => location.pathname === "/plan/chat");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`home preview ${width}: passed`);
  }
} finally { await browser.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
