import theme from "../../components/workspace-theme.module.css";
import colors from "./AdminColors.module.css";
import styles from "./AdminWorkspace.module.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={`plan-ui ${theme.theme} ${colors.admin} ${styles.admin}`} data-workspace-theme="night">{children}</div>;
}
