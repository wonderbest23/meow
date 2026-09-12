"use client";

import styles from "./PlanLoading.module.css";

/** 버튼 안에서 쓰는 인라인 스피너 — 글자 크기를 따라간다 */
export function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}

export type PlanLoadingVariant = "deck" | "rows" | "document" | "compact";

export interface PlanLoadingProps {
  /** deck=카드 격자(목록·시작), rows=줄 목록(개요·마이페이지), document=문서 본문 */
  variant?: PlanLoadingVariant;
  /** 현재 불러오는 내용을 알리는 상태 문구 */
  note?: string;
  /** 뼈대 개수 */
  count?: number;
  fullPage?: boolean;
  /** 앱 헤더 아래의 남은 공간을 채우는 페이지 로딩 */
  fill?: boolean;
}

/**
 * 플랜 빌더 공용 로딩 표현.
 *
 * 예전에는 화면마다 달랐다 — 문서만 스켈레톤이고 목록·개요·시작·마이페이지는
 * 빈 화면이라, 같은 앱인데 기다리는 경험이 제각각이었다. 여기 한 곳에서만
 * 정의하고 모든 화면이 이걸 쓴다.
 */
export default function PlanLoading({ variant = "rows", note = "화면을 준비하고 있어요", count, fullPage = false, fill = false }: PlanLoadingProps) {
  const n = count ?? 3;

  return (
    <div className={`${styles.wrap} ${fullPage ? styles.fullPage : ""} ${fill ? styles.fill : ""} ${variant === "compact" ? styles.compact : ""}`} role="status" aria-label={note}>
      <div className={styles.status}><span className={styles.dots} aria-hidden="true"><i /><i /><i /></span><p>{note}</p></div>
      {variant !== "compact" && <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.title} />
      <div className={styles.bar} />

      {variant === "deck" ? (
        <div className={styles.deck}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className={styles.card} />
          ))}
        </div>
      ) : (
        <div className={styles.rows}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className={styles.row}>
              <div className={`${styles.line} ${styles.lineHead}`} />
              <div className={styles.line} />
              {variant === "document" && <div className={styles.line} />}
              <div className={`${styles.line} ${styles.lineShort}`} />
            </div>
          ))}
        </div>
      )}

      </div>}
    </div>
  );
}
