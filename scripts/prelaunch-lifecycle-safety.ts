import assert from "node:assert/strict";
import { PRELAUNCH_ORIGIN, prelaunchScope } from "./prelaunch-db-safety";

export function prelaunchLifecycleScope(runId: string) {
  const base = prelaunchScope(runId);
  const users = new Set<string>(), projects = new Set<string>(), sites = new Set<string>(), slugs = new Set<string>();
  const known = (set: Set<string>, value: unknown) => typeof value === "string" && set.has(value);
  return {
    ...base, users, projects, sites, slugs,
    assertRequest(url: URL, method: string, body?: Record<string, any>) {
      assert.equal(url.origin, PRELAUNCH_ORIGIN);
      assert.equal(url.username + url.password + url.hash, "");
      const path = url.pathname, q = url.searchParams;
      const eq = (key: string, set: Set<string>) => {
        const value = q.get(key); return !!value?.startsWith("eq.") && set.has(value.slice(3));
      };
      if (path.startsWith("/rest/v1/rpc/")) {
        assert.equal(method, "POST"); assert(body);
        const name = path.slice("/rest/v1/rpc/".length);
        assert(known(base.owners, body.p_owner_hash ?? body.p_guest_hash));
        if (name === "commit_plan_state" || name === "claim_plan_state") {
          assert(!body.p_delete, "No plan deletion by the test runner");
          assert(Array.isArray(body.p_data?.plans) && body.p_data.plans.every((plan: { id: string }) => plan.id.startsWith(base.prefix)));
          if (name === "claim_plan_state") assert(known(base.owners, body.p_account_hash));
          return;
        }
        if (name === "ensure_plan_project") {
          assert(typeof body.p_plan_id === "string" && body.p_plan_id.startsWith(base.prefix));
          assert(body.p_owner_id === null || known(users, body.p_owner_id)); return;
        }
        if (["publish_landing_snapshot", "rollback_landing_snapshot"].includes(name)) {
          assert(known(projects, body.p_project_id)); return;
        }
        throw new Error("Unapproved RPC");
      }
      if (["/rest/v1/plan_owner_claims", "/rest/v1/projects", "/rest/v1/payment_orders", "/rest/v1/opportunity_preferences", "/rest/v1/project_stages", "/rest/v1/stage_artifacts", "/rest/v1/landing_sites", "/rest/v1/landing_versions", "/rest/v1/landing_events", "/rest/v1/landing_leads"].includes(path)) {
        assert(!q.has("and") && !q.has("not") && (path.endsWith("opportunity_preferences") || !q.has("or")), "Unscoped compound filter");
        if (path.endsWith("plan_owner_claims")) {
          assert(eq("guest_hash", base.owners) || eq("account_hash", base.owners));
          assert(method === "GET" || method === "PATCH" && Object.keys(body ?? {}).join() === "legacy_completed_at"); return;
        }
        if (path.endsWith("projects")) {
          assert(eq("id", projects) || eq("guest_token_hash", base.owners) || eq("owner_id", users));
          assert(method === "GET" || method === "PATCH" && Object.keys(body ?? {}).every(key => ["owner_id", "guest_token_hash"].includes(key)));
          if (method === "PATCH") { assert(known(base.owners, body?.guest_token_hash)); if (body?.owner_id) assert(known(users, body.owner_id)); } return;
        }
        if (path.endsWith("payment_orders")) {
          assert.equal(method, "PATCH"); assert(eq("guest_token_hash", base.owners));
          assert.deepEqual(Object.keys(body ?? {}), ["guest_token_hash"]); assert(known(base.owners, body?.guest_token_hash)); return;
        }
        if (path.endsWith("opportunity_preferences")) {
          if (method === "GET") {
            const parts = (q.get("or") ?? "").replace(/^\(|\)$/g, "").split(",");
            assert(parts.length > 0 && parts.every(part => {
              const [key, op, value] = part.split("."); return op === "eq" && (key === "owner_id" ? users.has(value) : key === "guest_token_hash" && base.owners.has(value));
            }));
          } else { assert.equal(method, "DELETE"); assert(eq("guest_token_hash", base.owners) || eq("owner_id", users)); }
          return;
        }
        if (path.endsWith("project_stages") || path.endsWith("stage_artifacts")) { assert.equal(method, "GET"); assert(eq("project_id", projects)); return; }
        if (path.endsWith("landing_sites")) {
          if (method === "POST") {
            assert(known(projects, body?.project_id) && known(slugs, body?.slug)); assert(known(slugs, body?.draft?.slug));
          } else {
            assert(eq("project_id", projects) || eq("id", sites) || eq("published_slug", slugs));
            if (method === "PATCH") {
              if (body?.status === "draft") assert.deepEqual(body, { status: "draft", published_slug: null });
              else { assert(known(slugs, body?.slug)); assert(known(slugs, body?.draft?.slug)); }
            } else assert.equal(method, "GET");
          }
          return;
        }
        assert(["GET", "HEAD"].includes(method)); assert(eq("site_id", sites)); return;
      }
      base.assertRequest(url, method, body);
    },
  };
}
