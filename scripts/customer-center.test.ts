import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { inquiryBody, inquiryDraftSchema, inquiryMessageId, inquiryPreview, inquirySchema } from "../lib/support-chat/inquiry";
import { betaApiBoundary } from "../lib/staging/beta-boundary";

async function main() {
  const require = createRequire(import.meta.url);
  const originals = new Map<string, NodeJS.Module | undefined>();
  function mock(path: string, exports: unknown) {
    const id = require.resolve(path); originals.set(id, require.cache[id]);
    const mod = new Module(id); mod.filename = id; mod.loaded = true; mod.exports = exports; require.cache[id] = mod;
  }
  let owner: string | null = "synthetic-account-a", unavailable = false, limited = false, notifications = 0, smsNotifications = 0, externalCalls = 0;
  let notificationFailure = false;
  const smsEventIds: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { externalCalls++; throw new Error("External requests are prohibited in this test"); };
  mock("../lib/api-auth", { requireAuthenticatedIdentity: async () => {
    if (!owner) throw new Error("ACCOUNT_LOGIN_REQUIRED");
    return { hash: owner, userId: owner, email: "synthetic@example.invalid" };
  } });
  mock("../lib/persistence", { getServerSupabase: () => { if (unavailable) throw new Error("private database detail"); return null; } });
  mock("../lib/rate-limit", { enforceRateLimit: async () => limited ? Response.json({ error: { message: "limited" } }, { status: 429 }) : null });
  mock("../lib/notify/owner-email", { notifyOwnerByEmail: async () => { notifications++; if (notificationFailure) throw new Error("Synthetic notification error"); return true; } });
  mock("../lib/notify/owner-sms", { notifyOwnerBySms: async (eventId: string) => { smsNotifications++; smsEventIds.push(eventId); if (notificationFailure) throw new Error("Synthetic SMS error"); return { status: "accepted", code: "PROVIDER_ACCEPTED" }; } });
  const route = require("../app/api/account/support/route") as typeof import("../app/api/account/support/route");
  const repository = require("../lib/support-chat/repository") as typeof import("../lib/support-chat/repository");
  const input = () => ({ requestId: crypto.randomUUID(), category: "plan" as const, subject: "합성 저장 문의", message: "합성 문의입니다. 새로고침 후 저장 상태가 궁금해요." });
  const request = (body: unknown, scope = owner ?? "", origin = "https://local.example.invalid") => new Request("https://local.example.invalid/api/account/support", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "x-support-owner": scope }, body: JSON.stringify(body) });
  const results: { name: string; status: string }[] = [];
  async function check(name: string, run: () => void | Promise<void>) {
    try { await run(); results.push({ name, status: "passed" }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, status: "failed" }); console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  try {
    await check("anonymous GET and POST require real server identity", async () => {
      owner = null;
      const anonymousGet = await route.GET();
      assert.equal(anonymousGet.status, 200); assert.equal((await anonymousGet.json()).loggedIn, false);
      assert.match(anonymousGet.headers.get("cache-control")!, /private, no-store/);
      for (const response of [await route.POST(request(input()))]) {
        assert.equal(response.status, 401); assert.equal((await response.json()).error.code, "ACCOUNT_LOGIN_REQUIRED");
        assert.match(response.headers.get("cache-control")!, /private, no-store/);
      }
      assert.equal(notifications, 0); assert.equal(smsNotifications, 0); owner = "synthetic-account-a";
    });
    await check("strict inquiry contract and legacy content remain readable", () => {
      const value = input(); assert.ok(inquirySchema.safeParse(value).success);
      assert.equal(inquirySchema.safeParse({ ...value, ownerId: "untrusted" }).success, false);
      assert.equal(inquirySchema.safeParse({ ...value, smsTo: "01000000001" }).success, false);
      for (const patch of [{ subject: "" }, { subject: "x\ny" }, { message: "" }, { message: "x".repeat(1801) }, { requestId: "bad" }]) assert.equal(inquirySchema.safeParse({ ...value, ...patch }).success, false);
      const longest = { ...value, subject: "가".repeat(80), message: "나".repeat(1800) };
      assert.ok(inquiryBody(longest).length < 2000);
      assert.deepEqual(inquiryPreview(inquiryBody(value)), { subject: value.subject, category: "대화·사업계획서·저장", message: value.message });
      assert.equal(inquiryPreview("이전 문의\n원문 유지").message, "이전 문의\n원문 유지");
      assert.ok(inquiryDraftSchema.safeParse({ ...value, subject: "", message: "작성 중" }).success);
    });
    await check("stale account and cross-origin write cannot save", async () => {
      assert.equal((await route.POST(request(input(), "synthetic-account-b"))).status, 409);
      assert.equal((await route.POST(request(input(), owner!, "https://untrusted.invalid"))).status, 403);
      assert.equal((await repository.getCustomerChat(owner!)).messages.length, 0);
    });
    let receipt = input(), savedId = "";
    await check("manual inquiry saves to existing admin inbox without AI", async () => {
      const response = await route.POST(request(receipt)); const body = await response.json();
      assert.equal(response.status, 201); assert.equal(body.requestId, receipt.requestId);
      savedId = body.receivedMessageId;
      assert.deepEqual(smsEventIds, [savedId]);
      assert.equal(body.chat.messages[0].id, savedId); assert.equal(body.chat.messages[0].body, inquiryBody(receipt));
      assert.equal(body.chat.conversation.unreadByAdmin, 1); assert.equal(notifications, 1); assert.equal(smsNotifications, 1);
      assert.ok((await repository.listAdminConversations()).some(row => row.id === body.chat.conversation.id));
    });
    await check("same request returns same receipt without duplicate message or notification", async () => {
      const response = await route.POST(request(receipt)); const body = await response.json();
      assert.equal(response.status, 200); assert.equal(body.receivedMessageId, savedId);
      assert.equal(body.chat.messages.length, 1); assert.equal(body.chat.conversation.unreadByAdmin, 1); assert.equal(notifications, 1); assert.equal(smsNotifications, 1);
      assert.deepEqual(smsEventIds, [savedId]);
    });
    await check("conflicting replay preserves original inquiry", async () => {
      const response = await route.POST(request({ ...receipt, message: "다른 내용" }));
      assert.equal(response.status, 409); assert.equal((await response.json()).error.code, "SUPPORT_REQUEST_CONFLICT");
      assert.equal((await repository.getCustomerChat(owner!)).messages[0].body, inquiryBody(receipt));
    });
    await check("account B sees only B and identical request IDs stay owner scoped", async () => {
      owner = "synthetic-account-b";
      assert.deepEqual((await (await route.GET()).json()).chat.messages, []);
      const response = await route.POST(request(receipt)); const body = await response.json();
      assert.equal(response.status, 201); assert.notEqual(body.receivedMessageId, savedId);
      assert.equal(body.chat.messages.length, 1); owner = "synthetic-account-a";
      assert.equal((await (await route.GET()).json()).chat.messages[0].id, savedId);
    });
    await check("existing admin reply and read markers remain connected", async () => {
      const chat = await repository.getCustomerChat(owner!); const id = chat.conversation!.id;
      await repository.getAdminChat(id); await repository.sendAdminMessage(id, "합성 담당자 답변");
      const response = await route.GET(); const body = await response.json();
      assert.equal(body.chat.messages.at(-1).sender, "admin"); assert.equal(body.chat.messages.at(-1).body, "합성 담당자 답변");
      assert.equal(body.chat.conversation.unreadByCustomer, 0);
    });
    await check("concurrent retransmissions share one receipt", async () => {
      const value = input(); const id = await inquiryMessageId(owner!, value.requestId);
      const results = await Promise.all(Array.from({ length: 6 }, () => repository.sendCustomerMessageOnce(owner!, inquiryBody(value), id)));
      assert.equal(results.filter(result => result.created).length, 1);
      assert.equal((await repository.getCustomerChat(owner!)).messages.filter(message => message.id === id).length, 1);
    });
    await check("each new inquiry alerts even with unread messages; concurrent POST replay alerts once", async () => {
      const value = input(), smsBefore = smsNotifications, emailBefore = notifications;
      const responses = await Promise.all(Array.from({ length: 5 }, () => route.POST(request(value))));
      assert.equal(responses.filter(response => response.status === 201).length, 1);
      assert.equal(responses.filter(response => response.status === 200).length, 4);
      assert.equal(smsNotifications, smsBefore + 1);
      assert.equal(notifications, emailBefore, "existing first-unread email behavior is preserved");
      assert.equal((await route.POST(request(input()))).status, 201);
      assert.equal(smsNotifications, smsBefore + 2);
    });
    await check("notification failure does not fail or duplicate a saved inquiry", async () => {
      const value = input(), smsBefore = smsNotifications;
      const conversation = (await repository.getCustomerChat(owner!)).conversation!;
      await repository.getAdminChat(conversation.id);
      notificationFailure = true;
      const response = await route.POST(request(value));
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(body.chat.messages.at(-1).body, inquiryBody(value));
      assert.doesNotMatch(JSON.stringify(body), /Synthetic (SMS|notification) error/);
      notificationFailure = false;
      assert.equal((await route.POST(request(value))).status, 200);
      assert.equal(smsNotifications, smsBefore + 1);
    });
    await check("invalid body and shared rate limit reject before save", async () => {
      const count = (await repository.getCustomerChat(owner!)).messages.length;
      assert.equal((await route.POST(request({ ...input(), category: "consult-ai" }))).status, 400);
      assert.equal((await route.POST(request({ ...input(), message: "x".repeat(10001) }))).status, 400);
      limited = true; assert.equal((await route.POST(request(input()))).status, 429); limited = false;
      assert.equal((await repository.getCustomerChat(owner!)).messages.length, count);
    });
    await check("storage outage fails closed and never discloses database detail", async () => {
      const smsBefore = smsNotifications;
      unavailable = true;
      for (const response of [await route.GET(), await route.POST(request(input()))]) {
        assert.equal(response.status, 503); assert.equal((await response.text()).includes("private database detail"), false);
      }
      unavailable = false;
      assert.equal(smsNotifications, smsBefore);
    });
    await check("beta exposes manual endpoint only, keeps AI/export/internal protections", () => {
      for (const method of ["GET", "POST"]) assert.equal(betaApiBoundary(new Request("https://local.example.invalid/api/account/support", { method }), "1"), null);
      for (const [path, method] of [["/api/account/support", "DELETE"], ["/api/support/assistant", "POST"], ["/api/consult", "POST"], ["/api/plan/export", "POST"], ["/__internal/plan-section", "POST"], ["/api/internal/plan-section", "POST"]]) assert.equal(betaApiBoundary(new Request(`https://local.example.invalid${path}`, { method }), "1")?.status, 403);
    });
    await check("messenger widget is back with home/chat/settings tabs, and page inquiry links still go to the customer center", () => {
      // 2026-10-03: 대표 요청으로 상담 창을 메신저형(홈·대화·설정)으로 다시 붙였다. 화면 안의 '문의' 링크는 계속 고객센터로 간다
      assert.match(readFileSync("app/layout.tsx", "utf8"), /<SupportChatWidget \/>/);
      assert.match(readFileSync("components/support-chat-widget.tsx", "utf8"), /<SupportTabs /);
      for (const path of ["components/landing-quick-editor.tsx", "app/plan/workspace/LaunchWorkspace.tsx", "app/plan/document/DocumentWorkspace.tsx"]) {
        const source = readFileSync(path, "utf8"); assert.doesNotMatch(source, /venture:open-support-chat/); assert.match(source, /\/account\/support/);
      }
      // 고객센터는 모든 사업 화면의 왼쪽 메뉴와 상담 창 설정 탭에서 간다
      assert.match(readFileSync("app/plan/RailMenu.tsx", "utf8"), /href="\/account\/support"/);
      assert.match(readFileSync("components/support-chat-home.tsx", "utf8"), /href="\/account\/support"/);
      assert.doesNotMatch(readFileSync("app/account/support/SupportCenter.tsx", "utf8"), /\/api\/(consult|support\/assistant)/);
      assert.equal(externalCalls, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [id, prior] of originals) { if (prior) require.cache[id] = prior; else delete require.cache[id]; }
  }
  console.log(JSON.stringify({ tests: results, passed: results.filter(row => row.status === "passed").length, failed: results.filter(row => row.status === "failed").length, externalCalls, scope: "real routes and demo repository; synthetic identity/notification boundaries, not production auth or DB" }));
  if (results.some(row => row.status === "failed")) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
