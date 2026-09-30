import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicLandingClient } from "../../../components/public-landing-client";
import { loadBrainwavePageServer } from "../../../lib/landing/brainwave/load";
import { getPublishedLandingBySlug } from "../../../lib/landing/repository";
import { landingShareMetadata, shareOrigin } from "../../../lib/landing/share-card";

export async function generateMetadata(
  context: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await context.params;
  const published = await getPublishedLandingBySlug(slug);
  if (!published) return { title: "페이지를 찾을 수 없습니다" };
  const requestHeaders = await headers();
  const origin = shareOrigin(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"), requestHeaders.get("x-forwarded-proto"));
  return landingShareMetadata(published.config, origin);
}

export default async function PublicLandingPage(
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const published = await getPublishedLandingBySlug(slug);
  if (!published) notFound();
  const bw = published.config.pageData?.brainwave ? await loadBrainwavePageServer(published.config.pageData.brainwave.page) : null;
  return <PublicLandingClient slug={slug} config={published.config} brainwavePage={bw} />;
}
