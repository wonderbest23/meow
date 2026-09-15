"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, ClipboardCheck, RefreshCw } from "lucide-react";
import { analysisIsRunning, analysisTargetLabel, type AnalysisPayload, type AnalysisSelection, type AnalysisTarget, type ChosenAction } from "../../../lib/plan-builder/operating-analysis-contract";
import { referenceFor, type OperatingAnalysis, type OperatingCommand, type OperatingPeriod, type OperatingState } from "../../../lib/plan-builder/operating-records";
import type { AnalysisPreview } from "../../../lib/plan-builder/operating-analysis-service";
import shared from "./OperatingWorkspace.module.css";
import styles from "./OperatingAnalysisPanel.module.css";

const failureLabels: Record<string, string> = {
  quota_exhausted: "AI 이용 한도로 분석을 완료하지 못했어요",
  timeout: "분석 제한 시간을 넘겼어요",
  rate_limited: "AI 요청이 몰려 분석을 완료하지 못했어요",
  output_limit: "응답이 길어 완전한 결과를 받지 못했어요",
  invalid_response: "분석 결과의 형식이나 입력 연결을 확인하지 못했어요",
  unavailable: "AI 서비스에 연결하지 못했어요",
  source_changed: "분석 중 기간 기록이 바뀌었어요",
};
function Evidence({ input }: { input: AnalysisPayload }) {
  return <dl className={styles.evidence}>{input.evidence.map(e => <div key={e.id}><dt>{e.label}<small>{e.basis === "user" ? "사용자 입력" : "입력값으로 계산"}</small></dt><dd>{e.value}</dd></div>)}</dl>;
}
export function OperatingAnalysisResult({ analysis, chosenAction }: { analysis: OperatingAnalysis; chosenAction?: ChosenAction }) {
  if (!analysis.result) return null;
  return <div className={styles.result}>
    <p className={shared.meta}>{analysisTargetLabel(analysis.consent.target)}</p>
    {analysis.consent.target.provider === "mock" && <p className={shared.warning}>가상 응답으로 흐름을 검증하는 화면이에요 실제 AI 분석 결과는 아니에요</p>}
    <h3>AI가 제안한 해석</h3><p>{analysis.result.summary}</p>
    <p className={shared.note}>아래 내용은 확인이 필요한 가설이에요 입력한 실적이나 검증된 원인과는 달라요</p>
    {analysis.result.hypotheses.map((h, index) => <section className={styles.hypothesis} key={index}><h4>{h.title}</h4><p>{h.explanation}</p><p className={shared.note}>확인이 필요한 점: {h.uncertainty}</p><ul>{h.evidenceIds.map(id => { const e = analysis.input.evidence.find(item => item.id === id); return <li key={id}>{e?.label}: {e?.value}</li>; })}</ul></section>)}
    <details><summary>분석에 사용한 입력과 한계</summary><Evidence input={analysis.input} /><ul>{analysis.result.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul></details>
    {chosenAction && <><h3>사용자가 선택한 다음 행동</h3><dl className={shared.notes}><div><dt>개선 행동</dt><dd>{chosenAction.action}</dd></div><div><dt>확인 기준</dt><dd>{chosenAction.successCriterion}</dd></div></dl><details><summary>선택 전 AI 제안</summary><ol>{analysis.result.actions.map((a, i) => <li key={i}><strong>{a.title}</strong><p>{a.action}</p><p>확인 기준: {a.successCriterion}</p></li>)}</ol></details></>}
  </div>;
}
type Props = {
  planId: string; period: OperatingPeriod; baseline: OperatingPeriod | null; records: OperatingState;
  target: AnalysisTarget | null; onState: (records: OperatingState) => void;
  onArchive: (command: OperatingCommand) => Promise<boolean>; onDirtyChange: (dirty: boolean) => void;
};
export default function OperatingAnalysisPanel({ planId, period, baseline, records, target, onState, onArchive, onDirtyChange }: Props) {
  const [selection, setSelection] = useState<AnalysisSelection>({ feedback: false, notes: false });
  const [preview, setPreview] = useState<AnalysisPreview | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [chosen, setChosen] = useState<ChosenAction | null>(null);
  const [now, setNow] = useState(Date.now());
  const dialog = useRef<HTMLDialogElement>(null);
  const previewTitle = useRef<HTMLHeadingElement>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const requestId = useRef("");
  const archiveRequest = useRef({ key: "", id: "" });
  const analyses = records.analyses.filter(a => a.period.id === period.id);
  const analysis = analyses.find(a => a.id === selected) ?? analyses[0];
  const running = records.analyses.find(a => analysisIsRunning(a, now));
  const stale = !!analysis && JSON.stringify(analysis.reference) !== JSON.stringify(referenceFor(period, baseline));
  const saved = !!analysis && !!chosen && records.reports.some(r => r.analysis?.id === analysis.id && JSON.stringify(r.chosenAction) === JSON.stringify(chosen));

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onDirtyChange(busy || !!chosen && !saved); return () => onDirtyChange(false); }, [busy, chosen, saved, onDirtyChange]);
  useEffect(() => { if (preview) { dialog.current?.showModal(); previewTitle.current?.focus(); } else dialog.current?.close(); }, [preview]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => { setNow(Date.now()); void refresh(); }, 4000);
    return () => window.clearInterval(timer);
  }, [running?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function refresh() {
    try {
      const response = await fetch(`/api/plan/operations?planId=${encodeURIComponent(planId)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (alive.current) onState(data.records);
    } catch { if (alive.current) setError("저장 상태를 확인하지 못했어요 연결을 확인한 뒤 다시 확인해 주세요"); }
  }
  async function prepare() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/plan/operations/analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", planId, reference: referenceFor(period, baseline), selection }), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (alive.current) { setConsent(false); setPreview(data.preview); requestId.current = crypto.randomUUID(); }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "분석할 내용을 불러오지 못했어요"); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  async function generate() {
    if (!preview || !consent || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    setPreview(null);
    try {
      const response = await fetch("/api/plan/operations/analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", planId, id: requestId.current, reference: preview.reference, selection: preview.selection, consent: { accepted: true, version: preview.version, hash: preview.hash, target: preview.target } }), signal: AbortSignal.timeout(70000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (alive.current) { onState(data.records); setSelected(data.analysisId); setChosen(null); setNow(Date.now()); }
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error && !["TimeoutError", "AbortError", "TypeError"].includes(e.name) ? e.message : "분석 응답을 확인하지 못했어요 자동으로 다시 요청하지 않습니다 저장 상태를 먼저 확인해 주세요");
        await refresh();
      }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  async function archive() {
    if (!analysis || !chosen || pending.current) return;
    const value = { ...chosen, action: chosen.action.trim(), successCriterion: chosen.successCriterion.trim() };
    const key = JSON.stringify({ analysisId: analysis.id, chosenAction: value });
    if (archiveRequest.current.key !== key) archiveRequest.current = { key, id: crypto.randomUUID() };
    pending.current = true; setBusy(true);
    try { if (await onArchive({ action: "analysis-report", id: archiveRequest.current.id, analysisId: analysis.id, chosenAction: value }) && alive.current) setChosen(null); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return <section className={styles.panel} aria-label="AI 개선안">
    <header><h3>기록에서 다음 개선안으로</h3><p className={shared.note}>{target ? analysisTargetLabel(target) : "실제 AI 분석은 준비 중이에요 기간 기록과 직접 작성한 리포트는 계속 사용할 수 있어요"}</p></header>
    <fieldset disabled={busy || !!running || !!chosen}><legend>분석에 포함할 자료</legend><p className={shared.note}>사업명과 선택한 두 기간의 실적을 확인합니다 고객의 연락처 등 개인정보는 제외해 주세요</p><label className={styles.check}><input type="checkbox" checked={selection.feedback} onChange={e => setSelection({ ...selection, feedback: e.target.checked })} />고객 반응 포함</label><label className={styles.check}><input type="checkbox" checked={selection.notes} onChange={e => setSelection({ ...selection, notes: e.target.checked })} />작성한 메모 포함</label></fieldset>
    <button disabled={!target || busy || !!running || !!chosen} onClick={() => void prepare()}><ClipboardCheck size={18} />분석할 내용 확인</button>
    <p className={shared.note}>분석 요청은 사업별 최근 24시간에 최대 3회입니다 실패한 요청도 횟수에 포함돼요</p>
    {busy && <p role="status">요청을 처리하고 있어요 기간 기록은 이미 저장되어 있어요</p>}
    {running && <p role="status">분석 중이에요 완료된 결과는 이 사업의 분석 기록에 남아요</p>}
    {error && <div role="alert" className={shared.error}><p>{error}</p><button disabled={busy} onClick={() => { setError(""); void refresh(); }}><RefreshCw size={16} />저장 상태 확인</button></div>}
    {!!analyses.length && <label className={styles.history}>이 기간의 분석<select value={analysis?.id ?? ""} disabled={busy || !!chosen} onChange={e => { setSelected(e.target.value); setChosen(null); }}>{analyses.map(a => <option value={a.id} key={a.id}>{new Date(a.startedAt).toLocaleString("ko-KR")} · {a.status === "ready" ? "완료" : analysisIsRunning(a, now) ? "분석 중" : "미완료"}</option>)}</select></label>}
    {analysis && (analysis.status === "failed" || analysis.status === "running" && !analysisIsRunning(analysis, now)) && <p className={shared.warning}>{failureLabels[analysis.error ?? "timeout"] ?? "분석을 완료하지 못했어요"} 기존 기간 기록과 리포트는 그대로 남아 있어요 다시 요청하려면 분석할 내용을 새로 확인해 주세요</p>}
    {analysis?.status === "ready" && <>
      <OperatingAnalysisResult analysis={analysis} />
      {stale && <p className={shared.warning}>분석 이후 기간 기록이 바뀌었어요 이 결과는 이전 기록 기준입니다 최신 내용으로 다시 분석한 뒤 보관해 주세요</p>}
      <fieldset disabled={busy || stale}><legend>다음 기간에 해볼 행동 선택</legend>{analysis.result?.actions.map((a, index) => <label key={index} className={styles.actionOption}><input type="radio" name={`action-${period.id}`} checked={chosen?.index === index} onChange={() => setChosen({ index, action: a.action, successCriterion: a.successCriterion })} /><span><strong>{a.title}</strong><span>{a.action}</span></span></label>)}</fieldset>
      {chosen && <div className={styles.chosen}><label>선택한 개선 행동<textarea rows={3} value={chosen.action} maxLength={1500} disabled={busy} onChange={e => setChosen({ ...chosen, action: e.target.value })} /></label><label>선택한 확인 기준<textarea rows={3} value={chosen.successCriterion} maxLength={1000} disabled={busy} onChange={e => setChosen({ ...chosen, successCriterion: e.target.value })} /></label><p className={shared.note}>AI 제안과 위에서 확인한 행동을 함께 보관해요 기존 기간 기록은 변경하지 않아요</p><div className={shared.actions}><button className={shared.primary} disabled={busy || stale || saved || !chosen.action.trim() || !chosen.successCriterion.trim()} onClick={() => void archive()}><Archive size={18} />선택한 행동으로 리포트 보관</button><button disabled={busy} onClick={() => setChosen(null)}>선택 취소</button></div></div>}
    </>}
    <dialog ref={dialog} aria-labelledby="operating-analysis-preview-title" className={`${shared.dialog} ${styles.preview}`} onCancel={() => setPreview(null)}>
      {preview && <><h3 id="operating-analysis-preview-title" ref={previewTitle} tabIndex={-1}>분석할 내용을 확인해 주세요</h3><p>{analysisTargetLabel(preview.target)}</p><dl className={shared.notes}><div><dt>사업명</dt><dd>{preview.payload.businessTitle}</dd></div><div><dt>이번 기간</dt><dd>{preview.payload.currentPeriod}</dd></div><div><dt>이전 기간</dt><dd>{preview.payload.previousPeriod ?? "없음"}</dd></div></dl><Evidence input={preview.payload} /><ul>{preview.payload.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul><label className={styles.check}><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />{preview.target.provider === "mock" ? "위 자료로 로컬 모의 분석을 실행하는 데 동의해요 외부로 전송하지 않아요" : `위 자료를 ${preview.target.provider === "openai" ? "OpenAI" : "Anthropic"}에 전송해 개선안을 분석하는 데 동의해요`}</label><div className={shared.actions}><button onClick={() => setPreview(null)}>취소</button><button className={shared.primary} disabled={!consent || busy} onClick={() => void generate()}>동의하고 분석 시작</button></div></>}
    </dialog>
  </section>;
}
