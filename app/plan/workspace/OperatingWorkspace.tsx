"use client";

import { apiMessage, userErrorMessage } from "../../../lib/client/user-error";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Download, FileText, Pencil, Plus, Save, X } from "lucide-react";
import { METRICS, comparePeriods, metricValue, oldInput, periodDays, periodInputSchema, periodIssue, periodLabel, previousPeriod, referenceFor, reportIsCurrent, reportMarkdown, type OperatingCommand, type OperatingPeriod, type OperatingReport, type OperatingState, type PeriodInput } from "../../../lib/plan-builder/operating-records";
import { isSamplePlan } from "../../../lib/plan-builder/plan-store";
import { sampleOperatingState } from "../../../lib/plan-builder/sample-operations";
import { newChatHref } from "../../../lib/plan-builder/studio";
import styles from "./OperatingWorkspace.module.css";
import { askConfirm, showNotice } from "../../../components/confirm-dialog";
import { saveFile, SAVE_UNSUPPORTED_MESSAGE } from "../../../lib/save-file";
import PlanLoading from "../PlanLoading";
import OperatingAnalysisPanel, { OperatingAnalysisResult } from "./OperatingAnalysisPanel";
import type { AnalysisTarget } from "../../../lib/plan-builder/operating-analysis-contract";
import { autoInquiriesValue, type HomepageInquiries } from "../../../lib/plan-builder/operating-homepage";
import { useStudioHeaderActions, useStudioNav, useStudioPane } from "../studio/StudioContext";
import paneHeader from "./PaneHeaderActions.module.css";

