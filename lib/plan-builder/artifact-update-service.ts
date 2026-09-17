import { randomUUID } from "node:crypto";
import { coachDocumentRevision, coachFinancialReference, readCoach } from "./coach";
import { documentRefreshRuntime } from "./document-refresh-service";
import { documentRefreshResultSchema } from "./document-refresh";
import { proposalRewriteRuntime, validateRewriteResult } from "./proposal-rewrite-service";
import { artifactBase, artifactDigest, artifactLandingContext, artifactSections, buildArtifactPreview } from "./artifact-update-source";
import { listArtifactUpdates, loadArtifactContext, readArtifactUpdate, writeArtifactUpdate } from "./artifact-update-store";
import { ARTIFACT_DOCUMENT_CHUNK, ARTIFACT_SLIDE_CHUNK, ARTIFACT_SOURCE_KEY, artifactCommandSchema, type ArtifactChunk, type ArtifactCommand, type ArtifactJobRequest, type ArtifactPreview, type ArtifactRuntime, type ArtifactUpdate } from "./artifact-updates";
import { ProposalError, PROPOSAL_KEY, proposalHistory, readSavedProposal } from "./proposal-editor";
import { renderPlanMarkdown } from "./markdown";
import { renderableProposal, type ProposalSource } from "./proposal-revision";
import type { RewritePayload, RewritePreview } from "./proposal-rewrite";
import { deckFingerprint, deckSource } from "./deck-job";
import { applyLandingSourceSelection } from "../landing/source-update";
import type { ServerPlan } from "./plan-server-store";
import type { LandingSiteRecord } from "../landing/domain";
import { documentOperatingContext } from "./document-editorial";
import { operatingSourceFingerprint, proposalReviewDocument } from "./artifact-source-status";
import { withConfirmedIntakeContext } from "./intake-context";
import { intakeFinancialReference, readIntake } from "./intake-core";

