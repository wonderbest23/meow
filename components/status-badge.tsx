import { Check } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./status-badge.module.css";

/** 상태 표시 배지의 색조 — 완료·진행/분류·주의·문제·중립 다섯 가지 */
export type StatusTone = "success" | "info" | "warning" | "danger" | "neutral";

/**
 * 앱 공통 상태 표시 배지(알약형). 모양은 status-badge.module.css 한 곳에서만 정한다.
 * className 은 자리(여백·위치·최대 너비)용이다 — 글자 크기·색을 덮어쓰지 않는다. done 이면 앞에 체크 표시.
 */
export function StatusBadge({ tone, done = false, className, title, children }: { tone: StatusTone; done?: boolean; className?: string; title?: string; children: ReactNode }) {
  return <span className={className ? `${styles.badge} ${className}` : styles.badge} data-tone={tone} title={title}>{done && <Check size={13} strokeWidth={2.75} aria-hidden="true" />}<span className={styles.text}>{children}</span></span>;
}
