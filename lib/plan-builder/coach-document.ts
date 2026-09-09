import { chaptersForType } from "./blueprint";
import { coachDocumentRevision, readCoach } from "./coach";
import type { ServerPlan } from "./plan-server-store";

export function coachDocumentSnapshot(plan: ServerPlan) {
  const coach = readCoach(plan.answers);
  if (!coach) return null;
  const revision = coachDocumentRevision(coach);
  const entries = chaptersForType(plan.planType).flatMap(chapter => chapter.sections.map(section => ({
    key: `${chapter.id}/${section.id}`, chapterTitle: chapter.title, sectionTitle: section.title,
  })));
  const missing = entries.filter(({ key }) => !plan.sections[key]?.markdown.trim()).map(s => s.key);
  const stale = entries.filter(({ key }) => {
    const s = plan.sections[key];
    return s && !s.edited && !s.locked && s.coachRevision !== revision;
  }).map(s => s.key);
  const manualReview = entries.filter(({ key }) => {
    const s = plan.sections[key];
    return s && (s.edited || s.locked) && s.coachRevision !== revision;
  }).map(s => s.sectionTitle);
  return {
    business: coach.business, revision, missing, stale, manualReview,
    sections: entries.filter(({ key }) => plan.sections[key]?.markdown.trim()).map(({ key, ...titles }) => ({
      ...titles, markdown: plan.sections[key].markdown,
    })),
  };
}

export function completedDocumentKey(plan: ServerPlan): string | null {
  const expected = chaptersForType(plan.planType).flatMap(chapter => chapter.sections.map(section => `${chapter.id}/${section.id}`));
  if (!expected.length || expected.some(key => !plan.sections[key]?.markdown.trim())) return null;
  const snapshot = coachDocumentSnapshot(plan);
  if (snapshot && (snapshot.missing.length || snapshot.stale.length || snapshot.manualReview.length)) return null;
  return `${plan.id}:${snapshot?.revision ?? "document"}`;
}
