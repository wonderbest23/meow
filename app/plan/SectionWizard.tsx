"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PLAN_BLUEPRINT, chaptersForType, sectionKey, type PlanSectionStatus } from "../../lib/plan-builder/blueprint";
import {
  questionsForSection,
  isVisible,
  visibleRequiredCount,
  type QuestionGroup,
  type QuestionDef,
} from "../../lib/plan-builder/questions";
import {
  saveSection,
  loadState,
  businessContext,
  priorSectionsSummary,
  activePlan,
  loadAnswers,
  saveAnswers,
} from "../../lib/plan-builder/plan-store";
import { FINANCIAL_OVERRIDE_KEY } from "../../lib/plan-builder/financials";
import { findConsistencyIssues, issuesForSection } from "../../lib/plan-builder/consistency";
import ConsistencyPanel from "./ConsistencyPanel";
import FinancialReview from "./FinancialReview";
import styles from "./SectionWizard.module.css";

type AnswerMap = Record<string, unknown>;

const Check = ({ n = 11 }: { n?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={n} height={n}>
    <path d="M5 12.5 10 17l9-11" />
  </svg>
);


/**
 * 컨테이너를 부드럽게 스크롤한다.
 * 네이티브 smooth는 환경에 따라 무시되므로 직접 그린다(동작 보장).
 */
function scrollToElement(container: HTMLElement, el: HTMLElement) {
  const cr = container.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  const raw = container.scrollTop + (er.top - cr.top) - (container.clientHeight - er.height) / 2;
  const target = Math.max(0, Math.min(raw, container.scrollHeight - container.clientHeight));
  const start = container.scrollTop;
  const delta = target - start;
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || Math.abs(delta) < 4) {
    container.scrollTop = target;
    return;
  }
  const duration = Math.min(620, 240 + Math.abs(delta) * 0.45);
  const t0 = performance.now();
  let done = false;
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration);
    container.scrollTop = start + delta * (1 - Math.pow(1 - p, 3)); // easeOutCubic
    if (p < 1) requestAnimationFrame(step);
    else done = true;
  };
  requestAnimationFrame(step);
  // 탭이 백그라운드면 rAF가 돌지 않는다 — 애니메이션은 없더라도 목표 위치에는 도달시킨다
  window.setTimeout(() => {
    if (!done) container.scrollTop = target;
  }, duration + 150);
}

function isAnswered(q: QuestionDef, v: unknown): boolean {
  if (v == null) return false;
  if (q.input.kind === "multi") return Array.isArray(v) && v.length > 0;
  if (q.input.kind === "text") return typeof v === "string" && v.trim().length > 0;
  return typeof v === "string" ? v.length > 0 : Boolean(v);
}

export interface SectionWizardProps {
  chapterId: string;
  sectionId: string;
  statuses?: Record<string, PlanSectionStatus>;
  planTitle?: string;
  planType?: string;
  onBack?: () => void;
  onNavigateSection?: (chapterId: string, sectionId: string) => void;
  onComplete?: (chapterId: string, sectionId: string, answers: AnswerMap) => void;
}

