import type { ProjectRecord } from "../service-domain";
import { createLandingDraft } from "./domain";
import {
  getLandingForProject,
  publishLanding,
  saveLandingDraft,
} from "./repository";

export async function ensurePaidStarterLanding(
  project: ProjectRecord,
  guestTokenHash: string,
) {
  const existing = await getLandingForProject(project.id, guestTokenHash);
  if (existing?.status === "published") {
    return { site: existing, publicPath: `/launch/${existing.slug}`, created: false };
  }

  if (!existing) {
    const opportunity = project.opportunity;
    const title = String(opportunity.title ?? project.title);
    const draft = createLandingDraft({
      title,
      oneLiner: String(opportunity.oneLiner ?? `${title}을 소개합니다.`),
      customer: String(opportunity.customer ?? "필요한 고객"),
      model: String(opportunity.model ?? "맞춤 방식"),
      sector: String(opportunity.sector ?? "서비스"),
      legalNotice: String(opportunity.caution ?? "제공 범위와 일정은 상담 후 확정됩니다."),
    });
    draft.leadCaptureEnabled = false;
    draft.heroLabel = `${String(opportunity.sector ?? "사업")} · 홈페이지 준비 완료`;
    draft.ctaLabel = "서비스 살펴보기";
    draft.privacyContact = "";
    await saveLandingDraft(project.id, guestTokenHash, draft);
  }

  const site = await publishLanding(project.id, guestTokenHash);
  return { site, publicPath: `/launch/${site.slug}`, created: !existing };
}
