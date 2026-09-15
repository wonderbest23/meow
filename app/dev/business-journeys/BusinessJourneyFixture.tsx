"use client";

import { useState } from "react";
import Link from "next/link";
import { hydrateFromServer } from "../../../lib/plan-builder/plan-store";

export default function BusinessJourneyFixture() {
  const [href, setHref] = useState("");
  const [status, setStatus] = useState("");
  return <main style={{ padding: 24, background: "white", color: "#18212c", minHeight: "100vh" }}>
    <h1>운영 개선 로컬 검증</h1>
    <button onClick={async () => {
      try {
        const response = await fetch("/api/dev/business-journeys", { method: "POST" });
        if (!response.ok) throw new Error("격리 환경에서만 열 수 있어요");
        const result = await response.json();
        await hydrateFromServer(false);
        setHref(result.href); setStatus("검증용 사업을 준비했어요");
      } catch (error) { setStatus(error instanceof Error ? error.message : "준비 실패"); }
    }}>검증용 사업 준비</button>
    <p role="status">{status}</p>
    {href && <Link href={href}>실제 사업 관리 열기</Link>}
  </main>;
}
