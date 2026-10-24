// 사업 작업실(/plan/studio) 훑기 — 새 대화·업종 검색·질문·마지막 질문·사업 방향·생성 중·계획서 탭(목차·요약·고치기)·홈페이지·개업·유지보수·서랍
//   node scripts/ui-audit/d-studio.mjs [너비=390] [단계,단계] [--out 폴더]
//   (단계: chat-new,chat-last,chat-design,gen,plan,tabs) — 필요한 합성 사업은 seed.mjs 로 그때 만든다
import { args, browser, open, runner, sleep, clickText, O } from "./lib.mjs";
import { makePlan } from "./seed.mjs";
import { sweep, withKeyboard } from "./check.mjs";
const W = +(args[0] || 390);
const only = args[1];
const IDX = { 360: 0, 390: 1, 430: 2 }[W] ?? 3;
// 점검용 사업은 가짜 AI 로 그때그때 만든다(0원). 필요한 단계에서만 만든다.
const wants = name => !only || only.split(",").includes(name);
const seeded = async (uid, stage) => { const r = await makePlan(uid, stage); console.log("seed", stage, uid, r.planId); return [uid, r.planId]; };
const [FULL, FULLPLAN] = wants("plan") || wants("tabs") ? await seeded(`syn-75${IDX}`, "full") : [null, null];
const GEN = wants("gen") ? await seeded(`syn-76${IDX}`, "designed") : null;
const LAST = wants("chat-last") ? await seeded(`syn-77${IDX}`, "partial:1") : null;
const DESIGNED = wants("chat-design") ? await seeded(`syn-78${IDX}`, "designed") : null;
const b = await browser();
const run = runner(only);
const go = async (uid, path, wait = 4500) => { const p = await open(b, uid, path, { width: W }); await sleep(wait); return p; };
const tab = (p, re) => p.evaluate(src => { const t = [...document.querySelectorAll("[role=tab]")].find(t => new RegExp(src).test(t.innerText) && t.getBoundingClientRect().width > 0); t?.click(); return !!t; }, re.source);
await run("chat-new", async () => {
  const uid = `syn-73${IDX}`;
  const p = await go(uid, "/plan/studio?new=1", 3500);
  await sweep(p, { screen: "chat-start", width: W });
  await withKeyboard(p, "textarea", () => sweep(p, { screen: "chat-start-kb", width: W, maxSteps: 1, bottom: false }));
  await clickText(p, /생각한 사업이 있어요/); await sleep(4500);
  await sweep(p, { screen: "chat-industry", width: W });
  const ta = await p.$("textarea"); await ta.tap(); await p.keyboard.type("도시락"); await sleep(3500);
  await sweep(p, { screen: "chat-industry-search", width: W, maxSteps: 2 });
  await clickText(p, /^추천/); await sleep(6000);
  await sweep(p, { screen: "chat-q-business", width: W });
  await withKeyboard(p, "textarea", () => sweep(p, { screen: "chat-q-business-kb", width: W, maxSteps: 1, bottom: false }));
  // 보기 하나 눌러 보내기 → 다중 선택 질문
  await p.evaluate(() => { const sc = document.querySelector("#studio-panel-chat") || document.querySelector("main"); const c = [...sc.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0).find(b => /반찬·도시락/.test(b.innerText)); c?.click(); });
  await sleep(600); await p.evaluate(() => document.querySelector('button[aria-label="보내기"]')?.click()); await sleep(6500);
  await sweep(p, { screen: "chat-q-multi", width: W });
  await p.close();
});
await run("chat-last", async () => {
  const p = await go(LAST[0], `/plan/studio?planId=${LAST[1]}`);
  await sweep(p, { screen: "chat-q-confirm", width: W });
  await p.close();
});
await run("chat-design", async () => {
  const p = await go(DESIGNED[0], `/plan/studio?planId=${DESIGNED[1]}`, 5000);
  await sweep(p, { screen: "chat-design", width: W, maxSteps: 12 });
  const c = await clickText(p, /직접 수정하기/); await sleep(1500); console.log("name edit", c);
  if (c) { await sweep(p, { screen: "chat-name", width: W, maxSteps: 4 }); const sel = "#studio-panel-chat input[type=text], #studio-panel-chat input:not([type]), main input[type=text]"; if (await p.$(sel)) await withKeyboard(p, sel, () => sweep(p, { screen: "chat-name-kb", width: W, maxSteps: 1, bottom: false })); }
  await p.close();
});
await run("gen", async () => {
  const [uid, planId] = GEN;
  const p = await go(uid, `/plan/studio?planId=${planId}`, 4000);
  const xff = p.ip;
  await p.setRequestInterception(true);
  p.on("request", async r => {
    if (r.isInterceptResolutionHandled()) return;
    if (r.method() === "POST" && r.url().endsWith("/api/plan/chat") && (r.postData() || "").includes('"action":"prepare"')) {
      const hdr = { "content-type": "application/json", cookie: `syn_uid=${uid}`, "x-forwarded-for": xff, origin: O, "x-business-intake": "2" };
      void fetch(O + `/api/dev/synthetic-generate?delayMs=2500`, { method: "POST", headers: hdr, body: JSON.stringify({ planId }) });
      await sleep(900);
      const snap = await (await fetch(O + `/api/plan/chat?planId=${planId}`, { headers: hdr })).json();
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ...snap, started: true }) });
    }
    r.continue();
  });
  const c = await clickText(p, /사업계획서 만들기/); console.log("gen click", c);
  await sleep(4000);
  await sweep(p, { screen: "gen-chat", width: W, maxSteps: 6 });
  await tab(p, /계획서/); await sleep(2000);
  await sweep(p, { screen: "gen-plan", width: W, maxSteps: 6 });
  await p.close();
});
await run("plan", async () => {
  const p = await go(FULL, `/plan/studio?planId=${FULLPLAN}&tab=plan`, 5000);
  await tab(p, /계획서/); await sleep(2500);
  await sweep(p, { screen: "plan-tab", width: W, maxSteps: 14 });
  // 목차
  const toc = await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find(b => /목차/.test((b.getAttribute("aria-label") || "") + b.innerText) && b.getBoundingClientRect().width > 0); b?.click(); return b ? (b.innerText || b.getAttribute("aria-label")) : null; });
  await sleep(1200); console.log("toc", toc);
  if (toc) { const TR = await p.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog], [aria-modal=true]")].find(e => e.getBoundingClientRect().width > 0); if (!d) return null; d.dataset.swRoot = "toc"; return '[data-sw-root="toc"]'; }); await sweep(p, { screen: "plan-toc", width: W, maxSteps: 3, bottom: false, root: TR }); await p.keyboard.press("Escape"); await sleep(600); await p.evaluate(() => [...document.querySelectorAll("button")].find(b => /닫기/.test(b.getAttribute("aria-label") || "") && b.getBoundingClientRect().width > 0)?.click()); await sleep(600); }
  // 한 장 요약
  const s = await p.evaluate(() => { const b = [...document.querySelectorAll("button, [role=tab], [role=radio], a")].find(b => b.innerText.trim() === "한 장 요약" && b.getBoundingClientRect().width > 0); b?.click(); return !!b; });
  await sleep(2500); console.log("summary", s);
  if (s) { await sweep(p, { screen: "plan-summary", width: W, maxSteps: 8 }); await p.evaluate(() => [...document.querySelectorAll("button, [role=tab], [role=radio], a")].find(b => /^(전체|계획서|본문)/.test(b.innerText.trim()) && b.getBoundingClientRect().width > 0)?.click()); await sleep(1500); }
  await p.close();
  // 직접 고치기
  const q = await go(FULL, `/plan/studio?planId=${FULLPLAN}&tab=plan`, 5000); await tab(q, /계획서/); await sleep(2500);
  const e = await q.evaluate(() => { const b = [...document.querySelectorAll("#studio-panel-plan button, #studio-panel-plan a")].find(b => /직접 고치기|직접 수정/.test((b.innerText || "") + (b.getAttribute("aria-label") || "")) && b.getBoundingClientRect().width > 0); b?.click(); return b ? (b.innerText || b.getAttribute("aria-label")).trim() : null; });
  await sleep(2500); console.log("direct edit", e);
  if (e) { await sweep(q, { screen: "plan-edit", width: W, maxSteps: 6 }); const sel = "#studio-panel-plan textarea, #studio-panel-plan [contenteditable=true]"; if (await q.$(sel)) await withKeyboard(q, sel, () => sweep(q, { screen: "plan-edit-kb", width: W, maxSteps: 1, bottom: false })); }
  await q.close();
  // 대화로 고치기
  const r = await go(FULL, `/plan/studio?planId=${FULLPLAN}&tab=plan`, 5000); await tab(r, /계획서/); await sleep(2500);
  const c = await r.evaluate(() => { const b = [...document.querySelectorAll("#studio-panel-plan button")].find(b => /대화로 고치기/.test((b.innerText || "") + (b.getAttribute("aria-label") || "")) && b.getBoundingClientRect().width > 0); b?.click(); return !!b; });
  await sleep(2000); console.log("chatfix", c);
  if (c) { await sweep(r, { screen: "plan-chatfix", width: W, maxSteps: 3 }); await withKeyboard(r, "textarea", () => sweep(r, { screen: "plan-chatfix-kb", width: W, maxSteps: 1, bottom: false })); }
  await r.close();
});
await run("tabs", async () => {
  const p = await go(FULL, `/plan/studio?planId=${FULLPLAN}`, 5000);
  await sweep(p, { screen: "studio-chat-done", width: W, maxSteps: 8 });
  for (const [name, re] of [["hp-unpaid", /홈페이지/], ["launch", /개업/]]) {
    const ok = await tab(p, re); await sleep(3500); if (!ok) { console.log("no tab", name); continue; }
    await sweep(p, { screen: name, width: W, maxSteps: 10 });
  }
  const ops = await clickText(p, /^(운영|유지보수|운영 관리)$/, "button, [role=tab], a, [role=radio]"); await sleep(3000); console.log("ops", ops);
  if (ops) await sweep(p, { screen: "ops", width: W, maxSteps: 10 });
  // 서랍
  const d = await p.evaluate(() => { const b = [...document.querySelectorAll("header button")].find(b => /메뉴/.test(b.getAttribute("aria-label") || "")); b?.click(); return !!b; });
  await sleep(1000); if (d) await sweep(p, { screen: "studio-drawer", width: W, maxSteps: 2, bottom: false, root: "#app-drawer" });
  await p.close();
  const q = await go(FULL, `/plan/studio?planId=${FULLPLAN}&tab=operations`, 5000);
  await sweep(q, { screen: "ops-direct", width: W, maxSteps: 10 }); await q.close();
});
await b.close();
