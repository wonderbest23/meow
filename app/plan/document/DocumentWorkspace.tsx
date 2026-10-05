"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, List, X, FileDown, FileText, Presentation, Check, RotateCcw, RefreshCw } from "lucide-react";
import BusinessAppChrome from "../BusinessAppChrome";
import InlineDocEditor from "../InlineDocEditor";
import PlanLoading from "../PlanLoading";
import frame from "../chat/page.module.css";
import styles from "./DocumentWorkspace.module.css";
import type { assembleSections } from "../../../lib/plan-builder/plan-store";
import type { EditState } from "./use-document-edits";
import { DocumentChapterHeading, DocumentReadHeading, DocumentSectionHeading } from "./DocumentReadContent";
import DocumentSourceReview, { type DocumentReviewSource } from "./DocumentSourceReview";
import type { StoredSection } from "../../../lib/plan-builder/plan-store";
import type { ExecutiveSummary } from "../../../lib/plan-builder/executive-summary";
import ExecutiveSummaryView from "./ExecutiveSummaryView";
import { useHomepageStatus } from "../use-homepage";
import { journeyNext, type HomepageStatus } from "../../../lib/plan-builder/journey";
import { loadState } from "../../../lib/plan-builder/plan-store";

type Format = "pdf" | "docx" | "pptx";
type Props = {
  title: string; planId: string | null; planType: string; ready: boolean;
  identity?: { headline: string; pitch: string };
  completionKey: string | null;
  /** 모든 항목이 써졌는지 — 다음 단계 칸을 띄우는 기준 */
  allWritten?: boolean;
  grouped: Array<[string, ReturnType<typeof assembleSections>]>;
  numbering: Map<string, { num: string; chapterNum: number }>;
  isSample: boolean; coachHref: string | null; notice: string;
  /** 만드는 중이면 진행(완성 수·지금 쓰는 장) — 문서 위에 '쓰는 중' 표시 */
  writing?: { done: number; total: number; current: string | null } | null;
  /** 방금 새로 받은 장 — 문단이 차례로 나타난다 */
  freshKeys?: ReadonlySet<string>;
  editStates: Record<string, EditState>;
  restoreKeys: string[]; onRestore: (key: string) => void; onRetrySave: (key: string) => void; onDiscardDraft: (key: string) => void;
  onSave: (key: string, html: string) => void;
  onDraft: (key: string, html: string) => void;
  exporting: Format | null; locked: boolean; accessPending: boolean; error: string | null;
  accessError: boolean; onRetryAccess: () => void;
  deckStatus?: string; deckLabel?: string;
  onDownload: (format: Format, view?: "summary" | "detailed") => void; canDownload: (format: Format, view?: "summary" | "detailed") => boolean;
  summary?: ExecutiveSummary | null; summaryError?: string;
  reviewSource?: DocumentReviewSource | null;
  onReviewed?: (key: string, section: StoredSection, updatedAt: string) => void;
};

/** 쓰는 중 — 지금 쓰는 장 이름 뒤에 깜빡이는 커서, 아래로 글줄이 차오르는 듯한 자리 */
function WritingStatus({ done, total, current }: { done: number; total: number; current: string | null }) {
  return <div className={styles.writing} role="status" aria-live="polite">
    <div className={styles.writingHead}><strong>사업계획서를 작성하고 있어요</strong><span>{done} / {total}</span></div>
    <progress value={done} max={total || 1} aria-label="작성한 항목" />
    {current && <p className={styles.writingNow}>지금 쓰는 중 · <b>{current}</b><i className={styles.caret} aria-hidden="true" /></p>}
    <div className={styles.writingLines} aria-hidden="true"><i /><i /><i /></div>
    <small>새 항목이 끝날 때마다 아래에 바로 나타나요. 창을 닫아도 계속 만들어져요.</small>
  </div>;
}

/**
 * 다음 단계 버튼 — 화면 맨 아래, 수정·내려받기 옆 늘 같은 자리에 하나만 둔다.
 * 오른쪽 칸·문서 위 카드·완료 알림에 흩어져 있던 다음 단계 안내를 여기 하나로 모았다(사용자 피드백 2026-10).
 */
