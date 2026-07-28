"use client";

import { useRouter } from "next/navigation";
import PlanOverview from "./PlanOverview";

// Phase 1~4: 플랜 개요 화면. 상태·생성본문은 plan-store(localStorage)에서 로드.
export default function PlanPage() {
  const router = useRouter();
  return (
    <PlanOverview
      planTitle="새 플랜"
      onBack={() => {
        if (typeof window !== "undefined") window.history.back();
      }}
      onOpenSection={(chapterId, sectionId) => router.push(`/plan/${chapterId}/${sectionId}`)}
    />
  );
}
