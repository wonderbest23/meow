"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { artifactErrorMessage, artifactSlideText, type ArtifactCommand, type ArtifactPreview, type ArtifactUpdateView } from "../../../lib/plan-builder/artifact-updates";
import styles from "./ArtifactUpdatePanel.module.css";

type Choices = Record<string, "replace" | "keep">;
const statuses: Record<ArtifactUpdateView["status"], string> = { queued: "접수됨", running: "변경안 작성 중", ready: "비교 후 반영", failed: "작업 중단", stale: "원문 변경됨", cancelled: "닫은 변경안", applied: "반영됨" };
function Compare({ title, before, after, value, onChange, locked = false }: { title: string; before: string; after: string; value?: "replace" | "keep"; onChange(value: "replace" | "keep"): void; locked?: boolean }) {
  return <fieldset className={styles.compare}><legend>{title}{locked ? " · 잠긴 항목" : ""}</legend>
    <div className={styles.columns}><div><strong>기존 내용</strong><pre>{before || "아직 없음"}</pre></div><div><strong>변경안</strong><pre>{after || "자동 변경 없음"}</pre></div></div>
    <div className={styles.choices}><label><input type="radio" checked={value === "keep"} onChange={() => onChange("keep")} /> 기존 내용 유지</label><label><input type="radio" checked={value === "replace"} disabled={locked} onChange={() => onChange("replace")} /> 변경안 반영</label></div>
  </fieldset>;
}