export function artifactRuntime(owner: string): ArtifactRuntime | null {
  const document = documentRefreshRuntime(owner), ppt = proposalRewriteRuntime(owner);
  return document && ppt && artifactDigest(document.target) === artifactDigest(ppt.target) ? { target: document.target, document, ppt } : null;
}
export async function previewArtifactUpdate(owner: string, planId: string, target: ArtifactRuntime["target"] | null = null) {
  const { plan, site } = await loadArtifactContext(owner, planId);
  return buildArtifactPreview(plan, site, target);
}
const bump = (job: ArtifactUpdate) => ({ ...structuredClone(job), revision: job.revision + 1, updatedAt: new Date(Math.max(Date.now(), Date.parse(job.updatedAt) + 1)).toISOString() });
const same = (a: unknown, b: unknown) => artifactDigest(a) === artifactDigest(b);
const initialBudget = (count: number) => ({ maxCalls: Math.min(80, count * 2 + 4), reservedCalls: 0, maxInputBytes: 4_000_000, reservedInputBytes: 0, maxOutputTokens: Math.min(180000, count * 4000 + 8000), reservedOutputTokens: 0, deadline: new Date(Date.now() + 60 * 60_000).toISOString() });
function documentPayload(job: ArtifactUpdate, chunk: ArtifactChunk) {
  const coach = readCoach(job.snapshot.answers), entries = artifactSections(job.snapshot);
  const proposal = readSavedProposal(job.snapshot.answers);
  // 진단이 있으면 수익 방식·처리량을 반영한 손익 문장을 문서에 넘긴다.
  const intake = readIntake(job.snapshot.answers);
  return withConfirmedIntakeContext({ businessName: coach?.business.name || job.snapshot.title, businessDescription: coach?.business.description ?? "", stage: coach?.stage ?? "idea",
    sector: proposal?.document.deck.blueprint?.sector, purpose: proposal?.document.deck.blueprint?.purpose,
    fields: coach?.fields.map(({ key, value, basis }) => ({ key, value, basis })) ?? [], financialReference: [coach ? (intake ? intakeFinancialReference(coach, intake) : coachFinancialReference(coach)) : "", documentOperatingContext(job.snapshot.answers)].filter(Boolean).join("\n\n"),
    sections: entries.filter(section => chunk.keys.includes(section.key)).map(section => ({ key: section.key, chapterTitle: section.chapterTitle, sectionTitle: section.sectionTitle, markdown: job.snapshot.sections[section.key]?.markdown ?? "" })) }, job.snapshot.answers);
}
function chunks(keys: string[], size: number, kind: ArtifactChunk["kind"]): ArtifactChunk[] {
  return Array.from({ length: Math.ceil(keys.length / size) }, (_, index) => ({ id: `${kind}-${index}`, kind, keys: keys.slice(index * size, (index + 1) * size), status: "pending" }));
}
async function required(owner: string, planId: string, id: string) {
  const job = await readArtifactUpdate(owner, planId, id);
  if (!job) throw new ProposalError("not_found", "이 변경 작업을 찾을 수 없어요", 404);
  return job;
}
function assertCurrent(job: ArtifactUpdate, plan: ServerPlan, site: LandingSiteRecord | null) {
  if (!same(job.preview.base, artifactBase(plan, site))) throw new ProposalError("source_changed", "사업 정보나 결과물이 바뀌었어요. 최신 내용으로 다시 확인해 주세요");
}
function assertChoices(ids: string[], choices: Record<string, "replace" | "keep">) {
  if (Object.keys(choices).length !== ids.length || ids.some(id => !choices[id]) || Object.keys(choices).some(id => !ids.includes(id))) throw new ProposalError("decision_required", "변경 항목마다 유지 또는 반영을 선택해 주세요", 400);
}
export async function reserveArtifactUpdate(owner: string, planId: string, raw: Extract<ArtifactCommand, { type: "generate" }>, runtime = artifactRuntime(owner)) {
  const command = artifactCommandSchema.parse(raw);
  if (command.type !== "generate") throw new ProposalError("invalid_command", "요청을 확인해 주세요", 400);
  const prior = await readArtifactUpdate(owner, planId, command.id);
  if (prior) {
    if (prior.preview.hash !== command.hash || !same(prior.preview.base, command.base) || prior.requestedHomepage !== command.includeHomepage) throw new ProposalError("request_reused", "같은 요청 번호로 다른 자료를 보낼 수 없어요");
    return prior;
  }
  const { plan, site } = await loadArtifactContext(owner, planId);
  const preview = buildArtifactPreview(plan, site, runtime?.target ?? null);
  if (preview.hash !== command.hash || !same(preview.base, command.base)) throw new ProposalError("consent_changed", "전송할 자료나 대상이 바뀌었어요. 다시 확인해 주세요");
  const work = [...chunks(preview.documents.filter(item => !item.locked).map(item => item.key), ARTIFACT_DOCUMENT_CHUNK, "document"), ...chunks(preview.slides.map(item => item.id), ARTIFACT_SLIDE_CHUNK, "ppt")];
  if (work.length > 32 || Buffer.byteLength(JSON.stringify(plan)) > 8_000_000) throw new ProposalError("budget_exceeded", "변경 범위가 처리 한도를 넘어요. 문서와 PPT를 나누어 확인해 주세요", 400);
  if (work.length && !runtime) throw new ProposalError("disabled", "AI 연동 갱신은 아직 열리지 않았어요", 503);
  if (!work.length && !(command.includeHomepage && preview.homepage)) throw new ProposalError("no_changes", "반영할 변경이 없어요");
  const at = new Date().toISOString();
  const job: ArtifactUpdate = { version: 1, id: command.id, ownerHash: owner, planId, revision: 1, status: work.length ? "queued" : "ready", createdAt: at, updatedAt: at,
    preview: { ...preview, homepage: command.includeHomepage ? preview.homepage : null }, snapshot: structuredClone(plan), chunks: work, dispatchAttempt: 0, requestedHomepage: command.includeHomepage, budget: initialBudget(work.length), documents: [], slides: [] };
  if (work.some(chunk => Buffer.byteLength(JSON.stringify(chunk.kind === "document" ? documentPayload(job, chunk) : pptPayload(job, chunk).payload)) > 96000)) throw new ProposalError("payload_too_large", "한 작업에 필요한 원문이 너무 커요. 해당 문서 항목의 분량을 정리해 주세요", 400);
  return writeArtifactUpdate(job, 0, { beforePlan: plan });
}

