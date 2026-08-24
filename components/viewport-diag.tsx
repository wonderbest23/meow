"use client";

import { useEffect, useState } from "react";

/*
 * [임시] 기기에서 직접 재는 화면 진단.
 *
 * 아이폰 사파리에서만 가로가 넘치는데 맥·인앱 브라우저 어느 폭에서도 재현되지 않았다.
 * 원인을 추측으로 고치지 않으려고, 그 기기가 스스로 수치를 말하게 한다.
 * 주소에 ?diag=1 이 있을 때만 뜬다. 원인을 잡으면 이 파일은 지운다.
 */

type Row = { label: string; value: string };

export function ViewportDiag() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("diag")) return;

    const measure = () => {
      const de = document.documentElement;
      const vv = window.visualViewport;

      /* 뷰포트를 넘어가는 요소 — 조상이 잘라 주는지와 무관하게 전부 */
      const over: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("main *"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right <= de.clientWidth + 1) continue;
        const cls = (el.className || "").toString().split(" ").filter(Boolean).slice(0, 2).join(".");
        over.push(`${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} w=${Math.round(r.width)} →${Math.round(r.right)}`);
        if (over.length >= 6) break;
      }

      const cs = getComputedStyle(de);
      setRows([
        { label: "clientWidth", value: String(de.clientWidth) },
        { label: "scrollWidth", value: String(de.scrollWidth) },
        { label: "innerWidth", value: String(window.innerWidth) },
        { label: "visualViewport", value: vv ? `${Math.round(vv.width)} (scale ${vv.scale.toFixed(2)})` : "없음" },
        { label: "screen", value: `${screen.width}×${screen.height} dpr ${devicePixelRatio}` },
        { label: "text-size-adjust", value: cs.webkitTextSizeAdjust || (cs as unknown as Record<string, string>).textSizeAdjust || "미지원" },
        { label: "overflow:clip 지원", value: CSS.supports("overflow", "clip") ? "예" : "아니오" },
        { label: "svh 지원", value: CSS.supports("height", "100svh") ? "예" : "아니오" },
        { label: "넘치는 요소", value: over.length ? over.join(" | ") : "없음" },
      ]);
    };

    measure();
    window.addEventListener("resize", measure);
    /* 글꼴이 늦게 오면 폭이 달라진다 — 다 온 뒤 한 번 더 */
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener("resize", measure);
  }, []);

  if (!rows) return null;
  return (
    <div
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 99999,
        maxHeight: "45vh", overflow: "auto",
        padding: "10px 12px", background: "#0d0a2cf2", color: "#fff",
        font: "12px/1.5 ui-monospace, Menlo, monospace", wordBreak: "break-all",
      }}
    >
      {rows.map((r) => (
        <div key={r.label}>
          <b style={{ color: "#93aafd" }}>{r.label}</b>: {r.value}
        </div>
      ))}
    </div>
  );
}
