"use client";

import { useEffect, useState } from "react";
import { isSamplePlan } from "../../lib/plan-builder/plan-store";
import type { HomepageStatus } from "../../lib/plan-builder/journey";

/** 이 사업에 만든 홈페이지가 있는지, 공개했는지 — 만들지는 않고 확인만 한다 */
export function useHomepage(planId: string | null | undefined): { status: HomepageStatus; publicPath: string | null } {
  const [value, setValue] = useState<{ status: HomepageStatus; publicPath: string | null }>({ status: null, publicPath: null });
  useEffect(() => {
    setValue({ status: null, publicPath: null });
    if (!planId || isSamplePlan(planId)) return;
    const controller = new AbortController();
    fetch(`/api/plan/landing?planId=${encodeURIComponent(planId)}`, { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((data: { site?: { status?: string; slug?: string; publishedSlug?: string | null } | null } | null) => {
        if (!data) return;
        const site = data.site;
        const published = site?.status === "published";
        setValue({ status: published ? "published" : site ? "draft" : "none", publicPath: published && site ? `/launch/${site.publishedSlug ?? site.slug}` : null });
      })
      .catch(() => { /* 확인하지 못하면 홈페이지 단계를 '아직'으로 둔다 */ });
    return () => controller.abort();
  }, [planId]);
  return value;
}
export function useHomepageStatus(planId: string | null | undefined): HomepageStatus { return useHomepage(planId).status; }
