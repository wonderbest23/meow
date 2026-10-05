"use client";

import type { ReactNode, Ref } from "react";
import type { CoachField } from "../../../lib/plan-builder/coach";
import { COACH_FIELD_LABELS } from "../../../lib/plan-builder/coach-presentation";
import { PPT_GENERATION_VERIFIED } from "../../../lib/plan-builder/deck-availability";
import styles from "../BusinessHub.module.css";
import ArtifactUpdatePanel from "./ArtifactUpdatePanel";
import Link from "next/link";
import { homepageHref } from "../../../lib/plan-builder/journey";
import type { HomepageStatus } from "../../../lib/plan-builder/journey";

export type WorkspaceView = "summary" | "documents" | "action" | "launch" | "operations";

export function WorkspaceIdentity({ title, status }: { title: string; status: string }) {
  return <div className={styles.workspaceTitle}><span className={styles.status}>{status}</span><h1>{title}</h1></div>;
}

export function WorkspaceNavigation({ view, onChange, children, operating = false }: { view: WorkspaceView; onChange: (view: WorkspaceView) => void; children: ReactNode; operating?: boolean }) {
  return <nav className={styles.tabs} aria-label="사업 관리 메뉴">
    <button aria-pressed={view === "summary"} onClick={() => onChange("summary")}>사업 요약</button>
    <button data-workspace-documents aria-pressed={view === "documents"} onClick={() => onChange("documents")}>내 자료</button>
    <button aria-pressed={view === "launch" || view === "action"} onClick={() => onChange("launch")}>{operating ? "운영 개선하기" : "사업 시작하기"}</button>
    <button aria-pressed={view === "operations"} onClick={() => onChange("operations")}>유지보수</button>
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

export function WorkspaceDocumentStatus({ complete, count, total, stale, onOpen, businessId }: {
  complete: boolean; count: number; total: number; stale?: boolean; onOpen: () => void; businessId?: string;
}) {
  return <>
    <div className={styles.documentState}><p>{complete ? "사업계획서가 완성됐어요." : "사업계획서를 준비하고 있어요."}</p><span className={styles.count}>{count} / {total} 항목</span></div>
    {!complete && <progress className={styles.progress} aria-label="준비된 문서 항목" value={count} max={total} />}
    <ul className={styles.fileTypes} aria-label="내보내기 형식"><li>PDF</li><li>워드</li>{PPT_GENERATION_VERIFIED && <li>발표자료 PPT</li>}</ul>
    {!PPT_GENERATION_VERIFIED && <p className={styles.downloadNote}>PPT 자동 생성은 제공 준비 중이며 현재 결제 제공 범위에는 포함되지 않습니다</p>}
    {stale && <div className={styles.notice}><h3>수정 내용 반영 필요</h3><p>현재 사업안과 다른 내용이 문서에 남아 있어요. 기존 문서는 유지되며, 대화에서 반영을 요청할 수 있어요.</p></div>}
    <button className={styles.primary} data-workspace-open-document onClick={onOpen}>사업계획서 열기</button>
    <p className={styles.downloadNote}>내려받기는 문서에서 · 이용 권한에 따라 결제 필요</p>
    <ArtifactUpdatePanel key={businessId} businessId={businessId} />
  </>;
}

/** 유지보수 ① 홈페이지 — 공개한 홈페이지를 고치고, 아직이면 만들러 간다 */
export function WorkspaceHomepageCare({ planId, status, publicPath }: { planId: string; status: HomepageStatus; publicPath: string | null }) {
  return <div className={styles.careBlock} data-workspace-homepage-care>
    <h2>홈페이지 관리</h2>
    <p>{status === "published" ? "홈페이지가 공개되어 있어요. 글·사진·가격이 바뀌면 바로 고쳐 주세요. 새 문의는 ‘접수된 문의’에 쌓이고, 번호를 등록하면 문자로도 알려 드려요." : status === "draft" ? "만들어 둔 홈페이지가 아직 공개 전이에요. 다듬어서 공개하면 문의를 받을 수 있어요." : status === "none" ? "아직 홈페이지가 없어요. 사업계획서 내용으로 초안을 바로 만들 수 있어요." : "홈페이지 상태를 확인하고 있어요."}</p>
    <div className={styles.careActions}>
      <Link className={styles.primary} href={homepageHref(planId)}>{status === "published" ? "홈페이지 고치기" : status === "draft" ? "홈페이지 다듬고 공개하기" : status === "none" ? "홈페이지 만들기" : "홈페이지 열기"}</Link>
      {publicPath && <a className={styles.secondary} href={publicPath} target="_blank" rel="noopener">공개된 홈페이지 보기</a>}
    </div>
  </div>;
}
