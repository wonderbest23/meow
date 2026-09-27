import assert from "node:assert/strict";
import { completeJson, streamText } from "../lib/llm/complete";
import { resolveIntakeLLMConfig } from "../lib/llm/intake-policy";
import { intakeDailyAllowance } from "../lib/plan-builder/intake-service";
import { IDEA_CALL_TIMEOUT_MS, IDEA_RESULT_DEADLINE_MS, intakeJobExpired } from "../lib/plan-builder/intake-timing";
import { intakeJobClock } from "../lib/plan-builder/intake-core";
import type { IntakeJob } from "../lib/plan-builder/intake-types";
import { betaApiBoundary } from "../lib/staging/beta-boundary";

Object.assign(process.env, { OPENAI_API_KEY: "synthetic-only", PLANNING_MODEL: "mock-beta", ANTHROPIC_API_KEY: "", INTAKE_BETA_SAFETY: "1" });
let calls = 0;
globalThis.fetch = async () => { calls++; return Response.json({ error: { type: "server_error" } }, { status: 503 }); };

async function main() {
  for (const [path, method] of [["/api/auth/google", "POST"], ["/api/auth/login", "POST"], ["/api/auth/session", "GET"], ["/api/auth/logout", "POST"], ["/api/plan/state", "GET"], ["/api/plan/state", "PUT"]]) {
    assert.equal(betaApiBoundary(new Request(`https://beta.invalid${path}`, { method }), "1"), null, `${method} ${path} must reach real authentication/storage`);
  }
  assert.equal(betaApiBoundary(new Request("https://beta.invalid/api/auth/google"), "1")?.status, 403);
  assert.equal(betaApiBoundary(new Request("https://beta.invalid/api/auth/session", { method: "POST" }), "1"), null, "real OAuth callback must reach token verification");
  assert.equal(betaApiBoundary(new Request("https://beta.invalid/api/auth/kakao"), "1"), null);
  for (const path of ["/api/brand/logo", "/api/support/assistant", "/api/plan/generate", "/api/presentations/assist", "/__internal/draft-package", "/api/unknown"]) {
    const request = new Request(`https://beta.invalid${path}`, { method: "POST" });
    assert.equal(betaApiBoundary(request, "1")?.status, 403);
    assert.equal(betaApiBoundary(request, undefined), null);
  }
  assert.equal(betaApiBoundary(new Request("https://beta.invalid/api/plan/chat", { method: "POST" }), "1")?.status, 403);
  assert.equal(betaApiBoundary(new Request("https://beta.invalid/api/plan/chat", { method: "POST", headers: { "x-business-intake": "2" } }), "1"), null);
  const unprotected = { provider: "openai" as const, apiKey: "synthetic-only", model: "mock-beta" };
  const failures: string[] = [];
  const request = { system: "test", user: "test", maxOutputTokens: 10, onFailure: (event: { code: string }) => failures.push(event.code) };
  assert.equal(await completeJson(unprotected, request), null);
  assert.equal(await streamText(unprotected, request, () => { throw Error("blocked stream emitted text"); }), null);
  assert.deepEqual(failures, ["quota_exhausted", "quota_exhausted"]);
  assert.equal(calls, 0, "beta legacy and streaming requests must stop before provider transport");
  for (const feature of ["ideas", "design", "help", "extract"] as const) {
    const key = `INTAKE_${feature.toUpperCase()}_FAILOVER_POLICY`;
    delete process.env[key];
    assert.equal(resolveIntakeLLMConfig("test", feature), null, "beta cannot use unbudgeted legacy config");
    process.env[key] = JSON.stringify({ primary: "openai", fallback: "anthropic", totalTimeoutMs: 60000, attemptTimeoutMs: 60000, minRemainingMs: 500, allowedErrors: ["unavailable"], qualifiedModels: [{ provider: "openai", model: "mock-beta" }] });
    const config = resolveIntakeLLMConfig("test", feature)!;
    assert(config);
    assert.equal(config.execution!.alternate, null);
    assert.deepEqual(config.execution!.allowedErrors, []);
    assert.equal(config.execution!.totalTimeoutMs, ["ideas", "design"].includes(feature) ? 60000 : 20000);
    assert.equal(await completeJson(config, { system: "test", user: "test", maxOutputTokens: 10 }), null);
    assert.equal(calls, 0, "missing ledger denies before sending");
    delete process.env[key];
  }
  for (const shared of [null, { error: null, data: NaN }, { error: null, data: 0 }, { error: null, data: "1" }, { error: { code: "down" }, data: 1 }]) {
    assert.deepEqual(intakeDailyAllowance(shared, () => { throw Error("no beta memory bypass"); }), { ok: false, source: "unavailable" });
  }
  assert.deepEqual(intakeDailyAllowance({ error: null, data: 24 }, () => false), { ok: true, source: "shared" });
  assert.deepEqual(intakeDailyAllowance({ error: null, data: 25 }, () => true), { ok: false, source: "shared" });
  const start = Date.parse("2026-01-01T00:00:00Z");
  const job = { kind: "ideas", status: "running", createdAt: new Date(start).toISOString(), updatedAt: new Date(start + 30000).toISOString() } as IntakeJob;
  assert.equal(IDEA_CALL_TIMEOUT_MS, 60000);
  assert.equal(IDEA_RESULT_DEADLINE_MS, 120000);
  assert.equal(intakeJobExpired(job, start + 119999), false);
  assert.equal(intakeJobExpired(job, start + 120000), true);
  assert.equal(intakeJobClock(job, start + 120000)!.limitMs, 120000);
  assert.equal(intakeJobClock(job, start + 120000)!.elapsedMs, 120000);
  delete process.env.INTAKE_BETA_SAFETY;
  assert(resolveIntakeLLMConfig("test", "ideas"), "legacy behavior unchanged outside beta");
  assert.deepEqual(intakeDailyAllowance(null, () => true), { ok: true, source: "memory" });
  console.log("PASS beta policy/ledger fail-closed, shared user limit, deadline agreement, legacy compatibility; real AI calls=0");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
