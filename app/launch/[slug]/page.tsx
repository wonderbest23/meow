import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicLandingClient } from "../../../components/public-landing-client";
import { getPublishedLandingBySlug } from "../../../lib/landing/repository";

export async function generateMetadata(
  context: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await context.params;
  const published = await getPublishedLandingBySlug(slug);
  if (!published) return { title: "페이지를 찾을 수 없습니다" };
  return {
    title: `${published.config.businessName} | ${published.config.headline}`,
    description: published.config.subheadline,
    robots: { index: true, follow: true },
  };
}

export default async function PublicLandingPage(
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const published = await getPublishedLandingBySlug(slug);
  if (!published) notFound();
  return <PublicLandingClient slug={slug} config={published.config} />;
}