type Draft = Omit<PeriodInput, "metrics"> & { metrics: Record<typeof METRICS[number]["key"], string> };
/** 운영 중인 사업 대화에서 말한 실적(기간·실제 매출) — 첫 기록을 채우는 데만 쓴다(저장은 사장님이 누를 때) */
export type ChatRecord = { start: string; end: string; revenue: number | null };
export function chatRecordFrom(answers: Record<string, Record<string, unknown>> | undefined): ChatRecord | null {
  const period = answers?.["intake/period"]?.value;
  const [start, end] = typeof period === "string" ? period.match(/\d{4}-\d{2}-\d{2}/g) ?? [] : [];
  if (!start || !end || start > end) return null;
  const intake = answers?.["__business_intake"]?.state as { answers?: Record<string, { status?: string; value?: unknown }> } | undefined;
  const sales = intake?.answers?.sales;
  const revenue = sales?.status === "answered" && typeof sales.value === "number" && Number.isSafeInteger(sales.value) && sales.value >= 0 ? sales.value : null;
  return { start, end, revenue };
}
/* 금액 칸은 1,500,000처럼 쉼표를 넣어 보여 주고, 저장할 때 쉼표를 뺀다 */
const withCommas = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const metricText = (unit: string, value: number | null | undefined) => value == null ? "" : unit === "원" ? withCommas(String(value)) : String(value);
/* 칸에 넣을 수 있는 가장 큰 값 — 저장 규칙(operating-records.ts)과 같다. 넘으면 그 칸 아래에 바로 안내한다 */
const METRIC_MAX = { 원: 1_000_000_000_000, 건: 10_000_000 } as const;
const metricLimit = (unit: "원" | "건", digits: string) => digits !== "" && Number(digits.replaceAll(",", "")) > METRIC_MAX[unit] ? unit === "원" ? "금액은 1조 원 이하로 적어 주세요" : "건수는 1천만 건 이하로 적어 주세요" : "";
/* 날짜·시각은 초 없이 */
const stamp = (iso: string) => new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
function draftFor(period?: OperatingPeriod): Draft {
  /* 새 기록은 오늘까지 최근 7일 — 예전엔 오늘 하루(오늘~오늘)로 열려 매번 시작일을 고쳐야 했다 */
  const day = new Date();
  const today = day.toLocaleDateString("en-CA");
  day.setDate(day.getDate() - 6);
  const weekAgo = day.toLocaleDateString("en-CA");
  return { ...(period ? oldInput(period) : { start: weekAgo, end: today, feedback: "", keep: "", change: "", nextAction: "", successCriterion: "" }), metrics: Object.fromEntries(METRICS.map(m => [m.key, metricText(m.unit, period?.metrics[m.key])])) as Draft["metrics"] };
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
export default function OperatingWorkspace({ planId, onDirtyChange, chatRecord = null }: { planId: string; onDirtyChange: (dirty: boolean) => void; chatRecord?: ChatRecord | null }) {
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
  /* input — 입력을 고치면 되는 오류(안내만), conflict — 다른 곳에서 먼저 고친 기록, other — 연결·서버 문제(다시 불러오기) */
  const [errorKind, setErrorKind] = useState<"input" | "conflict" | "other">("other");
  /* 고칠 칸(start·revenue·feedback 등) — 오류를 그 칸 아래에 보여 주고 그 칸으로 화면과 커서를 옮긴다 */
  const [invalid, setInvalid] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [notice, setNotice] = useState("");
  const [reportRequest, setReportRequest] = useState<{ id: string; reference: ReturnType<typeof referenceFor> } | null>(null);
  /* 이 기간 홈페이지 문의 수 — 문의 칸이 비었거나 앞서 자동으로 넣은 값이면 채운다 */
  const [homepage, setHomepage] = useState<HomepageInquiries | null>(null);
  const autoInquiries = useRef<string | null>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const dirty = !!editor && editor.original !== JSON.stringify(draft);
  const period = state?.periods.find(p => p.id === selected) ?? null;
  const baseline = period && state ? previousPeriod(state.periods, period) : null;
  const report: OperatingReport | undefined = state?.reports.find(r => r.id === reportId);
  /* 예시 사업 — 서버에 없는 사업이라 예시 기록(sample-operations)을 보여 주고, 저장하는 단추는 감춘다 */
  const sample = isSamplePlan(planId);

  useEffect(() => { onDirtyChange(dirty || busy || analysisDirty); return () => onDirtyChange(false); }, [dirty, busy, analysisDirty, onDirtyChange]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => { if (dirty || analysisDirty || pending.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty, analysisDirty]);
  useEffect(() => {
    setHomepage(null);
    if (!editor || !draft.start || !draft.end || draft.start > draft.end) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ planId, start: draft.start, end: draft.end });
      void fetch(`/api/plan/operations/homepage?${query}`, { cache: "no-store", signal: controller.signal })
        .then(async response => response.ok ? await response.json() as HomepageInquiries : null)
        .then(found => { if (!controller.signal.aborted && alive.current) setHomepage(found); })
        .catch(() => undefined);
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [editor?.id, draft.start, draft.end, planId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editor || busy) return;
    const next = autoInquiriesValue(draft.metrics.inquiries, autoInquiries.current, homepage);
    if (next === null) return;
    const untouched = editor.original === JSON.stringify(draft);
    const filled = { ...draft, metrics: { ...draft.metrics, inquiries: next } };
    autoInquiries.current = next;
    setDraft(filled);
    // 열기만 하고 아무것도 안 고쳤으면 자동으로 넣은 값은 '고친 것'으로 치지 않는다
    if (untouched) setEditor({ ...editor, original: JSON.stringify(filled) });
  }, [homepage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { alive.current = true; void reload(); return () => { alive.current = false; }; }, [planId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function reload() {
    setError(""); setErrorKind("other");
    if (sample) {
      const records = sampleOperatingState(planId);
      acceptState(records); setAnalysisTarget(null); setSelected(current => current || records.periods[0]?.id || ""); setReportId(current => current || records.reports[0]?.id || "");
      return;
    }
    try {
      const response = await fetch(`/api/plan/operations?planId=${encodeURIComponent(planId)}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) throw new Error(apiMessage(data, ""));
      if (alive.current) { acceptState(data.records); setAnalysisTarget(data.analysisTarget ?? null); setSelected(current => current || data.records.periods[0]?.id || ""); setReportId(current => current || data.records.reports[0]?.id || ""); }
    } catch (e) { if (alive.current) setError(userErrorMessage(e, "기록을 불러오지 못했어요.")); }
  }
  function edit(target?: OperatingPeriod) {
    const next = draftFor(target);
    autoInquiries.current = null;
    setDraft(next); setEditor({ id: target?.id ?? crypto.randomUUID(), revision: target?.revision ?? null, original: JSON.stringify(next) });
    setError(""); setNotice(""); setInvalid(null);
  }
  /*
   * 대화에서 말한 실적(예: 2026년 9월 · 실제 매출 600만원)으로 첫 기록 칸을 채운다 — 예전엔 대화에서 말한 것을 여기서 다시 적어야 했다
   * (여정 점검 2026-10-22). 저장은 하지 않는다. 열어 본 사장님이 확인하고 '기록 저장'을 누른다.
   */
  function editFromChat(record: ChatRecord) {
    const blank = draftFor();
    const next: Draft = { ...blank, start: record.start, end: record.end, metrics: { ...blank.metrics, revenue: record.revenue === null ? "" : withCommas(String(record.revenue)) } };
    autoInquiries.current = null;
    setDraft(next); setEditor({ id: crypto.randomUUID(), revision: null, original: JSON.stringify(blank) });
    setError(""); setInvalid(null); setNotice("대화에서 말한 실적을 채웠어요. 확인하고 '기록 저장'을 눌러 주세요.");
  }
  async function run(command: OperatingCommand) {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError(""); setNotice(""); setInvalid(null);
    try {
      const response = await fetch("/api/plan/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, command }), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) {
        /* 입력 확인 오류(400·422)는 입력만 고치면 된다 — 예전엔 '서버 기록 다시 확인'과 충돌 안내까지 같이 떠 헷갈렸다 */
        if ((response.status === 400 || response.status === 422) && alive.current) { showInputError(apiMessage(data, "") || "입력 내용을 확인해 주세요.", typeof data?.field === "string" ? data.field : null); return false; }
        setErrorKind(response.status === 409 ? "conflict" : "other");
        throw new Error(apiMessage(data, ""));
      }
      if (!alive.current) return false;
      acceptState(data.records);
      if (command.action === "save") { setSelected(command.id); setEditor(null); setNotice("저장했어요"); }
      else { setReportId(command.id); setMode("reports"); setReportRequest(null); setNotice("이 시점의 기록과 개선 계획을 리포트로 보관했어요"); }
      return true;
    } catch (e) { if (alive.current) setError(userErrorMessage(e, "저장 응답을 확인하지 못했어요. 입력은 그대로 남아 있어요. 다시 저장해도 기록이 중복되지 않아요.")); return false; }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  /*
   * 입력 확인 오류 — 예전엔 기록 칸 위(폼 바깥)에 zod 원문이 떠서 어느 칸이 문제인지 몰랐다(감사 r36).
   * 이제 그 칸 아래에 한국어 안내를 두고, 그 칸으로 화면을 옮겨 커서를 놓는다. 칸을 모르면 예전처럼 위에 띄운다.
   */
  function showInputError(message: string, field: string | null) {
    setErrorKind("input"); setError(message);
    const target = field ? formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`) : null;
    setInvalid(target ? field : null);
    if (!target) return;
    requestAnimationFrame(() => { target.scrollIntoView({ block: "center", behavior: "smooth" }); target.focus({ preventScroll: true }); });
  }
  /* 칸을 고치기 시작하면 그 칸의 오류 안내를 지운다 */
  function touched(key: string) { if (invalid === key) { setInvalid(null); setError(""); } }
  const fieldProps = (key: string) => ({ "data-field": key, "aria-invalid": invalid === key || undefined, "aria-describedby": invalid === key ? "operating-field-error" : undefined });
  const fieldError = (key: string) => invalid === key && error ? <small id="operating-field-error" role="alert" className={styles.fieldError}>{error}</small> : null;
  async function save() {
    if (!editor) return;
    const parsed = periodInputSchema.safeParse({ ...draft, metrics: Object.fromEntries(METRICS.map(m => [m.key, draft.metrics[m.key] === "" ? null : Number(draft.metrics[m.key].replaceAll(",", ""))])) });
    if (!parsed.success) { const { message, field } = periodIssue(parsed.error); showInputError(message, field); return; }
    /* 수치도 글도 하나도 없는 기록 — 실수로 누른 저장일 수 있어 한 번 묻는다 */
    const input = parsed.data;
    const blank = METRICS.every(m => input.metrics[m.key] === null) && [input.feedback, input.keep, input.change, input.nextAction, input.successCriterion].every(text => !text);
    if (blank && !await askConfirm({ title: "비어 있는 기록을 저장할까요?", message: "실적도 돌아보기도 적지 않았어요. 기간만 남겨 두려면 저장하고, 적을 내용이 있으면 돌아가서 적어 주세요.", cancelLabel: "돌아가기", confirmLabel: "비어 있는 채로 저장" })) return;
    await run({ action: "save", id: editor.id, expectedRevision: editor.revision, input });
  }
  function requestArchive() {
    if (!period) return;
    const reference = referenceFor(period, baseline);
    const request = reportRequest && JSON.stringify(reportRequest.reference) === JSON.stringify(reference) ? reportRequest : { id: crypto.randomUUID(), reference };
    if (request !== reportRequest) setReportRequest(request);
    void askConfirm({ title: "지금 기록으로 리포트를 보관할까요?", message: "이번 기간과 이전 기간의 수치, 개선 행동이 지금 내용 그대로 남아요. 나중에 기록을 고쳐도 보관한 리포트는 바뀌지 않아요.", cancelLabel: "돌아가기", confirmLabel: "보관하기" })
      .then(ok => { if (ok) void run({ action: "report", ...request }); });
  }
  /* 저장하지 않은 수정 버리기 — 다른 확인창과 같은 모양으로 */
  function closeEditor() {
    if (!dirty) { setEditor(null); return; }
    void askConfirm({ title: "수정을 취소할까요?", message: "저장하지 않은 수정은 사라져요. 마지막으로 저장한 기록은 그대로 남아요.", cancelLabel: "계속 작성", confirmLabel: "수정 취소" })
      .then(ok => { if (ok) setEditor(null); });
  }
  /*
   * 리포트 내려받기 — 앱(아이폰) 안에서는 <a download>가 아무 일도 하지 않아 공유 창(파일에 저장)으로 건넨다(lib/save-file.ts)
   */
  const [downloading, setDownloading] = useState(false);
  async function downloadReport(target: OperatingReport) {
    if (downloading) return;
    setDownloading(true); setNotice("");
    try {
      /* 예시 사업 리포트는 서버에 없다 — 서버가 만드는 것과 같은 글(reportMarkdown)을 여기서 만든다 */
      let blob: Blob;
      if (sample) blob = new Blob([reportMarkdown(target)]);
      else {
        const response = await fetch(`/api/plan/operations?planId=${encodeURIComponent(planId)}&reportId=${encodeURIComponent(target.id)}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(apiMessage(await response.json().catch(() => null), "리포트를 받지 못했어요. 잠시 후 다시 시도해 주세요."));
        blob = await response.blob();
      }
      const name = `${target.businessTitle || "운영"} 개선 리포트 ${target.period.start}.md`.replace(/[\\/:*?"<>|]+/g, " ");
      const result = await saveFile(new Blob([blob], { type: "text/markdown;charset=utf-8" }), name);
      if (result === "unsupported") await showNotice(SAVE_UNSUPPORTED_MESSAGE, { title: "파일 받기" });
    } catch (e) { void showNotice(userErrorMessage(e, "리포트를 받지 못했어요. 잠시 후 다시 시도해 주세요."), { title: "파일 받기" }); }
    finally { setDownloading(false); }
  }
  /*
   * 작업실 안(머리줄이 있는 작업실) — 이 칸에서 먼저 할 일 '기간 기록 추가'를 머리줄 오른쪽 파란 단추로 올린다(넓은 화면).
   * 좁은 화면은 머리줄이 좁아 예전처럼 제목 옆 단추를 쓴다. 단추 묶음은 바뀔 때만 새로 만든다(작업실이 다시 그려질 때 되풀이 등록 방지).
   */
  const pane = useStudioPane();
  const studioNav = useStudioNav();
  const studioHeader = !!pane && !!studioNav?.setHeaderActions;
  const canAddPeriod = !!state && !editor && mode === "periods" && !sample;
  const addDisabled = busy || analysisDirty;
  const editRef = useRef(edit); editRef.current = edit;
  const headerNode = useMemo(() => studioHeader && canAddPeriod
    ? <div className={`${paneHeader.group} ${paneHeader.wideOnly}`}><button type="button" className={`${paneHeader.btn} ${paneHeader.primary}`} disabled={addDisabled} onClick={() => editRef.current()}><Plus size={16} aria-hidden="true" />기간 기록 추가</button></div>
    : null, [studioHeader, canAddPeriod, addDisabled]);
  useStudioHeaderActions(headerNode);

  return <div className={styles.root}>
    <header className={styles.heading}><div><h2 tabIndex={-1}>실적과 개선 기록</h2>{/* 불러오기 전·실패했을 때 '0개'라고 하지 않는다 */}{state ? <p>운영 기록 {state.periods.length}개 <span aria-hidden="true">·</span> 개선 리포트 {state.reports.length}개</p> : <p>{error ? "기록 수를 확인하지 못했어요" : "기록을 확인하고 있어요"}</p>}</div>{canAddPeriod && <button className={studioHeader ?`${styles.primary} ${paneHeader.narrowOnly}` : styles.primary} onClick={() => edit()} disabled={busy || analysisDirty}><Plus size={18} />기간 기록</button>}</header>
    <div className={styles.tabs} role="group" aria-label="운영 기록 보기"><button aria-pressed={mode === "periods"} disabled={!!editor || busy || analysisDirty} onClick={() => setMode("periods")}>기간별 실적</button><button aria-pressed={mode === "reports"} disabled={!!editor || busy || analysisDirty} onClick={() => setMode("reports")}>리포트 보관함</button></div>
    {sample && <p className={styles.note} role="note">예시 사업의 기록이라 보기만 할 수 있어요. 내 사업을 만들면 직접 기록하고 리포트로 보관할 수 있어요. <a className={styles.inlineButton} href={newChatHref()}>대화로 내 사업 시작하기</a></p>}
    {error && !invalid && <div role="alert" className={styles.error}><p>{error}</p>{errorKind !== "input" && <><button type="button" disabled={busy} onClick={() => void reload()}>기록 다시 불러오기</button>{editor && <p>{errorKind === "conflict" ? "다른 곳에서 먼저 고친 기록이 있어요. 입력 중인 내용은 그대로 있으니 복사해 두고, 취소한 뒤 다시 열어 고쳐 주세요." : "입력 중인 내용은 그대로 있어요."}</p>}</>}</div>}
    {notice && <p role="status" className={styles.success}>{notice}</p>}
    {!state && !error && <PlanLoading note="운영 기록을 불러오고 있어요" />}
    {editor && <form ref={formRef} className={styles.editor} onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className={styles.editorHeading}><h3>{editor.revision === null ? "새 기간 기록" : "기간 기록 수정"}</h3><button type="button" aria-label="기간 편집 닫기" title="기간 편집 닫기" disabled={busy} onClick={closeEditor}><X size={20} /></button></div>
      <fieldset disabled={busy}><legend>기록 기간</legend><div className={styles.twoColumns}><label>시작일<input type="date" required {...fieldProps("start")} value={draft.start} onChange={e => { touched("start"); setDraft({ ...draft, start: e.target.value }); }} />{fieldError("start")}</label><label>종료일<input type="date" required min={draft.start} {...fieldProps("end")} value={draft.end} onChange={e => { touched("end"); setDraft({ ...draft, end: e.target.value }); }} />{fieldError("end")}</label></div></fieldset>
      <fieldset disabled={busy}><legend>실제 실적</legend><p className={styles.note}>알 수 없는 값은 비워 두세요. 발생하지 않았다면 0을 입력하세요.</p><div className={styles.twoColumns}>{METRICS.map(m => { const limit = metricLimit(m.unit, draft.metrics[m.key]); return <label key={m.key}>{m.label} ({m.unit})<input type="text" inputMode="numeric" autoComplete="off" maxLength={m.unit === "원" ? 17 : 8} {...fieldProps(m.key)} aria-invalid={invalid === m.key || !!limit || undefined} value={draft.metrics[m.key]} onChange={e => {
          /* 금액은 13자리(1조)까지, 건수는 8자리까지만 받는다 — 한도를 넘는 값은 칸 아래에 바로 안내한다(저장 전에) */
          const digits = e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, m.unit === "원" ? 13 : 8);
          touched(m.key); setDraft({ ...draft, metrics: { ...draft.metrics, [m.key]: m.unit === "원" ? withCommas(digits) : digits } });
        }} />{fieldError(m.key) ?? (limit && <small role="status" className={styles.fieldError}>{limit}</small>)}</label>; })}</div>
        {homepage?.linked && <p className={styles.note} role="status">
          홈페이지로 들어온 문의 {homepage.inquiries.toLocaleString("ko-KR")}건(이 기간){draft.metrics.inquiries === String(homepage.inquiries) ? " — 문의 칸에 넣어 두었어요. 전화·방문 문의가 더 있으면 더해서 고쳐 주세요." : ""}
          {draft.metrics.inquiries !== String(homepage.inquiries) && <> <button type="button" className={styles.inlineButton} onClick={() => { autoInquiries.current = String(homepage.inquiries); setDraft({ ...draft, metrics: { ...draft.metrics, inquiries: String(homepage.inquiries) } }); }}>{homepage.inquiries}건으로 넣기</button></>}
          {!homepage.published && " 홈페이지를 공개하면 손님 문의가 여기에 저절로 쌓여요."}
        </p>}</fieldset>
      <fieldset disabled={busy}><legend>돌아보기와 다음 행동</legend>{([
        ["feedback", "고객 반응", 3000], ["keep", "유지할 점", 1500], ["change", "바꿀 점", 1500], ["nextAction", "다음 개선 행동", 1500], ["successCriterion", "확인 기준", 1000],
      ] as const).map(([key, label, max]) => <label key={key}>{label}<textarea {...fieldProps(key)} value={draft[key]} maxLength={max} rows={key === "feedback" ? 3 : 2} onChange={e => { touched(key); setDraft({ ...draft, [key]: e.target.value }); }} />{fieldError(key)}</label>)}</fieldset>
      <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy}><Save size={18} />{busy ? "저장 중" : "기록 저장"}</button><button type="button" disabled={busy} onClick={closeEditor}>취소</button></div>
    </form>}
    {state && !editor && mode === "periods" && (period ? <>
      <div className={styles.selectRow}><label>기록 기간<select value={selected} disabled={busy || analysisDirty} onChange={e => { setSelected(e.target.value); setNotice(""); }}>{state.periods.map(p => <option key={p.id} value={p.id}>{periodLabel(p)}</option>)}</select></label>{!sample && <button disabled={busy || analysisDirty} onClick={() => edit(period)}><Pencil size={17} />수정</button>}</div>
      <p className={styles.meta}>{periodDays(period)}일 기록 · 마지막 저장 {stamp(period.updatedAt)}</p>
      <Comparison period={period} baseline={baseline} /><PeriodNotes period={period} />
      {!sample && <div className={styles.actions}><button className={styles.primary} disabled={busy || analysisDirty || !period.nextAction || !period.successCriterion || state.reports.some(r => r.source === "user-records" && JSON.stringify(referenceFor(r.period, r.baseline)) === JSON.stringify(referenceFor(period, baseline)))} onClick={requestArchive}><Archive size={18} />리포트 보관</button></div>}
      {!sample && (!period.nextAction || !period.successCriterion) && <p className={styles.note}>다음 개선 행동과 확인 기준을 적으면 리포트로 보관할 수 있어요.</p>}
      {/* AI 개선안은 운영에서 AI 분석을 켰을 때만(꺼져 있으면 '준비 중'만 보였다) */}
      {analysisTarget && <OperatingAnalysisPanel key={period.id} planId={planId} period={period} baseline={baseline} records={state} target={analysisTarget} onState={acceptState} onArchive={run} onDirtyChange={setAnalysisDirty} />}
    </> : <div className={styles.empty}><FileText size={30} /><h3>아직 기간 기록이 없어요</h3><p>첫 실적과 고객 반응을 남겨 보세요</p>
      {/* 넓은 화면은 '기간 기록 추가'가 머리줄 오른쪽 끝에만 있어 빈 칸 가운데서 찾기 어려웠다 — 여기에도 둔다 */}
      {canAddPeriod && !chatRecord && <button type="button" className={styles.primary} disabled={addDisabled} onClick={() => edit()}><Plus size={18} aria-hidden="true" />기간 기록 추가</button>}
      {canAddPeriod && chatRecord && <><button type="button" className={styles.primary} disabled={busy || analysisDirty} onClick={() => editFromChat(chatRecord)}><FileText size={18} />대화에서 말한 실적으로 첫 기록 만들기</button><small className={styles.note}>{`${chatRecord.start} ~ ${chatRecord.end}`}{chatRecord.revenue !== null ? ` · 실제 매출 ${chatRecord.revenue.toLocaleString("ko-KR")}원` : ""} · 저장 전에 고칠 수 있어요</small></>}
    </div>)}
    {state && !editor && mode === "reports" && (report ? <>
      <label className={styles.reportSelect}>보관한 리포트<select value={reportId} onChange={e => setReportId(e.target.value)}>{state.reports.map(r => <option key={r.id} value={r.id}>{periodLabel(r.period)} · {new Date(r.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 보관</option>)}</select></label>
      <article className={styles.report} aria-label="보관된 개선 리포트">
        <header><h3>{report.businessTitle} 운영 개선 리포트</h3><p>{periodLabel(report.period)} · {periodDays(report.period)}일</p><p className={styles.meta}>{stamp(report.createdAt)} 보관</p></header>
        <p className={styles.note}>{report.source === "ai-assisted" ? "직접 적은 실적, AI가 짐작한 원인, 고른 행동을 나눠 보관했어요. 실적이나 원인을 따로 확인한 결과는 아니에요." : "직접 적은 실적과 기간 비교를 보관한 기록이에요. AI 분석이나 실적을 따로 확인한 결과는 아니에요."}</p>
        {!reportIsCurrent(state, report) && <p className={styles.warning}>보관 이후 원본이나 비교 기간이 바뀌었어요. 이 리포트는 보관 당시 내용을 유지해요.</p>}
        <Comparison period={report.period} baseline={report.baseline} /><PeriodNotes period={report.period} archivedAnalysis={report.source === "ai-assisted"} />
        {report.analysis && <OperatingAnalysisResult analysis={report.analysis} chosenAction={report.chosenAction} />}
        <button type="button" className={styles.download} disabled={downloading} onClick={() => void downloadReport(report)}><Download size={18} />{downloading ? "준비 중…" : "리포트 내려받기"}</button>
      </article>
    </> : <div className={styles.empty}><Archive size={30} /><h3>보관한 리포트가 없어요</h3><p>기간 기록에서 다음 개선 행동을 정한 뒤 보관하세요</p></div>)}
  </div>;
}
