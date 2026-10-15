import { summaryBasisLabel, type ExecutiveSummary } from "../../../lib/plan-builder/executive-summary";
import styles from "./DocumentWorkspace.module.css";

export default function ExecutiveSummaryView({ summary }: { summary: ExecutiveSummary }) {
  return <div className={styles.executiveSummary} aria-label="한 장 사업 요약">
    {summary.blocks.map(block => <section key={block.id} aria-labelledby={`summary-${block.id}`}>
      <h2 id={`summary-${block.id}`}>{block.title}</h2>
      <dl>{block.lines.map((line, index) => <div key={`${line.label}-${index}`}>
        <dt>{line.label}</dt><dd>{line.value}{/* 내가 넣은 값에는 꼬리표를 달지 않는다(대표 요청 2026-10-15) — AI·계산·확인 필요만 */}{line.basis === "user" ? null : <span data-basis={line.basis}>{line.basis === "proposal" ? "AI 초안" : summaryBasisLabel(line.basis)}</span>}</dd>
      </div>)}</dl>
    </section>)}
    <p className={styles.summaryNote}>{summary.note}</p>
  </div>;
}
