import { z } from "zod";
import { landingDraftSchema, type LandingDraft } from "./domain";
import { landingDraftFromPlan, type PlanLandingSource } from "./from-plan";
import { BUSINESS_TEMPLATE_PROFILES, createBusinessTemplate } from "./brainwave/business-content";
import { landingDraftFingerprint } from "./save-contract";
import { readCoach } from "../plan-builder/coach";

const fields = {
  businessName: { label: "사업 이름", sources: ["business.name"] },
  headline: { label: "대표 제목", sources: ["business.name"] },
  heroLabel: { label: "대표 상품 안내", sources: ["offer"] },
  subheadline: { label: "사업 소개", sources: ["customer", "offer", "problem", "solution"] },
  offerTitle: { label: "상품 이름", sources: ["offer"] },
  offerDescription: { label: "상품 설명", sources: ["offer"] },
  priceLabel: { label: "가격", sources: ["price"] },
  businessAddress: { label: "사업장 위치", sources: ["business.region"] },
} as const;
type Field = keyof typeof fields;
export type LandingSourceChange = {
  id: string;
  kind: "field" | "node" | "visibility";
  key: string;
  label: string;
  sourceIds: string[];
  before: string;
  after: string;
  baseline: string | null;
  conflict: boolean;
};
export type LandingSourcePreview = {
  planId: string;
  projectId: string;
  sourceRevision: string;
  expectedUpdatedAt: string;
  draftFingerprint: string;
  changes: LandingSourceChange[];
  supported: boolean;
};
export const landingSourceSelectionSchema = z.object({
  selectedChangeIds: z.array(z.string().max(200)).max(600),
  overwriteChangeIds: z.array(z.string().max(200)).max(600).default([]),
}).strict();
export type LandingSourceSelection = z.infer<typeof landingSourceSelectionSchema>;
type Context = { draft: LandingDraft; source: PlanLandingSource; planId: string; projectId: string; sourceRevision: string; expectedUpdatedAt: string };

function contentFor(source: PlanLandingSource, draft: LandingDraft) {
  const fresh = landingDraftFromPlan(source);
  return {
    fresh,
    content: { ...fresh.pageData!.businessContent!, cta: draft.ctaLabel, image: draft.heroImageUrl },
  };
}
function nodeSources(page: string, id: string): string[] {
  const field = BUSINESS_TEMPLATE_PROFILES[page]?.fields[id];
  if (field === "businessName" || field === "headline" || field === "contactTitle") return ["business.name"];
  if (field === "description" || field === "contactDescription") return ["offer"];
  if (field === "offer" || field === "customer" || field === "price") return [field];
  return [];
}
function canonicalSources(source: PlanLandingSource, ids: readonly string[]): string[] {
  const coach = readCoach(source.answers);
  const legacy: Record<string, string[]> = {
    "business.name": ["business:name"], "business.region": ["answer:overview/summary/city"],
    offer: ["answer:market/products/main_offer", "answer:market/products/offer_detail"],
    customer: ["answer:market/segments/first_target"], price: ["answer:market/products/price_value"],
    problem: ["answer:overview/problem/problems"], solution: ["answer:overview/problem/solutions", "answer:overview/problem/why_better"],
  };
  return [...new Set(ids.flatMap(id => id === "business.name" ? ["business:name"] : coach && id.startsWith("business.") ? [id.replace(".", ":")]
    : coach?.fields.some(field => field.key === id && field.value.trim()) ? [`field:${id}`] : legacy[id] ?? []))];
}
const nodeLabels: Record<string, string> = { businessName: "상호", headline: "대표 제목", contactTitle: "문의 제목", description: "사업 소개", contactDescription: "문의 안내", offer: "상품 안내", customer: "고객 안내", price: "가격 안내" };

