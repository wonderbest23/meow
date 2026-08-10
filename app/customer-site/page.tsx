import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicLandingClient } from "../../components/public-landing-client";
import { getPublishedLandingByCustomDomain } from "../../lib/landing/repository";

async function currentHostname() {
  const headerStore = await headers();
  return (headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "")
    .split(",", 1)[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

export async function generateMetadata(): Promise<Metadata> {
  const published = await getPublishedLandingByCustomDomain(await currentHostname());
  if (!published) return { title: "연결된 홈페이지를 찾을 수 없습니다" };
  return {
    title: `${published.config.businessName} | ${published.config.headline}`,
    description: published.config.subheadline,
    robots: { index: true, follow: true },
  };
}

export default async function CustomerSitePage() {
  const published = await getPublishedLandingByCustomDomain(await currentHostname());
  if (!published) notFound();
  return <PublicLandingClient slug={published.site.slug} config={published.config} />;
}
