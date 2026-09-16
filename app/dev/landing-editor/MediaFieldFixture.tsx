"use client";

import { useState } from "react";
import { LandingMediaField } from "../../../components/landing-media-field";

export default function MediaFieldFixture() {
  const [draft, setDraft] = useState({ name: "업로드 전 이름", image: "/brainwave/0-2385/imgBrowser2.jpg" });
  const [template, setTemplate] = useState("first");
  return <main style={{ padding: 24 }}>
    <h1>이미지 필드 로컬 검증</h1>
    <label>사업 이름<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <button type="button" onClick={() => setTemplate(value => value === "first" ? "second" : "first")}>템플릿 전환</button>
    <LandingMediaField key={template} label="대표 이미지" description="검증용 이미지" value={draft.image} kind="hero" onChange={image => setDraft({ ...draft, image })} />
    <output data-testid="media-field-data">{JSON.stringify(draft)}</output>
  </main>;
}
