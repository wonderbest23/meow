import { notFound } from "next/navigation";
import BusinessAppChrome from "../../plan/BusinessAppChrome";
import PlanLoading from "../../plan/PlanLoading";
import frame from "../../plan/chat/page.module.css";
import theme from "../../../components/workspace-theme.module.css";

export default async function LoadingPreview({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { mode } = await searchParams;
  if (mode === "full") return <main><PlanLoading fullPage variant="compact" note="화면을 준비하고 있어요" /></main>;
  return <main className={`plan-ui ${theme.theme} ${frame.page}`} data-workspace-theme="light">
    <BusinessAppChrome title={mode === "document" ? "사업계획서" : "사업 기획"} active="chat" showRail={mode !== "document"}>
      <PlanLoading fill variant="compact" note={mode === "long" ? "저장한 사업 기획과 문서를 안전하게 불러오고 있어요" : "사업 기획을 불러오고 있어요"} />
    </BusinessAppChrome>
  </main>;
}
