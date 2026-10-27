// 글자 크기 설정(브라우저 기본 글자 크기) 점검 — 심사 뒤 S1(rem 으로 바꾸기)에서 쓴 도구
//   node scripts/ui-audit/d-fontscale.mjs <단계> <너비> [화면,화면] [--out 폴더]
//   shots    기본 글자(16px) 전체 화면 스크린샷 — 바꾸기 전 빌드·바꾼 빌드를 두 포트로 띄워 각각 찍고 픽셀 비교
//            (실행마다 달라지는 곳 — 첫 화면 자동 넘김 그림·공개 홈페이지 미리보기·서버 포트 — 은 가린다)
//   collect  이 화면에 실제로 맞는 'px 글자 크기' 규칙의 선택자 모으기(전역 CSS 중 어느 규칙을 바꿀지 고를 때 → to-rem.mjs --only)
//   font     글자 150·200%(Page.setFontSizes)에서 화면 스크린샷 + sweep(잘림·겹침·가로 스크롤). PCTS=150,200 으로 비율 고르기
//            STATES=1 이면 창·메뉴(aria-haspopup·aria-expanded)를 하나씩 열어 보고, API 오류(500) 상태로도 한 번 더 연다(S4)
//   주의: fullPage 스크린샷은 Page.setFontSizes 를 되돌린다 — font 단계는 보이는 화면만 찍는다.
import fs from "node:fs"; import path from "node:path";
import { args, browser, open, sleep, O, S, clickText } from "./lib.mjs";
import { makePlan } from "./seed.mjs";
import { sweep } from "./check.mjs";
const [mode, W0, pickArg] = args; const W = +W0;
const pick = pickArg ? pickArg.split(",") : null;
const IDX = { 390: 1, 768: 2, 1440: 3 }[W] ?? 4;
const UID = `syn-71${IDX}`, EMPTY = `syn-72${IDX}`, PART = `syn-73${IDX}`;
const HP_UID = "syn-1"; // 홈페이지 편집기를 열 수 있는 합성 계정(HOMEPAGE_EDITOR_PREVIEW_EMAILS)
const seedFile = path.join(S, `seed-${W}.json`);
let seed = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, "utf8")) : null;
if (!seed) { seed = { plan: (await makePlan(UID, "full")).planId, part: (await makePlan(PART, "partial:3")).planId }; fs.writeFileSync(seedFile, JSON.stringify(seed)); }
if (!seed.hp) { seed.hp = (await makePlan(HP_UID, "full")).planId; fs.writeFileSync(seedFile, JSON.stringify(seed)); }
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
  // S4 — 손님 문의·사업 정보·예전 계획서 화면
  inquiries: [UID, "/plan/inquiries"], info: [UID, `/plan/info?planId=${PLAN}`], proposal: [UID, `/plan/proposal?planId=${PLAN}`],
  document: [UID, `/plan/document?planId=${PLAN}`], evidence: [UID, `/dev/mr?planId=${PLAN}`],
  "homepage-edit": [HP_UID, `/plan/studio?planId=${seed.hp}&tab=homepage`],
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
/* 로그인(쿠키)만 먼저 하고, 화면 안에서 부르는 API(fetch·xhr)를 500 으로 — 오류 상태의 규칙을 모으려고 */
const openFailing = async (uid, url) => {
  const p = await open(b, uid, "/robots.txt", { width: W });
  await p.setRequestInterception(true);
  p.on("request", r => { const t = r.resourceType(); if ((t === "fetch" || t === "xhr") && r.url().includes("/api/") && !r.url().includes("/api/dev/")) r.respond({ status: 500, contentType: "application/json", body: '{"error":"x"}' }); else r.continue(); });
  await p.goto(O + url, { waitUntil: "load", timeout: 180000 });
  return p;
};
/* 창·메뉴를 하나씩 열어 보며 모은다(닫기: Escape, 안 닫히면 다시 연다) */
const openEach = async (p, add, uid, url) => {
  const count = await p.evaluate(() => document.querySelectorAll("[aria-haspopup]:not([disabled]), [aria-expanded=false]:not([disabled])").length);
  for (let i = 0; i < Math.min(count, 12); i++) {
    const ok = await p.evaluate(i => { const e = [...document.querySelectorAll("[aria-haspopup]:not([disabled]), [aria-expanded=false]:not([disabled])")][i]; if (!e || !e.getBoundingClientRect().width) return false; e.click(); return true; }, i).catch(() => false);
    if (!ok) continue;
    await sleep(700); add(await p.evaluate(COLLECT).catch(() => ({ hit: [], errs: [] })));
    await p.keyboard.press("Escape"); await sleep(300);
    if (!p.url().startsWith(O + url.split("?")[0])) { await p.goto(O + url, { waitUntil: "load" }).catch(() => {}); await sleep(2000); }
  }
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
      if (process.env.STATES) { // API 오류 상태도 한 장
        const f = await openFailing(uid, url);
        try { await settle(f); await f.screenshot({ path: path.join(OUTD, `${n}-${W}-error.png`), fullPage: true }); } catch (e) { console.log("!! error-state", n, String(e.message).slice(0, 120)); }
        await f.browserContext().close();
      }
    } else if (mode === "collect") {
      const all = { hit: new Set(), errs: new Set() };
      const add = r => { r.hit.forEach(x => all.hit.add(x)); r.errs.forEach(x => all.errs.add(x)); };
      add(await p.evaluate(COLLECT));
      if (extra[n]) { await extra[n](p); add(await p.evaluate(COLLECT)); }
      // 계정 메뉴·서랍 열기(있으면)
      if (await clickText(p, /^메뉴$|메뉴 열기|전체 메뉴/)) { await sleep(800); add(await p.evaluate(COLLECT)); await p.keyboard.press("Escape"); }
      if (process.env.STATES) {
        await openEach(p, add, uid, url);
        const f = await openFailing(uid, url);
        try { await settle(f); add(await f.evaluate(COLLECT)); } catch (e) { console.log("!! error-state", n, String(e.message).slice(0, 120)); }
        await f.browserContext().close();
      }
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
