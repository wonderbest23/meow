import { createHash } from "node:crypto";
import { chaptersForType } from "./blueprint";
import { coachDocumentRevision, readCoach } from "./coach";
import { readSavedProposal, ProposalError } from "./proposal-editor";
import { ARTIFACT_SOURCE_KEY, artifactSlideText, type ArtifactBase, type ArtifactPreview, type ArtifactSource } from "./artifact-updates";
import type { ServerPlan } from "./plan-server-store";
import type { LandingSiteRecord } from "../landing/domain";
import { applyLandingSourceSelection, buildLandingSourcePreview } from "../landing/source-update";
import type { RewriteTarget } from "./proposal-rewrite";
import { METRICS, OPERATING_KEY, readOperatingState } from "./operating-records";
import { proposalPages, renderableProposal } from "./proposal-revision";
import { proposalReviewDocument } from "./artifact-source-status";
import { businessSourceProjection } from "./business-source-projection";

export const artifactDigest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)).digest("hex");
export function artifactSections(plan: ServerPlan) {
  return chaptersForType(plan.planType).flatMap(chapter => chapter.sections.map(section => ({ id: `section:${chapter.id}/${section.id}`, key: `${chapter.id}/${section.id}`, title: `${chapter.title} · ${section.title}`, chapterTitle: chapter.title, sectionTitle: section.title })));
}
function artifactIntakeSources(plan: ServerPlan, revision: number): ArtifactSource[] {
  const source = (id: string, record: Record<string, unknown>, isPeriod = false): ArtifactSource => {
    const missing = record.value === null || record.value === undefined;
    const value = missing ? "미입력" : typeof record.value === "string" ? record.value : JSON.stringify(record.value);
    const period = typeof record.period === "string" ? record.period : isPeriod && !missing ? value : undefined;
    return { id: `answer:${id}`, label: id, value, basis: missing ? "missing" : typeof record.basis === "string" ? record.basis : "user", revision,
      provenance: { messageId: typeof record.messageId === "string" ? record.messageId : "", quote: typeof record.quote === "string" ? record.quote : "" },
      ...(typeof record.unit === "string" ? { unit: record.unit } : {}), ...(period ? { period } : {}) };
  };
  const details = Object.entries(plan.answers["intake/details"] ?? {}).sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, value]) =>
    value && typeof value === "object" && !Array.isArray(value) && "value" in value ? [source(`intake/details/${key}`, value as Record<string, unknown>)] : []);
  const period = plan.answers["intake/period"];
  return [...details, ...(period && "value" in period ? [source("intake/period/value", period, true)] : [])];
}
export function artifactSources(plan: ServerPlan): ArtifactSource[] {
  const coach = readCoach(plan.answers);
  const revision = coach ? coachDocumentRevision(coach) : 0;
  const fields: ArtifactSource[] = coach ? [
    { id: "business:name", label: "사업명", value: coach.business.name, basis: "stored", revision },
    { id: "business:description", label: "사업 소개", value: coach.business.description, basis: coach.fields.find(field => field.key === "business")?.basis ?? "stored", revision },
    ...coach.fields.map(field => ({ id: `field:${field.key}`, label: field.key, value: field.value, basis: field.basis, revision,
      provenance: { messageId: field.messageId, quote: field.quote },
      ...(/\d[\d,.\s]*[천만억]*원|₩\s*\d|\d\s*KRW/i.test(field.value) ? { unit: "원" } : /\d[\d,.\s]*(?:USD|달러)|\$\s*\d/i.test(field.value) ? { unit: "USD" } : {}),
      ...(field.key === "hoursPerWeek" ? { unit: "시간", period: "주" } : field.key === "minutesPerSale" ? { unit: "분", period: "판매 1회" } : {}),
    })),
  ] : Object.entries(plan.answers).filter(([key]) => !key.startsWith("__")).flatMap(([section, values]) => Object.entries(values).map(([key, value]) => ({ id: `answer:${section}/${key}`, label: `${section}/${key}`, value: typeof value === "string" ? value : JSON.stringify(value), basis: "user" })));
  const operations = readOperatingState(plan.answers);
  const periods: ArtifactSource[] = operations.periods.flatMap(period => [
    ...METRICS.map(metric => ({ id: `period:${period.id}/metric:${metric.key}`, label: `${period.start} ~ ${period.end} ${metric.label}`,
      value: period.metrics[metric.key] === null ? "미입력" : String(period.metrics[metric.key]), basis: period.metrics[metric.key] === null ? "missing" : "user-records", unit: metric.unit,
      period: `${period.start}/${period.end}`, revision: period.revision })),
    ...(["feedback", "keep", "change", "nextAction", "successCriterion"] as const).map(key => ({ id: `period:${period.id}/${key}`, label: `${period.start} ~ ${period.end} ${key}`, value: period[key], basis: "user-records", period: `${period.start}/${period.end}`, revision: period.revision })),
  ]);
  return [...fields, ...(coach ? artifactIntakeSources(plan, revision) : []), ...periods];
}
function legacyArtifactSourceInput(plan: ServerPlan) {
  return { coach: readCoach(plan.answers), answers: Object.fromEntries(Object.entries(plan.answers).filter(([key]) => !key.startsWith("__"))), operations: plan.answers[OPERATING_KEY] ?? null, planType: plan.planType };
}
function artifactSourceInput(plan: ServerPlan) {
  const source = legacyArtifactSourceInput(plan);
  const withoutMessageId = ({ messageId: _messageId, ...value }: Record<string, unknown>) => value;
  const details = source.answers["intake/details"], period = source.answers["intake/period"];
  if (details) source.answers["intake/details"] = Object.fromEntries(Object.entries(details).map(([id, value]) => [id,
    value && typeof value === "object" && !Array.isArray(value) ? withoutMessageId(value as Record<string, unknown>) : value]));
  if (period) source.answers["intake/period"] = withoutMessageId(period);
  return source;
}

