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
  // 없거나 닫힌 홈페이지 — 손님이 보는 화면이라 오늘창업 이름 없이, 검색에도 올리지 않는다(not-found.tsx)
  if (!published) return { title: "이 홈페이지는 지금 볼 수 없어요", description: "주소가 바뀌었거나 잠시 닫아 둔 홈페이지예요.", robots: { index: false }, openGraph: null };
  const requestHeaders = await headers();
  const origin = shareOrigin(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"), requestHeaders.get("x-forwarded-proto"));
  return landingShareMetadata(published.config, origin, `/launch/${encodeURIComponent(slug)}`);
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
