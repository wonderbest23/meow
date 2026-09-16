import { notFound } from "next/navigation";
import LandingSourceFixture from "./LandingSourceFixture";
import { landingDraftFromPlan } from "../../../lib/landing/from-plan";
import { applyLandingSourceSelection, buildLandingSourcePreview, seedLandingSourceSnapshot } from "../../../lib/landing/source-update";
import { BUSINESS_TEMPLATE_IDS, BUSINESS_TEMPLATE_PROFILES, createBusinessTemplate } from "../../../lib/landing/brainwave/business-content";
import type { LandingSiteRecord } from "../../../lib/landing/domain";
import type { ArtifactPreview } from "../../../lib/plan-builder/artifact-updates";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const template = BUSINESS_TEMPLATE_IDS.includes(query.template ?? "") ? query.template! : "0-290";
  const source = { planTitle: "온결 스튜디오", business: {}, answers: { "market/products": { main_offer: "기업 소개서 제작", offer_detail: "실제 제품과 서비스를 정리합니다", price_value: "150만원" }, "market/segments": { first_target: "중소 제조사" } } };
  const initial = landingDraftFromPlan(source); initial.slug = "qa-source";
  initial.pageData!.brainwave = createBusinessTemplate(initial.pageData!.businessContent!, template);
  const draft = seedLandingSourceSnapshot(initial, "qa-source", "1");
  const profile = BUSINESS_TEMPLATE_PROFILES[template];
  draft.pageData!.brainwave!.texts[profile.headline] = "직접 작성한 제목";
  const site: LandingSiteRecord = { id: "00000000-0000-4000-8000-000000000001", projectId: "00000000-0000-4000-8000-000000000002", slug: draft.slug, status: "published", draft, publishedVersion: 1, publishedSlug: draft.slug, versions: [], customDomain: null, createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z", metrics: { pageViews: 0, ctaClicks: 0, leads: 0, conversionRate: 0 } };
  const nextSource = { ...source, planTitle: "온결 디자인", answers: { ...source.answers, "market/products": { ...source.answers["market/products"], price_value: "180만원" } } };
  const context = { draft, source: nextSource, planId: "qa-source", projectId: site.projectId, sourceRevision: "2", expectedUpdatedAt: site.updatedAt };
  const sourcePreview = buildLandingSourcePreview(context);
  const nextDraft = applyLandingSourceSelection(context, sourcePreview, { selectedChangeIds: sourcePreview.changes.filter(change => !change.conflict).map(change => change.id), overwriteChangeIds: [] });
  const preview: ArtifactPreview = { version: 1, planId: "qa-source", hash: "a".repeat(64), target: null,
    base: { sourceRevision: 2, sourceHash: "b".repeat(64), documentHash: "c".repeat(64), proposalRevision: 0, proposalHash: "d".repeat(64), homepageRevision: site.updatedAt },
    sources: [], documents: [], slides: [], homepage: { siteId: site.id, projectId: site.projectId, before: draft, after: nextDraft, changed: sourcePreview.changes.map(change => change.id), manualPreserved: sourcePreview.changes.filter(change => change.conflict).map(change => change.id), sourcePreview },
  };
  const media = createBusinessTemplate({ ...initial.pageData!.businessContent!, businessName: "대한민국 제조기업을 위한 제품 소개와 영업 자료 제작 스튜디오", description: "고객의 제품 특성과 납품 조건을 확인하고 활용 목적에 맞는 자료를 제작합니다 ".repeat(8), image: query.image === "dark" ? "/qa-dark-photo.png" : "/qa-light-photo.png" }, template);
  return <LandingSourceFixture site={site} preview={preview} media={media} contrast={query.view === "contrast"} />;
}
