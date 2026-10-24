// 홈페이지 화면 훑기 — 작업실 홈페이지 탭·편집기·공개 홈페이지·문의 폼·없는 홈페이지
//   node scripts/ui-audit/d-hp.mjs [너비=390] [단계|all] <planId> [--out 폴더]   (단계: hp-paid,public · 공개 주소는 SLUG 로 줄 수도 있다)
//   HP_UID 그 사업의 합성 계정(기본 syn-1). 홈페이지가 있는 사업이 먼저 있어야 한다.
import { args, browser, open, runner, sleep, clickText } from "./lib.mjs";
import { sweep, withKeyboard } from "./check.mjs";
const W = +(args[0] || 390);
const only = args[1] === "all" ? undefined : args[1];
const PLAN = args[2] || process.env.HP_PLAN;
const HP_UID = process.env.HP_UID || "syn-1";
if (!PLAN) { console.error("홈페이지가 있는 사업 번호가 필요합니다: node scripts/ui-audit/d-hp.mjs <너비> <단계|all> <planId>  (HP_UID=그 사업의 합성 계정, 기본 syn-1)"); process.exit(2); }
const b = await browser();
const run = runner(only);
const go = async (uid, path, wait = 5000) => { const p = await open(b, uid, path, { width: W }); await sleep(wait); return p; };
let slug = process.env.SLUG || null;
await run("hp-paid", async () => {
  const p = await go(HP_UID, `/plan/studio?planId=${PLAN}&tab=homepage`, 7000);
  await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find(t => t.innerText.includes("홈페이지"))?.click()); await sleep(3000);
  const getSlug = () => p.evaluate(() => { const a = [...document.querySelectorAll("a[href*='/launch/']")].map(a => a.getAttribute("href"))[0]; return a ? a.split("/launch/")[1].split(/[?#]/)[0] : null; });
  slug = await getSlug();
  if (!slug && W === 360) {
    await p.evaluate(() => [...document.querySelectorAll("#studio-panel-homepage button")].find(b => b.innerText.trim() === "공개하기")?.click()); await sleep(2500);
    console.log("publish dialog", await p.evaluate(() => (document.querySelector("[role=dialog], [role=alertdialog]")?.innerText || "").replace(/\s+/g, " ").slice(0, 300)));
    await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button, [role=alertdialog] button")].find(b => /그래도 공개|공개하기|공개/.test(b.innerText.trim()))?.click()); await sleep(6000);
    slug = await getSlug(); console.log("published slug", slug);
  }
  console.log("slug", slug, "btns", JSON.stringify(await p.evaluate(() => [...document.querySelectorAll("#studio-panel-homepage button, #studio-panel-homepage a")].filter(e => e.getBoundingClientRect().width > 0).map(e => (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 20)).slice(0, 30))));
  await sweep(p, { screen: "hp-paid", width: W, maxSteps: 10 });
  const e = await clickText(p, /^(고치기|편집|수정하기|직접 고치기|홈페이지 고치기|편집하기)/); await sleep(3500); console.log("editor", e, p.url());
  if (e) await sweep(p, { screen: "hp-editor", width: W, maxSteps: 8 });
  await p.close();
});
await run("public", async () => {
  if (!slug) { const p = await go(HP_UID, `/plan/studio?planId=${PLAN}&tab=homepage`, 7000); slug = await p.evaluate(() => { const a = [...document.querySelectorAll("a[href*='/launch/']")].map(a => a.getAttribute("href"))[0]; return a ? a.split("/launch/")[1].split(/[?#]/)[0] : null; }); await p.close(); }
  console.log("public slug", slug); if (!slug) return;
  const p = await go(null, `/launch/${slug}`, 3000);
  await sweep(p, { screen: "public-hp", width: W, maxSteps: 16 });
  // 문의 폼 오류
  const f = await p.evaluate(() => { const form = [...document.querySelectorAll("form")].find(f => f.querySelector("textarea, input")); if (!form) return null; form.scrollIntoView({ block: "start" }); const b = form.querySelector("button[type=submit], button"); b?.click(); return b?.innerText; });
  await sleep(1200); console.log("form submit", f);
  if (f != null) { await sweep(p, { screen: "public-hp-formerr", width: W, maxSteps: 1, bottom: false }); const sel = "form textarea, form input[type=text], form input"; await withKeyboard(p, sel, () => sweep(p, { screen: "public-hp-form-kb", width: W, maxSteps: 1, bottom: false })); }
  await p.close();
  const q = await go(null, `/launch/no-such-site-xyz`, 3000); await sweep(q, { screen: "public-hp-missing", width: W }); await q.close();
});
await b.close();
