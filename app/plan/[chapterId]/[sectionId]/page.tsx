"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SectionWizard from "../../SectionWizard";
import { type PlanSectionStatus } from "../../../../lib/plan-builder/blueprint";
import { planStatuses, hydrateFromServer, activePlan } from "../../../../lib/plan-builder/plan-store";

// 섹션 질문 위저드 라우트 /plan/[chapterId]/[sectionId]
export default function SectionPage() {
  const params = useParams<{ chapterId: string; sectionId: string }>();
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, PlanSectionStatus>>({});
  const [planTitle, setPlanTitle] = useState("새 플랜");
  const [planType, setPlanType] = useState("창업 초기 · 사업계획서");

  useEffect(() => {
    let alive = true;
    hydrateFromServer().then((s) => {
      if (!alive) return;
      setStatuses(planStatuses(s));
      const p = activePlan(s);
      if (p) {
        setPlanTitle(p.title);
        setPlanType(p.planType);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <SectionWizard
      chapterId={params.chapterId}
      sectionId={params.sectionId}
      statuses={statuses}
      planTitle={planTitle}
      planType={planType}
      onBack={() => router.push("/plan/overview")}
      onNavigateSection={(chapterId, sectionId) => router.push(`/plan/${chapterId}/${sectionId}`)}
      onOpenDocument={() => router.push("/plan/document")}
      onComplete={() => {
        // 생성 완료(스토어 저장은 위저드가 처리). 개요로 돌아가면 반영됨.
      }}
    />
  );
}
