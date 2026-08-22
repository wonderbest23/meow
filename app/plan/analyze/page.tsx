import AnalyzeFlow from "./AnalyzeFlow";

export const metadata = { title: "AI와 사업 정리하기 — 오늘창업" };

// /plan/analyze — 사업 설명 → AI 분석 → 이해 확인 → 꼭 필요한 질문만 (기존 위저드 앞단의 빠른 길)
export default function PlanAnalyzePage() {
  return <AnalyzeFlow />;
}
