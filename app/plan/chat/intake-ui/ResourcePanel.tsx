"use client";
import { RESOURCE_ANSWER_IDS, RESOURCE_KEYS, RESOURCE_LABELS, type ResourceKey, type ResourceContext } from "../../../../lib/plan-builder/intake-candidate-resources";
import { parseResourceLimit, type ResourceFit } from "../../../../lib/plan-builder/intake-candidate-fit";
import type { IntakeCommand, IntakeSnapshot } from "../../../../lib/plan-builder/intake-types";
import type { IntakeDraft } from "./model";
import styles from "./resource-panel.module.css";

export function ResourceFitDetails({ fit, compact = false }: { fit?: ResourceFit; compact?: boolean }) {
  if (!fit) return null;
  if (compact) return <span className={styles.fit} data-resource-status={fit.status}><span data-fit={fit.status}>{fit.status === "exceeded" ? "예산·시간 조건을 넘는 항목이 있어요" : fit.status === "conditional" ? "예산·시간에 따라 조건부로 가능해요" : fit.checked < RESOURCE_KEYS.length ? "예산·시간은 아직 확인이 필요해요" : "입력한 예산·시간 범위에 맞아요"}</span></span>;
  return <span className={styles.fit} data-resource-status={fit.status}>{RESOURCE_KEYS.map(key => <span key={key} data-metric={key} data-fit={fit.metrics[key].status}>{fit.metrics[key].message}</span>)}</span>;
}