export function artifactBase(plan: ServerPlan, site: LandingSiteRecord | null): ArtifactBase {
  const coach = readCoach(plan.answers), proposal = readSavedProposal(plan.answers);
  return { sourceRevision: coach ? coachDocumentRevision(coach) : 0,
    sourceHash: artifactDigest({ ...artifactSourceInput(plan), coach: businessSourceProjection(coach) }),
    documentHash: artifactDigest(plan.sections), proposalRevision: proposal?.revision ?? 0,
    proposalHash: artifactDigest(proposal ? { document: proposal.document, presentation: proposal.presentation, fingerprint: proposal.fingerprint, generationToken: proposal.generationToken } : null), homepageRevision: site?.updatedAt ?? null };
}
export function artifactLandingContext(plan: ServerPlan, site: LandingSiteRecord) {
  const base = artifactBase(plan, site);
  return { draft: site.draft, source: { planTitle: plan.title, business: {}, answers: plan.answers, contactEmail: site.draft.privacyContact }, planId: plan.id, projectId: site.projectId, sourceRevision: `${base.sourceRevision}:${base.sourceHash}`, expectedUpdatedAt: site.updatedAt };
}

/** Resolve legacy labels only once; persisted dependency IDs survive later label edits. */
export function artifactSlideSources(plan: ServerPlan, slideId: string, legacyNames: string[], sourceId?: string): string[] {
  const metadata = plan.answers[ARTIFACT_SOURCE_KEY] as { slideSources?: Record<string, string[]> } | undefined;
  const saved = metadata?.slideSources?.[slideId] ?? (sourceId ? metadata?.slideSources?.[sourceId] : undefined);
  if (saved?.length) return saved;
  const sections = artifactSections(plan), byName = new Map(sections.map(section => [section.title, section.id]));
  const resolved = legacyNames.map(name => name.startsWith("section:") ? name : byName.get(name)).filter((id): id is string => !!id);
  // Unknown dependencies require a full review rather than silently omitting a page.
  return resolved.length === legacyNames.length && resolved.length ? [...new Set(resolved)] : sections.map(section => section.id);
}

