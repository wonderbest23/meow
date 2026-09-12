import { notFound } from "next/navigation";
import { HomePhoneStory } from "../../../components/home-phone-story";

export default async function PhoneStoryPreview({ searchParams }: { searchParams: Promise<{ progress?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { progress } = await searchParams;
  const value = Number(progress ?? 0.04);
  return <main className="new-home simple-home product-home cinematic-home"><HomePhoneStory previewProgress={Number.isFinite(value) ? value : 0.04} /></main>;
}
