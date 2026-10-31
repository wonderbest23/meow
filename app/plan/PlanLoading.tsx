"use client";

import { useEffect, useState } from "react";
import styles from "./PlanLoading.module.css";
import { AppButton } from "../../components/app-button";

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
  /** 늦어질 때 '다시 시도' — 없으면 화면을 새로 불러온다 */
  onRetry?: () => void;
  /** 이만큼 지나도 끝나지 않으면 '늦어지고 있어요'와 다시 시도를 보여 준다 */
  slowAfterMs?: number;
}

/*
 * 화면 로딩 — 앱처럼 얇은 원이 도는 표시 + 작은 안내 글씨.
 * 화면을 채우는 로딩(fill·fullPage)은 감싸는 틀(왼쪽 메뉴 유무·대화 칸 폭)과 상관없이 늘 화면 한가운데 같은 자리에 둔다.
 * 예전엔 틀마다 가운데가 달라 새 대화 하나를 여는 동안에도 로딩 위치가 두세 번 옮겨 다녔다.
 * 빨리 끝나는 로딩은 깜빡이지 않게 잠깐 뒤에 나타난다.
 */
export default function PlanLoading({ note = "화면을 불러오고 있어요", fullPage = false, fill = false, onRetry, slowAfterMs = 15000 }: PlanLoadingProps) {
  /* 서버가 답을 주지 않으면 원만 끝없이 돌았다 — 한참 지나면 늦어진다고 알리고 다시 시도를 둔다 */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), slowAfterMs);
    return () => window.clearTimeout(timer);
  }, [slowAfterMs]);
  return <div className={`${styles.wrap} ${fullPage || fill ? styles.pinned : ""} ${fill ? styles.fill : ""} ${fullPage ? styles.fullPage : ""}`}>
    <div className={`${styles.loader} ${slow ? styles.slow : ""}`} role="status" aria-live="polite" aria-atomic="true">
      <span className={styles.ring} aria-hidden="true" />
      <p>{slow ? "불러오기가 늦어지고 있어요" : note}</p>
      {slow && <>
        <p className={styles.slowNote}>연결이 느리거나 서버가 잠시 바빠요.</p>
        <AppButton type="button" variant="secondary" className={styles.retry} onClick={() => { if (onRetry) { setSlow(false); onRetry(); } else window.location.reload(); }}>다시 시도</AppButton>
      </>}
    </div>
  </div>;
}
