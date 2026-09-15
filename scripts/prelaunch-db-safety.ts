import assert from "node:assert/strict";

export const PRELAUNCH_REF = "hagzlppubxxzxllsehbr";
export const PRELAUNCH_ORIGIN = `https://${PRELAUNCH_REF}.supabase.co`;

export function assertPrelaunchTarget(url: string, approval: string | undefined) {
  assert.equal(approval, "--allow-prelaunch-newapp", "Explicit prelaunch DB approval flag required");
  assert([PRELAUNCH_ORIGIN, `${PRELAUNCH_ORIGIN}/`].includes(url), "Only the approved newapp DB is allowed");
}

/** This test scope is separate from deployment guards: existing DBs stay blocked for staging. */
export function prelaunchScope(runId: string) {
  assert.match(runId, /^[a-f0-9]{16}$/);
  const owners = new Set<string>();
  const emails = new Set([`qa-prelaunch-${runId}-a@example.invalid`, `qa-prelaunch-${runId}-b@example.invalid`]);
  const prefix = `qa_${runId}_`;
  return {
    owners, emails, prefix,
    assertRequest(url: URL, method: string, body?: Record<string, unknown>) {
      assert.equal(url.origin, PRELAUNCH_ORIGIN, "External service calls are blocked");
      assert.equal(url.username + url.password + url.hash, "");
      assert.notEqual(method, "DELETE", "No deletion is allowed by this runner");
      if (method === "GET" && url.pathname === "/rest/v1/") return;
      if (url.pathname === "/rest/v1/plan_states") {
        assert(["GET", "POST", "PATCH"].includes(method));
        if (method !== "POST") {
          const filter = url.searchParams.get("owner_hash") ?? "";
          assert(filter.startsWith("eq.") && owners.has(filter.slice(3)), "Only this run's owner hashes may be accessed");
          assert([...url.searchParams.keys()].every(key => ["owner_hash", "select", "updated_at"].includes(key)), "Unscoped query is blocked");
        }
        if (method !== "GET") {
          assert(body && owners.has(String(body.owner_hash)), "Only synthetic owners may be written");
          if (method === "PATCH") assert.equal(url.searchParams.get("owner_hash"), `eq.${body.owner_hash}`);
          const state = body.data as { plans?: Array<{ id: string }> } | undefined;
          assert(state?.plans?.length && state.plans.every(plan => plan.id.startsWith(prefix)), "Only this run's plans may be written");
        }
        return;
      }
      if (url.pathname === "/auth/v1/admin/users" && method === "POST") {
        assert(emails.has(String(body?.email)), "Only this run's synthetic accounts may be created");
        assert.equal(body?.email_confirm, true, "Synthetic users must not trigger email delivery");
        return;
      }
      if (url.pathname === "/auth/v1/token" && method === "POST") {
        const grant = url.searchParams.get("grant_type");
        assert(grant === "refresh_token" || grant === "password");
        if (grant === "password") assert(emails.has(String(body?.email)));
        return;
      }
      if (url.pathname === "/auth/v1/user" && method === "GET") return;
      if (url.pathname === "/auth/v1/logout" && method === "POST") return;
      throw new Error("Endpoint is outside the approved synthetic DB test scope");
    },
  };
}
