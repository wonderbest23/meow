import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { defaultPlatformLegalSettings } from "../lib/platform-legal/domain";

async function main() {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  await mkdir("artifacts/workspace-theme", { recursive: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900 });
      const errors: string[] = [];
      let authenticated = true;
      page.on("pageerror", error => errors.push(String(error)));
      await page.setRequestInterception(true);
      page.on("request", request => {
        const url = new URL(request.url());
        if (!url.pathname.startsWith("/api/")) { void request.continue(); return; }
        assert.equal(url.origin, "http://localhost:8083", "Fixtures must never target production");
        const respond = (body: unknown) => void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        if (request.method() !== "GET") { errors.push(`Unexpected write: ${url.pathname}`); void request.abort(); return; }
        switch (url.pathname) {
          case "/api/admin/support/session": respond({ authenticated, configured: true }); break;
          case "/api/admin/stats": respond({ users: { total: 12, active7d: 4 }, payments: { paidCount: 3, paidAmount: 447000, paid7d: 1, refundCount: 0, refundPending: 0, recentOrders: [] }, inquiries: { open: 2, unread: 1, total: 3, recent: [] }, llm: { today: 10, last7d: 30, total: 100, failed7d: 0, last24h: 10, failed24h: 0, failed1h: 0, lastFailureAt: null } }); break;
          case "/api/admin/payments/orders": respond({ orders: [] }); break;
          case "/api/admin/refunds": respond({ requests: [] }); break;
          case "/api/admin/support/chat": respond({ conversations: [] }); break;
          case "/api/admin/legal": respond({ settings: defaultPlatformLegalSettings, readiness: { ready: false, siteOpen: true, missing: [] } }); break;
          case "/api/admin/site-copy": respond({ copy: { texts: {}, hidden: [] } }); break;
          case "/api/plan/state": respond({ authenticated: false, plans: [], activePlanId: null }); break;
          default: respond({ texts: {}, hidden: [], chat: { conversation: null, messages: [] } });
        }
      });
      for (const route of ["/admin", "/admin/support", "/admin/payments", "/admin/refunds", "/admin/legal", "/admin/homepage", "/plan/info", "/plan/me", "/plan/start"]) {
        await page.goto(`http://localhost:8083${route}`, { waitUntil: "networkidle0", timeout: 60000 });
        await page.waitForSelector('[data-workspace-theme="night"]');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} overflow at ${width}`);
        if (route.startsWith("/admin")) {
          assert.equal(await page.$$eval('aside[aria-label="관리자 메뉴"] nav a', links => links.length), 6);
          assert.equal(await page.$eval('aside nav a[aria-current="page"]', el => new URL((el as HTMLAnchorElement).href).pathname), route);
        }
        await page.screenshot({ path: `artifacts/workspace-theme/${route.slice(1).replaceAll("/", "-")}-${width}.png` });
      }
      authenticated = false;
      await page.goto("http://localhost:8083/admin", { waitUntil: "networkidle0" });
      await page.waitForSelector('input[type="password"]');
      assert.equal(await page.$('aside[aria-label="관리자 메뉴"]'), null);
      await page.screenshot({ path: `artifacts/workspace-theme/admin-login-${width}.png` });
      await page.goto("http://localhost:8083/", { waitUntil: "networkidle0" });
      assert.equal(await page.$('[data-workspace-theme="night"]'), null, "Homepage must not inherit workspace theme");
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      await page.goto("http://localhost:8083/plan/chat?new=1", { waitUntil: "networkidle0" });
      assert.equal(await page.$eval('[data-workspace-theme="night"] button', el => getComputedStyle(el).animationDuration), "0s");
      assert.deepEqual(errors, []);
      console.log(`workspace theme ${width}: passed (local mock API, no writes)`);
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