export function ResourcePanel({ snapshot, draft, disabled, onDraft, onCommand }: { snapshot: IntakeSnapshot; draft: IntakeDraft["resourceEditor"]; disabled: boolean; onDraft: (draft: NonNullable<IntakeDraft["resourceEditor"]>) => void; onCommand: (command: Omit<IntakeCommand, "revision" | "requestId" | "planId">) => void }) {
  const savedLimits = Object.fromEntries(RESOURCE_KEYS.map(key => { const a = snapshot.intake.answers[RESOURCE_ANSWER_IDS[key]]; return [key, a ? a.status === "unknown" ? a.quote ?? "" : a.quote || String(a.value ?? "") : snapshot.coach.fields.find(f => f.key === RESOURCE_ANSWER_IDS[key])?.value ?? ""]; }));
  const limits = draft?.limits ?? savedLimits;
  const context: ResourceContext = draft?.context ?? snapshot.intake.resourceContext ?? { variant: "", region: "", scale: "" };
  const assessment = snapshot.resourceAssessment;
  const candidates = [...new Map([...snapshot.candidateIdeas, ...assessment?.excluded ?? []].map(i => [i.id, i])).values()];
  const quote = draft?.quote;
  const quoteChange = (patch: Partial<NonNullable<typeof quote>>) => quote && onDraft({ ...draft, quote: { ...quote, ...patch } });
  const completeContext = Object.values(context).every(v => v.trim());
  return <section className={styles.panel} aria-label="예산과 시간 평가">
    {assessment?.allUnknown && <p role="status">예산·시간은 아직 확인이 필요해요.</p>}
    {assessment?.selected && !assessment.allUnknown && <ResourceFitDetails fit={assessment.selected.resourceFit} compact />}
    <details>
    <summary>예산·시간 확인 및 수정</summary>
    <details className={styles.editor}>
      <summary>예산·시간 조건 수정</summary>
      <form onSubmit={e => { e.preventDefault(); onCommand({ action: "resources", resourceLimits: limits, ...(completeContext ? { resourceContext: context } : {}) }); }}>
        <fieldset disabled={disabled} className={styles.fields}><legend className={styles.srOnly}>가용 자원</legend>{RESOURCE_KEYS.map(key => { const parsed = parseResourceLimit(limits[key], key); return <label key={key}>{RESOURCE_LABELS[key]}<input aria-label={RESOURCE_LABELS[key]} value={limits[key] ?? ""} placeholder={key.includes("Cost") ? "미정 또는 금액 범위" : "미정 또는 시간 범위"} maxLength={120} onChange={e => onDraft({ ...draft, limits: { ...limits, [key]: e.target.value } })} /><small>{parsed.status === "invalid" ? parsed.reason : key === "initialCost" ? "원 · 한 번 준비하는 비용" : key === "monthlyOperatingCost" ? "원 · 한 달 운영비" : key === "preparationHours" ? "시간 · 준비 기간 전체" : "시간 · 일주일 운영"}</small></label>; })}</fieldset>
        <fieldset disabled={disabled} className={styles.fields}><legend>적용 조건</legend>{([['variant','운영 방식'],['region','지역'],['scale','규모']] as const).map(([key,label]) => <label key={key}>{label}<input aria-label={label} value={context[key]} maxLength={key === 'region' ? 100 : 160} onChange={e => onDraft({ ...draft, context: { ...context, [key]: e.target.value } })} /></label>)}</fieldset>
        <button type="submit" disabled={disabled || Object.values(context).some(v => v.trim()) && !completeContext}>조건 저장</button>
      </form>
    </details>
    {assessment?.allUnknown && <p>조건에 맞는 근거 자료가 부족해요. 필요한 비용이나 시간이 0이라는 뜻은 아니에요.</p>}
    {assessment?.selected && <div className={styles.selected} data-selected-resource={assessment.selected.id}><strong>선택한 사업 유지 · {snapshot.coach.business.name || assessment.selected.title}</strong>{assessment.selected.retained || assessment.selected.resourceFit?.status === "exceeded" ? <p>변경된 조건 검토 필요 · 사업명과 설명은 바꾸지 않았어요</p> : null}<ResourceFitDetails fit={assessment.selected.resourceFit} /></div>}
    {assessment?.excludedCount ? <details><summary>조건 초과 후보 {assessment.excludedCount}개</summary>{assessment.excluded.map(i => <div key={i.id} className={styles.candidate}><strong>{i.title}</strong><ResourceFitDetails fit={i.resourceFit} /></div>)}</details> : null}
    {candidates.length > 0 && <details><summary>후보별 자원 근거</summary>{candidates.map(i => <div key={i.id} className={styles.candidate}><strong>{i.title}</strong><ResourceFitDetails fit={i.resourceFit} />{RESOURCE_KEYS.map(key => { const source = i.resourceFit?.metrics[key].evidence?.source; return source ? <small key={key}>{RESOURCE_LABELS[key]} · {source.kind === "user-confirmed" ? "사용자 확인 견적" : "공개 자료"} · {source.reference} · 확인 {source.reviewedAt.slice(0,10)}</small> : null; })}</div>)}</details>}
    {!quote ? <button type="button" disabled={disabled || !candidates.length} onClick={() => onDraft({ ...draft, quote: { candidateId: candidates[0].id, metric: "initialCost", raw: "", context, reference: "", includedItems: "", excludedItems: "", complete: false, confirmed: false, expiresAt: "" } })}>확인한 견적 연결</button> : <form className={styles.quote} onSubmit={e => { e.preventDefault(); if (!quote.confirmed || !completeContext) return; onCommand({ action: "resources", resourceQuote: { ...quote, confirmed: true, context, expiresAt: new Date(`${quote.expiresAt.slice(0,10)}T23:59:59+09:00`).toISOString() } }); }}>
      <fieldset disabled={disabled} className={styles.fields}><legend>직접 확인한 필요 자원</legend>
        <label>사업 후보<select aria-label="견적 사업 후보" value={quote.candidateId} onChange={e => quoteChange({ candidateId: e.target.value })}>{candidates.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></label>
        <label>견적 항목<select aria-label="견적 항목" value={quote.metric} onChange={e => quoteChange({ metric: e.target.value as ResourceKey })}>{RESOURCE_KEYS.map(k => <option key={k} value={k}>{RESOURCE_LABELS[k]}</option>)}</select></label>
        <label>필요량 또는 범위<input aria-label="필요량 또는 범위" required value={quote.raw} onChange={e => quoteChange({ raw: e.target.value })} maxLength={120} /></label>
        <label>출처·견적서 이름<input aria-label="출처·견적서 이름" required value={quote.reference} onChange={e => quoteChange({ reference: e.target.value })} maxLength={1000} /></label>
        <label>포함 항목<input aria-label="포함 항목" required value={quote.includedItems} onChange={e => quoteChange({ includedItems: e.target.value })} maxLength={1000} /></label>
        <label>미포함·미확인 항목<input aria-label="미포함·미확인 항목" value={quote.excludedItems} onChange={e => quoteChange({ excludedItems: e.target.value })} maxLength={1000} /></label>
        <label>견적 유효 종료일<input aria-label="견적 유효 종료일" required type="date" value={quote.expiresAt.slice(0,10)} onChange={e => quoteChange({ expiresAt: e.target.value })} /></label>
        <label className={styles.check}><input type="checkbox" checked={quote.complete} onChange={e => quoteChange({ complete: e.target.checked })} />이 항목의 전체 필요량을 확인했어요</label>
        <label className={styles.check}><input type="checkbox" checked={quote.confirmed} onChange={e => quoteChange({ confirmed: e.target.checked })} />이 운영 방식·지역·규모에 적용되는 견적을 직접 확인했어요</label>
      </fieldset>
      {!completeContext && <p>적용할 운영 방식·지역·규모를 먼저 입력해 주세요</p>}
      <button type="submit" disabled={disabled || !quote.confirmed || !completeContext || !quote.expiresAt || parseResourceLimit(quote.raw, quote.metric).status !== "known"}>견적 저장</button>
    </form>}
    </details>
  </section>;
}
