import assert from "node:assert/strict";
import { adminClosedOnHost, closedForLaunch } from "../lib/launch-scope";

/* 오픈 범위 — 운영에서만 닫고(스테이징·프리런치·개발은 열림), 핵심 흐름 주소는 절대 닫지 않는다 */
const prod = { NODE_ENV: "production" };
const closed = (path: string) => closedForLaunch(path, prod);

for (const path of ["/dev", "/dev/landing-editor", "/plan/proposal", "/plan/proposal?x=1".split("?")[0]]) assert.equal(closed(path), "page", path);
for (const path of ["/api/dev/business-journeys", "/api/plan/market-research", "/api/plan/suggest", "/api/delivery/deck", "/api/delivery/document", "/api/opportunities/discover", "/api/careers/search", "/api/plan/deck", "/api/plan/proposal", "/api/brand/logo", "/api/presentations/assist", "/api/health/domain", "/api/projects/abc/landing/ai-edit", "/api/projects/abc/landing/ai-tokens", "/api/projects/abc/landing/rollback"]) assert.equal(closed(path), "api", path);

// 핵심 흐름은 열려 있다
for (const path of ["/", "/plan", "/plan/chat", "/plan/document", "/plan/homepage", "/plan/workspace", "/plan/inquiries", "/plan/me", "/plan/pay", "/account", "/launch/abc", "/customer-site", "/admin", "/admin/schema",
  "/api/plan/state", "/api/plan/chat", "/api/plan/chat/comment", "/api/plan/chat/suggestions", "/api/plan/landing", "/api/plan/inquiries", "/api/plan/artifact-updates", "/api/plan/expert", "/api/plan/operations", "/api/plan/operations/analysis",
  "/api/projects/abc/landing", "/api/projects/abc/landing/ai-fill", "/api/projects/abc/landing/publish", "/api/projects/abc/landing/domain", "/api/projects/abc/landing/alerts", "/api/projects/abc/landing/leads", "/api/projects/abc/landing/notifications",
  "/api/payments/plan/prepare", "/api/payments/plan/return", "/api/public/landing/abc/lead", "/api/public/weekly-report/unsubscribe", "/api/health/persistence", "/api/support/chat", "/api/consult", "/api/plan/deckish", "/api/devices", "/development"]) assert.equal(closed(path), null, path);

// 스테이징·프리런치·개발에서는 모두 열려 있다
for (const env of [{ NODE_ENV: "development" }, { NODE_ENV: "production", APP_ENV: "staging" }, { NODE_ENV: "production", APP_ENV: "prelaunch" }]) {
  assert.equal(closedForLaunch("/dev/landing-editor", env), null);
  assert.equal(closedForLaunch("/api/delivery/deck", env), null);
}
// 관리자 화면은 oneulstart.com 에서만(손님 도메인·연결 주소·workers.dev 에서는 닫힘)
assert.equal(adminClosedOnHost("/admin", "oneulstart.com", prod), null);
assert.equal(adminClosedOnHost("/api/admin/stats", "www.oneulstart.com", prod), null);
assert.equal(adminClosedOnHost("/admin/schema", "mybakery.kr", prod), "page");
assert.equal(adminClosedOnHost("/api/admin/support/session", "connect.oneulstart.com", prod), "api");
assert.equal(adminClosedOnHost("/admin", "today-startup.rena35200.workers.dev", prod), "page");
assert.equal(adminClosedOnHost("/plan", "mybakery.kr", prod), null, "관리자 밖 주소는 이 규칙과 무관");
assert.equal(adminClosedOnHost("/administrator", "mybakery.kr", prod), null);
assert.equal(adminClosedOnHost("/admin", "mybakery.kr", { NODE_ENV: "production", APP_ENV: "staging" }), null);
assert.equal(adminClosedOnHost("/admin", "127.0.0.1:3000", { NODE_ENV: "development" }), null);
console.log("launch-scope: 운영에서만 닫힘, 핵심 흐름 열림, 관리자는 oneulstart.com 에서만");
