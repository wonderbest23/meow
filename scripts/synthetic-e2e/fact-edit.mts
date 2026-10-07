// 계획서 "수정하기"(문장에서 바로 고치기)와 계획서가 있는 사업의 대화 잠금을 화면에서 눌러 보는 점검 — 안전 미리보기 전용
// npx tsx scripts/synthetic-e2e/fact-edit.mts <planId> <syn-uid>   (origin.txt 필요, 계획서까지 만든 사업)
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
const origin = readFileSync(new URL("./origin.txt", import.meta.url), "utf8").trim();
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("synthetic preview only");
const [planId, uid] = process.argv.slice(2);
const out = new URL("./shots/", import.meta.url).pathname;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", error => errors.push(String(error)));
await page.evaluateOnNewDocument("window.__name = (fn) => fn;");
await page.setViewport({ width: 1440, height: 900 });
await page.setCookie({ name: "syn_uid", value: uid, url: origin });
const doc = `${origin}/plan/document?planId=${encodeURIComponent(planId)}`;
const log: Record<string, unknown> = {};

await page.goto(doc, { waitUntil: "networkidle0", timeout: 120000 }); await wait(1500);
const clickText = (text: string) => page.evaluate((label: string) => { const el = [...document.querySelectorAll<HTMLElement>("button, a")].find(node => node.innerText.trim().startsWith(label) && node.getBoundingClientRect().width > 0); el?.click(); return !!el; }, text);
log.openChoice = await clickText("수정하기"); await wait(500);
log.choiceText = await page.evaluate(() => document.querySelector("dialog[open]")?.textContent?.slice(0, 120) ?? null);
await page.screenshot({ path: `${out}fact-1-choice.png` });
log.pickFacts = await clickText("문장에서 바로 고치기"); await wait(2500);
log.factMode = await page.evaluate(() => ({ chips: [...document.querySelectorAll("[data-fact-chip]")].map(el => el.textContent), marks: document.querySelectorAll("mark[data-fact]").length, editable: document.querySelectorAll("[contenteditable=true]").length }));
await page.screenshot({ path: `${out}fact-2-mode.png` });
log.openPopover = await page.evaluate(() => { const chip = document.querySelector<HTMLElement>("[data-fact-chip=customer]"); chip?.click(); return !!chip; }); await wait(800);
log.popover = await page.evaluate(() => document.querySelector("[data-fact-popover]")?.textContent?.slice(0, 160) ?? null);
await page.screenshot({ path: `${out}fact-3-popover.png` });
log.pickOption = await page.evaluate(() => { const pop = document.querySelector("[data-fact-popover]"); const options = [...(pop?.querySelectorAll<HTMLElement>("button, label") ?? [])].filter(el => el.closest("[data-chat-question]") && el.getAttribute("aria-pressed") !== "true" && !/잘 모르겠어요|이대로/.test(el.innerText)); const target = options.find(el => !el.innerText.includes("맞벌이")) ?? options[0]; target?.click(); return target?.innerText ?? null; });
await wait(400);
log.finish = await page.evaluate(() => { const pop = document.querySelector("[data-fact-popover]"); if (!pop) return "auto-sent"; const button = [...pop.querySelectorAll<HTMLButtonElement>("button")].find(el => /이대로 보내기|바꾸기/.test(el.innerText) && !el.disabled); button?.click(); return button?.innerText ?? "none"; });
await wait(2500);
log.afterSave = await page.evaluate(() => ({ popover: !!document.querySelector("[data-fact-popover]"), reflect: document.querySelector("[data-fact-reflect]")?.textContent?.slice(0, 140) ?? null, customerChip: document.querySelector("[data-fact-chip=customer]")?.textContent }));
await page.screenshot({ path: `${out}fact-4-stale.png` });
log.reflect = await clickText("계획서에 반영하기"); await wait(2500);
log.afterReflect = await page.evaluate(() => ({ factMode: !!document.querySelector("[data-fact-card]"), error: document.querySelector("[data-fact-card] [role=alert]")?.textContent ?? null }));

await page.goto(`${origin}/plan/chat?planId=${encodeURIComponent(planId)}`, { waitUntil: "networkidle0", timeout: 120000 }); await wait(3000);
log.chat = await page.evaluate(() => ({ locked: !!document.querySelector("[data-document-locked]"), composer: !!document.querySelector("textarea[aria-label='대화 내용']"), pencils: document.querySelectorAll("[aria-label$='답변 수정']").length, subtitle: document.querySelector("header span")?.textContent }));
await page.screenshot({ path: `${out}fact-5-chat-locked.png` });

// 채팅으로 수정하기: 범위 밖 요청은 바로 정해진 답, 사실 변경 요청은 정리 → 변경 카드 → 바꾸기
log.chatEditLink = await page.evaluate(() => { const link = [...document.querySelectorAll<HTMLAnchorElement>("[data-document-locked] a")].find(a => a.innerText.includes("채팅으로 수정하기")); link?.click(); return !!link; });
await wait(4000);
const sendText = async (text: string) => {
  await page.evaluate((value: string) => {
    const box = document.querySelector<HTMLTextAreaElement>("textarea[aria-label='대화 내용']")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, value);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await wait(300);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>("button[type=submit]")!.click());
};
log.editIntro = await page.evaluate(() => document.querySelector("[data-edit-chat]")?.textContent?.slice(0, 80) ?? null);
const t0 = Date.now();
await sendText("그냥 카페 사업으로 할래"); await wait(1500);
log.offTopic = await page.evaluate(() => ({ lastReply: [...document.querySelectorAll("[data-coach-message=assistant]")].at(-1)?.textContent ?? null, job: !!document.querySelector("[data-job-chat]") }));
log.offTopicMs = Date.now() - t0;
await sendText("가격을 6만 5천원으로 바꿔줘"); await wait(1200);
log.running = await page.evaluate(() => ({ job: !!document.querySelector("[data-job-chat]"), subtitle: document.querySelector("header span")?.textContent }));
for (let i = 0; i < 30 && !(await page.$("[data-edit-proposal]")); i++) await wait(1000);
log.proposal = await page.evaluate(() => document.querySelector("[data-edit-proposal]")?.textContent?.slice(0, 160) ?? null);
await page.screenshot({ path: `${out}fact-6-edit-proposal.png` });
log.apply = await page.evaluate(() => { const button = [...document.querySelectorAll<HTMLButtonElement>("[data-edit-proposal] button")].find(b => b.innerText === "바꾸기"); button?.click(); return !!button; });
await wait(3000);
log.afterApply = await page.evaluate(() => ({ reply: [...document.querySelectorAll("[data-coach-message=assistant]")].at(-1)?.textContent ?? null, reapply: [...document.querySelectorAll("button")].some(b => b.innerText.includes("다시 작성하기")) }));
await page.screenshot({ path: `${out}fact-7-edit-applied.png` });
console.log(JSON.stringify({ ...log, pageErrors: errors }, null, 1));
await browser.close();
