// 홈페이지 공개 → 왼쪽 목록 '유지보수' → 유지보수 화면 → 에디터 저장 팝업 → 공개 페이지 비교까지 실제 화면으로 눌러 보는 QA (안전 미리보기 전용)
// npx tsx scripts/synthetic-e2e/homepage-care-qa.mts <planId> <syn-uid>
import puppeteer, { type Page } from "puppeteer-core";
import { readFileSync } from "node:fs";
const origin = readFileSync(new URL("./origin.txt", import.meta.url), "utf8").trim();
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("synthetic preview only");
const [planId, uid] = process.argv.slice(2);
const shots = new URL("./shots/", import.meta.url).pathname;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, protocolTimeout: 60000 });
const page = await browser.newPage();
const errors: string[] = []; page.on("pageerror", e => errors.push(String(e)));
page.on("dialog", d => { void d.accept(); });
await page.evaluateOnNewDocument("window.__name = (fn) => fn;");
const mark = (name: string) => console.error(`[step] ${name} +${Date.now() - start}ms`); const start = Date.now();
await page.setViewport({ width: 1440, height: 900 });
await page.setCookie({ name: "syn_uid", value: uid, url: origin });
const log: Record<string, unknown> = {};
const careStep = (p: Page) => p.evaluate(() => {
  const item = [...document.querySelectorAll("li")].find(li => li.textContent?.includes("유지보수") && li.querySelector("i[data-state]"));
  const mark = item?.querySelector("i[data-state]");
  return mark ? { state: mark.getAttribute("data-state"), link: !!item!.querySelector("a") } : null;
});
const homepageUrl = `${origin}/plan/homepage?planId=${encodeURIComponent(planId)}`;
const waitFor = async (selector: string, ms = 60000) => { for (let t = 0; t < ms; t += 500) { try { if (await page.$(selector)) return; } catch { /* page is navigating */ } await wait(500); } };

// 1) 홈페이지 화면 — 공개 전 왼쪽 목록
const t0 = Date.now();
await page.goto(homepageUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
await waitFor(".hk-preview-body");
log.homepageLoadMs = Date.now() - t0;
log.homepageUrl = page.url();
mark("homepage loaded");
log.careBeforePublish = await careStep(page);

// 2) 에디터 열기 → 저장 → 팝업 → 공개하고 주소 받기 (실제 홈페이지 화면, 실제 공개 API)
await page.waitForNetworkIdle({ idleTime: 1500, timeout: 60000 }).catch(() => undefined); await wait(2000);
for (let attempt = 0; attempt < 3 && !(await page.$(".bw-editor-save")); attempt++) { await page.evaluate(() => (document.querySelector(".hk-mock-edit") as HTMLButtonElement | null)?.click()); await waitFor(".bw-editor-save", 10000); }
mark("editor opened");
log.editorOpened = !!(await page.$(".bw-editor-save"));
log.aiButton = await page.evaluate(() => [...document.querySelectorAll(".bw-editor button")].some(b => (b as HTMLElement).innerText.trim() === "AI"));
log.editorFrame = await page.evaluate(() => { const c = document.querySelector(".bw-editor-canvas"); if (!c) return null; const cs = getComputedStyle(c); return { view: c.className.match(/view-\w+/)?.[0], border: cs.borderTopWidth, w: Math.round(c.getBoundingClientRect().width) }; });
log.editorAppendix = await page.evaluate(() => document.querySelector(".bw-editor-canvas .public-appendix-preview h2")?.textContent ?? null);
const editorTexts = await page.evaluate(() => [...document.querySelectorAll(".bw-editor-canvas [data-bw-text]")].map(e => (e as HTMLElement).innerText.trim()).filter(Boolean));
await page.screenshot({ path: `${shots}qa-editor.png` });
if (!(await page.$(".bw-editor-save"))) { console.log(JSON.stringify(log)); throw new Error("editor did not open"); }
await page.evaluate(() => (document.querySelector(".bw-editor-save") as HTMLButtonElement).click());
await waitFor(".bw-save-popup", 20000);
mark("save popup");
log.savePopup = await page.evaluate(() => document.querySelector(".bw-save-popup")?.textContent?.slice(0, 120) ?? null);
await page.screenshot({ path: `${shots}qa-save-popup.png` });
const tabs: string[] = []; browser.on("targetcreated", t => tabs.push(t.url()));
await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".bw-save-popup button")].find(b => /공개/.test(b.innerText) && !b.disabled)?.click());
for (let t = 0; t < 60000; t += 500) { const phase = await page.evaluate(() => document.querySelector(".bw-save-popup h2")?.textContent ?? ""); if (/공개했어요|공개하지 못했어요/.test(phase)) break; await wait(500); }
mark("publish popup");
log.publishPopup = await page.evaluate(() => ({ title: document.querySelector(".bw-save-popup h2")?.textContent, text: document.querySelector(".bw-save-popup p")?.textContent, url: (document.querySelector(".bw-save-url input") as HTMLInputElement | null)?.value ?? null }));
await wait(1500);
const openedPages = (await browser.pages()).map(p => p.url()).filter(u => u.includes("/launch/"));
log.newTab = openedPages;
await page.screenshot({ path: `${shots}qa-publish-popup.png` });
log.careAfterPublishNoReload = await careStep(page);
const liveUrl = (log.publishPopup as { url: string | null }).url;