function NextStepButton({ planId, homepage }: { planId: string; homepage: HomepageStatus }) {
  const plan = loadState().plans.find(item => item.id === planId);
  if (!plan) return null;
  const next = journeyNext(plan, homepage);
  return <Link className={styles.nextButton} href={next.href}><span>다음 단계</span><b>{next.title}</b><ChevronRight size={20} aria-hidden="true" /></Link>;
}

export default function DocumentWorkspace(props: Props) {
  const { title, planId, grouped, ready, isSample, coachHref, onSave } = props;
  const [chapter, setChapter] = useState(0);
  const [continuous, setContinuous] = useState(false);
  const [editing, setEditing] = useState(false);
  const [summaryMode, setSummaryMode] = useState(false);
  const [modal, setModal] = useState<"toc" | "download" | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const announced = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  /*
   * 폰에서 표 크게 보기 — 좁은 화면에서 표는 옆으로 밀어야 보여서 끝까지 읽기 어려웠다.
   * 읽기 중인 표를 누르면 그 표만 전체 화면으로 띄운다(고치는 중에는 칸을 눌러야 하니 띄우지 않는다).
   */
  const [zoomTable, setZoomTable] = useState<string | null>(null);
  const zoomDialog = useRef<HTMLDialogElement>(null);
  const zoomPressOnBackdrop = useRef(false);
  const zoomBody = useRef<HTMLDivElement>(null);
  /* PDF처럼 처음엔 표 전체를 화면 폭에 맞춰 줄여 보여 주고, '크게 보기'면 원래 크기로 상하좌우 스크롤 */
  const [zoomFit, setZoomFit] = useState(true);
  const [zoomScale, setZoomScale] = useState(1);
  useEffect(() => {
    if (!zoomTable) return;
    const measure = () => {
      const body = zoomBody.current, table = body?.querySelector("table");
      if (!body || !table) return;
      const available = body.clientWidth - 32;
      setZoomScale(Math.min(1, available / Math.max(1, table.scrollWidth)));
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", measure); };
  }, [zoomTable]);
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const open = (event: MouseEvent) => {
      if (!window.matchMedia("(max-width: 640px)").matches) return;
      const table = (event.target as Element | null)?.closest?.(".tiptap[contenteditable=false] table");
      if (table) { setZoomFit(true); setZoomScale(1); setZoomTable(table.outerHTML); }
    };
    node.addEventListener("click", open);
    return () => node.removeEventListener("click", open);
  }, [ready]);
  useEffect(() => { if (zoomTable && zoomDialog.current && !zoomDialog.current.open) zoomDialog.current.showModal(); }, [zoomTable]);
  /* 계획서가 다 만들어지면 오른쪽에 다음 단계를 늘 띄워 둔다(좁은 화면에서는 문서 위에) */
  const showNext = !isSample && !!planId && (!!props.completionKey || !!props.allWritten) && !props.writing;
  const homepage = useHomepageStatus(isSample ? null : planId);
  /* ← 는 내 사업 목록으로 — 예전엔 사업 관리 문서 탭으로 가서, 거기 큰 단추('사업계획서 열기')가 다시 여기로 돌려보냈다 */
  const back = "/plan";

  useEffect(() => {
    if (!ready || !props.completionKey || isSample) { setCelebrate(false); return; }
    const key = `oneulstart:document-complete:${props.completionKey}`;
    if (announced.current !== key) {
      try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch {}
      announced.current = key; setCelebrate(true);
    }
  }, [ready, props.completionKey, isSample]);

  useEffect(() => {
    if (modal) dialog.current?.showModal(); else dialog.current?.close();
  }, [modal]);
  /*
   * 상세 항목이 하나도 없을 때만 잠깐 한 장 요약을 보여 주고, 상세 항목이 생기면 상세 계획서로 돌아온다.
   * 예전엔 만드는 도중(0장)에 열면 요약으로 넘어간 채 고정돼, 다 만든 뒤에도 요약이 먼저 보였다(사용자 피드백).
   * 만드는 중이면 요약 대신 '쓰는 중' 화면을 보여 준다.
   */
  const autoSummary = useRef(false);
  useEffect(() => {
    if (ready && !grouped.length && props.summary && !props.writing) { autoSummary.current = true; setSummaryMode(true); }
    else if (grouped.length && autoSummary.current) { autoSummary.current = false; setSummaryMode(false); }
  }, [ready, grouped.length, props.summary, props.writing]);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const index = grouped.findIndex(([, list]) => list.some(s => `sec-${s.key.replace("/", "-")}` === hash));
    if (index < 0) return;
    setChapter(index);
    const timer = setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }), 150);
    return () => clearTimeout(timer);
  }, [grouped.length]);

  function readAll() { setContinuous(true); setSummaryMode(false); setModal(null); scroll.current?.scrollTo({ top: 0 }); }
  /* PC에서는 목차가 왼쪽 메뉴의 이 사업 아래에 붙는다(내 사업 → 사업 → 사업계획서 → 장) */
  const documentToc = planId && !isSample && grouped.length > 0 ? {
    planId, chapters: grouped.map(([name]) => name), current: continuous && !summaryMode ? "all" as const : chapter,
    onSelect: (index: number | "all") => index === "all" ? readAll() : selectChapter(index),
  } : undefined;
  function selectChapter(index: number) {
    setChapter(index); setContinuous(false); setSummaryMode(false); setModal(null);
    scroll.current?.scrollTo({ top: 0, behavior: "instant" });
  }

  const toc = () => <nav className={styles.toc} aria-label="문서 목차">
    {grouped.map(([name], index) => <button key={name} aria-current={!summaryMode && !continuous && chapter === index ? "page" : undefined} onClick={() => selectChapter(index)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong></button>)}
    <button className={styles.continuous} aria-current={continuous && !summaryMode ? "page" : undefined} onClick={readAll}>전체 이어 읽기</button>
  </nav>;

  return <main className={`${frame.page} ${styles.page}`}>
    <BusinessAppChrome title="사업계획서" backHref={back} showRail={!isSample} documentToc={documentToc}>
      {!ready ? <PlanLoading fill variant="compact" note="문서를 불러오고 있어요" /> : <div className={styles.layout}>
        {/* 예시 문서는 왼쪽 메뉴에 사업이 없으니 문서 옆에 목차를 그대로 둔다 */}
        {isSample && grouped.length > 0 && <aside className={styles.sidebar}><h2>목차</h2>{toc()}</aside>}
        <div className={styles.document}>
          <div className={styles.readingBar}>
            <button className={styles.tocToggle} onClick={() => setModal("toc")} disabled={!grouped.length}><List size={19} />목차</button>
            <span>{summaryMode ? "한 장 요약" : continuous ? "전체 이어 읽기" : grouped.length ? `${chapter + 1} / ${grouped.length}장` : "사업계획서"}</span>
          </div>
          {props.summary && <div className={styles.viewSelector} role="group" aria-label="문서 보기 방식">
            <button aria-pressed={!summaryMode} onClick={() => { setSummaryMode(false); scroll.current?.scrollTo({ top: 0 }); }}>상세 계획서</button>
            <button aria-pressed={summaryMode} onClick={() => { setSummaryMode(true); setEditing(false); scroll.current?.scrollTo({ top: 0 }); }}>한 장 요약</button>
          </div>}
          {props.summaryError && <p className={styles.notice} role="alert">{props.summaryError}</p>}
          {celebrate && <div className={styles.completionNotice} role="status" aria-live="polite"><span className={styles.completeMark}><Check size={22} aria-hidden="true" /></span><div><strong>사업계획서 작성이 끝났어요</strong><p>내용을 확인하고 필요한 부분만 다듬어보세요. 준비되면 아래 <b>다음 단계</b> 버튼을 눌러 이어가세요.</p></div><button aria-label="완료 알림 닫기" onClick={() => setCelebrate(false)}><X size={18} /></button></div>}
          <div ref={scroll} className={styles.scroll} tabIndex={0} aria-label="사업계획서 본문">
            {!grouped.length && !(summaryMode && props.summary) && props.writing ? <article className={styles.article}><DocumentReadHeading title={title} planType={props.planType} isSample={isSample} identity={props.identity} /><WritingStatus {...props.writing} /></article> : !grouped.length && !(summaryMode && props.summary) ? <div className={styles.empty}><h1>아직 만든 문서가 없어요</h1><p>사업 이야기를 이어서 계획서를 만들어보세요.</p><Link href={coachHref ?? back}>사업안으로 돌아가기</Link></div> : <article className={styles.article}>
              <DocumentReadHeading title={title} planType={props.planType} isSample={isSample} completed={!!props.completionKey} identity={props.identity} />
                            {props.writing && <WritingStatus {...props.writing} />}
              {props.notice && !props.writing && <div className={styles.notice} role="status">{props.notice} {coachHref && <Link href={coachHref}>대화로 수정하기</Link>}</div>}
              {summaryMode && props.summary ? <ExecutiveSummaryView summary={props.summary} /> : grouped.map(([name, list], index) => (continuous || chapter === index) && <div key={name} className={styles.chapter}>
                <DocumentChapterHeading number={index + 1} title={name} />
                {list.map(section => <section className={styles.section} key={section.key} id={`sec-${section.key.replace("/", "-")}`}>
                  <DocumentSectionHeading number={props.numbering.get(section.key)?.num} title={section.sectionTitle} />
                  <div className={styles.body} data-fresh={props.freshKeys?.has(section.key) || undefined}><InlineDocEditor html={section.html} readOnly={isSample || !editing} status={props.editStates[section.key]?.status ?? "idle"} onDraft={html => props.onDraft(section.key, html)} onChange={html => onSave(section.key, html)} /></div>
                  {!isSample && <div className={styles.saveState}>
                    {props.editStates[section.key]?.status === "failed" ? <><p role="alert">{props.editStates[section.key].message}</p><button onClick={() => props.onRetrySave(section.key)}><RefreshCw size={15} />다시 저장</button><button onClick={() => props.onDiscardDraft(section.key)}>서버 내용 불러오기</button></> : !editing && props.editStates[section.key] && <span role="status">{props.editStates[section.key].status === "saving" ? "서버에 저장 중…" : "서버에 저장됨"}</span>}
                    {editing && props.restoreKeys.includes(section.key) && !["saving", "failed"].includes(props.editStates[section.key]?.status ?? "") && <button onClick={() => props.onRestore(section.key)}><RotateCcw size={15} />직전 내용으로 되돌리기</button>}
                  </div>}
                  {!isSample && planId && props.reviewSource?.sections[section.key] && props.onReviewed && <DocumentSourceReview key={`${section.key}:${props.reviewSource.revision}:${props.reviewSource.sections[section.key]}`} planId={planId} sectionKey={section.key} source={props.reviewSource} disabled={editing || ["saving", "failed"].includes(props.editStates[section.key]?.status ?? "")} onReviewed={props.onReviewed} />}
                </section>)}
              </div>)}
              {!summaryMode && !continuous && <nav className={styles.paging} aria-label="문서 장 이동"><button disabled={chapter === 0} onClick={() => selectChapter(chapter - 1)}><ChevronLeft size={18} />이전 장</button><button disabled={chapter === grouped.length - 1} onClick={() => selectChapter(chapter + 1)}>다음 장<ChevronRight size={18} /></button></nav>}
                          </article>}
          </div>
          <footer className={styles.actions} data-next={showNext || undefined}>
            <button className={styles.secondary} disabled={!grouped.length || isSample} onClick={() => { if (summaryMode) { setSummaryMode(false); setEditing(true); } else setEditing(!editing); }}>{isSample ? "예시 · 읽기 전용" : summaryMode ? "상세 문서 수정" : editing ? "수정 마치기" : "수정하기"}</button>
            <button className={showNext ? styles.secondary : styles.primary} disabled={!grouped.length} onClick={() => setModal("download")}>{showNext ? "내려받기" : "사업계획서 내려받기"}</button>
            {showNext && planId && <NextStepButton planId={planId} homepage={homepage} />}
          </footer>
        </div>
      </div>}
    </BusinessAppChrome>
    <dialog ref={dialog} className={styles.dialog} onCancel={() => setModal(null)} onClose={() => setModal(null)} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) setModal(null); } }} aria-labelledby="document-dialog-title">
      <header className={styles.dialogHeader}><h2 id="document-dialog-title">{modal === "toc" ? "어디부터 볼까요?" : "파일 내려받기"}</h2><button aria-label="닫기" onClick={() => setModal(null)}><X size={22} /></button></header>
      {modal === "toc" ? toc() : <div className={styles.downloads}>
        {props.locked && <p className={styles.notice}>파일 내려받기는 결제 후 이용할 수 있어요. 형식을 선택하면 결제로 이어져요.</p>}
        {props.accessError ? <div className={styles.notice} role="alert">이용 권한을 확인하지 못했어요. <button className={styles.help} onClick={props.onRetryAccess}>다시 확인</button></div> : props.accessPending && <p role="status">이용 권한을 확인하고 있어요.</p>}
        {([{ format: "pdf", name: "PDF", description: "인쇄하거나 공유할 때", Icon: FileDown }, { format: "docx", name: "Word", description: "문서를 직접 고쳐 쓸 때", Icon: FileText }, { format: "pptx", name: props.deckLabel || "발표자료 PPT", description: "계획서를 발표자료로 만들 때", Icon: Presentation }] as const).map(({ format, name, description, Icon }) => <button key={format} disabled={props.exporting !== null || props.accessPending || !props.canDownload(format)} onClick={() => props.onDownload(format)}><Icon size={24} /><span><strong>{props.exporting === format ? "파일을 준비하고 있어요…" : name}</strong><small>{description}</small></span><ChevronRight size={20} /></button>)}
        {props.deckStatus && <p role="status" aria-live="polite">{props.deckStatus}</p>}
        {!isSample && planId && <Link href={`/plan/proposal?planId=${encodeURIComponent(planId)}`}>제안서 편집·제작 상태 확인</Link>}
        {Object.values(props.editStates).some(state => state.status !== "saved") && <p role="status">저장이 끝난 뒤 파일을 받을 수 있어요. 저장에 실패한 항목은 본문에서 확인해주세요.</p>}
        {props.error && <p role="alert">{props.error}</p>}
      </div>}
    </dialog>
  {zoomTable && <dialog ref={zoomDialog} className={styles.tableZoom} aria-label="표 크게 보기" onClose={() => setZoomTable(null)}
    onPointerDown={event => { zoomPressOnBackdrop.current = event.target === zoomDialog.current; }}
    onClick={event => { if (zoomPressOnBackdrop.current && event.target === zoomDialog.current) zoomDialog.current?.close(); zoomPressOnBackdrop.current = false; }}>
      <header><strong>표 보기</strong>
        <div className={styles.tableZoomModes} role="group" aria-label="표 크기">
          <button type="button" aria-pressed={zoomFit} onClick={() => setZoomFit(true)}>화면에 맞추기</button>
          <button type="button" aria-pressed={!zoomFit} onClick={() => setZoomFit(false)}>크게 보기</button>
        </div>
        <button type="button" className={styles.tableZoomClose} onClick={() => zoomDialog.current?.close()} aria-label="닫기"><X size={22} /></button></header>
      {/* 이 화면에 이미 그려진 문서의 표를 그대로 옮긴다 */}
      <div ref={zoomBody} className={styles.tableZoomBody}><div className={styles.tableZoomSheet} style={{ zoom: zoomFit ? zoomScale : 1 }} dangerouslySetInnerHTML={{ __html: zoomTable }} /></div>
    </dialog>}
    </main>;
}
