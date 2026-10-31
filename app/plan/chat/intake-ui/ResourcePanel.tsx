"use client";
import { RESOURCE_KEYS, RESOURCE_LABELS, type ResourceKey, type ResourceContext } from "../../../../lib/plan-builder/intake-candidate-resources";
import { parseResourceLimit, type ResourceFit } from "../../../../lib/plan-builder/intake-candidate-fit";
import type { IntakeCommand, IntakeSnapshot } from "../../../../lib/plan-builder/intake-types";
import { changedResourceLimits, savedResourceLimits, type IntakeDraft } from "./model";
import styles from "./resource-panel.module.css";
import { AppButton } from "../../../../components/app-button";

/*
 * 고객 화면에는 한 줄 요약만 보인다. 예전엔 '적용 가능한 자료 부족'이 항목마다 네 번 나오고,
 * 예산(1,000만원)·주당 시간(25시간)을 이미 답했는데도 '아직 확인이 필요해요'라고 했다 —
 * checked는 '이 사업에 드는 비용 자료가 있는 항목 수'라 답했는지와는 관계가 없었다.
 */
const answeredAny = (fit: ResourceFit) => RESOURCE_KEYS.some(key => fit.metrics[key].limit.status === "known");
export function resourceFitLine(fit: ResourceFit | undefined, answered = fit ? answeredAny(fit) : false): string {
  if (fit?.status === "exceeded") return "적어 주신 예산·시간보다 더 들 수 있어요";
  if (fit?.status === "conditional") return "적어 주신 예산·시간으로 하려면 규모를 맞춰야 할 수 있어요";
  if (fit?.status === "fits") return "적어 주신 예산·시간 안에서 시작할 수 있어요";
  return answered ? "적어 주신 예산·시간에 맞춰 정리해요" : "예산·시간을 알려 주시면 거기에 맞춰 정리해요";
}

export function ResourceFitDetails({ fit, compact = false }: { fit?: ResourceFit; compact?: boolean }) {
  if (!fit) return null;
  if (compact) return <span className={styles.fit} data-resource-status={fit.status}><span data-fit={fit.status}>{resourceFitLine(fit)}</span></span>;
  // 자세히: 실제로 비교할 자료가 있는 항목만 보인다. 자료가 없는 항목은 줄을 만들지 않는다.
  const known = RESOURCE_KEYS.filter(key => fit.metrics[key].evidence);
  if (!known.length) return null;
  return <span className={styles.fit} data-resource-status={fit.status}>{known.map(key => {
    const metric = fit.metrics[key], evidence = metric.evidence!;
    const unit = key.includes("Cost") ? "원" : "시간";
    const range = evidence.lower === evidence.upper ? evidence.lower.toLocaleString("ko-KR") : `${evidence.lower.toLocaleString("ko-KR")}~${evidence.upper.toLocaleString("ko-KR")}`;
    const verdict = metric.status === "exceeded" ? " · 적어 주신 값보다 많아요" : metric.status === "fits" ? " · 적어 주신 값 안이에요" : metric.status === "conditional" ? " · 규모에 따라 달라요" : "";
    return <span key={key} data-metric={key} data-fit={metric.status}>{RESOURCE_LABELS[key]}: 보통 {range}{unit} 정도 들어요{verdict}</span>;
  })}</span>;
}

