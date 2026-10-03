import { Check } from "lucide-react";
import styles from "./DocumentWorkspace.module.css";

export function DocumentReadHeading({ title, planType, isSample, completed, identity }: { title: string; planType: string; isSample: boolean; completed?: boolean; identity?: { headline: string; pitch: string } }) {
  // 한 줄 소개(AI 제안) — 문서를 열자마자 무슨 사업인지 알아보게 제목 바로 아래에 둔다
  /* 무엇이 사업 이름이고 무엇이 설명인지 헷갈리지 않게 각각 작은 이름표를 단다. 예시는 목록용 꼬리표("샘플 · ", "(…)")를 떼고 사업 이름만 */
  const name = isSample ? title.replace(/^샘플\s*·\s*/, "").replace(/\s*\([^)]*\)\s*$/, "").trim() || title : title;
  return <header className={styles.heading}>{completed && <span className={styles.completedBadge}><Check size={14} aria-hidden="true" />작성 완료</span>}<p>{isSample ? "예시 · " : ""}{planType}</p>
    <span className={styles.fieldLabel}>사업명</span><h1>{name}</h1>
    {identity && <><span className={styles.fieldLabel}>사업 설명</span><div className={styles.identity}><strong>{identity.headline}</strong><span>{identity.pitch}</span></div></>}
  </header>;
}

export function DocumentChapterHeading({ number, title }: { number: number; title: string }) {
  return <header className={styles.chapterHeading}><span>{number}장</span><h2>{title}</h2></header>;
}

export function DocumentSectionHeading({ number, title }: { number?: string; title: string }) {
  return <h3><span>{number}</span>{title}</h3>;
}
