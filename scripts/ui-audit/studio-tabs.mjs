// 작업실 탭을 PC·휴대폰 너비마다 차례로 눌러 보고(계획서 → 개업 준비 → 유지보수) 상태·넘침·겹침을 적고 스크린샷을 남긴다.
//   node scripts/ui-audit/studio-tabs.mjs [uid planId] [--out 폴더]   — 둘 다 없으면 가짜 AI 로 계획서까지 있는 사업을 만든다
//   WIDTHS=1440,1280,1024,390 로 너비를 바꿀 수 있다
import { args, browser, open, shot, sleep } from "./lib.mjs";
import { probe, overlaps } from "./probe.mjs";
import { makePlan } from "./seed.mjs";
let [uid, planId] = args;
if (!uid || !planId) { const r = await makePlan(uid || "syn-790", "full"); uid = r.uid; planId = r.planId; console.log("seed", uid, planId); }
const widths = (process.env.WIDTHS || "1440,1280,1024,390").split(",").map(Number);
const b = await browser();
for (const W of widths) {
  const p = await open(b, uid, `/plan/studio?planId=${planId}&tab=plan`, { width: W });
  await sleep(5000);
  for (const [name, re] of [["plan", /계획서/], ["launch", /개업 준비/], ["ops", /유지보수/]]) {
    const c = await p.evaluate(re => { const t = [...document.querySelectorAll("[role=tab]")].find(t => new RegExp(re).test(t.innerText) && t.getBoundingClientRect().width > 0); t?.click(); return t?.innerText; }, re.source);
    await sleep(3500);
    const st = await p.evaluate(() => ({ url: location.search, sel: [...document.querySelectorAll("[role=tab][aria-selected=true]")].map(t => t.innerText.replace(/\s+/g, " ")), panels: [...document.querySelectorAll("section[id^=studio-panel-]")].filter(s => s.getBoundingClientRect().width > 0).map(s => { const r = s.getBoundingClientRect(); return s.id + `@${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} sh=${s.scrollHeight}`; }), heads: [...document.querySelectorAll("section[id^=studio-panel-] h1, section[id^=studio-panel-] h2, section[id^=studio-panel-] h3")].filter(h => { const r = h.getBoundingClientRect(); return r.width > 1 && r.top < innerHeight; }).map(h => h.innerText.trim().slice(0, 30)).slice(0, 8) }));
    console.log(W, name, c, JSON.stringify(st));
    console.log("  probe", JSON.stringify(await probe(p)), "overlaps", JSON.stringify(await overlaps(p)));
    console.log("  shot", await shot(p, `T-${W}-${name}`));
  }
  console.log("  errs", JSON.stringify([...p.errors, ...p.consoleErrors, ...p.bad]));
  await p.close();
}
await b.close();
