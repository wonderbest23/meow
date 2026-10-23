import { Check, Download } from "lucide-react";
import styles from "./DocumentWorkspace.module.css";

/** level — 사업명 제목 단계. 작업실 칸 안에서는 2(작업실 머리줄의 사업명이 페이지의 h1이다) */
export function DocumentReadHeading({ title, planType, isSample, completed, identity, onDownload, compact = false, level = 1 }: { title: string; planType: string; isSample: boolean; completed?: boolean; identity?: { headline: string; pitch: string }; onDownload?: () => void; compact?: boolean; level?: 1 | 2 }) {
  // 한 줄 소개(AI 제안) — 문서를 열자마자 무슨 사업인지 알아보게 제목 바로 아래에 둔다
  /* 무엇이 사업 이름이고 무엇이 설명인지 헷갈리지 않게 각각 작은 이름표를 단다. 예시는 목록용 꼬리표("샘플 · ", "(…)")를 떼고 사업 이름만 */
  const name = isSample ? title.replace(/^샘플\s*·\s*/, "").replace(/\s*\([^)]*\)\s*$/, "").trim() || title : title;
  /* 내려받기는 '작성 완료' 바로 옆에 같은 모양으로 — 아래 단추 줄에 세 개가 나란히 있던 게 어색했다(대표 요청 2026-10-17) */
  const badges = (completed || onDownload) && <div className={styles.badgeRow}>{completed && <span className={`${styles.completedBadge} ${styles.doneBadge}`}><Check size={14} aria-hidden="true" />작성 완료</span>}{onDownload && <button type="button" className={`${styles.completedBadge} ${styles.downloadBadge}`} onClick={onDownload}><Download size={14} aria-hidden="true" />내려받기</button>}</div>;
  if (compact) return badges ? <div className={styles.compactHeading}>{badges}</div> : null;
  return <header className={styles.heading}>{badges}<p>{isSample ? "예시 · " : ""}{planType}</p>
    <span className={styles.fieldLabel}>사업명</span>{level === 2 ? <h2 className={styles.headingTitle}>{name}</h2> : <h1>{name}</h1>}
    {identity && <><span className={styles.fieldLabel}>사업 설명</span><div className={styles.identity}><strong>{identity.headline}</strong><span>{identity.pitch}</span></div></>}
  </header>;
}

export function DocumentChapterHeading({ number, title }: { number: number; title: string }) {
  return <header className={styles.chapterHeading}><span>{number}장</span><h2>{title}</h2></header>;
}

export function DocumentSectionHeading({ number, title }: { number?: string; title: string }) {
  return <h3><span>{number}</span>{title}</h3>;
}
