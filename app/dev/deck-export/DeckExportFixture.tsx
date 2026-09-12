"use client";

import { useEffect, useRef, useState } from "react";
import { useDeckExport } from "../../plan/document/use-deck-export";
import type { PublicDeckJob } from "../../../lib/plan-builder/deck-job-types";

function ExportControl() {
  const deck = useDeckExport("fixture-plan", true, "QA sample");
  return <section>
    <p role="status">{deck.message}</p>
    {deck.error && <p role="alert">{deck.error}</p>}
    <button disabled={deck.busy || !deck.canRequest} onClick={() => void deck.startOrDownload()}>{deck.label}</button>
    <button disabled={deck.busy || !deck.canRequest} onClick={() => { void deck.startOrDownload(); void deck.startOrDownload(); }}>중복 클릭 검증</button>
  </section>;
}

export default function DeckExportFixture() {
  const [mounted, setMounted] = useState(false);
  const [revision, setRevision] = useState(0);
  const [counts, setCounts] = useState({ reads: 0, posts: 0, downloads: 0 });
  const server = useRef<{ job: PublicDeckJob | null; generationEnabled: boolean; loseResponse: boolean }>({ job: null, generationEnabled: true, loseResponse: false });
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
      if (url.pathname !== "/api/plan/deck") return original(input, init);
      if (init?.method === "POST") {
        setCounts(value => ({ ...value, posts: value.posts + 1 }));
        server.current.job = { token: "fixture-job", runId: "fixture-run", fingerprint: "fixture", status: "running", phase: "reviewing", updatedAt: new Date().toISOString(), attempt: 1, ready: false, resumable: true };
        if (server.current.loseResponse) { server.current.loseResponse = false; throw new TypeError("Fixture response lost"); }
      } else if (url.searchParams.get("download") === "1") {
        setCounts(value => ({ ...value, downloads: value.downloads + 1 }));
        return original("/samples/sample_coffee.pptx");
      } else setCounts(value => ({ ...value, reads: value.reads + 1 }));
      return Response.json({ job: server.current.job, stale: false, generationEnabled: server.current.generationEnabled });
    };
    setMounted(true);
    return () => { window.fetch = original; };
  }, []);
  function reset(enabled: boolean, loseResponse = false) {
    server.current = { job: null, generationEnabled: enabled, loseResponse };
    setCounts({ reads: 0, posts: 0, downloads: 0 });
    setRevision(value => value + 1);
  }
  return <main style={{ maxWidth: 760, margin: "48px auto", padding: 24, color: "#222", background: "#fff", lineHeight: 1.7 }}>
    <h1 style={{ fontSize: 24 }}>PPT 상태 복구 검증</h1>
    <p>개발 전용 모의 서버. AI 호출·결제 없음. 내려받기는 공개 샘플 파일입니다.</p>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <button onClick={() => reset(true)}>정상 접수</button>
      <button onClick={() => reset(true, true)}>응답 유실</button>
      <button onClick={() => reset(false)}>제공 준비 중</button>
      <button onClick={() => setRevision(value => value + 1)}>문서 다시 열기</button>
      <button onClick={() => { if (server.current.job) server.current.job = { ...server.current.job, status: "complete", phase: "ready", ready: true }; setRevision(value => value + 1); }}>서버 완료</button>
    </div>
    <p>상태 조회 {counts.reads} · 생성 요청 {counts.posts} · 다운로드 {counts.downloads}</p>
    {mounted && <ExportControl key={revision} />}
  </main>;
}