/** Preview only. The artifact-update transaction owns all writes and source/version checks. */
export function buildLandingSourcePreview(context: Context): LandingSourcePreview {
  const { draft, source, planId, projectId, sourceRevision, expectedUpdatedAt } = context;
  const bw = draft.pageData?.brainwave;
  const result: LandingSourcePreview = { planId, projectId, sourceRevision, expectedUpdatedAt, draftFingerprint: landingDraftFingerprint(draft), changes: [], supported: Boolean(bw && BUSINESS_TEMPLATE_PROFILES[bw.page]) };
  if (!bw || !result.supported) return result;
  const { fresh, content } = contentFor(source, draft);
  const next = createBusinessTemplate(content, bw.page);
  const storedSnapshot = draft.pageData?.sourceSnapshot;
  const foreignSnapshot = Boolean(storedSnapshot && storedSnapshot.planId !== planId);
  const snapshot = foreignSnapshot ? undefined : storedSnapshot;
  const baseline = !foreignSnapshot && draft.pageData?.businessContent && bw.contentMode === "business"
    ? createBusinessTemplate(draft.pageData.businessContent, bw.page) : null;
  const add = (change: Omit<LandingSourceChange, "conflict">) => {
    if (change.before !== change.after) result.changes.push({ ...change, conflict: change.baseline === null || change.before !== change.baseline });
  };
  for (const key of Object.keys(fields) as Field[]) {
    // Clearing a source is also a real change; do not silently retain an old price or location.
    add({ id: `field:${key}`, kind: "field", key, label: fields[key].label, sourceIds: canonicalSources(source, fields[key].sources), before: draft[key], after: fresh[key], baseline: snapshot?.fields[key] ?? null });
  }
  for (const [key, after] of Object.entries(next.texts)) {
    const sourceIds = nodeSources(bw.page, key);
    if (!sourceIds.length) continue;
    add({ id: `node:${bw.page}:${key}`, kind: "node", key, label: `화면 문구 · ${nodeLabels[BUSINESS_TEMPLATE_PROFILES[bw.page].fields[key]] ?? "사업정보"}`, sourceIds: canonicalSources(source, sourceIds), before: bw.texts[key] ?? "", after, baseline: snapshot?.nodes[key] ?? baseline?.texts[key] ?? null });
  }
  for (const fact of BUSINESS_TEMPLATE_PROFILES[bw.page].facts) {
    const sourceIds = canonicalSources(source, nodeSources(bw.page, fact.value));
    if (!sourceIds.length) continue;
    for (const key of [fact.label, fact.value]) {
      const previous = snapshot?.visibility?.[key] ?? (baseline ? baseline.hidden.includes(key) : null);
      add({ id: `visibility:${bw.page}:${key}`, kind: "visibility", key, label: "사업정보 표시 상태", sourceIds,
        before: bw.hidden.includes(key) ? "숨김" : "표시", after: next.hidden.includes(key) ? "숨김" : "표시", baseline: previous === null ? null : previous ? "숨김" : "표시" });
    }
  }
  return result;
}

/** Pure draft transform. Conflicts require explicit approval for that exact change ID. */
export function applyLandingSourceSelection(context: Context, preview: LandingSourcePreview, input: LandingSourceSelection): LandingDraft {
  const selection = landingSourceSelectionSchema.parse(input);
  const current = buildLandingSourcePreview(context);
  if (!current.supported) throw new Error("LANDING_SOURCE_UNSUPPORTED");
  if (preview.planId !== current.planId || preview.projectId !== current.projectId || preview.sourceRevision !== current.sourceRevision
    || preview.expectedUpdatedAt !== current.expectedUpdatedAt || preview.draftFingerprint !== current.draftFingerprint) throw new Error("LANDING_SOURCE_CONFLICT");
  const chosen = new Set(selection.selectedChangeIds);
  const overwrites = new Set(selection.overwriteChangeIds);
  const known = new Map(current.changes.map(change => [change.id, change]));
  if ([...chosen].some(id => !known.has(id)) || [...overwrites].some(id => !chosen.has(id))) throw new Error("LANDING_SOURCE_SELECTION_INVALID");
  if ([...chosen].some(id => known.get(id)!.conflict && !overwrites.has(id))) throw new Error("LANDING_SOURCE_MANUAL_CONFLICT");
  if (!chosen.size) throw new Error("LANDING_SOURCE_SELECTION_EMPTY");
  const next = structuredClone(context.draft);
  const bw = next.pageData!.brainwave!;
  const { fresh, content } = contentFor(context.source, next);
  const generated = createBusinessTemplate(content, bw.page);
  const snapshot = next.pageData?.sourceSnapshot?.planId === context.planId ? next.pageData.sourceSnapshot : undefined;
  const baselineFields = { ...snapshot?.fields };
  const baselineNodes = { ...snapshot?.nodes };
  const baselineVisibility = { ...snapshot?.visibility };
  for (const change of current.changes) {
    if (!chosen.has(change.id)) continue;
    if (change.kind === "field") { next[change.key as Field] = fresh[change.key as Field]; baselineFields[change.key] = change.after; }
    else if (change.kind === "node") { bw.texts[change.key] = generated.texts[change.key]; baselineNodes[change.key] = change.after; }
    else {
      const hidden = change.after === "숨김";
      bw.hidden = [...new Set(hidden ? [...bw.hidden, change.key] : bw.hidden.filter(id => id !== change.key))];
      baselineVisibility[change.key] = hidden;
    }
  }
  next.pageData!.sourceSnapshot = {
    version: 1, planId: current.planId, sourceRevision: current.sourceRevision,
    fields: baselineFields, nodes: baselineNodes, visibility: baselineVisibility,
    pendingChangeIds: current.changes.filter(change => !chosen.has(change.id)).map(change => change.id),
  };
  // Only per-node baselines advance. The legacy global baseline stays intact for skipped nodes.
  return landingDraftSchema.parse(next);
}

export function seedLandingSourceSnapshot(draft: LandingDraft, planId: string, sourceRevision: string): LandingDraft {
  if (!draft.pageData?.brainwave) return draft;
  return landingDraftSchema.parse({ ...draft, pageData: { ...draft.pageData, sourceSnapshot: {
    version: 1, planId, sourceRevision,
    fields: Object.fromEntries((Object.keys(fields) as Field[]).map(key => [key, draft[key]])),
    nodes: { ...draft.pageData.brainwave.texts }, visibility: Object.fromEntries(BUSINESS_TEMPLATE_PROFILES[draft.pageData.brainwave.page]?.facts.flatMap(fact => [fact.label, fact.value]).map(id => [id, draft.pageData!.brainwave!.hidden.includes(id)]) ?? []), pendingChangeIds: [],
  } } });
}
