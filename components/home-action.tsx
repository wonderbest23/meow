import type { AnchorHTMLAttributes } from "react";
import { CtaArrow } from "./cta-arrow";
import styles from "./home-action.module.css";

type HomeActionProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: "soft" | "solid";
};

/** 홈의 행동 버튼. 글자 + 오른쪽 화살표 하나로 단순하게 두고, 채움(solid)·연한(soft) 두 가지만 쓴다. */
export function HomeAction({ children, variant = "soft", className = "", ...props }: HomeActionProps) {
  return <a {...props} className={`${styles.action} ${className}`} data-home-action data-variant={variant}>
    <span className={styles.label}>{children}</span>
    <CtaArrow />
  </a>;
}
