"use client";

import { useEffect, useRef, useState } from "react";
import { currentBusinessDesign, currentNextAction, type CoachField, type CoachState } from "../../../lib/plan-builder/coach";
import { type ExpertPatch } from "../../../lib/plan-builder/coach-expert";
import { COACH_FIELD_LABELS } from "../../../lib/plan-builder/coach-presentation";
import { planOwnerEpoch } from "../../../lib/plan-builder/plan-store";
import styles from "./page.module.css";
import { askConfirm } from "../../../components/confirm-dialog";

const groups: Record<string, CoachField["key"][]> = {
  intro: ["business", "problem", "goal"],
  product: ["customer", "offer", "price", "channel"],
  money: ["budget", "setupCost", "cost", "unitCost", "hoursPerWeek", "minutesPerSale", "capacity", "sales", "volume"],
  action: [],
};
export type BriefPatch = Omit<ExpertPatch, "planId" | "requestId">;

export default function BriefEditor({ coach, section, onSave, onClose, onDirty }: {
  coach: CoachState; section: string; onSave: (patch: BriefPatch) => Promise<void>; onClose: () => void; onDirty: (dirty: boolean) => void;
}) {
  const [base] = useState(coach);
  const [initial] = useState<Record<string, string>>(() => ({
    title: coach.business.name,
    ...Object.fromEntries(coach.fields.map(field => [field.key, field.value])),
    business: currentBusinessDesign(coach)?.startingPlan.scope ?? coach.business.description,
    ...Object.fromEntries(Object.entries(currentNextAction(coach) ?? {}).filter(([key]) => ["action", "doneWhen", "usableText"].includes(key))),
  }));
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestPending = useRef(false);
  const ownerEpoch = useRef(planOwnerEpoch());
  const form = useRef<HTMLFormElement>(null);
  const leaving = useRef(false);
  const dirty = Object.keys(values).some(key => values[key].trim() !== (initial[key] ?? "").trim());
  useEffect(() => { onDirty(dirty || busy); return () => onDirty(false); }, [dirty, busy, onDirty]);
  useEffect(() => { form.current?.querySelector<HTMLInputElement>("input,textarea")?.focus(); }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { if (ownerEpoch.current === planOwnerEpoch()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    // 링크를 누르면 일단 멈추고 확인창을 띄운다 — '나가기'를 고르면 같은 링크를 다시 누른다(이때는 묻지 않는다)
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLElement)) return;
      if (leaving.current) { leaving.current = false; return; }
      event.preventDefault(); event.stopPropagation();
      if (busy) return;
      void askConfirm({ message: "저장하지 않은 수정이 있어요. 이 화면을 나갈까요?", confirmLabel: "나가기" }).then(ok => { if (ok) { leaving.current = true; link.click(); } });
    };
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", navigate, true); };
  }, [dirty, busy]);
  async function cancel() { if (!busy && (!dirty || await askConfirm({ message: "저장하지 않은 수정을 취소할까요?", confirmLabel: "수정 취소", cancelLabel: "계속 고치기" }))) onClose(); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (ownerEpoch.current !== planOwnerEpoch() || requestPending.current || !dirty) return;
    requestPending.current = true; setBusy(true); setError("");
    try {
      const keys = groups[section] ?? [];
      await onSave({ revision: base.revision,
        ...(section === "intro" && values.title.trim() !== initial.title ? { title: values.title.trim() } : {}),
        fields: keys.filter(key => (values[key] ?? "").trim() !== (initial[key] ?? "").trim()).map(key => ({ key, value: values[key]?.trim() || null })),
        ...(section === "action" ? { nextAction: { action: (values.action ?? "").trim(), doneWhen: (values.doneWhen ?? "").trim(), usableText: (values.usableText ?? "").trim() } } : {}),
      });
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했어요. 입력한 내용은 그대로 남아 있어요."); }
    finally { requestPending.current = false; setBusy(false); }
  }
  function field(key: string, label: string, required = false) {
    return <label className={styles.inlineField} key={key}>{label}{key === "title"
      ? <input value={values[key] ?? ""} maxLength={100} required disabled={busy} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} />
      : <textarea value={values[key] ?? ""} rows={key === "business" || key === "usableText" ? 5 : 3} maxLength={1200} required={required} disabled={busy} placeholder="아직 정하지 않았다면 비워 두세요" onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} />}</label>;
  }
  const keys = groups[section] ?? [];
  return <form ref={form} className={styles.inlineEditor} onSubmit={save} aria-label="사업 정보 직접 수정">
    <div className={styles.briefScroll}>
      <h2>내용 수정</h2>
      {section === "intro" && field("title", "사업 이름", true)}
      {keys.slice(0, 4).map(key => field(key, COACH_FIELD_LABELS[key], key === "business"))}
      {keys.length > 4 && <details><summary>운영 정보 더 수정하기</summary>{keys.slice(4).map(key => field(key, COACH_FIELD_LABELS[key]))}</details>}
      {section === "action" && <>{field("action", "먼저 할 일", true)}{field("doneWhen", "완료 기준", true)}{field("usableText", "바로 쓸 작업안", true)}</>}
      <p className={styles.note}>수정한 내용은 내가 입력한 정보로 저장돼요. 기존 문서는 그대로 보관됩니다.</p>
      {coach.revision !== base.revision && <p role="alert" className={styles.note}>다른 변경이 있어요. 입력 내용을 따로 확인한 뒤 취소하고 최신 내용에서 다시 수정해 주세요.</p>}
    </div>
    <div className={`${styles.documentActions} ${styles.inlineEditActions}`}>
      {error && <p role="alert" className={styles.inlineEditError}>{error}</p>}
      <button type="button" className={styles.editLink} disabled={busy} onClick={cancel}>취소</button>
      <button type="submit" className={styles.primary} disabled={!dirty || busy || coach.revision !== base.revision}>{busy ? "저장 중…" : "저장"}</button>
    </div>
  </form>;
}
