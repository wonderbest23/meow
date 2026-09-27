"use client";

import styles from "./PlanLoading.module.css";

export function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}

export function LoadingStatus({ note, announce = true }: { note: string; announce?: boolean }) {
  return <div className={styles.status} role={announce ? "status" : undefined} aria-live={announce ? "polite" : undefined} aria-atomic={announce ? true : undefined}>
    <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span><p>{note}</p>
  </div>;
}

export type PlanLoadingVariant = "deck" | "rows" | "document" | "compact";
export interface PlanLoadingProps {
  /** Retained for existing callers; page loads share one presentation. */
  variant?: PlanLoadingVariant;
  note?: string;
  count?: number;
  fullPage?: boolean;
  fill?: boolean;
}

export default function PlanLoading({ note = "화면을 불러오고 있어요", fullPage = false, fill = false }: PlanLoadingProps) {
  return <div className={`${styles.wrap} ${fullPage ? styles.fullPage : ""} ${fill ? styles.fill : ""}`}><LoadingStatus note={note} /></div>;
}
