"use client";

import { useCallback, useEffect, useState } from "react";
import type { LandingLeadRecord } from "../../../lib/landing/domain";

/*
 * 내 문의 — 모든 사업의 홈페이지 문의를 한곳에 모은다(소유자 요청 2026-10-07: 홈페이지 화면 5번 칸 대신
 * 왼쪽 메뉴 '내 문의'에서 메신저처럼 보기). 서버의 /api/plan/inquiries 한 번으로 이 주인의 모든 사업 문의를 읽는다
 * (이 기기에 저장된 사업만 보던 예전 방식은 다른 기기에서 만든 사업의 문의를 빠뜨렸다).
 */
export type Inquiry = { lead: LandingLeadRecord; planId: string; planTitle: string; projectId: string; businessName: string };
type Loaded = { items: Inquiry[]; at: number };

let cache: Loaded | null = null;
let pending: Promise<Loaded> | null = null;
/*
 * 처리 완료를 바꾼 기록 — 그보다 먼저 출발한 목록 요청이 늦게 도착해도 바꾼 값을 덮어쓰지 않게 얹어 둔다.
 * (예전엔 처리 완료를 누른 직후 늦게 온 옛 목록이 '답할 문의'로 되돌렸다)
 */
const overrides = new Map<string, { handledAt: string | null; at: number }>();
/** 목록이 바뀌면(새로 불러옴·처리 완료) 이 이름으로 알린다 — 왼쪽 메뉴 숫자와 목록 화면이 같이 바뀐다 */
export const INQUIRIES_EVENT = "oneulstart:inquiries-changed";
const FRESH_MS = 180_000;
const LOAD_ERROR = "문의를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.";

function applyOverrides(items: Inquiry[], startedAt: number): Inquiry[] {
  // 목록 요청이 출발한 뒤에 바꾼 것만 얹는다 — 그 전에 바꾼 것은 서버 목록에 이미 들어 있다
  for (const [leadId, change] of overrides) if (change.at < startedAt - 60_000) overrides.delete(leadId);
  return items.map(item => {
    const change = overrides.get(item.lead.id);
    return change && change.at >= startedAt ? { ...item, lead: { ...item.lead, handledAt: change.handledAt } } : item;
  });
}

async function fetchAll(): Promise<Loaded> {
  const startedAt = Date.now();
  const response = await fetch("/api/plan/inquiries", { cache: "no-store" });
  const data = await response.json().catch(() => null) as { items?: Inquiry[] } | null;
  // 실패를 '문의 없음'으로 바꾸지 않는다 — 예전엔 연결이 끊기면 '아직 들어온 문의가 없어요'가 3분 동안 남았다
  if (!response.ok || !Array.isArray(data?.items)) throw new Error("INQUIRIES_LOAD_FAILED");
  return { items: applyOverrides(data.items, startedAt), at: Date.now() };
}

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(INQUIRIES_EVENT));
}

export function loadInquiries(force = false): Promise<Loaded> {
  if (!force && cache && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache);
  if (!pending) pending = fetchAll().then(value => { cache = value; announce(); return value; }).finally(() => { pending = null; });
  return pending;
}

/** 처리 완료를 바꾼 뒤 — 기억한 목록을 고치고 메뉴 숫자에 알린다 */
export function markInquiryHandled(leadId: string, handledAt: string | null) {
  overrides.set(leadId, { handledAt, at: Date.now() });
  if (cache) cache = { ...cache, items: cache.items.map(item => item.lead.id === leadId ? { ...item, lead: { ...item.lead, handledAt } } : item) };
  announce();
}

export function unansweredCount(items: Inquiry[] | LandingLeadRecord[]): number {
  return items.filter(item => ("lead" in item ? item.lead : item).handledAt === null).length;
}

/** enabled=false 면 부르지 않는다(로그인 전 왼쪽 메뉴) */
export function useInquiries(enabled = true) {
  // 첫 화면은 서버와 같게 비워 두고, 올라온 뒤에 기억한 목록을 채운다(서버 화면과 어긋나지 않게)
  const [state, setState] = useState<{ items: Inquiry[] | null; error: string }>({ items: null, error: "" });
  const refresh = useCallback((force = false) => {
    if (!enabled) return;
    loadInquiries(force)
      .then(value => setState({ items: value.items, error: "" }))
      .catch(() => setState(current => ({ items: current.items, error: LOAD_ERROR })));
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    if (cache) setState({ items: cache.items, error: "" });
    refresh();
    const changed = () => { if (cache) setState({ items: cache.items, error: "" }); };
    window.addEventListener(INQUIRIES_EVENT, changed);
    return () => window.removeEventListener(INQUIRIES_EVENT, changed);
  }, [enabled, refresh]);
  return { ...state, refresh };
}
