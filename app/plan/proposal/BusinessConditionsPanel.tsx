"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, FileText, LoaderCircle, Save, SlidersHorizontal } from "lucide-react";
import { readCoach } from "../../../lib/plan-builder/coach";
import type { ExpertPatch } from "../../../lib/plan-builder/coach-expert";
import { PROPOSAL_BUSINESS_FIELDS, proposalFinancialPreview, type BusinessConditionsView } from "../../../lib/plan-builder/proposal-business";
import styles from "./proposal.module.css";

const valuesFor = (business: BusinessConditionsView) => Object.fromEntries(PROPOSAL_BUSINESS_FIELDS.map(({ key }) => [key, business.fields.find(field => field.key === key)?.value ?? ""]));
const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

export default function BusinessConditionsPanel({ planId, business, sourceChanged, canUpdate, onUpdated, onWorking }: {
  planId: string; business: BusinessConditionsView; sourceChanged: boolean; canUpdate: boolean;
  onUpdated(): Promise<void>; onWorking(value: boolean): void;
}) {
  const [open, setOpen] = useState(false), [base, setBase] = useState(business);
  const [values, setValues] = useState(() => valuesFor(business));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [conflict, setConflict] = useState(false);
  const pending = useRef<ExpertPatch | null>(null);
  const changes = PROPOSAL_BUSINESS_FIELDS.filter(({ key }) => values[key].trim() !== (base.fields.find(field => field.key === key)?.value ?? ""));
  const dirty = changes.length > 0;
  useEffect(() => { if (!dirty && !busy && !pending.current) { setBase(business); setValues(valuesFor(business)); } }, [business, dirty, busy]);
  useEffect(() => { onWorking(dirty || busy); return () => onWorking(false); }, [dirty, busy, onWorking]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || pending.current) { event.preventDefault(); event.returnValue = ""; } };
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if ((!dirty && !pending.current) || !anchor || anchor.getAttribute("href")?.startsWith("#") || anchor.getAttribute("aria-disabled") === "true") return;
      if (!window.confirm("아직 저장하지 않은 공통 조건이 있어요. 이 화면을 나갈까요?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  const nextFields = PROPOSAL_BUSINESS_FIELDS.map(({ key }) => ({ key, value: values[key].trim() }));
  const before = proposalFinancialPreview(base.fields), after = proposalFinancialPreview(nextFields);
  const documents = business.documents;
  const needsDocuments = documents.current < documents.total;
  const staleForm = dirty && base.revision !== business.revision;

  async function save() {
    if (busy || !canUpdate || conflict || staleForm) return;
    const request = pending.current ?? { planId, revision: base.revision, requestId: crypto.randomUUID(), fields: changes.map(({ key }) => ({ key, value: values[key].trim() || null })) };
    pending.current = request; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/plan/expert", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setConflict(true); pending.current = null; }
        else if (response.status < 500) pending.current = null;
        throw new Error(data.message);
      }
      const coach = readCoach(data.plan.answers);
      if (!coach) throw new Error("저장 결과를 확인하지 못했어요");
      pending.current = null;
      const latest = { ...business, revision: coach.revision, fields: coach.fields };
      setBase(latest); setValues(valuesFor(latest)); setMessage("공통 조건을 저장했어요. 기존 문서와 제안서는 보관되어 있어요");
      await onUpdated();
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장 응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요"); }
    finally { setBusy(false); }
  }
  function reset() {
    if ((dirty || pending.current) && !window.confirm("작성한 공통 조건 대신 서버에 저장된 내용을 불러올까요?")) return;
    pending.current = null; setBase(business); setValues(valuesFor(business)); setConflict(false); setMessage(""); void onUpdated();
  }
  return <section id="business-conditions" className={styles.sourceUpdate} aria-label="공통 사업 조건">
    <div className={styles.updateHeading}><SlidersHorizontal size={19} /><div><strong>공통 사업 조건</strong><p>상품과 가격을 바꾸고 문서별 반영 상태를 확인하세요</p></div><button aria-expanded={open} onClick={() => setOpen(!open)}><ChevronDown size={16} />{open ? "접기" : "조건 수정"}</button></div>
    {open && <div className={styles.updateBody}>
      <ol className={styles.businessSteps}><li data-done={!dirty}><Check size={15} />사업 조건 {dirty ? "수정 중" : "저장됨"}</li><li data-done={!needsDocuments}><FileText size={15} />계획서 {documents.current}/{documents.total}</li><li data-done={!sourceChanged}><Check size={15} />제안서 {sourceChanged ? "반영 필요" : "반영됨"}</li></ol>
      {(staleForm || conflict) && <p role="alert">다른 화면에서 사업 정보를 수정했어요. 작성한 값은 유지됩니다</p>}
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset className={styles.businessFields} disabled={busy || !canUpdate || !!pending.current}>
          {PROPOSAL_BUSINESS_FIELDS.map(({ key, label }) => <label key={key}>{label}<input aria-label={label} maxLength={1200} value={values[key]} onChange={event => { setValues({ ...values, [key]: event.target.value }); setMessage(""); }} /></label>)}
        </fieldset>
        <section className={styles.calculation} aria-label="월 예상 손익 비교"><h3>월 예상 손익</h3>{after ? <dl>{([{ key: "revenue", label: "매출" }, { key: "variableCost", label: "변동비" }, { key: "operatingProfit", label: "영업손익" }] as const).map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{dirty && before && before[key] !== after[key] && <del>{won(before[key])}</del>}<strong>{won(after[key])}</strong></dd></div>)}</dl> : <p>판매가와 비용은 금액으로, 판매 건수는 숫자로 입력해 주세요. 미입력 비용은 0원으로 계산하지 않아요</p>}<small>입력한 판매량이 매월 같다는 가정이며 실제 실적이 아닙니다. 세금과 현금흐름은 별도 확인이 필요해요</small></section>
        {message && <p className={styles.businessMessage} role="status">{message}</p>}
        <div className={styles.updateActions}>{(dirty || conflict || pending.current) && <button type="button" disabled={busy} onClick={reset}>저장된 조건 불러오기</button>}<button type="submit" className={styles.primary} disabled={(!dirty && !pending.current) || busy || !canUpdate || conflict || staleForm}>{busy ? <LoaderCircle size={16} className={styles.spin} /> : <Save size={16} />}{pending.current && !busy ? "같은 요청으로 저장 확인" : "공통 조건 저장"}</button></div>
      </form>
      <div className={styles.documentNext}>
        <div><strong>{dirty ? "공통 조건을 먼저 저장해 주세요" : needsDocuments ? "계획서에 바뀐 조건을 반영해 주세요" : sourceChanged ? "최신 계획서로 제안서 변경분을 확인하세요" : "문서와 제안서가 같은 조건을 사용하고 있어요"}</strong>
          {documents.manualReview.length > 0 && <p>직접 수정한 항목 확인 필요: {documents.manualReview.join(" · ")}</p>}
          <p>{needsDocuments ? "기존 본문은 유지됩니다. 계획서 갱신과 직접 수정한 항목의 검토를 마친 뒤 제안서를 비교할 수 있어요" : "제안서 문안은 변경분을 검토하고 승인한 뒤에만 바뀝니다"}</p></div>
        <Link aria-disabled={dirty || busy} onClick={event => { if (dirty || busy) event.preventDefault(); }} href={`/plan/document?planId=${encodeURIComponent(planId)}`}><FileText size={16} />계획서 확인</Link>
      </div>
    </div>}
  </section>;
}
