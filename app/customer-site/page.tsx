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
  if (!published) return { title: "연결된 홈페이지를 찾을 수 없습니다" };
  // /launch 주소와 같은 카톡·검색 카드(대표 사진·소개 문구) — 내 도메인으로 공유해도 사진이 보이게
  return landingShareMetadata(published.config, `https://${hostname}`);
}

export default async function CustomerSitePage() {
  const published = await getPublishedLandingByCustomDomain(await currentHostname());
  if (!published) notFound();
  const bw = published.config.pageData?.brainwave ? await loadBrainwavePageServer(published.config.pageData.brainwave.page) : null;
  return <PublicLandingClient slug={published.config.slug} config={published.config} brainwavePage={bw} />;
}
