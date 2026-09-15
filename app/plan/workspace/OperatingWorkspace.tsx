"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Download, FileText, Pencil, Plus, Save, X } from "lucide-react";
import { METRICS, comparePeriods, metricValue, oldInput, periodDays, periodInputSchema, periodLabel, previousPeriod, referenceFor, reportIsCurrent, type OperatingCommand, type OperatingPeriod, type OperatingReport, type OperatingState, type PeriodInput } from "../../../lib/plan-builder/operating-records";
import styles from "./OperatingWorkspace.module.css";
import OperatingAnalysisPanel, { OperatingAnalysisResult } from "./OperatingAnalysisPanel";
import type { AnalysisTarget } from "../../../lib/plan-builder/operating-analysis-contract";

type Draft = Omit<PeriodInput, "metrics"> & { metrics: Record<typeof METRICS[number]["key"], string> };
function draftFor(period?: OperatingPeriod): Draft {
  const today = new Date().toLocaleDateString("en-CA");
  return { ...(period ? oldInput(period) : { start: today, end: today, feedback: "", keep: "", change: "", nextAction: "", successCriterion: "" }), metrics: Object.fromEntries(METRICS.map(m => [m.key, period?.metrics[m.key]?.toString() ?? ""])) as Draft["metrics"] };
}
function Comparison({ period, baseline }: { period: OperatingPeriod; baseline: OperatingPeriod | null }) {
  return <div className={styles.comparison}>
    <p className={styles.meta}>비교 기간 {baseline ? `${periodLabel(baseline)} · ${periodDays(baseline)}일` : "없음"}</p>
    {!baseline && <p className={styles.note}>첫 기록이에요. 다음 기간을 저장하면 비교할 수 있어요.</p>}
    {baseline && periodDays(period) !== periodDays(baseline) && <p className={styles.warning}>기간 길이가 달라요. 합계의 증감만으로 성과 개선을 판단할 수 없어요.</p>}
    <div className={styles.tableScroll}><table><caption>기간별 실적 비교</caption><thead><tr><th scope="col">항목</th><th scope="col">이번 기간</th><th scope="col">이전 기간</th><th scope="col">증감</th></tr></thead><tbody>{comparePeriods(period, baseline).map(row => <tr key={row.key}><th scope="row">{row.label}</th><td>{metricValue(row.current, row.unit)}</td><td>{metricValue(row.previous, row.unit)}</td><td>{row.delta === null ? "비교 불가" : <>{row.delta > 0 ? "+" : ""}{metricValue(row.delta, row.unit)}{row.percent !== null && <small>{row.percent > 0 ? "+" : ""}{row.percent.toFixed(1)}%</small>}</>}</td></tr>)}</tbody></table></div>
    <p className={styles.note}>미입력은 0으로 계산하지 않아요. 이전 값이 0이면 증감률은 표시하지 않아요.</p>
  </div>;
}
function PeriodNotes({ period, archivedAnalysis = false }: { period: OperatingPeriod; archivedAnalysis?: boolean }) {
  return <dl className={styles.notes}>{([
    ["고객 반응", period.feedback], ["유지할 점", period.keep], ["바꿀 점", period.change], [archivedAnalysis ? "입력 당시 개선 행동" : "다음 개선 행동", period.nextAction], [archivedAnalysis ? "입력 당시 확인 기준" : "확인 기준", period.successCriterion],
  ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "미입력"}</dd></div>)}</dl>;
}
export default function OperatingWorkspace({ planId, onDirtyChange }: { planId: string; onDirtyChange: (dirty: boolean) => void }) {
  const [state, setState] = useState<OperatingState | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<AnalysisTarget | null>(null);
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const acceptState = useCallback((next: OperatingState) => setState(current => current && current.revision > next.revision ? current : next), []);
  const [selected, setSelected] = useState("");
  const [reportId, setReportId] = useState("");
  const [mode, setMode] = useState<"periods" | "reports">("periods");
  const [editor, setEditor] = useState<{ id: string; revision: number | null; original: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFor());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reportRequest, setReportRequest] = useState<{ id: string; reference: ReturnType<typeof referenceFor> } | null>(null);
  const [confirm, setConfirm] = useState<"discard" | "archive" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const dirty = !!editor && editor.original !== JSON.stringify(draft);
  const period = state?.periods.find(p => p.id === selected) ?? null;
  const baseline = period && state ? previousPeriod(state.periods, period) : null;
  const report: OperatingReport | undefined = state?.reports.find(r => r.id === reportId);

  useEffect(() => { onDirtyChange(dirty || busy || analysisDirty); return () => onDirtyChange(false); }, [dirty, busy, analysisDirty, onDirtyChange]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => { if (dirty || analysisDirty || pending.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty, analysisDirty]);
  useEffect(() => { if (confirm) dialog.current?.showModal(); else dialog.current?.close(); }, [confirm]);
  useEffect(() => { alive.current = true; void reload(); return () => { alive.current = false; }; }, [planId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function reload() {
    setError("");
    try {
      const response = await fetch(`/api/plan/operations?planId=${encodeURIComponent(planId)}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (alive.current) { acceptState(data.records); setAnalysisTarget(data.analysisTarget ?? null); setSelected(current => current || data.records.periods[0]?.id || ""); setReportId(current => current || data.records.reports[0]?.id || ""); }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "기록을 불러오지 못했어요."); }
  }
  function edit(target?: OperatingPeriod) {
    const next = draftFor(target);
    setDraft(next); setEditor({ id: target?.id ?? crypto.randomUUID(), revision: target?.revision ?? null, original: JSON.stringify(next) });
    setError(""); setNotice("");
  }
  async function run(command: OperatingCommand) {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/plan/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, command }), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (!alive.current) return false;
      acceptState(data.records);
      if (command.action === "save") { setSelected(command.id); setEditor(null); setNotice("기간 기록을 서버에 저장했어요"); }
      else { setReportId(command.id); setMode("reports"); setReportRequest(null); setNotice("이 시점의 기록과 개선 계획을 리포트로 보관했어요"); }
      return true;
    } catch (e) { if (alive.current) setError(e instanceof Error && !["TimeoutError", "AbortError", "TypeError"].includes(e.name) ? e.message : "저장 응답을 확인하지 못했어요. 입력은 그대로 남아 있어요. 다시 저장해도 기록이 중복되지 않아요."); return false; }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  async function save() {
    if (!editor) return;
    const parsed = periodInputSchema.safeParse({ ...draft, metrics: Object.fromEntries(METRICS.map(m => [m.key, draft.metrics[m.key] === "" ? null : Number(draft.metrics[m.key])])) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "입력 내용을 확인해 주세요."); return; }
    await run({ action: "save", id: editor.id, expectedRevision: editor.revision, input: parsed.data });
  }
  function requestArchive() {
    if (!period) return;
    const reference = referenceFor(period, baseline);
    if (!reportRequest || JSON.stringify(reportRequest.reference) !== JSON.stringify(reference)) setReportRequest({ id: crypto.randomUUID(), reference });
    setConfirm("archive");
  }
  return <div className={styles.root}>
    <header className={styles.heading}><div><h2 tabIndex={-1}>실적과 개선 기록</h2><p>운영 기록 {state?.periods.length ?? 0}개 <span aria-hidden="true">·</span> 개선 리포트 {state?.reports.length ?? 0}개</p></div>{state && !editor && mode === "periods" && <button className={styles.primary} onClick={() => edit()} disabled={busy || analysisDirty}><Plus size={18} />기간 기록</button>}</header>
    <div className={styles.tabs} role="group" aria-label="운영 기록 보기"><button aria-pressed={mode === "periods"} disabled={!!editor || busy || analysisDirty} onClick={() => setMode("periods")}>기간별 실적</button><button aria-pressed={mode === "reports"} disabled={!!editor || busy || analysisDirty} onClick={() => setMode("reports")}>리포트 보관함</button></div>
    {error && <div role="alert" className={styles.error}><p>{error}</p><button type="button" disabled={busy} onClick={() => void reload()}>서버 기록 다시 확인</button>{editor && <p>입력 중인 내용은 유지됩니다. 충돌한 기록은 취소 후 다시 열어 수정해 주세요.</p>}</div>}
    {notice && <p role="status" className={styles.success}>{notice}</p>}
    {!state && !error && <p role="status">운영 기록을 불러오고 있어요</p>}
    {editor && <form className={styles.editor} onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className={styles.editorHeading}><h3>{editor.revision === null ? "새 기간 기록" : "기간 기록 수정"}</h3><button type="button" aria-label="기간 편집 닫기" title="기간 편집 닫기" disabled={busy} onClick={() => dirty ? setConfirm("discard") : setEditor(null)}><X size={20} /></button></div>
      <fieldset disabled={busy}><legend>기록 기간</legend><div className={styles.twoColumns}><label>시작일<input type="date" required value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value })} /></label><label>종료일<input type="date" required min={draft.start} value={draft.end} onChange={e => setDraft({ ...draft, end: e.target.value })} /></label></div></fieldset>
      <fieldset disabled={busy}><legend>실제 실적</legend><p className={styles.note}>알 수 없는 값은 비워 두세요. 발생하지 않았다면 0을 입력하세요.</p><div className={styles.twoColumns}>{METRICS.map(m => <label key={m.key}>{m.label} ({m.unit})<input type="number" inputMode="numeric" min={0} step={1} max={m.unit === "원" ? 1_000_000_000_000 : 10_000_000} value={draft.metrics[m.key]} onChange={e => setDraft({ ...draft, metrics: { ...draft.metrics, [m.key]: e.target.value } })} /></label>)}</div></fieldset>
      <fieldset disabled={busy}><legend>돌아보기와 다음 행동</legend>{([
        ["feedback", "고객 반응", 3000], ["keep", "유지할 점", 1500], ["change", "바꿀 점", 1500], ["nextAction", "다음 개선 행동", 1500], ["successCriterion", "확인 기준", 1000],
      ] as const).map(([key, label, max]) => <label key={key}>{label}<textarea value={draft[key]} maxLength={max} rows={key === "feedback" ? 3 : 2} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}</fieldset>
      <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy}><Save size={18} />{busy ? "저장 중" : "기록 저장"}</button><button type="button" disabled={busy} onClick={() => dirty ? setConfirm("discard") : setEditor(null)}>취소</button></div>
    </form>}
    {state && !editor && mode === "periods" && (period ? <>
      <div className={styles.selectRow}><label>기록 기간<select value={selected} disabled={busy || analysisDirty} onChange={e => { setSelected(e.target.value); setNotice(""); }}>{state.periods.map(p => <option key={p.id} value={p.id}>{periodLabel(p)}</option>)}</select></label><button disabled={busy || analysisDirty} onClick={() => edit(period)}><Pencil size={17} />수정</button></div>
      <p className={styles.meta}>{periodDays(period)}일 기록 · 기록 버전 {period.revision}</p>
      <Comparison period={period} baseline={baseline} /><PeriodNotes period={period} />
      <div className={styles.actions}><button className={styles.primary} disabled={busy || analysisDirty || !period.nextAction || !period.successCriterion || state.reports.some(r => r.source === "user-records" && JSON.stringify(referenceFor(r.period, r.baseline)) === JSON.stringify(referenceFor(period, baseline)))} onClick={requestArchive}><Archive size={18} />리포트 보관</button></div>
      {(!period.nextAction || !period.successCriterion) && <p className={styles.note}>다음 개선 행동과 확인 기준을 적으면 리포트로 보관할 수 있어요.</p>}
      <OperatingAnalysisPanel key={period.id} planId={planId} period={period} baseline={baseline} records={state} target={analysisTarget} onState={acceptState} onArchive={run} onDirtyChange={setAnalysisDirty} />
    </> : <div className={styles.empty}><FileText size={30} /><h3>아직 기간 기록이 없어요</h3><p>첫 실적과 고객 반응을 남겨 보세요</p></div>)}
    {state && !editor && mode === "reports" && (report ? <>
      <label className={styles.reportSelect}>보관한 리포트<select value={reportId} onChange={e => setReportId(e.target.value)}>{state.reports.map((r, i) => <option key={r.id} value={r.id}>{periodLabel(r.period)} · 보관 {state.reports.length - i}</option>)}</select></label>
      <article className={styles.report} aria-label="보관된 개선 리포트">
        <header><h3>{report.businessTitle} 운영 개선 리포트</h3><p>{periodLabel(report.period)} · {periodDays(report.period)}일</p><p className={styles.meta}>{new Date(report.createdAt).toLocaleString("ko-KR")} 보관</p></header>
        <p className={styles.note}>{report.source === "ai-assisted" ? "사용자 입력과 AI 가설 선택한 행동을 구분해 보관했어요 실적이나 원인을 검증한 결과는 아니에요" : "사용자 입력과 기간 비교를 보관한 기록이에요. AI 분석이나 실적 검증 결과는 아니에요."}</p>
        {!reportIsCurrent(state, report) && <p className={styles.warning}>보관 이후 원본이나 비교 기간이 바뀌었어요. 이 리포트는 보관 당시 내용을 유지해요.</p>}
        <Comparison period={report.period} baseline={report.baseline} /><PeriodNotes period={report.period} archivedAnalysis={report.source === "ai-assisted"} />
        {report.analysis && <OperatingAnalysisResult analysis={report.analysis} chosenAction={report.chosenAction} />}
        <a className={styles.download} href={`/api/plan/operations?planId=${encodeURIComponent(planId)}&reportId=${report.id}`} download><Download size={18} />리포트 내려받기 (.md)</a>
      </article>
    </> : <div className={styles.empty}><Archive size={30} /><h3>보관한 리포트가 없어요</h3><p>기간 기록에서 다음 개선 행동을 정한 뒤 보관하세요</p></div>)}
    <dialog ref={dialog} className={styles.dialog} onCancel={() => setConfirm(null)}><h3>{confirm === "archive" ? "현재 기록으로 리포트를 보관할까요" : "저장하지 않은 수정을 취소할까요"}</h3><p>{confirm === "archive" ? "이번 기간과 이전 기간의 수치, 개선 행동이 이 시점의 내용으로 남아요. 원본을 수정해도 보관한 리포트는 바뀌지 않아요." : "마지막으로 서버에 저장한 기록은 그대로 남아요."}</p><div className={styles.actions}><button autoFocus onClick={() => setConfirm(null)}>돌아가기</button><button className={styles.primary} onClick={() => { setConfirm(null); if (confirm === "archive" && reportRequest) void run({ action: "report", ...reportRequest }); else setEditor(null); }}>{confirm === "archive" ? "보관하기" : "수정 취소"}</button></div></dialog>
  </div>;
}
