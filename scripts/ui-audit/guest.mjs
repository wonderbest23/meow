// 로그인 전 사용자가 보는 화면 전수 점검(2026-11-14) — 막다른 화면 · 로그인 폼만 있는 화면 · 오류 문구 · 빈 화면을 찾는다.
//   BASE_URL=http://localhost:8098 OUT=tmp/guest node scripts/ui-audit/guest.mjs
// 화면마다 한 줄(<OUT>/guest.jsonl)과 캡처(<OUT>/g-<너비>-<이름>.png)를 남긴다. 판단은 사람이 캡처를 보고 한다 — 이 도구는 모아 줄 뿐이다.
import fs from "node:fs";
import { S, browser, open, sleep, shot } from "./lib.mjs";

const SAMPLE = "sample_banchan_easy";
const PAGES = [
  ["home", "/"], ["plan-list", "/plan"], ["studio-new", "/plan/studio?new=1"], ["studio-bare", "/plan/studio"], ["studio-missing", "/plan/studio?planId=plan_does-not-exist"],
  ["chat-new", "/plan/chat?new=1"], ["document-bare", "/plan/document"], ["document-sample", `/plan/document?planId=${SAMPLE}`],
  ["sample-chat", `/plan/studio?planId=${SAMPLE}`], ["sample-homepage", `/plan/studio?planId=${SAMPLE}&tab=homepage`], ["sample-operations", `/plan/studio?planId=${SAMPLE}&tab=operations`],
  ["homepage", "/plan/homepage"], ["workspace", "/plan/workspace"], ["overview", "/plan/overview"], ["me", "/plan/me"], ["settings", "/plan/settings"], ["settings-security", "/plan/settings/security"],
  ["inquiries", "/plan/inquiries"], ["pay", "/plan/pay"], ["pay-result", "/plan/pay/result"], ["analyze", "/plan/analyze"], ["info", "/plan/info"], ["proposal", "/plan/proposal"],
  ["account", "/account"], ["account-support", "/account/support"], ["payment-transfer", "/payment/transfer"],
];
const READ = `(() => {
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  const text = document.body.innerText.replace(/\\s+/g, " ").trim();
  return {
    url: location.pathname + location.search, title: document.title,
    popup: !!document.querySelector("dialog[open]"),
    loginForms: [...document.querySelectorAll('input[type=password]')].filter(vis).length,
    headings: [...document.querySelectorAll("h1, h2")].filter(vis).map(e => e.innerText.trim().replace(/\\s+/g, " ").slice(0, 40)).filter(Boolean).slice(0, 6),
    alerts: [...document.querySelectorAll("[role=alert]")].filter(vis).map(e => e.innerText.trim().slice(0, 90)).filter(Boolean),
    primary: [...document.querySelectorAll("button, a")].filter(vis).map(e => (e.innerText || "").trim().replace(/\\s+/g, " ")).filter(t => /로그인|회원가입|시작|만들기|예시|내 사업|다시/.test(t)).slice(0, 8),
    words: text.length, bad: (text.match(/찾지 못했|오류|실패|권한이 없|로그인이 풀렸|undefined|NaN|null/g) || []).slice(0, 6),
    disabled: [...document.querySelectorAll("button:disabled")].filter(vis).length,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
})()`;
const b = await browser(), out = [];
for (const width of [1440, 390]) for (const [name, pathname] of PAGES) {
  const page = await open(b, null, pathname, { width, mobile: false });
  await sleep(7000);
  const state = await page.evaluate(READ).catch(error => ({ error: String(error).slice(0, 100) }));
  out.push({ width, name, from: pathname, ...state, pageErrors: page.errors.slice(0, 2), failed: [...new Set(page.bad)].filter(line => !line.includes("/api/auth/session") && !line.includes("/api/funnel")).slice(0, 5) });
  await shot(page, `g-${width}-${name}`).catch(() => {});
  await page.close();
  fs.writeFileSync(`${S}/guest.jsonl`, out.map(item => JSON.stringify(item)).join("\n"));
}
await b.close();
console.log(`화면 ${out.length}개 → ${S}/guest.jsonl`);
