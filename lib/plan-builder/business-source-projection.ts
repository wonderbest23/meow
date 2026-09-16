import { currentBusinessDesign, coachDocumentRevision, type CoachState } from "./coach";

/** Business inputs only: conversation, intake progress and generation state are not sources. */
export function businessSourceProjection(coach: CoachState | null) {
  if (!coach) return null;
  const design = currentBusinessDesign(coach);
  const directAction = coach.directAction?.sourceRevision === coachDocumentRevision(coach) ? coach.directAction : undefined;
  const action = (value: { action: string; doneWhen: string; usableText: string }) => ({
    action: value.action, doneWhen: value.doneWhen, usableText: value.usableText,
  });
  return {
    version: 1,
    // A legacy conversational revision is not a business-content revision.
    documentRevision: coach.documentRevision ?? null,
    stage: coach.stage,
    depth: coach.depth,
    business: {
      name: coach.business.name, description: coach.business.description, role: coach.business.role,
      industry: coach.business.industry, region: coach.business.region, stage: coach.business.stage,
    },
    ideaOrigin: coach.ideaOrigin?.text ?? null,
    fields: coach.fields.map(field => ({
      key: field.key, value: field.value, basis: field.basis,
      // Evidence text can contain material qualifiers; a chat message ID cannot.
      quote: field.basis === "user" ? field.quote ?? "" : "",
    })).sort((a, b) => a.key.localeCompare(b.key)),
    design: design ? {
      approach: design.approach,
      startingPlan: {
        scope: design.startingPlan.scope, connectionToVision: design.startingPlan.connectionToVision,
        whyThis: design.startingPlan.whyThis, notIncluded: [...design.startingPlan.notIncluded],
      },
      alternatives: design.alternatives.map(({ name, scope, tradeoff }) => ({ name, scope, tradeoff })),
      assumptions: design.assumptions.map(({ statement, howToCheck }) => ({ statement, howToCheck })),
      nextAction: action(design.nextAction),
    } : null,
    directAction: directAction ? action(directAction) : null,
  };
}
