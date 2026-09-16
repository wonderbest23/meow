import type { DeckPlan, DeckSlide } from "./deck-plan";
import { PROPOSAL_LAYOUTS, PROPOSAL_LAYOUT_LABELS, type ProposalLayout, type ProposalSlot } from "./proposal-blueprint";

export type ProposalBox = { x: number; y: number; w: number; h: number };
export type ProposalElement = "title" | "lead" | "image" | "eyebrow" | "table" | "chart" | `point:${string}:label` | `point:${string}:detail`;
export type ProposalPage = { id: string; sourceId?: string; layout: ProposalLayout; appendix?: boolean };
export type ProposalChart = { type: "bar" | "line"; categories: string[]; series: Array<{ id: string; name: string; values: number[] }>; unit: string; basis: "actual" | "estimate"; source: string };
export type ProposalImage = { id: string; data: string; alt: string; width?: number; height?: number; crop?: { x: number; y: number; w: number; h: number }; fit?: "contain" | "cover" };
export type ProposalSlideEdits = {
  text?: Partial<Pick<DeckSlide, "title" | "lead" | "note" | "eyebrow">>;
  content?: Partial<Pick<DeckSlide, "points" | "table" | "metrics" | "chart" | "image">>;
  layout?: Partial<Record<ProposalElement, ProposalBox>>;
  alignment?: Partial<Record<ProposalElement, "left" | "center" | "right">>;
};
export type ProposalSource = {
  businessName: string;
  businessDescription?: string;
  sections: Array<{ chapterTitle: string; sectionTitle: string; markdown: string }>;
};
export type ProposalDocument = {
  schemaVersion?: 3;
  pages?: ProposalPage[];
  retainedSlideIds?: string[];
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
export type ProposalRevisionReceipt = { before: ProposalDocument; afterRevision: number; retainedSlideIds?: string[] };

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

export function proposalPages(document: ProposalDocument): ProposalPage[] {
  return structuredClone(document.pages ?? document.deck.slides.map((slide, index) => ({ id: slide.id!, sourceId: slide.id!, layout: slide.composition?.layout ?? document.deck.blueprint!.slots[index].layout })));
}

export function pruneProposalRetainedSlides(document: ProposalDocument): ProposalDocument {
  const next = structuredClone(document), visible = new Set(proposalPages(document).map(page => page.id));
  if (next.retainedSlideIds) next.retainedSlideIds = [...new Set(next.retainedSlideIds.filter(id => visible.has(id)))];
  return next;
}

/** Migration is copy-on-write. Historical snapshots and generated assets stay untouched. */
export function upgradeProposalV3(document: ProposalDocument): ProposalDocument {
  assertEditable(document.deck);
  const next = structuredClone(document);
  next.schemaVersion = 3;
  next.pages = proposalPages(document);
  for (const slide of next.deck.slides) slide.points = slide.points?.map((point, index) => ({ ...point, id: point.id ?? `p${index + 1}` }));
  for (const edit of Object.values(next.edits)) if (edit.content?.points) edit.content.points = edit.content.points.map((point, index) => ({ ...point, id: point.id ?? `p${index + 1}` }));
  return next;
}

export function validateProposalPages(document: ProposalDocument, pages: ProposalPage[]) {
  const sourceIds = new Set(document.deck.slides.map(slide => slide.id));
  if (!pages.length || pages.length > 60 || new Set(pages.map(page => page.id)).size !== pages.length) throw new Error("proposal_pages_invalid");
  for (const page of pages) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(page.id) || ["__proto__", "constructor", "prototype"].includes(page.id) || !PROPOSAL_LAYOUTS.includes(page.layout) || (page.sourceId && !sourceIds.has(page.sourceId))) throw new Error("proposal_page_invalid");
  }
}

export function proposalElementLabel(element: ProposalElement): string {
  const fixed: Partial<Record<ProposalElement, string>> = { title: "제목", lead: "설명", eyebrow: "분류", image: "이미지", table: "표", chart: "차트" };
  return fixed[element] ?? `본문 ${element.endsWith(":label") ? "제목" : "내용"}`;
}

