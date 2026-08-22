"use client";

/*
 * /plan/analyze — AI 사업 분석 → 이해 확인(VERIFY) → 동적 질문(최대 4개 × 2라운드) → 준비 완료.
 *
 * 기존 시스템 앞단에 얹는 "빠른 길"이다.
 *  - 결과는 plan.answers["__analysis"] 와, mapsTo 가 있는 답은 기존 답변 칸에도 기록된다.
 *  - 어느 단계에서 실패해도 "직접 입력해서 계속하기"로 기존 위저드(/plan/overview)로 간다.
 *  - inferred 값은 [맞아요]를 누르기 전까지 기존 답변 칸에 절대 쓰지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { activePlan, hydrateFromServer, loadState, saveAnswers, saveBusiness, isSamplePlan } from "../../../lib/plan-builder/plan-store";
import {
  ANALYSIS_KEY,
  PRIMARY_INDUSTRIES,
  VERIFY_FIELDS,
  readAnalysisRecord,
  type AnalysisRecord,
  type BusinessAnalysis,
  type SlotAnswer,
} from "../../../lib/plan-builder/analyzer/domain";
import { analyzeGaps, applyAnalysisToAnswers, applySlotAnswer, numericSlots, shouldContinue, MAX_ROUNDS } from "../../../lib/plan-builder/analyzer/gap";
import { parseAmount } from "../../../lib/plan-builder/financials";
import type { DynamicQuestion } from "../../../lib/plan-builder/analyzer/question-generator";
import PlanLoading from "../PlanLoading";
import styles from "./AnalyzeFlow.module.css";

type Phase = "loading" | "analyzing" | "verify" | "round" | "derive" | "done" | "failed";
type Answers = Record<string, Record<string, unknown>>;

/** 변경된 섹션만 저장한다 — 저장 경로는 기존 plan-store 하나 */
function commitAnswers(prev: Answers, next: Answers, planId: string) {
  for (const key of Object.keys(next)) {
    if (prev[key] !== next[key]) saveAnswers(key, next[key], planId);
  }
}

function fieldText(a: BusinessAnalysis, key: keyof BusinessAnalysis): string {
  const f = a[key] as { value: unknown };
  if (Array.isArray(f.value)) return f.value.join(" · ");
  return typeof f.value === "string" ? f.value : "";
}

