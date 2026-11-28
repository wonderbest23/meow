import assert from "node:assert/strict";

/*
 * 로그인 때 손님 상태 옮기기(claimGuestProjects) — 2026-11-28 운영: 새 브라우저에서 둘러보기만 하고 로그인하면
 * 옮길 것이 없는데도 옮기기가 실패해 '작성한 사업을 계정에 연결하지 못했어요'(503)로 로그인이 막혔고, 이유는 로그에 남지 않았다.
 * 가짜 Supabase(REST 응답을 흉내)로: 빈 손님이면 로그인을 이어 가고, 옮길 것이 있으면 예전처럼 막고, 두 경우 모두 이유를 남기는지.
 */
process.env.PERSISTENCE_MODE = "supabase";
process.env.SUPABASE_URL = "https://fake-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.AUTH_PROJECT_SECRET = "login-claim-test-secret";
process.env.PLAN_ACCOUNT_LINKING_ENABLED = "true";
process.env.PLAN_QUARANTINE_ENABLED = "0";

type Scenario = { guestPlans: unknown[]; guestProjects: number; claimError?: string; projectsUpdateError?: string };
let scenario: Scenario = { guestPlans: [], guestProjects: 0 };
const calls: string[] = [];
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  const table = url.pathname.replace("/rest/v1/", "");
  const filter = decodeURIComponent(url.search);
  calls.push(`${method} ${table}`);
  if (method === "HEAD") {
    const count = table === "projects" && filter.includes("guest_token_hash=eq.guest-hash") ? scenario.guestProjects : 0;
    return new Response(null, { status: 200, headers: { "content-range": `*/${count}` } });
  }
  if (table === "plan_states" && method === "GET") {
    if (filter.includes("owner_hash=eq.guest-hash")) return json(scenario.guestPlans.length ? [{ data: { plans: scenario.guestPlans }, updated_at: "2026-11-28T10:00:00.000000+00:00" }] : []);
    return json([{ data: { plans: [{ id: "account-plan", title: "단지 상가 수제 도시락", sections: {} }] }, updated_at: "2026-11-26T10:00:00.000000+00:00" }]);
  }
  if (table === "rpc/claim_plan_state") return scenario.claimError ? json({ code: "P0001", message: scenario.claimError, details: null, hint: null }, 400) : json("claimed");
  if (table === "plan_owner_claims" && method === "GET") return json([]);
  if (table === "projects" && method === "PATCH") return scenario.projectsUpdateError ? json({ code: "P0001", message: scenario.projectsUpdateError }, 400) : json(null, 204);
  if (method === "PATCH" || method === "DELETE" || method === "POST") return json(null, 204);
  if (method === "GET") return json([]);
  throw new Error(`unexpected ${method} ${url.pathname}`);
}) as typeof fetch;

const logs: string[] = [];
const original = { error: console.error, info: console.info };
console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
console.info = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };

async function main() {
  const { claimGuestProjects } = await import("../lib/account-auth");
  const { hashIdentityToken } = await import("../lib/identity-tokens");
  void hashIdentityToken;

  // 1) 빈 손님(둘러보기만) + 옮기기 거절(예: 옛 사업 격리) → 로그인은 이어 간다, 이유는 남긴다
  scenario = { guestPlans: [], guestProjects: 0, claimError: "PLAN_QUARANTINED" };
  logs.length = 0;
  await claimGuestProjects("user-1", "guest-hash");
  assert.ok(logs.some(line => line.includes("plan-claim-failed") && line.includes("PLAN_CLAIM_FAILED")), "실패 이유를 남긴다");
  assert.ok(logs.some(line => line.includes("plan-claim-skipped-empty-guest")), "빈 손님이라 로그인을 막지 않는다");

  // 2) 손님에게 쓰던 사업이 있으면 예전처럼 막는다(작업을 잃지 않게)
  scenario = { guestPlans: [{ id: "guest-plan" }], guestProjects: 0, claimError: "PLAN_QUARANTINED" };
  logs.length = 0;
  await assert.rejects(claimGuestProjects("user-1", "guest-hash"), /PLAN_CLAIM_FAILED/);
  assert.ok(logs.some(line => line.includes("plan-claim-failed")) && !logs.some(line => line.includes("skipped")));
  // 프로젝트만 있는 손님도 막는다
  scenario = { guestPlans: [], guestProjects: 1, claimError: "PLAN_QUARANTINED" };
  await assert.rejects(claimGuestProjects("user-1", "guest-hash"), /PLAN_CLAIM_FAILED/);

  // 3) 손님 없이(쿠키 없음) 계정 쪽 정리만 실패해도 로그인은 이어 간다
  scenario = { guestPlans: [], guestProjects: 0, projectsUpdateError: "PLAN_QUARANTINED" };
  logs.length = 0;
  await claimGuestProjects("user-1", null);
  assert.ok(logs.some(line => line.includes("plan-claim-failed") && line.includes("PLAN_QUARANTINED")), "DB 오류 이유가 남는다");

  // 4) 평소(실패 없음)에는 아무것도 바뀌지 않는다
  scenario = { guestPlans: [{ id: "guest-plan" }], guestProjects: 0 };
  logs.length = 0; calls.length = 0;
  await claimGuestProjects("user-1", "guest-hash");
  assert.ok(calls.includes("POST rpc/claim_plan_state"), "옮기기를 그대로 부른다");
  assert.ok(!logs.some(line => line.includes("plan-claim")), "성공이면 로그 없음");

  // 로그에 긴 해시 · 이메일이 들어가지 않는다
  scenario = { guestPlans: [], guestProjects: 0, projectsUpdateError: "duplicate key 0123456789abcdef0123456789abcdef" };
  logs.length = 0;
  await claimGuestProjects("user-1", null);
  assert.ok(logs.every(line => !/[0-9a-f]{16,}/i.test(line)), "긴 해시는 가린다");

  console.error = original.error; console.info = original.info;
  console.log("login claim: empty guest never blocks login, guest with work still blocks, failure reason logged without hashes");
}

main().catch(error => { console.error = original.error; console.error(error); process.exit(1); });
