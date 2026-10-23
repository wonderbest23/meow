import type { ReactNode } from "react";
import { Check, Download } from "lucide-react";
import styles from "./DocumentWorkspace.module.css";

/**
 * level — 사업명 제목 단계. 작업실 칸 안에서는 2(작업실 머리줄의 사업명이 페이지의 h1이다)
 * studio — 머리줄이 있는 작업실 안. 머리줄이 사업명·상태를 이미 보여 주므로 '사업명'·큰 제목·작성 완료 칩을 빼고
 *   계획서 종류 한 줄과 사업 설명 카드만 남긴다. 내려받기는 머리줄로 올라가 넓은 화면에서는 숨기고, 좁은 화면(머리줄이 좁다)에서만 둔다.
 */
export function DocumentReadHeading({ title, planType, isSample, completed, identity, onDownload, compact = false, level = 1, studio = false }: { title: string; planType: string; isSample: boolean; completed?: boolean; identity?: { headline: string; pitch: string }; onDownload?: () => void; compact?: boolean; level?: 1 | 2; studio?: boolean }) {
  // 한 줄 소개(AI 제안) — 문서를 열자마자 무슨 사업인지 알아보게 제목 바로 아래에 둔다
  /* 무엇이 사업 이름이고 무엇이 설명인지 헷갈리지 않게 각각 작은 이름표를 단다. 예시는 목록용 꼬리표("샘플 · ", "(…)")를 떼고 사업 이름만 */
  const name = isSample ? title.replace(/^샘플\s*·\s*/, "").replace(/\s*\([^)]*\)\s*$/, "").trim() || title : title;
  /* 내려받기는 '작성 완료' 바로 옆에 같은 모양으로 — 아래 단추 줄에 세 개가 나란히 있던 게 어색했다(대표 요청 2026-10-17) */
  const badges = (completed || onDownload) && <div className={styles.badgeRow}>{completed && <span className={`${styles.completedBadge} ${styles.doneBadge}`}><Check size={14} aria-hidden="true" />작성 완료</span>}{onDownload && <button type="button" className={`${styles.completedBadge} ${styles.downloadBadge}`} onClick={onDownload}><Download size={14} aria-hidden="true" />내려받기</button>}</div>;
  if (studio) {
    const narrowDownload = onDownload && <div className={`${styles.badgeRow} ${styles.narrowOnly}`}><button type="button" className={`${styles.completedBadge} ${styles.downloadBadge}`} onClick={onDownload}><Download size={14} aria-hidden="true" />내려받기</button></div>;
    if (compact) return narrowDownload ? <div className={`${styles.compactHeading} ${styles.narrowOnly}`}>{narrowDownload}</div> : null;
    /* 사업명은 화면에서 빼되(머리줄에 있다) 낭독기에는 제목으로 남긴다 — 칸 안 제목 순서가 끊기지 않게 */
    return <header className={`${styles.heading} ${styles.studioHeading}`}>{narrowDownload}
      <p>{isSample ? "예시 · " : ""}{planType}</p>
      <h2 className={styles.srOnly}>{name}</h2>
      {identity && <div className={styles.identity}><strong>{identity.headline}</strong><span>{identity.pitch}</span></div>}
    </header>;
  }
  if (compact) return badges ? <div className={styles.compactHeading}>{badges}</div> : null;
  return <header className={styles.heading}>{badges}<p>{isSample ? "예시 · " : ""}{planType}</p>
    <span className={styles.fieldLabel}>사업명</span>{level === 2 ? <h2 className={styles.headingTitle}>{name}</h2> : <h1>{name}</h1>}
    {identity && <><span className={styles.fieldLabel}>사업 설명</span><div className={styles.identity}><strong>{identity.headline}</strong><span>{identity.pitch}</span></div></>}
  </header>;
}

/** actions — 작업실 안에서 장 머리 오른쪽 위에 붙는 작은 단추들(이 장을 대화로 고치기 · 직접 고치기). 없으면 예전 그대로 */
export function DocumentChapterHeading({ number, title, actions }: { number: number; title: string; actions?: ReactNode }) {
  return <header className={styles.chapterHeading}>{actions ? <div className={styles.chapterHeadingTop}><span>{number}장</span><div className={styles.chapterActions} role="group" aria-label={`${number}장 고치기`}>{actions}</div></div> : <span>{number}장</span>}<h2>{title}</h2></header>;
}

export function DocumentSectionHeading({ number, title }: { number?: string; title: string }) {
  return <h3><span>{number}</span>{title}</h3>;
}
