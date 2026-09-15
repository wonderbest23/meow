import type { AnchorHTMLAttributes } from "react";
import { Download, FileText, FolderOpen, MessageSquarePlus, PanelsTopLeft } from "lucide-react";
import styles from "./home-action.module.css";

const icons = { chat: MessageSquarePlus, document: FileText, download: Download, workspace: FolderOpen, website: PanelsTopLeft };

type HomeActionProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  icon: keyof typeof icons;
  variant?: "soft" | "solid";
};

export function HomeAction({ children, icon, variant = "soft", className = "", ...props }: HomeActionProps) {
  const Icon = icons[icon];
  return <a {...props} className={`${styles.action} ${className}`} data-home-action data-variant={variant}>
    <span className={styles.icon} aria-hidden="true"><Icon /></span>
    <span className={styles.label}>{children}</span>
  </a>;
}
