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

/*
 * 화면 로딩 — 앱처럼 얇은 원이 도는 표시 + 작은 안내 글씨.
 * 화면을 채우는 로딩(fill·fullPage)은 감싸는 틀(왼쪽 메뉴 유무·대화 칸 폭)과 상관없이 늘 화면 한가운데 같은 자리에 둔다.
 * 예전엔 틀마다 가운데가 달라 새 대화 하나를 여는 동안에도 로딩 위치가 두세 번 옮겨 다녔다.
 * 빨리 끝나는 로딩은 깜빡이지 않게 잠깐 뒤에 나타난다.
 */
export default function PlanLoading({ note = "화면을 불러오고 있어요", fullPage = false, fill = false }: PlanLoadingProps) {
  return <div className={`${styles.wrap} ${fullPage || fill ? styles.pinned : ""} ${fill ? styles.fill : ""} ${fullPage ? styles.fullPage : ""}`}>
    <div className={styles.loader} role="status" aria-live="polite" aria-atomic="true">
      <span className={styles.ring} aria-hidden="true" />
      <p>{note}</p>
    </div>
  </div>;
}
