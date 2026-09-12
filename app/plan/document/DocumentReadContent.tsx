import { Check } from "lucide-react";
import styles from "./DocumentWorkspace.module.css";

export function DocumentReadHeading({ title, planType, isSample, completed }: { title: string; planType: string; isSample: boolean; completed?: boolean }) {
  return <header className={styles.heading}>{completed && <span className={styles.completedBadge}><Check size={14} aria-hidden="true" />작성 완료</span>}<p>{isSample ? "예시 · " : ""}{planType}</p><h1>{title}</h1></header>;
}

export function DocumentChapterHeading({ number, title }: { number: number; title: string }) {
  return <header className={styles.chapterHeading}><span>{number}장</span><h2>{title}</h2></header>;
}

export function DocumentSectionHeading({ number, title }: { number?: string; title: string }) {
  return <h3><span>{number}</span>{title}</h3>;
}