export function splitProposalPage(document: ProposalDocument, slideId: string, newId: string): ProposalDocument {
  const next = upgradeProposalV3(document), pages = next.pages!;
  if (pages.length >= 60 || pages.some(page => page.id === newId)) throw new Error("proposal_pages_invalid");
  const index = pages.findIndex(page => page.id === slideId), slide = renderableProposal(next).slides[index];
  if (!slide) throw new Error("proposal_slide_not_found");
  const tableLayout = ["table", "timeline"].includes(pages[index].layout);
  const length = tableLayout ? slide.table?.rows.length ?? 0 : slide.points?.length ?? 0;
  if (length < 2) throw new Error("proposal_split_requires_rows");
  const middle = Math.ceil(length / 2);
  const first = structuredClone(next.edits[slideId] ?? {}), second = structuredClone(first);
  if (tableLayout) {
    first.content = { ...first.content, table: { ...slide.table!, rows: slide.table!.rows.slice(0, middle) } };
    second.content = { ...second.content, table: { ...slide.table!, rows: slide.table!.rows.slice(middle) } };
  } else {
    first.content = { ...first.content, points: slide.points!.slice(0, middle) };
    second.content = { ...second.content, points: slide.points!.slice(middle) };
  }
  next.edits[slideId] = first; next.edits[newId] = second;
  pages.splice(index + 1, 0, { ...pages[index], id: newId });
  validateProposalPages(next, pages);
  return next;
}

function blankSlide(page: ProposalPage): DeckSlide {
  return { id: page.id, title: "제목을 입력하세요", eyebrow: PROPOSAL_LAYOUT_LABELS[page.layout], lead: "",
    composition: { role: "offering", layout: page.layout, treatment: "source_only", missingEvidence: [] },
    ...(["table", "timeline"].includes(page.layout) ? { table: { headers: ["항목", "내용"], rows: [["항목", "내용을 입력하세요"]] } } : ["columns", "summary", "process", "closing", "evidence"].includes(page.layout) ? { points: [{ id: "p1", label: "항목", detail: "내용을 입력하세요" }] } : {}) };
}

