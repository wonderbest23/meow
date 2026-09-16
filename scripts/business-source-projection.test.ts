import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { businessSourceProjection } from "../lib/plan-builder/business-source-projection";
import { COACH_KEY, readCoach, type CoachState } from "../lib/plan-builder/coach";
import { coachDocumentSnapshot, completedDocumentKey } from "../lib/plan-builder/coach-document";
import { artifactBase, artifactDigest, artifactSections, artifactSources, buildArtifactPreview } from "../lib/plan-builder/artifact-update-source";
import { ARTIFACT_SOURCE_KEY, type ArtifactRuntime } from "../lib/plan-builder/artifact-updates";
import { approveArtifactUpdate, executeArtifactChunk, reserveArtifactUpdate } from "../lib/plan-builder/artifact-update-service";
import { readArtifactUpdate } from "../lib/plan-builder/artifact-update-store";
import { operatingSourceFingerprint } from "../lib/plan-builder/artifact-source-status";
import { OPERATING_KEY, type OperatingPeriod } from "../lib/plan-builder/operating-records";
import { loadPlanState, savePlanState, type ServerPlan } from "../lib/plan-builder/plan-server-store";
import { PROPOSAL_KEY, readSavedProposal } from "../lib/plan-builder/proposal-editor";
import { loadProposalEditor, updateSavedProposal } from "../lib/plan-builder/proposal-editor-service";
import { deckFingerprint, deckSource } from "../lib/plan-builder/deck-job";
import { saveIntakeCommand } from "../lib/plan-builder/intake-service";
import { seedBusinessRewriteFixture, documentFixtureResult, mockRewrite } from "./proposal-rewrite-fixture";

Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", PROPOSAL_AI_ENABLED: "false" });
globalThis.fetch = async () => { throw new Error("NO_EXTERNAL_CALLS"); };

const sourceHash = (plan: ServerPlan) => artifactBase(plan, null).sourceHash;
const coachOf = (plan: ServerPlan) => readCoach(plan.answers)!;
const legacyHash = (plan: ServerPlan) => artifactDigest({ coach: readCoach(plan.answers),
  answers: Object.fromEntries(Object.entries(plan.answers).filter(([key]) => !key.startsWith("__"))),
  operations: plan.answers[OPERATING_KEY] ?? null, planType: plan.planType });
const baseline = (plan: ServerPlan) => {
  plan.answers[ARTIFACT_SOURCE_KEY] = { sourceHash: sourceHash(plan), operatingFingerprint: operatingSourceFingerprint(plan.answers), staleItems: [] };
};
function addIncidentalState(plan: ServerPlan) {
  const coach = coachOf(plan);
  coach.revision += 10;
  coach.messages.push({ id: "chat-only", role: "user", text: "Thanks", at: "2026-09-16T12:00:00.000Z" });
  coach.suggestions = ["Next question"];
  coach.ready = !coach.ready;
  coach.lastGeneration = { elapsedMs: 1200, calls: [{ provider: "mock", model: "local", inputTokens: 40, outputTokens: 20 }] };
  Object.assign(coach, { loading: true, questionProgress: { index: 4, completed: ["customer"] }, extractionJob: { status: "running", attempt: 2 } });
  plan.answers[COACH_KEY].loading = true;
  plan.answers.__coach_job = { status: "running", phase: "extracting", updatedAt: "2026-09-16T12:00:00.000Z" };
  plan.answers.__coach_generation = { status: "queued", runId: "local-only" };
  plan.answers.__business_intake = { state: { version: 1, selectedQuestionId: "customer", detailsRequested: true,
    answers: { experience: { status: "unknown", value: null } }, notes: [{ id: "pending", text: "Unconfirmed note", status: "queued" }],
    candidates: [{ id: "unconfirmed", fieldKey: "price", value: "999999 KRW", status: "pending" }],
    job: { status: "running", kind: "extract" }, receipts: [{ id: "ui-only", signature: "audit" }] } };
}

