import assert from "node:assert/strict";
import { landingDraftFromPlan, type PlanLandingSource } from "../lib/landing/from-plan";
import { BUSINESS_TEMPLATE_IDS, BUSINESS_TEMPLATE_PROFILES, createBusinessTemplate } from "../lib/landing/brainwave/business-content";
import { applyLandingSourceSelection, buildLandingSourcePreview, seedLandingSourceSnapshot } from "../lib/landing/source-update";

const old: PlanLandingSource = { planTitle: "온결 스튜디오", business: {}, answers: {
  "market/products": { main_offer: "기업 제품 소개서 제작", offer_detail: "제품별 소개 자료", price_value: "150만원" },
  "market/segments": { first_target: "중소 제조사" },
  "overview/summary": { city: "서울" },
} };
const source: PlanLandingSource = { ...old, planTitle: "온결 디자인", answers: { ...old.answers,
  "market/products": { ...old.answers["market/products"], price_value: "180만원" },
  "market/segments": { first_target: "국내 제조사" },
} };
for (const page of BUSINESS_TEMPLATE_IDS) {
  const original = landingDraftFromPlan(old);
  original.pageData!.brainwave = createBusinessTemplate(original.pageData!.businessContent!, page);
  const draft = seedLandingSourceSnapshot(original, "plan-source", "1");
  const bw = draft.pageData!.brainwave!;
  const title = BUSINESS_TEMPLATE_PROFILES[page].headline;
  bw.texts[title] = "사용자가 직접 정한 제목";
  bw.images["manual-photo"] = "https://example.com/own.jpg";
  bw.links["manual-link"] = "https://example.com";
  bw.sizes[title] = 1.15;
  bw.hidden.push("manual-hidden"); bw.order.reverse();
  const context = { draft, source, planId: "plan-source", projectId: "project-source", sourceRevision: "2", expectedUpdatedAt: "2026-09-15T00:00:00Z" };
  const before = structuredClone(draft);
  const preview = buildLandingSourcePreview(context);
  assert.ok(preview.supported);
  const conflict = preview.changes.find(change => change.kind === "node" && change.key === title)!;
  assert.ok(conflict.conflict);
  assert.ok(preview.changes.some(change => change.key === "priceLabel" && !change.conflict && change.after === "180만원"));
  assert.ok(preview.changes.every(change => change.sourceIds.every(id => /^(business|field|answer):/.test(id))));
  const selectedChangeIds = preview.changes.filter(change => !change.conflict).map(change => change.id);
  const result = applyLandingSourceSelection(context, preview, { selectedChangeIds, overwriteChangeIds: [] });
  assert.deepEqual(draft, before);
  assert.equal(result.businessName, "온결 디자인");
  assert.equal(result.priceLabel, "180만원");
  assert.equal(result.pageData!.brainwave!.texts[title], "사용자가 직접 정한 제목");
  for (const key of ["images", "links", "sizes", "hidden", "order"] as const) assert.deepEqual(result.pageData!.brainwave![key], bw[key]);
  assert.ok(result.pageData!.sourceSnapshot!.pendingChangeIds.includes(conflict.id));
  const remaining = buildLandingSourcePreview({ ...context, draft: result });
  assert.ok(!remaining.changes.some(change => selectedChangeIds.includes(change.id)), "Applied fields must not appear again");
  assert.throws(() => applyLandingSourceSelection(context, preview, { selectedChangeIds: [conflict.id], overwriteChangeIds: [] }), /MANUAL_CONFLICT/);
  const explicit = applyLandingSourceSelection(context, preview, { selectedChangeIds: [conflict.id], overwriteChangeIds: [conflict.id] });
  assert.equal(explicit.pageData!.brainwave!.texts[title], "온결 디자인");
  assert.throws(() => applyLandingSourceSelection({ ...context, sourceRevision: "3" }, preview, { selectedChangeIds, overwriteChangeIds: [] }), /SOURCE_CONFLICT/);
  assert.throws(() => applyLandingSourceSelection({ ...context, expectedUpdatedAt: "new" }, preview, { selectedChangeIds, overwriteChangeIds: [] }), /SOURCE_CONFLICT/);
  assert.throws(() => applyLandingSourceSelection({ ...context, draft: { ...draft, headline: "다른 탭 수정" } }, preview, { selectedChangeIds, overwriteChangeIds: [] }), /SOURCE_CONFLICT/);
  assert.throws(() => applyLandingSourceSelection(context, preview, { selectedChangeIds: ["not-real"], overwriteChangeIds: [] }), /SELECTION_INVALID/);
  assert.throws(() => applyLandingSourceSelection(context, preview, { selectedChangeIds: [], overwriteChangeIds: [] }), /SELECTION_EMPTY/);
  const legacy = structuredClone(draft); delete legacy.pageData!.sourceSnapshot;
  assert.ok(buildLandingSourcePreview({ ...context, draft: legacy }).changes.filter(change => change.kind === "field").every(change => change.conflict), "Unknown legacy provenance is manual, never automatic");
  const foreign = structuredClone(draft); foreign.pageData!.sourceSnapshot!.planId = "another-plan";
  const foreignPreview = buildLandingSourcePreview({ ...context, draft: foreign });
  assert.ok(foreignPreview.changes.every(change => change.conflict), "A copied snapshot from another business cannot authorize automatic replacement");
  const price = foreignPreview.changes.find(change => change.key === "priceLabel")!;
  const foreignApplied = applyLandingSourceSelection({ ...context, draft: foreign }, foreignPreview, { selectedChangeIds: [price.id], overwriteChangeIds: [price.id] });
  assert.deepEqual(foreignApplied.pageData!.sourceSnapshot!.fields, { priceLabel: "180만원" });
  assert.deepEqual(foreignApplied.pageData!.sourceSnapshot!.nodes, {});
}
const missing = { ...old, answers: { ...old.answers, "market/segments": { first_target: "" } } };
const blank = landingDraftFromPlan(missing);
blank.pageData!.brainwave = createBusinessTemplate(blank.pageData!.businessContent!, "0-290");
const draft = seedLandingSourceSnapshot(blank, "plan-source", "1");
const context = { draft, source, planId: "plan-source", projectId: "project-source", sourceRevision: "2", expectedUpdatedAt: "2026-09-15T00:00:00Z" };
const preview = buildLandingSourcePreview(context);
assert.ok(preview.changes.some(change => change.kind === "visibility" && change.before === "숨김" && change.after === "표시"));
const selectedChangeIds = preview.changes.map(change => change.id);
const result = applyLandingSourceSelection(context, preview, { selectedChangeIds, overwriteChangeIds: selectedChangeIds });
assert.ok(!result.pageData!.brainwave!.hidden.includes("0:343"));
assert.equal(result.pageData!.brainwave!.texts["0:342"], "국내 제조사");
console.log("landing-source-update: 10 templates, per-node preview, visibility, manual preservation, exact overwrite consent, source/draft guards and partial provenance passed");
