"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, FilePenLine, LoaderCircle, X } from "lucide-react";
import type { BusinessConditionsView } from "../../../lib/plan-builder/proposal-business";
import type { SavedProposal } from "../../../lib/plan-builder/proposal-editor";
import { documentRefreshError, documentRefreshExpired, type DocumentRefreshCommand, type DocumentRefreshPreview } from "../../../lib/plan-builder/document-refresh";
import styles from "./proposal.module.css";

export default function DocumentRefreshPanel({ planId, business, saved, canUpdate, onUpdated, onWorking }: {
  planId: string; business: BusinessConditionsView; saved: Omit<SavedProposal, "receipts">; canUpdate: boolean;
  onUpdated(): Promise<void>; onWorking(value: boolean): void;
}) {
  const [open, setOpen] = useState(false), [keys, setKeys] = useState<string[]>([]);
  const [preview, setPreview] = useState<DocumentRefreshPreview | null>(null), [consent, setConsent] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, "replace" | "keep">>({});
  const [loading, setLoading] = useState(false), [message, setMessage] = useState("");
  const request = useRef<Extract<DocumentRefreshCommand, { type: "document_generate" }> | null>(null);
  const job = saved.documentRefresh;
  const pending = !!job && ["running", "ready", "failed"].includes(job.status);
  const candidates = business.documents.items.filter(item => !item.current);
  useEffect(() => { setPreview(null); setConsent(false); setKeys([]); request.current = null; }, [business.revision]);
  useEffect(() => { setDecisions({}); }, [job?.id]);
  useEffect(() => {
    if (job?.status !== "running" || documentRefreshExpired(job)) return;
    const timer = setInterval(() => { if (!document.hidden) void onUpdated(); }, 4000);
    return () => clearInterval(timer);
  }, [job, onUpdated]);
  async function inspect() {
    setLoading(true); setMessage(""); setConsent(false); request.current = null;
    try {
      const query = new URLSearchParams({ planId, preview: "document" }); keys.forEach(key => query.append("section", key));
      const response = await fetch(`/api/plan/proposal?${query}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message); setPreview(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "갱신할 자료를 불러오지 못했어요"); }
    finally { setLoading(false); }
  }
  async function command(value: DocumentRefreshCommand) {
    if (!canUpdate || loading) return;
    setLoading(true); onWorking(true); setMessage("");
    try {
      const response = await fetch("/api/plan/proposal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, command: value }), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) { if (response.status < 500) request.current = null; throw new Error(data.message); }
      request.current = null; setPreview(null); setConsent(false); setKeys([]); setDecisions({});
      setOpen(value.type === "document_generate");
    } catch (error) { setMessage(error instanceof Error ? error.message : "응답을 확인하지 못했어요. 저장된 요청 상태를 다시 불러옵니다"); }
    finally { await onUpdated(); setLoading(false); onWorking(false); }
  }
  if (!candidates.length && !pending) return null;
  return <section className={styles.sourceUpdate} aria-label="계획서 갱신 검토">
    <div className={styles.updateHeading}><FilePenLine size={19} /><div><strong>{job?.status === "ready" ? "검토할 계획서 변경안이 있어요" : "바뀐 조건을 계획서에 반영"}</strong><p>기존 본문은 항목별로 승인한 뒤에만 바뀝니다</p></div><button disabled={!canUpdate || loading} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "접기" : job?.status === "ready" ? "본문 변경안 검토" : "계획서 갱신"}</button></div>
    {open && <div className={styles.updateBody}>
      {message && <p role="alert">{message}</p>}
      {loading && <p role="status"><LoaderCircle size={16} className={styles.spin} />요청 상태 확인 중</p>}
      {job?.status === "running" && <p role="status">{documentRefreshExpired(job) ? documentRefreshError("timeout") : job.claimedAt ? "새 본문을 작성 중이에요. 기존 문서는 그대로 보관되어 있어요" : "요청을 저장했어요. 실행 접수를 기다리는 동안 기존 문서는 그대로 보관됩니다"}</p>}
      {job?.status === "running" && !job.claimedAt && !documentRefreshExpired(job) && <button disabled={loading || !canUpdate} onClick={() => void command({ type: "document_generate", id: job.id, hash: job.preview.hash, sections: job.preview.sections.map(section => section.key), consent: true })}>같은 요청으로 실행 접수 확인</button>}
      {job?.status === "failed" && <p role="alert">{documentRefreshError(job.error)}</p>}
      {pending && job?.status !== "ready" && <button disabled={loading || !canUpdate} onClick={() => void command({ type: "document_dismiss", id: job!.id })}><X size={16} />검토 닫기</button>}
      {!pending && <>
        {preview && <p>작성과 검토에 최대 2회 요청하며 새로 작성한 본문도 같은 AI로 전송합니다. 승인 전까지 기존 문서는 바뀌지 않습니다</p>}
        <fieldset className={styles.documentSelection} disabled={loading || !canUpdate}><legend>갱신할 항목 <span>{keys.length} / 3</span></legend>{candidates.map(item => <label key={item.key}><input type="checkbox" checked={keys.includes(item.key)} disabled={item.locked || (!keys.includes(item.key) && keys.length >= 3)} onChange={event => { setKeys(event.target.checked ? [...keys, item.key] : keys.filter(key => key !== item.key)); setPreview(null); setConsent(false); request.current = null; }} /><span>{item.title}<small>{item.locked ? "잠금 항목은 문서에서 직접 확인" : item.manual ? "직접 수정한 본문 있음" : "최신 조건 반영 필요"}</small></span></label>)}</fieldset>
        <div className={styles.updateActions}><Link href={`/plan/document?planId=${encodeURIComponent(planId)}`}>문서 직접 확인</Link><Link href={`/plan/workspace?planId=${encodeURIComponent(planId)}&tab=documents`}>운영 실적과 결과물 변경 관리</Link><button disabled={!keys.length || loading || !canUpdate} onClick={() => void inspect()}>선택한 전송 자료 확인</button></div>
        {preview && <section className={styles.transmission} aria-label="계획서 전송 자료 확인"><h3>보낼 자료 확인</h3><p>공통 사업 조건과 예상 손익 기준, 선택한 {preview.sections.length}개 항목의 기존 본문을 사용합니다. 대화 전체와 다른 문서 항목은 보내지 않습니다</p><details className={styles.sourceDiff}><summary>문서 전송 자료 전체 보기</summary><pre>{JSON.stringify(preview.payload, null, 2)}</pre></details><p>{preview.target ? `전송 대상: ${preview.target.provider} · ${preview.target.model}` : "현재 실제 사업 자료의 외부 AI 전송은 닫혀 있어요"}</p><label><input type="checkbox" checked={consent} disabled={!preview.target || loading} onChange={event => setConsent(event.target.checked)} />표시된 사업 조건과 본문을 확인했고 AI 전송에 동의합니다</label><div className={styles.updateActions}><button className={styles.primary} disabled={!preview.target || !consent || loading || !canUpdate} onClick={() => { const value = request.current ?? { type: "document_generate" as const, id: crypto.randomUUID(), hash: preview.hash, sections: preview.sections.map(section => section.key), consent: true as const }; request.current = value; void command(value); }}>{request.current ? "같은 문서 요청 확인" : "동의한 자료로 본문 갱신"}</button></div></section>}
      </>}
      {job?.status === "ready" && <>
        <div className={styles.reviewPages}>{job.preview.payload.sections.map(section => {
          const draft = job.drafts!.find(item => item.key === section.key)!;
          const manual = job.preview.sections.find(item => item.key === section.key)?.manual;
          return <article key={section.key}><h3>{section.chapterTitle} · {section.sectionTitle}</h3><p className={styles.draftSummary}>{draft.summary}</p><div className={styles.compare}><div><small>현재 저장된 본문{manual ? " · 직접 수정함" : ""}</small><pre className={styles.documentText}>{section.markdown || "본문 없음"}</pre></div><div><small>새 사업 조건을 반영한 본문</small><pre className={styles.documentText}>{draft.markdown}</pre></div></div><fieldset><legend>{manual ? "직접 수정한 내용의 처리 방법" : "이 항목에 반영할 본문"}</legend><label><input type="radio" name={`document-${section.key}`} checked={decisions[section.key] === "replace"} onChange={() => setDecisions({ ...decisions, [section.key]: "replace" })} />새 본문으로 교체</label><label><input type="radio" name={`document-${section.key}`} disabled={!section.markdown} checked={decisions[section.key] === "keep"} onChange={() => setDecisions({ ...decisions, [section.key]: "keep" })} />현재 본문을 최신 조건으로 확인하고 유지</label>{decisions[section.key] === "keep" && <p>현재 본문에 이전 가격이나 조건이 남지 않았는지 직접 확인해 주세요</p>}</fieldset></article>;
        })}</div><div className={styles.updateActions}><button disabled={loading || !canUpdate} onClick={() => void command({ type: "document_dismiss", id: job.id })}><X size={16} />반영하지 않기</button><button className={styles.primary} disabled={loading || !canUpdate || job.preview.sections.some(section => !decisions[section.key])} onClick={() => void command({ type: "document_apply", id: job.id, expectedRevision: saved.revision, decisions })}><Check size={16} />선택한 본문 반영</button></div>
      </>}
    </div>}
  </section>;
}
