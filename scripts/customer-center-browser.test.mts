import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const base = new URL(process.env.SUPPORT_TEST_URL ?? "http://127.0.0.1:52195");
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error("Only an isolated localhost preview is allowed");
const output = process.env.SUPPORT_TEST_OUTPUT ?? "/private/tmp/oneul-customer-center-browser";
if (!output.startsWith("/private/tmp/")) throw new Error("Evidence must use a temporary test directory");

async function click(page: Page, label: string) {
  for (const button of await page.$$("button")) {
    if (await button.evaluate((element, text) => element.textContent?.trim() === text, label)) { await button.click(); return; }
  }
  throw new Error(`Missing button: ${label}`);
}

async function main() {
  const require = createRequire(import.meta.url);
  const originals = new Map<string, NodeJS.Module | undefined>();
  function mock(path: string, exports: unknown) {
    const id = require.resolve(path); originals.set(id, require.cache[id]);
    const mod = new Module(id); mod.filename = id; mod.loaded = true; mod.exports = exports; require.cache[id] = mod;
  }
  let owner: string | null = null;
  mock("../lib/api-auth", { requireAuthenticatedIdentity: async () => {
    if (!owner) throw new Error("ACCOUNT_LOGIN_REQUIRED");
    return { hash: owner, userId: owner, email: "synthetic@example.invalid" };
  } });
  mock("../lib/persistence", { getServerSupabase: () => null });
  mock("../lib/rate-limit", { enforceRateLimit: async () => null });
  mock("../lib/notify/owner-email", { notifyOwnerByEmail: async () => true });
  mock("../lib/notify/owner-sms", { notifyOwnerBySms: async () => ({ status: "disabled", code: "SMS_DISABLED" }) });
  const route = require("../app/api/account/support/route") as typeof import("../app/api/account/support/route");
  const repo = require("../lib/support-chat/repository") as typeof import("../lib/support-chat/repository");
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => { externalCalls++; throw new Error("External requests prohibited"); };
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const results: { name: string; width: number; status: string }[] = [];
  const screenshots: string[] = [];
  await mkdir(output, { recursive: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      await page.setViewport({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(String(error)));
      const postIds: string[] = [];
      let failure: "none" | "before" | "after" = "none";
      let hold: Promise<void> | null = null, release: (() => void) | null = null;
      const interceptionErrors: string[] = [];
      await page.setRequestInterception(true);
      page.on("request", request => { void (async () => {
        const url = new URL(request.url());
        if (url.origin !== base.origin) { await request.abort("blockedbyclient"); return; }
        const json = (body: unknown, status = 200) => request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
        if (url.pathname === "/api/auth/session") { await json({ authenticated: !!owner, email: owner ? "synthetic@example.invalid" : null, projects: [] }); return; }
        if (url.pathname === "/api/auth/payments") { await json({ payments: [] }); return; }
        if (url.pathname === "/api/plan/state") { await json({ business: {}, plans: [], activePlanId: null, authenticated: !!owner, ownerKey: owner, serverRevision: 0 }); return; }
        if (url.pathname === "/api/account/support") {
          let response: Response;
          if (request.method() === "POST") {
            const body = request.postData() ?? ""; postIds.push(JSON.parse(body).requestId);
            if (hold) await hold;
            if (failure === "before") { failure = "none"; await request.abort("failed"); return; }
            response = await route.POST(new Request(request.url(), { method: "POST", headers: request.headers(), body }));
            if (failure === "after") { failure = "none"; await request.abort("failed"); return; }
          } else response = await route.GET();
          await request.respond({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }); return;
        }
        if (url.pathname.startsWith("/api/")) { await json({ error: { message: "Unexpected endpoint in isolated support test" } }, 503); return; }
        await request.continue();
      })().catch(error => { interceptionErrors.push(String(error)); void request.abort("failed").catch(() => {}); }); });
      async function passed(name: string) { results.push({ name, width, status: "passed" }); console.log(`PASS ${width} ${name}`); }
      async function shot(name: string) {
        const path = join(output, `${name}-${width}.png`); await page.screenshot({ path, fullPage: true }); screenshots.push(path);
      }

      owner = null;
      await page.goto(`${base.origin}/account/support?category=website`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(`a[href^="/account?next="]`);
      assert.equal(await page.$eval('a[href^="/account?next="]', element => element.getAttribute("href")), "/account?next=%2Faccount%2Fsupport%3Fcategory%3Dwebsite");
      assert.equal(await page.$("textarea"), null);
      assert.equal(await page.$(".support-chat-widget"), null);
      await passed("anonymous center offers existing login without widget");
      await shot("login-required");

      owner = `browser-a-${width}`;
      await page.goto(`${base.origin}/account`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('a[href="/account/support"]');
      await page.click('a[href="/account/support"]');
      await page.waitForSelector("textarea");
      await page.select("select", "plan");
      await page.type('form input', "합성 저장 문제 문의");
      await page.type("textarea", "합성 자료입니다. 새로고침 뒤에 작성 내용이 보이지 않아요.");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.ok(await page.$eval("textarea", element => parseFloat(getComputedStyle(element).fontSize) >= 16));
      assert.ok(await page.$eval('button[type="submit"]', element => element.getBoundingClientRect().height >= 44));
      await shot("write"); await passed("My Page opens readable inquiry form");

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (document.querySelector('form input') as HTMLInputElement)?.value === "합성 저장 문제 문의");
      assert.match(await page.$eval("textarea", element => element.value), /새로고침/);
      await passed("unsent draft survives refresh within the same account");

      failure = "before";
      await click(page, "문의 접수"); await page.waitForSelector('[role="alert"]');
      assert.match(await page.$eval("textarea", element => element.value), /새로고침/);
      assert.equal((await repo.getCustomerChat(owner)).messages.length, 0);
      await shot("failure");
      hold = new Promise(resolve => { release = resolve; });
      await click(page, "문의 접수");
      await page.waitForSelector('form[aria-busy="true"]');
      await page.waitForFunction(() => (document.querySelector('button[type="submit"]') as HTMLButtonElement)?.disabled);
      assert.equal(postIds[0], postIds[1], "unchanged retry keeps requestId");
      assert.ok(release); (release as () => void)(); hold = null;
      await page.waitForFunction(() => document.body.textContent?.includes("문의를 접수했어요"));
      assert.equal((await repo.getCustomerChat(owner)).messages.length, 1);
      await passed("failure preserves input; retry saves once with same request ID");

      const conversation = (await repo.getCustomerChat(owner)).conversation!;
      await repo.sendAdminMessage(conversation.id, "합성 담당자 답변입니다. 접수하신 저장 문제를 확인했습니다.");
      await page.click('[aria-label="문의 내역 새로고침"]');
      await page.waitForFunction(() => document.body.textContent?.includes("합성 담당자 답변입니다"));
      await page.click("details summary");
      assert.ok((await page.$eval("details[open] p", element => element.textContent))?.includes("합성 자료"));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await shot("history"); await passed("receipt and existing administrator reply appear in history");

      await click(page, "문의하기");
      await page.type('form input', "응답 유실 합성 문의"); await page.type("textarea", "서버 접수 후 응답만 유실되는 시험입니다.");
      failure = "after";
      await click(page, "문의 접수"); await page.waitForSelector('[role="alert"]');
      const count = (await repo.getCustomerChat(owner)).messages.length;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (document.querySelector('form input') as HTMLInputElement)?.value === "응답 유실 합성 문의");
      await click(page, "문의 접수");
      await page.waitForFunction(() => document.body.textContent?.includes("문의를 접수했어요"));
      assert.equal((await repo.getCustomerChat(owner)).messages.length, count);
      assert.equal(postIds.at(-1), postIds.at(-2));
      await passed("lost response and reload retry do not duplicate the saved inquiry");

      await click(page, "문의하기");
      await page.type('form input', "A 계정의 미전송 제목"); await page.type("textarea", "A 전용 미전송 내용");
      owner = `browser-b-${width}`;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("textarea");
      assert.equal(await page.$eval("textarea", element => element.value), "");
      await click(page, "문의 내역");
      await page.waitForFunction(() => document.body.textContent?.includes("아직 접수한 문의가 없어요"));
      assert.equal((await page.$eval("body", element => element.textContent))?.includes("합성 저장 문제 문의"), false);
      await passed("account change does not show previous account draft or history");
      await shot("empty-history");
      assert.deepEqual(errors, []); assert.deepEqual(interceptionErrors, []);
      await context.close();
    }
    assert.equal(externalCalls, 0);
    await writeFile(join(output, "results.json"), JSON.stringify({ status: "passed", results, screenshots, externalCalls, limitations: "Browser UI + real route/repository functions at intercepted localhost boundary; synthetic auth and demo-memory. Not real login, persistent DB, email delivery, or production deployment." }, null, 2));
  } catch (error) {
    await writeFile(join(output, "results.json"), JSON.stringify({ status: "failed", results, screenshots, error: String(error), externalCalls }, null, 2));
    throw error;
  } finally {
    await browser.close(); globalThis.fetch = originalFetch;
    for (const [id, prior] of originals) { if (prior) require.cache[id] = prior; else delete require.cache[id]; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
