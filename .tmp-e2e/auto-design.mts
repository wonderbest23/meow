// 질문만 끝내고(정리 요청 없이) 화면을 열면 사업 방향 정리가 자동으로 시작·완료되는지 — 안전 미리보기 전용
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
const origin = readFileSync(new URL("./origin.txt", import.meta.url), "utf8").trim();
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("synthetic preview only");
let cookie = "syn_uid=syn-1";
const H = { "content-type": "application/json", "x-business-intake": "2", origin };
const req = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(origin + path, { method, headers: { ...H, cookie }, body: body ? JSON.stringify(body) : undefined });
  return r.json().catch(() => null) as any;
};
let { plan } = await req("POST", "/api/plan/chat", { action: "start", mode: "startup", revision: 0, requestId: randomUUID() });
for (let i = 0; i < 40 && plan.nextQuestion; i++) {
  const q = plan.nextQuestion;
  const value = q.id === "business" ? "동네 꽃집에서 정기 꽃 구독을 파는 사업" : q.kind === "number" ? (q.id === "price" ? 30000 : 10) : q.kind === "single" ? q.options?.[0]?.value : q.kind === "multi" ? [q.options?.[0]?.value] : q.options?.[0]?.value ?? "직장인";
  plan = (await req("POST", "/api/plan/chat", { action: "answer", planId: plan.planId, revision: plan.coach.revision, requestId: randomUUID(), questionId: q.id, value })).plan;
}
console.log("core", plan.coreComplete, "design before open:", !!plan.coach.design, "job:", plan.intake.job?.kind ?? null);
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 900 });
await page.setCookie({ name: "syn_uid", value: "syn-1", url: origin });
await page.goto(`${origin}/plan/chat?planId=${encodeURIComponent(plan.planId)}`, { waitUntil: "networkidle0", timeout: 90000 });
const heading = await page.evaluate(() => document.querySelector("h2")?.textContent);
let after: any;
for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 1000)); after = (await req("GET", `/api/plan/chat?planId=${encodeURIComponent(plan.planId)}`)).plan; if (after.coach.design) break; }
await new Promise(r => setTimeout(r, 1500));
const final = await page.evaluate(() => ({ h2: [...document.querySelectorAll("h2")].map(h => h.textContent).slice(0, 3), buttons: [...document.querySelectorAll("button, a")].map(b => b.textContent?.trim()).filter(t => t && /사업 방향|계획서|사업계획서/.test(t)) }));
await page.screenshot({ path: new URL("./shots/auto-design.png", import.meta.url).pathname });
console.log(JSON.stringify({ headingOnOpen: heading, designAfter: !!after?.coach?.design, job: after?.intake?.job?.status, final }));
await browser.close();
