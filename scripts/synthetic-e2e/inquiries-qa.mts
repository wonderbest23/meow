// 내 문의 QA — 홈페이지 공개 → 공개 페이지에서 손님 문의 남기기 → '내 문의' 목록·대화창·처리 완료·메뉴 숫자 (안전 미리보기 전용)
// npx tsx scripts/synthetic-e2e/inquiries-qa.mts <planId> <syn-uid>
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
const dialogs: string[] = []; page.on("dialog", d => { dialogs.push(`${d.type()}: ${d.message()}`); void d.accept(); });
await page.evaluateOnNewDocument("window.__name = (fn) => fn;");
await page.setViewport({ width: 1440, height: 900 });
await page.setCookie({ name: "syn_uid", value: uid, url: origin });
const log: Record<string, unknown> = {};
const has = async (p: Page, selector: string) => { try { return !!(await p.$(selector)); } catch { return false; } };
const until = async (p: Page, selector: string, ms = 30000) => { for (let t = 0; t < ms && !(await has(p, selector)); t += 500) await wait(500); };

// 1) 공개 — 실제 홈페이지 화면에서 에디터 저장 팝업으로
await page.goto(`${origin}/plan/homepage?planId=${encodeURIComponent(planId)}`, { waitUntil: "networkidle0", timeout: 180000 }); await wait(2500);
for (let i = 0; i < 3 && !(await has(page, ".bw-editor-save")); i++) { await page.evaluate(() => (document.querySelector(".hk-mock-edit") as HTMLButtonElement | null)?.click()); await until(page, ".bw-editor-save", 10000); }
await page.evaluate(() => (document.querySelector(".bw-editor-save") as HTMLButtonElement).click());
await until(page, ".bw-save-popup");
await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".bw-save-popup button")].find(b => /공개/.test(b.innerText))?.click());
for (let t = 0; t < 40000; t += 500) { if (await page.evaluate(() => !!document.querySelector(".bw-save-url input"))) break; await wait(500); }
const liveUrl = await page.evaluate(() => (document.querySelector(".bw-save-url input") as HTMLInputElement | null)?.value ?? null);
log.liveUrl = liveUrl;
if (!liveUrl) throw new Error("not published");

// 2) 손님이 공개 페이지에서 문의를 남긴다(합성 데이터)
const visitor = await browser.newPage();
await visitor.evaluateOnNewDocument("window.__name = (fn) => fn;");
await visitor.setViewport({ width: 390, height: 844 });
await visitor.goto(liveUrl, { waitUntil: "networkidle0", timeout: 120000 }); await wait(1500);
await visitor.evaluate(() => {
  const set = (selector: string, value: string) => { const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector); if (!el) return; const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); };
  set(".public-lead-section input[name=name]", "김합성");
  set(".public-lead-section input[name=email]", "visitor@synthetic.invalid");
  set(".public-lead-section input[name=phone]", "010-0000-0000");
  set(".public-lead-section textarea[name=message]", "다음 주 토요일 오후에 단체 20잔 주문 가능한가요?");
  document.querySelector<HTMLInputElement>(".public-lead-section .public-consent input")?.click();
});
await wait(500);
await visitor.evaluate(() => (document.querySelector(".public-lead-section button[type=submit]") as HTMLButtonElement | null)?.click());
await wait(3000);
log.visitorResult = await visitor.evaluate(() => document.querySelector(".public-lead-success, .public-form-error")?.textContent ?? null);
await visitor.close();

// 3) 내 문의 — 메뉴 숫자, 목록, 대화창
await page.goto(`${origin}/plan/inquiries`, { waitUntil: "networkidle0", timeout: 120000 });
await until(page, "[aria-label='문의 목록'] li", 30000); await wait(1500);
const badge = () => page.evaluate(() => [...document.querySelectorAll("a")].find(a => a.textContent?.includes("내 문의"))?.querySelector("b")?.textContent ?? "0");
log.railBadge = await badge();
log.list = await page.evaluate(() => [...document.querySelectorAll("[aria-label='문의 목록'] li")].map(li => li.textContent?.replace(/\s+/g, " ").trim().slice(0, 80)));
log.detail = await page.evaluate(() => ({ head: document.querySelector("[aria-label='문의 내용'] header")?.textContent?.replace(/\s+/g, " ").trim(), bubble: document.querySelector("[aria-label='문의 내용'] [class*=bubble]")?.textContent, info: [...document.querySelectorAll("[aria-label='문의 내용'] dl div")].map(d => d.textContent) }));
log.chromeCount = await page.evaluate(() => ({ visibleRails: [...document.querySelectorAll("[data-app-rail]")].filter(el => el.getBoundingClientRect().width > 0).length, headers: [...document.querySelectorAll("header")].filter(el => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().top < 120).length }));
await page.screenshot({ path: `${shots}inquiries-pc.png` });
// 처리 완료 → 메뉴 숫자 줄어듦
await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>("[aria-label='문의 내용'] button")].find(b => b.innerText.includes("처리 완료"))?.click());
await wait(2000);
log.afterHandled = { badge: await badge(), state: await page.evaluate(() => document.querySelector("[aria-label='문의 내용'] header em")?.textContent) };

// 4) 휴대폰: 목록 → 누르면 대화창 → 뒤로
await page.setViewport({ width: 390, height: 844 });
await page.goto(`${origin}/plan/inquiries`, { waitUntil: "networkidle0", timeout: 120000 }); await until(page, "[aria-label='문의 목록'] li button"); await wait(800);
log.phoneStart = await page.evaluate(() => ({ list: getComputedStyle(document.querySelector("[aria-label='문의 목록']")!).display, detail: getComputedStyle(document.querySelector("[aria-label='문의 내용']")!).display }));
await page.evaluate(() => (document.querySelector("[aria-label='문의 목록'] li button") as HTMLButtonElement).click()); await wait(600);
log.phoneOpened = await page.evaluate(() => ({ list: getComputedStyle(document.querySelector("[aria-label='문의 목록']")!).display, detail: getComputedStyle(document.querySelector("[aria-label='문의 내용']")!).display }));
await page.screenshot({ path: `${shots}inquiries-phone.png` });
await page.evaluate(() => (document.querySelector("[aria-label='문의 목록으로']") as HTMLButtonElement).click()); await wait(400);
log.phoneBack = await page.evaluate(() => getComputedStyle(document.querySelector("[aria-label='문의 목록']")!).display);

// 5) 홈페이지 화면 5번 칸 — 문의 목록 대신 '내 문의에서 보기'
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${origin}/plan/homepage?planId=${encodeURIComponent(planId)}`, { waitUntil: "networkidle0", timeout: 120000 }); await wait(2500);
log.homepageFold5 = await page.evaluate(() => ({ title: document.querySelector("#hk-leads summary strong")?.textContent, link: document.querySelector(".hk-inquiries-link")?.textContent, alertSettings: !!document.querySelector("#hk-leads input") }));
log.dialogs = dialogs;
log.pageErrors = errors;
console.log(JSON.stringify(log, null, 1));
await browser.close();