export async function reconcileArtifactUpdate(job: ArtifactUpdate): Promise<ArtifactUpdate> {
  if (!["queued", "running"].includes(job.status)) return job;
  const expired = job.chunks.find(chunk => chunk.status === "running" && Date.now() - Date.parse(chunk.startedAt ?? "") >= 125000);
  if (!expired && Date.now() <= Date.parse(job.budget.deadline)) return job;
  const next = bump(job); next.status = "failed"; next.error = expired ? "outcome_unknown" : "budget_exceeded";
  if (expired) { const index = next.chunks.findIndex(chunk => chunk.id === expired.id); next.chunks[index].status = "failed"; next.chunks[index].error = "outcome_unknown"; }
  try { return await writeArtifactUpdate(next, job.revision); }
  catch (error) { if (error instanceof ProposalError && error.code === "revision_conflict") return required(job.ownerHash, job.planId, job.id); throw error; }
}

export async function queueArtifactUpdate(job: ArtifactUpdate, binding: Pick<Workflow<ArtifactJobRequest>, "create" | "get"> | null) {
  if (!["queued", "running"].includes(job.status)) return job;
  if (!binding) throw new ProposalError("dispatch_pending", "변경 요청은 저장됐어요. 실행 접수를 다시 확인해 주세요", 503);
  const params: ArtifactJobRequest = { operation: "artifact_update", ownerHash: job.ownerHash, planId: job.planId, jobId: job.id, attempt: job.dispatchAttempt };
  const id = `artifact-${job.id}-${job.dispatchAttempt}`;
  try { await binding.create({ id, params }); }
  catch { try { await (await binding.get(id)).status(); } catch { throw new ProposalError("dispatch_pending", "요청은 저장됐어요. 같은 요청으로 실행 상태를 다시 확인해 주세요", 503); } }
  return job;
}

function proposedSource(job: ArtifactUpdate): ProposalSource {
  const plan = job.snapshot, coach = readCoach(plan.answers);
  return { businessName: coach?.business.name || plan.title, businessDescription: coach?.business.description,
    sections: artifactSections(plan).map(section => ({ chapterTitle: section.chapterTitle, sectionTitle: section.sectionTitle, markdown: job.documents.find(draft => draft.key === section.key)?.markdown ?? plan.sections[section.key]?.markdown ?? "" })).filter(section => section.markdown.trim()) };
}
function pptPayload(job: ArtifactUpdate, chunk: ArtifactChunk): { payload: RewritePayload; preview: RewritePreview } {
  const saved = readSavedProposal(job.snapshot.answers);
  if (!saved) throw new Error("proposal_missing");
  const source = proposedSource(job), sections = artifactSections(job.snapshot), affected = job.preview.slides.filter(slide => chunk.keys.includes(slide.id));
  const neededIds = new Set(affected.flatMap(slide => slide.sourceIds));
  const neededNames = new Set(sections.filter(section => neededIds.has(section.id)).map(section => section.title));
  const slides = renderableProposal(saved.document).slides.filter(slide => chunk.keys.includes(slide.id!)).map(({ image: _image, placement: _placement, ...slide }) => ({ ...slide,
    sourceSections: sections.filter(section => affected.find(item => item.id === slide.id)?.sourceIds.includes(section.id)).map(section => section.title) }));
  slides.flatMap(slide => slide.sourceSections ?? []).forEach(name => neededNames.add(name));
  const sources = source.sections.filter(section => neededNames.has(`${section.chapterTitle} · ${section.sectionTitle}`));
  const old = new Map(saved.document.source.sections.map(section => [`${section.chapterTitle} · ${section.sectionTitle}`, section.markdown]));
  const payload: RewritePayload = { businessName: source.businessName, businessDescription: source.businessDescription, sector: saved.document.deck.blueprint?.sector, purpose: saved.document.deck.blueprint?.purpose, sources,
    sourceIds: Object.fromEntries(sections.map(section => [section.title, section.id])),
    changes: sources.map(section => ({ section: `${section.chapterTitle} · ${section.sectionTitle}`, before: old.get(`${section.chapterTitle} · ${section.sectionTitle}`) ?? "", after: section.markdown })), slides };
  return { payload, preview: { hash: job.preview.hash, baseContentHash: job.preview.base.proposalHash, sourceFingerprint: job.preview.base.sourceHash, target: job.preview.target, payload,
    impact: { baseRevision: saved.document.revision, nextSource: source, businessChanged: true, changedSections: payload.changes.map(change => change.section), affected: affected.map(slide => ({ slideId: slide.id, title: slide.title, sources: slide.sourceIds, textConflict: slide.manual })) } } };
}

