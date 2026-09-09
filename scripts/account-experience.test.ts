import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer, { type Page } from "puppeteer-core";

async function click(page: Page, label: string) {
  for (const button of await page.$$("button")) {
    if (await button.evaluate((el, text) => el.textContent?.trim() === text, label)) { await button.click(); return; }
  }
  throw new Error(`Missing button: ${label}`);
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  await mkdir("artifacts/account-experience", { recursive: true });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", e => errors.push(String(e)));
      let loggedIn = false;
      let loginRequests = 0;
      let finishLogin: (() => void) | undefined;
      let finishSession: (() => void) | undefined;
      await page.setRequestInterception(true);
      page.on("request", request => {
        const url = new URL(request.url());
        const json = (body: unknown, status = 200) => void request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
        if (url.hostname === "accounts.google.com") {
          void request.respond({ status: 200, contentType: "application/javascript", body: 'window.google={accounts:{id:{initialize(){},renderButton(parent){const button=document.createElement("button");button.type="button";button.textContent="Google로 계속하기";button.style.cssText="width:100%;height:44px;border:1px solid #dadce0;border-radius:4px;background:white;font-size:14px";parent.appendChild(button);}}}};' }); return;
        }
        if (url.pathname === "/api/auth/session") {
          finishSession = () => json({ authenticated: loggedIn, email: loggedIn ? "test@example.com" : null, projects: [] });
          if (loggedIn) finishSession();
          return;
        }
        if (url.pathname === "/api/auth/login") { loginRequests++; finishLogin = () => json({ error: { message: "이메일 또는 비밀번호를 확인해 주세요." } }, 401); return; }
        if (url.pathname === "/api/auth/recover") { json({ ok: true }); return; }
        if (url.pathname === "/api/auth/payments") { json({ payments: [] }); return; }
        if (url.pathname === "/api/plan/state") { json({ business: {}, plans: [], activePlanId: null, authenticated: loggedIn }); return; }
        void request.continue();
      });
      await page.goto("http://localhost:8083/account", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[role="status"][aria-label="내 계정을 확인하고 있어요"]');
      await page.screenshot({ path: `artifacts/account-experience/loading-${width}.png` });
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      assert.equal(await page.$eval('[role="status"] i', el => getComputedStyle(el).animationName), "none");
      await page.emulateMediaFeatures([]);
      assert.ok(finishSession); finishSession();
      await page.waitForSelector('input[type="email"]');
      await page.waitForFunction(() => document.body.textContent?.includes("Google로 계속하기"));
      await page.screenshot({ path: `artifacts/account-experience/login-${width}.png` });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "가로 넘침 없음");
      assert.ok(await page.$eval('label > span', el => el.getBoundingClientRect().height > 10), "입력 라벨을 항상 표시");
      assert.ok(await page.$eval('input[type="email"]', el => parseFloat(getComputedStyle(el).fontSize) >= 16), "모바일 입력 글씨 16px 이상");
      assert.ok(await page.$eval('button.account-submit', el => Math.abs(el.getBoundingClientRect().width - el.closest('form')!.getBoundingClientRect().width) < 2), "로그인 버튼을 입력칸과 같은 너비로 표시");
      await page.type('input[type="email"]', "test@example.com");
      await page.type('input[type="password"]', "test-only-password");
      await page.click('[aria-label="비밀번호 보기"]');
      assert.ok(await page.$('input[autocomplete="current-password"][type="text"]'));
      await page.click('[aria-label="비밀번호 숨기기"]');
      await click(page, "로그인");
      await page.waitForSelector('form[aria-busy="true"]');
      assert.ok(await page.$eval('button.account-submit', el => (el as HTMLButtonElement).disabled));
      assert.equal(loginRequests, 1);
      assert.ok(finishLogin); finishLogin();
      await page.waitForSelector('[role="alert"]');
      assert.ok(await page.$eval('[role="alert"]', el => el.textContent?.includes("비밀번호를 확인")));
      assert.equal(await page.$eval('input[type="email"]', el => (el as HTMLInputElement).value), "test@example.com");
      await click(page, "비밀번호 찾기");
      await click(page, "복구 메일 보내기");
      await page.waitForFunction(() => document.body.textContent?.includes("재설정 메일을 보냈습니다"));
      assert.equal(await page.$('[role="alert"]'), null, "성공 안내는 오류로 표시하지 않음");
      await click(page, "로그인으로 돌아가기");
      await click(page, "회원가입");
      assert.ok(await page.$eval('button.account-submit', el => (el as HTMLButtonElement).disabled), "동의 전 가입 불가");
      await page.type('input[placeholder="비밀번호를 다시 입력하세요"]', "different-password");
      await page.waitForFunction(() => document.body.textContent?.includes("비밀번호가 서로 달라요"));
      await page.screenshot({ path: `artifacts/account-experience/register-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      loggedIn = true;
      await page.reload({ waitUntil: "networkidle0" });
      await page.waitForSelector('.account-dashboard');
      assert.ok(await page.$eval('.account-projects header a', el => el.getBoundingClientRect().height < 70), "새 사업 시작 문구가 세로로 쪼개지지 않음");
      await page.screenshot({ path: `artifacts/account-experience/account-${width}.png` });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`account experience ${width}: passed (mock auth, no real accounts changed)`);
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
