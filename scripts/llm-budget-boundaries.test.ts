import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fork } from "node:child_process";
import { SqliteAiBudget, type BudgetPrice } from "../lib/llm/budget-sqlite";
import type { BudgetAttempt, BudgetLease, ProviderUsage } from "../lib/llm/budget";

const prices: BudgetPrice[] = [{ provider: "openai", model: "fixture", source: "SYNTHETIC TEST ONLY", checkedAt: 0, expiresAt: 4102444800000, inputMicrosPerMillion: 1000000, outputMicrosPerMillion: 1000000, maxInputTokens: 200000, maxOutputTokens: 1000 }];
const attempt = (): BudgetAttempt => ({ provider: "openai", model: "fixture", attempt: 0, inputBytes: 100, maxOutputTokens: 100, deadline: Date.now() + 60000, requestFingerprint: "a".repeat(64) });
const large: ProviderUsage = { provider: "openai", model: "fixture", inputTokens: 100000, outputTokens: 101 };
const small: ProviderUsage = { ...large, inputTokens: 10, outputTokens: 5 };
async function reserve(db: SqliteAiBudget, service: string, job: string): Promise<BudgetLease> {
  const value = await db.forJob(service, job)(attempt());
  assert(value && typeof value !== "boolean");
  return value;
}
// White-box restart verification of the existing transactional settlement implementation.
// This is not a new public recovery endpoint or a claim that one exists.
function replay(db: SqliteAiBudget, id: string, usage: ProviderUsage | null) {
  const internal = db as unknown as { transaction<T>(fn: () => T): T; settle(id: string, usage: ProviderUsage | null): void };
  return internal.transaction(() => internal.settle(id, usage));
}
const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: "/private/tmp", NODE_ENV: "test", TSX_DISABLE_CACHE: "1", OPENAI_MODEL: "gpt-5.6-sol", PERSISTENCE_MODE: "demo-memory", PAYMENTS_ENABLED: "false", ADMIN_CHAT_PASSWORD: "", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" };
function child(file: string, mode: string, id = "") {
  return fork(__filename, ["child", file, mode, id], { execArgv: ["--import", join(process.cwd(), "node_modules/tsx/dist/loader.mjs")], env, stdio: ["ignore", "ignore", "inherit", "ipc"] });
}
async function childMain() {
  const db = new SqliteAiBudget(process.argv[3], prices);
  if (process.argv[4] === "begin") {
    const b = await reserve(db, "process", "B");
    process.send!({ ready: true });
    process.once("message", async () => {
      const began = await b.begin();
      await b.cancel();
      process.send!({ began, snapshot: db.snapshot("process") });
      db.close(); process.disconnect!();
    });
  } else {
    const id = process.argv[5];
    replay(db, id, large);
    let conflict = false;
    try { replay(db, id, small); } catch (error) { conflict = /Conflicting settlement/.test(String(error)); }
    replay(db, id, null);
    process.send!({ conflict, snapshot: db.snapshot("restart") });
    db.close(); process.disconnect!();
  }
}
async function main() {
  const dir = mkdtempSync(join(tmpdir(), "oneulstart-ledger-boundaries-"));
  const file = join(dir, "ledger.sqlite");
  let db = new SqliteAiBudget(file, prices);
  const results: { name: string; status: string; error?: string }[] = [];
  const check = async (name: string, run: () => Promise<void>) => {
    try { await run(); results.push({ name, status: "passed" }); console.log("PASS " + name); }
    catch (error) { results.push({ name, status: "failed", error: String(error) }); console.error("FAIL " + name, error); }
  };
  for (const separate of [false, true]) await check(`halt blocks previously reserved begin: ${separate ? "two connections" : "same connection"}`, async () => {
    const service = separate ? "connections" : "same";
    db.provision(service, 100000);
    const other = separate ? new SqliteAiBudget(file, prices) : db;
    try {
      const a = await reserve(db, service, "A"), b = await reserve(other, service, "B");
      assert(await a.begin()); await a.settle(large);
      assert.equal(db.snapshot(service).budget!.halted, 1);
      const began = await b.begin();
      const beforeCancel = db.snapshot(service).reservations.find(r => r.job === "B")!;
      await b.cancel();
      assert.equal(began, false);
      assert.equal(beforeCancel.state, "reserved");
      assert.equal(db.snapshot(service).reservations.find(r => r.job === "B")!.charged, 0);
      assert.equal(db.snapshot(service).reservations.find(r => r.job === "A")!.charged, 100101);
    } finally { if (separate) other.close(); }
  });
  await check("halt blocks begin in a separately running process", async () => {
    db.provision("process", 100000); const a = await reserve(db, "process", "A");
    const c = child(file, "begin");
    const result = await new Promise<{ began: boolean; snapshot: ReturnType<SqliteAiBudget["snapshot"]> }>((resolve, reject) => {
      let result: { began: boolean; snapshot: ReturnType<SqliteAiBudget["snapshot"]> };
      const timeout = setTimeout(() => { c.kill(); reject(Error("Child deadline")); }, 15000);
      c.on("error", reject);
      c.on("message", async (message: typeof result & { ready?: boolean }) => {
        if (message.ready) { try { assert(await a.begin()); await a.settle(large); c.send("begin"); } catch (e) { c.kill(); reject(e); } }
        else result = message;
      });
      c.on("exit", code => { clearTimeout(timeout); code === 0 && result ? resolve(result) : reject(Error("Child failed")); });
    });
    assert.equal(result.began, false);
    assert.equal(result.snapshot.reservations.find(r => r.job === "A")!.charged, 100101);
    assert.equal(result.snapshot.reservations.find(r => r.job === "B")!.charged, 0);
  });
  await check("unknown usage can settle once; duplicate is idempotent and conflict rejected", async () => {
    db.provision("unknown", 100000); const a = await reserve(db, "unknown", "A");
    await a.begin(); await a.settle(null);
    assert.equal(db.snapshot("unknown").reservations[0].inputTokens, null);
    await a.settle(small); const snapshot = db.snapshot("unknown");
    await a.settle(small); await a.settle(null);
    await assert.rejects(a.settle({ ...small, outputTokens: 6 }), /Conflicting settlement/);
    assert.deepEqual(db.snapshot("unknown"), snapshot);
  });
  await check("recorded overrun cannot be reduced or changed by later settlement", async () => {
    db.provision("conflict", 100000); const a = await reserve(db, "conflict", "A");
    await a.begin(); await a.settle(large); const snapshot = db.snapshot("conflict");
    await a.settle(large); await a.settle(null);
    assert.deepEqual(db.snapshot("conflict"), snapshot);
    await assert.rejects(a.settle(small), /Conflicting settlement/);
    assert.deepEqual(db.snapshot("conflict"), snapshot);
    await a.cancel(); assert.deepEqual(db.snapshot("conflict"), snapshot);
  });
  await check("recorded usage conflict and halted service survive close and process restart", async () => {
    db.provision("restart", 100000); const a = await reserve(db, "restart", "A");
    await a.begin(); await a.settle(large); const snapshot = db.snapshot("restart"); db.close();
    const c = child(file, "replay", a.id);
    const result = await new Promise<{ conflict: boolean; snapshot: typeof snapshot }>((resolve, reject) => {
      let result: { conflict: boolean; snapshot: typeof snapshot };
      const timeout = setTimeout(() => { c.kill(); reject(Error("Child deadline")); }, 15000);
      c.on("message", m => result = m as typeof result); c.on("error", reject);
      c.on("exit", code => { clearTimeout(timeout); code === 0 && result ? resolve(result) : reject(Error("Child failed")); });
    });
    db = new SqliteAiBudget(file, prices);
    assert.equal(result.conflict, true); assert.deepEqual(result.snapshot, JSON.parse(JSON.stringify(snapshot)));
    assert.deepEqual(db.snapshot("restart"), snapshot);
    assert.equal(await db.forJob("restart", "new")(attempt()), false);
  });
  db.close();
  writeFileSync(join(dir, "results.json"), JSON.stringify({ results, database: file, externalCalls: 0, restartScope: "actual internal settlement transaction, not a public recovery API" }, null, 2));
  console.log(JSON.stringify({ total: results.length, failed: results.filter(r => r.status === "failed").length, evidence: join(dir, "results.json") }));
  process.exitCode = results.some(r => r.status === "failed") ? 1 : 0;
}
(process.argv[2] === "child" ? childMain() : main()).catch(error => { console.error(error); process.exitCode = 1; });
