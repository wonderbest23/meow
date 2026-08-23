"use client";

/*
 * 검토에서 찾은 문제 → 그 자리에서 답하기 → 관련 섹션만 다시 쓰기.
 *
 * 여기서 새 설문을 시작하지 않는다. 한 문제당 최대 3개, 문장은 기존 137개 질문과
 * 질문팩에서 그대로 가져온다. 저장도 기존 칸(plan.answers / __analysis.slots)에만 한다.
 * 다시 쓰는 것도 영향받는 섹션뿐이다 — 25개를 통째로 새로 만들지 않는다.
 */
import { useMemo, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import {
  activePlan,
  loadAnswers,
  loadState,
  priorSectionsSummary,
  saveAnswers,
  saveSection,
} from "../../lib/plan-builder/plan-store";
import { rememberRegenQuota } from "../../lib/plan-builder/regen-store";
import { PLAN_BLUEPRINT, chaptersForType } from "../../lib/plan-builder/blueprint";
import { ANALYSIS_KEY, readAnalysisRecord, type AnalysisRecord } from "../../lib/plan-builder/analyzer/domain";
import { followUpQuestions, gatesFor, type FollowUpQuestion } from "../../lib/plan-builder/review/resolution";
import type { ReviewIssue } from "../../lib/plan-builder/review/domain";
import styles from "./ReviewPanel.module.css";

type Answers = Record<string, Record<string, unknown>>;
const UNKNOWN = "__unknown__";

function sectionTitle(key: string): string {
  for (const c of PLAN_BLUEPRINT) {
    for (const s of c.sections) if (`${c.id}/${s.id}` === key) return `${c.title} · ${s.title}`;
  }
  return key;
}

export default function ReviewFollowUp({
  issue,
  planId,
  onSaved,
  onClose,
}: {
  issue: ReviewIssue;
  planId: string;
  /** 답변 저장이 끝나면 알린다 — 부모가 검토를 '지난 검토'로 낮춘다 */
  onSaved: () => void;
  onClose: () => void;
}) {
  const answers = useMemo<Answers>(() => activePlan()?.answers ?? {}, []);
  const questions = useMemo<FollowUpQuestion[]>(() => followUpQuestions(issue.resolution, answers), [issue, answers]);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((q) => [q.target.id, q.current ?? ""])),
  );
  const [saved, setSaved] = useState(false);
  const [regen, setRegen] = useState<{ done: number; total: number; current: string } | null>(null);
  const [regenError, setRegenError] = useState("");
  const [regenDone, setRegenDone] = useState(0);

  /** 다시 써야 할 섹션 — 본문이 있고, 잠그지 않았고, 직접 고치지 않은 것만 */
  const targets = useMemo(() => {
    const plan = activePlan();
    if (!plan) return [] as Array<{ key: string; chapterId: string; sectionId: string; title: string }>;
    const inType = new Set(chaptersForType(plan.planType).flatMap((c) => c.sections.map((s) => `${c.id}/${s.id}`)));
    return (issue.resolution?.affectedSections ?? [])
      .filter((key) => inType.has(key))
      .map((key) => {
        const sec = plan.sections?.[key];
        const [chapterId, sectionId] = key.split("/");
        return { key, chapterId, sectionId, title: sectionTitle(key), body: sec?.markdown ?? "", locked: Boolean(sec?.locked), edited: Boolean(sec?.edited) };
      })
      .filter((t) => t.body && !t.locked && !t.edited)
      .map(({ key, chapterId, sectionId, title }) => ({ key, chapterId, sectionId, title }));
  }, [issue]);

  const skipped = useMemo(() => {
    const plan = activePlan();
    return (issue.resolution?.affectedSections ?? []).filter((key) => {
      const sec = plan?.sections?.[key];
      return sec?.markdown && (sec.locked || sec.edited);
    });
  }, [issue]);

  const answered = questions.filter((q) => (draft[q.target.id] ?? "").trim()).length;

  function save() {
    let next: Answers = { ...(activePlan()?.answers ?? {}) };
    let rec: AnalysisRecord | null = readAnalysisRecord(next);
    let touchedAnalysis = false;

    for (const q of questions) {
      const raw = (draft[q.target.id] ?? "").trim();
      if (!raw) continue;
      const unknown = raw === UNKNOWN;

      if (q.target.analyzerSlot) {
        if (!rec) continue;
        // 모른다고 하면 값을 만들지 않는다 — 기존 동적 질문 정책 그대로
        rec = { ...rec, slots: { ...rec.slots, [q.target.analyzerSlot]: unknown ? { value: null, status: "unknown" } : { value: raw, status: "confirmed" } } };
        touchedAnalysis = true;
        continue;
      }
      if (unknown) continue; // 기존 질문 칸은 비워 둔다(빈 답이 곧 미정)
      const { sectionKey, qid } = q.target;
      if (!sectionKey || !qid) continue;
      const isMulti = q.input.kind === "multi";
      const sec = { ...(next[sectionKey] ?? {}) };
      sec[qid] = isMulti ? raw.split(",").map((s) => s.trim()).filter(Boolean) : raw;
      // 분기 질문이면 앞의 예/아니오도 켜야 위저드에서 답이 보인다
      for (const g of gatesFor(q.target)) {
        const gs = { ...(next[g.sectionKey] ?? {}) };
        gs[g.qid] = g.value;
        next[g.sectionKey] = gs;
      }
      next[sectionKey] = { ...(next[sectionKey] ?? {}), ...sec };
    }

    if (touchedAnalysis && rec) next[ANALYSIS_KEY] = rec as unknown as Record<string, unknown>;

    const before = activePlan()?.answers ?? {};
    for (const key of Object.keys(next)) {
      if (before[key] !== next[key]) saveAnswers(key, next[key], planId);
    }
    setSaved(true);
    onSaved();
  }

  async function regenerate() {
    const plan = activePlan();
    const state = loadState();
    if (!plan || regen) return;
    setRegenError("");
    let fails = 0;
    for (let i = 0; i < targets.length; i += 1) {
      const t = targets[i];
      setRegen({ done: i, total: targets.length, current: t.title });
      try {
        const res = await fetch("/api/plan/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterId: t.chapterId,
            sectionId: t.sectionId,
            answers: loadAnswers(t.key),
            planTitle: plan.title,
            planType: plan.planType,
            planId: plan.id,
            business: state.business,
            priorSummary: priorSectionsSummary(t.key),
            allAnswers: activePlan()?.answers ?? {},
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          setRegenError(err.message ?? "다시 쓰지 못한 섹션이 있습니다.");
          fails += 1;
          continue;
        }
        const data = (await res.json()) as { markdown?: string; html?: string; quota?: unknown };
        rememberRegenQuota(plan.id, data.quota);
        if (data.markdown && data.html) saveSection(t.key, data.markdown, data.html, { planId: plan.id, keepPrevious: true });
        else fails += 1;
      } catch {
        fails += 1;
      }
    }
    setRegen(null);
    setRegenDone(targets.length - fails);
    if (fails > 0 && !regenError) setRegenError(`${fails}개 섹션을 다시 쓰지 못했습니다.`);
    onSaved();
  }

  if (questions.length === 0) return null;

  return (
    <div className={styles.followUp}>
      {!saved ? (
        <>
          <p className={styles.followHead}>이 부분만 조금 더 알려주세요.</p>
          {questions.map((q, i) => {
            const value = draft[q.target.id] ?? "";
            const isUnknown = value === UNKNOWN;
            return (
              <div key={q.target.id} className={styles.followQ}>
                <div className={styles.followLabel}>{i + 1}. {q.label}</div>
                <p className={styles.followText}>{q.q}</p>
                {q.help && <p className={styles.followHelp}>{q.help}</p>}
                {!isUnknown && (q.input.kind === "single" || q.input.kind === "multi" || q.input.kind === "select") && (
                  <div className={styles.opts}>
                    {q.input.options.map((o) => {
                      const on = q.input.kind === "multi" ? value.split(",").map((x) => x.trim()).includes(o) : value === o;
                      return (
                        <button
                          key={o}
                          type="button"
                          className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                          onClick={() =>
                            setDraft((d) => {
                              if (q.input.kind !== "multi") return { ...d, [q.target.id]: o };
                              const cur = (d[q.target.id] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
                              const nextSel = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o];
                              return { ...d, [q.target.id]: nextSel.join(", ") };
                            })
                          }
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!isUnknown && q.input.kind === "yesno" && (
                  <div className={styles.opts}>
                    {[["yes", "예"], ["no", "아니오"]].map(([v, label]) => (
                      <button key={v} type="button" className={`${styles.chip} ${value === v ? styles.chipOn : ""}`} onClick={() => setDraft((d) => ({ ...d, [q.target.id]: v }))}>{label}</button>
                    ))}
                  </div>
                )}
                {!isUnknown && q.input.kind === "text" && (
                  q.input.long ? (
                    <textarea className={styles.followInput} rows={2} placeholder={q.input.placeholder} value={value} onChange={(e) => setDraft((d) => ({ ...d, [q.target.id]: e.target.value }))} />
                  ) : (
                    <input className={styles.followInput} placeholder={q.input.placeholder} value={value} onChange={(e) => setDraft((d) => ({ ...d, [q.target.id]: e.target.value }))} />
                  )
                )}
                <button
                  type="button"
                  className={`${styles.unknownBtn} ${isUnknown ? styles.unknownOn : ""}`}
                  onClick={() => setDraft((d) => ({ ...d, [q.target.id]: isUnknown ? "" : UNKNOWN }))}
                >
                  {isUnknown ? "✓ 아직 모르겠어요 — 다시 입력하려면 클릭" : "아직 모르겠어요"}
                </button>
              </div>
            );
          })}
          <div className={styles.followActions}>
            <button type="button" className={styles.btn} disabled={answered === 0} onClick={save}>답변 저장</button>
            <button type="button" className={styles.ghost} onClick={onClose}>닫기</button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.followSaved}><Check size={14} /> 답변이 반영됐어요.</p>
          {targets.length > 0 && regenDone === 0 && (
            <>
              <p className={styles.followHelp}>
                이 답변이 들어가는 섹션 {targets.length}개를 다시 쓸 수 있어요 — {targets.map((t) => t.title.split(" · ")[1]).join(", ")}
                {skipped.length > 0 && ` (직접 고쳤거나 잠근 ${skipped.length}개는 건드리지 않아요)`}
              </p>
              <div className={styles.followActions}>
                <button type="button" className={styles.btn} onClick={regenerate} disabled={Boolean(regen)}>
                  {regen ? <RefreshCw size={14} className={styles.spin} /> : null}
                  {regen ? `다시 쓰는 중… (${regen.done + 1}/${regen.total}) ${regen.current}` : "관련 내용 다시 작성"}
                </button>
                <button type="button" className={styles.ghost} onClick={onClose}>나중에</button>
              </div>
              <p className={styles.followNote}>이미 만들어진 본문을 다시 쓰면 재생성 횟수가 사용됩니다.</p>
            </>
          )}
          {regenDone > 0 && <p className={styles.followSaved}><Check size={14} /> {regenDone}개 섹션을 다시 썼어요.</p>}
          {regenError && <p className={styles.followErr}>{regenError}</p>}
          {targets.length === 0 && <p className={styles.followHelp}>아직 본문이 없는 섹션이라 다시 쓸 것은 없어요. 답변은 저장됐습니다.</p>}
          {(regenDone > 0 || targets.length === 0) && (
            <div className={styles.followActions}>
              <button type="button" className={styles.ghost} onClick={onClose}>닫기</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
