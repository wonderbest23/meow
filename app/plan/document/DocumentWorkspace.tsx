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

type Format = "pdf" | "docx" | "pptx";
type Props = {
  title: string; planId: string | null; planType: string; ready: boolean;
  completionKey: string | null;
  grouped: Array<[string, ReturnType<typeof assembleSections>]>;
  numbering: Map<string, { num: string; chapterNum: number }>;
  isSample: boolean; coachHref: string | null; notice: string;
  editStates: Record<string, EditState>;
  restoreKeys: string[]; onRestore: (key: string) => void; onRetrySave: (key: string) => void; onDiscardDraft: (key: string) => void;
  onSave: (key: string, html: string) => void;
  onDraft: (key: string, html: string) => void;
  exporting: Format | null; locked: boolean; accessPending: boolean; error: string | null;
  accessError: boolean; onRetryAccess: () => void;
  deckStatus?: string; deckLabel?: string;
  onDownload: (format: Format) => void; canDownload: (format: Format) => boolean;
};

export default function DocumentWorkspace(props: Props) {
  const { title, planId, grouped, ready, isSample, coachHref, onSave } = props;
  const [chapter, setChapter] = useState(0);
  const [continuous, setContinuous] = useState(false);
  const [editing, setEditing] = useState(false);
  const [modal, setModal] = useState<"toc" | "download" | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const announced = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const back = planId && !isSample ? `/plan/workspace?planId=${encodeURIComponent(planId)}&tab=documents` : "/plan";

  useEffect(() => {
    if (!ready || !props.completionKey || isSample) { setCelebrate(false); return; }
    const key = `oneulstart:document-complete:${props.completionKey}`;
    if (announced.current !== key) {
      try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch {}
      announced.current = key; setCelebrate(true);
    }
    const timer = window.setTimeout(() => setCelebrate(false), 5000);
    return () => window.clearTimeout(timer);
  }, [ready, props.completionKey, isSample]);

  useEffect(() => {
    if (modal) dialog.current?.showModal(); else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const index = grouped.findIndex(([, list]) => list.some(s => `sec-${s.key.replace("/", "-")}` === hash));
    if (index < 0) return;
    setChapter(index);
    const timer = setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }), 150);
    return () => clearTimeout(timer);
  }, [grouped.length]);

  function selectChapter(index: number) {
    setChapter(index); setContinuous(false); setModal(null);
    scroll.current?.scrollTo({ top: 0, behavior: "instant" });
  }

  const toc = () => <nav className={styles.toc} aria-label="문서 목차">
    {grouped.map(([name], index) => <button key={name} aria-current={!continuous && chapter === index ? "page" : undefined} onClick={() => selectChapter(index)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong></button>)}
    <button className={styles.continuous} aria-current={continuous ? "page" : undefined} onClick={() => { setContinuous(true); setModal(null); scroll.current?.scrollTo({ top: 0 }); }}>전체 이어 읽기</button>
  </nav>;

  return <main className={`${frame.page} ${styles.page}`}>
    <BusinessAppChrome title="사업계획서" backHref={back} workspaceHref={isSample ? undefined : back} showRail={false}>
      {!ready ? <PlanLoading fill variant="compact" note="문서를 불러오고 있어요" /> : <div className={styles.layout}>
        {grouped.length > 0 && <aside className={styles.sidebar}><h2>목차</h2>{toc()}</aside>}
        <div className={styles.document}>
          <div className={styles.readingBar}>
            <button className={styles.tocToggle} onClick={() => setModal("toc")} disabled={!grouped.length}><List size={19} />목차</button>
            <span>{continuous ? "전체 이어 읽기" : grouped.length ? `${chapter + 1} / ${grouped.length}장` : "사업계획서"}</span>
            <span className={styles.mode}>{isSample ? "예시 문서" : editing ? "수정 중" : "읽기"}</span>
            <button className={styles.help} onClick={() => window.dispatchEvent(new CustomEvent("venture:open-support-chat", { detail: { mode: "support" } }))}>문의</button>
          </div>
          {celebrate && <div className={styles.completionNotice} role="status" aria-live="polite"><span className={styles.completeMark}><Check size={22} aria-hidden="true" /></span><div><strong>사업계획서 작성이 끝났어요</strong><p>내용을 확인하고 필요한 부분만 다듬어보세요.</p></div><button aria-label="완료 알림 닫기" onClick={() => setCelebrate(false)}><X size={18} /></button></div>}
          <div ref={scroll} className={styles.scroll} tabIndex={0} aria-label="사업계획서 본문">
            {!grouped.length ? <div className={styles.empty}><h1>아직 만든 문서가 없어요</h1><p>사업 이야기를 이어서 계획서를 만들어보세요.</p><Link href={coachHref ?? back}>사업안으로 돌아가기</Link></div> : <article className={styles.article}>
              <DocumentReadHeading title={title} planType={props.planType} isSample={isSample} completed={!!props.completionKey} />
              {props.notice && <div className={styles.notice} role="status">{props.notice} {coachHref && <Link href={coachHref}>대화로 수정하기</Link>}</div>}
              {grouped.map(([name, list], index) => (continuous || chapter === index) && <div key={name} className={styles.chapter}>
                <DocumentChapterHeading number={index + 1} title={name} />
                {list.map(section => <section className={styles.section} key={section.key} id={`sec-${section.key.replace("/", "-")}`}>
                  <DocumentSectionHeading number={props.numbering.get(section.key)?.num} title={section.sectionTitle} />
                  <div className={styles.body}><InlineDocEditor html={section.html} readOnly={isSample || !editing} status={props.editStates[section.key]?.status ?? "idle"} onDraft={html => props.onDraft(section.key, html)} onChange={html => onSave(section.key, html)} /></div>
                  {!isSample && <div className={styles.saveState}>
                    {props.editStates[section.key]?.status === "failed" ? <><p role="alert">{props.editStates[section.key].message}</p><button onClick={() => props.onRetrySave(section.key)}><RefreshCw size={15} />다시 저장</button><button onClick={() => props.onDiscardDraft(section.key)}>서버 내용 불러오기</button></> : !editing && props.editStates[section.key] && <span role="status">{props.editStates[section.key].status === "saving" ? "서버에 저장 중…" : "서버에 저장됨"}</span>}
                    {editing && props.restoreKeys.includes(section.key) && !["saving", "failed"].includes(props.editStates[section.key]?.status ?? "") && <button onClick={() => props.onRestore(section.key)}><RotateCcw size={15} />직전 내용으로 되돌리기</button>}
                  </div>}
                </section>)}
              </div>)}
              {!continuous && <nav className={styles.paging} aria-label="문서 장 이동"><button disabled={chapter === 0} onClick={() => selectChapter(chapter - 1)}><ChevronLeft size={18} />이전 장</button><button disabled={chapter === grouped.length - 1} onClick={() => selectChapter(chapter + 1)}>다음 장<ChevronRight size={18} /></button></nav>}
              {!isSample && planId && props.completionKey && (continuous || chapter === grouped.length - 1) && <div className={styles.nextStep}><h3>계획을 실제 준비로 이어가요</h3><Link href={`/plan/workspace?planId=${encodeURIComponent(planId)}&tab=launch`}>이 사업의 준비 과정 보기<ChevronRight size={18} /></Link></div>}
            </article>}
          </div>
          <footer className={styles.actions}>
            <button className={styles.secondary} disabled={!grouped.length || isSample} onClick={() => setEditing(!editing)}>{isSample ? "예시 · 읽기 전용" : editing ? "수정 마치기" : "수정하기"}</button>
            <button className={styles.primary} disabled={!grouped.length} onClick={() => setModal("download")}>내려받기</button>
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
        {Object.values(props.editStates).some(state => state.status !== "saved") && <p role="status">저장이 끝난 뒤 파일을 받을 수 있어요. 저장에 실패한 항목은 본문에서 확인해주세요.</p>}
        {props.error && <p role="alert">{props.error}</p>}
      </div>}
    </dialog>
  </main>;
}
