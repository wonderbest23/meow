// 상태가 다른 화면 훑기 — 불러오는 중(느린 3G)·API 오류(500·시간 초과·끊김)·긴 값·키보드·화면 읽기 이름·글자 200%
//   node scripts/ui-audit/d-states.mjs [너비=390] [단계,단계] [화면,화면] [--out 폴더]
//   단계: slow,error,actions,long,keys,names,font   화면: landing,login,signup,mybiz,mybiz-empty,chat,plan,homepage,launch,pay,account,support
// 결과: <OUT>/states/<화면>-<너비>-<단계>*.png 와 <OUT>/states.jsonl(한 줄에 화면·단계 하나). 빨간 테두리 검사(잘림·겹침)는 check.mjs 의 sweep 을 그대로 쓴다.
// 필요한 사업은 seed.mjs 로 그때 만든다(가짜 AI, 0원). 이미 있으면 STATES_UID·STATES_PLAN 으로 넘긴다.
import fs from "node:fs";
import path from "node:path";
import { PredefinedNetworkConditions } from "puppeteer-core";
import { args, browser, open, runner, sleep, O, S } from "./lib.mjs";
import { makePlan } from "./seed.mjs";
import { sweep } from "./check.mjs";

const W = +(args[0] || 390);
const only = args[1];
const pick = args[2] ? args[2].split(",") : null;
const IDX = { 390: 1, 768: 2, 1440: 3 }[W] ?? 4;
const UID = process.env.STATES_UID || `syn-81${IDX}`;
const EMPTY = `syn-82${IDX}`;
const PLAN = process.env.STATES_PLAN || (await makePlan(UID, "full")).planId;
const OUTD = path.join(S, "states");
fs.mkdirSync(OUTD, { recursive: true });
const log = rec => fs.appendFileSync(path.join(S, "states.jsonl"), JSON.stringify({ width: W, ...rec }) + "\n");

const SCREENS = {
  landing: [null, "/"],
  login: [null, "/account"],
  signup: [null, "/account?mode=register"],
  "mybiz-empty": [EMPTY, "/plan"],
  mybiz: [UID, "/plan"],
  chat: [UID, `/plan/studio?planId=${PLAN}&tab=chat`],
  plan: [UID, `/plan/studio?planId=${PLAN}&tab=plan`],
  homepage: [UID, `/plan/studio?planId=${PLAN}&tab=homepage`],
  launch: [UID, `/plan/studio?planId=${PLAN}&tab=launch`],
  pay: [UID, `/plan/pay?planId=${PLAN}&product=homepage`],
  account: [UID, "/account"],
  support: [UID, "/account/support"],
};
const names = Object.keys(SCREENS).filter(n => !pick || pick.includes(n));

const b = await browser();
const run = runner(only);
/* 로그인만 먼저 해 두고(쿠키) 실제 화면은 따로 연다 — 느린 네트워크·가로채기를 화면을 열기 전에 걸 수 있게 */
const blank = async uid => { const p = await open(b, uid, "/robots.txt", { width: W }); return p; };
const pageText = p => p.evaluate(() => (document.body?.innerText || "").replace(/\s+/g, " ").trim());
/* 사용자에게 보이면 안 되는 영어·기술 문구 */
const TECH = /\b(error|failed|fetch|undefined|null|NaN|exception|stack|TypeError|SyntaxError|JSON|Unexpected token|Internal Server|timeout|timed out|network|status \d{3}|HTTP|500|502|503|504|ERR_[A-Z_]+|Application error|client-side exception|digest)\b/i;
const techHits = t => { const m = t.match(new RegExp(TECH.source, "gi")) || []; return [...new Set(m)].slice(0, 6); };

