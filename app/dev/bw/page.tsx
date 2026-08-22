import { notFound } from "next/navigation";
import { BrainwavePage } from "../../../components/brainwave-page";
import { BRAINWAVE_PAGES } from "../../../lib/landing/brainwave/catalog";
import { DevEditor } from "./editor";
import { koTextsFor } from "../../../lib/landing/brainwave/ko";

/* 킷 26장을 그대로 확인하는 개발용 화면 — 운영에서는 404. /dev/bw?p=0-290 */
export default async function DevBrainwave({ searchParams }: { searchParams: Promise<{ p?: string; ko?: string; bare?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { p, ko, bare } = await searchParams;
  const id = BRAINWAVE_PAGES.some((x) => x.id === p) ? (p as string) : "0-290";
  const overrides = ko ? { texts: koTextsFor(id) } : undefined;
  /* bare=1: 썸네일 찍기용 — 메뉴·편집 단추 없이 페이지만 */
  if (bare) return <main style={{ width: 1600, background: "#fff" }}><BrainwavePage pageId={id} overrides={overrides} /></main>;
  return (
    <main style={{ background: "#e9ecf2", minHeight: "100vh" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", gap: 6, padding: 8, background: "#161c2d", flexWrap: "wrap" }}>
        {BRAINWAVE_PAGES.map((o) => (
          <a key={o.id} href={`?p=${o.id}`} style={{ padding: "5px 9px", borderRadius: 6, fontSize: 12, color: o.id === id ? "#161c2d" : "#fff", background: o.id === id ? "#fff" : "#ffffff22" }}>{o.name}</a>
        ))}
      </nav>
      <div style={{ maxWidth: 1600, margin: "0 auto" }}><BrainwavePage pageId={id} overrides={overrides} /></div>
      <DevEditor page={id} />
    </main>
  );
}
