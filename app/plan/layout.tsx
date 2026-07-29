import PlanShell from "./PlanShell";

/**
 * /plan 이하 모든 화면이 고정 레일 셸을 공유한다.
 *
 * plan-ui 클래스는 globals.css의 사이트 전역 버튼 정규화
 * (모든 button에 14px 라운드·굵기 800 강제, svg 숨김)에서
 * 이 영역을 빼내는 표식이다. 덕분에 여기서는 모듈 CSS가 그대로 먹는다.
 */
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="plan-ui">
      <PlanShell>{children}</PlanShell>
    </div>
  );
}
