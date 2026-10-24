// 로그인한 사용자 화면 훑기 — 내 사업(빈·있음)·서랍·계정·고객센터·문의·없는 사업·결제·결제 결과·오류
//   node scripts/ui-audit/d-user.mjs [너비=390] [단계,단계] [--out 폴더]
//   (단계: mybiz-empty,mybiz-items,account,support,support-page,inquiries,inquiries-full,missing,deleted,pay,payres,error)
import { args, browser, open, runner, sleep, clickText } from "./lib.mjs";
import { makePlan } from "./seed.mjs";
import { sweep, withKeyboard } from "./check.mjs";
const W = +(args[0] || 390);
const only = args[1];
const IDX = { 360: 0, 390: 1, 430: 2 }[W] ?? 3;
const EMPTY = process.env.EMPTY_UID || `syn-72${IDX}`;           // 빈 계정
// 계획서까지 있는 사업 — FULL_UID·FULL_PLAN 을 주지 않으면 가짜 AI 로 하나 만든다(0원)
const FULL = process.env.FULL_UID || `syn-71${IDX}`;
const FULLPLAN = process.env.FULL_PLAN || (only && !/mybiz-items|inquiries-full|pay|payres/.test(only) ? null : (await makePlan(FULL, "full")).planId);
console.log("full plan", FULL, FULLPLAN);
const b = await browser();
const run = runner(only);
const go = async (uid, path, wait = 3000) => { const p = await open(b, uid, path, { width: W }); await sleep(wait); return p; };
await run("mybiz-empty", async () => {
  const p = await go(EMPTY, "/plan");
  console.log("mybiz-empty url", p.url());
  await sweep(p, { screen: "mybiz-empty", width: W });
  // 메뉴(서랍)
  const ok = await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find(b => /메뉴 열기|메뉴/.test(b.getAttribute("aria-label") || "") && b.getBoundingClientRect().width > 0); b?.click(); return !!b; });
  await sleep(900); if (ok) await sweep(p, { screen: "drawer", width: W, maxSteps: 2, bottom: false, root: "#app-drawer" });
  await p.close();
});
await run("mybiz-items", async () => { const p = await go(FULL, "/plan"); await sweep(p, { screen: "mybiz-items", width: W }); await p.close(); });
await run("account", async () => { const p = await go(EMPTY, "/account"); await sweep(p, { screen: "account", width: W, maxSteps: 6 }); await p.close(); });
await run("support", async () => {
  const p = await go(EMPTY, "/plan");
  const ok = await p.evaluate(() => { const b = document.querySelector('[aria-label="고객센터 열기"]'); b?.click(); return !!b; });
  await sleep(1500); if (!ok) { console.log("no support fab"); await p.close(); return; }
  const SR = await p.evaluate(() => { const fab = document.querySelector('[aria-label="고객센터 열기"]'); const d = document.querySelector(".support-chat-panel") || [...document.querySelectorAll("[role=dialog]")].find(e => e.getBoundingClientRect().width > 0); if (!d) return null; d.dataset.swRoot = "support"; return '[data-sw-root="support"]'; });
  console.log("support root", SR);
  await sweep(p, { screen: "support-home", width: W, maxSteps: 3, bottom: true, root: SR });
  const tabs = await p.evaluate(() => { const d = document.querySelector(".support-chat-panel, [role=dialog]"); return [...(d || document).querySelectorAll("button, [role=tab]")].map(b => (b.innerText || b.getAttribute("aria-label") || "").trim()).filter(Boolean); });
  console.log("support tabs", JSON.stringify(tabs));
  for (const [name, re] of [["support-inquiry", /^문의/], ["support-settings", /^설정/]]) {
    const c = await p.evaluate(src => { const re = new RegExp(src); const d = document.querySelector(".support-chat-panel, [role=dialog]") || document; const b = [...d.querySelectorAll("button, [role=tab]")].find(b => re.test((b.innerText || b.getAttribute("aria-label") || "").trim()) && b.getBoundingClientRect().width > 0); b?.click(); return b?.innerText; }, re.source);
    await sleep(1200); console.log(name, "clicked", c);
    if (c != null) {
      await sweep(p, { screen: name, width: W, maxSteps: 3, root: SR });
      if (name === "support-inquiry") { const sel = `${SR} textarea`; if (await p.$(sel)) await withKeyboard(p, sel, () => sweep(p, { screen: "support-inquiry-kb", width: W, maxSteps: 2, bottom: false, root: SR })); }
    }
  }
  await p.close();
});
await run("support-page", async () => { const p = await go(EMPTY, "/account/support"); await sweep(p, { screen: "support-page", width: W, maxSteps: 6 }); await p.close(); });
await run("inquiries", async () => { const p = await go(EMPTY, "/plan/inquiries"); console.log("inq url", p.url()); await sweep(p, { screen: "inquiries-empty", width: W }); await p.close(); });
await run("inquiries-full", async () => { const p = await go(FULL, `/plan/inquiries?planId=${FULLPLAN}`); await sweep(p, { screen: "inquiries-plan", width: W }); await p.close(); });
await run("missing", async () => { const p = await go(EMPTY, "/plan/studio?planId=nope", 5000); await sweep(p, { screen: "missing", width: W }); await p.close(); });
await run("deleted", async () => {
  // 지운 사업 화면 — DELETED_UID·DELETED_PLAN(지운 사업 번호)을 줄 때만
  const uid = process.env.DELETED_UID, planId = process.env.DELETED_PLAN;
  if (!uid || !planId) { console.log("deleted: DELETED_UID·DELETED_PLAN 이 없어 건너뜀"); return; }
  const p = await go(uid, `/plan/studio?planId=${planId}`, 5000); await sweep(p, { screen: "deleted", width: W }); await p.close();
});
await run("pay", async () => {
  for (const [name, q] of [["pay-plan", ""], ["pay-homepage", "&product=homepage"], ["pay-regen", "&product=regen"], ["pay-tokens", "&product=tokens"], ["pay-bundle", "&product=bundle"], ["pay-domain", "&product=domain"], ["pay-domainbuy", "&product=domain-purchase&domain=hankki-test.com"]]) {
    const p = await go(FULL, `/plan/pay?planId=${FULLPLAN}${q}`, 4000);
    await sweep(p, { screen: name, width: W, maxSteps: 8 }); await p.close();
  }
  const p = await go(EMPTY, `/plan/pay`, 4000); await sweep(p, { screen: "pay-noplan", width: W }); await p.close();
});
await run("payres", async () => {
  for (const st of ["ok", "pending", "fail"]) {
    const p = await go(FULL, `/plan/pay/result?status=${st}&planId=${FULLPLAN}&orderId=test-order-1&reason=${st === "fail" ? "USER_CANCEL" : ""}`, 4000);
    await sweep(p, { screen: `payres-${st}`, width: W }); await p.close();
  }
});
await run("error", async () => {
  for (const [name, path] of [["err-workspace", "/plan/workspace?planId=nope"], ["err-proposal", "/plan/proposal?planId=nope"]]) {
    const p = await go(EMPTY, path, 4000);
    const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 120));
    console.log(name, p.url().replace(/^.*?:\d+/, ""), "|", t);
    await sweep(p, { screen: name, width: W }); await p.close();
  }
});
await b.close();
