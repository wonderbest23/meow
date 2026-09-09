import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer, { type Page } from "puppeteer-core";
import { EMPTY_BUSINESS, type PlanState } from "../lib/plan-builder/plan-store";
import { COACH_TYPES } from "../lib/plan-builder/coach";
import { chaptersForType } from "../lib/plan-builder/blueprint";

async function click(page: Page, label: string) {
  for (const button of await page.$$("button")) {
    if (await button.evaluate((el, text) => el.textContent?.trim() === text && el.getBoundingClientRect().width > 0, label)) { await button.click(); return; }
  }
  throw new Error(`Missing button: ${label}`);
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  await mkdir("artifacts/document-workspace", { recursive: true });
  try {
    for (const width of [320, 390, 900, 1440]) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width, height: 850 });
      const now = new Date().toISOString();
      const sections = chaptersForType(COACH_TYPES.startup).flatMap(ch => ch.sections.map(s => `${ch.id}/${s.id}`));
      let state: PlanState = { business: EMPTY_BUSINESS, activePlanId: "document-test", plans: [{ id: "document-test", title: "동네 가게의 메뉴 사진과 소개문구를 함께 만드는 사업", planType: COACH_TYPES.startup, createdAt: now, updatedAt: now, answers: {}, sections: Object.fromEntries(sections.map(key => [key, { markdown: "가게의 메뉴 사진과 소개문구를 만듭니다.", html: "<p>가게의 메뉴 사진과 소개문구를 만듭니다. 처음에는 동네 가게를 대상으로 한 가지 상품부터 시작합니다.</p><table><tbody><tr><th>상품</th><th>제안 가격</th><th>산출 근거</th></tr><tr><td>메뉴 사진 촬영</td><td>99,000원</td><td>촬영과 편집 시간을 바탕으로 한 가정입니다.</td></tr></tbody></table>", generatedAt: now }])) }] };
      let paid = true;
      const exports: Array<{ format: string; sections: unknown[] }> = [];
      const errors: string[] = [];
      page.on("pageerror", e => errors.push(String(e)));
      await page.setRequestInterception(true);
      page.on("request", request => {
        const path = new URL(request.url()).pathname;
        const json = (body: unknown) => void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        if (path === "/api/plan/state") {
          if (request.method() === "PUT") { state = { ...state, ...JSON.parse(request.postData() || "{}") }; json({ ok: true }); }
          else json({ ...state, authenticated: false });
          return;
        }
        if (path === "/api/plan/access") { json({ paid, price: 149000 }); return; }
        if (path === "/api/plan/document" || path === "/api/plan/deck") {
          exports.push(JSON.parse(request.postData() || "{}"));
          void request.respond({ status: 200, contentType: "application/octet-stream", body: "mock-file-only" }); return;
        }
        void request.continue();
      });
      await page.goto("http://localhost:8083/plan/document?planId=document-test", { waitUntil: "networkidle0", timeout: 60000 });
      await page.waitForSelector(".tiptap[contenteditable=false]");
      assert.equal(await page.$('aside[aria-label="작업 메뉴"]'), null, "문서 화면에서 사업 메뉴와 목차가 중복되지 않음");
      assert.equal(await page.$$eval("aside", nodes => nodes.filter(el => el.getBoundingClientRect().width > 0).length), width > 760 ? 1 : 0, "PC는 목차 하나, 모바일은 목차 버튼만 표시");
      assert.ok(await page.$eval('a[aria-label="이전 화면으로"]', el => el.getBoundingClientRect().width > 0), "PC와 모바일 모두 상단 뒤로 가기 제공");
      assert.equal(await page.$$("article h2").then(x => x.length), 1, "한 번에 한 장만 표시");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "화면 전체 가로 스크롤 없음");
      assert.ok(await page.$eval("footer", el => { const r = el.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top > innerHeight - 120; }), "하단 버튼 고정");
      await page.screenshot({ path: `artifacts/document-workspace/read-${width}.png` });
      await click(page, "수정하기");
      await page.waitForSelector('.tiptap[contenteditable="true"]');
      await new Promise(r => setTimeout(r, 50));
      assert.equal(Object.values(state.plans[0].sections).some(s => s.edited), false, "모드 전환만으로 수동 수정 표시하지 않음");
      await page.click('.tiptap[contenteditable="true"]');
      await page.keyboard.press("Home"); await page.keyboard.type("TEST-SAVED ");
      await page.evaluate(() => {
        const next = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "다음 장");
        next?.click();
      });
      await new Promise(r => setTimeout(r, 400));
      assert.ok(Object.values(state.plans[0].sections).some(s => s.html.includes("TEST-SAVED")), "디바운스 이전 장 이동도 변경 내용을 저장");
      await click(page, "이전 장");
      await page.waitForFunction(() => document.querySelector("article")?.textContent?.includes("TEST-SAVED"));
      await click(page, "수정 마치기");
      assert.equal(await page.$('.tiptap[contenteditable="true"]'), null);
      if (width <= 760) { await click(page, "목차"); await page.waitForSelector("dialog[open]"); }
      await click(page, "전체 이어 읽기");
      assert.ok(await page.$$("article h2").then(x => x.length > 1));
      await click(page, "내려받기");
      await page.waitForSelector("dialog[open]");
      await page.screenshot({ path: `artifacts/document-workspace/download-${width}.png` });
      const pdf = await page.$("dialog button:has(strong)"); assert.ok(pdf); await pdf.click();
      await new Promise(r => setTimeout(r, 250));
      assert.equal(exports[0]?.format, "pdf");
      assert.equal(exports[0]?.sections.length, sections.length, "내보내기는 선택한 장이 아닌 전체 문서");
      await page.keyboard.press("Escape");
      assert.equal(await page.$("dialog[open]"), null);
      paid = false;
      await page.reload({ waitUntil: "networkidle0" });
      await click(page, "내려받기");
      await page.waitForFunction(() => document.querySelector("dialog")?.textContent?.includes("결제 후"));
      const unpaidPdf = await page.$("dialog button:has(strong)"); await unpaidPdf!.click();
      await page.waitForFunction(() => location.pathname === "/plan/pay");
      assert.equal(exports.length, 1, "미결제 다운로드는 생성 API를 부르지 않음");
      if (width === 390) {
        await page.goto("http://localhost:8083/plan/document?planId=sample_coffee", { waitUntil: "networkidle0" });
        await page.waitForSelector('.tiptap[contenteditable="false"]');
        assert.equal(await page.$('.tiptap[contenteditable="true"]'), null, "예시 문서는 읽기 전용");
        assert.ok(await page.$eval("footer button", el => (el as HTMLButtonElement).disabled));
        await page.screenshot({ path: "artifacts/document-workspace/sample-390.png" });
        await click(page, "내려받기");
        assert.ok(await page.$eval("dialog button:has(strong)", el => !(el as HTMLButtonElement).disabled), "예시 PDF는 결제 없이 정적 파일 제공");
      }
      assert.deepEqual(errors, []);
      console.log(`document workspace ${width}: passed`);
      await context.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
