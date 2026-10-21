import type { Metadata } from "next";
import PlanShell from "./PlanShell";
import SkipLink from "./SkipLink";
import theme from "../../components/workspace-theme.module.css";

/* 로그인한 사람의 작업 화면 — 홈과 다른 제목, 검색에는 올리지 않는다(app/robots.ts 도 /plan 을 막는다) */
export const metadata: Metadata = { title: "내 사업 | 오늘창업", robots: { index: false, follow: false } };

/**
 * /plan 이하 모든 화면이 고정 레일 셸을 공유한다.
 *
 * plan-ui 클래스는 globals.css의 사이트 전역 버튼 정규화
 * (모든 button에 14px 라운드·굵기 800 강제, svg 숨김)에서
 * 이 영역을 빼내는 표식이다. 덕분에 여기서는 모듈 CSS가 그대로 먹는다.
 */
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`plan-ui ${theme.theme}`} data-workspace-theme="light">
      <SkipLink />
      <PlanShell>{children}</PlanShell>
    </div>
  );
}
