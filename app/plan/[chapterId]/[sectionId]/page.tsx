"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SectionWizard from "../../SectionWizard";
import { type PlanSectionStatus } from "../../../../lib/plan-builder/blueprint";
import { loadPlan, planStatuses } from "../../../../lib/plan-builder/plan-store";

// Phase 2~4: 섹션 질문 위저드 라우트 /plan/[chapterId]/[sectionId]
export default function SectionPage() {
  const params = useParams<{ chapterId: string; sectionId: string }>();
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, PlanSectionStatus>>({});
  const [planTitle, setPlanTitle] = useState("새 플랜");
  const [planType, setPlanType] = useState("창업 초기 · 사업계획서");

  useEffect(() => {
    const s = loadPlan();
    setStatuses(planStatuses(s));
    if (s.title) setPlanTitle(s.title);
    if (s.planType) setPlanType(s.planType);
  }, []);

  return (
    <SectionWizard
      chapterId={params.chapterId}
      sectionId={params.sectionId}
      statuses={statuses}
      planTitle={planTitle}
      planType={planType}
      onBack={() => router.push("/plan")}
      onNavigateSection={(chapterId, sectionId) => router.push(`/plan/${chapterId}/${sectionId}`)}
      onComplete={() => {
        // 생성 완료(스토어 저장은 위저드가 처리). 개요로 돌아가면 반영됨.
      }}
    />
  );
}
