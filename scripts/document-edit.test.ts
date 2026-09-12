import assert from "node:assert/strict";
import { editedSection, saveDocumentEdit } from "../lib/plan-builder/document-edit";
import { loadPlanState, savePlanState, type ServerPlanState } from "../lib/plan-builder/plan-server-store";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";
  process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const date = "2026-01-01T00:00:00.000Z";
  const section = { markdown: "Original", html: "<p>Original</p>", generatedAt: date, locked: true, coachRevision: 7 };
  const input = { planId: "doc-a", key: "overview/summary", baseGeneratedAt: date, action: "save" as const, markdown: "Edited", html: "<p>Edited</p>" };
  const updated = editedSection(section, input);
  assert.equal(updated.previous.markdown, "Original");
  assert.equal(updated.edited, true); assert.equal(updated.locked, true); assert.equal(updated.coachRevision, 7);
  assert.ok(updated.generatedAt > date);
  assert.throws(() => editedSection(updated, input), /DOCUMENT_CONFLICT/);
  assert.throws(() => editedSection(section, { ...input, markdown: " " }), /DOCUMENT_EMPTY/);
  const reverted = editedSection(updated, { ...input, action: "restore", baseGeneratedAt: updated.generatedAt });
  assert.equal(reverted.markdown, "Original"); assert.equal(reverted.previous.markdown, "Edited");
  const state: ServerPlanState = { business: { name: "QA", description: "", role: "", industry: "", region: "", stage: "" }, activePlanId: "doc-a", plans: [{ id: "doc-a", title: "QA", planType: "일반 사업계획서", createdAt: date, updatedAt: date, answers: {}, sections: { "overview/summary": section, "strategy/goals": { ...section } } }] };
  await savePlanState("document-owner", state);
  await assert.rejects(saveDocumentEdit("other-owner", input), /DOCUMENT_NOT_FOUND/);
  const saved = await saveDocumentEdit("document-owner", input);
  assert.equal(saved.section.markdown, "Edited");
  await assert.rejects(saveDocumentEdit("document-owner", input), /DOCUMENT_CONFLICT/);
  await saveDocumentEdit("document-owner", { ...input, key: "strategy/goals", markdown: "Different section", html: "<p>Different section</p>" });
  const final = (await loadPlanState("document-owner")).plans[0];
  assert.equal(final.sections["overview/summary"].markdown, "Edited");
  assert.equal(final.sections["strategy/goals"].markdown, "Different section");
  await saveDocumentEdit("document-owner", { ...input, action: "restore", baseGeneratedAt: saved.section.generatedAt });
  assert.equal((await loadPlanState("document-owner")).plans[0].sections[input.key].markdown, "Original");
  console.log("document edits: owner isolation, version conflict, independent section saves and restore passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
