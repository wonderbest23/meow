import type { DeckPlan, DeckSlide } from "./deck-plan";

export type ProposalBox = { x: number; y: number; w: number; h: number };
export type ProposalElement = "title" | "lead" | "image";
export type ProposalSlideEdits = {
  text?: Partial<Pick<DeckSlide, "title" | "lead" | "note">>;
  content?: Partial<Pick<DeckSlide, "points" | "table">>;
  layout?: Partial<Record<ProposalElement, ProposalBox>>;
};
export type ProposalSource = {
  businessName: string;
  businessDescription?: string;
  sections: Array<{ chapterTitle: string; sectionTitle: string; markdown: string }>;
};
export type ProposalDocument = {
  revision: number;
  source: ProposalSource;
  deck: DeckPlan;
  edits: Record<string, ProposalSlideEdits>;
};
export type ProposalChangePreview = {
  baseRevision: number;
  nextSource: ProposalSource;
  changedSections: string[];
  businessChanged: boolean;
  affected: Array<{ slideId: string; title: string; sources: string[]; textConflict: boolean }>;
};
export type ProposalRevisionReceipt = { before: ProposalDocument; afterRevision: number };

function sectionMap(source: ProposalSource) {
  const result = new Map<string, string>();
  for (const section of source.sections) {
    const name = `${section.chapterTitle} · ${section.sectionTitle}`;
    if (result.has(name)) throw new Error("duplicate_proposal_source");
    result.set(name, section.markdown);
  }
  return result;
}
function assertEditable(deck: DeckPlan) {
  const ids = deck.slides.map(slide => slide.id);
  if (!deck.blueprint || ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error("proposal_v2_required");
}

export function previewProposalSourceChange(document: ProposalDocument, nextSource: ProposalSource): ProposalChangePreview {
  assertEditable(document.deck);
  const before = sectionMap(document.source), after = sectionMap(nextSource);
  const changedSections = [...new Set([...before.keys(), ...after.keys()])].filter(key => before.get(key) !== after.get(key));
  const addedSections = changedSections.filter(key => !before.has(key));
  const changed = new Set(changedSections);
  const businessChanged = document.source.businessName !== nextSource.businessName || document.source.businessDescription !== nextSource.businessDescription;
  // A newly added source has no existing dependencies yet, so it requires a full review.
  const affected = document.deck.slides.filter(slide => businessChanged || addedSections.length > 0 || slide.sourceSections?.some(source => changed.has(source))).map(slide => ({
    slideId: slide.id!, title: slide.title, sources: [...new Set([...(slide.sourceSections ?? []).filter(source => changed.has(source)), ...addedSections])],
    textConflict: Object.values(document.edits[slide.id!]?.text ?? {}).some(value => value !== undefined) || Object.values(document.edits[slide.id!]?.content ?? {}).some(value => value !== undefined),
  }));
  return { baseRevision: document.revision, nextSource: { businessName: nextSource.businessName, businessDescription: nextSource.businessDescription, sections: structuredClone(nextSource.sections) }, changedSections, businessChanged, affected };
}

/** Content replacements must already have passed source review; this function makes no AI call. */
export function approveProposalSourceChange(
  document: ProposalDocument,
  preview: ProposalChangePreview,
  reviewedSlides: DeckSlide[],
  conflictChoices: Record<string, "keep_manual" | "use_revised"> = {},
): { document: ProposalDocument; receipt: ProposalRevisionReceipt } {
  if (document.revision !== preview.baseRevision) throw new Error("proposal_revision_conflict");
  const verified = previewProposalSourceChange(document, preview.nextSource);
  const affected = new Map(verified.affected.map(slide => [slide.slideId, slide]));
  const replacements = new Map(reviewedSlides.map(slide => [slide.id, slide]));
  if (replacements.size !== reviewedSlides.length || replacements.size !== affected.size || [...replacements.keys()].some(id => !id || !affected.has(id))) throw new Error("proposal_replacement_mismatch");
  const validSources = sectionMap(preview.nextSource);
  for (const replacement of replacements.values()) {
    if (!replacement.title.trim() || !replacement.sourceSections?.length || replacement.sourceSections.some(source => !validSources.has(source))) throw new Error("proposal_source_review_required");
  }
  const edits = structuredClone(document.edits);
  for (const impacted of affected.values()) {
    if (!impacted.textConflict) continue;
    const choice = conflictChoices[impacted.slideId];
    if (choice !== "keep_manual" && choice !== "use_revised") throw new Error("proposal_manual_text_conflict");
    if (choice === "use_revised") { delete edits[impacted.slideId].text; delete edits[impacted.slideId].content; }
  }
  const next = structuredClone(document);
  next.revision++;
  next.source = structuredClone(preview.nextSource);
  next.edits = edits;
  next.deck.brandName = next.source.businessName;
  next.deck.slides = next.deck.slides.map(slide => {
    const replacement = replacements.get(slide.id);
    if (!replacement) return slide;
    return { ...replacement, id: slide.id, composition: slide.composition, image: slide.image, placement: undefined };
  });
  return { document: next, receipt: { before: structuredClone(document), afterRevision: next.revision } };
}

export function undoProposalSourceChange(document: ProposalDocument, receipt: ProposalRevisionReceipt): ProposalDocument {
  if (document.revision !== receipt.afterRevision) throw new Error("proposal_revision_conflict");
  return { ...structuredClone(receipt.before), revision: document.revision + 1 };
}

export function validateProposalBox(box: ProposalBox) {
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.x < 0 || box.y < 0 || box.w < .25 || box.h < .2 || box.x + box.w > 13.33 || box.y + box.h > 7.5) throw new Error("proposal_layout_out_of_bounds");
}

export function setProposalSlideEdits(document: ProposalDocument, slideId: string, edits: ProposalSlideEdits, expectedRevision: number): ProposalDocument {
  assertEditable(document.deck);
  if (document.revision !== expectedRevision) throw new Error("proposal_revision_conflict");
  if (!document.deck.slides.some(slide => slide.id === slideId)) throw new Error("proposal_slide_not_found");
  for (const box of Object.values(edits.layout ?? {})) if (box) validateProposalBox(box);
  for (const [key, value] of Object.entries(edits.text ?? {})) {
    if (typeof value !== "string" || (key === "title" && (!value.trim() || value.length > 60)) || (key === "lead" && value.length > 140) || (key === "note" && value.length > 4000)) throw new Error("proposal_text_out_of_bounds");
  }
  const next = structuredClone(document);
  next.edits[slideId] = { text: { ...next.edits[slideId]?.text, ...edits.text }, layout: { ...next.edits[slideId]?.layout, ...edits.layout }, ...(edits.content ? { content: { ...next.edits[slideId]?.content, ...edits.content } } : next.edits[slideId]?.content ? { content: next.edits[slideId].content } : {}) };
  next.revision++;
  return next;
}

export function renderableProposal(document: ProposalDocument): DeckPlan {
  assertEditable(document.deck);
  return { ...document.deck, slides: document.deck.slides.map(slide => ({ ...slide, ...document.edits[slide.id!]?.text, ...document.edits[slide.id!]?.content, placement: document.edits[slide.id!]?.layout })) };
}
