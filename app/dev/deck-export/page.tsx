import { notFound } from "next/navigation";
import DeckExportFixture from "./DeckExportFixture";

export default function DeckExportPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DeckExportFixture />;
}
