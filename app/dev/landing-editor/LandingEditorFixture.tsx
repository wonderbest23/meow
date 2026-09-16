"use client";

import { useState } from "react";
import { BrainwaveEditor } from "../../../components/brainwave-editor";
import { createBusinessTemplate } from "../../../lib/landing/brainwave/business-content";
import type { LandingPageData } from "../../../lib/landing/page-data";

const businessContent = { businessName: "수정 보존 검증", offer: "기업 소개 자료 제작", description: "기획과 촬영을 함께 진행합니다", customer: "중소기업", price: "180만원", cta: "문의하기", image: "/brainwave/0-2385/imgBrowser2.jpg" };
const initial: LandingPageData = { root: {}, content: [], businessContent, brainwave: createBusinessTemplate(businessContent, "0-290") };

export default function LandingEditorFixture() {
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState<LandingPageData | null>(null);
  return <main>
    <h1>편집기 로컬 검증</h1>
    <button type="button" onClick={() => setOpen(true)}>편집기 다시 열기</button>
    <output data-testid="saved-editor-data" hidden>{JSON.stringify(saved)}</output>
    {open ? <BrainwaveEditor data={data} projectId="qa-editor-only" business={{ name: businessContent.businessName, summary: businessContent.description }} onClose={() => setOpen(false)} onSave={async next => {
      if (new URLSearchParams(window.location.search).get("fail") === "1") throw new Error("검증용 저장 실패: 수정 내용은 유지했어요");
      setData(next); setSaved(next);
    }} /> : null}
  </main>;
}
