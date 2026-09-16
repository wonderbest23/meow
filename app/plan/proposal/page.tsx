"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Download, History, LoaderCircle, Plus, RefreshCw, Save, Undo2, Redo2, RotateCcw, ChevronLeft, ChevronRight, Copy, Trash2, ArrowUp, ArrowDown, AlignLeft, AlignCenter, AlignRight, PanelTop, Scissors } from "lucide-react";
import type { SavedProposal, ProposalCommand } from "../../../lib/plan-builder/proposal-editor";
import { proposalEditsSchema } from "../../../lib/plan-builder/proposal-editor";
import { renderableProposal, validateProposalBox, proposalPages, proposalElementLabel, splitProposalPage, type ProposalPage, type ProposalBox, type ProposalElement, type ProposalSlideEdits } from "../../../lib/plan-builder/proposal-revision";
import { proposalScenes, proposalLayoutIssues } from "../../../lib/plan-builder/proposal-scene";
import { PROPOSAL_LAYOUTS, PROPOSAL_LAYOUT_LABELS, PROPOSAL_SECTORS, SECTOR_PROFILES, PROPOSAL_PURPOSES, PURPOSE_LABELS, type ProposalLayout, type ProposalSector, type ProposalPurpose } from "../../../lib/plan-builder/proposal-blueprint";
import type { PublicDeckJob } from "../../../lib/plan-builder/deck-job-types";
import { proposalEntryState } from "../../../lib/plan-builder/deck-export-state";
import ProposalCanvas from "./ProposalCanvas";
import ProposalContentControls from "./ProposalContentControls";
import SourceUpdatePanel from "./SourceUpdatePanel";
import BusinessConditionsPanel from "./BusinessConditionsPanel";
import DocumentRefreshPanel from "./DocumentRefreshPanel";
import type { BusinessConditionsView } from "../../../lib/plan-builder/proposal-business";
import styles from "./proposal.module.css";

type View = { title: string; saved: Omit<SavedProposal, "receipts"> | null; sourceChanged: boolean; affectedSlides: string[]; business: BusinessConditionsView | null; generationEnabled: boolean; generation: (PublicDeckJob & { editable: boolean }) | null };
type Edits = Record<string, ProposalSlideEdits>;
type SaveStatus = "saved" | "dirty" | "saving" | "failed" | "conflict";
type Draft = { edits: Edits; pages: ProposalPage[] };

