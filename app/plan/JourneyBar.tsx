"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { loadState, isSamplePlan, type Plan } from "../../lib/plan-builder/plan-store";
import { journeySteps, type HomepageStatus, type JourneyStepId } from "../../lib/plan-builder/journey";
import styles from "./JourneyBar.module.css";

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

/**
 * 대화 → 사업계획서 → 홈페이지 → 유지보수.
 * 어느 화면에서든 지금 몇 단계인지 보여 주고, 갈 수 있는 단계는 눌러서 옮겨 간다.
 */
export default function JourneyBar({ planId, current, plan: given, homepage: knownHomepage, runStatus, version }: {
  planId: string | null | undefined; current?: JourneyStepId | null; plan?: Plan | null; homepage?: HomepageStatus; runStatus?: string | null;
  /** 바뀌면 저장된 사업을 다시 읽는다(예: 계획서가 다 만들어졌을 때) */
  version?: string | number | null;
}) {
  const [stored, setStored] = useState<Plan | null>(null);
  useEffect(() => {
    if (given || !planId) return;
    setStored(loadState().plans.find(item => item.id === planId) ?? null);
  }, [given, planId, version]);
  const fetched = useHomepageStatus(knownHomepage === undefined ? planId : null);
  /* 대화를 막 시작해 아직 저장된 사업이 없으면 빈 사업으로 1단계만 보여 준다 */
  const plan = given ?? stored ?? { id: planId ?? "", title: "", planType: "", createdAt: "", updatedAt: "", answers: {}, sections: {} };
  if (isSamplePlan(plan.id)) return null;
  const steps = journeySteps(plan, knownHomepage === undefined ? fetched : knownHomepage, runStatus);
  return <nav className={styles.bar} aria-label="사업 진행 단계">
    <ol>
      {steps.map((step, index) => {
        const here = step.id === current;
        const reachable = step.state !== "todo" || index === 0 || steps[index - 1].state === "done";
        const body = <>
          <i aria-hidden="true">{step.state === "done" && !here ? <Check size={13} strokeWidth={3} /> : index + 1}</i>
          <span>{step.label}</span>
        </>;
        return <li key={step.id} data-state={step.state} data-here={here || undefined}>
          {here ? <span className={styles.step} aria-current="step">{body}</span>
            : reachable ? <Link className={styles.step} href={step.href}>{body}</Link>
            : <span className={styles.step} aria-disabled="true">{body}</span>}
        </li>;
      })}
    </ol>
  </nav>;
}
