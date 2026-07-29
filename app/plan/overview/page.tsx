"use client";

import { useRouter } from "next/navigation";
import PlanOverview from "../PlanOverview";

// /plan/overview — 활성 플랜의 챕터/섹션 개요
export default function PlanOverviewPage() {
  const router = useRouter();
  return (
    <PlanOverview
      onBack={() => router.push("/plan")}
      onOpenSection={(chapterId, sectionId) => router.push(`/plan/${chapterId}/${sectionId}`)}
      onOpenDocument={() => router.push("/plan/document")}
    />
  );
}
