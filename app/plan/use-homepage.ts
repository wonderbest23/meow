"use client";

import { useEffect, useState } from "react";
import { isSamplePlan } from "../../lib/plan-builder/plan-store";
import type { HomepageStatus } from "../../lib/plan-builder/journey";

type HomepageValue = { status: HomepageStatus; publicPath: string | null };

/*
 * 마지막으로 확인한 공개 상태를 기억한다 — 예전엔 화면을 옮길 때마다 '모름'에서 다시 시작해
 * 왼쪽 목록의 '유지보수'가 잠겼다가 풀리고, 체크가 깜빡였다(소유자 지적 2026-10-07).
 * 탭을 닫으면 사라지는 기억(sessionStorage)이고, 서버 확인이 끝나면 늘 서버 값으로 바꾼다.
 */
const memory = new Map<string, HomepageValue>();
const STORE_KEY = "oneulstart:homepage-status";
/** 홈페이지를 공개·공개 중지하면 이 이름의 이벤트로 알린다 — 왼쪽 목록이 새로 고침 없이 바로 바뀐다 */
export const HOMEPAGE_STATUS_EVENT = "oneulstart:homepage-status-changed";

function remembered(planId: string): HomepageValue | null {
  const hit = memory.get(planId);
  if (hit) return hit;
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "{}") as Record<string, HomepageValue>;
    if (saved[planId]) { memory.set(planId, saved[planId]); return saved[planId]; }
  } catch { /* 기억이 없으면 서버 확인을 기다린다 */ }
  return null;
}

function remember(planId: string, value: HomepageValue) {
  memory.set(planId, value);
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "{}") as Record<string, HomepageValue>;
    saved[planId] = value;
    sessionStorage.setItem(STORE_KEY, JSON.stringify(saved));
  } catch { /* 이번 화면에서만 기억한다 */ }
}

/** 공개 상태가 바뀌었다고 알린다(홈페이지 화면이 공개·공개 중지 뒤에 부른다) */
export function announceHomepageStatus(planId: string, value: HomepageValue) {
  announced.set(planId, Date.now());
  remember(planId, value);
  window.dispatchEvent(new CustomEvent(HOMEPAGE_STATUS_EVENT, { detail: { planId, value } }));
}

/*
 * 같은 사업을 여러 곳(왼쪽 목록·사업 관리·홈페이지 화면)이 동시에 물으면 요청 하나를 나눠 쓴다 —
 * 예전엔 화면 하나를 열 때 같은 확인 요청이 서너 번 나갔다. 공개·공개 중지를 알린 뒤에 도착한
 * 그 전 요청의 답은 버린다(방금 공개했는데 '초안'으로 되돌아가지 않게).
 */
const announced = new Map<string, number>();
const inflight = new Map<string, Promise<HomepageValue | null>>();
function checkHomepage(planId: string): Promise<HomepageValue | null> {
  const pending = inflight.get(planId);
  if (pending) return pending;
  const startedAt = Date.now();
  const request = fetch(`/api/plan/landing?planId=${encodeURIComponent(planId)}`, { cache: "no-store" })
    .then(response => response.ok ? response.json() : null)
    .then((data: { site?: { status?: string; slug?: string; publishedSlug?: string | null } | null } | null) => {
      if (!data || (announced.get(planId) ?? 0) >= startedAt) return null;
      const site = data.site;
      const published = site?.status === "published";
      const next: HomepageValue = { status: published ? "published" : site ? "draft" : "none", publicPath: published && site ? `/launch/${site.publishedSlug ?? site.slug}` : null };
      remember(planId, next);
      return next;
    })
    .catch(() => null)
    .finally(() => { inflight.delete(planId); });
  inflight.set(planId, request);
  return request;
}

/** 이 사업에 만든 홈페이지가 있는지, 공개했는지 — 만들지는 않고 확인만 한다 */
export function useHomepage(planId: string | null | undefined): HomepageValue {
  const [value, setValue] = useState<HomepageValue>(() => (planId && typeof window !== "undefined" && remembered(planId)) || { status: null, publicPath: null });
  useEffect(() => {
    setValue((planId && remembered(planId)) || { status: null, publicPath: null });
    if (!planId || isSamplePlan(planId)) return;
    let alive = true;
    // 확인하지 못하면 기억해 둔 값(없으면 '아직')을 그대로 둔다
    void checkHomepage(planId).then(next => { if (alive && next) setValue(next); });
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ planId: string; value: HomepageValue }>).detail;
      if (detail?.planId === planId) setValue(detail.value);
    };
    window.addEventListener(HOMEPAGE_STATUS_EVENT, changed);
    return () => { alive = false; window.removeEventListener(HOMEPAGE_STATUS_EVENT, changed); };
  }, [planId]);
  return value;
}
export function useHomepageStatus(planId: string | null | undefined): HomepageStatus { return useHomepage(planId).status; }
