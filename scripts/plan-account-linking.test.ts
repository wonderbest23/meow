import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  process.env.PLAN_ACCOUNT_LINKING_ENABLED = "true";
  const { savePlanState, loadPlanState, normalizeState, claimGuestPlanState, planGuestWasClaimed } = await import("../lib/plan-builder/plan-server-store");
  const { accountLinkError, planOwnerKey } = await import("../lib/plan-builder/account-linking");
  const now = new Date().toISOString();
  const plan = (id: string) => ({ id, title: id, planType: "창업 초기 · 사업계획서", createdAt: now, updatedAt: now, sections: { "overview/summary": { markdown: "Saved draft", html: "<p>Saved draft</p>", generatedAt: now, edited: true, locked: true } }, answers: { __business_coach: { state: { version: "test", revision: 3, fields: [], messages: [{ id: "user-1", role: "user", text: "My business" }] } }, __deck_job: { status: "failed", token: "deck-1", draft: { slides: [{ title: "Saved slide" }] } } } });
  const guest = normalizeState({ plans: [plan("guest-plan")], activePlanId: "guest-plan" });
  await savePlanState("guest", guest);
  await savePlanState("account-a", normalizeState({ plans: [plan("existing-plan")] }));
  assert.equal(await claimGuestPlanState("guest", "account-a"), "claimed");
  const account = await loadPlanState("account-a");
  assert.deepEqual(account.plans.map(p => p.id).sort(), ["existing-plan", "guest-plan"]);
  assert.deepEqual(account.plans.find(p => p.id === "guest-plan"), guest.plans[0]);
  assert.equal(account.activePlanId, "guest-plan");
  assert.equal((await loadPlanState("guest")).plans.length, 0);
  assert.equal(await planGuestWasClaimed("guest"), true);
  assert.equal(await claimGuestPlanState("guest", "account-a"), "claimed");
  assert.equal(await claimGuestPlanState("guest", "account-b"), "consumed");
  assert.equal((await loadPlanState("account-b")).plans.length, 0);
  await assert.rejects(savePlanState("guest", guest), /PLAN_OWNER_CHANGED/);

  const busy = structuredClone(guest);
  busy.plans[0].answers.__coach_job = { status: "running" };
  await savePlanState("busy", busy);
  await assert.rejects(claimGuestPlanState("busy", "account-a"), /PLAN_CLAIM_BUSY/);
  assert.deepEqual(await loadPlanState("busy"), busy);
  assert.equal(await planGuestWasClaimed("busy"), false);
  assert.equal(accountLinkError(new Error("PLAN_CLAIM_BUSY"))?.status, 409);
  assert.equal(accountLinkError(new Error("PLAN_CLAIM_FAILED"))?.status, 503);
  assert.equal(accountLinkError(new Error("wrong password")), null);
  assert.notEqual(planOwnerKey("account-a"), planOwnerKey("account-b"));
  for (const route of ["login", "google", "register", "reset", "session"]) {
    assert.match(await readFile(`app/api/auth/${route}/route.ts`, "utf8"), /accountLinkError\(error\)/);
  }
  console.log("Account linking: full server records, idempotency, single owner, busy preservation and error messages passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
