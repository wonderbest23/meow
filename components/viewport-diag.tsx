"use client";

import { useEffect, useState } from "react";

/*
 * [임시] 기기가 스스로 재는 화면 진단.
 *
 * 아이폰에서만 검색창·상담 카드가 오른쪽으로 벗어나는데, 맥·인앱 브라우저에서는
 * 320~430 어느 폭에서도, 애니메이션 한 주기(16초) 전체에서도 재현되지 않는다.
 * 사용자가 "1초 뒤에 늘어난다"고 했으므로 시간에 따른 변화를 기록해야 한다.
 *
 * 20초 동안 히어로 안의 모든 요소를 훑어 '가장 많이 벗어난 순간'을 남긴다.
 * 캡처 한 장으로 무엇이 언제 얼마나 벗어나는지 알 수 있게.
 * 주소에 ?diag=1 이 있을 때만 뜬다. 원인을 잡으면 지운다.
 */

type Hit = { name: string; right: number; at: number; w: number };

export function ViewportDiag() {
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("diag")) return;

    const t0 = Date.now();
    const worst = new Map<string, Hit>();
    let maxScroll = 0;
    let stop = false;

    const name = (el: Element) => {
      const cls = (el.className || "").toString().split(" ").filter(Boolean)[0] ?? "";
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
    };

    /* 조상이 잘라 주면 화면에는 안 보인다 — 실제로 삐져나오는 것만 센다 */
    const isClipped = (el: Element) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "hidden" || ox === "clip" || ox === "auto" || ox === "scroll") return true;
        p = p.parentElement;
      }
      return false;
    };

    const scan = () => {
      const de = document.documentElement;
      const vw = de.clientWidth;
      maxScroll = Math.max(maxScroll, de.scrollWidth);
      const at = (Date.now() - t0) / 1000;
      for (const el of Array.from(document.querySelectorAll("main *"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= vw + 1) continue;
        if (isClipped(el)) continue;
        const k = name(el);
        const prev = worst.get(k);
        if (!prev || r.right > prev.right) worst.set(k, { name: k, right: Math.round(r.right), at, w: Math.round(r.width) });
      }
      render(vw);
    };

    const render = (vw: number) => {
      const de = document.documentElement;
      const vv = window.visualViewport;
      const top = [...worst.values()].sort((a, b) => b.right - a.right).slice(0, 5);
      setLines([
        `화면폭 ${vw} · 문서폭 ${de.scrollWidth} · 최대 ${maxScroll}${maxScroll > vw ? "  ← 넘침!" : "  (정상)"}`,
        `visualViewport ${vv ? `${Math.round(vv.width)} scale ${vv.scale.toFixed(2)}` : "없음"} · dpr ${devicePixelRatio}`,
        `글자보정 ${getComputedStyle(de).webkitTextSizeAdjust || "?"} · clip지원 ${CSS.supports("overflow", "clip") ? "예" : "아니오"}`,
        `경과 ${((Date.now() - t0) / 1000).toFixed(0)}초`,
        top.length ? "── 삐져나온 것 (이름 폭 →오른쪽끝 @몇초) ──" : "── 삐져나온 것 없음 ──",
        ...top.map((h) => `${h.name} ${h.w} →${h.right} @${h.at.toFixed(1)}s`),
      ]);
    };

    scan();
    const id = window.setInterval(() => { if (!stop) scan(); }, 400);
    /* 20초면 애니메이션 한 주기(16초)를 넘긴다 */
    const end = window.setTimeout(() => { stop = true; window.clearInterval(id); }, 20_000);
    document.fonts?.ready.then(scan).catch(() => {});
    return () => { stop = true; window.clearInterval(id); window.clearTimeout(end); };
  }, []);

  if (!lines) return null;
  return (
    <div
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2147483647,
        maxHeight: "50vh", overflow: "auto", padding: "10px 12px",
        background: "#0d0a2cf5", color: "#fff",
        font: "600 13px/1.55 ui-monospace, Menlo, monospace", wordBreak: "break-all",
      }}
    >
      {lines.map((l, i) => (
        <div key={i} style={{ color: l.includes("넘침") ? "#ff8a8a" : l.startsWith("──") ? "#93aafd" : "#fff" }}>{l}</div>
      ))}
    </div>
  );
}
