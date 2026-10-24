// 공개 화면(로그아웃 손님) 훑기 — 첫 화면·로그인·가입·비밀번호·404·없는 사업·고객센터·예시 사업
//   node scripts/ui-audit/d-public.mjs [너비=390] [단계,단계] [--out 폴더]   (단계: landing,login,signup,reset,mybiz-out,404,missing-out,support-page-out,sample)
import { args, browser, open, runner, sleep, clickText } from "./lib.mjs";
import { sweep, withKeyboard } from "./check.mjs";
const W = +(args[0] || 390);
const only = args[1];
const b = await browser();
const run = runner(only);
const go = async (path, wait = 2500) => { const p = await open(b, null, path, { width: W }); await sleep(wait); return p; };
await run("landing", async () => {
  const p = await go("/", 3000);
  await sweep(p, { screen: "landing", width: W, maxSteps: 30 });
  const m = await p.evaluate(() => { const b = [...document.querySelectorAll("header button")].find(b => /메뉴/.test(b.getAttribute("aria-label") || "")); b?.click(); return !!b; });
  await sleep(900); if (m) await sweep(p, { screen: "landing-menu", width: W, maxSteps: 2, bottom: false, root: "#home-menu" });
  await p.close();
  const q = await go("/", 2500);
  const ta = await q.$("textarea");
  if (ta) await withKeyboard(q, "textarea", async () => { await q.evaluate(() => document.activeElement?.scrollIntoView({ block: "center" })); await sleep(300); await sweep(q, { screen: "landing-kb", width: W, maxSteps: 1, bottom: false }); });
  await q.close();
});
await run("login", async () => {
  const p = await go("/account");
  await sweep(p, { screen: "login", width: W });
  await withKeyboard(p, "input[type=email]", () => sweep(p, { screen: "login-kb", width: W, maxSteps: 2, bottom: false }));
  // 빈 칸 제출 → 오류 상태
  await p.evaluate(() => [...document.querySelectorAll("form button")].find(b => b.innerText.trim() === "로그인")?.click()); await sleep(800);
  await sweep(p, { screen: "login-error", width: W, maxSteps: 1, bottom: false });
  await clickText(p, /비밀번호 재설정/); await sleep(1200);
  await sweep(p, { screen: "pw-recover", width: W });
  await p.close();
});
await run("signup", async () => {
  const p = await go("/account?mode=register");
  await sweep(p, { screen: "signup", width: W });
  await withKeyboard(p, "input[type=email]", () => sweep(p, { screen: "signup-kb", width: W, maxSteps: 3, bottom: false }));
  await p.close();
});
await run("reset", async () => { const p = await go("/account?mode=reset"); await sweep(p, { screen: "pw-reset", width: W }); await p.close(); });
await run("mybiz-out", async () => { const p = await go("/plan", 3000); await sweep(p, { screen: "mybiz-out", width: W }); await p.close(); });
await run("404", async () => { const p = await go("/this-page-does-not-exist", 2500); await sweep(p, { screen: "404", width: W }); await p.close(); });
await run("missing-out", async () => { const p = await go("/plan/studio?planId=nope", 4000); await sweep(p, { screen: "missing-out", width: W }); await p.close(); });
await run("support-page-out", async () => { const p = await go("/account/support", 3000); await sweep(p, { screen: "support-page-out", width: W }); await p.close(); });
await run("sample", async () => {
  for (const [name, path] of [["sample-plan", "/plan/document?planId=sample_coffee"], ["sample-homepage", "/plan/homepage?planId=sample_coffee"], ["sample-launch", "/plan/studio?planId=sample_coffee&tab=launch"], ["sample-ops", "/plan/studio?planId=sample_coffee&tab=operations"]]) {
    const p = await go(path, 5000);
    console.log(name, "->", p.url().replace(/^.*?:\d+/, ""));
    await sweep(p, { screen: name, width: W, maxSteps: 14 });
    await p.close();
  }
});
await b.close();