export default function ArtifactUpdatePanel({ businessId }: { businessId?: string } = {}) {
  const [fallbackId, setFallbackId] = useState("");
  const planId = businessId ?? fallbackId;
  const [preview, setPreview] = useState<ArtifactPreview | null>(null), [jobs, setJobs] = useState<ArtifactUpdateView[]>([]), [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [consent, setConsent] = useState(false), [includeHomepage, setIncludeHomepage] = useState(false);
  const [documents, setDocuments] = useState<Choices>({}), [slides, setSlides] = useState<Choices>({}), [homepage, setHomepage] = useState<Choices>({});
  const lock = useRef(false), pending = useRef<ArtifactCommand | null>(null);
  useEffect(() => { if (!businessId) setFallbackId(new URLSearchParams(window.location.search).get("planId") ?? ""); }, [businessId]);
  const refresh = useCallback(async () => {
    if (!planId) return;
    const response = await fetch(`/api/plan/artifact-updates?planId=${encodeURIComponent(planId)}`, { cache: "no-store" });
    const result = await response.json(); if (!response.ok) throw new Error(result.message ?? "변경 기록을 불러오지 못했어요");
    setJobs(result.jobs); setSelected(previous => previous || result.jobs[0]?.id || "");
  }, [planId]);
  useEffect(() => { if (!planId) return; let alive = true; const load = () => { if (!document.hidden) void refresh().catch(error => { if (alive) setMessage(error.message); }); }; load(); const timer = setInterval(load, 5000); return () => { alive = false; clearInterval(timer); }; }, [planId, refresh]);
  const job = jobs.find(item => item.id === selected);
  useEffect(() => { setDocuments({}); setSlides({}); setHomepage({}); }, [selected]);
  async function compare() {
    if (lock.current) return; lock.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/plan/artifact-updates?planId=${encodeURIComponent(planId)}&preview=1`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.message);
      setPreview(data); setConsent(false); setIncludeHomepage(false); pending.current = null;
    } catch (error) { setMessage(error instanceof Error ? error.message : "변경 범위를 확인하지 못했어요"); }
    finally { lock.current = false; setBusy(false); }
  }
  async function send(command: ArtifactCommand) {
    if (lock.current) return; lock.current = true; setBusy(true); setMessage("");
    pending.current = command;
    try {
      const response = await fetch("/api/plan/artifact-updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, command }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message ?? artifactErrorMessage(data.code));
      pending.current = null; setSelected(data.job.id); setPreview(null); await refresh();
      setMessage(data.job.status === "applied" ? data.job.staleItems?.length ? "선택한 항목을 반영했어요. 유지한 이전 내용은 아직 최신이 아니에요" : "반영했어요. 홈페이지 공개는 별도로 진행해 주세요" : "요청을 저장했어요");
    } catch (error) { setMessage(error instanceof Error ? error.message : "응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요"); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!planId) return null;
  const ready = job?.status === "ready";
  const allChosen = job && job.preview.documents.every(item => documents[item.key]) && job.preview.slides.every(item => slides[item.id]) && (!job.preview.homepage || job.preview.homepage.changed.every(id => homepage[id]));
  const aiNeeded = preview && (preview.documents.some(item => !item.locked) || preview.slides.length > 0);
  return <section className={styles.panel} aria-label="결과물 변경 관리"><header><h3>결과물 함께 수정하기</h3><button onClick={() => void compare()} disabled={busy}><RefreshCw size={17} /> 변경 범위 확인</button></header>
    {message && <p role="status">{message}</p>}
    {pending.current && !busy && <button onClick={() => void send(pending.current!)}><RefreshCw size={16} /> 같은 요청 다시 확인</button>}
    {preview && <div className={styles.preview}>
      <p>사업계획서 {preview.documents.length}항목 · PPT {preview.slides.length}장 · 홈페이지 {preview.homepage?.changed.length ?? 0}항목</p>
      {!!preview.documents.filter(item => item.locked).length && <p>잠긴 문서는 유지하며 최신 상태로 처리하지 않아요</p>}
      <details><summary>전송 자료와 변경 대상</summary><pre>{JSON.stringify({ sources: preview.sources, documents: preview.documents, slides: preview.slides }, null, 2)}</pre></details>
      {preview.homepage && <label><input type="checkbox" checked={includeHomepage} onChange={event => setIncludeHomepage(event.target.checked)} /> 홈페이지 초안도 함께 비교</label>}
      {aiNeeded && <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> {preview.target ? `${preview.target.provider} ${preview.target.model}에 선택한 사업 자료를 전송하는 데 동의합니다` : "AI 연동 갱신은 아직 제공 준비 중이에요"}</label>}
      <button disabled={busy || Boolean(aiNeeded && (!preview.target || !consent))} onClick={() => void send({ type: "generate", id: crypto.randomUUID(), hash: preview.hash, base: preview.base, consent: true, includeHomepage })}>변경안 만들기</button>
    </div>}
    {!!jobs.length && <label className={styles.history}>변경 기록<select value={selected} onChange={event => setSelected(event.target.value)}>{jobs.map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString("ko-KR")} · {statuses[item.status]}</option>)}</select></label>}
    {job && <div>
      <p>{statuses[job.status]} · 완료 {job.chunks.filter(chunk => chunk.status === "complete").length} / {job.chunks.length}</p>
      {job.error && <p>{artifactErrorMessage(job.error)}</p>}
      {job.staleItems?.length ? <p>이전 내용 유지 {job.staleItems.length}항목 · 최신 정보 반영 필요</p> : null}
      {job.chunks.length > 0 && <progress max={job.chunks.length} value={job.chunks.filter(chunk => chunk.status === "complete").length} aria-label="완료된 변경 작업" />}
      {ready && <>
        {job.preview.documents.map(item => <Compare key={item.id} title={item.title} before={item.before} after={job.documents.find(draft => draft.key === item.key)?.markdown ?? ""} locked={item.locked} value={documents[item.key]} onChange={value => setDocuments(previous => ({ ...previous, [item.key]: value }))} />)}
        {job.preview.slides.map(item => <Compare key={item.id} title={`PPT · ${item.title}`} before={item.before} after={artifactSlideText(job.slides.find(slide => slide.id === item.id))} value={slides[item.id]} onChange={value => setSlides(previous => ({ ...previous, [item.id]: value }))} />)}
        {job.preview.homepage?.sourcePreview.changes.map(item => <Compare key={item.id} title={`홈페이지 · ${item.label}${item.conflict ? " · 직접 수정됨" : ""}`} before={item.before} after={item.after} value={homepage[item.id]} onChange={value => setHomepage(previous => ({ ...previous, [item.id]: value }))} />)}
        <button disabled={busy || !allChosen} onClick={() => void send({ type: "approve", id: job.id, expectedRevision: job.revision, base: job.preview.base, documents, slides, homepage: Object.values(homepage).some(choice => choice === "replace") ? "replace" : "keep", homepageChoices: homepage })}><Check size={17} /> 선택한 변경 반영</button>
      </>}
      {["failed", "queued", "running"].includes(job.status) && <button disabled={busy} onClick={() => void send({ type: "resume", id: job.id, expectedRevision: job.revision, consent: true })}><RefreshCw size={17} /> 같은 작업 이어서 확인</button>}
      {!["applied", "cancelled"].includes(job.status) && <button disabled={busy} onClick={() => void send({ type: "cancel", id: job.id, expectedRevision: job.revision })}><X size={17} /> 변경안 닫기</button>}
    </div>}
  </section>;
}