function Editor() {
  const query = useSearchParams(); const planId = query.get("planId") ?? "";
  const [view, setView] = useState<View | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [pages, setPages] = useState<ProposalPage[]>([]);
  const [newLayout, setNewLayout] = useState<ProposalLayout>("columns");
  const [sector, setSector] = useState<ProposalSector>("general");
  const [purpose, setPurpose] = useState<ProposalPurpose>("introduction");
  const [slideIndex, setSlideIndex] = useState(0); const [element, setElement] = useState<ProposalElement>("title");
  const [status, setStatus] = useState<SaveStatus>("saved"); const [message, setMessage] = useState("");
  const [access, setAccess] = useState(0); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false); const [generationMessage, setGenerationMessage] = useState("");
  const [sourceWorking, setSourceWorking] = useState(false);
  const [businessWorking, setBusinessWorking] = useState(false);
  const [documentWorking, setDocumentWorking] = useState(false);
  const undo = useRef<Draft[]>([]), redo = useRef<Draft[]>([]); const editRef = useRef(edits); editRef.current = edits;
  const pageRef = useRef(pages); pageRef.current = pages;
  const viewRef = useRef(view); viewRef.current = view;
  const statusRef = useRef(status); statusRef.current = status;
  const inFlight = useRef(false); const pending = useRef<{ command: ProposalCommand; edits: Edits; pages: ProposalPage[] } | null>(null);
  const version = useRef(0); const currentPlan = useRef(planId); currentPlan.current = planId;

  const accept = useCallback((data: View) => { setView(data); setEdits(data.saved?.document.edits ?? {}); const nextPages = data.saved ? proposalPages(data.saved.document) : []; setPages(nextPages); pageRef.current = nextPages; setSlideIndex(index => Math.min(index, Math.max(0, nextPages.length - 1))); setStatus("saved"); setMessage(""); setGenerationMessage(""); pending.current = null; undo.current = []; redo.current = []; }, []);
  const refresh = useCallback(async (force = false) => {
    if (!planId) { setLoading(false); setMessage("사업을 먼저 선택해 주세요"); return; }
    try {
      const response = await fetch(`/api/plan/proposal?planId=${encodeURIComponent(planId)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (currentPlan.current !== planId) return;
      if (!response.ok) {
        if ([401, 402, 404].includes(response.status)) { setAccess(response.status); setView(null); }
        throw new Error(data.message);
      }
      setAccess(0);
      if (force || !viewRef.current || statusRef.current === "saved") accept(data);
      else if (data.saved?.revision !== viewRef.current.saved?.revision) { setStatus("conflict"); setMessage("다른 탭에서 새 버전을 저장했어요. 내 수정본을 보관한 뒤 최신 버전을 불러와 주세요"); }
    } catch (error) { if (currentPlan.current === planId) setMessage(error instanceof Error ? error.message : "불러오지 못했어요"); }
    finally { if (currentPlan.current === planId) setLoading(false); }
  }, [planId, accept]);

  useEffect(() => {
    setLoading(true); setView(null); setEdits({}); setSlideIndex(0); setStatus("saved"); setAccess(0); pending.current = null;
    void refresh(true);
    const focus = () => { if (!document.hidden && !inFlight.current) void refresh(); };
    window.addEventListener("focus", focus); window.addEventListener("online", focus);
    return () => { window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [refresh]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (statusRef.current !== "saved") { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, []);

  async function send(command: ProposalCommand, snapshot: Edits, snapshotPages = pageRef.current) {
    if (inFlight.current || sourceWorking || businessWorking || documentWorking) return;
    inFlight.current = true; pending.current = { command, edits: snapshot, pages: snapshotPages }; setStatus("saving"); setMessage("");
    const sentVersion = version.current;
    try {
      const response = await fetch("/api/plan/proposal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, command }), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (currentPlan.current !== planId) return;
      if (!response.ok) {
        if (response.status === 409) { setStatus("conflict"); pending.current = null; }
        else { setStatus("failed"); if (response.status < 500) pending.current = null; }
        if ([401, 402, 404].includes(response.status)) { setAccess(response.status); setView(null); }
        setMessage(data.message ?? "저장하지 못했어요"); return;
      }
      pending.current = null; setView(data);
      if (sentVersion === version.current && JSON.stringify(snapshot) === JSON.stringify(editRef.current) && JSON.stringify(snapshotPages) === JSON.stringify(pageRef.current)) { setEdits(data.saved.document.edits); const nextPages = proposalPages(data.saved.document); setPages(nextPages); pageRef.current = nextPages; setSlideIndex(index => Math.min(index, nextPages.length - 1)); setStatus("saved"); }
      else setStatus("dirty");
    } catch { if (currentPlan.current === planId) { setStatus("failed"); setMessage("저장 응답을 확인하지 못했어요. 같은 요청으로 다시 확인하며 편집 내용은 유지됩니다"); } }
    finally { inFlight.current = false; }
  }
  function save() {
    if (inFlight.current || access || statusRef.current === "conflict") return;
    if (pending.current) { void send(pending.current.command, pending.current.edits, pending.current.pages); return; }
    const saved = viewRef.current?.saved; if (!saved) return;
    if (Object.values(editRef.current).some(value => !proposalEditsSchema.safeParse(value).success)) { setStatus("failed"); setMessage("빈 제목이나 본문 항목을 채우고 글자 수를 확인해 주세요"); return; }
    void send({ type: "save", requestId: crypto.randomUUID(), expectedRevision: saved.revision, edits: editRef.current, pages: pageRef.current }, editRef.current);
  }
  useEffect(() => { if (status !== "dirty") return; const timer = setTimeout(save, 1200); return () => clearTimeout(timer); }, [edits, pages, status, view?.saved?.revision]);

  function change(next: Edits, recordUndo = true, nextPages = pageRef.current) {
    if (sourceWorking || businessWorking || documentWorking) return;
    if (recordUndo) { undo.current = [...undo.current.slice(-19), structuredClone({ edits: editRef.current, pages: pageRef.current })]; redo.current = []; }
    version.current++; editRef.current = next; pageRef.current = nextPages; setEdits(next); setPages(nextPages); setStatus(previous => previous === "conflict" || previous === "failed" ? previous : "dirty");
  }
  const proposalDocument = useMemo(() => view?.saved && pages.length ? { ...view.saved.document, schemaVersion: 3 as const, edits, pages } : null, [view?.saved, edits, pages]);
  const deck = useMemo(() => proposalDocument ? renderableProposal(proposalDocument) : null, [proposalDocument]);
  const scenes = useMemo(() => deck ? proposalScenes(deck) : [], [deck]);
  const layoutIssues = useMemo(() => deck ? proposalLayoutIssues(deck, scenes) : [], [deck, scenes]);
  const slide = deck?.slides[slideIndex]; const scene = scenes[slideIndex];
  const selectedNode = scene?.nodes.find(node => "element" in node && node.element === element);
  const box = selectedNode?.options;
  function patch(edit: ProposalSlideEdits) {
    if (!slide?.id) return;
    const old = editRef.current[slide.id] ?? {};
    change({ ...editRef.current, [slide.id]: { text: { ...old.text, ...edit.text }, layout: { ...old.layout, ...edit.layout }, alignment: { ...old.alignment, ...edit.alignment }, content: { ...old.content, ...edit.content } } });
  }
  function pageAction(action: "add" | "duplicate" | "delete" | "up" | "down" | "layout" | "appendix") {
    if (!slide || inFlight.current || sourceWorking || businessWorking || documentWorking) return;
    const next = structuredClone(pageRef.current), nextEdits = structuredClone(editRef.current), page = next[slideIndex];
    if (action === "add" || action === "duplicate") {
      if (next.length >= 60) return;
      const id = `user-${crypto.randomUUID()}`;
      next.splice(slideIndex + 1, 0, action === "add" ? { id, layout: newLayout } : { ...page, id });
      if (action === "duplicate" && nextEdits[page.id]) nextEdits[id] = structuredClone(nextEdits[page.id]);
      setSlideIndex(slideIndex + 1); setElement("title");
    } else if (action === "delete") { if (next.length === 1 || !window.confirm("이 페이지를 삭제할까요? 되돌리기로 복원할 수 있어요.")) return; next.splice(slideIndex, 1); delete nextEdits[page.id]; setSlideIndex(Math.min(slideIndex, next.length - 1)); }
    else if (action === "layout") {
      if (!window.confirm("새 판형으로 변경할까요? 원래 내용은 보관되지만 판형에 따라 표·본문·이미지의 표시 여부가 달라집니다. 미리보기를 확인해 주세요.")) return;
      page.layout = newLayout;
    }
    else if (action === "appendix") { page.appendix = !page.appendix; if (page.appendix) { next.splice(slideIndex, 1); next.push(page); setSlideIndex(next.length - 1); } }
    else { const to = slideIndex + (action === "up" ? -1 : 1); if (to < 0 || to >= next.length) return; [next[slideIndex], next[to]] = [next[to], next[slideIndex]]; setSlideIndex(to); }
    change(nextEdits, true, next);
  }
  function travel(back: boolean) { const from = back ? undo : redo, to = back ? redo : undo, draft = from.current.pop(); if (!draft) return; to.current.push(structuredClone({ edits: editRef.current, pages: pageRef.current })); change(draft.edits, false, draft.pages); setSlideIndex(index => Math.min(index, draft.pages.length - 1)); }
  function splitPage() {
    if (!proposalDocument || !slide?.id) return;
    try { const next = splitProposalPage(proposalDocument, slide.id, `user-${crypto.randomUUID()}`); change(next.edits, true, next.pages); }
    catch { setMessage("본문 항목이나 표가 두 개 이상인 페이지를 나눌 수 있어요"); }
  }
  function move(key: ProposalElement, next: ProposalBox) { try { validateProposalBox(next); patch({ layout: { [key]: next } }); } catch { setMessage("슬라이드 범위 안에서 배치해 주세요"); } }
  async function download() {
    if (!view?.saved || status !== "saved" || layoutIssues.length) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/plan/proposal?planId=${encodeURIComponent(planId)}&download=1&revision=${view.saved.revision}`, { cache: "no-store", signal: AbortSignal.timeout(90000) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.message); }
      const url = URL.createObjectURL(await response.blob()); const a = window.document.createElement("a");
      a.href = url; a.download = `${view.title} 제안서 v${view.saved.revision}.pptx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setMessage(error instanceof Error ? error.message : "내려받지 못했어요"); } finally { setBusy(false); }
  }
  function keepLocalCopy() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ planId, revision: view?.saved?.revision, edits, pages }, null, 2)], { type: "application/json" }));
    const a = window.document.createElement("a"); a.href = url; a.download = "proposal-unsaved-edits.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function generate() {
    if (busy || !view?.generationEnabled) return; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/plan/deck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, background: true, presentation: { sector, purpose } }), signal: AbortSignal.timeout(20000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message); await refresh(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "생성 상태를 확인해 주세요"); await refresh(); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!view?.generation || !["queued", "running"].includes(view.generation.status)) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/plan/deck?planId=${encodeURIComponent(planId)}`, { cache: "no-store" });
        const data = await response.json(); if (!response.ok || currentPlan.current !== planId) return;
        setGenerationMessage(proposalEntryState({ job: data.job ?? null, editable: false, generationEnabled: viewRef.current?.generationEnabled ?? false }).message);
        await refresh();
      } catch { setGenerationMessage("연결되면 제작 상태를 다시 확인합니다"); }
    }, 4000); return () => clearInterval(timer);
  }, [view?.generation?.status, planId, refresh]);

  const stateLabel = { saved: "저장됨", dirty: "수정 중", saving: "저장 중", failed: "저장 확인 필요", conflict: "버전 충돌" }[status];
  const entry = proposalEntryState({ job: view?.generation ?? null, editable: view?.generation?.editable ?? false, generationEnabled: view?.generationEnabled ?? false });
  return <main className={styles.page}>
    <header className={styles.header}><Link href={planId ? `/plan/document?planId=${encodeURIComponent(planId)}` : "/plan"} aria-label="사업계획서로 돌아가기" title="사업계획서로 돌아가기"><ArrowLeft size={21} /></Link><div className={styles.heading}><h1>{view?.title ?? "제안서 편집"}</h1><span>{view?.saved?.document.deck.blueprint ? PURPOSE_LABELS[view.saved.document.deck.blueprint.purpose] : "제안서"}{view?.saved ? ` · v${view.saved.revision}` : ""}</span></div>
      {view?.saved && <><span className={styles.status} role="status">{status === "saving" ? <LoaderCircle size={15} className={styles.spin} /> : status === "saved" ? <Check size={15} /> : null}{stateLabel}</span><button title="저장" aria-label="저장" disabled={status === "saved" || status === "saving" || status === "conflict"} onClick={save}><Save size={19} /></button><button title="버전 기록" aria-label="버전 기록" aria-pressed={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}><History size={19} /></button><button className={styles.primary} aria-label="PPT 내려받기" disabled={busy || status !== "saved" || !!layoutIssues.length} onClick={() => void download()}><Download size={18} /><span>PPT 내려받기</span></button></>}
    </header>
    {message && <div className={styles.notice} role="alert"><span>{message}</span>{status === "failed" && <button onClick={save}><RefreshCw size={15} />다시 저장</button>}{status === "conflict" && <><button onClick={keepLocalCopy}>내 수정본 보관</button><button onClick={() => { if (window.confirm("화면의 미저장 수정 대신 서버의 최신 버전을 불러올까요?")) void refresh(true); }}>최신 버전 불러오기</button></>}{!view && !access && <button onClick={() => void refresh(true)}>다시 불러오기</button>}</div>}
    {view?.saved && view.business && <BusinessConditionsPanel key={planId} planId={planId} business={view.business} sourceChanged={view.sourceChanged} canUpdate={status === "saved" && !busy && !sourceWorking && !documentWorking} onUpdated={refresh} onWorking={setBusinessWorking} />}
    {view?.saved && view.business && <DocumentRefreshPanel key={`document-${planId}`} planId={planId} business={view.business} saved={view.saved} canUpdate={status === "saved" && !busy && !sourceWorking && !businessWorking} onUpdated={refresh} onWorking={setDocumentWorking} />}
    {view?.saved && <SourceUpdatePanel planId={planId} saved={view.saved} sourceChanged={view.sourceChanged} canUpdate={status === "saved" && !busy && !businessWorking && !documentWorking} onUpdated={refresh} onWorking={setSourceWorking} />}
    {loading ? <div className={styles.empty} role="status"><LoaderCircle className={styles.spin} />제안서를 불러오는 중</div> : access ? <div className={styles.empty}><h2>{access === 401 ? "로그인이 필요해요" : access === 402 ? "문서 이용 권한을 확인해 주세요" : "사업을 찾을 수 없어요"}</h2><Link href={access === 401 ? `/account?next=${encodeURIComponent(`/plan/proposal?planId=${planId}`)}` : `/plan/workspace?planId=${encodeURIComponent(planId)}&tab=documents`}>사업으로 돌아가기</Link></div> : view && !view.saved ? <div className={styles.empty}><h2>사업 제안서</h2><div className={styles.generationOptions}><label>업종<select value={sector} onChange={event => setSector(event.target.value as ProposalSector)}>{PROPOSAL_SECTORS.map(value => <option key={value} value={value}>{SECTOR_PROFILES[value].label}</option>)}</select></label><label>사용 목적<select value={purpose} onChange={event => setPurpose(event.target.value as ProposalPurpose)}>{PROPOSAL_PURPOSES.map(value => <option key={value} value={value}>{PURPOSE_LABELS[value]}</option>)}</select></label></div><p role="status">{generationMessage || entry.message}</p>{entry.action === "initialize" ? <button className={styles.primary} disabled={inFlight.current} onClick={() => void send({ type: "initialize", generationToken: view.generation!.token, expectedRevision: 0, requestId: crypto.randomUUID() }, {})}><Plus size={18} />{entry.label}</button> : <><button className={styles.primary} disabled={busy || entry.action !== "generate"} onClick={() => void generate()}><Plus size={18} />{entry.label}</button><button disabled={busy} onClick={() => void refresh(true)}><RefreshCw size={18} />제작 상태 다시 확인</button><Link href={`/plan/document?planId=${encodeURIComponent(planId)}`}>기존 사업계획서 열기</Link></>}</div> : deck && slide && scene && <div className={styles.layout}>
      <nav className={styles.slides} aria-label="슬라이드 목록">{deck.slides.map((item, index) => <button key={item.id} aria-current={index === slideIndex ? "page" : undefined} onClick={() => { setSlideIndex(index); setElement("title"); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.eyebrow || item.title}</strong></button>)}</nav>
      <section className={styles.stage}><div className={styles.toolbar}><span>{slideIndex + 1} / {deck.slides.length}</span><button aria-label="이전 슬라이드" title="이전 슬라이드" disabled={!slideIndex} onClick={() => setSlideIndex(slideIndex - 1)}><ChevronLeft size={18} /></button><button aria-label="다음 슬라이드" title="다음 슬라이드" disabled={slideIndex === deck.slides.length - 1} onClick={() => setSlideIndex(slideIndex + 1)}><ChevronRight size={18} /></button><span className={styles.spacer} /><button aria-label="편집 되돌리기" title="편집 되돌리기" disabled={!undo.current.length || inFlight.current} onClick={() => travel(true)}><Undo2 size={18} /></button><button aria-label="편집 다시 실행" title="편집 다시 실행" disabled={!redo.current.length || inFlight.current} onClick={() => travel(false)}><Redo2 size={18} /></button><button aria-label="이 슬라이드 편집 초기화" title="이 슬라이드 편집 초기화" disabled={!edits[slide.id!]} onClick={() => { const next = { ...edits }; delete next[slide.id!]; change(next); }}><RotateCcw size={18} /></button></div>
        <div className={styles.pageTools} inert={sourceWorking || businessWorking || documentWorking}><select aria-label="페이지 판형" value={newLayout} onChange={event => setNewLayout(event.target.value as ProposalLayout)}>{PROPOSAL_LAYOUTS.map(value => <option key={value} value={value}>{PROPOSAL_LAYOUT_LABELS[value]}</option>)}</select><button title="선택 판형으로 페이지 추가" aria-label="페이지 추가" disabled={pages.length >= 60 || inFlight.current} onClick={() => pageAction("add")}><Plus size={17} /></button><button title="현재 페이지 판형 변경" aria-label="판형 변경" disabled={inFlight.current} onClick={() => pageAction("layout")}><PanelTop size={17} /></button><button title="페이지 복제" aria-label="페이지 복제" disabled={pages.length >= 60 || inFlight.current} onClick={() => pageAction("duplicate")}><Copy size={17} /></button><button title="페이지 위로" aria-label="페이지 위로" disabled={!slideIndex || inFlight.current} onClick={() => pageAction("up")}><ArrowUp size={17} /></button><button title="페이지 아래로" aria-label="페이지 아래로" disabled={slideIndex === pages.length - 1 || inFlight.current} onClick={() => pageAction("down")}><ArrowDown size={17} /></button><button title="페이지 삭제" aria-label="페이지 삭제" disabled={pages.length === 1 || inFlight.current} onClick={() => pageAction("delete")}><Trash2 size={17} /></button><label className={styles.appendix}><input type="checkbox" checked={!!pages[slideIndex]?.appendix} onChange={() => pageAction("appendix")} />부록</label></div>
        <div inert={sourceWorking || businessWorking || documentWorking}><ProposalCanvas scene={scene} selected={element} onSelect={setElement} onChange={move} /></div>
        <div className={styles.compactTools}><button disabled={inFlight.current || pages.length >= 60 || sourceWorking || businessWorking || documentWorking || (["table", "timeline"].includes(pages[slideIndex].layout) ? (slide.table?.rows.length ?? 0) : (slide.points?.length ?? 0)) < 2} onClick={splitPage}><Scissors size={15} />본문 나누기</button></div>
        {layoutIssues.length > 0 && <div className={styles.layoutWarnings} role="status"><strong>내보내기 전 배치 확인 {layoutIssues.length}건</strong>{layoutIssues.map((issue, index) => <button key={index} onClick={() => setSlideIndex(deck.slides.findIndex(item => item.id === issue.slideId))}>{deck.slides.findIndex(item => item.id === issue.slideId) + 1}쪽 {issue.message}</button>)}</div>}
        <div className={styles.sources}><span>원문 근거</span>{slide.sourceSections?.join(" · ")}</div>
      </section>
      <aside className={styles.inspector} aria-label="슬라이드 편집" inert={sourceWorking || businessWorking || documentWorking}>
        {historyOpen && <section className={styles.versions}><h2>버전 기록</h2><p>현재 v{view?.saved?.revision}</p>{[...(view?.saved?.history ?? [])].reverse().map(item => <button key={item.revision} disabled={status !== "saved"} onClick={() => { if (window.confirm(`v${item.revision}의 편집 상태로 복원할까요? 현재 상태도 기록에 남습니다.`)) void send({ type: "restore", requestId: crypto.randomUUID(), expectedRevision: view!.saved!.revision, revision: item.revision }, edits); }}><History size={15} /><span>v{item.revision}<small>{new Date(item.savedAt).toLocaleString("ko-KR")}</small></span><RotateCcw size={15} /></button>)}</section>}
        <div className={styles.editScope}><h2>이 페이지 편집</h2><Link href={`/plan/document?planId=${encodeURIComponent(planId)}`}>공통 원문 수정</Link></div><label>제목<textarea aria-label="슬라이드 제목" maxLength={60} rows={3} value={slide.title} onChange={event => patch({ text: { title: event.target.value } })} /></label>
        <label>설명<textarea aria-label="슬라이드 설명" maxLength={140} rows={3} value={slide.lead ?? ""} onChange={event => patch({ text: { lead: event.target.value } })} /></label>
        <label>분류<input aria-label="슬라이드 분류" maxLength={40} value={slide.eyebrow} onChange={event => patch({ text: { eyebrow: event.target.value } })} /></label>
        <ProposalContentControls key={slide.id} slide={slide} patch={patch} />
        <section className={styles.geometry}><h2>배치</h2><select aria-label="배치할 요소" value={element} onChange={event => setElement(event.target.value as ProposalElement)}>{scene.nodes.flatMap(node => "element" in node && node.element ? [<option key={node.id} value={node.element}>{proposalElementLabel(node.element)} {node.element.startsWith("point:") ? node.element.split(":")[1] : ""}</option>] : [])}</select>{box ? <><div className={styles.compactTools}>{(["left", "center", "right"] as const).map((align, index) => { const Icon = [AlignLeft, AlignCenter, AlignRight][index]; return <button key={align} title={`텍스트 ${["왼쪽", "가운데", "오른쪽"][index]} 정렬`} aria-label={`텍스트 ${align} 정렬`} disabled={selectedNode?.type !== "text"} onClick={() => patch({ alignment: { [element]: align } })}><Icon size={17} /></button>; })}<button title="요소 가로 중앙" aria-label="요소 가로 중앙" onClick={() => move(element, { x: (13.33 - box.w) / 2, y: box.y, w: box.w, h: box.h })}><PanelTop size={17} /></button></div><div className={styles.coordinates}>{(["x", "y", "w", "h"] as const).map(key => <label key={key}>{({ x: "가로 위치", y: "세로 위치", w: "너비", h: "높이" })[key]}<input type="number" aria-label={proposalElementLabel(element) + " " + ({ x: "가로 위치", y: "세로 위치", w: "너비", h: "높이" })[key]} step="0.05" min={key === "w" ? .25 : key === "h" ? .2 : 0} max={key === "x" || key === "w" ? 13.33 : 7.5} value={Number(box[key].toFixed(2))} onChange={event => { if (event.target.value !== "") move(element, { x: box.x, y: box.y, w: box.w, h: box.h, [key]: Number(event.target.value) }); }} /></label>)}</div></> : <p>내용을 입력하면 배치할 수 있어요</p>}</section>
        <label>발표자 노트<textarea aria-label="발표자 노트" maxLength={4000} rows={4} value={slide.note ?? ""} onChange={event => patch({ text: { note: event.target.value } })} /></label>
      </aside>
    </div>}
  </main>;
}
export default function ProposalPage() { return <Suspense fallback={<main className={styles.empty}>제안서 불러오는 중</main>}><Editor /></Suspense>; }
