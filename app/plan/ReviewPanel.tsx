"use client";

/*
 * AI 사업 검토 — 검토 결과를 사람이 읽는 형태로 보여 준다.
 *
 * 내부 JSON 을 그대로 노출하지 않는다. 점수는 '사업계획서 완성도'이고,
 * 선정 가능성·투자 성공률처럼 읽히는 표현은 쓰지 않는다.
 * 본문이 바뀌면 이전 결과를 '지난 검토'로 낮춰 표시한다 — 이미 고친 문제를
 * 다시 고치라고 하면 안 된다.
 *
 * 2026-09-04 개편(사용자 지적: "너무 복잡하고 텍스트가 많다").
 * 예전에는 점수·요약·막대 7개·잘된 점·문제 7개를 한 화면에 모두 쏟아 냈다.
 * 읽을 것이 많으면 아무것도 고치지 않게 된다. 지금은 한 번에 문제 하나만
 * 보여 주고(스텝), 나머지는 접어 둔다. 고치면 다음 문제로 넘어간다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { activePlan, loadState, saveAnswers, isSamplePlan } from "../../lib/plan-builder/plan-store";
import {
  REVIEW_CATEGORY_LABEL,
  REVIEW_KEY,
  countBySeverity,
  readReview,
  sortIssues,
  type BusinessPlanReview,
  type ReviewIssue,
  type ReviewRecord,
  type ReviewSeverity,
} from "../../lib/plan-builder/review/domain";
import ReviewFollowUp from "./ReviewFollowUp";
import ReviewInlineEdit from "./ReviewInlineEdit";
import styles from "./ReviewPanel.module.css";

/** 심각도 — 한 문제 카드 위에 붙는 딱지 */
const SEVERITY_CHIP: Record<ReviewSeverity, string> = {
  critical: "먼저 고칠 것",
  warning: "보완할 것",
  improvement: "다듬을 것",
};

/** 0~100 을 천천히 세어 올린다 — 결과가 '도착했다'는 느낌을 준다 */
function useCountUp(target: number, run: boolean) {
  const [value, setValue] = useState(0);
  const shown = useRef(0);
  useEffect(() => {
    if (!run) return;
    if (typeof window === "undefined") return;
    /*
     * 애니메이션을 건너뛰어야 하는 두 경우.
     *  - 사용자가 움직임 줄이기를 켰다
     *  - 지금 화면이 숨어 있다(배경 탭). 브라우저가 rAF 를 멈춰 세어 올리다 만
     *    숫자(0)가 그대로 남는다 — 값은 항상 맞아야 한다.
     */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) { setValue(target); shown.current = target; return; }
    const from = shown.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * eased);
      shown.current = next;
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return value;
}