/** One durable step per chunk. Replayed calls never repeat a claimed billable request. */
export async function executeArtifactChunk(owner: string, planId: string, id: string, index: number, attempt: number, runtime = artifactRuntime(owner)) {
  let job = await reconcileArtifactUpdate(await required(owner, planId, id));
  if (job.dispatchAttempt !== attempt || !["queued", "running"].includes(job.status)) return { ok: job.status === "ready", done: true };
  const chunk = job.chunks[index];
  if (!chunk) return { ok: job.status === "ready", done: true };
  if (chunk.status === "complete") return { ok: true, done: index === job.chunks.length - 1 };
  if (chunk.status === "running") {
    if (Date.now() - Date.parse(chunk.startedAt!) < 125000) return { ok: false, done: true };
    const unknown = bump(job); unknown.status = "failed"; unknown.error = "outcome_unknown"; unknown.chunks[index].status = "failed"; unknown.chunks[index].error = "outcome_unknown";
    await writeArtifactUpdate(unknown, job.revision); return { ok: false, done: true };
  }
  if (job.chunks.slice(0, index).some(item => item.status !== "complete")) return { ok: false, done: true };
  const context = await loadArtifactContext(owner, planId);
  try { assertCurrent(job, context.plan, context.site); }
  catch { const stale = bump(job); stale.status = "stale"; stale.error = "source_changed"; await writeArtifactUpdate(stale, job.revision); return { ok: false, done: true }; }
  if (!runtime || !same(job.preview.target, runtime.target)) { const failed = bump(job); failed.status = "failed"; failed.error = "target_changed"; await writeArtifactUpdate(failed, job.revision); return { ok: false, done: true }; }
  const payloadBytes = Buffer.byteLength(JSON.stringify(chunk.kind === "document" ? documentPayload(job, chunk) : pptPayload(job, chunk).payload));
  const reservedBytes = payloadBytes * 2 + 18000;
  if (payloadBytes > 96000 || job.budget.reservedCalls + 2 > job.budget.maxCalls || job.budget.reservedInputBytes + reservedBytes > job.budget.maxInputBytes || job.budget.reservedOutputTokens + 4000 > job.budget.maxOutputTokens || Date.now() > Date.parse(job.budget.deadline)) {
    const limited = bump(job); limited.status = "failed"; limited.error = "budget_exceeded"; await writeArtifactUpdate(limited, job.revision); return { ok: false, done: true };
  }
  const claim = randomUUID(), claimed = bump(job); claimed.status = "running";
  claimed.budget.reservedCalls += 2; claimed.budget.reservedInputBytes += reservedBytes; claimed.budget.reservedOutputTokens += 4000;
  claimed.chunks[index] = { ...chunk, status: "running", claim, startedAt: new Date().toISOString() };
  try { job = await writeArtifactUpdate(claimed, job.revision, { beforePlan: context.plan }); }
  catch (error) { if (error instanceof ProposalError && error.code === "revision_conflict") return { ok: false, done: true }; throw error; }
  let documents: ArtifactUpdate["documents"] = [], slides: ArtifactUpdate["slides"] = [], error: string | undefined;
  const usage: NonNullable<ArtifactChunk["usage"]> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const generate = async () => {
      if (chunk.kind === "document") {
        const result = await runtime.document.generate(documentPayload(job, chunk), event => usage.push(event));
        const parsed = documentRefreshResultSchema.parse(result);
        if (parsed.sections.length !== chunk.keys.length || new Set(parsed.sections.map(section => section.key)).size !== chunk.keys.length || parsed.sections.some(section => !chunk.keys.includes(section.key))) throw new Error("invalid_response");
        documents = await Promise.all(parsed.sections.map(async section => ({ ...section, html: await renderPlanMarkdown(section.markdown) })));
      } else {
        const data = pptPayload(job, chunk), generated = await runtime.ppt.generate(data.payload);
        usage.push(...generated.usage ?? []); slides = validateRewriteResult(generated.result, readSavedProposal(job.snapshot.answers)!, data.preview);
      }
    };
    await Promise.race([generate(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("outcome_unknown")), 115000); })]);
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : "invalid_response";
    error = ["quota_exhausted", "rate_limited", "timeout", "output_limit", "review_failed", "unavailable", "outcome_unknown"].includes(code) ? code : "invalid_response";
    if (caught && typeof caught === "object" && "usage" in caught && Array.isArray(caught.usage)) usage.push(...caught.usage);
  } finally { clearTimeout(timer); }
  const latest = await required(owner, planId, id);
  if (latest.status !== "running" || latest.chunks[index].claim !== claim) return { ok: false, done: true };
  const current = await loadArtifactContext(owner, planId), next = bump(latest);
  try { assertCurrent(latest, current.plan, current.site); } catch { error = "source_changed"; }
  next.chunks[index] = { ...next.chunks[index], status: error ? "failed" : "complete", error, usage: [...next.chunks[index].usage ?? [], ...usage], finishedAt: new Date().toISOString() };
  if (error) { next.status = error === "source_changed" ? "stale" : "failed"; next.error = error; }
  else { next.documents.push(...documents); next.slides.push(...slides); if (next.chunks.every(item => item.status === "complete")) next.status = "ready"; }
  await writeArtifactUpdate(next, latest.revision);
  return { ok: !error, done: next.status !== "running" };
}