export default function SectionWizard({
  chapterId,
  sectionId,
  statuses = {},
  planTitle = "새 플랜",
  planType = "창업 초기 · 사업계획서",
  onBack,
  onNavigateSection,
  onComplete,
}: SectionWizardProps) {
  /** 이 유형이 채우는 챕터 — 좌측 목차에 이것만 보인다 */
  const chapters = useMemo(() => chaptersForType(planType), [planType]);
  const chapter = PLAN_BLUEPRINT.find((c) => c.id === chapterId) ?? PLAN_BLUEPRINT[0];
  const section = chapter.sections.find((s) => s.id === sectionId) ?? chapter.sections[0];
  const key = sectionKey(chapter.id, section.id);
  const groups = useMemo(() => questionsForSection(key, section.title), [key, section.title]);

  const [answers, setAnswers] = useState<AnswerMap>({});
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [loadingSug, setLoadingSug] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [genSource, setGenSource] = useState<"ai" | "fallback" | null>(null);
  // 생성 중 실시간으로 쌓이는 본문
  const [streamText, setStreamText] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);
  const [editingMd, setEditingMd] = useState<string | null>(null);
  const [savedMd, setSavedMd] = useState<string>("");
  // 재무 수치 검토에서 사용자가 고친 값 (질문 섹션이 아니라 별도 키에 저장)
  const [finOverrides, setFinOverrides] = useState<AnswerMap>({});
  // 플랜 전체 답변 스냅샷 — 재무 입력이 다른 섹션에 흩어져 있어 함께 필요하다.
  // 렌더 중 저장소를 읽으면 서버 렌더와 어긋나므로 진입 후 상태로 채운다.
  const [planAnswers, setPlanAnswers] = useState<Record<string, Record<string, unknown>>>({});
  // 생성을 시도했는데 빈 필수 항목이 있을 때만 빨갛게 표시한다(처음부터 겁주지 않는다)
  const [showMissing, setShowMissing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 섹션 진입 시: 저장된 답변 복원 + 이미 생성된 본문이 있으면 표시
  useEffect(() => {
    const p = activePlan();
    setAnswers(loadAnswers(key));
    setFinOverrides(loadAnswers(FINANCIAL_OVERRIDE_KEY));
    setPlanAnswers(p?.answers ?? {});
    const stored = p?.sections[key];
    if (stored) {
      setGeneratedHtml(stored.html);
      setSavedMd(stored.markdown);
      setGenSource("ai");
    } else {
      setGeneratedHtml(null);
      setSavedMd("");
      setGenSource(null);
    }
    setEditingMd(null);
    setShowMissing(false);
  }, [key]);

  // 답변 변경 시 자동 저장(디바운스) — 새로고침·이동해도 유실되지 않게
  const hydratedKey = useRef<string | null>(null);
  useEffect(() => {
    // 섹션 전환 직후 첫 렌더(복원값)는 저장하지 않는다
    if (hydratedKey.current !== key) {
      hydratedKey.current = key;
      return;
    }
    const t = setTimeout(() => saveAnswers(key, answers), 500);
    return () => clearTimeout(t);
  }, [answers, key]);

  // 글이 쌓이는 동안 항상 마지막 줄이 보이게
  useEffect(() => {
    if (!streamText) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  const setAnswer = (qid: string, v: unknown) => setAnswers((prev) => ({ ...prev, [qid]: v }));
  const toggleMulti = (qid: string, opt: string) =>
    setAnswers((prev) => {
      const cur = Array.isArray(prev[qid]) ? (prev[qid] as string[]) : [];
      return { ...prev, [qid]: cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt] };
    });

  // 사업 정보 + 지금까지의 답변을 AI 맥락 문자열로
  function buildContext(): string {
    const parts: string[] = [];
    const biz = businessContext();
    if (biz) parts.push(`[사업 정보]\n${biz}`);
    const lines: string[] = [];
    for (const g of groups) {
      for (const q of g.questions) {
        const v = answers[q.id];
        if (v == null || v === "") continue;
        lines.push(`- ${q.q} → ${Array.isArray(v) ? v.join(", ") : String(v)}`);
      }
    }
    if (lines.length) parts.push(`[이 섹션에서 답한 내용]\n${lines.join("\n")}`);
    const prior = priorSectionsSummary(key);
    if (prior) parts.push(`[앞서 작성한 내용 요약]\n${prior}`);
    return parts.join("\n\n");
  }

  async function loadSuggest(q: QuestionDef) {
    setLoadingSug((p) => ({ ...p, [q.id]: true }));
    try {
      const res = await fetch("/api/plan/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.q, help: q.help, context: buildContext(), count: 4 }),
      });
      const data = (await res.json()) as { suggestions?: string[] };
      setSuggestions((p) => ({ ...p, [q.id]: data.suggestions ?? [] }));
    } catch {
      setSuggestions((p) => ({ ...p, [q.id]: ["(추천을 불러오지 못했습니다 — 직접 입력해주세요)"] }));
    } finally {
      setLoadingSug((p) => ({ ...p, [q.id]: false }));
    }
  }

  /** 재무 검토에서 고친 값을 즉시 저장한다 — 생성 시 원문 파싱값보다 우선 적용된다. */
  function setFinOverride(fieldId: string, value: string) {
    setFinOverrides((prev) => {
      const next = { ...prev, [fieldId]: value };
      saveAnswers(FINANCIAL_OVERRIDE_KEY, next);
      return next;
    });
  }

  /** 생성 시점에 쓰는 플랜 전체 답변 — 저장소의 최신 값 + 편집 중인 답변·보정값 */
  function mergedAnswers(): Record<string, Record<string, unknown>> {
    return {
      ...(activePlan()?.answers ?? {}),
      [key]: answers,
      [FINANCIAL_OVERRIDE_KEY]: finOverrides,
    };
  }

  /** 본문을 실시간으로 받아 화면에 쌓는다. */
  async function handleGenerate() {
    setGenerating(true);
    setStreamText("");
    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: chapter.id,
          sectionId: section.id,
          answers,
          planTitle,
          planType,
          business: loadState().business,
          priorSummary: priorSectionsSummary(key),
          // 재무 입력이 여러 섹션에 흩어져 있어 전체 답변을 함께 보낸다(현재 섹션 답변·보정값 포함).
          allAnswers: mergedAnswers(),
          stream: true,
        }),
      });

      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let finished: { markdown?: string; html?: string; source?: "ai" | "fallback" } | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: { t?: string; v?: string; markdown?: string; html?: string; source?: "ai" | "fallback" };
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.t === "delta" && msg.v) {
            acc += msg.v;
            setStreamText(acc);
          } else if (msg.t === "done") {
            finished = msg;
          }
        }
      }

      if (finished?.markdown && finished.html) {
        setGeneratedHtml(finished.html);
        setGenSource(finished.source ?? null);
        saveSection(key, finished.markdown, finished.html);
        setSavedMd(finished.markdown);
        onComplete?.(chapter.id, section.id, answers);
      } else {
        setGeneratedHtml("<p>생성에 실패했습니다.</p>");
      }
    } catch {
      setGeneratedHtml("<p>생성 중 오류가 발생했습니다.</p>");
    } finally {
      setGenerating(false);
      setStreamText("");
    }
  }

  /** 직접 수정한 마크다운을 저장 (HTML은 서버에서 다시 렌더) */
  async function saveEdited() {
    const md = (editingMd ?? "").trim();
    if (!md) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/plan/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: md }),
      });
      const data = (await res.json()) as { html?: string };
      const html = data.html ?? md.replace(/\n/g, "<br>");
      saveSection(key, md, html);
      setSavedMd(md);
      setGeneratedHtml(html);
      setEditingMd(null);
    } catch {
      alert("저장에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  const { answeredReq, totalReq, pct, perGroup } = useMemo(() => {
    const totalReq = visibleRequiredCount(groups, answers);
    let answeredReq = 0;
    const perGroup: Record<string, { done: number; total: number }> = {};
    for (const g of groups) {
      let gd = 0;
      let gt = 0;
      for (const q of g.questions) {
        if (q.optional || !isVisible(q, answers)) continue;
        gt += 1;
        if (isAnswered(q, answers[q.id])) {
          gd += 1;
          answeredReq += 1;
        }
      }
      perGroup[g.id] = { done: gd, total: gt };
    }
    return { answeredReq, totalReq, pct: totalReq ? Math.round((answeredReq / totalReq) * 100) : 100, perGroup };
  }, [groups, answers]);

  // 검토 패널이 볼 답변 — 상태만으로 만들어 서버/클라이언트 첫 렌더가 일치한다.
  const reviewAnswers = useMemo(
    () => ({ ...planAnswers, [key]: answers, [FINANCIAL_OVERRIDE_KEY]: finOverrides }),
    [planAnswers, key, answers, finOverrides],
  );

  // 이 섹션이 걸려 있는 모순만 추린다 — 다른 챕터 이야기로 주의를 뺏지 않는다.
  const sectionIssues = useMemo(
    () => issuesForSection(findConsistencyIssues(reviewAnswers), key),
    [reviewAnswers, key],
  );

  const complete = answeredReq >= totalReq;

  /** 아직 답하지 않은 필수 질문 id — 화면 순서대로 */
  const missingIds = useMemo(() => {
    const out: string[] = [];
    for (const g of groups) {
      for (const q of g.questions) {
        if (q.optional || !isVisible(q, answers)) continue;
        if (!isAnswered(q, answers[q.id])) out.push(q.id);
      }
    }
    return out;
  }, [groups, answers]);

  /** 다 채웠으면 생성, 아니면 첫 빈 항목으로 데려간다. */
  function attemptGenerate() {
    if (complete) {
      setShowMissing(false);
      void handleGenerate();
      return;
    }
    setShowMissing(true);
    const first = missingIds[0];
    if (!first) return;
    // 표시가 반영된 뒤 이동한다 (rAF는 백그라운드 탭에서 멈추므로 타이머를 쓴다)
    window.setTimeout(() => {
      const container = bodyRef.current;
      const el = container?.querySelector<HTMLElement>(`[data-qid="${first}"]`);
      if (!container || !el) return;
      scrollToElement(container, el);
      el.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true });
    }, 0);
  }

  const C = 2 * Math.PI * 15.5;

  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <div className={styles.app}>

          {/* chapter nav — 레퍼런스 스타일 */}
          <nav className={styles.nav} aria-label="챕터">
            <button className={styles.navTop} onClick={onBack}>플랜 개요</button>
            <div className={styles.navTabs}>
              <button className={`${styles.navTab} ${styles.navTabOn}`} type="button">목차</button>
              <button className={styles.navTab} type="button" title="준비 중">맞춤 요소</button>
            </div>
            {chapters.map((ch, ci) => {
              const open = ch.id === chapter.id;
              return (
                <div key={ch.id} className={`${styles.chap} ${open ? styles.open : ""}`}>
                  <button className={styles.ch} onClick={() => onNavigateSection?.(ch.id, ch.sections[0].id)}>
                    <span className={styles.cname}>{ch.title}</span>
                    <span className={styles.cnum}>{ci + 1}</span>
                  </button>
                  <div className={styles.secs}>
                    {ch.sections.map((s, si) => {
                      const sk = sectionKey(ch.id, s.id);
                      const done = statuses[sk] === "done";
                      const active = ch.id === chapter.id && s.id === section.id;
                      return (
                        <button key={s.id} className={`${styles.sec} ${done ? styles.done : ""} ${active ? styles.on : ""}`} onClick={() => onNavigateSection?.(ch.id, s.id)}>
                          <span className={styles.secLabel}>
                            <span className={styles.secNo}>{ci + 1}.{si + 1}</span>
                            {s.title}
                          </span>
                          <span className={styles.secDot}>{done && <Check n={11} />}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* main */}
          <section className={styles.main}>
            <div className={styles.mhead}>
              <div className={styles.crumb}>{chapter.title}</div>
              <h1>{section.title}</h1>
              <div className={styles.meters}>
                <div className={styles.mt}><div className={styles.mtL}>유형</div><div className={styles.mtV}>전략</div></div>
                <div className={styles.mt}><div className={styles.mtL}>상태</div><div className={styles.mtV}>{generatedHtml ? "생성 완료" : complete ? "작성 완료" : answeredReq > 0 ? "작성 중" : "시작 전"}</div></div>
                <div className={styles.mt}><div className={styles.mtL}>예상 시간</div><div className={styles.mtV}>{section.estMinutes}분</div></div>
                <div className={styles.mt}><div className={styles.mtL}>진행</div><div className={styles.mtV}><span className={styles.segs}>{[0, 1, 2, 3].map((i) => (<i key={i} className={i < Math.round((pct / 100) * 4) ? styles.f : ""} />))}</span></div></div>
              </div>
            </div>

            <div className={styles.mbody} ref={bodyRef}>
              {editingMd === null && !generatedHtml && !generating && (
                <ConsistencyPanel issues={sectionIssues} onOpenSection={onNavigateSection} compact />
              )}

              {editingMd !== null ? (
                <>
                  <span className={styles.genBadge}>✏️ 직접 편집 (마크다운)</span>
                  <textarea
                    className={styles.mdEditor}
                    value={editingMd}
                    onChange={(e) => setEditingMd(e.target.value)}
                    spellCheck={false}
                  />
                </>
              ) : generatedHtml ? (
                <>
                  <span className={styles.genBadge}>{genSource === "ai" ? "✨ AI 생성 본문" : "초안(키 미설정 · 폴백)"}</span>
                  {/* 본문을 바로 눌러 고칠 수 있게 — 버튼을 찾아 누를 필요가 없다 */}
                  <div
                    className={styles.genDoc}
                    role="button"
                    tabIndex={0}
                    title="눌러서 바로 수정"
                    onClick={() => setEditingMd(savedMd)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setEditingMd(savedMd);
                    }}
                    dangerouslySetInnerHTML={{ __html: generatedHtml }}
                  />
                  <p className={styles.editHint}>✏️ 본문을 누르면 바로 고칠 수 있어요.</p>
                </>
              ) : generating ? (
                <div className={styles.writing}>
                  <span className={styles.genBadge}>✍️ {section.title} 작성 중…</span>
                  {streamText ? (
                    <div className={styles.streamDoc} ref={streamRef}>
                      {streamText}
                      <span className={styles.caret} aria-hidden="true" />
                    </div>
                  ) : (
                    <div className={styles.thinking}>
                      <div className={styles.spinner} />
                      <div>답변을 정리하고 있어요…</div>
                    </div>
                  )}
                </div>
              ) : (
                groups.map((g: QuestionGroup) => (
                  <div key={g.id} className={styles.group}>
                    <div className={styles.gl}><span className={styles.gi}>◆</span>{g.label}</div>
                    {g.questions.filter((q) => isVisible(q, answers)).map((q) => (
                      <div
                        key={q.id}
                        data-qid={q.id}
                        className={`${styles.q} ${q.showWhen ? styles.qSub : ""} ${showMissing && missingIds.includes(q.id) ? styles.qMissing : ""}`}
                      >
                        <div className={styles.qq}>
                          {q.q}
                          {showMissing && missingIds.includes(q.id) && <span className={styles.needTag}>입력이 필요합니다</span>}
                        </div>
                        {q.help && <div className={styles.qh}>{q.help}</div>}
                        {renderInput(q, answers[q.id], { setAnswer, toggleMulti, styles })}
                        {q.aiSuggest && (
                          <AISuggest
                            q={q}
                            loading={!!loadingSug[q.id]}
                            list={suggestions[q.id]}
                            onLoad={() => loadSuggest(q)}
                            onPick={(text) => {
                              if (q.input.kind === "text") setAnswer(q.id, text);
                              else if (q.input.kind === "multi") toggleMulti(q.id, text);
                              else setAnswer(q.id, text);
                            }}
                            styles={styles}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}

              {/* 재무 챕터에서는 인식한 숫자와 계산 결과를 항상 확인할 수 있게 한다 */}
              {chapter.id === "financials" && editingMd === null && !generatedHtml && !generating && (
                <FinancialReview allAnswers={reviewAnswers} onOverride={setFinOverride} />
              )}
            </div>

            <div className={styles.foot}>
              {editingMd !== null ? (
                <>
                  <button className={styles.btn} onClick={() => setEditingMd(null)}>취소</button>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={generating} onClick={saveEdited}>
                    {generating ? "저장 중…" : "저장"}
                  </button>
                </>
              ) : generatedHtml ? (
                <>
                  <button className={styles.btn} onClick={() => setGeneratedHtml(null)}>← 답변 수정</button>
                  <button className={styles.btn} onClick={() => setEditingMd(savedMd)}>✏️ 직접 편집</button>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={generating} onClick={handleGenerate}>
                    {generating ? "생성 중…" : "🔄 다시 생성"}
                  </button>
                </>
              ) : (
                <>
                  <button className={styles.btn} onClick={onBack}>← 이전</button>
                  <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => { setAnswers({}); setSuggestions({}); saveAnswers(key, {}); }}>초기화</button>
                  <button
                    className={`${styles.btn} ${styles.btnPrimary} ${!complete ? styles.btnWaiting : ""}`}
                    disabled={generating}
                    onClick={attemptGenerate}
                  >
                    {generating ? "생성 중…" : complete ? "완료하고 생성 →" : `${totalReq - answeredReq}개 남음`}
                  </button>
                </>
              )}
            </div>
          </section>

          {/* tracker */}
          <aside className={styles.tracker}>
            <div className={styles.tpH}>이 섹션 진행률</div>
            <div className={styles.ring}>
              <svg viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--wz-track)" strokeWidth="4" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--wz-brand)" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100} transform="rotate(-90 18 18)" />
              </svg>
              <div><div className={styles.rt}>{pct}%</div><div className={styles.rl}>{answeredReq} / {totalReq} 문항</div></div>
            </div>
            <div className={styles.tpH}>항목</div>
            <ul className={styles.trackList}>
              {groups.map((g) => {
                const pg = perGroup[g.id] ?? { done: 0, total: 0 };
                const filled = pg.total > 0 && pg.done >= pg.total;
                return (
                  <li key={g.id} className={`${filled ? styles.filled : ""} ${showMissing && !filled ? styles.trackMissing : ""}`}>
                    <span className={styles.tdot}>{filled && <Check />}</span>
                    <span className={styles.tn}>{g.label}</span>
                    <span className={styles.tc}>{pg.done}/{pg.total}</span>
                  </li>
                );
              })}
            </ul>
            <button
              className={`${styles.finish} ${!complete && !generatedHtml ? styles.finishWaiting : ""}`}
              disabled={generating || !!generatedHtml}
              onClick={attemptGenerate}
            >
              <Check n={16} /> {generatedHtml ? "생성 완료" : complete ? "완료하고 생성" : `${totalReq - answeredReq}개 더 답하기`}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function AISuggest({
  q,
  loading,
  list,
  onLoad,
  onPick,
  styles,
}: {
  q: QuestionDef;
  loading: boolean;
  list?: string[];
  onLoad: () => void;
  onPick: (text: string) => void;
  styles: Record<string, string>;
}) {
  return (
    <div>
      {!list && (
        <button className={styles.suggestBtn} disabled={loading} onClick={onLoad}>
          ✨ {loading ? "추천 불러오는 중…" : "AI 추천 받기"}
        </button>
      )}
      {list && list.length > 0 && (
        <div className={styles.sugList}>
          {list.map((s, i) => (
            <button key={i} className={styles.sugCard} onClick={() => onPick(s)}>
              {s}
            </button>
          ))}
          <button className={styles.suggestBtn} disabled={loading} onClick={onLoad}>
            ✨ {loading ? "다시 불러오는 중…" : "다른 추천 받기"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 정해진 보기가 없는 질문(상품 분류·문제·세그먼트 등).
 * 예전에는 AI 추천이 오기 전까지 아무것도 없어서 손을 댈 수 없었다.
 * 이제 직접 적어 넣을 수 있고, AI 추천은 아래에서 골라 더할 수 있다.
 */
function FreeChoice({
  value,
  multi,
  placeholder,
  onChange,
  styles,
}: {
  value: unknown;
  multi: boolean;
  placeholder: string;
  onChange: (v: unknown) => void;
  styles: Record<string, string>;
}) {
  const [draft, setDraft] = useState("");
  const picked = multi
    ? Array.isArray(value)
      ? (value as string[])
      : []
    : typeof value === "string" && value
      ? [value]
      : [];

  function add() {
    const t = draft.trim();
    if (!t) return;
    if (multi) {
      if (!picked.includes(t)) onChange([...picked, t]);
    } else {
      onChange(t);
    }
    setDraft("");
  }
  function remove(v: string) {
    if (multi) onChange(picked.filter((x) => x !== v));
    else onChange("");
  }

  return (
    <div className={styles.free}>
      {picked.length > 0 && (
        <div className={styles.freeChips}>
          {picked.map((v) => (
            <span key={v} className={styles.freeChip}>
              {v}
              <button type="button" onClick={() => remove(v)} aria-label={`${v} 빼기`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className={styles.freeRow}>
        <input
          className={styles.txt}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className={styles.freeAdd} onClick={add} disabled={!draft.trim()}>
          추가
        </button>
      </div>
      <p className={styles.freeHint}>
        직접 적어 넣거나, 아래 <b>AI 추천</b>에서 골라 더할 수 있어요.
      </p>
    </div>
  );
}

function renderInput(
  q: QuestionDef,
  value: unknown,
  ctx: {
    setAnswer: (qid: string, v: unknown) => void;
    toggleMulti: (qid: string, opt: string) => void;
    styles: Record<string, string>;
  }
) {
  const { setAnswer, toggleMulti, styles } = ctx;

  switch (q.input.kind) {
    case "yesno":
      return (
        <div className={styles.yn}>
          {["예", "아니오"].map((label, i) => {
            const val = i === 0 ? "yes" : "no";
            return (
              <button key={val} className={`${styles.opt} ${value === val ? styles.on : ""}`} onClick={() => setAnswer(q.id, val)}>
                {label}
              </button>
            );
          })}
        </div>
      );
    case "single": {
      const opts = q.input.options;
      if (opts.length === 0) {
        return <FreeChoice value={value} multi={false} placeholder="직접 입력하고 Enter" onChange={(v) => setAnswer(q.id, v)} styles={styles} />;
      }
      return (
        <div className={styles.radio}>
          {opts.map((opt) => (
            <button key={opt} className={`${styles.opt} ${value === opt ? styles.on : ""}`} onClick={() => setAnswer(q.id, opt)}>{opt}</button>
          ))}
        </div>
      );
    }
    case "multi": {
      const opts = q.input.options;
      const arr = Array.isArray(value) ? (value as string[]) : [];
      if (opts.length === 0) {
        return <FreeChoice value={value} multi placeholder="직접 입력하고 Enter" onChange={(v) => setAnswer(q.id, v)} styles={styles} />;
      }
      return (
        <div className={styles.chk}>
          {opts.map((opt) => (
            <button key={opt} className={`${styles.opt} ${arr.includes(opt) ? styles.on : ""}`} onClick={() => toggleMulti(q.id, opt)}>
              <span className={styles.box}><Check n={12} /></span>
              {opt}
            </button>
          ))}
        </div>
      );
    }
    case "select":
      return (
        <div className={styles.radio}>
          {q.input.options.map((opt) => (
            <button key={opt} className={`${styles.opt} ${value === opt ? styles.on : ""}`} onClick={() => setAnswer(q.id, opt)}>{opt}</button>
          ))}
        </div>
      );
    case "text":
      return q.input.long ? (
        <textarea className={styles.txt} rows={3} placeholder={q.input.placeholder} value={typeof value === "string" ? value : ""} onChange={(e) => setAnswer(q.id, e.target.value)} />
      ) : (
        <input className={styles.txt} placeholder={q.input.placeholder} value={typeof value === "string" ? value : ""} onChange={(e) => setAnswer(q.id, e.target.value)} />
      );
    default:
      return null;
  }
}
