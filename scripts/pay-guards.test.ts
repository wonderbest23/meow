import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 오픈 전 결제 안전(fix/pay-guards).
 *  - 지운 문서·남의 문서 번호로는 결제를 시작하지 않는다(purchase-rules — 카드·앱 결제 공통)
 *  - 결제한 문서라도 서버에 저장된 내 문서가 아니면 AI 생성을 하지 않고, 저장되지 않은 첫 생성도 다음부터는 '다시 생성'으로 센다
 *  - 운영에서 애플 시험 결제(Sandbox)는 허용 목록 계정에만 권한을 준다
 * DB 는 메모리 저장소와 가짜 Supabase(fixture.invalid)만 쓴다. 바깥 네트워크·AI 호출 없음.
 */

const plan = (id: string) => ({ id, title: id, planType: "간단 · 사업계획서", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", sections: {}, answers: {} });
const business = { name: "", description: "", role: "", industry: "", region: "", stage: "" };

async function purchaseRules() {
  process.env.PERSISTENCE_MODE = "demo-memory";
  const { savePlanState, deletePlanById } = await import("../lib/plan-builder/plan-server-store");
  const { purchaseBlocked, planNotInMyList } = await import("../lib/payments/purchase-rules");
  const me = { userId: "user-guards", hash: "owner-guards" };
  await savePlanState(me.hash, { business, plans: [plan("plan-live"), plan("plan-gone")], activePlanId: "plan-live" });
  await savePlanState("owner-other", { business, plans: [plan("plan-other")], activePlanId: "plan-other" });
  await deletePlanById(me.hash, "plan-gone");

  for (const product of ["plan", "bundle", "homepage", "regen"] as const) {
    for (const planId of ["plan-gone", "plan-other", "plan-never"]) {
      const blocked = await purchaseBlocked(product, planId, me);
      assert.equal(blocked?.status, 404, `${product} for ${planId} is refused before any purchase check`);
      assert.equal((await blocked!.json()).error, "not_found");
    }
  }
  // 내 목록에 있는 문서는 예전 규칙으로 넘어간다(메모리 모드는 결제 권한이 모두 열린 것으로 보므로 '이미 열림'이 나온다)
  assert.equal(await purchaseBlocked("regen", "plan-live", me), null, "regen on my live document is allowed");
  assert.equal((await purchaseBlocked("plan", "plan-live", me))?.status, 409, "live document reaches the already-paid rule");
  assert.equal(await planNotInMyList("plan-live", me.hash), null);
  assert.equal((await planNotInMyList("plan-gone", me.hash))?.status, 404);

  // 카드 결제 준비와 앱 결제 시작이 모두 이 확인을 거친다(도메인 결제도 같은 확인)
  const prepare = readFileSync(new URL("../app/api/payments/plan/prepare/route.ts", import.meta.url), "utf8");
  assert.match(prepare, /purchaseBlocked\(product, planId/);
  assert.match(prepare, /product === "domain" \|\| product === "domain-purchase"\) \{\s*\/\/[^\n]*\n\s*const missing = await planNotInMyList\(planId, identity\.hash\);/);
  const iapStart = readFileSync(new URL("../app/api/payments/iap/start/route.ts", import.meta.url), "utf8");
  assert.match(iapStart, /purchaseBlocked\(product, planId/);
}

async function iapSandbox() {
  const { iapEnvironmentAllowed, sandboxPurchaseAllowed, recordIapPurchase } = await import("../lib/payments/iap-orders");
  const before = { allowed: process.env.IAP_SANDBOX_ALLOWED_EMAILS, preview: process.env.HOMEPAGE_EDITOR_PREVIEW_EMAILS };
  try {
    process.env.IAP_SANDBOX_ALLOWED_EMAILS = " Reviewer@Example.test , qa@example.test";
    process.env.HOMEPAGE_EDITOR_PREVIEW_EMAILS = "operator@example.test";
    assert.equal(sandboxPurchaseAllowed("reviewer@example.test"), true, "App Review demo account from the env list");
    assert.equal(sandboxPurchaseAllowed("QA@example.test"), true);
    assert.equal(sandboxPurchaseAllowed("operator@example.test"), true, "operator test accounts");
    assert.equal(sandboxPurchaseAllowed("someone@example.test"), false);
    assert.equal(sandboxPurchaseAllowed(null), false);
    assert.equal(sandboxPurchaseAllowed(""), false);

    const ios = (environment: string, email: string | null) => ({ platform: "ios" as const, environment, email });
    // 운영
    assert.equal(iapEnvironmentAllowed(ios("Production", "someone@example.test"), true), true, "real App Store purchases always count");
    assert.equal(iapEnvironmentAllowed(ios("Sandbox", "someone@example.test"), true), false, "TestFlight/sandbox does not unlock paid features in production");
    assert.equal(iapEnvironmentAllowed(ios("Sandbox", null), true), false);
    assert.equal(iapEnvironmentAllowed(ios("Xcode", "someone@example.test"), true), false);
    assert.equal(iapEnvironmentAllowed(ios("Sandbox", "reviewer@example.test"), true), true, "App Review can still buy in sandbox");
    assert.equal(iapEnvironmentAllowed({ platform: "android", environment: "Test", email: "someone@example.test" }, true), true, "Google license testers unchanged");
    // 스테이징·개발은 막지 않는다
    assert.equal(iapEnvironmentAllowed(ios("Sandbox", "someone@example.test"), false), true);

    // 운영으로 판정되면 기록 전에 거절한다(주문을 done 으로 남기지 않는다)
    const savedAppEnv = process.env.APP_ENV;
    process.env.APP_ENV = "production";
    try {
      await assert.rejects(() => recordIapPurchase({ platform: "ios", storeTransactionId: "2000000000000001", product: "plan", planId: "plan-live", planType: "간단 · 사업계획서", userId: "user-guards", guestTokenHash: "owner-guards", email: "someone@example.test", environment: "Sandbox", raw: {} }),
        (error: unknown) => error instanceof Error && (error as { code?: string }).code === "IAP_SANDBOX_NOT_ALLOWED" && (error as { status?: number }).status === 403);
    } finally {
      if (savedAppEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = savedAppEnv;
    }
  } finally {
    if (before.allowed === undefined) delete process.env.IAP_SANDBOX_ALLOWED_EMAILS; else process.env.IAP_SANDBOX_ALLOWED_EMAILS = before.allowed;
    if (before.preview === undefined) delete process.env.HOMEPAGE_EDITOR_PREVIEW_EMAILS; else process.env.HOMEPAGE_EDITOR_PREVIEW_EMAILS = before.preview;
  }
}

async function firstGenerationLedger() {
  Object.assign(process.env, { PERSISTENCE_MODE: "supabase", SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-only" });
  const rows: Array<{ plan_id: string; owner_hash: string; section_key: string; ok: boolean }> = [];
  let failReads = false;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.hostname, "fixture.invalid", "No real database requests");
    if (url.pathname === "/rest/v1/plan_regenerations") {
      if (init?.method === "POST") { rows.push(JSON.parse(String(init.body))); return new Response(null, { status: 201 }); }
      if (failReads) return Response.json({ message: "fixture outage" }, { status: 503 });
      const matching = rows.filter(row => [...url.searchParams].every(([key, value]) => !value.startsWith("eq.") || String(row[key as keyof typeof row]) === value.slice(3)));
      if (init?.method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `0-0/${matching.length}` } });
      return Response.json(matching.map((_, index) => ({ id: index + 1 })));
    }
    if (url.pathname === "/rest/v1/plan_regen_packs") return Response.json([]);
    if (url.pathname === "/rest/v1/payment_orders") return Response.json([{ terms_version: "fixture-legacy" }]);
    throw new Error(`Unexpected fixture path ${url.pathname}`);
  };
  try {
    const { firstGenerationRecorded, recordFirstGeneration, resolveRegenQuota, recordRegen, FIRST_GENERATION_PREFIX } = await import("../lib/plan-builder/regen-quota");
    assert.equal(await firstGenerationRecorded("plan-live", "market/customers"), false, "nothing generated yet");
    await recordFirstGeneration("plan-live", "owner-guards", "market/customers");
    assert.deepEqual(rows, [{ plan_id: "plan-live", owner_hash: "owner-guards", section_key: `${FIRST_GENERATION_PREFIX}market/customers`, ok: false }]);
    assert.equal(await firstGenerationRecorded("plan-live", "market/customers"), true, "an unsaved first generation is remembered");
    assert.equal(await firstGenerationRecorded("plan-live", "market/competition"), false, "per section");
    assert.equal(await firstGenerationRecorded("plan-other", "market/customers"), false, "per document");
    // 첫 생성 표시는 남은 횟수를 깎지 않는다(ok=true 만 센다)
    const before = await resolveRegenQuota("plan-live");
    assert.equal(before.used, 0);
    await recordRegen("plan-live", "owner-guards", "market/customers", true);
    assert.equal((await resolveRegenQuota("plan-live")).used, 1, "the following generation is counted as a regeneration");
    failReads = true;
    assert.equal(await firstGenerationRecorded("plan-live", "market/customers"), null, "an unreadable ledger is reported, not treated as a first generation");
  } finally {
    globalThis.fetch = original;
  }
}

function generateRouteWiring() {
  const route = readFileSync(new URL("../app/api/plan/generate/route.ts", import.meta.url), "utf8");
  const guard = route.indexOf('error: "plan_not_found"');
  assert(guard > 0, "generation refuses documents that are not saved on the server for this owner");
  assert.match(route, /if \(!body\.planId \|\| !savedPlan\)/, "no planId or a deleted/foreign planId is refused");
  for (const call of ["generateSection(config", "streamSection(", "generateAndSaveSection("]) {
    assert(route.indexOf(call) > guard, `${call} runs only after the saved-document check`);
  }
  assert.match(route, /firstGenerationRecorded\(savedPlan\.id, sectionKey\)/, "unsaved first generations are looked up");
  assert.match(route, /if \(existing\?\.markdown \|\| firstServed\)/, "a repeated unsaved generation goes through the regen quota");
  assert.equal(route.match(/await markFirstGeneration\(\)/g)?.length, 2, "both streaming and plain paths remember the first AI generation");
  assert.match(route, /regenPlanId = savedPlan\.id/);
}

async function main() {
  await purchaseRules();
  await iapSandbox();
  generateRouteWiring();
  await firstGenerationLedger();
  console.log("pay guards: deleted/foreign documents cannot be bought, sandbox receipts gated in production, unsaved first generations counted, generation requires a saved document");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
