import assert from "node:assert/strict";
import { createRequire } from "node:module";

async function main() {
  Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" });
  const require = createRequire(import.meta.url);
  const path = require.resolve("../lib/plan-builder/plan-server-store.ts");
  const first = require(path) as typeof import("../lib/plan-builder/plan-server-store");
  const at = "2026-01-01T00:00:00.000Z";
  await first.savePlanState("demo-reload-owner", first.normalizeState({ plans: [{ id: "demo-reload-plan", title: "같은 사업", planType: "일반 사업계획서", createdAt: at, updatedAt: at, sections: {}, answers: {} }] }));
  delete require.cache[path];
  const reloaded = require(path) as typeof first;
  assert.notEqual(first, reloaded, "the store module must actually be evaluated again");
  const restored = await reloaded.loadPlanState("demo-reload-owner");
  assert.equal(restored.plans[0]?.id, "demo-reload-plan");
  restored.plans[0].title = "다음 라우트에서 수정";
  restored.plans[0].updatedAt = new Date().toISOString();
  await reloaded.savePlanState("demo-reload-owner", restored);
  assert.equal((await first.loadPlanState("demo-reload-owner")).plans[0].title, "다음 라우트에서 수정");
  assert.equal((await first.loadPlanState("other-demo-owner")).plans.length, 0);
  console.log("demo store: module reload, cross-module writes and owner isolation passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