export default function ReviewPanel({
  planId,
  doneCount,
  onOpenSection,
  onOpenDocument,
}: {
  planId: string | null;
  /** 본문이 만들어진 섹션 수 — 하나도 없으면 검토할 것이 없다 */
  doneCount: number;
  onOpenSection?: (chapterId: string, sectionId: string) => void;
  /** 문장 문제는 편집기로 보낸다 — 정형 질문으로 풀 수 없는 것들 */
  onOpenDocument?: () => void;
}) {
  const [record, setRecord] = useState<ReviewRecord | null>(null);
  const [status, setStatus] = useState<"none" | "stale" | "fresh">("none");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  /** 지금 보고 있는 문제 번호 */
  const [step, setStep] = useState(0);
  /** 카드가 들어오는 방향 — 애니메이션용 */
  const [dir, setDir] = useState<1 | -1>(1);
  /** 이 화면에서 손본 문제 — 진행률로 보여 준다 */
  const [resolved, setResolved] = useState<string[]>([]);
  /** 지금 열려 있는 해결 도구 */
  const [tool, setTool] = useState<"answer" | "edit" | null>(null);
  /** 점수 상세·잘된 점 — 기본은 접어 둔다 */
  const [detail, setDetail] = useState(false);

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
      setStep(0);
      setResolved([]);
      setTool(null);
    } catch {
      setError("검토 요청에 실패했어요. 인터넷 연결을 확인해 주세요.");
    } finally {
      setRunning(false);
    }
  }

  const review: BusinessPlanReview | null = record?.result ?? null;
  const counts = useMemo(() => (review ? countBySeverity(review.issues) : null), [review]);
  /* 심각한 것부터 — 사용자는 위에서부터 하나씩 처리하면 된다 */
  const issues = useMemo(() => (review ? sortIssues(review.issues) : []), [review]);
  const score = useCountUp(review?.overallQualityScore ?? 0, Boolean(review));

  const current = issues[Math.min(step, Math.max(0, issues.length - 1))] ?? null;
  const doneAll = issues.length > 0 && resolved.length >= issues.length;

  const go = (next: number) => {
    if (next < 0 || next >= issues.length) return;
    setDir(next > step ? 1 : -1);
    setStep(next);
    setTool(null);
  };
  const markDone = (id: string) => {
    setResolved((list) => (list.includes(id) ? list : [...list, id]));
    /* 고쳤으면 다음 문제로 — 한 번에 하나씩이 이 화면의 규칙이다 */
    if (step < issues.length - 1) window.setTimeout(() => go(step + 1), 450);
  };

  if (readOnly || doneCount === 0) return null;

  return (
    <section className={styles.wrap} aria-label="AI 사업 검토">
      <div className={styles.head}>
        <div className={styles.headText}>
          <strong>AI 사업 검토</strong>
          <span>
            {review
              ? "약한 곳을 하나씩 짚어 드릴게요. 순서대로 고치면 됩니다."
              : "작성한 사업계획서를 컨설턴트 관점에서 읽고, 논리적 빈틈과 근거가 약한 곳을 찾아드려요."}
          </span>
        </div>
        <button type="button" className={review ? styles.ghost : styles.btn} onClick={run} disabled={running || !planId}>
          {running ? <RefreshCw size={14} className={styles.spin} /> : <ClipboardCheck size={14} />}
          {running ? "검토하는 중…" : review ? "다시 검토" : "검토 시작"}
        </button>
      </div>

      {error && <div className={styles.fail}>{error}</div>}

      {running && !review && (
        <div className={styles.loading}>
          <span className={styles.loadingBar}><i /></span>
          <span>사업계획서를 읽고 있어요…</span>
        </div>
      )}

      {status === "stale" && (
        <div className={styles.stale}>
          이 검토는 <b>본문을 고치기 전</b>에 한 것이에요. 지금 문서 기준으로 보려면 다시 검토해 주세요.
        </div>
      )}

      {review && (
        <>
          {/* 1. 결과 한 줄 — 점수와 개수만. 설명은 접어 둔다 */}
          <div className={styles.scoreRow}>
            <div className={styles.scoreMain}>
              <span className={styles.score}>{score}</span>
              <span className={styles.scoreOf}>/ 100</span>
              <span className={styles.scoreLabel}>사업계획서 완성도</span>
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

          {/* 2. 스텝 — 한 번에 문제 하나 */}
          {issues.length > 0 && (
            <div className={styles.stepper}>
              <div className={styles.stepBar}>
                <span className={styles.stepCount}>
                  {doneAll ? "모두 확인했어요" : <>고칠 것 <b>{step + 1}</b> / {issues.length}</>}
                </span>
                <span className={styles.dots} aria-hidden="true">
                  {issues.map((it, i) => (
                    <i
                      key={it.id}
                      className={`${i === step ? styles.dotOn : ""} ${resolved.includes(it.id) ? styles.dotDone : ""}`}
                    />
                  ))}
                </span>
              </div>

              {current && (
                <article key={current.id} className={`${styles.card} ${dir === 1 ? styles.slideL : styles.slideR}`}>
                  <div className={styles.cardTop}>
                    <span className={`${styles.chip} ${styles[current.severity]}`}>{SEVERITY_CHIP[current.severity]}</span>
                    <span className={styles.tag}>{REVIEW_CATEGORY_LABEL[current.category] ?? current.category}</span>
                    {current.origin === "deterministic" && <span className={`${styles.tag} ${styles.tagDet}`}>계산으로 확인</span>}
                    {resolved.includes(current.id) && <span className={styles.doneTag}><Check size={12} /> 손봤어요</span>}
                  </div>

                  <h4 className={styles.cardTitle}>{current.title}</h4>
                  <p className={styles.cardBody}>{current.problem}</p>

                  <div className={styles.fix}>
                    <span className={styles.fixLabel}><Sparkles size={13} /> 이렇게 고치면 돼요</span>
                    <p>{current.recommendation}</p>
                  </div>

                  <div className={styles.actions}>
                    {current.resolution?.type === "answer" && current.resolution.slots?.length && planId ? (
                      <button type="button" className={styles.primaryGhost} onClick={() => setTool(tool === "answer" ? null : "answer")}>
                        {tool === "answer" ? "접기" : "답변 추가하기 →"}
                      </button>
                    ) : null}
                    {current.sectionKey && planId && (
                      <button type="button" className={styles.primaryGhost} onClick={() => setTool(tool === "edit" ? null : "edit")}>
                        {tool === "edit" ? "접기" : "여기서 본문 고치기 →"}
                      </button>
                    )}
                    {current.resolution?.type === "market_research" && onOpenSection && (
                      <button type="button" className={styles.ghost} onClick={() => onOpenSection("market", "segments")}>공식자료 찾아보기 →</button>
                    )}
                  </div>

                  {tool === "answer" && planId && (
                    <ReviewFollowUp issue={current} planId={planId} onSaved={() => { refresh(); markDone(current.id); }} onClose={() => setTool(null)} />
                  )}
                  {tool === "edit" && planId && current.sectionKey && (
                    <ReviewInlineEdit sectionKey={current.sectionKey} planId={planId} onSaved={() => { refresh(); markDone(current.id); }} onClose={() => setTool(null)} />
                  )}

                  {/* 자세한 설명은 눌러야 나온다 — 카드에 글이 많으면 아무도 안 읽는다 */}
                  {(current.whyItMatters || current.evidence.length > 0) && (
                    <details className={styles.more}>
                      <summary>왜 중요한지 · 판단 근거</summary>
                      {current.whyItMatters && <p className={styles.cardBody}>{current.whyItMatters}</p>}
                      {current.evidence.length > 0 && <p className={styles.evidence}>근거 · {current.evidence.join(" / ")}</p>}
                      {current.sectionKey && onOpenSection && current.resolution?.type !== "market_research" && (
                        <button
                          type="button"
                          className={styles.link}
                          onClick={() => {
                            const [chapterId, sectionId] = current.sectionKey!.split("/");
                            if (chapterId && sectionId) onOpenSection(chapterId, sectionId);
                          }}
                        >
                          질문부터 다시 답하기
                        </button>
                      )}
                      {current.resolution?.type === "manual_edit" && onOpenDocument && (
                        <button type="button" className={styles.link} onClick={onOpenDocument}>문서 편집기에서 보기</button>
                      )}
                    </details>
                  )}
                </article>
              )}

              <div className={styles.nav}>
                <button type="button" className={styles.navBtn} onClick={() => go(step - 1)} disabled={step === 0}>
                  <ArrowLeft size={14} /> 이전
                </button>
                <button type="button" className={styles.link} onClick={() => markDone(current!.id)} disabled={!current || resolved.includes(current.id)}>
                  나중에 하기
                </button>
                <button type="button" className={styles.navBtn} onClick={() => go(step + 1)} disabled={step >= issues.length - 1}>
                  다음 <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* 3. 나머지는 접어 둔다 — 점수 상세·잘된 점·총평 */}
          <button type="button" className={`${styles.detailToggle} ${detail ? styles.detailOpen : ""}`} onClick={() => setDetail((v) => !v)}>
            <ChevronDown size={15} /> {detail ? "자세한 결과 접기" : "점수 자세히 보기"}
            {review.strengths.length > 0 && !detail ? <em>잘된 점 {review.strengths.length}개</em> : null}
          </button>

          {detail && (
            <div className={styles.detailBody}>
              {review.summary && <p className={styles.note}>{review.summary}</p>}

              {review.dimensions.length > 0 && (
                <div className={styles.dims}>
                  {review.dimensions.map((d) => {
                    /* 색만으로는 구분이 어렵다(사용자 지적) — 등급을 말로도 적고 테두리를 준다 */
                    const grade = d.score <= 1.5 ? "취약" : d.score <= 3 ? "보완 필요" : "좋음";
                    const tone = d.score <= 1.5 ? styles.dimBad : d.score <= 3 ? styles.dimLow : styles.dimGood;
                    return (
                      <div key={d.id} className={`${styles.dim} ${tone}`}>
                        <span className={styles.dimLabel}>{d.label}</span>
                        <span className={styles.dimBar}>
                          <span className={styles.dimFill} style={{ width: `${(d.score / 5) * 100}%` }} />
                        </span>
                        <span className={styles.dimScore}>{d.score}<i>/5</i></span>
                        <span className={styles.dimGrade}>{grade}</span>
                        {d.reason && <span className={styles.dimReason}>{d.reason}</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              {review.strengths.length > 0 && (
                <div className={styles.strengths}>
                  {review.strengths.map((s) => (
                    <div key={s} className={styles.strength}>✓ {s}</div>
                  ))}
                </div>
              )}
            </div>
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
