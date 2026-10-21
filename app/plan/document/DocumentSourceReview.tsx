"use client";

import { apiMessage, userErrorMessage } from "../../../lib/client/user-error";
import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { CoachField } from "../../../lib/plan-builder/coach";
import { COACH_FIELD_LABELS, coachFieldDisplay } from "../../../lib/plan-builder/coach-presentation";
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
      const data = await response.json(); if (!response.ok) throw new Error(apiMessage(data, ""));
      if (epoch !== planOwnerEpoch()) return;
      onReviewed(sectionKey, data.section, data.updatedAt);
    } catch (e) { setError(userErrorMessage(e, "확인한 것을 저장하지 못했어요. 새로고침한 뒤 다시 확인해 주세요")); }
    finally { setBusy(false); }
  }
  /*
   * 항목마다 커다란 검토 상자가 붙어 열 개 넘게 되풀이됐다(점검 2026-10-21) — 한 줄로 접어 두고, 누르면 펼친다.
   * 바꾼 답을 계획서에 넣는 일은 위 안내의 '계획서에 반영하기'가 한 번에 한다. 여기는 이 항목만 그대로 두고 싶을 때 쓴다.
   */
  return <details className={styles.sourceReview} aria-label="바꾼 답 확인">
    <summary>이 항목은 바꾸기 전 답으로 썼어요</summary>
    <dl>{source.fields.map(field => <div key={field.key}><dt>{COACH_FIELD_LABELS[field.key]}</dt><dd>{coachFieldDisplay(field.value)}</dd></div>)}</dl>
    <label><input type="checkbox" disabled={busy || disabled} checked={checked} onChange={event => setChecked(event.target.checked)} />지금 답과 비교했고, 이 항목은 이대로 둬도 괜찮아요</label>
    <button disabled={!checked || disabled || busy} onClick={() => void review()}>{busy ? <LoaderCircle size={15} /> : <Check size={15} />}확인했어요</button>
    {error && <p role="alert">{error}</p>}
  </details>;
}
