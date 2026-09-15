import { notFound } from "next/navigation";
import HomepageEditorFixture from "./HomepageEditorFixture";

export default function HomepageEditorLab() {
  if (process.env.NODE_ENV !== "development" || process.env.PERSISTENCE_MODE !== "demo-memory" || process.env.HOMEPAGE_EDITOR_LAB !== "true" || process.env.SUPABASE_URL) notFound();
  return <HomepageEditorFixture />;
}
