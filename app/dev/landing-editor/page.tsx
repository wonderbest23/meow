import { notFound } from "next/navigation";
import LandingEditorFixture from "./LandingEditorFixture";
import MediaFieldFixture from "./MediaFieldFixture";

export default async function Page({ searchParams }: { searchParams: Promise<{ media?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  if ((await searchParams).media === "1") return <MediaFieldFixture />;
  return <LandingEditorFixture />;
}
