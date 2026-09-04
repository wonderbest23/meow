"use client";

import { useState } from "react";
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
  return (
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
      onOpenEditor={() => {}}
      onSiteUpdated={() => {}}
    />
  );
}
