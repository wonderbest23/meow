"use client";

import { useCallback, useEffect, useState } from "react";
import { isSamplePlan, loadState, type Plan } from "../../../lib/plan-builder/plan-store";
import type { LandingLeadRecord } from "../../../lib/landing/domain";

/*
 * 내 문의 — 모든 사업의 홈페이지 문의를 한곳에 모은다(소유자 요청 2026-10-07: 홈페이지 화면 5번 칸 대신
 * 왼쪽 메뉴 '내 문의'에서 메신저처럼 보기). 사업마다 홈페이지(프로젝트)를 찾아 그 문의를 읽기만 한다.
 */
export type Inquiry = { lead: LandingLeadRecord; planId: string; planTitle: string; projectId: string; businessName: string };
type Loaded = { items: Inquiry[]; at: number };

let cache: Loaded | null = null;
let pending: Promise<Loaded> | null = null;
/** 문의를 처리 완료로 바꾸는 등 목록이 바뀌면 이 이름으로 알린다 — 왼쪽 메뉴의 숫자가 따라 바뀐다 */
export const INQUIRIES_EVENT = "oneulstart:inquiries-changed";
const FRESH_MS = 180_000;

async function fetchAll(): Promise<Loaded> {
  // 사업 목록은 이 기기 저장본, 없으면 서버 목록을 읽기만 한다(왼쪽 목록과 같은 이유로 hydrateFromServer 는 쓰지 않는다)
  let plans: Plan[] = loadState().plans;
  if (!plans.length) plans = await fetch("/api/plan/state", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then((data: { plans?: Plan[] } | null) => data?.plans ?? []).catch(() => []);
  plans = plans.filter(plan => !isSamplePlan(plan.id));
  const results = await Promise.all(plans.map(async plan => {
    try {
      const landing = await fetch(`/api/plan/landing?planId=${encodeURIComponent(plan.id)}`, { cache: "no-store" }).then(response => response.ok ? response.json() : null) as { projectId?: string | null; site?: { draft?: { businessName?: string } } | null } | null;
      if (!landing?.projectId) return [];
      const data = await fetch(`/api/projects/${landing.projectId}/landing`, { cache: "no-store" }).then(response => response.ok ? response.json() : null) as { leads?: LandingLeadRecord[] } | null;
      const businessName = landing.site?.draft?.businessName || plan.title || "내 사업";
      return (data?.leads ?? []).map(lead => ({ lead, planId: plan.id, planTitle: plan.title || businessName, projectId: landing.projectId!, businessName }));
    } catch { return []; }
  }));
  const items = results.flat().sort((a, b) => b.lead.createdAt.localeCompare(a.lead.createdAt));
  return { items, at: Date.now() };
}

export function loadInquiries(force = false): Promise<Loaded> {
  if (!force && cache && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache);
  if (!pending) pending = fetchAll().then(value => { cache = value; return value; }).finally(() => { pending = null; });
  return pending;
}

/** 처리 완료를 바꾼 뒤 — 기억한 목록을 고치고 메뉴 숫자에 알린다 */
export function markInquiryHandled(leadId: string, handledAt: string | null) {
  if (cache) cache = { ...cache, items: cache.items.map(item => item.lead.id === leadId ? { ...item, lead: { ...item.lead, handledAt } } : item) };
  window.dispatchEvent(new Event(INQUIRIES_EVENT));
}

export function unansweredCount(items: Inquiry[]): number {
  return items.filter(item => item.lead.handledAt === null).length;
}

export function useInquiries() {
  const [state, setState] = useState<{ items: Inquiry[] | null; error: string }>({ items: cache?.items ?? null, error: "" });
  const refresh = useCallback((force = false) => {
    loadInquiries(force)
      .then(value => setState({ items: value.items, error: "" }))
      .catch(() => setState(current => ({ items: current.items, error: "문의를 불러오지 못했어요. 잠시 후 다시 확인해 주세요." })));
  }, []);
  useEffect(() => {
    refresh();
    const changed = () => setState(current => ({ items: cache?.items ?? current.items, error: "" }));
    window.addEventListener(INQUIRIES_EVENT, changed);
    return () => window.removeEventListener(INQUIRIES_EVENT, changed);
  }, [refresh]);
  return { ...state, refresh };
}
