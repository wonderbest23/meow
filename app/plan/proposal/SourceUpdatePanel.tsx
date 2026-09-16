"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, FileDiff, LoaderCircle, X } from "lucide-react";
import type { SavedProposal } from "../../../lib/plan-builder/proposal-editor";
import { rewriteErrorMessage, rewriteExpired, type RewriteCommand, type RewritePreview } from "../../../lib/plan-builder/proposal-rewrite";
import { renderableProposal } from "../../../lib/plan-builder/proposal-revision";
import type { DeckSlide } from "../../../lib/plan-builder/deck-plan";
import styles from "./proposal.module.css";

function SlideContent({ slide, previous }: { slide: DeckSlide; previous?: DeckSlide }) {
  return <div className={styles.reviewContent}><h4 data-changed={previous && slide.title !== previous.title || undefined}>{slide.title}</h4>{slide.lead && <p data-changed={previous && slide.lead !== previous.lead || undefined}>{slide.lead}</p>}
    {slide.points?.map((point, index) => <p key={index} data-changed={previous && JSON.stringify(point) !== JSON.stringify(previous.points?.[index]) || undefined}><strong>{point.label}</strong> {point.detail}</p>)}
    {slide.table && <div className={styles.reviewTable}><table><thead><tr>{slide.table.headers.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead><tbody>{slide.table.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} data-changed={previous && previous.table?.rows[index]?.[column] !== cell || undefined}>{cell}</td>)}</tr>)}</tbody></table></div>}
    {slide.metrics?.map((metric, index) => <p key={index}>{metric.label} <strong>{metric.value}</strong> {metric.note}</p>)}
    {slide.note && <small>{slide.note}</small>}
  </div>;
}

