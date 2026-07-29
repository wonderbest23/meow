"use client";

import { useMemo, useState } from "react";
import { PLAN_BLUEPRINT, sectionKey, type PlanSectionStatus } from "../../lib/plan-builder/blueprint";
import {
  questionsForSection,
  isVisible,
  visibleRequiredCount,
  type QuestionGroup,
  type QuestionDef,
} from "../../lib/plan-builder/questions";
import { saveSection, loadPlan, businessContext } from "../../lib/plan-builder/plan-store";
import styles from "./SectionWizard.module.css";

type AnswerMap = Record<string, unknown>;

const Check = ({ n = 11 }: { n?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={n} height={n}>
    <path d="M5 12.5 10 17l9-11" />
  </svg>
);

const RAIL_ICONS: Record<string, React.ReactElement> = {
  home: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9.5 20v-6h5v6" /></svg>),
  plan: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h6M9.5 16.5h6" /></svg>),
  help: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l1.5-4A8 8 0 1 1 21 12Z" /></svg>),
  team: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6M18 19a5.5 5.5 0 0 0-3-4.9" /></svg>),
  lock: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>),
};

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

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: chapter.id,
          sectionId: section.id,
          answers,
          planTitle,
          business: loadPlan().business,
        }),
      });
      const data = (await res.json()) as { markdown?: string; html?: string; source?: "ai" | "fallback" };
      setGeneratedHtml(data.html ?? "<p>생성에 실패했습니다.</p>");
      setGenSource(data.source ?? null);
      if (data.markdown && data.html) saveSection(key, data.markdown, data.html);
      onComplete?.(chapter.id, section.id, answers);
    } catch {
      setGeneratedHtml("<p>생성 중 오류가 발생했습니다.</p>");
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

  const complete = answeredReq >= totalReq;
  const C = 2 * Math.PI * 15.5;

  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <div className={styles.app}>
          {/* icon rail */}
          <nav className={styles.rail} aria-label="주요 메뉴">
            <div className={styles.logo}>오</div>
            <button className={styles.railBtn} title="홈" onClick={onBack}>{RAIL_ICONS.home}</button>
            <button className={`${styles.railBtn} ${styles.on}`} title="플랜">{RAIL_ICONS.plan}</button>
            <button className={styles.railBtn} title="도움말">{RAIL_ICONS.help}</button>
            <button className={styles.railBtn} title="팀">{RAIL_ICONS.team}</button>
            <div className={styles.railSpring} />
            <button className={`${styles.railBtn} ${styles.railLock}`} title="업그레이드">{RAIL_ICONS.lock}</button>
          </nav>

          {/* chapter nav — 레퍼런스 스타일 */}
          <nav className={styles.nav} aria-label="챕터">
            <button className={styles.navTop} onClick={onBack}>플랜 개요</button>
            <div className={styles.navTabs}>
              <button className={`${styles.navTab} ${styles.navTabOn}`} type="button">목차</button>
              <button className={styles.navTab} type="button" title="준비 중">맞춤 요소</button>
            </div>
            {PLAN_BLUEPRINT.map((ch, ci) => {
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

            <div className={styles.mbody}>
              {generatedHtml ? (
                <>
                  <span className={styles.genBadge}>{genSource === "ai" ? "✨ AI 생성 본문" : "초안(키 미설정 · 폴백)"}</span>
                  <div className={styles.genDoc} dangerouslySetInnerHTML={{ __html: generatedHtml }} />
                </>
              ) : generating ? (
                <div className={styles.thinking}>
                  <div className={styles.spinner} />
                  <div>답변을 바탕으로 <b>{section.title}</b> 본문을 생성하고 있어요…</div>
                </div>
              ) : (
                groups.map((g: QuestionGroup) => (
                  <div key={g.id} className={styles.group}>
                    <div className={styles.gl}><span className={styles.gi}>◆</span>{g.label}</div>
                    {g.questions.filter((q) => isVisible(q, answers)).map((q) => (
                      <div key={q.id} className={styles.q}>
                        <div className={styles.qq}>{q.q}</div>
                        {q.help && <div className={styles.qh}>{q.help}</div>}
                        {renderInput(q, answers[q.id], suggestions[q.id], { setAnswer, toggleMulti, styles })}
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
            </div>

            <div className={styles.foot}>
              {generatedHtml ? (
                <button className={styles.btn} onClick={() => setGeneratedHtml(null)}>← 다시 편집</button>
              ) : (
                <>
                  <button className={styles.btn} onClick={onBack}>← 이전</button>
                  <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => { setAnswers({}); setSuggestions({}); }}>초기화</button>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!complete || generating} onClick={handleGenerate}>
                    {generating ? "생성 중…" : "완료하고 생성 →"}
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
                  <li key={g.id} className={filled ? styles.filled : ""}>
                    <span className={styles.tdot}>{filled && <Check />}</span>
                    <span className={styles.tn}>{g.label}</span>
                    <span className={styles.tc}>{pg.done}/{pg.total}</span>
                  </li>
                );
              })}
            </ul>
            <button className={styles.finish} disabled={!complete || generating || !!generatedHtml} onClick={handleGenerate}>
              <Check n={16} /> {generatedHtml ? "생성 완료" : "완료하고 생성"}
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

function renderInput(
  q: QuestionDef,
  value: unknown,
  suggestions: string[] | undefined,
  ctx: {
    setAnswer: (qid: string, v: unknown) => void;
    toggleMulti: (qid: string, opt: string) => void;
    styles: Record<string, string>;
  }
) {
  const { setAnswer, toggleMulti, styles } = ctx;
  // multi/single with aiSuggest and empty options → 옵션을 AI 추천으로 채움
  const dynamicOptions =
    (q.input.kind === "multi" || q.input.kind === "single") && q.input.options.length === 0 ? suggestions ?? [] : null;

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
      const opts = dynamicOptions ?? q.input.options;
      if (opts.length === 0) return null;
      return (
        <div className={styles.radio}>
          {opts.map((opt) => (
            <button key={opt} className={`${styles.opt} ${value === opt ? styles.on : ""}`} onClick={() => setAnswer(q.id, opt)}>{opt}</button>
          ))}
        </div>
      );
    }
    case "multi": {
      const opts = dynamicOptions ?? q.input.options;
      const arr = Array.isArray(value) ? (value as string[]) : [];
      if (opts.length === 0) return null;
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
