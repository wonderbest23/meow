"use client";

import { useEffect, useState } from "react";
import { LandingVisualBuilder } from "../../../components/landing-visual-builder";
import { persistLandingDraft } from "../../../lib/landing/save-client";
import type { LandingDraft, LandingSiteRecord } from "../../../lib/landing/domain";
import { HomepageKitPanel } from "../../../components/homepage-kit-panel";

export default function HomepageEditorFixture() {
  const [site, setSite] = useState<LandingSiteRecord | null>(null);
  const [draft, setDraft] = useState<LandingDraft | null>(null);
  const [open, setOpen] = useState(false);
  const [fail, setFail] = useState(false);
  const [status, setStatus] = useState("준비 중");
  useEffect(() => {
    void fetch("/api/dev/homepage-editor", { method: "POST" }).then(async response => {
      if (!response.ok) throw new Error("격리 환경에서만 실행할 수 있습니다");
      const saved = (await response.json()).site;
      setSite(saved); setDraft(saved.draft); setStatus("불러옴");
    }).catch(error => setStatus(error.message));
  }, []);
  const save = async (next: LandingDraft) => {
    if (!site) return;
    await new Promise(resolve => setTimeout(resolve, 600));
    if (fail) { setFail(false); throw new Error("검증용 저장 실패입니다. 수정 내용은 유지했어요. 다시 저장해주세요."); }
    const saved = await persistLandingDraft(site.projectId, next, site.updatedAt);
    setSite(saved); setDraft(saved.draft); setStatus("서버 저장 완료");
  };
  return <main style={{ padding: 32, color: "#18212c", background: "white", minHeight: "100vh" }}>
    <h1>홈페이지 저장 로컬 검증</h1>
    <p role="status">{status}</p>
    <label><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)} /> 다음 저장 실패</label>
    <button disabled={!site} onClick={() => setOpen(true)}>실제 에디터 열기</button>
    {site && draft ? <HomepageKitPanel draft={draft} site={site} projectId={site.projectId} publicPath="" action="idle" message={status} onChange={setDraft} onSave={() => void save(draft).catch(error => setStatus(error.message))} onPublish={() => setStatus("격리 검증에서는 공개하지 않습니다")} onOpenEditor={() => setOpen(true)} onSiteUpdated={setSite} /> : null}
    <details><summary>서버 저장 결과</summary><pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }} aria-label="서버 저장 결과">{site ? JSON.stringify({ projectId: site.projectId, updatedAt: site.updatedAt, texts: site.draft.pageData?.brainwave?.texts }, null, 2) : ""}</pre></details>
    {open && site && draft && <LandingVisualBuilder data={draft.pageData!} businessName={draft.businessName} onClose={() => setOpen(false)} onSave={async pageData => {
      await save({ ...draft, pageData }); setOpen(false);
    }} />}
  </main>;
}
