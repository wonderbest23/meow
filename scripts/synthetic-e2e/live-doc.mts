// 문서 화면이 새로고침 없이 장을 하나씩 붙이는지, 대화 화면의 '작성 중 · 진행 보기' 팝업이 실시간으로 바뀌는지 — 안전 미리보기 전용
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
const origin = readFileSync(new URL("./origin.txt", import.meta.url), "utf8").trim();
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("synthetic preview only");
const out = new URL("./shots/", import.meta.url).pathname;
const cookie = "syn_uid=syn-2";
const H = { "content-type": "application/json", "x-business-intake": "2", origin, cookie };
const req = async (method: string, path: string, body?: unknown) => (await fetch(origin + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined })).json().catch(() => null) as any;
let { plan } = await req("POST", "/api/plan/chat", { action: "start", mode: "startup", revision: 0, requestId: randomUUID() });
for (let i = 0; i < 40 && plan.nextQuestion; i++) {
  const q = plan.nextQuestion;
  const value = q.id === "business" ? "동네 세탁 수거 배달 서비스" : q.kind === "number" ? (q.id === "price" ? 20000 : 10) : q.kind === "single" ? q.options?.[0]?.value : q.kind === "multi" ? [q.options?.[0]?.value] : q.options?.[0]?.value ?? "직장인";
  plan = (await req("POST", "/api/plan/chat", { action: "answer", planId: plan.planId, revision: plan.coach.revision, requestId: randomUUID(), questionId: q.id, value })).plan;
}
plan = (await req("POST", "/api/plan/chat", { action: "design", planId: plan.planId, revision: plan.coach.revision, requestId: randomUUID() })).plan;
for (let i = 0; i < 20 && !plan.coach.design; i++) { await new Promise(r => setTimeout(r, 1000)); plan = (await req("GET", `/api/plan/chat?planId=${plan.planId}`)).plan; }
const planId = plan.planId;
const generating = fetch(`${origin}/api/dev/synthetic-generate?delayMs=3000`, { method: "POST", headers: H, body: JSON.stringify({ planId }) });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const doc = await browser.newPage(); await doc.setViewport({ width: 1280, height: 900 });
await doc.setCookie({ name: "syn_uid", value: "syn-2", url: origin });
await new Promise(r => setTimeout(r, 4000));
const chat = await browser.newPage(); await chat.setViewport({ width: 1280, height: 900 });
await chat.goto(`${origin}/plan/chat?planId=${encodeURIComponent(planId)}`, { waitUntil: "networkidle0", timeout: 90000 });
await new Promise(r => setTimeout(r, 1500));
const opened = await chat.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent?.includes("진행 보기")) as HTMLButtonElement | undefined; b?.click(); return b?.textContent ?? null; });
await new Promise(r => setTimeout(r, 1200));
await chat.screenshot({ path: `${out}live-dialog.png` });
const dialogEarly = await chat.evaluate(() => document.querySelector("dialog[open]")?.textContent?.slice(0, 200) ?? null);
await doc.goto(`${origin}/plan/document?planId=${encodeURIComponent(planId)}`, { waitUntil: "networkidle0", timeout: 90000 });
const count = () => doc.evaluate(() => ({ chapters: document.querySelectorAll("aside button").length, bar: document.querySelector("[class*=readingBar] span")?.textContent, summaryOn: document.querySelector("[aria-pressed=true]")?.textContent ?? null, nextSteps: !!document.querySelector("nav[aria-label='다음 단계']"), sections: document.querySelectorAll("section[id^=sec-]").length, writing: document.querySelector("[role=status] strong")?.textContent ?? null, now: document.querySelector("[class*=writingNow]")?.textContent ?? null, fresh: document.querySelectorAll("[data-fresh]").length }));
const samples = [];
for (let i = 0; i < 6; i++) { samples.push(await count()); if (i === 1) await doc.screenshot({ path: `${out}live-doc.png` }); await new Promise(r => setTimeout(r, 4500)); }
await generating;
await new Promise(r => setTimeout(r, 5000));
const final = await count();
await doc.screenshot({ path: `${out}live-doc-final.png` });
console.log(JSON.stringify({ opened, dialogEarly, samples, final }));
await browser.close();