export async function resumeArtifactUpdate(owner: string, planId: string, command: Extract<ArtifactCommand, { type: "resume" }>, runtime = artifactRuntime(owner)) {
  const job = await reconcileArtifactUpdate(await required(owner, planId, command.id)), context = await loadArtifactContext(owner, planId);
  assertCurrent(job, context.plan, context.site);
  if (job.revision !== command.expectedRevision) throw new ProposalError("revision_conflict", "최신 상태를 다시 확인해 주세요");
  if (["queued", "running"].includes(job.status)) return job;
  if (job.status !== "failed" || job.error === "outcome_unknown" || job.chunks.some(chunk => chunk.error === "outcome_unknown")) throw new ProposalError("new_request_required", "결과를 확인할 수 없는 요청은 중복 실행하지 않아요. 기존 요청을 닫고 새 변경안을 확인해 주세요");
  if (!runtime || !same(runtime.target, job.preview.target)) throw new ProposalError("target_changed", "전송 대상이 바뀌었어요");
  if (job.dispatchAttempt >= 2) throw new ProposalError("retry_limit", "재시도 한도에 도달했어요", 429);
  const next = bump(job); next.status = "queued"; next.error = undefined; next.dispatchAttempt++;
  next.chunks = next.chunks.map(chunk => chunk.status === "failed" ? { id: chunk.id, kind: chunk.kind, keys: chunk.keys, status: "pending", usage: chunk.usage } : chunk);
  return writeArtifactUpdate(next, job.revision, { beforePlan: context.plan });
}
export async function cancelArtifactUpdate(owner: string, planId: string, command: Extract<ArtifactCommand, { type: "cancel" }>) {
  const job = await required(owner, planId, command.id);
  if (job.status === "cancelled") return job;
  if (job.status === "applied") throw new ProposalError("already_applied", "반영된 변경안은 이전 버전으로 복원해 주세요");
  if (job.revision !== command.expectedRevision) throw new ProposalError("revision_conflict", "최신 상태를 확인해 주세요");
  const next = bump(job); next.status = "cancelled"; return writeArtifactUpdate(next, job.revision);
}