// 3) 공개 페이지 — 에디터 글과 비교 + 맨 아래 문의 양식
mark("public page");
if (liveUrl) {
  const pub = await browser.newPage();
  await pub.setViewport({ width: 390, height: 844 });
  await pub.goto(liveUrl, { waitUntil: "networkidle0", timeout: 120000 }); await wait(1500);
  const publicText = await pub.evaluate(() => document.body.innerText);
  log.textsMissingOnPublic = editorTexts.filter(text => text.length > 1 && !publicText.replace(/\s+/g, " ").includes(text.replace(/\s+/g, " "))).slice(0, 10);
  log.publicLeadTitle = await pub.evaluate(() => document.querySelector(".public-lead-section h2")?.textContent ?? null);
  await pub.screenshot({ path: `${shots}qa-public.png`, fullPage: false });
  await pub.close();
}
await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".bw-save-popup button")].find(b => /닫기|계속/.test(b.innerText))?.click());
await page.evaluate(() => (document.querySelector('.bw-editor button[title="닫기"], .bw-editor-close') as HTMLButtonElement | null)?.click());
await wait(800);

// 4) 홈페이지 ↔ 유지보수를 오가며 '유지보수' 체크가 풀리는지 여러 시점에 본다
mark("navigate loop");
const samples: Array<unknown> = [];
for (const target of ["care", "homepage", "care", "homepage"] as const) {
  if (target === "care") await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>("a")].find(a => a.innerText.trim().endsWith("유지보수"))?.click());
  else await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>("a")].find(a => a.innerText.trim().endsWith("홈페이지") && a.href.includes("/plan/homepage"))?.click());
  for (const delay of [50, 300, 1500]) { await wait(delay); samples.push({ target, at: delay, care: await careStep(page) }); }
}
log.careWhileNavigating = samples;
mark("care page");
await page.goto(`${origin}/plan/workspace?planId=${encodeURIComponent(planId)}&tab=operations`, { waitUntil: "networkidle0", timeout: 120000 }); await wait(2500);
log.carePage = await page.evaluate(() => ({ title: document.querySelector("header h1, header strong, header [class*=title]")?.textContent?.trim(), tabs: [...document.querySelectorAll("nav[aria-label='사업 관리 메뉴'] button, nav[aria-label='사업 관리 메뉴'] a")].map(e => (e as HTMLElement).innerText.trim()), hasSummaryTab: document.body.innerText.includes("사업 요약"), hasChatLink: [...document.querySelectorAll("a")].some(a => a.innerText.trim() === "대화 이어가기") }));
log.chromeCount = await page.evaluate(() => ({ visibleRails: [...document.querySelectorAll("[data-app-rail]")].filter(el => el.getBoundingClientRect().width > 0).length, headers: [...document.querySelectorAll("header")].filter(el => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().top < 120).length }));
await page.screenshot({ path: `${shots}qa-care.png` });
log.pageErrors = errors;
console.log(JSON.stringify(log, null, 1));
await browser.close();
