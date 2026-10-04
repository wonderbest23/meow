import assert from "node:assert/strict";
import { staleRewriteCount } from "../lib/plan-builder/intake-core";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";

// 계획서 반영 전에 보여 주는 '다시 쓸 항목 수' — 제작 접수(app/api/plan/chat prepareQuota)와 같은 기준
const section = (extra: Partial<ServerPlan["sections"][string]>) => ({ markdown: "본문", html: "<p>본문</p>", generatedAt: "2026-10-04T00:00:00Z", ...extra }) as ServerPlan["sections"][string];
const sections: ServerPlan["sections"] = {
  "a/1": section({ coachRevision: 3 }),
  "a/2": section({ coachRevision: 2 }),
  "a/3": section({ coachRevision: 2, edited: true }),
  "a/4": section({ coachRevision: 2, locked: true }),
  "a/5": section({}),
};
assert.equal(staleRewriteCount(sections, 3), 2, "최신이 아닌 항목만, 직접 고친·잠근 항목은 빼고 센다");
assert.equal(staleRewriteCount(sections, 3, ["a/1", "a/2"]), 1, "제작할 항목으로 좁히면 그 안에서만 센다");
assert.equal(staleRewriteCount({}, 3), 0);
console.log("rewrite cost: passed");
