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
 * 챕터 간 답변 모순 알림 — 한 줄 요약만.
 * 긴 설명 대신 '어디가 어긋났는지 + 이동 버튼'으로 끝낸다.
 * 생성을 막지는 않는다(사용자가 의도한 값일 수 있다).
 */
export default function ConsistencyPanel({ issues, onOpenSection, compact }: ConsistencyPanelProps) {
  if (issues.length === 0) return null;

  return (
    <section className={`${styles.wrap} ${compact ? styles.compact : ""}`} aria-label="답변 점검">
      {issues.map((issue) => (
        <div key={issue.id} className={styles.row} title={issue.detail}>
          <span className={issue.severity === "conflict" ? styles.badgeConflict : styles.badgeCheck}>
            {issue.severity === "conflict" ? "모순" : "확인"}
          </span>
          <span className={styles.rowTitle}>{issue.title}</span>
          {onOpenSection &&
            issue.refs.map((r) => {
              const [chapterId, sectionId] = r.key.split("/");
              return (
                <button
                  key={r.key}
                  type="button"
                  className={styles.link}
                  onClick={() => {
                    // 이동한 섹션에서 어긋난 질문을 짚어주기 위한 전달
                    try {
                      sessionStorage.setItem("plan-conflict-focus", JSON.stringify({ key: r.key, qids: r.qids ?? [] }));
                    } catch { /* 저장 실패해도 이동은 한다 */ }
                    onOpenSection(chapterId, sectionId);
                  }}
                >
                  {r.label} →
                </button>
              );
            })}
        </div>
      ))}
    </section>
  );
}
