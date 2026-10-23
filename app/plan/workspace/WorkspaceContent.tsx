"use client";

import type { ReactNode, Ref } from "react";
import type { CoachField } from "../../../lib/plan-builder/coach";
import { COACH_FIELD_LABELS, coachFieldDisplay } from "../../../lib/plan-builder/coach-presentation";
import { PPT_GENERATION_VERIFIED } from "../../../lib/plan-builder/deck-availability";
import styles from "../BusinessHub.module.css";
import Link from "next/link";
import { homepageHref, journeyLabel } from "../../../lib/plan-builder/journey";
import { JOURNEY_LABELS } from "../../../lib/plan-builder/journey-steps";
import type { HomepageStatus } from "../../../lib/plan-builder/journey";
import { splitCircledSteps } from "../../../lib/plan-builder/text-steps";

export type WorkspaceView = "summary" | "documents" | "action" | "launch" | "operations";

export function WorkspaceIdentity({ title, status, action }: { title: string; status: string; action?: ReactNode }) {
  /* action — '대화 이어가기' 같은 작은 링크. 탭 줄 끝에 두면 폰에서 잘려 상태 칩 옆으로 옮겼다(대표 요청 2026-10-15) */
  return <div className={styles.workspaceTitle}><div className={styles.workspaceTitleRow}><span className={styles.status}>{status}</span>{action}</div><h1>{title}</h1></div>;
}

export function WorkspaceNavigation({ view, onChange, children, operating = false }: { view: WorkspaceView; onChange: (view: WorkspaceView) => void; children?: ReactNode; operating?: boolean }) {
  return <nav className={styles.tabs} aria-label="사업 관리 메뉴">
    <button aria-pressed={view === "summary"} onClick={() => onChange("summary")}>사업 요약</button>
    <button data-workspace-documents aria-pressed={view === "documents"} onClick={() => onChange("documents")}>{JOURNEY_LABELS.document}</button>
    <button aria-pressed={view === "launch" || view === "action"} onClick={() => onChange("launch")}>{journeyLabel("launch", operating)}</button>
    <button aria-pressed={view === "operations"} onClick={() => onChange("operations")}>유지보수</button>
    {children}
  </nav>;
}

export function WorkspaceSummary({ description, fields, stale, headingRef, children }: {
  description: string; fields?: CoachField[]; stale?: boolean; headingRef?: Ref<HTMLHeadingElement>; children?: ReactNode;
}) {
  return <>
    <h2 ref={headingRef} tabIndex={-1}>이런 사업이에요</h2>
    {(() => {
      const split = splitCircledSteps(description);
      return split ? <>{split.intro && <p>{split.intro}</p>}<ol className={styles.summarySteps}>{split.steps.map(step => <li key={step}>{step}</li>)}</ol>{split.outro && <p>{split.outro}</p>}</> : <p>{description}</p>;
    })()}
    {stale && <div className={styles.notice}><p>대화에서 바꾼 내용이 만들어 둔 사업계획서와 달라요. ‘사업계획서’ 탭에서 확인해 주세요.</p></div>}
    {fields && <dl className={styles.keyFacts} data-workspace-facts>{fields.filter(field => ["customer", "offer", "price", "budget", "hoursPerWeek"].includes(field.key)).map(field => <div className={styles.fact} key={field.key}>
      <dt>{COACH_FIELD_LABELS[field.key]}{field.basis === "user" ? null : <span>AI 초안</span>}</dt><dd>{coachFieldDisplay(field.value)}</dd>
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
    {stale && <div className={styles.notice}><h3>수정 내용 반영 필요</h3><p>현재 사업안과 다른 내용이 문서에 남아 있어요. 기존 문서는 유지되며, 대화에서 반영을 요청할 수 있어요.</p></div>}
    <button className={styles.primary} data-workspace-open-document onClick={onOpen}>사업계획서 열기</button>
    {/* 예전엔 PDF·워드가 단추처럼 생긴 꼬리표로 있었는데 눌러도 아무 일이 없었다(대표 요청 2026-10-15) — 안내 한 줄로 */}
    <p className={styles.downloadNote}>{PPT_GENERATION_VERIFIED ? "PDF·워드·발표자료" : "PDF·워드"} 내려받기는 사업계획서 화면에서 할 수 있어요.</p>
  </>;
}

/**
 * 유지보수 ① 홈페이지 — 공개한 홈페이지를 고치고, 아직이면 만들러 간다.
 * sample — 예시 사업은 홈페이지 상태를 서버에 묻지 않아 '확인하고 있어요'에 멈춰 있었다(점검 r36) — 예시 홈페이지를 보여 준다
 */
export function WorkspaceHomepageCare({ planId, status, publicPath, sample = false }: { planId: string; status: HomepageStatus; publicPath: string | null; sample?: boolean }) {
  if (sample) return <div className={styles.careBlock} data-workspace-homepage-care>
    <h2>홈페이지 관리</h2>
    <p>예시 사업의 홈페이지 초안이에요. 내 사업은 사업계획서 내용으로 초안을 바로 만들고, 공개한 뒤에는 여기서 고칠 수 있어요.</p>
    <div className={styles.careActions}><Link className={styles.primary} href={homepageHref(planId)}>예시 홈페이지 보기</Link></div>
  </div>;
  return <div className={styles.careBlock} data-workspace-homepage-care>
    <h2>홈페이지 관리</h2>
    <p>{status === "published" ? "홈페이지가 공개되어 있어요. 글·사진·가격이 바뀌면 바로 고쳐 주세요. 새 문의는 메뉴의 ‘손님 문의’에 쌓이고, 번호를 등록하면 문자로도 알려 드려요." : status === "draft" ? "만들어 둔 홈페이지가 아직 공개 전이에요. 다듬어서 공개하면 문의를 받을 수 있어요." : status === "none" ? "아직 홈페이지가 없어요. 사업계획서 내용으로 초안을 바로 만들 수 있어요." : "홈페이지 상태를 확인하고 있어요."}</p>
    <div className={styles.careActions}>
      <Link className={styles.primary} href={homepageHref(planId)}>{status === "published" ? "홈페이지 고치기" : status === "draft" ? "홈페이지 다듬고 공개하기" : status === "none" ? "홈페이지 만들기" : "홈페이지 열기"}</Link>
      {publicPath && <a className={styles.secondary} href={publicPath} target="_blank" rel="noopener">공개된 홈페이지 보기</a>}
    </div>
  </div>;
}