function homepageDraft(plan: ServerPlan, site: LandingSiteRecord | null, preview: ArtifactPreview, choices: Record<string, "replace" | "keep">) {
  if (!site || !preview.homepage) throw new ProposalError("homepage_missing", "연결된 홈페이지 변경안이 없어요");
  const ids = preview.homepage.sourcePreview.changes.map(change => change.id);
  assertChoices(ids, choices);
  const selectedChangeIds = ids.filter(id => choices[id] === "replace");
  return selectedChangeIds.length ? applyLandingSourceSelection(artifactLandingContext(plan, site), preview.homepage.sourcePreview, { selectedChangeIds, overwriteChangeIds: selectedChangeIds }) : null;
}
export async function approveArtifactUpdate(owner: string, planId: string, command: Extract<ArtifactCommand, { type: "approve" }>) {
  const job = await required(owner, planId, command.id), signature = artifactDigest({ ...command, expectedRevision: 0 });
  if (job.status === "applied") {
    if (job.decisionHash !== signature) throw new ProposalError("request_reused", "이미 다른 선택으로 반영한 요청이에요");
    return job;
  }
  if (job.status !== "ready" || job.revision !== command.expectedRevision || !same(command.base, job.preview.base)) throw new ProposalError("revision_conflict", "완료된 최신 변경안을 확인해 주세요");
  const { plan, site } = await loadArtifactContext(owner, planId); assertCurrent(job, plan, site);
  assertChoices(job.preview.documents.map(item => item.key), command.documents); assertChoices(job.preview.slides.map(item => item.id), command.slides);
  if (job.preview.documents.some(item => item.locked && command.documents[item.key] !== "keep")) throw new ProposalError("section_locked", "잠긴 항목은 자동으로 반영할 수 없어요");
  const keptDocuments = job.preview.documents.filter(item => command.documents[item.key] === "keep");
  if (keptDocuments.length && Object.values(command.slides).some(choice => choice === "replace")) throw new ProposalError("document_review_required", "이전 본문을 유지할 때는 해당 본문으로 생성한 PPT 변경안을 함께 반영할 수 없어요");
  const affectedIds = new Set([...job.preview.documents.map(item => item.id), ...job.preview.slides.map(item => `slide:${item.id}`), ...job.preview.homepage?.changed.map(id => `homepage:${id}`) ?? []]);
  const priorStale = plan.answers[ARTIFACT_SOURCE_KEY]?.staleItems;
  const nextPlan = structuredClone(plan), at = new Date(Math.max(Date.now(), Date.parse(plan.updatedAt) + 1)).toISOString(), staleItems: string[] = Array.isArray(priorStale) ? priorStale.filter((item): item is string => typeof item === "string" && !affectedIds.has(item)) : [];
  for (const section of job.preview.documents) {
    if (command.documents[section.key] === "keep") { staleItems.push(section.id); continue; }
    const draft = job.documents.find(item => item.key === section.key);
    if (!draft) throw new ProposalError("draft_missing", "완성되지 않은 항목이 있어요");
    const old = nextPlan.sections[section.key];
    nextPlan.sections[section.key] = { markdown: draft.markdown, html: draft.html, generatedAt: at, coachRevision: job.preview.base.sourceRevision, edited: old?.edited, locked: false, ...(old ? { previous: { markdown: old.markdown, html: old.html } } : {}) };
  }
  // Establish the approved document baseline before the shared completion/fingerprint check.
  nextPlan.answers[ARTIFACT_SOURCE_KEY] = { ...nextPlan.answers[ARTIFACT_SOURCE_KEY], sourceHash: job.preview.base.sourceHash,
    operatingFingerprint: operatingSourceFingerprint(job.snapshot.answers), staleItems };
  const saved = readSavedProposal(nextPlan.answers);
  if (saved && job.preview.slides.length) {
    const next = structuredClone(saved); next.history = proposalHistory({ ...saved, document: proposalReviewDocument(plan, saved.document) }, "source_update"); next.revision++; next.document.revision = next.revision; next.savedAt = at;
    for (const slide of job.preview.slides) {
      if (command.slides[slide.id] === "keep") { staleItems.push(`slide:${slide.id}`); continue; }
      const replacement = job.slides.find(item => item.id === slide.id);
      if (!replacement) throw new ProposalError("draft_missing", "완성되지 않은 페이지가 있어요");
      const original = renderableProposal(next.document).slides.find(item => item.id === slide.id);
      if (!original) throw new ProposalError("source_changed", "페이지 구성이 바뀌었어요. 변경안을 다시 확인해 주세요");
      if (next.document.schemaVersion === 3) {
        // Store a page-local revision so copies sharing a source never overwrite each other.
        const edit = next.document.edits[slide.id] ?? {};
        next.document.edits[slide.id] = { ...edit,
          text: { ...edit.text, title: replacement.title, lead: replacement.lead ?? "", eyebrow: replacement.eyebrow ?? "", note: replacement.note ?? "" },
          content: { ...edit.content, points: replacement.points?.map((point, index) => ({ ...point, id: point.id ?? original.points?.[index]?.id ?? `p${index + 1}` })), table: replacement.table, metrics: replacement.metrics } };
        if (original.chart) staleItems.push(`slide:${slide.id}:chart`);
        continue;
      }
      const index = next.document.deck.slides.findIndex(item => item.id === slide.id);
      next.document.deck.slides[index] = { ...original, ...replacement, composition: original.composition, image: original.image, placement: original.placement };
      if (original.chart || next.document.edits[slide.id]?.content?.chart) staleItems.push(`slide:${slide.id}:chart`);
      if (next.document.edits[slide.id]) {
        delete next.document.edits[slide.id].text;
        const content = next.document.edits[slide.id].content;
        if (content) { delete content.points; delete content.table; delete content.metrics; }
      }
    }
    const visibleIds = new Set(renderableProposal(next.document).slides.map(slide => slide.id!));
    next.document.retainedSlideIds = [...new Set([...(next.document.retainedSlideIds ?? []).filter(id => command.slides[id] !== "replace"), ...staleItems.filter(id => id.startsWith("slide:")).map(id => id.split(":")[1])])].filter(id => visibleIds.has(id));
    if (!staleItems.some(id => id.startsWith("section:") || id.startsWith("slide:") || id.startsWith("proposal:"))) {
      next.document.source = proposedSource(job); next.document.deck.brandName = next.document.source.businessName;
      try { next.fingerprint = deckFingerprint({ ...deckSource(nextPlan, readCoach(nextPlan.answers)?.business ?? { name: nextPlan.title, description: "", role: "", industry: "", region: "", stage: "" }), ...(next.presentation ? { presentation: next.presentation } : {}) }); }
      catch { staleItems.push("proposal:source"); }
    }
    renderableProposal(next.document); nextPlan.answers[PROPOSAL_KEY] = { ...next };
  }
  const draft = command.homepage === "replace" ? homepageDraft(plan, site, job.preview, command.homepageChoices) : null;
  if (job.preview.homepage) for (const change of job.preview.homepage.changed) if (command.homepage !== "replace" || command.homepageChoices[change] !== "replace") staleItems.push(`homepage:${change}`);
  const previousMetadata = nextPlan.answers[ARTIFACT_SOURCE_KEY] ?? {};
  nextPlan.answers[ARTIFACT_SOURCE_KEY] = { ...previousMetadata, revision: Number(previousMetadata.revision ?? 0) + 1, sourceHash: job.preview.base.sourceHash, sourceRevision: job.preview.base.sourceRevision,
    slideSources: { ...(previousMetadata.slideSources as object ?? {}), ...Object.fromEntries(job.preview.slides.map(slide => [slide.id, slide.sourceIds])) },
    sectionSources: { ...(previousMetadata.sectionSources as object ?? {}), ...Object.fromEntries(job.preview.documents.map(section => [section.id, section.sourceIds])) }, staleItems, appliedJobId: job.id };
  nextPlan.updatedAt = at;
  const next = bump(job); next.status = "applied"; next.decisionHash = signature; next.staleItems = staleItems;
  return writeArtifactUpdate(next, job.revision, { beforePlan: plan, nextPlan, ...(draft && site ? { site, draft } : {}) });
}

