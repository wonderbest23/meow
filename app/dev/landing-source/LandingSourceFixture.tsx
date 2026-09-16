"use client";
import { useState } from "react";
import { HomepageSourceUpdate } from "../../../components/homepage-source-update";
import { BrainwavePage } from "../../../components/brainwave-page";
import type { LandingSiteRecord } from "../../../lib/landing/domain";
import type { BrainwaveData } from "../../../lib/landing/page-data";
import type { ArtifactPreview } from "../../../lib/plan-builder/artifact-updates";

export default function LandingSourceFixture({ site: initial, preview, media, contrast }: { site: LandingSiteRecord; preview: ArtifactPreview; media: BrainwaveData; contrast: boolean }) {
  const [site, setSite] = useState(initial);
  const [draft, setDraft] = useState(initial.draft);
  if (contrast) return <main><BrainwavePage pageId={media.page} overrides={media} /></main>;
  return <main style={{ padding: 24 }}>
    <h1>사업정보 비교 검증</h1>
    <HomepageSourceUpdate projectId={site.projectId} draft={draft} site={site} disabled={false} onApplied={next => { setSite(next); setDraft(next.draft); }} />
    <button type="button" onClick={() => setDraft(value => ({ ...value, businessName: "저장하지 않은 수정" }))}>로컬 미저장 수정</button>
    <button type="button" data-testid="switch-project" onClick={() => {
      setSite(current => current.projectId === initial.projectId ? { ...initial, projectId: "qa-project-other" } : initial);
      setDraft(initial.draft);
    }}>프로젝트 전환</button>
    <output data-testid="fixture-preview" hidden>{JSON.stringify(preview)}</output>
    <output data-testid="fixture-site" hidden>{JSON.stringify(site)}</output>
  </main>;
}
