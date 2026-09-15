"use client";

import Link from "next/link";
import { useState } from "react";
import { prepareAccountFixture } from "./actions";

export default function AccountSyncFixture() {
  const [planId, setPlanId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function prepare() {
    if (busy || planId) return;
    setBusy(true);
    try {
      const id = await prepareAccountFixture();
      setPlanId(id);
      setStatus("서버 저장 완료");
    } catch (error) { setStatus(error instanceof Error ? error.message : "테스트 준비 실패"); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 720, margin: "48px auto", padding: 24, color: "#222", background: "#fff" }}>
    <h1>로컬 계정 연결 검증</h1>
    <button disabled={busy || !!planId} onClick={() => void prepare()}>고정 테스트 사업 준비</button>
    <p role="status">{status}</p>
    {planId && <>
      <output aria-label="테스트 사업 ID">{planId}</output>
      <nav style={{ display: "flex", gap: 24, marginTop: 24 }}>
        <Link href={`/plan/chat?planId=${planId}`}>테스트 대화</Link>
        <Link href={`/plan/document?planId=${planId}`}>테스트 문서</Link>
        <Link href="/account">계정</Link>
      </nav>
    </>}
  </main>;
}