export async function applyHomepageArtifactUpdate(owner: string, planId: string, command: Extract<ArtifactCommand, { type: "homepage_apply" }>) {
  const signature = artifactDigest(command), prior = await readArtifactUpdate(owner, planId, command.id);
  if (prior) { if (prior.status !== "applied" || prior.decisionHash !== signature) throw new ProposalError("request_reused", "이미 사용한 요청 번호예요"); return prior; }
  const { plan, site } = await loadArtifactContext(owner, planId), preview = buildArtifactPreview(plan, site, null);
  if (preview.hash !== command.hash || !same(preview.base, command.base)) throw new ProposalError("source_changed", "사업 정보나 홈페이지가 바뀌었어요. 다시 비교해 주세요");
  const draft = homepageDraft(plan, site, preview, command.choices);
  if (!draft || !site) throw new ProposalError("no_changes", "반영할 항목을 선택해 주세요", 400);
  const at = new Date().toISOString();
  const job: ArtifactUpdate = { version: 1, id: command.id, ownerHash: owner, planId, revision: 1, status: "applied", createdAt: at, updatedAt: at, preview, snapshot: plan, chunks: [], documents: [], slides: [], dispatchAttempt: 0, requestedHomepage: true, budget: initialBudget(0), decisionHash: signature,
    staleItems: preview.homepage!.changed.filter(id => command.choices[id] === "keep").map(id => `homepage:${id}`) };
  return writeArtifactUpdate(job, 0, { beforePlan: plan, site, draft });
}

export { listArtifactUpdates, readArtifactUpdate };
