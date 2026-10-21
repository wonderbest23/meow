import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicLandingClient } from "../../components/public-landing-client";
import { loadBrainwavePageServer } from "../../lib/landing/brainwave/load";
import { getPublishedLandingByCustomDomain } from "../../lib/landing/repository";
import { landingShareMetadata } from "../../lib/landing/share-card";

async function currentHostname() {
  const headerStore = await headers();
  return (headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "")
    .split(",", 1)[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

export async function generateMetadata(): Promise<Metadata> {
  const hostname = await currentHostname();
  const published = await getPublishedLandingByCustomDomain(hostname);
  if (!published) return { title: "이 홈페이지는 지금 볼 수 없어요", description: "주소가 바뀌었거나 잠시 닫아 둔 홈페이지예요.", robots: { index: false }, openGraph: null };
  // /launch 주소와 같은 카톡·검색 카드(대표 사진·소개 문구) — 내 도메인으로 공유해도 사진이 보이게
  return landingShareMetadata(published.config, `https://${hostname}`);
}

export default async function CustomerSitePage() {
  const published = await getPublishedLandingByCustomDomain(await currentHostname());
  if (!published) notFound();
  const bw = published.config.pageData?.brainwave ? await loadBrainwavePageServer(published.config.pageData.brainwave.page) : null;
  return <PublicLandingClient slug={published.config.slug} config={published.config} brainwavePage={bw} />;
}
