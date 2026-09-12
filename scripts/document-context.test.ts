import assert from "node:assert/strict";
import { documentContext } from "../lib/plan-builder/document-context";
import { applyCoachReply, COACH_KEY } from "../lib/plan-builder/coach";

async function main() {
  const storage = new Map<string, string>();
  const local = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } };
  Object.assign(globalThis, { window: { localStorage: local }, localStorage: local, fetch: async () => ({ ok: true, json: async () => ({}) }) });
  const { createPlan, setActivePlan, loadState, saveSection } = await import("../lib/plan-builder/plan-store");
  const first = createPlan("일반 사업계획서", "Document A");
  saveSection("summary/action", "Original A", "<p>Original A</p>", { planId: first });
  const second = createPlan("일반 사업계획서", "Document B");
  setActivePlan(second);
  assert.equal(documentContext(loadState(), first)?.plan.id, first);
  assert.equal(documentContext(loadState(), "missing"), null);
  assert.equal(documentContext(loadState(), null), null);
  assert.equal(saveSection("summary/action", "Edited A", "<p>Edited A</p>", { planId: first, edited: true, keepPrevious: true }), true);
  const state = loadState();
  assert.equal(state.activePlanId, second, "Editing A must not change the active tab's business");
  const section = state.plans.find(plan => plan.id === first)!.sections["summary/action"];
  assert.equal(section.markdown, "Edited A");
  assert.equal(section.edited, true, "Manual edits must be protected from regeneration");
  assert.equal(section.previous?.markdown, "Original A");
  assert.equal(state.plans.find(plan => plan.id === second)!.sections["summary/action"], undefined);
  assert.equal(saveSection("summary/action", "Wrong", "<p>Wrong</p>", { planId: "missing" }), false);
  const coach = applyCoachReply(null, { title: "Business A", message: "Ready", stage: "startup", depth: "quick", ready: false, fields: [], suggestions: [] }, { id: "qa-message", role: "user", text: "Business A", at: new Date().toISOString() });
  state.plans.find(plan => plan.id === first)!.answers[COACH_KEY] = { state: coach };
  state.business.name = "Unrelated active business";
  assert.equal(documentContext(state, first)?.business.name, coach.business.name);
  console.log("document context: passed (cross-tab targeting, missing plan, manual-edit protection, per-business export context)");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
