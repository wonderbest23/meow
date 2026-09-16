import { readOperatingState } from "./operating-records";
import { proposalPages, pruneProposalRetainedSlides, type ProposalDocument } from "./proposal-revision";
import type { ServerPlan } from "./plan-server-store";

const sourceKey = "__artifact_sources";

// Period revisions are server-owned; notes, metrics, dates and deletions change this baseline.
export function operatingSourceFingerprint(answers: ServerPlan["answers"]): string {
  const periods = readOperatingState(answers).periods;
  return periods.length ? JSON.stringify(periods.map(period => [period.id, period.revision, period.start, period.end]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))) : "";
}

export function operatingSourceChanged(plan: ServerPlan): boolean {
  const baseline = plan.answers[sourceKey]?.operatingFingerprint;
  const current = operatingSourceFingerprint(plan.answers);
  return typeof baseline === "string" ? baseline !== current : current !== "";
}

export function artifactStaleItems(plan: ServerPlan): string[] {
  const items = plan.answers[sourceKey]?.staleItems;
  return Array.isArray(items) ? items.filter((item): item is string => typeof item === "string") : [];
}

export function artifactDocumentOutdated(plan: ServerPlan, sectionKey: string): boolean {
  return operatingSourceChanged(plan) || artifactStaleItems(plan).includes(`section:${sectionKey}`);
}

export function proposalReviewDocument(plan: ServerPlan, document: ProposalDocument): ProposalDocument {
  const next = pruneProposalRetainedSlides(document), visible = new Set(proposalPages(next).map(page => page.id));
  const pending = artifactStaleItems(plan).filter(id => id.startsWith("slide:")).map(id => id.split(":")[1]).filter(id => visible.has(id));
  if (pending.length) next.retainedSlideIds = [...new Set([...(next.retainedSlideIds ?? []), ...pending])];
  return next;
}

export function pruneArtifactSlideMetadata(plan: ServerPlan, document: ProposalDocument) {
  const metadata = plan.answers[sourceKey];
  if (!metadata) return;
  const visible = new Set(proposalPages(document).map(page => page.id)), before = artifactStaleItems(plan);
  const after = before.filter(id => !id.startsWith("slide:") || visible.has(id.split(":")[1]));
  if (after.length !== before.length) plan.answers[sourceKey] = { ...metadata, revision: Number(metadata.revision ?? 0) + 1, staleItems: after };
}
