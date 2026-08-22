"use client";
import { useState } from "react";
import { BrainwaveEditor } from "../../../components/brainwave-editor";
import type { LandingPageData } from "../../../lib/landing/page-data";

export function DevEditor({ page }: { page: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<LandingPageData | null>(null);
  const data: LandingPageData = saved ?? { brainwave: { page, texts: {}, images: {} }, root: { props: {} }, content: [] };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ position: "fixed", right: 16, bottom: 90, zIndex: 60, padding: "10px 14px", borderRadius: 8, background: "#473bf0", color: "#fff", fontWeight: 700 }}>편집기 열기</button>
      {saved ? <pre id="dev-saved" style={{ position: "fixed", left: 8, bottom: 8, zIndex: 60, maxWidth: 480, maxHeight: 160, overflow: "auto", fontSize: 11, background: "#fff" }}>{JSON.stringify(saved.brainwave)}</pre> : null}
      {open ? <BrainwaveEditor data={data} onClose={() => setOpen(false)} onSave={(d) => { setSaved(d); setOpen(false); }} projectId={new URLSearchParams(location.search).get("pid")} business={{ name: "한빛싱크", summary: "성수동 싱크 배관 출장" }} /> : null}
    </>
  );
}