/* 1) 불러오는 중 — 느린 3G 로 열며 0.5·1.5·3·6·12초마다 찍고, 레이아웃 밀림(CLS)과 빈 화면 시간을 잰다 */
await run("slow", async () => {
  for (const n of names) {
    const [uid, url] = SCREENS[n];
    const p = await blank(uid);
    await p.evaluateOnNewDocument(() => {
      window.__cls = 0; window.__shifts = [];
      try {
        new PerformanceObserver(l => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue; window.__cls += e.value; if (e.value > 0.01) window.__shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(3), who: (e.sources || []).map(s => s.node ? (s.node.className?.baseVal ?? s.node.className ?? s.node.nodeName).toString().slice(0, 50) : "?").slice(0, 3) }); } }).observe({ type: "layout-shift", buffered: true });
      } catch {}
    });
    await p.emulateNetworkConditions(PredefinedNetworkConditions["Slow 3G"]);
    const t0 = Date.now();
    const nav = p.goto(O + url, { waitUntil: "load", timeout: 120000 }).catch(e => e);
    const frames = [];
    for (const at of [500, 1500, 3000, 6000, 12000, 20000]) {
      await sleep(Math.max(0, at - (Date.now() - t0)));
      const t = await pageText(p).catch(() => "");
      const f = path.join(OUTD, `${n}-${W}-slow-${String(at).padStart(5, "0")}.png`);
      await p.screenshot({ path: f }).catch(() => {});
      frames.push({ at, chars: t.length, text: t.slice(0, 80) });
    }
    await nav;
    await p.emulateNetworkConditions(null);
    await sleep(2500);
    const end = await p.evaluate(() => ({ cls: +window.__cls.toFixed(3), shifts: window.__shifts.slice(0, 8) })).catch(() => ({}));
    const r = { screen: n, step: "slow", frames, ...end, loadMs: Date.now() - t0, errors: [...p.errors].slice(0, 5) };
    console.log(`[slow ${n} ${W}] cls=${end.cls} frames=${frames.map(f => `${f.at}:${f.chars}`).join(" ")}`);
    log(r);
    await p.close();
  }
});

