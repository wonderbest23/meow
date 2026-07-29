"use client";

import type { ConsistencyIssue } from "../../lib/plan-builder/consistency";
import styles from "./ConsistencyPanel.module.css";

export interface ConsistencyPanelProps {
  issues: ConsistencyIssue[];
  /** 관련 섹션으로 이동 */
  onOpenSection?: (chapterId: string, sectionId: string) => void;
  /** 위저드 안에서는 좁게 표시한다 */
  compact?: boolean;
}

/**
 * 챕터 간 답변 모순을 알려주는 패널.
 * 생성을 막지는 않는다 — 사용자가 의도한 값일 수도 있으므로 짚어만 준다.
 */
export default function ConsistencyPanel({ issues, onOpenSection, compact }: ConsistencyPanelProps) {
  if (issues.length === 0) return null;

  const conflicts = issues.filter((i) => i.severity === "conflict").length;
  const checks = issues.length - conflicts;

  return (
    <section className={`${styles.wrap} ${compact ? styles.compact : ""}`} aria-label="답변 점검">
      <header className={styles.head}>
        <h2 className={styles.title}>답변끼리 어긋나는 곳이 있습니다</h2>
        <span className={styles.counts}>
          {conflicts > 0 && <span className={styles.badgeConflict}>모순 {conflicts}</span>}
          {checks > 0 && <span className={styles.badgeCheck}>확인 {checks}</span>}
        </span>
      </header>
      <p className={styles.desc}>
        의도한 값이라면 그대로 두셔도 됩니다. 다만 계획서에 그대로 실리니 한 번 확인해보세요.
      </p>

      <ul className={styles.list}>
        {issues.map((issue) => (
          <li key={issue.id} className={issue.severity === "conflict" ? styles.conflict : styles.check}>
            <div className={styles.itemTitle}>
              <span className={styles.mark} aria-hidden="true">
                {issue.severity === "conflict" ? "!" : "?"}
              </span>
              {issue.title}
            </div>
            <p className={styles.itemDetail}>{issue.detail}</p>
            {onOpenSection && (
              <div className={styles.links}>
                {issue.refs.map((r) => {
                  const [chapterId, sectionId] = r.key.split("/");
                  return (
                    <button
                      key={r.key}
                      type="button"
                      className={styles.link}
                      onClick={() => onOpenSection(chapterId, sectionId)}
                    >
                      {r.label} 열기
                    </button>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
