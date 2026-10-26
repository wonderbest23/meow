import type { Metadata } from "next";
import theme from "../../components/workspace-theme.module.css";
import colors from "./AdminColors.module.css";
import styles from "./AdminWorkspace.module.css";

/* 탭 이름이 고객 첫 화면 제목과 같았다 — 관리자 화면임을 알게, 검색에는 올리지 않는다(점검 r41-B) */
export const metadata: Metadata = { title: "관리자 | 오늘창업", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={`plan-ui ${theme.theme} ${colors.admin} ${styles.admin}`} data-workspace-theme="light">{children}</div>;
}
