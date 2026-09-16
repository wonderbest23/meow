import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLandingLeadEmail, landingEmailConfiguration, sendLandingLeadEmail } from "../lib/landing/lead-email";
import { notificationIdempotencyExpired, notificationRetryDelay, processLandingLeadNotification } from "../lib/landing/lead-notifications";

async function main() {
  assert.equal(landingEmailConfiguration({}), null);
  assert.equal(landingEmailConfiguration({ RESEND_API_KEY: "fake" }), null);
  assert.equal(landingEmailConfiguration({ RESEND_API_KEY: "fake", NOTIFY_FROM_EMAIL: "onboarding@resend.dev" }), null);
  assert.equal(notificationRetryDelay(1), 60_000);
  assert.equal(notificationRetryDelay(4), 7_200_000);
  assert.ok(notificationIdempotencyExpired(new Date(Date.now() - 24 * 60 * 60_000).toISOString(), true));
  assert.ok(!notificationIdempotencyExpired(new Date().toISOString(), true));
  const payload = buildLandingLeadEmail("alerts@example.com", "owner@example.com");
  const calls: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
  const transport = (async (_url: unknown, init?: RequestInit) => {
    calls.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ id: "provider-test" }), { status: 200 });
  }) as typeof fetch;
  assert.deepEqual(await sendLandingLeadEmail(payload, "fake-key", "notification-1", transport), { ok: true, providerId: "provider-test" });
  assert.equal(calls[0].headers.get("Idempotency-Key"), "notification-1");
  assert.ok(!JSON.stringify(calls[0].body).includes("visitor-secret"));
  assert.equal((await sendLandingLeadEmail(payload, "fake", "key", (async () => new Response("private body", { status: 429 })) as typeof fetch)).ok, false);
  assert.deepEqual(await sendLandingLeadEmail(payload, "fake", "key", (async () => new Response("private body", { status: 400 })) as typeof fetch), { ok: false, code: "provider_rejected", retryable: false, ambiguous: false });
  assert.deepEqual(await sendLandingLeadEmail(payload, "fake", "key", (async () => new Response(JSON.stringify({ name: "concurrent_idempotent_requests" }), { status: 409 })) as typeof fetch), { ok: false, code: "provider_unavailable", retryable: true, ambiguous: true });
  assert.deepEqual(await sendLandingLeadEmail(payload, "fake", "key", (async () => { throw new Error("email=visitor-secret@example.com"); }) as typeof fetch), { ok: false, code: "delivery_unknown", retryable: true, ambiguous: true });

  function fixture() {
    const row: Record<string, any> = { lead_id: "lead-1", site_id: "site-1", status: "pending", attempts: 0, next_attempt_at: new Date(0).toISOString(), first_attempt_at: null, delivery_uncertain: false, payload: null, accepted_at: null, error_code: null, lease_token: null };
    let failFinish = false;
    const db = {
      rpc: async (_name: string, args: Record<string, unknown>) => {
        if (row.status === "sent" || row.lease_token || row.attempts >= 5 || (!args.p_force && row.status === "blocked")) return { data: [], error: null };
        row.status = "processing"; row.lease_token = args.p_token;
        return { data: [structuredClone(row)], error: null };
      },
      auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" } }, error: null }) } },
      from: (table: string) => {
        let patch: Record<string, unknown> | null = null;
        const predicates: Record<string, unknown> = {};
        const query = {
          select: (_fields?: string) => query,
          update: (data: Record<string, unknown>) => { patch = data; return query; },
          eq: (key: string, value: unknown) => { predicates[key] = value; return query; },
          maybeSingle: async () => ({ data: table === "landing_sites" ? { project_id: "project-1" } : { owner_id: "owner-1" }, error: null }),
          then: (resolve: (data: unknown) => unknown) => {
            if (failFinish && patch?.status === "sent") { failFinish = false; return Promise.resolve(resolve({ data: null, error: { message: "fake failure" } })); }
            const matches = Object.entries(predicates).every(([key, value]) => row[key] === value);
            if (matches && patch) Object.assign(row, patch);
            return Promise.resolve(resolve({ data: matches ? [{ lead_id: row.lead_id }] : [], error: null }));
          },
        };
        return query;
      },
    } as unknown as SupabaseClient;
    return { row, db, failNextFinish: () => { failFinish = true; } };
  }
  const config = { key: "fake", from: "alerts@example.com" };
  const a = fixture(); const start = calls.length;
  await processLandingLeadNotification("lead-1", false, { db: a.db, config: null, transport });
  assert.equal(a.row.status, "blocked"); assert.equal(a.row.error_code, "missing_email_config"); assert.equal(a.row.attempts, 0); assert.equal(calls.length, start);
  await processLandingLeadNotification("lead-1", true, { db: a.db, config, transport });
  assert.equal(a.row.status, "sent"); assert.equal(a.row.attempts, 1); assert.ok(a.row.accepted_at);
  await processLandingLeadNotification("lead-1", true, { db: a.db, config, transport });
  assert.equal(calls.length, start + 1, "Accepted email is never re-sent");

  const b = fixture(); let failingCalls = 0;
  const unavailable = (async () => { failingCalls++; return new Response("unavailable", { status: 503 }); }) as typeof fetch;
  for (let index = 0; index < 5; index++) await processLandingLeadNotification("lead-1", true, { db: b.db, config, transport: unavailable });
  assert.equal(b.row.status, "failed"); assert.equal(b.row.attempts, 5);
  await processLandingLeadNotification("lead-1", true, { db: b.db, config, transport: unavailable });
  assert.equal(failingCalls, 5);

  const c = fixture(); const concurrent = calls.length;
  await Promise.all([processLandingLeadNotification("lead-1", false, { db: c.db, config, transport }), processLandingLeadNotification("lead-1", false, { db: c.db, config, transport })]);
  assert.equal(calls.length, concurrent + 1, "Concurrent workers share one lease");
  const d = fixture(); d.failNextFinish();
  await assert.rejects(processLandingLeadNotification("lead-1", false, { db: d.db, config, transport }), /SAVE_FAILED/);
  assert.equal(d.row.status, "processing"); assert.ok(d.row.delivery_uncertain); assert.ok(d.row.payload);
  d.row.lease_token = null;
  const priorBody = calls[calls.length - 1];
  await processLandingLeadNotification("lead-1", false, { db: d.db, config, transport });
  assert.equal(d.row.status, "sent");
  assert.deepEqual(calls[calls.length - 1].body, priorBody.body);
  assert.equal(calls[calls.length - 1].headers.get("Idempotency-Key"), priorBody.headers.get("Idempotency-Key"));
  const e = fixture(); Object.assign(e.row, { first_attempt_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString(), delivery_uncertain: true, payload });
  const beforeExpired = calls.length;
  await processLandingLeadNotification("lead-1", false, { db: e.db, config, transport });
  assert.equal(e.row.status, "failed"); assert.equal(e.row.error_code, "delivery_unknown"); assert.equal(calls.length, beforeExpired);
  console.log("landing-lead-notifications: configuration, no PII payload/log error, provider rejection, retry limits, lease concurrency, durable request, duplicate-safe recovery and ambiguity cutoff passed (mock transport only)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
