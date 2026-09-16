import { summaryBasisLabel, type ExecutiveSummary } from "../../../lib/plan-builder/executive-summary";
import styles from "./DocumentWorkspace.module.css";

export default function ExecutiveSummaryView({ summary }: { summary: ExecutiveSummary }) {
  return <div className={styles.executiveSummary} aria-label="한 장 사업 요약">
    {summary.blocks.map(block => <section key={block.id} aria-labelledby={`summary-${block.id}`}>
      <h2 id={`summary-${block.id}`}>{block.title}</h2>
      <dl>{block.lines.map((line, index) => <div key={`${line.label}-${index}`}>
        <dt>{line.label}</dt><dd>{line.value}<span data-basis={line.basis}>{summaryBasisLabel(line.basis)}</span></dd>
      </div>)}</dl>
    </section>)}
    <p className={styles.summaryNote}>{summary.note}</p>
  </div>;
}
