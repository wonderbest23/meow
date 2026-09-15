"use client";

import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { CoachField } from "../../../lib/plan-builder/coach";
import { COACH_FIELD_LABELS } from "../../../lib/plan-builder/coach-presentation";
import { planOwnerEpoch, type StoredSection } from "../../../lib/plan-builder/plan-store";
import styles from "./DocumentWorkspace.module.css";

export type DocumentReviewSource = { revision: number; fields: CoachField[]; sections: Record<string, string> };

export default function DocumentSourceReview({ planId, sectionKey, source, disabled, onReviewed }: {
  planId: string; sectionKey: string; source: DocumentReviewSource; disabled: boolean;
  onReviewed(key: string, section: StoredSection, updatedAt: string): void;
}) {
  const [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function review() {
    if (!checked || disabled || busy) return;
    setBusy(true); setError("");
    const epoch = planOwnerEpoch();
    try {
      const response = await fetch("/api/plan/document/section", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, key: sectionKey, action: "review", baseGeneratedAt: source.sections[sectionKey], sourceRevision: source.revision }), signal: AbortSignal.timeout(20000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message);
      if (epoch !== planOwnerEpoch()) return;
      onReviewed(sectionKey, data.section, data.updatedAt);
    } catch (e) { setError(e instanceof Error ? e.message : "검토 저장을 확인하지 못했어요. 새로고침 후 상태를 확인해 주세요"); }
    finally { setBusy(false); }
  }
  return <div className={styles.sourceReview} aria-label="최신 사업 조건 검토">
    <strong>이 항목은 이전 사업 조건으로 작성됐어요</strong>
    <details><summary>현재 사업 조건 확인</summary><dl>{source.fields.map(field => <div key={field.key}><dt>{COACH_FIELD_LABELS[field.key]}</dt><dd>{field.value}</dd></div>)}</dl></details>
    <label><input type="checkbox" disabled={busy || disabled} checked={checked} onChange={event => setChecked(event.target.checked)} />위 본문과 현재 조건을 비교했고 필요한 수정을 마쳤습니다</label>
    <button disabled={!checked || disabled || busy} onClick={() => void review()}>{busy ? <LoaderCircle size={15} /> : <Check size={15} />}현재 조건으로 검토 완료</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
