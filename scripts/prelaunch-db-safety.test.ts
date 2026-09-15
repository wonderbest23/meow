import assert from "node:assert/strict";
import { PRELAUNCH_ORIGIN, assertPrelaunchTarget, prelaunchScope } from "./prelaunch-db-safety";

assertPrelaunchTarget(PRELAUNCH_ORIGIN, "--allow-prelaunch-newapp");
for (const url of ["http://127.0.0.1:55431", "https://nurpesdatxgspsifsllu.supabase.co", `${PRELAUNCH_ORIGIN}.example.com`, `${PRELAUNCH_ORIGIN}/rest/v1`, `${PRELAUNCH_ORIGIN}?x=1`]) {
  assert.throws(() => assertPrelaunchTarget(url, "--allow-prelaunch-newapp"));
}
assert.throws(() => assertPrelaunchTarget(PRELAUNCH_ORIGIN, undefined));
const scope = prelaunchScope("0123456789abcdef"), owner = "a".repeat(64);
scope.owners.add(owner);
const request = (path: string, method = "GET", body?: Record<string, unknown>) => scope.assertRequest(new URL(path, PRELAUNCH_ORIGIN), method, body);
const row = { owner_hash: owner, data: { plans: [{ id: `${scope.prefix}b2b` }] } };
request("/rest/v1/");
request(`/rest/v1/plan_states?owner_hash=eq.${owner}&select=data`);
request("/rest/v1/plan_states", "POST", row);
request(`/rest/v1/plan_states?owner_hash=eq.${owner}`, "PATCH", row);
request("/auth/v1/admin/users", "POST", { email: [...scope.emails][0], email_confirm: true });
for (const path of ["/rest/v1/projects", "/rest/v1/payment_orders", "/rest/v1/rpc/commit_plan_state", "/auth/v1/admin/users", "/rest/v1/plan_states", `/rest/v1/plan_states?owner_hash=eq.${owner}&or=(owner_hash.neq.x)`, "/rest/v1/plan_states?owner_hash=neq.x", "/rest/v1/plan_states?owner_hash=eq.other"]) assert.throws(() => request(path));
assert.throws(() => request(`/rest/v1/plan_states?owner_hash=eq.${owner}`, "DELETE"));
assert.throws(() => request("/rest/v1/plan_states", "POST", { ...row, owner_hash: "outside" }));
assert.throws(() => request("/rest/v1/plan_states", "POST", { ...row, data: { plans: [{ id: "existing-plan" }] } }));
assert.throws(() => request("/auth/v1/admin/users", "POST", { email: "real@example.com", email_confirm: true }));
assert.throws(() => request("/auth/v1/admin/users", "POST", { email: [...scope.emails][0] }));
assert.throws(() => request("https://api.openai.com/v1/responses", "POST"));
console.log("Prelaunch DB guard: explicit target, synthetic scope, no deletes/payments/AI passed");