export function previewProposalSourceChange(document: ProposalDocument, nextSource: ProposalSource): ProposalChangePreview {
  assertEditable(document.deck);
  const before = sectionMap(document.source), after = sectionMap(nextSource);
  const changedSections = [...new Set([...before.keys(), ...after.keys()])].filter(key => before.get(key) !== after.get(key));
  const addedSections = changedSections.filter(key => !before.has(key));
  const changed = new Set(changedSections);
  const businessChanged = document.source.businessName !== nextSource.businessName || document.source.businessDescription !== nextSource.businessDescription;
  // A newly added source has no existing dependencies yet, so it requires a full review.
  const pages = new Map(proposalPages(document).map(page => [page.id, page]));
  const affected = renderableProposal(document).slides.filter(slide => document.retainedSlideIds?.includes(slide.id!) || businessChanged || addedSections.length > 0 || (!pages.get(slide.id!)?.sourceId && changedSections.length > 0) || slide.sourceSections?.some(source => changed.has(source))).map(slide => ({
    slideId: slide.id!, title: slide.title, sources: pages.get(slide.id!)?.sourceId ? [...new Set([...(slide.sourceSections ?? []).filter(source => changed.has(source)), ...addedSections])] : [...changedSections],
    textConflict: !!slide.chart || !!document.retainedSlideIds?.includes(slide.id!) || pages.get(slide.id!)?.sourceId !== slide.id || Object.values(document.edits[slide.id!]?.text ?? {}).some(value => value !== undefined) || Object.values(document.edits[slide.id!]?.content ?? {}).some(value => value !== undefined),
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
    if (!replacement.title.trim() || !replacement.sourceSections?.length || replacement.sourceSections.length > 4 || replacement.sourceSections.some(source => !validSources.has(source))) throw new Error("proposal_source_review_required");
  }
  const pages = proposalPages(document), projected = renderableProposal(document);
  const originals = new Map(document.deck.slides.map(slide => [slide.id, slide]));
  const visible = new Map(projected.slides.map(slide => [slide.id, slide]));
  const pageById = new Map(pages.map(page => [page.id, page]));
  const edits = structuredClone(document.edits);
  for (const impacted of affected.values()) {
    if (!impacted.textConflict) continue;
    const choice = conflictChoices[impacted.slideId];
    if (choice !== "keep_manual" && choice !== "use_revised") throw new Error("proposal_manual_text_conflict");
    if (choice === "keep_manual" && pageById.get(impacted.slideId)?.sourceId !== impacted.slideId) {
      const slide = visible.get(impacted.slideId)!;
      // A copied/custom page is its own authored content, even without explicit field overrides.
      edits[impacted.slideId] = { ...edits[impacted.slideId],
        text: { title: slide.title, lead: slide.lead ?? "", eyebrow: slide.eyebrow, note: slide.note ?? "" },
        content: { ...edits[impacted.slideId]?.content, ...(slide.points ? { points: structuredClone(slide.points) } : {}), ...(slide.table ? { table: structuredClone(slide.table) } : {}), ...(slide.metrics ? { metrics: structuredClone(slide.metrics) } : {}), image: slide.image ?? null, chart: slide.chart ?? null } };
    }
    if (choice === "use_revised") {
      edits[impacted.slideId] ??= {};
      delete edits[impacted.slideId].text;
      const content = edits[impacted.slideId].content;
      if (content) { delete content.points; delete content.table; delete content.metrics; if (!Object.keys(content).length) delete edits[impacted.slideId].content; }
    }
  }
  const next = structuredClone(document);
  next.revision++;
  next.source = structuredClone(preview.nextSource);
  next.edits = edits;
  next.deck.brandName = next.source.businessName;
  // Materialize each visible page's base before replacing anything shared by sourceId.
  // This keeps deleted pages absent and makes approval of one copy independent of every other copy.
  const bases = pages.map(page => ({ ...structuredClone((page.sourceId ? originals.get(page.sourceId) : undefined) ?? blankSlide(page)), id: page.id }));
  next.deck.slides = bases.map(slide => {
    const replacement = replacements.get(slide.id);
    if (!replacement) return slide;
    return { ...structuredClone(replacement), id: slide.id, composition: slide.composition, image: slide.image, chart: slide.chart,
      points: replacement.points?.map((point, index) => ({ ...point, id: point.id ?? visible.get(slide.id)?.points?.[index]?.id ?? `p${index + 1}` })), placement: slide.placement, alignment: slide.alignment };
  });
  next.deck.blueprint = { ...next.deck.blueprint!, slots: structuredClone(projected.blueprint!.slots) };
  if (next.pages) next.pages = pages.map(page => ({ ...page, sourceId: page.id }));
  // Text regeneration does not review or replace chart values, even after use_revised.
  const retainedSlideIds = [...affected.keys()].filter(id => conflictChoices[id] === "keep_manual" || !!visible.get(id)?.chart);
  next.retainedSlideIds = [...new Set([...(document.retainedSlideIds ?? []).filter(id => pages.some(page => page.id === id) && !affected.has(id)), ...retainedSlideIds])];
  return { document: next, receipt: { before: structuredClone(document), afterRevision: next.revision, retainedSlideIds } };
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
  if (!proposalPages(document).some(slide => slide.id === slideId)) throw new Error("proposal_slide_not_found");
  for (const box of Object.values(edits.layout ?? {})) if (box) validateProposalBox(box);
  for (const [key, value] of Object.entries(edits.text ?? {})) {
    if (typeof value !== "string" || (key === "title" && (!value.trim() || value.length > 60)) || (key === "lead" && value.length > 140) || (key === "note" && value.length > 4000)) throw new Error("proposal_text_out_of_bounds");
  }
  const next = structuredClone(document);
  next.edits[slideId] = { text: { ...next.edits[slideId]?.text, ...edits.text }, layout: { ...next.edits[slideId]?.layout, ...edits.layout }, alignment: { ...next.edits[slideId]?.alignment, ...edits.alignment }, ...(edits.content ? { content: { ...next.edits[slideId]?.content, ...edits.content } } : next.edits[slideId]?.content ? { content: next.edits[slideId].content } : {}) };
  next.revision++;
  return next;
}

export function renderableProposal(document: ProposalDocument): DeckPlan {
  assertEditable(document.deck);
  const pages = proposalPages(document);
  validateProposalPages(document, pages);
  const originals = new Map(document.deck.slides.map(slide => [slide.id, slide]));
  const slots = new Map(document.deck.blueprint!.slots.map(slot => [slot.id, slot]));
  const slides = pages.map(page => {
    const original = (page.sourceId ? originals.get(page.sourceId) : undefined) ?? blankSlide(page);
    const edit = document.edits[page.id];
    const slide = { ...original, id: page.id, appendix: page.appendix, ...edit?.text, ...edit?.content, placement: { ...original.placement, ...edit?.layout }, alignment: { ...original.alignment, ...edit?.alignment }, composition: { ...original.composition!, layout: page.layout } };
    slide.points = slide.points?.map((point, index) => ({ ...point, id: point.id ?? `p${index + 1}` }));
    return slide;
  });
  const nextSlots = pages.map(page => ({ ...(slots.get(page.sourceId ?? page.id) ?? { role: "offering", title: PROPOSAL_LAYOUT_LABELS[page.layout], focus: "사용자 편집", requiredEvidence: [], missingEvidence: [], treatment: "source_only", fallback: "" }), id: page.id, layout: page.layout })) as ProposalSlot[];
  return { ...document.deck, ...(document.schemaVersion === 3 ? { schemaVersion: 3 as const } : {}), blueprint: { ...document.deck.blueprint!, slots: nextSlots }, slides };
}
