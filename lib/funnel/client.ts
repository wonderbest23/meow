"use client";

import type { FunnelEventName } from "./domain";

/*
 * 화면에서 깔때기 이벤트를 보낸다.
 *
 * 실패해도 아무 일도 하지 않는다 — 측정 때문에 상담이 느려지거나 오류가
 * 보이면 본말이 뒤집힌 것이다. sendBeacon 을 먼저 쓰는 이유도 같다:
 * CTA 클릭은 페이지 이동 직전에 일어나는데, 일반 fetch 는 이동과 함께
 * 잘려 나가 클릭이 노출보다 적게 잡힌다.
 */
export function trackFunnel(
  event: FunnelEventName,
  meta?: Record<string, string | number | boolean>,
): void {
  try {
    if (typeof window === "undefined") return;
    const body = JSON.stringify({ event, meta: meta ?? {} });
    if (navigator.sendBeacon?.("/api/funnel", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 측정 실패는 조용히 넘어간다
  }
}
