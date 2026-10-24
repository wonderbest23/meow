// UI 점검 공통 도구 — 합성 미리보기 서버(docs/cloud-preview.md)에 붙어 화면을 연다.
//   BASE_URL   미리보기 주소(기본 http://127.0.0.1:60207)
//   OUT        결과 폴더. --out <폴더> 로도 넘길 수 있다(기본 tmp/ui-audit — 저장소에 올라가지 않는다)
//   CHROME_PATH 크롬 실행 파일. 없으면 맥 기본 위치·리눅스 흔한 위치를 찾는다.
//               리눅스(클라우드)에서는: npx @puppeteer/browsers install chrome@stable  → 출력된 경로를 CHROME_PATH 로
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

/* --out 은 어느 자리에 있어도 빼고, 나머지는 순서대로 args 로 */
const raw = process.argv.slice(2);
const positional = [];
let outArg = null;
for (let i = 0; i < raw.length; i++) {
  if (raw[i] === "--out") outArg = raw[++i];
  else if (raw[i].startsWith("--out=")) outArg = raw[i].slice(6);
  else positional.push(raw[i]);
}
export const args = positional;
export const O = (process.env.BASE_URL || "http://127.0.0.1:60207").replace(/\/$/, "");
export const S = path.resolve(outArg || process.env.OUT || "tmp/ui-audit");
fs.mkdirSync(path.join(S, "flags"), { recursive: true });
export const sleep = ms => new Promise(r => setTimeout(r, ms));

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
];
export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const found = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  if (!found) throw new Error("크롬을 찾지 못했습니다. CHROME_PATH 를 정하세요(리눅스: npx @puppeteer/browsers install chrome@stable).");
  return found;
}
export async function browser() {
  return puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ko-KR"], protocolTimeout: 400000 });
}

let ipn = 1;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
export const HFOR = { 360: 740, 390: 844, 430: 932, 1024: 768, 1280: 800, 1440: 900, 1920: 1080 };
/**
 * open(b, uid, path, { width, height, dpr, mobile })
 * uid(syn-숫자)가 있으면 /api/dev/synthetic-login 으로 합성 로그인한 뒤 path 로 간다. 없으면 손님(로그아웃)으로 연다.
 * 너비 800 미만은 아이폰처럼(터치·모바일 UA), 그 이상은 PC 로 연다.
 */
export async function open(b, uid, pathname, { width = 390, height, dpr, mobile } = {}) {
  mobile = mobile ?? width < 800;
  height = height || HFOR[width] || (mobile ? 844 : 800);
  const ctx = await b.createBrowserContext();
  const page = await ctx.newPage();
  await page.evaluateOnNewDocument("window.__name = (fn) => fn;");
  if (mobile) await page.setUserAgent(UA);
  await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: dpr ?? (mobile ? 2 : 1) });
  const n = parseInt((uid || "").replace(/\D/g, "")) || 0;
  // 같은 IP 요청 제한에 걸리지 않게 화면마다 다른 가짜 IP(합성 미리보기에서만 의미가 있다)
  page.ip = `10.89.${n % 250}.${(ipn++ % 250) + 1}`;
  page.uid = uid;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": page.ip });
  page.errors = []; page.consoleErrors = []; page.bad = [];
  page.on("response", r => { if (r.status() >= 400) page.bad.push(r.status() + " " + r.request().method() + " " + r.url().replace(O, "").slice(0, 120)); });
  page.on("pageerror", e => page.errors.push(String(e.message || e).slice(0, 300)));
  page.on("console", m => { if (m.type() === "error") page.consoleErrors.push(m.text().slice(0, 300)); });
  page.on("dialog", async d => { await d.dismiss(); });
  if (uid) await page.goto(`${O}/api/dev/synthetic-login?uid=${encodeURIComponent(uid)}&next=${encodeURIComponent(pathname)}`, { waitUntil: "load", timeout: 180000 });
  else await page.goto(`${O}${pathname}`, { waitUntil: "load", timeout: 180000 });
  return page;
}
export async function shot(page, name, full = false) { const p = path.join(S, `${name}.png`); await page.screenshot({ path: p, fullPage: full }); return p; }
export const api = (uid, ip = "10.89.9.9") => ({ "content-type": "application/json", cookie: `syn_uid=${uid}`, "x-forwarded-for": ip, origin: O });
export async function plansOf(uid) {
  const s = await (await fetch(`${O}/api/plan/state`, { headers: api(uid) })).json();
  return s.state?.plans ?? s.plans ?? [];
}
export const clickText = (page, re, sel = "button, a, [role=tab], [role=button]") => page.evaluate((src, sel) => { const re = new RegExp(src); const e = [...document.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().width > 0).find(e => (re.test((e.innerText || "").trim()) || re.test((e.getAttribute("aria-label") || "").trim()))); e?.click(); return e ? (e.innerText || e.getAttribute("aria-label")).trim().slice(0, 40) : null; }, re.source, sel);
/* 한 실행 안에서 이름 붙은 단계 하나 — 실패해도 다음 단계로 간다. only="a,b" 면 그 단계만 */
export const runner = only => async (name, fn) => { if (only && !only.split(",").includes(name)) return; try { await fn(); } catch (e) { console.log(`!! ${name} failed: ${String(e.message).slice(0, 200)}`); } };