/* 2) 오류 — 이 화면이 부르는 /api/* 를 500·시간 초과·끊김으로 바꿔 열고, 안내·다시 시도·영어 문구를 본다 */
await run("error", async () => {
  for (const n of names) {
    const [uid, url] = SCREENS[n];
    // 500(HTML 본문)·500json(JSON 오류 본문)·timeout·offline 은 바로 실패, hang 은 답을 주지 않고 25초 기다린다(ERR_MODES 로 고른다)
    for (const mode of (process.env.ERR_MODES || "500,500json,timeout,offline").split(",")) {
      const p = await blank(uid);
      await p.setRequestInterception(true);
      const hit = [];
      p.on("request", r => {
        if (r.isInterceptResolutionHandled()) return;
        const u = r.url();
        if (u.startsWith(O + "/api/") && !u.includes("/api/dev/") && !u.includes("/api/funnel")) {
          hit.push(r.method() + " " + u.replace(O, "").split("?")[0]);
          if (mode === "500") return r.respond({ status: 500, contentType: "text/html", body: "<html><body>Internal Server Error</body></html>" });
          if (mode === "500json") return r.respond({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal_error" }) });
          if (mode === "hang") return; // 답하지 않는다 — 화면이 스스로 시간 초과를 알리는지 본다
          return r.abort(mode === "timeout" ? "timedout" : "internetdisconnected");
        }
        r.continue();
      });
      await p.goto(O + url, { waitUntil: "load", timeout: 60000 }).catch(() => {});
      await sleep(mode === "hang" ? 25000 : 7000);
      const t = await pageText(p);
      const f = path.join(OUTD, `${n}-${W}-err${mode}.png`);
      await p.screenshot({ path: f });
      // 오류 화면도 대표 규칙(가운데·간격·외톨이 줄·화살표) 대로인지 — 500 한 번만 훑는다
      if (mode === "500") await sweep(p, { screen: `err-${n}`, width: W, maxSteps: 3, bottom: false });
      const retry = await p.evaluate(() => [...document.querySelectorAll("button, a")].filter(e => e.getBoundingClientRect().width > 0).map(e => (e.innerText || e.getAttribute("aria-label") || "").trim()).filter(s => /다시|새로 고침|새로고침/.test(s)).slice(0, 4));
      const spinner = await p.evaluate(() => [...document.querySelectorAll("[aria-busy=true], [role=progressbar], [role=status]")].filter(e => e.getBoundingClientRect().width > 0).map(e => (e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 40)).slice(0, 3));
      const r = { screen: n, step: `err-${mode}`, chars: t.length, tech: techHits(t), retry, spinner, text: t.slice(0, 260), apis: [...new Set(hit)].slice(0, 8), errors: [...p.errors].slice(0, 3) };
      console.log(`[err-${mode} ${n} ${W}] chars=${t.length} tech=${r.tech.join("/")} retry=${retry.join("/")} | ${t.slice(0, 120)}`);
      log(r);
      await p.close();
    }
  }
});

/* 3) 긴 값 — API 응답의 사업 이름을 40자로, 이메일을 긴 주소로 바꿔 열고 잘림·넘침을 sweep 으로 본다. 빈 이름도 같이 */
const LONG_NAME = "서울 마포구 망원동 골목 끝 할머니 손맛 수제 반찬과 도시락 정기 배달 전문점";
const LONG_MAIL = "very.long.business.owner.name.for.testing@extremely-long-company-domain-example.co.kr";
await run("long", async () => {
  for (const n of names) {
    const [uid, url] = SCREENS[n];
    if (!uid) continue;
    for (const variant of ["long", "blank"]) {
      const p = await blank(uid);
      const cookie = `syn_uid=${uid}`;
      const plans = await (await fetch(`${O}/api/plan/state`, { headers: { cookie, "x-forwarded-for": p.ip } })).json().catch(() => ({}));
      const titles = [...new Set(((plans.state?.plans ?? plans.plans) || []).map(x => x.title).filter(Boolean))];
      const email = `${uid}@synthetic.invalid`;
      await p.setRequestInterception(true);
      p.on("request", async r => {
        if (r.isInterceptResolutionHandled()) return;
        const u = r.url();
        if (r.method() === "GET" && u.startsWith(O + "/api/") && !u.includes("/api/dev/")) {
          try {
            const res = await fetch(u, { headers: { ...r.headers(), cookie } });
            let body = await res.text();
            for (const t of titles) body = body.split(JSON.stringify(t).slice(1, -1)).join(variant === "long" ? LONG_NAME : "");
            if (variant === "long") body = body.split(email).join(LONG_MAIL);
            return r.respond({ status: res.status, contentType: res.headers.get("content-type") || "application/json", body });
          } catch { return r.continue(); }
        }
        r.continue();
      });
      await p.goto(O + url, { waitUntil: "load", timeout: 60000 }).catch(() => {});
      await sleep(5000);
      await p.screenshot({ path: path.join(OUTD, `${n}-${W}-${variant}.png`) });
      const recs = await sweep(p, { screen: `${variant}-${n}`, width: W, maxSteps: 6, bottom: false });
      log({ screen: n, step: variant, issues: recs.filter(x => x.type === 7).flatMap(x => x.items.map(i => i.label + " " + (i.detail || ""))).slice(0, 10) });
      await p.close();
    }
  }
  // 긴 답변 500자 — 대화 입력칸과 고객센터 문의 칸
  for (const [n, sel] of [["chat", "textarea"], ["support", "textarea"]]) {
    if (!names.includes(n)) continue;
    const [uid, url] = SCREENS[n];
    const p = await open(b, uid, url, { width: W }); await sleep(4500);
    const el = await p.$(sel);
    if (!el) { console.log("no textarea", n); await p.close(); continue; }
    await p.evaluate(s => document.querySelector(s)?.focus(), sel);
    const long = "가".repeat(1) + "점심 도시락을 아파트 단지 앞에서 팔고 싶은데 가격과 메뉴 구성을 어떻게 잡아야 할지 고민입니다. ".repeat(12);
    await p.keyboard.sendCharacter(long.slice(0, 500));
    await sleep(800);
    await p.screenshot({ path: path.join(OUTD, `${n}-${W}-answer500.png`) });
    const recs = await sweep(p, { screen: `answer500-${n}`, width: W, maxSteps: 3, bottom: false });
    const box = await p.evaluate(s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { h: Math.round(r.height), sh: e.scrollHeight, ch: e.clientHeight, oy: getComputedStyle(e).overflowY, len: e.value.length, max: e.maxLength }; }, sel);
    log({ screen: n, step: "answer500", box, issues: recs.filter(x => x.type === 7).flatMap(x => x.items.map(i => i.label)).slice(0, 6) });
    console.log(`[answer500 ${n}]`, JSON.stringify(box));
    await p.close();
  }
  // 긴 이메일·빈 값 제출 — 로그인·가입
  for (const n of ["login", "signup"]) {
    if (!names.includes(n)) continue;
    const p = await open(b, null, SCREENS[n][1], { width: W }); await sleep(2500);
    await p.click("input[type=email]").catch(() => {});
    await p.keyboard.sendCharacter(LONG_MAIL);
    await sleep(300);
    await p.screenshot({ path: path.join(OUTD, `${n}-${W}-longmail.png`) });
    await sweep(p, { screen: `longmail-${n}`, width: W, maxSteps: 2, bottom: false });
    await p.evaluate(() => { const i = document.querySelector("input[type=email]"); i.select(); });
    await p.keyboard.press("Backspace");
    await p.evaluate(() => [...document.querySelectorAll("form button[type=submit], form button")].find(x => /^(로그인|회원가입)$/.test(x.innerText.trim()))?.click());
    await sleep(900);
    const t = await pageText(p);
    const invalid = await p.evaluate(() => [...document.querySelectorAll("input")].filter(i => i.getAttribute("aria-invalid") === "true" || i.matches(":invalid")).map(i => i.type + ":" + (i.validationMessage || "").slice(0, 40)));
    await p.screenshot({ path: path.join(OUTD, `${n}-${W}-emptysubmit.png`) });
    log({ screen: n, step: "empty-submit", invalid, tech: techHits(t), text: t.slice(0, 200) });
    console.log(`[empty-submit ${n}]`, JSON.stringify(invalid));
    await p.close();
  }
});

/* 4) 키보드 — Tab 을 40번 눌러 초점 순서·초점 테두리·화면 밖 초점을 기록한다 */
const FOCUS_INFO = () => {
  const e = document.activeElement;
  if (!e || e === document.body) return { tag: "BODY" };
  const r = e.getBoundingClientRect();
  const s = getComputedStyle(e);
  const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
  const label = ((e.innerText || "").trim() || e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.getAttribute("title") || e.name || "").replace(/\s+/g, " ").slice(0, 30);
  return { tag: e.tagName, label, ring, outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`.slice(0, 50), shadow: (s.boxShadow || "").slice(0, 40), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), off: r.bottom < 0 || r.top > innerHeight || r.width < 1, dialog: !!e.closest("[role=dialog], dialog") };
};
await run("keys", async () => {
  for (const n of names) {
    const [uid, url] = SCREENS[n];
    const p = await open(b, uid, url, { width: W, mobile: false }); await sleep(4000);
    const stops = [];
    for (let i = 0; i < 40; i++) {
      await p.keyboard.press("Tab"); await sleep(600);
      const f = await p.evaluate(FOCUS_INFO);
      stops.push(f);
      if (i < 12 || !f.ring || f.off) await p.screenshot({ path: path.join(OUTD, `${n}-${W}-tab${String(i + 1).padStart(2, "0")}.png`) }).catch(() => {});
    }
    const noRing = stops.filter(s => s.tag !== "BODY" && !s.ring).map(s => `${s.tag}:${s.label}`);
    const off = stops.filter(s => s.off).map(s => `${s.tag}:${s.label}`);
    log({ screen: n, step: "keys", order: stops.map(s => `${s.tag}:${s.label}${s.ring ? "" : "(테두리 없음)"}${s.off ? "(화면 밖)" : ""}`), noRing: [...new Set(noRing)], off: [...new Set(off)] });
    console.log(`[keys ${n} ${W}] noRing=${[...new Set(noRing)].join(" | ").slice(0, 300)} off=${[...new Set(off)].join(" | ").slice(0, 200)}`);
    await p.close();
  }
  // 창 — 메뉴 서랍·고객센터 창·첫 화면 메뉴: Enter 로 열면 초점이 안으로 가는지, Esc 로 닫히고 연 단추로 돌아오는지
  const dialogs = [
    ["menu", UID, "/plan", '[aria-label*="메뉴"]'],
    ["support-chat", UID, "/plan", '[aria-label="고객센터 열기"]'],
    ["landing-menu", null, "/", 'header [aria-label*="메뉴"]'],
    ["landing-support", null, "/", '[aria-label="고객센터 열기"]'],
    ["studio-more", UID, `/plan/studio?planId=${PLAN}&tab=plan`, '[aria-label*="더 보기"], [aria-label*="메뉴"]'],
  ];
  for (const [dn, uid, url, sel] of dialogs) {
    const p = await open(b, uid, url, { width: W, mobile: false }); await sleep(4000);
    const ok = await p.evaluate(s => { const e = [...document.querySelectorAll(s)].find(e => e.getBoundingClientRect().width > 0); if (!e) return null; e.focus(); return (e.getAttribute("aria-label") || e.innerText || "").slice(0, 30); }, sel);
    if (!ok) { console.log(`[dialog ${dn}] 단추 없음`); await p.close(); continue; }
    await p.keyboard.press("Enter"); await sleep(1200);
    const inside = await p.evaluate(() => { const e = document.activeElement; const d = [...document.querySelectorAll("[role=dialog], dialog[open], [aria-modal=true]")].filter(x => x.getBoundingClientRect().width > 0); return { open: d.length, inside: d.some(x => x.contains(e)), focus: (e?.getAttribute("aria-label") || e?.innerText || e?.tagName || "").slice(0, 30), label: d.map(x => x.getAttribute("aria-label") || x.getAttribute("aria-labelledby") || "(이름 없음)") }; });
    await p.screenshot({ path: path.join(OUTD, `${dn}-${W}-dialog-open.png`) });
    // 창 안에서 Tab 다섯 번 — 밖으로 새는지
    let leaked = 0;
    for (let i = 0; i < 6; i++) { await p.keyboard.press("Tab"); await sleep(60); leaked += await p.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog], dialog[open], [aria-modal=true]")].filter(x => x.getBoundingClientRect().width > 0); return d.length && !d.some(x => x.contains(document.activeElement)) ? 1 : 0; }); }
    await p.keyboard.press("Escape"); await sleep(900);
    const after = await p.evaluate(s => { const d = [...document.querySelectorAll("[role=dialog], dialog[open], [aria-modal=true]")].filter(x => x.getBoundingClientRect().width > 0); const e = document.activeElement; return { open: d.length, back: !!e && e.matches(s), focus: (e?.getAttribute("aria-label") || e?.innerText || e?.tagName || "").slice(0, 30) }; }, sel);
    log({ screen: dn, step: "dialog", opener: ok, inside, leaked, after });
    console.log(`[dialog ${dn} ${W}] open=${inside.open} inside=${inside.inside}(${inside.focus}) name=${inside.label} leaked=${leaked} escClosed=${after.open === 0} back=${after.back}(${after.focus})`);
    await p.close();
  }
});

/* 5) 화면 읽기 이름 — 이름 없는 단추·링크, 라벨 없는 입력칸, 제목 순서 */
await run("names", async () => {
  for (const n of names) {
    const [uid, url] = SCREENS[n];
    const p = await open(b, uid, url, { width: W }); await sleep(4000);
    const r = await p.evaluate(() => {
      const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; if (e.closest("[aria-hidden=true], [hidden], [inert]")) return false; const s = getComputedStyle(e); return s.visibility !== "hidden" && s.display !== "none"; };
      const byId = id => id && id.split(/\s+/).map(i => document.getElementById(i)?.innerText || "").join(" ").trim();
      const nameOf = e => (e.getAttribute("aria-label") || byId(e.getAttribute("aria-labelledby")) || (e.textContent || "").trim() || e.getAttribute("title") || [...e.querySelectorAll("img[alt]")].map(i => i.alt).join(" ") || [...e.querySelectorAll("svg title")].map(t => t.textContent).join(" ")).trim();
      const noName = [...document.querySelectorAll("button, a[href], [role=button], [role=tab], [role=link], summary")].filter(vis).filter(e => !nameOf(e)).map(e => `${e.tagName}.${(e.className?.baseVal ?? e.className ?? "").toString().split(" ")[0].slice(0, 40)}`);
      const fields = [...document.querySelectorAll("input:not([type=hidden]), textarea, select")].filter(vis).filter(e => {
        if (e.getAttribute("aria-label") || byId(e.getAttribute("aria-labelledby"))) return false;
        if (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)) return false;
        if (e.closest("label")) return false;
        if (e.title) return false;
        return true;
      }).map(e => `${e.tagName}[${e.type}] placeholder=${(e.placeholder || "").slice(0, 30)}`);
      const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(vis).map(h => ({ l: +h.tagName[1], t: (h.innerText || "").trim().slice(0, 30) }));
      const skips = []; for (let i = 1; i < hs.length; i++) if (hs[i].l - hs[i - 1].l > 1) skips.push(`h${hs[i - 1].l}「${hs[i - 1].t}」→h${hs[i].l}「${hs[i].t}」`);
      const h1 = hs.filter(h => h.l === 1).map(h => h.t);
      const imgs = [...document.querySelectorAll("img")].filter(vis).filter(i => !i.hasAttribute("alt")).map(i => i.src.split("/").pop().slice(0, 40));
      return { noName: [...new Set(noName)], fields, h1, firstHeading: hs[0] ? `h${hs[0].l}「${hs[0].t}」` : null, skips, imgs, lang: document.documentElement.lang, title: document.title };
    });
    log({ screen: n, step: "names", ...r });
    console.log(`[names ${n} ${W}] h1=${JSON.stringify(r.h1)} first=${r.firstHeading} skips=${r.skips.join(" ; ")} noName=${r.noName.join(",")} fields=${r.fields.join(" ; ")} imgs=${r.imgs.join(",")} lang=${r.lang} title=${r.title}`);
    await p.close();
  }
});

/* 2b) 누른 뒤 오류 — 보내기·문의 접수·로그인을 누르는 순간 API 가 500·끊김이면 안내가 한국어로 보이는지 */
await run("actions", async () => {
  const cases = [
    ["login", null, "/account", "/api/auth/", async p => { await p.type("input[type=email]", "owner@example.com"); await p.type("input[type=password]", "password1234"); }, p => p.evaluate(() => [...document.querySelectorAll("form button")].find(b => b.innerText.trim() === "로그인")?.click())],
    ["support", UID, "/account/support", "/api/account/support", async p => { await p.type("input:not([type=hidden])", "결제 문의"); await p.type("textarea", "결제가 두 번 된 것 같아요. 확인 부탁드려요."); }, p => p.evaluate(() => [...document.querySelectorAll("button[type=submit]")].find(b => /문의 접수/.test(b.innerText))?.click())],
    ["chat", UID, SCREENS.chat[1], "/api/plan/", async p => { await p.focus("textarea"); await p.keyboard.type("가격을 조금 낮추고 싶어요"); }, p => p.evaluate(() => document.querySelector('button[aria-label="보내기"]')?.click())],
  ];
  for (const [n, uid, url, api, fill, submit] of cases) {
    if (!names.includes(n)) continue;
    for (const mode of ["500", "offline"]) {
      const p = await open(b, uid, url, { width: W }); await sleep(4500);
      try { await fill(p); } catch (e) { console.log(`[action ${n}] 채우기 실패 ${String(e.message).slice(0, 80)}`); }
      await p.setRequestInterception(true);
      p.on("request", r => {
        if (r.isInterceptResolutionHandled()) return;
        if (r.method() !== "GET" && r.url().startsWith(O + api)) return mode === "500" ? r.respond({ status: 500, contentType: "text/html", body: "<html>Internal Server Error</html>" }) : r.abort("internetdisconnected");
        r.continue();
      });
      await submit(p); await sleep(5000);
      const t = await pageText(p);
      const alerts = await p.evaluate(() => [...document.querySelectorAll("[role=alert], [role=status]")].filter(e => e.getBoundingClientRect().width > 0).map(e => (e.innerText || "").trim()).filter(Boolean).slice(0, 4));
      await p.screenshot({ path: path.join(OUTD, `${n}-${W}-action${mode}.png`) });
      log({ screen: n, step: `action-${mode}`, tech: techHits(t), alerts });
      console.log(`[action-${mode} ${n} ${W}] tech=${techHits(t).join("/")} alerts=${JSON.stringify(alerts).slice(0, 240)}`);
      await p.close();
    }
  }
});

/* 6) 글자 200% — 브라우저 기본 글자 크기를 32px(기본 16px의 2배)로 키워 열고 잘림·넘침을 본다 */
await run("font", async () => {
  for (const n of names) {
    const [uid, url] = SCREENS[n];
    const p = await blank(uid);
    const cdp = await p.createCDPSession();
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
    await p.goto(O + url, { waitUntil: "load", timeout: 60000 }).catch(() => {});
    await sleep(4500);
    const base = await p.evaluate(() => ({ root: getComputedStyle(document.documentElement).fontSize, body: getComputedStyle(document.body).fontSize, p: getComputedStyle(document.querySelector("main p, p") || document.body).fontSize, hscroll: document.documentElement.scrollWidth > innerWidth + 1 }));
    await p.screenshot({ path: path.join(OUTD, `${n}-${W}-font200.png`) });
    const recs = await sweep(p, { screen: `font200-${n}`, width: W, maxSteps: 6, bottom: false });
    log({ screen: n, step: "font200", base, issues: recs.filter(x => x.type === 7).flatMap(x => x.items.map(i => i.label + " " + (i.detail || ""))).slice(0, 10) });
    console.log(`[font200 ${n} ${W}]`, JSON.stringify(base));
    await p.close();
  }
});
await b.close();
