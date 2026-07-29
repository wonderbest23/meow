import PlanShell from "./PlanShell";

// /plan 이하 모든 화면이 고정 레일 셸을 공유한다.
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return <PlanShell>{children}</PlanShell>;
}
