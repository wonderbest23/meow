import { notFound } from "next/navigation";
import BusinessJourneyFixture from "./BusinessJourneyFixture";

export default function BusinessJourneyLab() {
  if (process.env.NODE_ENV !== "development" || process.env.PERSISTENCE_MODE !== "demo-memory" || process.env.BUSINESS_JOURNEY_LAB !== "true" || process.env.SUPABASE_URL) notFound();
  return <BusinessJourneyFixture />;
}
