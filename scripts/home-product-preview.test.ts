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
    assert.equal(await page.$eval('.home-start-button', el => getComputedStyle(el).backgroundColor), 'rgb(49, 130, 246)', '시작 버튼에 예전 검색창 스타일이 남지 않아야 함');
    assert.equal(await page.$eval(`${section} button[title="일시정지"] svg`, el => getComputedStyle(el).display), 'block');
    await page.click('button[aria-label="미리보기 일시정지"]');
    for (let index = 0; index < 3; index++) {
      const controls = await page.$$(`${section} div[aria-label="미리보기 장면 선택"] button`);
      await controls[index].click();
      await new Promise(resolve => setTimeout(resolve, 1000));
      assert.equal(await controls[index].evaluate(el => el.getAttribute("aria-pressed")), "true");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `overflow at ${width}/${index}`);
      assert.equal(await page.$eval(`${section} [class*="__scene"]`, el => {
        const child = el.firstElementChild;
        return !child || child.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom + 1;
      }), true, `scene content clipped at ${width}/${index}`);
      const sceneText = await page.$eval(section, el => el.textContent);
      assert.match(sceneText || "", [/한마디에서 시작/, /시험 가격 · 가정/, /내 사업계획서/][index]);
      await page.screenshot({ path: `artifacts/home-product-preview/${width}-${index}.png`, fullPage: false });
    }
    await page.click('button[aria-label="미리보기 자동재생"]');
    await new Promise(resolve => setTimeout(resolve, 6500));
    assert.equal(await page.$eval(`${section} button[aria-pressed=true]`, el => el.textContent), "1대화로 시작");
    await page.click('button[aria-label="서비스 이용 문의 열기"]');
    await page.waitForSelector('[role="dialog"]');
    assert.match(await page.$eval('[role="dialog"] header', el => el.textContent || ""), /서비스 이용 문의/);
    assert.equal(await page.$eval('a.consult-to-support', el => el.getAttribute("href")), "/plan/chat");
    await page.click('button[aria-label="문의창 닫기"]');
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector('button[aria-label="미리보기 자동재생"]');
    await page.click('button[aria-label="대화로 사업 기획 시작하기"]');
    await page.waitForFunction(() => location.pathname === "/plan/chat");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`home preview ${width}: passed`);
  }
} finally { await browser.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
