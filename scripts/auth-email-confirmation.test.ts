import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";

async function main() {
  const require = createRequire(import.meta.url);
  const originals = new Map<string, NodeJS.Module | undefined>();
  function mock(path: string, exports: unknown) {
    const id = require.resolve(path);
    originals.set(id, require.cache[id]);
    const mod = new Module(id); mod.filename = id; mod.loaded = true; mod.exports = exports;
    require.cache[id] = mod;
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unexpected external request"); };
  let settings = true, sent = 0, claims = 0, sessions = 0, consentWrites = 0, adminCreates = 0, logins = 0;
  let signUpInput: Record<string, unknown> | undefined;
  let signupError: { code: string; message: string } | null = null;
  let recoverError: { code?: string; status?: number; message: string } | null = null;
  let updateError: { code?: string; status?: number; message: string } | null = null;
  let duplicate = false, immediateSession = false, confirmed = false, invalidSession = false;
  const user = () => ({ id: "synthetic-user", email: "synthetic@example.invalid", email_confirmed_at: confirmed ? "2026-09-22T00:00:00Z" : undefined, identities: duplicate ? [] : [{ id: "synthetic-identity" }] });
  mock("../lib/account-auth", {
    emailConfirmationEnabled: async () => settings,
    createServerAuthClient: () => ({ auth: {
      admin: { createUser: async () => { adminCreates++; return { data: { user: user() }, error: null }; } },
      signInWithPassword: async () => { logins++; return { data: { user: user(), session: {} }, error: null }; },
      signUp: async (input: Record<string, unknown>) => { sent++; signUpInput = input; return { data: { user: user(), session: immediateSession ? {} : null }, error: signupError }; },
      setSession: async () => ({ data: { user: user(), session: invalidSession ? null : {} }, error: invalidSession ? { message: "invalid" } : null }),
      resetPasswordForEmail: async () => ({ data: {}, error: recoverError }),
      updateUser: async () => ({ data: { user: user() }, error: updateError }),
    } }),
    currentGuestHash: async () => "synthetic-guest",
    claimGuestProjects: async () => { claims++; },
    setAccountSession: async () => { sessions++; },
  });
  mock("../lib/persistence", { getServerSupabase: () => ({ from: () => ({ upsert: async () => { consentWrites++; return { error: null }; } }) }) });
  mock("../lib/rate-limit", { enforceRateLimit: async () => null });
  const register = require("../app/api/auth/register/route") as typeof import("../app/api/auth/register/route");
  const session = require("../app/api/auth/session/route") as typeof import("../app/api/auth/session/route");
  const login = require("../app/api/auth/login/route") as typeof import("../app/api/auth/login/route");
  const recover = require("../app/api/auth/recover/route") as typeof import("../app/api/auth/recover/route");
  const reset = require("../app/api/auth/reset/route") as typeof import("../app/api/auth/reset/route");
  const recoverRequest = (email = "synthetic@example.invalid") => new Request("https://beta.example.invalid/api/auth/recover", { method: "POST", body: JSON.stringify({ email }) });
  const resetRequest = () => new Request("https://beta.example.invalid/api/auth/reset", { method: "POST", body: JSON.stringify({ accessToken: "synthetic-access", refreshToken: "synthetic-refresh", password: "synthetic-password-2" }) });
  const input = { email: "synthetic@example.invalid", password: "synthetic-password-only", terms: true, privacy: true, aiNotice: true };
  const registerRequest = () => new Request("https://beta.example.invalid/api/auth/register", { method: "POST", body: JSON.stringify(input) });
  const sessionRequest = () => new Request("https://beta.example.invalid/api/auth/session", { method: "POST", body: JSON.stringify({ accessToken: "synthetic-access", refreshToken: "synthetic-refresh" }) });
  const failures: string[] = [];
  let passed = 0;
  async function check(name: string, run: () => Promise<void>) {
    settings = true; sent = claims = sessions = consentWrites = adminCreates = logins = 0;
    signupError = recoverError = updateError = null; duplicate = immediateSession = confirmed = invalidSession = false;
    try { await run(); passed++; console.log(`PASS ${name}`); }
    catch (e) { failures.push(name); console.error(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  try {
    await check("registration sends confirmation, never creates confirmed identity/session/claim", async () => {
      const response = await register.POST(registerRequest());
      const body = await response.json();
      assert.equal(response.status, 202); assert.equal(body.authenticated, false); assert.equal(body.confirmationRequired, true);
      assert.equal(sent, 1); assert.equal(adminCreates + logins + claims + sessions, 0);
      assert.equal(consentWrites, 1);
      assert.equal((signUpInput?.options as { emailRedirectTo: string }).emailRedirectTo, "https://beta.example.invalid/account");
    });
    await check("disabled confirmation setting blocks before creating any account", async () => {
      settings = false; const response = await register.POST(registerRequest());
      assert.equal(response.status, 503); assert.equal(sent + adminCreates + logins + claims + sessions, 0);
    });
    await check("provider email failure is not reported as sent or logged in", async () => {
      signupError = { code: "email_address_not_authorized", message: "synthetic provider internal detail" };
      const response = await register.POST(registerRequest()); const body = await response.json();
      assert.equal(response.status, 503); assert.equal(body.error.code, "EMAIL_DELIVERY_UNAVAILABLE");
      assert.equal(claims + sessions + consentWrites, 0); assert.equal(JSON.stringify(body).includes(signupError.message), false);
    });
    await check("obfuscated existing account does not overwrite its consent or reveal its existence", async () => {
      duplicate = true; const response = await register.POST(registerRequest());
      assert.equal(response.status, 202); assert.equal(consentWrites + claims + sessions, 0);
    });
    await check("unexpected signup session is not accepted", async () => {
      immediateSession = true; const response = await register.POST(registerRequest());
      assert.equal(response.status, 503); assert.equal(claims + sessions + consentWrites, 0);
    });
    await check("unconfirmed token exchange cannot link guest data or set cookies", async () => {
      const response = await session.POST(sessionRequest());
      assert.equal(response.status, 403); assert.equal(claims + sessions, 0);
    });
    await check("provider-confirmed callback links and establishes session", async () => {
      confirmed = true; const response = await session.POST(sessionRequest());
      assert.equal(response.status, 200); assert.equal(claims, 1); assert.equal(sessions, 1);
    });
    await check("invalid callback keeps guest data and session untouched", async () => {
      invalidSession = true; const response = await session.POST(sessionRequest());
      assert.equal(response.status, 400); assert.equal(claims + sessions, 0);
    });
    await check("unconfirmed password login cannot establish a session or claim data", async () => {
      const response = await login.POST(registerRequest());
      assert.equal(response.status, 403); assert.equal(claims + sessions, 0);
    });
    await check("existing confirmed password login remains available", async () => {
      confirmed = true; const response = await login.POST(registerRequest());
      assert.equal(response.status, 200); assert.equal(claims, 1); assert.equal(sessions, 1);
    });
    await check("password recovery never shows raw Supabase text (rate limit, quota, unknown)", async () => {
      const ok = await recover.POST(recoverRequest());
      assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), { sent: true });
      recoverError = { code: "over_email_send_rate_limit", status: 429, message: "For security purposes, you can only request this after 60 seconds." };
      const limited = await recover.POST(recoverRequest()); const limitedBody = await limited.json();
      assert.equal(limited.status, 429);
      assert.equal(limitedBody.error.message, "잠시 후 다시 시도해 주세요. 메일은 1분에 한 번 보낼 수 있어요.");
      recoverError = { code: "over_email_send_rate_limit", status: 429, message: "Email rate limit exceeded" };
      assert.equal((await (await recover.POST(recoverRequest())).json()).error.message, "지금은 메일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.");
      recoverError = { code: "unexpected_failure", status: 500, message: "Error sending recovery email" };
      const failed = await (await recover.POST(recoverRequest())).json();
      assert.equal(failed.error.message, "비밀번호 재설정 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      assert.ok(!/[A-Za-z]{4,}/.test(failed.error.message), "영어 원문이 섞이지 않는다");
      recoverError = null;
      assert.equal((await (await recover.POST(recoverRequest("not-an-email"))).json()).error.message, "이메일 주소를 다시 확인해 주세요.");
    });
    await check("password reset maps provider errors to fixed Korean text", async () => {
      updateError = { code: "same_password", status: 422, message: "New password should be different from the old password." };
      assert.equal((await (await reset.POST(resetRequest())).json()).error.message, "지금 쓰는 비밀번호와 다른 비밀번호를 입력해 주세요.");
      updateError = { code: "weak_password", status: 422, message: "Password should contain at least one character of each: abc" };
      assert.match((await (await reset.POST(resetRequest())).json()).error.message, /비밀번호가 너무 쉬워요/);
      updateError = null; invalidSession = true;
      assert.equal((await (await reset.POST(resetRequest())).json()).error.message, "비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
      assert.equal(claims + sessions, 0);
    });
    await check("signup resend within a minute explains the wait instead of provider text", async () => {
      signupError = { code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 42 seconds." };
      const response = await register.POST(registerRequest()); const body = await response.json();
      assert.equal(response.status, 429); assert.equal(body.error.code, "EMAIL_RATE_LIMITED");
      assert.ok(!JSON.stringify(body).includes("security purposes"));
      assert.equal(consentWrites, 0);
    });
    await check("confirmation pending UI distinguishes email confirmation from login", async () => {
      // 로그인 폼은 로그인 화면과 팝업이 같이 쓰는 컴포넌트로 옮겼다
      const source = readFileSync("components/account-auth-form.tsx", "utf8");
      assert.ok(/result\.confirmationRequired/.test(source), "missing confirmation pending UI branch");
      assert.ok(/확인 메일/.test(source), "missing confirmation email guidance");
    });
    await check("real auth-settings reader fails closed on disabled/missing/error settings", async () => {
      const id = require.resolve("../lib/account-auth");
      delete require.cache[id];
      const realAuth = require("../lib/account-auth") as typeof import("../lib/account-auth");
      const priorUrl = process.env.SUPABASE_URL, priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_URL = "https://synthetic.example.invalid";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-settings-key";
      try {
        for (const [data, expected] of [
          [{ mailer_autoconfirm: false, external: { email: true } }, true],
          [{ mailer_autoconfirm: true, external: { email: true } }, false],
          [{ mailer_autoconfirm: false }, false], [null, false],
          [{ email_autoconfirm: false, external: { email: true } }, false],
        ] as const) {
          globalThis.fetch = async (url, init) => {
            assert.equal(url, "https://synthetic.example.invalid/auth/v1/settings");
            assert.equal(init?.redirect, "manual"); assert.equal(init?.cache, "no-store"); assert.ok(init?.signal);
            return Response.json(data);
          };
          assert.equal(await realAuth.emailConfirmationEnabled(), expected);
        }
        for (const status of [301, 302, 307, 308]) {
          let calls = 0;
          globalThis.fetch = async (_url, init) => {
            calls++;
            assert.equal(init?.redirect, "manual");
            return new Response(null, { status, headers: { Location: "https://untrusted.invalid/settings" } });
          };
          assert.equal(await realAuth.emailConfirmationEnabled(), false);
          assert.equal(calls, 1, "redirect must not trigger a follow-up request");
        }
        globalThis.fetch = async () => new Response("unavailable", { status: 503 });
        assert.equal(await realAuth.emailConfirmationEnabled(), false);
        globalThis.fetch = async () => { throw Error("network unavailable"); };
        assert.equal(await realAuth.emailConfirmationEnabled(), false);
      } finally {
        const environment = process.env as Record<string, string | undefined>;
        if (priorUrl === undefined) delete environment.SUPABASE_URL; else environment.SUPABASE_URL = priorUrl;
        if (priorKey === undefined) delete environment.SUPABASE_SERVICE_ROLE_KEY; else environment.SUPABASE_SERVICE_ROLE_KEY = priorKey;
        delete require.cache[id];
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [id, original] of originals) { if (original) require.cache[id] = original; else delete require.cache[id]; }
  }
  console.log(JSON.stringify({ passed, failed: failures.length, failures, externalCalls: 0, scope: "real route handlers with synthetic auth/database boundary; not delivered-email or real-session proof" }));
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
