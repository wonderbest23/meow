"use client";

/*
 * AI 사업 검토 — 검토 결과를 사람이 읽는 형태로 보여 준다.
 *
 * 내부 JSON 을 그대로 노출하지 않는다. 점수는 '사업계획서 완성도'이고,
 * 선정 가능성·투자 성공률처럼 읽히는 표현은 쓰지 않는다.
 * 본문이 바뀌면 이전 결과를 '지난 검토'로 낮춰 표시한다 — 이미 고친 문제를
 * 다시 고치라고 하면 안 된다.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { activePlan, loadState, saveAnswers, isSamplePlan } from "../../lib/plan-builder/plan-store";
import {
  REVIEW_CATEGORY_LABEL,
  REVIEW_KEY,
  countBySeverity,
  readReview,
  type BusinessPlanReview,
  type ReviewIssue,
  type ReviewRecord,
  type ReviewSeverity,
} from "../../lib/plan-builder/review/domain";
import styles from "./ReviewPanel.module.css";

const GROUP_TITLE: Record<ReviewSeverity, string> = {
  critical: "먼저 고치면 좋은 것",
  warning: "보완하면 좋은 것",
  improvement: "다듬으면 좋은 것",
};

export default function ReviewPanel({
  planId,
  doneCount,
  onOpenSection,
}: {
  planId: string | null;
  /** 본문이 만들어진 섹션 수 — 하나도 없으면 검토할 것이 없다 */
  doneCount: number;
  onOpenSection?: (chapterId: string, sectionId: string) => void;
}) {
  const [record, setRecord] = useState<ReviewRecord | null>(null);
  const [status, setStatus] = useState<"none" | "stale" | "fresh">("none");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [readOnly, setReadOnly] = useState(false);

  const refresh = useCallback(() => {
    const s = loadState();
    const p = activePlan(s);
    setReadOnly(isSamplePlan(p?.id));
    if (!p) return;
    const state = readReview(p.answers, { id: p.id, sections: p.sections ?? {} });
    setRecord(state.record);
    setStatus(state.status);
  }, []);

  useEffect(refresh, [refresh, planId, doneCount]);

  async function run() {
    if (!planId || running) return;
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/plan/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; record?: ReviewRecord; reason?: string; message?: string };
      if (!data.ok || !data.record) {
        setError(data.message ?? (data.reason === "login_required" ? "로그인 후 이용할 수 있습니다." : "검토를 완료하지 못했어요. 잠시 후 다시 시도해 주세요."));
        return;
      }
      saveAnswers(REVIEW_KEY, data.record as unknown as Record<string, unknown>, planId);
      setRecord(data.record);
      setStatus("fresh");
      setExpanded(true);
    } catch {
      setError("검토 요청에 실패했어요. 인터넷 연결을 확인해 주세요.");
    } finally {
      setRunning(false);
    }
  }

  const review: BusinessPlanReview | null = record?.result ?? null;
  const counts = useMemo(() => (review ? countBySeverity(review.issues) : null), [review]);
  const grouped = useMemo(() => {
    if (!review) return [] as Array<[ReviewSeverity, ReviewIssue[]]>;
    const order: ReviewSeverity[] = ["critical", "warning", "improvement"];
    return order
      .map((sev) => [sev, review.issues.filter((i) => i.severity === sev)] as [ReviewSeverity, ReviewIssue[]])
      .filter(([, list]) => list.length > 0);
  }, [review]);

  if (readOnly || doneCount === 0) return null;

  const visibleGroups = expanded ? grouped : grouped.map(([sev, list]) => [sev, sev === "critical" ? list : list.slice(0, 1)] as [ReviewSeverity, ReviewIssue[]]);
  const hiddenCount = review ? review.issues.length - visibleGroups.reduce((n, [, l]) => n + l.length, 0) : 0;

  return (
    <section className={styles.wrap} aria-label="AI 사업 검토">
      <div className={styles.head}>
        <div className={styles.headText}>
          <strong>AI 사업 검토</strong>
          <span>
            {review
              ? "사업계획서를 사업 관점에서 다시 읽고 약한 곳을 찾았어요."
              : "작성한 사업계획서를 컨설턴트 관점에서 읽고, 논리적 빈틈과 근거가 약한 곳을 찾아드려요."}
          </span>
        </div>
        <button type="button" className={styles.btn} onClick={run} disabled={running || !planId}>
          {running ? <RefreshCw size={14} className={styles.spin} /> : <ClipboardCheck size={14} />}
          {running ? "검토하는 중…" : review ? "다시 검토하기" : "검토 시작"}
        </button>
      </div>

      {error && <div className={styles.fail}>{error}</div>}

      {status === "stale" && (
        <div className={styles.stale}>
          이 검토는 <b>본문을 고치기 전</b>에 한 것이에요. 지금 문서 기준으로 보려면 다시 검토해 주세요.
        </div>
      )}

      {review && (
        <>
          {review.overallQualityScore >= 0 && (
            <div className={styles.scoreRow}>
              <div>
                <div className={styles.scoreLabel}>사업계획서 완성도</div>
                <div>
                  <span className={styles.score}>{review.overallQualityScore}</span> <span className={styles.scoreOf}>/ 100</span>
                </div>
              </div>
              {counts && (
                <div className={styles.counts}>
                  {counts.critical > 0 && <span className={`${styles.count} ${styles.cCritical}`}>먼저 고칠 것 {counts.critical}</span>}
                  {counts.warning > 0 && <span className={`${styles.count} ${styles.cWarning}`}>보완 {counts.warning}</span>}
                  {counts.improvement > 0 && <span className={`${styles.count} ${styles.cImprovement}`}>다듬기 {counts.improvement}</span>}
                  {review.issues.length === 0 && <span className={`${styles.count} ${styles.cImprovement}`}>발견된 문제 없음</span>}
                </div>
              )}
            </div>
          )}

          {review.summary && <p className={styles.note}>{review.summary}</p>}

          {review.dimensions.length > 0 && (
            <div className={styles.dims}>
              {review.dimensions.map((d) => (
                <div key={d.id} className={`${styles.dim} ${d.score <= 1.5 ? styles.dimBad : d.score <= 3 ? styles.dimLow : ""}`}>
                  <span className={styles.dimLabel}>{d.label}</span>
                  <span className={styles.dimBar}>
                    <span className={styles.dimFill} style={{ width: `${(d.score / 5) * 100}%` }} />
                  </span>
                  <span className={styles.dimScore}>{d.score}</span>
                  {expanded && d.reason && <span className={styles.dimReason}>{d.reason}</span>}
                </div>
              ))}
            </div>
          )}

          {review.strengths.length > 0 && (
            <div className={styles.strengths}>
              {review.strengths.map((s) => (
                <div key={s} className={styles.strength}>✓ {s}</div>
              ))}
            </div>
          )}

          {visibleGroups.map(([sev, list]) => (
            <div key={sev} className={styles.issues}>
              <div className={styles.groupTitle}>{GROUP_TITLE[sev]}</div>
              {list.map((issue) => (
                <article key={issue.id} className={`${styles.issue} ${styles[sev]}`}>
                  <div className={styles.issueHead}>
                    <span className={styles.issueTitle}>{issue.title}</span>
                    <span className={styles.tag}>{REVIEW_CATEGORY_LABEL[issue.category] ?? issue.category}</span>
                    {issue.origin === "deterministic" && <span className={`${styles.tag} ${styles.tagDet}`}>계산으로 확인</span>}
                  </div>
                  <p className={styles.issueBody}>{issue.problem}</p>
                  {expanded && issue.whyItMatters && <p className={styles.issueBody}>{issue.whyItMatters}</p>}
                  {expanded && issue.evidence.length > 0 && <p className={styles.evidence}>근거 · {issue.evidence.join(" / ")}</p>}
                  <p className={styles.rec}><b>→</b> {issue.recommendation}</p>
                  <div className={styles.actions}>
                    {issue.sectionKey && onOpenSection && (
                      <button
                        type="button"
                        className={styles.ghost}
                        onClick={() => {
                          const [chapterId, sectionId] = issue.sectionKey!.split("/");
                          if (chapterId && sectionId) onOpenSection(chapterId, sectionId);
                        }}
                      >
                        {issue.requiresUserInput ? "답변 추가하기" : "해당 섹션 열기"} →
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ))}

          {hiddenCount > 0 && !expanded && (
            <button type="button" className={styles.ghost} onClick={() => setExpanded(true)}>
              나머지 {hiddenCount}개와 자세한 설명 보기
            </button>
          )}
          {expanded && (
            <button type="button" className={styles.ghost} onClick={() => setExpanded(false)}>
              간단히 보기
            </button>
          )}

          <p className={styles.disclaimer}>
            완성도 점수는 <b>사업계획서 문서의 완성도</b>를 뜻해요. 정부지원 선정 가능성이나 투자·대출 가능성, 사업 성공 확률과는 관계가 없습니다.
            {record?.reviewedAt ? ` · ${new Date(record.reviewedAt).toLocaleString("ko-KR")} 검토` : ""}
          </p>
        </>
      )}
    </section>
  );
}
