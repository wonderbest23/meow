import { notFound } from "next/navigation";
import MarketEvidencePanel from "../../plan/MarketEvidencePanel";

/* 공식 시장자료 패널만 따로 보는 개발용 화면 — 운영에서는 404. /dev/mr?planId=… */
export default async function DevMarketResearch({ searchParams }: { searchParams: Promise<{ planId?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { planId } = await searchParams;
  return <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}><MarketEvidencePanel planId={planId ?? null} /></main>;
}
