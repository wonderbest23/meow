import { notFound } from "next/navigation";
import { HomeWorkspaceDemo } from "../../../components/home-workspace-demo";

export default async function WorkspaceDemoPreview({ searchParams }: { searchParams: Promise<{ progress?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { progress } = await searchParams;
  const value = progress === undefined ? undefined : Number(progress);
  return <main style={{ margin: "24px auto", width: "min(100%, 480px)" }}><HomeWorkspaceDemo previewProgress={value !== undefined && Number.isFinite(value) ? value : undefined} /></main>;
}
