// 글자 크기 설정(브라우저 기본 글자 크기) 점검 — 심사 뒤 S1(rem 으로 바꾸기)에서 쓴 도구
//   node scripts/ui-audit/d-fontscale.mjs <단계> <너비> [화면,화면] [--out 폴더]
//   shots    기본 글자(16px) 전체 화면 스크린샷 — 바꾸기 전 빌드·바꾼 빌드를 두 포트로 띄워 각각 찍고 픽셀 비교
//            (실행마다 달라지는 곳 — 첫 화면 자동 넘김 그림·공개 홈페이지 미리보기·서버 포트 — 은 가린다)
//   collect  이 화면에 실제로 맞는 'px 글자 크기' 규칙의 선택자 모으기(전역 CSS 중 어느 규칙을 바꿀지 고를 때 → to-rem.mjs --only)
//   font     글자 150·200%(Page.setFontSizes)에서 화면 스크린샷 + sweep(잘림·겹침·가로 스크롤). PCTS=150,200 으로 비율 고르기
//   주의: fullPage 스크린샷은 Page.setFontSizes 를 되돌린다 — font 단계는 보이는 화면만 찍는다.
import fs from "node:fs"; import path from "node:path";
import { args, browser, open, sleep, S, clickText } from "./lib.mjs";
import { makePlan } from "./seed.mjs";
import { sweep } from "./check.mjs";
const [mode, W0, pickArg] = args; const W = +W0;
const pick = pickArg ? pickArg.split(",") : null;
const IDX = { 390: 1, 768: 2, 1440: 3 }[W] ?? 4;
const UID = `syn-71${IDX}`, EMPTY = `syn-72${IDX}`, PART = `syn-73${IDX}`;
const seedFile = path.join(S, `seed-${W}.json`);
let seed = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, "utf8")) : null;
if (!seed) { seed = { plan: (await makePlan(UID, "full")).planId, part: (await makePlan(PART, "partial:3")).planId }; fs.writeFileSync(seedFile, JSON.stringify(seed)); }
const PLAN = seed.plan, PP = seed.part;
const SCREENS = {
  landing: [null, "/"], login: [null, "/account"], signup: [null, "/account?mode=register"],
  "mybiz-empty": [EMPTY, "/plan"], mybiz: [UID, "/plan"],
  chat: [UID, `/plan/studio?planId=${PLAN}&tab=chat`], "chat-q": [PART, `/plan/studio?planId=${PP}&tab=chat`],
  plan: [UID, `/plan/studio?planId=${PLAN}&tab=plan`], homepage: [UID, `/plan/studio?planId=${PLAN}&tab=homepage`],
  launch: [UID, `/plan/studio?planId=${PLAN}&tab=launch`], pay: [UID, `/plan/pay?planId=${PLAN}&product=homepage`],
  "pay-plan": [UID, `/plan/pay?planId=${PLAN}`],
  account: [UID, "/account"], me: [UID, "/plan/me"], support: [UID, "/account/support"], "support-guest": [null, "/account/support"],
  terms: [null, "/terms"], privacy: [null, "/privacy"], refund: [null, "/refund"], "ai-notice": [null, "/ai-notice"], "business-info": [null, "/business-info"],
};
const names = Object.keys(SCREENS).filter(n => !pick || pick.includes(n));
const OUTD = path.join(S, mode); fs.mkdirSync(OUTD, { recursive: true });
const b = await browser();
const settle = async p => {
  await sleep(2500);
  await p.evaluate(() => document.fonts?.ready);
  await p.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}" });
  await sleep(600);
};
const COLLECT = () => {
  const DYN = /:(hover|active|focus-visible|focus-within|focus|visited|target|-webkit-autofill|autofill)(?![\w-])/g;
  const PE = /::?(before|after|placeholder|selection|marker|backdrop|first-line|first-letter|-webkit-[\w-]+|-moz-[\w-]+)(\([^)]*\))?/g;
  const out = new Set(), errs = new Set();
  const walk = rules => { for (const r of rules) {
    if (r.cssRules && !(r instanceof CSSStyleRule)) { walk(r.cssRules); continue; }
    if (!(r instanceof CSSStyleRule)) continue;
    const st = r.style; const fsz = st.getPropertyValue("font-size") + " " + st.getPropertyValue("line-height") + " " + (r.cssText.match(/font:[^;]*/)?.[0] || "");
    if (!/\dpx/.test(fsz)) continue;
    for (const part of r.selectorText.split(/,(?![^(]*\))/)) {
      const s = part.replace(PE, "").replace(DYN, "").trim() || "*";
      try { if (document.querySelector(s)) out.add(part.trim()); } catch { errs.add(part.trim()); }
    }
    if (r.cssRules?.length) walk(r.cssRules);
  } };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch {} }
  return { hit: [...out], errs: [...errs] };
};
const extra = { // 열어 둘 창·메뉴(맞는 규칙을 더 모으려고)
  landing: async p => { await clickText(p, /메뉴|^고객센터$/); await sleep(800); },
  support: async p => { await clickText(p, /문의|상담/); await sleep(800); },
};
for (const n of names) {
  const [uid, url] = SCREENS[n];
  const p = await open(b, uid, url, { width: W });
  try {
    await settle(p);
    if (mode === "shots") {
      // 실행마다 달라지는 곳(첫 화면 자동 넘김 휴대폰 그림·공개 홈페이지 디자인 미리보기·서버 포트)은 가린다 — 두 빌드 모두 같은 방법
      await p.evaluate(() => {
        const st = document.createElement("style");
        st.textContent = '[class*="iphone-mockup-module"], [class*="brainwave-business"], [class*="bw-"], .bwmob, video { visibility: hidden !important; }';
        document.head.append(st);
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n; (n = w.nextNode());) if (/127\.0\.0\.1:\d+/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:PORT");
      });
      await sleep(400);
      await p.screenshot({ path: path.join(OUTD, `${n}-${W}.png`), fullPage: true });
    } else if (mode === "collect") {
      const all = { hit: new Set(), errs: new Set() };
      const add = r => { r.hit.forEach(x => all.hit.add(x)); r.errs.forEach(x => all.errs.add(x)); };
      add(await p.evaluate(COLLECT));
      if (extra[n]) { await extra[n](p); add(await p.evaluate(COLLECT)); }
      // 계정 메뉴·서랍 열기(있으면)
      if (await clickText(p, /^메뉴$|메뉴 열기|전체 메뉴/)) { await sleep(800); add(await p.evaluate(COLLECT)); await p.keyboard.press("Escape"); }
      fs.writeFileSync(path.join(OUTD, `${n}-${W}.json`), JSON.stringify({ hit: [...all.hit], errs: [...all.errs] }, null, 1));
      console.log(n, W, all.hit.size, "errs", all.errs.size);
    } else if (mode === "font") {
      const cdp = await p.createCDPSession();
      for (const pct of (process.env.PCTS || "150,200").split(",").map(Number)) {
        await cdp.send("Page.setFontSizes", { fontSizes: { standard: 16 * pct / 100, fixed: Math.round(13 * pct / 100) } });
        await sleep(1200);
        const m = await p.evaluate(() => ({ root: getComputedStyle(document.documentElement).fontSize, hscroll: document.documentElement.scrollWidth - innerWidth }));
        await p.screenshot({ path: path.join(OUTD, `${n}-${W}-f${pct}.png`) }); // fullPage 은 글자 크기 설정을 되돌린다
        const recs = await sweep(p, { screen: `f${pct}-${n}`, width: W, maxSteps: 10, bottom: false });
        const ovf = recs.filter(x => x.type === 7).flatMap(x => x.items.map(i => `${i.label} ${i.detail || ""} [${i.cls || ""}]`));
        fs.appendFileSync(path.join(S, "font.jsonl"), JSON.stringify({ n, W, pct, ...m, ovf }) + "\n");
        console.log(`[${n} ${W} ${pct}%] root=${m.root} hscroll=${m.hscroll} ovf=${ovf.length}`);
        await p.evaluate(() => window.scrollTo(0, 0));
      }
    }
  } catch (e) { console.log("!!", n, W, String(e.message).slice(0, 200)); }
  await p.browserContext().close();
}
await b.close();
