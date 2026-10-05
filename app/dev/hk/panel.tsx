"use client";

import { useEffect, useState } from "react";
import { LandingVisualBuilder } from "../../../components/landing-visual-builder";
import { HomepageKitPanel } from "../../../components/homepage-kit-panel";
import { landingDraftFromPlan } from "../../../lib/landing/from-plan";
import type { LandingDraft } from "../../../lib/landing/domain";

const SAMPLE = landingDraftFromPlan({
  planTitle: "1인 꽃집 사업계획서",
  business: { name: "플로라 마포", description: "망원동 1인 꽃집", industry: "꽃집", region: "서울 마포구" },
  answers: {
    "market/products": { main_offer: "소규모 꽃다발과 월 정기구독" },
    "market/segments": { first_target: "망원동 20~30대 여성, 소규모 카페·공방" },
  },
  contactEmail: "hello@example.com",
});

export function DevKitPanel() {
  const [draft, setDraft] = useState<LandingDraft>(SAMPLE);
  /* ?fill=1 — AI 채우기 중 화면(로딩) 확인용 */
  const [filling, setFilling] = useState(false);
  /* ?editor=1 — 실제 편집기(LandingVisualBuilder)를 바로 연다(화면 확인용) */
  const [editor, setEditor] = useState(false);
  useEffect(() => { setEditor(new URLSearchParams(window.location.search).has("editor")); }, []);
  useEffect(() => { setFilling(new URLSearchParams(window.location.search).has("fill")); }, []);
  return (<>
    {editor && draft.pageData ? <LandingVisualBuilder data={draft.pageData} businessName={draft.businessName} onClose={() => setEditor(false)} onSave={async pageData => { setDraft({ ...draft, pageData }); setEditor(false); }} /> : null}
    <HomepageKitPanel
      draft={draft}
      site={null}
      projectId={null}
      publicPath=""
      action="idle"
      message=""
      onChange={setDraft}
      onSave={() => {}}
      onPublish={() => {}}
      onOpenEditor={() => setEditor(true)}
      onSiteUpdated={() => {}}
      aiFill={{ running: filling, run: () => {} }}
    />
  </>);
}
