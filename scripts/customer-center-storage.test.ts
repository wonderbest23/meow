import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { inquiryMessageId } from "../lib/support-chat/inquiry";

type Row = Record<string, any>;
type Result = { data: any; error: { code?: string; message?: string } | null };

async function main() {
  const require = createRequire(import.meta.url);
  const id = require.resolve("../lib/persistence");
  const original = require.cache[id];
  const tables: Record<string, Row[]> = { support_conversations: [], support_messages: [] };
  let failMetadata = false, failRead = false;
  class Query implements PromiseLike<Result> {
    operation = "select"; values: Row = {}; filters: [string, unknown][] = []; singleRow = false; sort: string | null = null;
    constructor(readonly table: string) {}
    select() { return this; }
    limit() { return this; }
    eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
    order(key: string) { this.sort = key; return this; }
    insert(values: Row) { this.operation = "insert"; this.values = values; return this; }
    update(values: Row) { this.operation = "update"; this.values = values; return this; }
    single() { this.singleRow = true; return this; }
    maybeSingle() { this.singleRow = true; return this; }
    async run(): Promise<Result> {
      if (failRead) return { data: null, error: { code: "TEST_DB_UNAVAILABLE" } };
      const rows = tables[this.table];
      let found = rows.filter(row => this.filters.every(([key, value]) => row[key] === value));
      if (this.operation === "insert") {
        const now = new Date().toISOString();
        const row: Row = { id: crypto.randomUUID(), created_at: now, updated_at: now, status: "open", last_message_preview: "", unread_by_admin: 0, unread_by_customer: 0, ...this.values };
        if (rows.some(existing => existing.id === row.id || this.table === "support_conversations" && existing.guest_token_hash === row.guest_token_hash)) return { data: null, error: { code: "23505" } };
        rows.push(row); found = [row];
      } else if (this.operation === "update") {
        if (failMetadata && this.table === "support_conversations") { failMetadata = false; return { data: null, error: { code: "TEST_UPDATE_FAILED" } }; }
        found.forEach(row => Object.assign(row, this.values));
      }
      if (this.sort) found = [...found].sort((left, right) => String(left[this.sort!]).localeCompare(String(right[this.sort!])));
      return { data: structuredClone(this.singleRow ? found[0] ?? null : found), error: null };
    }
    then<TResult1 = Result, TResult2 = never>(resolve?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
      return this.run().then(resolve, reject);
    }
  }
  const mocked = new Module(id); mocked.filename = id; mocked.loaded = true;
  mocked.exports = { getServerSupabase: () => ({ from: (table: string) => new Query(table) }) }; require.cache[id] = mocked;
  const load = () => require("../lib/support-chat/repository") as typeof import("../lib/support-chat/repository");
  let repository = load();
  const results: { name: string; status: string }[] = [];
  async function check(name: string, run: () => Promise<void>) {
    try { await run(); results.push({ name, status: "passed" }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, status: "failed" }); console.error(`FAIL ${name}: ${String(error)}`); }
  }
  try {
    const owner = `synthetic-db-a-${crypto.randomUUID()}`, messageId = await inquiryMessageId(owner, crypto.randomUUID());
    await check("PostgREST path creates one owned conversation and receipt", async () => {
      const result = await repository.sendCustomerMessageOnce(owner, "합성 문의", messageId);
      assert.equal(result.created, true); assert.equal(result.chat.messages[0].id, messageId);
      assert.equal(tables.support_messages.length, 1); assert.equal(tables.support_conversations[0].guest_token_hash, owner);
    });
    await check("same ID/body replays and conflicting body cannot overwrite", async () => {
      const result = await repository.sendCustomerMessageOnce(owner, "합성 문의", messageId);
      assert.equal(result.created, false);
      await assert.rejects(repository.sendCustomerMessageOnce(owner, "다른 문의", messageId), /SUPPORT_REQUEST_CONFLICT/);
      assert.equal(tables.support_messages[0].body, "합성 문의");
    });
    await check("unique-key race is recovered without duplicate receipts", async () => {
      const newOwner = `synthetic-concurrent-${crypto.randomUUID()}`, key = await inquiryMessageId(newOwner, crypto.randomUUID());
      const results = await Promise.all(Array.from({ length: 6 }, () => repository.sendCustomerMessageOnce(newOwner, "동시 합성 문의", key)));
      assert.equal(results.filter(result => result.created).length, 1);
      assert.equal(tables.support_messages.filter(row => row.id === key).length, 1);
      assert.equal(tables.support_conversations.filter(row => row.guest_token_hash === newOwner).length, 1);
    });
    await check("partial write is repaired on retry without adding a second message", async () => {
      const newOwner = `synthetic-partial-${crypto.randomUUID()}`, key = await inquiryMessageId(newOwner, crypto.randomUUID());
      failMetadata = true;
      await assert.rejects(repository.sendCustomerMessageOnce(newOwner, "일부 저장 후 응답 유실", key));
      assert.equal(tables.support_messages.filter(row => row.id === key).length, 1);
      const result = await repository.sendCustomerMessageOnce(newOwner, "일부 저장 후 응답 유실", key);
      assert.equal(result.created, false); assert.equal(result.chat.conversation?.lastMessagePreview, "일부 저장 후 응답 유실");
      assert.equal(result.chat.conversation?.unreadByAdmin, 1);
    });
    await check("repository reload keeps database receipt identity and admin reply", async () => {
      const chat = await repository.getCustomerChat(owner);
      await repository.sendAdminMessage(chat.conversation!.id, "합성 관리자 답변");
      delete require.cache[require.resolve("../lib/support-chat/repository")]; repository = load();
      const replay = await repository.sendCustomerMessageOnce(owner, "합성 문의", messageId);
      assert.equal(replay.created, false); assert.equal(replay.chat.messages.length, 2);
      assert.equal(replay.chat.messages.at(-1)?.body, "합성 관리자 답변");
    });
    await check("cross-owner message ID reuse never exposes another conversation", async () => {
      await assert.rejects(repository.sendCustomerMessageOnce("synthetic-db-b", "합성 문의", messageId), /SUPPORT_REQUEST_CONFLICT/);
      assert.deepEqual((await repository.getCustomerChat("synthetic-db-b")).messages, []);
    });
    await check("database query failure never switches to demo-memory", async () => {
      failRead = true;
      await assert.rejects(repository.sendCustomerMessageOnce(owner, "저장 실패 합성 문의", crypto.randomUUID()));
      failRead = false;
      assert.equal(tables.support_messages.filter(row => row.body === "저장 실패 합성 문의").length, 0);
    });
  } finally { if (original) require.cache[id] = original; else delete require.cache[id]; }
  console.log(JSON.stringify({ results, scope: "real repository PostgREST code with synthetic unique-key/query responses; not a real PostgreSQL or restart integration test" }));
  if (results.some(result => result.status === "failed")) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