export function buildArtifactPreview(plan: ServerPlan, site: LandingSiteRecord | null, target: RewriteTarget | null): ArtifactPreview {
  const base = artifactBase(plan, site), sources = artifactSources(plan), saved = readSavedProposal(plan.answers);
  const reviewDocument = saved ? proposalReviewDocument(plan, saved.document) : null;
  const metadata = plan.answers[ARTIFACT_SOURCE_KEY] as { sourceHash?: string; staleItems?: string[] } | undefined;
  // Only an exact legacy match proves freshness. Never adopt an unknown old baseline.
  const sourceChanged = metadata?.sourceHash !== base.sourceHash && metadata?.sourceHash !== artifactDigest(legacyArtifactSourceInput(plan));
  const sections = artifactSections(plan);
  const documents = sections.filter(section => {
    const old = plan.sections[section.key];
    return !old?.markdown || old.coachRevision !== base.sourceRevision || sourceChanged || metadata?.staleItems?.includes(section.id);
  }).map(section => ({ id: section.id, key: section.key, title: section.title, before: plan.sections[section.key]?.markdown ?? "", locked: !!plan.sections[section.key]?.locked, manual: !!plan.sections[section.key]?.edited, sourceIds: sources.map(source => source.id) }));
  const changedSections = new Set(documents.filter(section => section.before.trim()).map(section => section.id));
  const oldByName = new Map(saved?.document.source.sections.map(section => [`${section.chapterTitle} · ${section.sectionTitle}`, section.markdown]) ?? []);
  sections.forEach(section => {
    const before = oldByName.get(section.title) ?? "", after = plan.sections[section.key]?.markdown ?? "";
    if ((before.trim() || after.trim()) && before !== after) changedSections.add(section.id);
  });
  const pages = saved ? new Map(proposalPages(saved.document).map(page => [page.id, page])) : new Map();
  const slideSources = (slide: { id?: string; sourceSections?: string[] }) => artifactSlideSources(plan, slide.id!, slide.sourceSections ?? [], pages.get(slide.id!)?.sourceId);
  const slides = (reviewDocument ? renderableProposal(reviewDocument).slides : []).filter(slide => sourceChanged || reviewDocument?.retainedSlideIds?.includes(slide.id!) || slideSources(slide).some(id => changedSections.has(id))).map(slide => ({
    id: slide.id!, title: slide.title, before: artifactSlideText(slide),
    manual: pages.get(slide.id!)?.sourceId !== slide.id || Object.values(saved!.document.edits[slide.id!] ?? {}).some(value => value && Object.keys(value).length > 0),
    sourceIds: slideSources(slide),
  })) ?? [];
  let homepage: ArtifactPreview["homepage"] = null;
  if (site) {
    const context = artifactLandingContext(plan, site), sourcePreview = buildLandingSourcePreview(context);
    if (sourcePreview.supported && sourcePreview.changes.length) {
      const selectedChangeIds = sourcePreview.changes.filter(change => !change.conflict).map(change => change.id);
      homepage = { siteId: site.id, projectId: site.projectId, before: site.draft,
        after: selectedChangeIds.length ? applyLandingSourceSelection(context, sourcePreview, { selectedChangeIds, overwriteChangeIds: [] }) : site.draft,
        changed: sourcePreview.changes.map(change => change.id), manualPreserved: sourcePreview.changes.filter(change => change.conflict).map(change => change.id), sourcePreview };
    }
  }
  if (slides.some(slide => !slide.id)) throw new ProposalError("unsupported_proposal", "기존 PPT를 편집 가능한 형식으로 먼저 열어 주세요");
  const result = { version: 1 as const, planId: plan.id, base, target, sources, documents, slides, homepage };
  return { ...result, hash: artifactDigest(result) };
}
