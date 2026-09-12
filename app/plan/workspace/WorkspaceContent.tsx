"use client";

import type { ReactNode, Ref } from "react";
import type { CoachField } from "../../../lib/plan-builder/coach";
import { COACH_FIELD_LABELS } from "../../../lib/plan-builder/coach-presentation";
import styles from "../BusinessHub.module.css";

export type WorkspaceView = "summary" | "documents" | "action" | "launch";

export function WorkspaceIdentity({ title, status }: { title: string; status: string }) {
  return <div className={styles.workspaceTitle}><span className={styles.status}>{status}</span><h1>{title}</h1></div>;
}

export function WorkspaceNavigation({ view, onChange, children }: { view: WorkspaceView; onChange: (view: WorkspaceView) => void; children: ReactNode }) {
  return <nav className={styles.tabs} aria-label="사업 관리 메뉴">
    <button aria-pressed={view === "summary"} onClick={() => onChange("summary")}>사업 요약</button>
    <button data-workspace-documents aria-pressed={view === "documents"} onClick={() => onChange("documents")}>내 자료</button>
    <button aria-pressed={view === "launch" || view === "action"} onClick={() => onChange("launch")}>사업 시작하기</button>
    {children}
  </nav>;
}

export function WorkspaceSummary({ description, fields, stale, headingRef, children }: {
  description: string; fields?: CoachField[]; stale?: boolean; headingRef?: Ref<HTMLHeadingElement>; children?: ReactNode;
}) {
  return <>
    <h2 ref={headingRef} tabIndex={-1}>이런 사업이에요</h2>
    <p>{description}</p>
    {stale && <div className={styles.notice}><p>대화에서 바꾼 내용이 기존 문서와 달라요. 내 자료에서 확인해 주세요.</p></div>}
    {fields && <dl className={styles.keyFacts} data-workspace-facts>{fields.filter(field => ["customer", "offer", "price", "budget", "hoursPerWeek"].includes(field.key)).map(field => <div className={styles.fact} key={field.key}>
      <dt>{COACH_FIELD_LABELS[field.key]}<span>{field.basis === "user" ? "내가 알려준 내용" : "AI 제안"}</span></dt><dd>{field.value}</dd>
    </div>)}</dl>}
    {children}
  </>;
}

export function WorkspaceDocumentStatus({ complete, count, total, stale, onOpen }: {
  complete: boolean; count: number; total: number; stale?: boolean; onOpen: () => void;
}) {
  return <>
    <div className={styles.documentState}><p>{complete ? "사업계획서가 완성됐어요." : "사업계획서를 준비하고 있어요."}</p><span className={styles.count}>{count} / {total} 항목</span></div>
    {!complete && <progress className={styles.progress} aria-label="준비된 문서 항목" value={count} max={total} />}
    <ul className={styles.fileTypes} aria-label="내보내기 형식"><li>PDF</li><li>워드</li><li>발표자료 PPT</li></ul>
    {stale && <div className={styles.notice}><h3>수정 내용 반영 필요</h3><p>현재 사업안과 다른 내용이 문서에 남아 있어요. 기존 문서는 유지되며, 대화에서 반영을 요청할 수 있어요.</p></div>}
    <button className={styles.primary} data-workspace-open-document onClick={onOpen}>사업계획서 열기</button>
    <p className={styles.downloadNote}>내려받기는 문서에서 · 이용 권한에 따라 결제 필요</p>
  </>;
}
