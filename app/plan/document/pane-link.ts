"use client";

import type { MouseEvent } from "react";
import { studioTarget } from "../../../lib/plan-builder/studio";
import type { StudioNav } from "../studio/StudioContext";

/*
 * 작업실 칸 안의 링크 — 같은 사업의 다른 단계 주소(/plan/chat · document · homepage · workspace)면
 * 실제 이동 대신 작업실 탭 바꾸기(nav.push)로 보낸다. 작업실 루트가 먼저 처리했으면(defaultPrevented) 그대로 둔다.
 * 작업실 밖(nav 가 null)에서는 아무것도 하지 않는다 — 예전 화면은 링크 그대로.
 */
export function paneLinkCapture(nav: StudioNav | null, planId: string | null | undefined) {
  if (!nav || !planId) return undefined;
  return (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    if (!studioTarget(anchor.href, planId, window.location.origin)) return;
    event.preventDefault();
    nav.push(`${anchor.pathname}${anchor.search}${anchor.hash}`);
  };
}
