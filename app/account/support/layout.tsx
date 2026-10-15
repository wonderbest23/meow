import theme from "../../../components/workspace-theme.module.css";

/*
 * 고객센터도 /plan 화면과 같은 틀(AppFrame)에 담기므로 같은 바탕을 씌운다 — plan-ui 가 없으면
 * 사이트 전역 단추 규칙이 머리말의 메뉴(☰) 아이콘을 숨긴다(app/plan/layout.tsx 와 같은 이유).
 */
export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return <div className={`plan-ui ${theme.theme}`} data-workspace-theme="light">{children}</div>;
}
