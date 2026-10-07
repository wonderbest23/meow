// 코치 채팅 화면을 사람처럼 눌러 13문항 → 사업 방향 정리까지 진행해 보는 점검 — 안전 미리보기(가짜 AI) 전용
// npx tsx scripts/synthetic-e2e/coach-chat-ui.mts   (origin.txt 필요, 미리보기는 NEXT_PUBLIC_INTAKE_COACH_CHAT=1 로 띄운다)
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
const origin = readFileSync(new URL("./origin.txt", import.meta.url), "utf8").trim();
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("synthetic preview only");
const out = new URL("./shots/", import.meta.url).pathname;
const viewports = [{ name: "pc", width: 1280, height: 800, uid: "syn-13" }, { name: "mobile", width: 375, height: 812, uid: "syn-14", mobile: true }];
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
for (const view of viewports) {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  // tsx keeps function names with a __name helper; the page needs it too for the evaluated callback.
  await page.evaluateOnNewDocument("window.__name = (fn) => fn;");
  await page.setViewport({ width: view.width, height: view.height, isMobile: !!view.mobile, hasTouch: !!view.mobile });
  await page.setCookie({ name: "syn_uid", value: view.uid, url: origin });
  await page.goto(`${origin}/plan/chat?new=1`, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForSelector("[data-coach-entry] button", { timeout: 120000 });
  const log = await page.evaluate(async () => {
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const lines: string[] = [];
    const skip = /잘 모르겠어요|이대로 보내기|다 골랐어요|범위 다시|현재 질문으로|추천 업종|저장한 사업/;
    const picked = (el: Element) => el.getAttribute("aria-pressed") === "true" || (el as HTMLElement).dataset.selected === "true";
    const usable = (el: Element) => !el.closest("details") && !skip.test((el as HTMLElement).innerText) && !!(el as HTMLElement).innerText.trim() && !(el as HTMLButtonElement).disabled;
    const idle = async () => { for (let i = 0; i < 160; i++) { if (!document.querySelector("[data-reply-typing]") && !document.querySelector("[data-job-chat]")) return; await wait(250); } };
    const userCount = () => document.querySelectorAll("[data-coach-message=user]").length;
    const type = async (text: string) => {
      const box = document.querySelector<HTMLTextAreaElement>("textarea[aria-label='대화 내용']")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, text);
      box.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(250);
      document.querySelector<HTMLButtonElement>("button[type=submit]")!.click();
    };
    [...document.querySelectorAll<HTMLButtonElement>("[data-coach-entry] button")].find(button => button.innerText.includes("생각한 사업"))!.click();
    await wait(3000);
    for (let turn = 0; turn < 30; turn++) {
      await idle(); await wait(700);
      const question = document.querySelector("[data-chat-question]");
      if (!question) break;
      const prompt = question.querySelector("h2")?.textContent ?? "?";
      const before = userCount();
      if (/사업인가요|운영하나요/.test(prompt)) await type("동네 가게 상품을 당일 배송해 주는 퀵 서비스");
      else for (let step = 0; step < 8 && question.isConnected && userCount() === before && !document.querySelector("[data-reply-typing]"); step++) {
        // One tap per step (row), in the first row nothing is chosen in yet — the way a person answers.
        const rows = [...question.querySelectorAll("[role=group], fieldset")].filter(row => [...row.querySelectorAll("button, label")].some(usable));
        const row = rows.find(candidate => ![...candidate.querySelectorAll("button, label")].some(picked));
        const target = row && [...row.querySelectorAll<HTMLElement>("button, label")].find(el => usable(el) && !picked(el));
        if (!target) { [...question.querySelectorAll<HTMLButtonElement>("button")].find(el => /이대로 보내기|다 골랐어요/.test(el.innerText))?.click(); break; }
        target.click(); await wait(900);
      }
      await wait(1500); await idle();
      lines.push(`${turn + 1}. ${prompt.slice(0, 26)} → ${[...document.querySelectorAll<HTMLElement>("[data-coach-message=user]")].at(-1)?.innerText.trim().slice(0, 36)}`);
    }
    for (let i = 0; i < 80 && document.querySelector("[data-job-chat]"); i++) await wait(500);
    await wait(3000);
    return { lines, header: `${document.querySelector("header strong")?.textContent} / ${document.querySelector("header span")?.textContent}`, layout: document.querySelector<HTMLElement>("[data-coach-layout]")?.dataset.coachLayout ?? null, result: !!document.querySelector("[aria-label='사업 한 줄 정리']"), overflow: document.documentElement.scrollWidth > innerWidth, receipts: [...document.querySelectorAll("[data-receipt]")].map(el => el.textContent) };
  });
  await page.screenshot({ path: `${out}coach-${view.name}.png` });
  console.log(JSON.stringify({ view: view.name, ...log, pageErrors: errors }));
  await page.close();
}
await browser.close();
