import { readCoach } from "./coach";
import { loadPlanState, savePlanState, type ServerPlan } from "./plan-server-store";

export type DocumentEditInput = { planId: string; key: string; baseGeneratedAt: string; action: "save" | "restore"; markdown?: string; html?: string };
export function editedSection(current: ServerPlan["sections"][string], input: DocumentEditInput) {
  if (current.generatedAt !== input.baseGeneratedAt) throw new Error("DOCUMENT_CONFLICT");
  const next = input.action === "restore" ? current.previous : { markdown: input.markdown ?? "", html: input.html ?? "" };
  if (!next?.markdown.trim()) throw new Error("DOCUMENT_EMPTY");
  return { ...current, ...next, edited: true, generatedAt: new Date(Math.max(Date.now(), Date.parse(current.generatedAt) + 1 || 0)).toISOString(), previous: { markdown: current.markdown, html: current.html } };
}
export async function saveDocumentEdit(ownerHash: string, input: DocumentEditInput) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await loadPlanState(ownerHash);
    const plan = state.plans.find(p => p.id === input.planId);
    const current = plan?.sections[input.key];
    if (!plan || !current) throw new Error("DOCUMENT_NOT_FOUND");
    const section = editedSection(current, input);
    const updatedAt = plan.updatedAt;
    plan.sections[input.key] = section; plan.updatedAt = section.generatedAt;
    try {
      await savePlanState(ownerHash, state, { planId: plan.id, coachRevision: readCoach(plan.answers)?.revision ?? 0, planUpdatedAt: updatedAt });
      return { section, updatedAt: plan.updatedAt };
    } catch (error) { if (!(error instanceof Error) || error.message !== "PLAN_VERSION_CONFLICT" || attempt === 3) throw error; }
  }
  throw new Error("DOCUMENT_CONFLICT");
}