export function ResourcePanel({ snapshot, draft, disabled, onDraft, onCommand }: { snapshot: IntakeSnapshot; draft: IntakeDraft["resourceEditor"]; disabled: boolean; onDraft: (draft: NonNullable<IntakeDraft["resourceEditor"]>) => void; onCommand: (command: Omit<IntakeCommand, "revision" | "requestId" | "planId">) => void }) {
  const savedLimits = savedResourceLimits(snapshot);
  const limits: Partial<Record<ResourceKey, string | null>> = draft?.limits ?? savedLimits;
  const savedContext: ResourceContext = snapshot.intake.resourceContext ?? { variant: "", region: "", scale: "" };
  const context: ResourceContext = draft?.context ?? savedContext;
  // 바뀐 칸만 보낸다. 아무것도 안 바꿨으면 '저장하기'를 누를 수 없다
  const changedLimits = changedResourceLimits(savedLimits, limits);
  const contextChanged = JSON.stringify(context) !== JSON.stringify(savedContext);
  const assessment = snapshot.resourceAssessment;
  const candidates = [...new Map([...snapshot.candidateIdeas, ...assessment?.excluded ?? []].map(i => [i.id, i])).values()];
  const quote = draft?.quote;
  const quoteChange = (patch: Partial<NonNullable<typeof quote>>) => quote && onDraft({ ...draft, quote: { ...quote, ...patch } });
  const completeContext = Object.values(context).every(v => v.trim());
  const answered = RESOURCE_KEYS.some(key => parseResourceLimit(savedLimits[key], key).status === "known");
  return <section className={styles.panel} aria-label="예산과 시간">
    <p role="status" className={styles.fit} data-fit={assessment?.selected?.resourceFit?.status ?? "unknown"}>{resourceFitLine(assessment?.selected?.resourceFit, answered)}</p>
    {assessment?.selected && <ResourceFitDetails fit={assessment.selected.resourceFit} />}
    <details>
    <summary>예산·시간 고치기</summary>
    <div className={styles.editor}>
      <form onSubmit={e => { e.preventDefault(); const sendContext = completeContext && contextChanged; if (!Object.keys(changedLimits).length && !sendContext) return; onCommand({ action: "resources", ...(Object.keys(changedLimits).length ? { resourceLimits: changedLimits } : {}), ...(sendContext ? { resourceContext: context } : {}) }); }}>
        <fieldset disabled={disabled} className={styles.fields}><legend className={styles.srOnly}>예산과 시간</legend>{RESOURCE_KEYS.map(key => { const parsed = parseResourceLimit(limits[key], key); return <label key={key}>{RESOURCE_LABELS[key]}<input aria-label={RESOURCE_LABELS[key]} value={limits[key] ?? ""} placeholder={key.includes("Cost") ? "예: 1000만원 (모르면 비워 두기)" : "예: 25시간 (모르면 비워 두기)"} maxLength={120} onChange={e => onDraft({ ...draft, limits: { ...limits, [key]: e.target.value } })} /><small>{parsed.status === "invalid" ? "숫자와 단위를 다시 확인해 주세요" : key === "initialCost" ? "원 · 처음 한 번 준비하는 돈" : key === "monthlyOperatingCost" ? "원 · 한 달 운영비" : key === "preparationHours" ? "시간 · 문 열기까지 준비하는 시간" : "시간 · 일주일에 일할 수 있는 시간"}</small></label>; })}</fieldset>
        <fieldset disabled={disabled} className={styles.fields}><legend>어떻게 할지 (선택)</legend>{([['variant','운영 방식'],['region','지역'],['scale','규모']] as const).map(([key,label]) => <label key={key}>{label}<input aria-label={label} value={context[key]} maxLength={key === 'region' ? 100 : 160} onChange={e => onDraft({ ...draft, context: { ...context, [key]: e.target.value } })} /></label>)}</fieldset>
        <AppButton variant="primary" type="submit" disabled={disabled || Object.values(context).some(v => v.trim()) && !completeContext || !Object.keys(changedLimits).length && !(completeContext && contextChanged)}>저장하기</AppButton>
      </form>
    </div>
    {assessment?.excludedCount ? <div className={styles.candidate}><strong>예산·시간을 넘어서 뺀 사업 {assessment.excludedCount}개</strong>{assessment.excluded.map(i => <small key={i.id}>{i.title}</small>)}</div> : null}
    {!quote ? <AppButton variant="secondary" type="button" disabled={disabled || !candidates.length} onClick={() => onDraft({ ...draft, quote: { candidateId: candidates[0].id, metric: "initialCost", raw: "", context, reference: "", includedItems: "", excludedItems: "", complete: false, confirmed: false, expiresAt: "" } })}>받아 본 견적 넣기</AppButton> : <form className={styles.quote} onSubmit={e => { e.preventDefault(); if (!quote.confirmed || !completeContext) return; onCommand({ action: "resources", resourceQuote: { ...quote, confirmed: true, context, expiresAt: new Date(`${quote.expiresAt.slice(0,10)}T23:59:59+09:00`).toISOString() } }); }}>
      <fieldset disabled={disabled} className={styles.fields}><legend>받아 본 견적</legend>
        <label>어떤 사업인가요<select aria-label="견적 사업" value={quote.candidateId} onChange={e => quoteChange({ candidateId: e.target.value })}>{candidates.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></label>
        <label>무엇에 드는지<select aria-label="견적 항목" value={quote.metric} onChange={e => quoteChange({ metric: e.target.value as ResourceKey })}>{RESOURCE_KEYS.map(k => <option key={k} value={k}>{RESOURCE_LABELS[k]}</option>)}</select></label>
        <label>금액이나 시간<input aria-label="금액이나 시간" required value={quote.raw} onChange={e => quoteChange({ raw: e.target.value })} maxLength={120} /></label>
        <label>어디서 받은 견적인가요<input aria-label="견적 받은 곳" required value={quote.reference} onChange={e => quoteChange({ reference: e.target.value })} maxLength={1000} /></label>
        <label>들어 있는 것<input aria-label="들어 있는 것" required value={quote.includedItems} onChange={e => quoteChange({ includedItems: e.target.value })} maxLength={1000} /></label>
        <label>빠져 있거나 모르는 것<input aria-label="빠져 있거나 모르는 것" value={quote.excludedItems} onChange={e => quoteChange({ excludedItems: e.target.value })} maxLength={1000} /></label>
        <label>견적이 끝나는 날<input aria-label="견적이 끝나는 날" required type="date" value={quote.expiresAt.slice(0,10)} onChange={e => quoteChange({ expiresAt: e.target.value })} /></label>
        <label className={styles.check}><input type="checkbox" checked={quote.complete} onChange={e => quoteChange({ complete: e.target.checked })} />이 견적에 필요한 게 다 들어 있어요</label>
        <label className={styles.check}><input type="checkbox" checked={quote.confirmed} onChange={e => quoteChange({ confirmed: e.target.checked })} />위에 적은 운영 방식·지역·규모로 받은 견적이 맞아요</label>
      </fieldset>
      {!completeContext && <p>위 '어떻게 할지'에 운영 방식·지역·규모를 먼저 적어 주세요</p>}
      <AppButton variant="primary" type="submit" disabled={disabled || !quote.confirmed || !completeContext || !quote.expiresAt || parseResourceLimit(quote.raw, quote.metric).status !== "known"}>견적 저장하기</AppButton>
    </form>}
    </details>
  </section>;
}