export default function AnalyzeFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [planId, setPlanId] = useState<string | null>(null);
  const [record, setRecord] = useState<AnalysisRecord | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [failReason, setFailReason] = useState<string>("");
  const answersRef = useRef<Answers>({});
  answersRef.current = answers;

  /* VERIFY 편집 상태 */
  const [editing, setEditing] = useState<Record<string, string>>({});
  /* 라운드 상태 */
  const [round, setRound] = useState(1);
  const [intro, setIntro] = useState("");
  const [questions, setQuestions] = useState<DynamicQuestion[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [unknownSet, setUnknownSet] = useState<Set<string>>(new Set());
  const [completeness, setCompleteness] = useState(0);
  const [loadingQ, setLoadingQ] = useState(false);
  /* 파생 판매량 */
  const [derived, setDerived] = useState<{ value: number; formula: string } | null>(null);
  const [deriveInput, setDeriveInput] = useState("");

  const persistRecord = useCallback(
    (rec: AnalysisRecord, pid: string) => {
      setRecord(rec);
      saveAnswers(ANALYSIS_KEY, rec as unknown as Record<string, unknown>, pid);
    },
    [],
  );

  /* 진입 — 활성 플랜 확인, 저장된 분석이 있으면 이어서 */
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await hydrateFromServer().catch(() => loadState());
      if (!alive) return;
      const p = activePlan(s);
      if (!p || isSamplePlan(p.id)) {
        router.replace("/plan/overview");
        return;
      }
      setPlanId(p.id);
      setAnswers(p.answers ?? {});
      const saved = readAnalysisRecord(p.answers);
      if (saved) {
        setRecord(saved);
        if (saved.finished) setPhase("done");
        else if (saved.rounds === 0) setPhase("verify");
        else {
          setRound(Math.min(MAX_ROUNDS, saved.rounds + 1));
          setPhase("round");
        }
        return;
      }
      // 새 분석
      setPhase("analyzing");
      try {
        const res = await fetch("/api/plan/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: s.business.description,
            name: s.business.name,
            industry: s.business.industry,
            region: s.business.region,
            stage: s.business.stage,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; analysis?: BusinessAnalysis; reason?: string };
        if (!alive) return;
        if (!data.ok || !data.analysis) {
          setFailReason(data.reason ?? "analysis_failed");
          setPhase("failed");
          return;
        }
        const rec: AnalysisRecord = { analysis: data.analysis, slots: {}, rounds: 0, finished: false, analyzedAt: new Date().toISOString() };
        persistRecord(rec, p.id);
        setPhase("verify");
      } catch {
        if (!alive) return;
        setFailReason("network");
        setPhase("failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, [router, persistRecord]);

  /* ───── VERIFY ───── */
  const verifyRows = useMemo(() => {
    if (!record) return [];
    return VERIFY_FIELDS.map((f) => ({ ...f, text: fieldText(record.analysis, f.key), status: (record.analysis[f.key] as { status: string }).status })).filter((r) => r.text);
  }, [record]);

  function confirmField(key: keyof BusinessAnalysis, value?: string) {
    if (!record || !planId) return;
    const a = { ...record.analysis };
    const cur = a[key] as { value: unknown; status: string };
    if (value != null) {
      const v = value.trim();
      if (!v) return;
      const isArr = Array.isArray(cur.value) || key === "acquisitionChannels";
      (a as Record<string, unknown>)[key] = { value: isArr ? v.split(/[,·/]/).map((x) => x.trim()).filter(Boolean) : v, status: "confirmed" };
    } else {
      (a as Record<string, unknown>)[key] = { ...cur, status: "confirmed" };
    }
    persistRecord({ ...record, analysis: a }, planId);
    setEditing((e) => {
      const n = { ...e };
      delete n[key];
      return n;
    });
  }

  async function finishVerify() {
    if (!record || !planId) return;
    // confirmed 만 기존 답변 칸으로 — inferred 는 __analysis 에만 남는다
    const next = applyAnalysisToAnswers(answersRef.current, record.analysis);
    commitAnswers(answersRef.current, next, planId);
    setAnswers(next);
    // 업종을 AI가 맞혔고 사용자가 확인했으면 사업 정보의 빈 업종도 채운다
    const s = loadState();
    if (!s.business.industry && record.analysis.primary.status === "confirmed" && record.analysis.primary.value) {
      saveBusiness({ ...s.business, industry: record.analysis.primary.value });
    }
    setRound(1);
    setPhase("round");
  }

  /* ───── 질문 라운드 ───── */
  const fetchQuestions = useCallback(
    async (rec: AnalysisRecord, ans: Answers, r: number) => {
      setLoadingQ(true);
      setQuestions([]);
      setDraft({});
      setUnknownSet(new Set());
      try {
        const res = await fetch("/api/plan/questions/next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysis: rec.analysis, slots: rec.slots, answers: ans, round: r }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; intro?: string; questions?: DynamicQuestion[]; completeness?: number };
        if (!data.ok) throw new Error("questions_failed");
        setIntro(data.intro ?? "");
        setQuestions(data.questions ?? []);
        setCompleteness(data.completeness ?? 0);
        if (!data.questions?.length) goDerive(rec, ans);
      } catch {
        // 질문을 못 받아도 막히지 않는다 — 지금 정보로 마무리
        goDerive(rec, ans);
      } finally {
        setLoadingQ(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (phase === "round" && record) void fetchQuestions(record, answersRef.current, round);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  function toggleUnknown(id: string) {
    setUnknownSet((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else {
        n.add(id);
        setDraft((d) => {
          const c = { ...d };
          delete c[id];
          return c;
        });
      }
      return n;
    });
  }

  const answeredCount = questions.filter((q) => unknownSet.has(q.id) || (draft[q.id] ?? "").trim()).length;

  function submitRound(force = false) {
    if (!record || !planId) return;
    const report0 = analyzeGaps(record, answersRef.current);
    const slots: Record<string, SlotAnswer> = { ...record.slots };
    let next = answersRef.current;
    for (const q of questions) {
      if (unknownSet.has(q.id)) {
        slots[q.id] = { value: null, status: "unknown" };
        continue;
      }
      const v = (draft[q.id] ?? "").trim();
      if (!v) continue; // 비워 두면 다음 라운드에 다시 물을 수 있다
      slots[q.id] = { value: v, status: "confirmed" };
      next = applySlotAnswer(next, report0.pack, q.id, v);
    }
    commitAnswers(answersRef.current, next, planId);
    setAnswers(next);
    const rec: AnalysisRecord = { ...record, slots, rounds: round };
    persistRecord(rec, planId);
    const report = analyzeGaps(rec, next);
    if (!force && shouldContinue(rec, report)) {
      setRound(round + 1);
      // phase 가 이미 round 면 effect 가 round 변경으로 다시 돈다
    } else {
      goDerive(rec, next);
    }
  }

  /* ───── 파생 판매량 ───── */
  function goDerive(rec: AnalysisRecord, ans: Answers) {
    const report = analyzeGaps(rec, ans);
    const already = ans["financials/revenue"]?.monthly_volume;
    const d = report.pack.deriveVolume?.(numericSlots(rec.slots)) ?? null;
    if (d && !already) {
      setDerived(d);
      setDeriveInput(String(d.value));
      setPhase("derive");
      return;
    }
    finishAll(rec);
  }

  function acceptDerived(value: string) {
    if (!record || !planId) return;
    const n = parseAmount(value);
    if (n) {
      const next: Answers = { ...answersRef.current, "financials/revenue": { ...(answersRef.current["financials/revenue"] ?? {}), monthly_volume: `월 ${n}건` } };
      commitAnswers(answersRef.current, next, planId);
      setAnswers(next);
    }
    finishAll(record);
  }

  function finishAll(rec: AnalysisRecord) {
    if (!planId) return;
    const done: AnalysisRecord = { ...rec, finished: true };
    persistRecord(done, planId);
    setPhase("done");
  }

  /* ───── 렌더 ───── */
  const stepIdx = phase === "verify" ? 1 : phase === "round" || phase === "derive" ? 2 : phase === "done" ? 3 : 0;
  const Steps = (
    <div className={styles.steps}>
      {["AI 분석", "이해 확인", "몇 가지 질문", "준비 완료"].map((t, i) => (
        <div key={t} style={{ display: "contents" }}>
          {i > 0 && <div className={styles.stepBar} />}
          <div className={`${styles.step} ${i === stepIdx ? styles.stepOn : i < stepIdx ? styles.stepDone : ""}`}>
            <span className={styles.stepNum}>{i < stepIdx ? "✓" : i + 1}</span> {t}
          </div>
        </div>
      ))}
    </div>
  );

  const Head = (
    <div className={styles.headRow}>
      <button type="button" className={styles.backBtn} onClick={() => router.push("/plan/overview")} aria-label="플랜 개요로" title="플랜 개요로">←</button>
      <h1 className={styles.h1}>AI와 사업 정리하기</h1>
    </div>
  );

  if (phase === "loading" || phase === "analyzing") {
    return (
      <div className={styles.page}><div className={styles.frame}><div className={styles.main}>
        {Head}
        {Steps}
        <PlanLoading variant="deck" count={3} note={phase === "analyzing" ? "사업 설명을 읽고 구조를 분석하는 중…" : "준비하는 중…"} />
      </div></div></div>
    );
  }

  if (phase === "failed" || !record) {
    return (
      <div className={styles.page}><div className={styles.frame}><div className={styles.main}>
        {Head}
        <div className={styles.fail}>
          <b>AI 분석을 완료하지 못했어요.</b>
          <br />
          {failReason === "no_llm" ? "AI 연결이 준비되지 않았습니다." : "잠시 후 다시 시도하거나, 직접 정보를 입력해서 계속할 수 있습니다."}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} onClick={() => router.push("/plan/overview")}>직접 입력해서 계속하기 →</button>
          <button type="button" className={styles.ghostBtn} onClick={() => window.location.reload()}>다시 분석하기</button>
        </div>
      </div></div></div>
    );
  }

  const a = record.analysis;

  return (
    <div className={styles.page}><div className={styles.frame}><div className={styles.main}>
      {Head}
      {Steps}

      {phase === "verify" && (
        <>
          <div className={styles.kicker}><Sparkles size={12} style={{ verticalAlign: -2 }} /> 이해 확인</div>
          <p className={styles.lead}>말씀해주신 내용을 이렇게 이해했어요.</p>
          <div className={styles.summary}>{a.summaryForUser}</div>
          <p className={styles.sub}>맞으면 <b>맞아요</b>, 다르면 <b>바꿀래요</b>를 눌러 고쳐주세요. 확인한 내용만 사업계획서에 사실로 쓰입니다.</p>
          <div className={styles.verifyList}>
            {verifyRows.map((r) => {
              const ok = r.status === "confirmed";
              const isEditing = r.key in editing;
              return (
                <div key={r.key} className={`${styles.verifyRow} ${ok ? styles.ok : ""}`}>
                  <span className={styles.verifyLabel}>{r.label}</span>
                  <span className={styles.verifyValue}>
                    {r.text}
                    {!ok && <small>AI가 추측한 내용이에요</small>}
                  </span>
                  <span className={styles.verifyBtns}>
                    <button type="button" className={`${styles.chip} ${ok ? styles.chipOk : ""}`} onClick={() => confirmField(r.key)}>{ok ? "✓ 확인됨" : "맞아요"}</button>
                    <button type="button" className={`${styles.chip} ${isEditing ? styles.chipOn : ""}`} onClick={() => setEditing((e) => ({ ...e, [r.key]: r.text }))}>바꿀래요</button>
                  </span>
                  {isEditing && (
                    <div className={styles.editBox}>
                      {r.key === "primary" ? (
                        <select value={editing[r.key]} onChange={(e) => setEditing((ed) => ({ ...ed, [r.key]: e.target.value }))}>
                          {PRIMARY_INDUSTRIES.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          value={editing[r.key]}
                          onChange={(e) => setEditing((ed) => ({ ...ed, [r.key]: e.target.value }))}
                          placeholder={r.key === "acquisitionChannels" ? "쉼표로 구분 (예: 인스타그램, 유튜브)" : ""}
                          autoFocus
                        />
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className={`${styles.chip} ${styles.chipOn}`} onClick={() => confirmField(r.key, editing[r.key])}>이걸로 할게요</button>
                        <button type="button" className={styles.chip} onClick={() => setEditing((e) => { const n = { ...e }; delete n[r.key]; return n; })}>취소</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primaryBtn} onClick={finishVerify}>다음 — 몇 가지만 더 여쭤볼게요 →</button>
            <button type="button" className={styles.linkBtn} onClick={() => router.push("/plan/overview")}>건너뛰고 직접 작성하기</button>
          </div>
        </>
      )}

      {phase === "round" && (
        <>
          <div className={styles.kicker}>질문 {round} / {MAX_ROUNDS}</div>
          <p className={styles.lead}>{round === 1 ? "조금만 더 알려주세요." : "거의 다 됐어요."}</p>
          <p className={styles.sub}>{intro || "숫자가 있어야 손익을 계산할 수 있어요. 모르는 건 ‘아직 모르겠어요’를 눌러도 괜찮아요."}</p>
          {loadingQ ? (
            <PlanLoading variant="deck" count={2} note="질문을 준비하는 중…" />
          ) : (
            <div className={styles.qList}>
              {questions.map((q, i) => {
                const unk = unknownSet.has(q.id);
                const val = draft[q.id] ?? "";
                return (
                  <div key={q.id} className={`${styles.qCard} ${unk ? styles.unknown : val.trim() ? styles.answered : ""}`}>
                    <div className={styles.qNum}>Q{i + 1} · {q.label}</div>
                    <p className={styles.qText}>{q.q}</p>
                    <p className={styles.qWhy}>{q.why}</p>
                    {!unk && q.input.kind === "single" && (
                      <div className={styles.opts}>
                        {q.input.options.map((o) => (
                          <button key={o} type="button" className={`${styles.chip} ${val === o ? styles.chipOn : ""}`} onClick={() => setDraft((d) => ({ ...d, [q.id]: o }))}>{o}</button>
                        ))}
                      </div>
                    )}
                    {!unk && q.input.kind === "number" && (
                      <>
                        {q.suggestions?.length ? (
                          <div className={styles.opts}>
                            {q.suggestions.map((o) => (
                              <button key={o} type="button" className={`${styles.chip} ${val === o ? styles.chipOn : ""}`} onClick={() => setDraft((d) => ({ ...d, [q.id]: o }))}>{o}</button>
                            ))}
                          </div>
                        ) : null}
                        <div className={styles.numRow}>
                          <input className={styles.input} inputMode="text" placeholder={q.input.hint ?? "직접 입력"} value={val} onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))} />
                          <span className={styles.unit}>{q.input.unit}</span>
                        </div>
                      </>
                    )}
                    {!unk && q.input.kind === "text" && (
                      <textarea className={styles.textarea} placeholder={q.input.placeholder} value={val} onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))} />
                    )}
                    <button type="button" className={`${styles.unknownBtn} ${unk ? styles.on : ""}`} onClick={() => toggleUnknown(q.id)}>
                      {unk ? "✓ 아직 모르겠어요 — 나중에 정할게요 (다시 입력하려면 클릭)" : "아직 모르겠어요"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className={styles.progress}>
            <span>사업 구조 완성도</span>
            <div className={styles.bar}><div className={styles.fill} style={{ width: `${completeness}%` }} /></div>
            <span>{completeness}%</span>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primaryBtn} disabled={loadingQ || (questions.length > 0 && answeredCount === 0)} onClick={() => submitRound()}>
              {answeredCount}/{questions.length} 답함 · 다음 →
            </button>
            <button type="button" className={styles.linkBtn} onClick={() => submitRound(true)}>지금 정보로 작성하기</button>
            <p className={styles.note}>답은 기존 질문 칸에도 그대로 저장돼요. 나중에 ‘더 자세히 작성하기’에서 언제든 고칠 수 있어요.</p>
          </div>
        </>
      )}

      {phase === "derive" && derived && (
        <>
          <div className={styles.kicker}>숫자 확인</div>
          <p className={styles.lead}>답해주신 내용으로 월 판매량을 이렇게 계산했어요.</p>
          <p className={styles.sub}>가정이 들어간 숫자예요. 확인해 주시면 재무 계산에 쓰고, 아니면 직접 고쳐주세요.</p>
          <div className={styles.derive}>
            <b>월 약 {derived.value.toLocaleString("ko-KR")}{record && analyzeGaps(record, answers).pack.id === "class" ? "명" : "건"}</b>
            <code>{derived.formula}</code>
          </div>
          <div className={styles.numRow} style={{ marginTop: 12 }}>
            <input className={styles.input} value={deriveInput} onChange={(e) => setDeriveInput(e.target.value)} />
            <span className={styles.unit}>건/월</span>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primaryBtn} onClick={() => acceptDerived(deriveInput)}>이 숫자로 할게요 →</button>
            <button type="button" className={styles.linkBtn} onClick={() => finishAll(record)}>건너뛰기 — 나중에 직접 입력</button>
          </div>
        </>
      )}

      {phase === "done" && (
        <>
          <div className={styles.kicker}>준비 완료</div>
          <p className={styles.lead}>사업 구조가 정리됐어요. 이제 사업계획서를 만들 수 있어요.</p>
          <div className={styles.summary}>{a.summaryForUser}</div>
          {(() => {
            const rep = analyzeGaps(record, answers);
            const unknowns = Object.entries(record.slots).filter(([, v]) => v.status === "unknown");
            return (
              <div className={styles.doneGrid}>
                <div className={styles.doneRow}><span>핵심 정보 확보</span><span>{Math.round(rep.completeness * 100)}%</span></div>
                <div className={styles.doneRow}><span>질문 팩</span><span>{rep.pack.label}</span></div>
                {unknowns.length > 0 && (
                  <div className={`${styles.doneRow} ${styles.miss}`}>
                    <span>나중에 정할 것</span>
                    <span>{unknowns.length}개 — 문서에 ‘추가 정의 필요’로 표시돼요</span>
                  </div>
                )}
              </div>
            );
          })()}
          <div className={styles.actions}>
            <button type="button" className={styles.primaryBtn} onClick={() => router.push("/plan/overview")}>플랜 개요로 — 시장자료·재무 확인·생성 →</button>
            <p className={styles.note}>개요에서 <b>공식 시장자료 검색</b>과 <b>재무 확인</b>을 거친 뒤 사업계획서를 생성하세요. 더 자세히 쓰고 싶은 섹션은 언제든 직접 열어 답할 수 있어요.</p>
          </div>
        </>
      )}
    </div></div></div>
  );
}