export default function SourceUpdatePanel({ planId, saved, sourceChanged, canUpdate, onUpdated, onWorking }: {
  planId: string; saved: Omit<SavedProposal, "receipts">; sourceChanged: boolean; canUpdate: boolean;
  onUpdated(): Promise<void>; onWorking(value: boolean): void;
}) {
  const [open, setOpen] = useState(false), [preview, setPreview] = useState<RewritePreview | null>(null);
  const [loading, setLoading] = useState(false), [message, setMessage] = useState("");
  const [choices, setChoices] = useState<Record<string, "keep_manual" | "use_revised">>({});
  const [consent, setConsent] = useState(false);
  const generationRequest = useRef<Extract<RewriteCommand, { type: "generate" }> | null>(null);
  const job = saved.rewrite;
  const retainedCharts = renderableProposal(saved.document).slides.filter(slide => slide.chart && saved.document.retainedSlideIds?.includes(slide.id!));
  const pending = !!job && ["running", "ready", "failed"].includes(job.status);
  const expired = job && rewriteExpired(job);
  const impact = job?.status === "ready" ? job.preview.impact : preview?.impact;
  useEffect(() => { setPreview(null); setChoices({}); }, [saved.revision]);
  useEffect(() => { setConsent(false); generationRequest.current = null; }, [preview?.hash]);
  useEffect(() => {
    if (job?.status !== "running" || expired) return;
    const timer = setInterval(() => { if (!document.hidden) void onUpdated(); }, 4000);
    return () => clearInterval(timer);
  }, [job?.status, expired, onUpdated]);

  async function inspect() {
    setOpen(true); setLoading(true); setMessage("");
    try {
      const response = await fetch(`/api/plan/proposal?planId=${encodeURIComponent(planId)}&preview=source`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message); setPreview(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "변경분을 불러오지 못했어요"); } finally { setLoading(false); }
  }
  async function command(value: RewriteCommand) {
    if (!canUpdate || loading) return;
    setLoading(true); onWorking(true); setMessage("");
    try {
      const response = await fetch("/api/plan/proposal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, command: value }), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) { if (response.status < 500) generationRequest.current = null; throw new Error(data.message); }
      generationRequest.current = null; setPreview(null); setOpen(value.type === "generate");
    } catch (error) { setMessage(error instanceof Error ? error.message : "응답을 확인하지 못했어요. 저장된 처리 상태를 다시 불러옵니다"); }
    finally { await onUpdated(); setLoading(false); onWorking(false); }
  }
  if (!sourceChanged && !pending) return null;
  return <section className={styles.sourceUpdate} aria-label="원문 변경 반영">
    {retainedCharts.length > 0 && <p role="status">차트 확인 필요 {retainedCharts.length}개 페이지. 본문 갱신은 차트 값을 바꾸거나 최신으로 확인하지 않습니다</p>}
    <div className={styles.updateHeading}><FileDiff size={19} /><div><strong>{job?.status === "ready" ? "검토할 새 문안이 있어요" : "원문과 제안서의 변경분"}</strong><p>현재 제안서는 승인 전까지 그대로 유지됩니다</p></div>
      <button disabled={!canUpdate || loading} onClick={() => { if (open) setOpen(false); else if (pending) setOpen(true); else void inspect(); }}>{open ? "접기" : job?.status === "ready" ? "새 문안 검토" : "변경분 확인"}</button>
      <Link href={`/plan/document?planId=${encodeURIComponent(planId)}`}>원문 수정</Link>
      <Link href={`/plan/workspace?planId=${encodeURIComponent(planId)}&tab=documents`}>결과물 변경 관리</Link>
    </div>
    {open && <div className={styles.updateBody}>
      {message && <p role="alert">{message}</p>}
      {loading && <p role="status"><LoaderCircle className={styles.spin} size={16} />처리 상태 확인 중</p>}
      {job?.status === "running" && <p role="status">{expired ? rewriteErrorMessage("timeout") : job.claimedAt ? "새 문안 작성 중이에요. 저장된 요청으로 상태를 확인합니다" : "요청을 저장했어요. 실행 접수를 기다리는 동안 기존 제안서는 그대로 보관됩니다"}</p>}
      {job?.status === "running" && !job.claimedAt && !expired && <button disabled={loading || !canUpdate} onClick={() => void command({ type: "generate", id: job.id, hash: job.preview.hash, consent: true })}>같은 요청으로 실행 접수 확인</button>}
      {job?.status === "failed" && <p role="alert">{rewriteErrorMessage(job.error)}</p>}
      {pending && job?.status !== "ready" && <button disabled={loading || !canUpdate} onClick={() => void command({ type: "dismiss", id: job!.id })}><X size={16} />{job?.status === "running" && !expired ? "결과 반영 취소" : "검토 닫기"}</button>}
      {impact && <><div className={styles.updateSummary}><span>연관 페이지 {impact.affected.length}장</span><span>이미지와 배치 유지</span><span>직접 수정한 문안 {impact.affected.filter(slide => slide.textConflict).length}장</span></div>
        <details className={styles.sourceDiff}><summary>바뀐 원문 {impact.changedSections.length}개</summary>{(job?.status === "ready" ? job.preview : preview)?.payload.changes.map(change => <section key={change.section}><h3>{change.section}</h3><div className={styles.compare}><div><small>이전</small><pre>{change.before || "없음"}</pre></div><div><small>현재</small><pre>{change.after || "삭제됨"}</pre></div></div></section>)}</details>
      </>}
      {job?.status === "ready" && <><div className={styles.reviewPages}>{job.preview.impact.affected.map(item => {
        const before = renderableProposal(saved.document).slides.find(slide => slide.id === item.slideId) ?? saved.document.deck.slides.find(slide => slide.id === item.slideId)!;
        const after = job.slides!.find(slide => slide.id === item.slideId)!;
        return <article key={item.slideId}><h3>{before.eyebrow || item.title}</h3><div className={styles.compare}><div><small>현재 저장본</small><SlideContent slide={before} /></div><div><small>원문을 반영한 문안</small><SlideContent slide={after} previous={before} /></div></div>
          {before.chart && <p role="status">차트 값은 이번 문안 갱신에 포함되지 않아 그대로 보관됩니다. 본문을 교체해도 차트가 있는 페이지는 최신 확인이 필요한 상태로 남습니다</p>}
          {item.textConflict && <fieldset><legend>직접 수정한 항목이나 확인할 차트가 있어요</legend><label><input type="radio" name={item.slideId} checked={choices[item.slideId] === "keep_manual"} onChange={() => setChoices({ ...choices, [item.slideId]: "keep_manual" })} />내 문안 유지</label><label><input type="radio" name={item.slideId} checked={choices[item.slideId] === "use_revised"} onChange={() => setChoices({ ...choices, [item.slideId]: "use_revised" })} />새 문안으로 교체</label>{choices[item.slideId] === "keep_manual" && <p>직접 고친 항목은 이전 가격이나 조건이 남을 수 있어요. 유지할 내용을 확인해 주세요</p>}</fieldset>}
        </article>;
      })}</div><div className={styles.updateActions}><button disabled={loading || !canUpdate} onClick={() => void command({ type: "dismiss", id: job.id })}><X size={16} />반영하지 않기</button><button className={styles.primary} disabled={loading || !canUpdate || job.preview.impact.affected.some(item => item.textConflict && !choices[item.slideId])} onClick={() => void command({ type: "apply", id: job.id, expectedRevision: saved.revision, choices })}><Check size={16} />확인한 문안 반영</button></div></>}
      {preview && !pending && <><ul className={styles.impactList}>{preview.impact.affected.map(item => <li key={item.slideId}>{item.title}{item.textConflict && <small>직접 수정한 문안 있음</small>}</li>)}</ul>
        <section className={styles.transmission} aria-label="AI 전송 자료 확인"><h3>AI에 보낼 자료</h3><p>사업명과 설명, 관련 원문 {preview.payload.sources.length}개, 변경 전후 내용, 슬라이드 {preview.payload.slides.length}장의 기본 문안을 보냅니다. 이미지와 배치 좌표, 직접 편집한 문안은 제외합니다</p>
          <details className={styles.sourceDiff}><summary>전송 자료 전체 보기</summary><pre>{JSON.stringify(preview.payload, null, 2)}</pre></details>
          <p>{preview.target ? `전송 대상: ${preview.target.provider} · ${preview.target.model}` : "현재 실제 사업 자료의 외부 AI 전송은 닫혀 있어요"}</p>
          <p>작성과 검수에 최대 2회 요청하며 생성된 문안도 같은 대상으로 전송합니다. 원문이나 전송 대상이 바뀌면 다시 확인합니다</p>
          <label><input type="checkbox" checked={consent} disabled={!preview.target || loading} onChange={event => setConsent(event.target.checked)} />위 자료를 확인했고 표시된 AI로 전송하는 데 동의합니다</label>
          <div className={styles.updateActions}><button className={styles.primary} disabled={!preview.target || !consent || loading || !canUpdate} onClick={() => { const request = generationRequest.current ?? { type: "generate" as const, id: crypto.randomUUID(), hash: preview.hash, consent: true as const }; generationRequest.current = request; void command(request); }}>{generationRequest.current ? "같은 요청 상태 확인" : "동의한 자료로 새 문안 작성"}</button></div>
        </section>
      </>}
    </div>}
  </section>;
}