async function main() {
  const owner = `qa-business-source-${randomUUID()}`, planId = "qa-business-source";
  await seedBusinessRewriteFixture(owner, planId);
  const state = await loadPlanState(owner), plan = state.plans[0];
  for (const section of Object.values(plan.sections)) if (!section.markdown.trim()) section.markdown = "Synthetic source for local verification.";
  const saved = readSavedProposal(plan.answers)!;
  saved.document.source.sections = artifactSections(plan).map(section => ({
    chapterTitle: section.chapterTitle, sectionTitle: section.sectionTitle, markdown: plan.sections[section.key].markdown,
  }));
  baseline(plan);
  saved.fingerprint = deckFingerprint({ ...deckSource(plan, coachOf(plan).business), presentation: saved.presentation });
  const original = structuredClone(plan), before = structuredClone(plan), originalHash = sourceHash(plan);
  assert.equal(buildArtifactPreview(plan, null, null).documents.length, 0);
  assert.equal(buildArtifactPreview(plan, null, null).slides.length, 0);
  assert(completedDocumentKey(plan));

  const chat = structuredClone(plan);
  addIncidentalState(chat);
  assert.deepEqual(artifactBase(chat, null), artifactBase(plan, null));
  assert.deepEqual(buildArtifactPreview(chat, null, null), buildArtifactPreview(plan, null, null));
  assert.equal(completedDocumentKey(chat), completedDocumentKey(plan));
  assert.deepEqual(coachDocumentSnapshot(chat)?.outdated, []);
  assert.deepEqual(artifactSources(chat), artifactSources(plan), "Intake UI, progress, audit and extraction candidates never become sources");
  assert.deepEqual(plan, before, "Projection and previews never mutate the input");

  const reordered = structuredClone(plan);
  coachOf(reordered).fields.reverse();
  coachOf(reordered).fields.forEach(field => { field.messageId = "replayed-message-id"; });
  assert.equal(sourceHash(reordered), originalHash, "Field order and message transport IDs are not business changes");
  const legacyCoach = structuredClone(coachOf(plan));
  delete legacyCoach.documentRevision;
  const legacyProjection = businessSourceProjection(legacyCoach);
  legacyCoach.revision++;
  assert.deepEqual(businessSourceProjection(legacyCoach), legacyProjection, "General revision is never a projected document revision");

  const changes: Array<[string, (coach: CoachState) => void]> = [
    ["confirmed price", coach => { coach.fields.find(field => field.key === "price")!.value = "1800000 KRW"; }],
    ["field basis", coach => { coach.fields[0].basis = "proposal"; }],
    ["evidence qualifiers", coach => { coach.fields[0].quote += " during September"; }],
    ["field removal", coach => { coach.fields.pop(); }],
    ["business identity", coach => { coach.business.name = "New business"; }],
    ["business description", coach => { coach.business.description += " New offer."; }],
    ["business region", coach => { coach.business.region = "New region"; }],
    ["stage", coach => { coach.stage = "startup"; }],
    ["depth", coach => { coach.depth = "detailed"; }],
    ["document revision", coach => { coach.documentRevision!++; }],
    ["original vision", coach => { coach.ideaOrigin = { text: "Original long-term vision", messageId: "origin" }; }],
  ];
  for (const [name, change] of changes) {
    const updated = structuredClone(plan);
    change(coachOf(updated));
    assert.notEqual(sourceHash(updated), originalHash, name);
    assert(buildArtifactPreview(updated, null, null).documents.length > 0, name);
    assert(buildArtifactPreview(updated, null, null).slides.length > 0, name);
  }

  const designed = structuredClone(plan), designedCoach = coachOf(designed);
  designedCoach.design = { sourceRevision: designedCoach.documentRevision!, status: "proposal", approach: "operating-improvement",
    startingPlan: { scope: "Current offer", connectionToVision: "Original vision", whyThis: "Known constraints", notIncluded: ["Expansion"] },
    alternatives: [{ name: "Alternative", scope: "Smaller offer", tradeoff: "Limited scope" }],
    assumptions: [{ statement: "Repeat demand", howToCheck: "Review orders" }],
    nextAction: { action: "Contact buyer", doneWhen: "Reply received", usableText: "Offer description" } };
  designedCoach.directAction = { sourceRevision: designedCoach.documentRevision!, action: "User action", doneWhen: "User criterion", usableText: "User text" };
  designedCoach.ideaOrigin = { text: "Original vision", messageId: "origin" };
  const designedHash = sourceHash(designed);
  assert.notEqual(designedHash, originalHash);
  designedCoach.directAction.needsReview = true;
  designedCoach.ideaOrigin.messageId = "origin-replayed";
  Object.assign(designedCoach.design, { loading: true, elapsedMs: 50 });
  assert.equal(sourceHash(designed), designedHash);
  for (const change of [
    (coach: CoachState) => { coach.design!.startingPlan.scope += " updated"; },
    (coach: CoachState) => { coach.design!.alternatives[0].tradeoff += " updated"; },
    (coach: CoachState) => { coach.design!.assumptions[0].howToCheck += " updated"; },
    (coach: CoachState) => { coach.design!.nextAction.usableText += " updated"; },
    (coach: CoachState) => { coach.directAction!.action += " updated"; },
    (coach: CoachState) => { coach.directAction!.doneWhen += " updated"; },
    (coach: CoachState) => { coach.directAction!.usableText += " updated"; },
  ]) {
    const updated = structuredClone(designed);
    change(coachOf(updated));
    assert.notEqual(sourceHash(updated), designedHash, "Substantive design/action edits change the source");
  }
  const inactive = structuredClone(designed);
  coachOf(inactive).design!.sourceRevision = 0;
  coachOf(inactive).directAction!.sourceRevision = 0;
  const inactiveHash = sourceHash(inactive);
  coachOf(inactive).design!.startingPlan.scope = "Unapplied draft";
  coachOf(inactive).directAction!.action = "Unapplied draft action";
  assert.equal(sourceHash(inactive), inactiveHash, "Non-current drafts are not active source inputs");
  delete coachOf(inactive).design;
  delete coachOf(inactive).directAction;
  assert.equal(sourceHash(inactive), inactiveHash, "Absent and non-current drafts have the same projection");

  const at = "2026-09-16T00:00:00.000Z";
  const period: OperatingPeriod = { id: randomUUID(), revision: 1, createdAt: at, updatedAt: at,
    start: "2026-09-01", end: "2026-09-07", metrics: { inquiries: 5, orders: 2, revenue: 3000000, expenses: null },
    feedback: "Synthetic records", keep: "", change: "", nextAction: "", successCriterion: "" };
  const operating = structuredClone(plan);
  operating.answers[OPERATING_KEY] = { version: 1, revision: 1, periods: [period], reports: [], analyses: [] };
  assert.notEqual(sourceHash(operating), originalHash);
  assert.equal(completedDocumentKey(operating), null);
  assert.equal(buildArtifactPreview(operating, null, null).documents.length, Object.keys(plan.sections).length);
  assert.equal(artifactSources(operating).find(source => source.id === `period:${period.id}/metric:expenses`)?.basis, "missing");
  baseline(operating);
  const operatingHash = sourceHash(operating);
  period.metrics.revenue = 4000000;
  assert.notEqual(sourceHash(operating), operatingHash, "Metrics are checked even without a period revision bump");
  period.metrics.revenue = 3000000;
  period.end = "2026-09-14";
  assert.notEqual(sourceHash(operating), operatingHash, "Period dates are material");
  period.end = "2026-09-07";
  operating.answers[OPERATING_KEY].periods = [];
  assert.notEqual(sourceHash(operating), operatingHash, "Period deletion is material");

  const normal = structuredClone(plan);
  delete normal.answers[COACH_KEY];
  assert.equal(sourceHash(normal), legacyHash(normal), "Non-coach answers retain the original hashing contract");
  normal.answers["strategy/price"] = { amount: "1800000 KRW" };
  assert.notEqual(sourceHash(normal), sourceHash({ ...normal, answers: { ...normal.answers, "strategy/price": { amount: "1500000 KRW" } } }));

  const intake = structuredClone(plan);
  intake.answers["intake/details"] = {
    repeatRate: { value: 25, unit: "%", period: "month", messageId: "answer-repeat", quote: "25 percent" },
    refunds: { value: 0, unit: "KRW", period: "month", messageId: "answer-refunds", quote: "0 KRW" },
    unknownCost: { value: null, unit: "KRW", period: "month", messageId: "answer-unknown", quote: "" },
  };
  intake.answers["intake/period"] = { value: "2026-09", basis: "user", messageId: "answer-period" };
  coachOf(intake).documentRevision!++;
  const intakeHash = sourceHash(intake), intakeSources = artifactSources(intake);
  assert.notEqual(intakeHash, originalHash, "Confirmed detail and reporting-period answers are business sources");
  assert.equal(completedDocumentKey(intake), null, "A confirmed intake change requires document regeneration");
  assert.deepEqual(intakeSources.find(source => source.id === "answer:intake/details/repeatRate"), {
    id: "answer:intake/details/repeatRate", label: "intake/details/repeatRate", value: "25", basis: "user", revision: 2,
    unit: "%", period: "month", provenance: { messageId: "answer-repeat", quote: "25 percent" },
  });
  assert.equal(intakeSources.find(source => source.id === "answer:intake/details/refunds")?.value, "0");
  assert.equal(intakeSources.find(source => source.id === "answer:intake/details/unknownCost")?.basis, "missing");
  assert.deepEqual(intakeSources.find(source => source.id === "answer:intake/period/value"), {
    id: "answer:intake/period/value", label: "intake/period/value", value: "2026-09", basis: "user", revision: 2,
    period: "2026-09", provenance: { messageId: "answer-period", quote: "" },
  });
  for (const [key, value] of [["value", 30], ["unit", "count"], ["period", "week"], ["quote", "Only first-time customers"]] as const) {
    const updated = structuredClone(intake);
    (updated.answers["intake/details"].repeatRate as Record<string, unknown>)[key] = value;
    assert.notEqual(sourceHash(updated), intakeHash, `Confirmed detail ${key} changes are material`);
  }
  const changedPeriod = structuredClone(intake);
  changedPeriod.answers["intake/period"].value = "2026-10";
  assert.notEqual(sourceHash(changedPeriod), intakeHash);
  for (const [key, value] of [["unit", "days"], ["period", "week"], ["quote", "Confirmed reporting window"]] as const) {
    const updated = structuredClone(intake);
    updated.answers["intake/period"][key] = value;
    assert.notEqual(sourceHash(updated), intakeHash, `Confirmed reporting-period ${key} remains material`);
  }
  const repeated = structuredClone(intake);
  (repeated.answers["intake/details"].repeatRate as Record<string, unknown>).messageId = "repeat-answer-new-id";
  repeated.answers["intake/period"].messageId = "repeat-period-new-id";
  coachOf(repeated).revision++;
  const repeatedBefore = structuredClone(repeated);
  assert.deepEqual(artifactBase(repeated, null), artifactBase(intake, null), "Repeating identical intake answers with new message IDs does not invalidate artifacts");
  assert.deepEqual(repeated, repeatedBefore, "Canonical hashing never removes stored provenance");
  assert.notEqual(legacyHash(repeated), legacyHash(intake), "The original legacy algorithm must retain raw message IDs");
  const readyIntake = structuredClone(intake);
  Object.values(readyIntake.sections).forEach(section => { section.coachRevision = coachOf(readyIntake).documentRevision; });
  baseline(readyIntake);
  (readyIntake.answers["intake/details"].repeatRate as Record<string, unknown>).messageId = "another-repeat-id";
  readyIntake.answers["intake/period"].messageId = "another-period-id";
  assert.equal(buildArtifactPreview(readyIntake, null, null).documents.length, 0);
  assert.equal(buildArtifactPreview(readyIntake, null, null).slides.length, 0);

  const legacyDeckSource = { ...deckSource(plan, coachOf(plan).business), presentation: saved.presentation };
  assert.equal(deckFingerprint(legacyDeckSource), createHash("sha256").update(JSON.stringify(legacyDeckSource)).digest("hex"),
    "Deck sources without intake keys retain their exact legacy fingerprint, including coach context");
  const intakeDeckSource = { ...deckSource(readyIntake, coachOf(readyIntake).business), presentation: saved.presentation };
  const intakeDeckBefore = structuredClone(intakeDeckSource), intakeDeckHash = deckFingerprint(intakeDeckSource);
  const repeatedDeckSource = structuredClone(intakeDeckSource);
  (repeatedDeckSource.allAnswers["intake/details"].repeatRate as Record<string, unknown>).messageId = "deck-repeat-detail";
  repeatedDeckSource.allAnswers["intake/period"].messageId = "deck-repeat-period";
  assert.equal(deckFingerprint(repeatedDeckSource), intakeDeckHash, "Deck fingerprints ignore only intake message IDs");
  assert.deepEqual(intakeDeckSource, intakeDeckBefore, "Deck hashing preserves input provenance");
  for (const [key, value] of [["value", 30], ["unit", "count"], ["period", "week"], ["quote", "Only first-time customers"]] as const) {
    const updated = structuredClone(intakeDeckSource);
    (updated.allAnswers["intake/details"].repeatRate as Record<string, unknown>)[key] = value;
    assert.notEqual(deckFingerprint(updated), intakeDeckHash, `Deck detail ${key} remains material`);
  }
  const changedDeckPeriod = structuredClone(intakeDeckSource);
  changedDeckPeriod.allAnswers["intake/period"].value = "2026-10";
  assert.notEqual(deckFingerprint(changedDeckPeriod), intakeDeckHash, "Deck reporting-period values remain material");
  const ordinaryDeck = { ...legacyDeckSource, allAnswers: { ...legacyDeckSource.allAnswers, "strategy/price": { value: "same", messageId: "old" } } };
  assert.equal(deckFingerprint(ordinaryDeck), createHash("sha256").update(JSON.stringify(ordinaryDeck)).digest("hex"));
  assert.notEqual(deckFingerprint(ordinaryDeck), deckFingerprint({ ...ordinaryDeck,
    allAnswers: { ...ordinaryDeck.allAnswers, "strategy/price": { value: "same", messageId: "new" } } }), "Ordinary answer metadata keeps its legacy behavior");

  const deckOwner = `qa-deck-intake-repeat-${randomUUID()}`, deckPlan = structuredClone(readyIntake);
  deckPlan.answers["intake/period"].value = "2026-09-01 / 2026-09-30";
  baseline(deckPlan);
  await savePlanState(deckOwner, { ...structuredClone(state), plans: [deckPlan] });
  await updateSavedProposal(deckOwner, planId, (proposal, currentState, currentPlan) => {
    proposal.fingerprint = deckFingerprint({ ...deckSource(currentPlan, currentState.business), presentation: proposal.presentation });
    return proposal;
  });
  assert.equal((await loadProposalEditor(deckOwner, planId)).sourceChanged, false);
  const deckBeforeRepeat = (await loadPlanState(deckOwner)).plans[0];
  await saveIntakeCommand(deckOwner, { planId, action: "answer", revision: coachOf(deckBeforeRepeat).revision, requestId: randomUUID(),
    questionId: "period", value: "2026-09-01 / 2026-09-30" });
  const deckAfterRepeat = (await loadPlanState(deckOwner)).plans[0];
  assert.notEqual(deckAfterRepeat.answers["intake/period"].messageId, deckBeforeRepeat.answers["intake/period"].messageId);
  assert.equal(coachOf(deckAfterRepeat).documentRevision, coachOf(deckBeforeRepeat).documentRevision);
  assert.equal(sourceHash(deckAfterRepeat), sourceHash(deckBeforeRepeat));
  assert.equal((await loadProposalEditor(deckOwner, planId)).sourceChanged, false, "An identical confirmed period does not mark the proposal stale");
  assert.equal(buildArtifactPreview(deckAfterRepeat, null, null).documents.length, 0);
  assert.equal(buildArtifactPreview(deckAfterRepeat, null, null).slides.length, 0);

  const legacyIntake = structuredClone(readyIntake);
  legacyIntake.answers[ARTIFACT_SOURCE_KEY].sourceHash = legacyHash(legacyIntake);
  assert.equal(buildArtifactPreview(legacyIntake, null, null).documents.length, 0, "Exact legacy hashes with raw intake provenance remain supported");
  legacyIntake.answers["intake/period"].messageId = "legacy-unprovable-repeat";
  assert(buildArtifactPreview(legacyIntake, null, null).documents.length > 0, "Legacy compatibility must not silently normalize an unprovable baseline");
  const ordinaryMetadata = structuredClone(intake);
  ordinaryMetadata.answers["strategy/price"] = { value: "unchanged", messageId: "ordinary-id" };
  const ordinaryHash = sourceHash(ordinaryMetadata);
  ordinaryMetadata.answers["strategy/price"].messageId = "ordinary-new-id";
  assert.notEqual(sourceHash(ordinaryMetadata), ordinaryHash, "Only intake keys receive message-ID normalization");
  const intakeQuestionOnly = structuredClone(intake);
  addIncidentalState(intakeQuestionOnly);
  assert.equal(sourceHash(intakeQuestionOnly), intakeHash);
  assert.deepEqual(artifactSources(intakeQuestionOnly), intakeSources);
  assert.equal(buildArtifactPreview(intakeQuestionOnly, null, null).hash, buildArtifactPreview(intake, null, null).hash);
  intakeQuestionOnly.answers["intake/details"] = Object.fromEntries(Object.entries(intakeQuestionOnly.answers["intake/details"]).reverse());
  assert.deepEqual(artifactSources(intakeQuestionOnly), intakeSources, "Question source IDs and order are stable");

  const incidentalProposal = structuredClone(plan), proposalRecord = incidentalProposal.answers[PROPOSAL_KEY];
  Object.assign(proposalRecord, { savedAt: at, history: [], receipts: [], rewriteAttempts: [{ id: "local", startedAt: at }],
    documentRefreshAttempts: [], rewrite: { status: "queued" }, documentRefresh: { status: "running" }, selectedSlideId: "ui-selection" });
  assert.deepEqual(artifactBase(incidentalProposal, null), artifactBase(plan, null), "Proposal bookkeeping is not source or content");
  assert.equal(buildArtifactPreview(incidentalProposal, null, null).hash, buildArtifactPreview(plan, null, null).hash);
  const editedProposal = structuredClone(plan), edited = readSavedProposal(editedProposal.answers)!;
  edited.document.edits[edited.document.deck.slides[0].id!] = { text: { title: "Manual title" } };
  assert.equal(sourceHash(editedProposal), originalHash);
  assert.notEqual(artifactBase(editedProposal, null).proposalHash, artifactBase(plan, null).proposalHash, "Proposal content retains its CAS guard");
  edited.revision++;
  assert.notEqual(artifactBase(editedProposal, null).proposalRevision, artifactBase(plan, null).proposalRevision);

  const legacy = structuredClone(plan);
  legacy.answers[ARTIFACT_SOURCE_KEY].sourceHash = legacyHash(legacy);
  assert.notEqual(legacy.answers[ARTIFACT_SOURCE_KEY].sourceHash, originalHash);
  assert.equal(buildArtifactPreview(legacy, null, null).documents.length, 0, "An exact legacy baseline is still fresh");
  assert.equal(buildArtifactPreview(legacy, null, null).slides.length, 0);
  const storedLegacy = legacy.answers[ARTIFACT_SOURCE_KEY].sourceHash;
  coachOf(legacy).fields.find(field => field.key === "price")!.value = "1800000 KRW";
  assert(buildArtifactPreview(legacy, null, null).documents.length > 0, "An old baseline never conceals a real price change");
  assert.equal(legacy.answers[ARTIFACT_SOURCE_KEY].sourceHash, storedLegacy, "Preview never silently migrates metadata");
  const unknownLegacy = structuredClone(plan);
  unknownLegacy.answers[ARTIFACT_SOURCE_KEY].sourceHash = legacyHash(unknownLegacy);
  addIncidentalState(unknownLegacy);
  assert(buildArtifactPreview(unknownLegacy, null, null).documents.length > 0, "Unprovable legacy equality requires a one-time review");
  const missingBaseline = structuredClone(plan);
  delete missingBaseline.answers[ARTIFACT_SOURCE_KEY];
  assert(buildArtifactPreview(missingBaseline, null, null).documents.length > 0);
  const kept = structuredClone(plan), first = artifactSections(kept)[0];
  kept.answers[ARTIFACT_SOURCE_KEY].staleItems = [first.id];
  assert(buildArtifactPreview(kept, null, null).documents.some(section => section.id === first.id));
  assert.equal(completedDocumentKey(kept), null, "A matching hash never clears retained stale items");

  const absent = structuredClone(plan), absentSaved = readSavedProposal(absent.answers)!;
  delete absent.sections[first.key];
  absentSaved.document.source.sections = absentSaved.document.source.sections.filter(section => `${section.chapterTitle} · ${section.sectionTitle}` !== first.title);
  assert(buildArtifactPreview(absent, null, null).documents.some(section => section.id === first.id), "Missing documents remain generation candidates");
  assert.equal(buildArtifactPreview(absent, null, null).slides.length, 0, "Missing on both sides is not a changed PPT source");
  absent.sections[first.key] = { markdown: "", html: "", generatedAt: at, coachRevision: 1 };
  assert.equal(buildArtifactPreview(absent, null, null).slides.length, 0, "An empty draft does not invalidate slides");
  assert.equal(completedDocumentKey(absent), null, "Missing content is never document-ready");

  coachOf(plan).fields.find(field => field.key === "price")!.value = "180만원";
  coachOf(plan).documentRevision!++;
  await savePlanState(owner, state);
  const runtime: ArtifactRuntime = { target: { provider: "mock", model: "no-network" },
    document: { generate: async payload => documentFixtureResult(payload) },
    ppt: { target: { provider: "mock", model: "no-network" }, generate: async payload => ({ result: mockRewrite(payload) }) } };
  const preview = buildArtifactPreview((await loadPlanState(owner)).plans[0], null, runtime.target);
  const job = await reserveArtifactUpdate(owner, planId, { type: "generate", id: randomUUID(), hash: preview.hash, base: preview.base, consent: true, includeHomepage: false }, runtime);
  const chatting = await loadPlanState(owner);
  addIncidentalState(chatting.plans[0]);
  await savePlanState(owner, chatting);
  for (let i = 0; i < job.chunks.length; i++) assert((await executeArtifactChunk(owner, planId, job.id, i, 0, runtime)).ok);
  const ready = (await readArtifactUpdate(owner, planId, job.id))!;
  assert.equal(ready.status, "ready", ready.error ?? "Artifact update should be ready");
  await approveArtifactUpdate(owner, planId, { type: "approve", id: job.id, expectedRevision: ready.revision, base: preview.base,
    documents: Object.fromEntries(preview.documents.map(section => [section.key, "replace"])),
    slides: Object.fromEntries(preview.slides.map(slide => [slide.id, "replace"])), homepage: "keep", homepageChoices: {} });
  const applied = (await loadPlanState(owner)).plans[0];
  assert.equal(applied.answers[ARTIFACT_SOURCE_KEY].sourceHash, sourceHash(applied));
  assert(completedDocumentKey(applied));
  assert.equal(buildArtifactPreview(applied, null, null).documents.length, 0);
  assert.equal(buildArtifactPreview(applied, null, null).slides.length, 0);
  assert.equal((await loadProposalEditor(owner, planId)).sourceChanged, false);
  assert.deepEqual(original, before, "Independent mutation cases leave the original fixture intact");
  console.log(JSON.stringify({ passed: ["chat/progress/jobs invariant", "canonical field order", "business/evidence invalidation", "current design/action projection", "operating metrics and periods", "unchanged normal answers", "confirmed intake source provenance", "identical intake repeat message-ID invariance", "deck intake-only normalization and legacy compatibility", "identical period keeps proposal current", "raw legacy intake baseline compatibility", "question-selection-only invariance", "proposal bookkeeping invariant", "legacy conservative compatibility", "absent draft freshness", "chat during artifact approval", "document-ready after approval"], paidCalls: 0, mockOnly: true }));
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
