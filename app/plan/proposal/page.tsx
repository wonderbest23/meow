"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Download, History, LoaderCircle, Plus, RefreshCw, Save, Undo2, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import type { SavedProposal, ProposalCommand } from "../../../lib/plan-builder/proposal-editor";
import { proposalEditsSchema } from "../../../lib/plan-builder/proposal-editor";
import { renderableProposal, validateProposalBox, type ProposalBox, type ProposalElement, type ProposalSlideEdits } from "../../../lib/plan-builder/proposal-revision";
import { proposalScenes } from "../../../lib/plan-builder/proposal-scene";
import { DECK_PHASE_LABELS, deckFailureMessage } from "../../../lib/plan-builder/deck-job-types";
import ProposalCanvas from "./ProposalCanvas";
import SourceUpdatePanel from "./SourceUpdatePanel";
import BusinessConditionsPanel from "./BusinessConditionsPanel";
import DocumentRefreshPanel from "./DocumentRefreshPanel";
import type { BusinessConditionsView } from "../../../lib/plan-builder/proposal-business";
import styles from "./proposal.module.css";

type View = { title: string; saved: Omit<SavedProposal, "receipts"> | null; sourceChanged: boolean; affectedSlides: string[]; business: BusinessConditionsView | null; generationEnabled: boolean; generation: { token: string; status: string; editable: boolean } | null };
type Edits = Record<string, ProposalSlideEdits>;
type SaveStatus = "saved" | "dirty" | "saving" | "failed" | "conflict";
const labels = { title: "제목", lead: "설명", image: "이미지" };

function Editor() {
  const query = useSearchParams(); const planId = query.get("planId") ?? "";
  const [view, setView] = useState<View | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [slideIndex, setSlideIndex] = useState(0); const [element, setElement] = useState<ProposalElement>("title");
  const [status, setStatus] = useState<SaveStatus>("saved"); const [message, setMessage] = useState("");
  const [access, setAccess] = useState(0); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false); const [generationMessage, setGenerationMessage] = useState("");
  const [sourceWorking, setSourceWorking] = useState(false);
  const [businessWorking, setBusinessWorking] = useState(false);
  const [documentWorking, setDocumentWorking] = useState(false);
  const undo = useRef<Edits[]>([]); const editRef = useRef(edits); editRef.current = edits;
  const viewRef = useRef(view); viewRef.current = view;
  const statusRef = useRef(status); statusRef.current = status;
  const inFlight = useRef(false); const pending = useRef<{ command: ProposalCommand; edits: Edits } | null>(null);
  const version = useRef(0); const currentPlan = useRef(planId); currentPlan.current = planId;

  const accept = useCallback((data: View) => { setView(data); setEdits(data.saved?.document.edits ?? {}); setStatus("saved"); setMessage(""); pending.current = null; undo.current = []; }, []);
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

  async function send(command: ProposalCommand, snapshot: Edits) {
    if (inFlight.current || sourceWorking || businessWorking || documentWorking) return;
    inFlight.current = true; pending.current = { command, edits: snapshot }; setStatus("saving"); setMessage("");
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
      if (sentVersion === version.current && JSON.stringify(snapshot) === JSON.stringify(editRef.current)) { setEdits(data.saved.document.edits); setStatus("saved"); }
      else setStatus("dirty");
    } catch { if (currentPlan.current === planId) { setStatus("failed"); setMessage("저장 응답을 확인하지 못했어요. 같은 요청으로 다시 확인하며 편집 내용은 유지됩니다"); } }
    finally { inFlight.current = false; }
  }
  function save() {
    if (inFlight.current || access || statusRef.current === "conflict") return;
    if (pending.current) { void send(pending.current.command, pending.current.edits); return; }
    const saved = viewRef.current?.saved; if (!saved) return;
    if (Object.values(editRef.current).some(value => !proposalEditsSchema.safeParse(value).success)) { setStatus("failed"); setMessage("빈 제목이나 본문 항목을 채우고 글자 수를 확인해 주세요"); return; }
    void send({ type: "save", requestId: crypto.randomUUID(), expectedRevision: saved.revision, edits: editRef.current }, editRef.current);
  }
  useEffect(() => { if (status !== "dirty") return; const timer = setTimeout(save, 1200); return () => clearTimeout(timer); }, [edits, status, view?.saved?.revision]);

  function change(next: Edits, recordUndo = true) {
    if (sourceWorking || businessWorking || documentWorking) return;
    if (recordUndo) undo.current = [...undo.current.slice(-49), structuredClone(editRef.current)];
    version.current++; setEdits(next); setStatus(previous => previous === "conflict" || previous === "failed" ? previous : "dirty");
  }
  const proposalDocument = useMemo(() => view?.saved ? { ...view.saved.document, edits } : null, [view?.saved, edits]);
  const deck = useMemo(() => proposalDocument ? renderableProposal(proposalDocument) : null, [proposalDocument]);
  const scenes = useMemo(() => deck ? proposalScenes(deck) : [], [deck]);
  const slide = deck?.slides[slideIndex]; const scene = scenes[slideIndex];
  const selectedNode = scene?.nodes.find(node => (node.type === "text" || node.type === "image") && node.element === element);
  const box = selectedNode?.options;
  function patch(edit: ProposalSlideEdits) {
    if (!slide?.id) return;
    const old = editRef.current[slide.id] ?? {};
    change({ ...editRef.current, [slide.id]: { text: { ...old.text, ...edit.text }, layout: { ...old.layout, ...edit.layout }, content: { ...old.content, ...edit.content } } });
  }
  function move(key: ProposalElement, next: ProposalBox) { try { validateProposalBox(next); patch({ layout: { [key]: next } }); } catch { setMessage("슬라이드 범위 안에서 배치해 주세요"); } }
  async function download() {
    if (!view?.saved || status !== "saved") return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/plan/proposal?planId=${encodeURIComponent(planId)}&download=1&revision=${view.saved.revision}`, { cache: "no-store", signal: AbortSignal.timeout(90000) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.message); }
      const url = URL.createObjectURL(await response.blob()); const a = window.document.createElement("a");
      a.href = url; a.download = `${view.title} 제안서 v${view.saved.revision}.pptx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setMessage(error instanceof Error ? error.message : "내려받지 못했어요"); } finally { setBusy(false); }
  }
  function keepLocalCopy() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ planId, revision: view?.saved?.revision, edits }, null, 2)], { type: "application/json" }));
    const a = window.document.createElement("a"); a.href = url; a.download = "proposal-unsaved-edits.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function generate() {
    if (busy || !view?.generationEnabled) return; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/plan/deck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, background: true, presentation: { sector: "b2b_service", purpose: "sales" } }), signal: AbortSignal.timeout(20000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message); await refresh(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "생성 상태를 확인해 주세요"); await refresh(); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!view?.generation || !["queued", "running"].includes(view.generation.status)) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/plan/deck?planId=${encodeURIComponent(planId)}`, { cache: "no-store" });
        const data = await response.json(); if (!response.ok || currentPlan.current !== planId) return;
        setGenerationMessage(data.job?.status === "failed" ? deckFailureMessage(data.job.code, data.job.resumable) : DECK_PHASE_LABELS[data.job?.phase as keyof typeof DECK_PHASE_LABELS] ?? "제작 상태 확인 중");
        await refresh();
      } catch { setGenerationMessage("연결되면 제작 상태를 다시 확인합니다"); }
    }, 4000); return () => clearInterval(timer);
  }, [view?.generation?.status, planId, refresh]);

  const stateLabel = { saved: "저장됨", dirty: "수정 중", saving: "저장 중", failed: "저장 확인 필요", conflict: "버전 충돌" }[status];
  return <main className={styles.page}>
    <header className={styles.header}><Link href={planId ? `/plan/document?planId=${encodeURIComponent(planId)}` : "/plan"} aria-label="사업계획서로 돌아가기" title="사업계획서로 돌아가기"><ArrowLeft size={21} /></Link><div className={styles.heading}><h1>{view?.title ?? "제안서 편집"}</h1><span>B2B 제안서{view?.saved ? ` · v${view.saved.revision}` : ""}</span></div>
      {view?.saved && <><span className={styles.status} role="status">{status === "saving" ? <LoaderCircle size={15} className={styles.spin} /> : status === "saved" ? <Check size={15} /> : null}{stateLabel}</span><button title="저장" aria-label="저장" disabled={status === "saved" || status === "saving" || status === "conflict"} onClick={save}><Save size={19} /></button><button title="버전 기록" aria-label="버전 기록" aria-pressed={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}><History size={19} /></button><button className={styles.primary} aria-label="PPT 내려받기" disabled={busy || status !== "saved"} onClick={() => void download()}><Download size={18} /><span>PPT 내려받기</span></button></>}
    </header>
    {message && <div className={styles.notice} role="alert"><span>{message}</span>{status === "failed" && <button onClick={save}><RefreshCw size={15} />다시 저장</button>}{status === "conflict" && <><button onClick={keepLocalCopy}>내 수정본 보관</button><button onClick={() => { if (window.confirm("화면의 미저장 수정 대신 서버의 최신 버전을 불러올까요?")) void refresh(true); }}>최신 버전 불러오기</button></>}{!view && !access && <button onClick={() => void refresh(true)}>다시 불러오기</button>}</div>}
    {view?.saved && view.business && <BusinessConditionsPanel key={planId} planId={planId} business={view.business} sourceChanged={view.sourceChanged} canUpdate={status === "saved" && !busy && !sourceWorking && !documentWorking} onUpdated={refresh} onWorking={setBusinessWorking} />}
    {view?.saved && view.business && <DocumentRefreshPanel key={`document-${planId}`} planId={planId} business={view.business} saved={view.saved} canUpdate={status === "saved" && !busy && !sourceWorking && !businessWorking} onUpdated={refresh} onWorking={setDocumentWorking} />}
    {view?.saved && <SourceUpdatePanel planId={planId} saved={view.saved} sourceChanged={view.sourceChanged} canUpdate={status === "saved" && !busy && !businessWorking && !documentWorking} onUpdated={refresh} onWorking={setSourceWorking} />}
    {loading ? <div className={styles.empty} role="status"><LoaderCircle className={styles.spin} />제안서를 불러오는 중</div> : access ? <div className={styles.empty}><h2>{access === 401 ? "로그인이 필요해요" : access === 402 ? "문서 이용 권한을 확인해 주세요" : "사업을 찾을 수 없어요"}</h2><Link href={access === 401 ? `/account?next=${encodeURIComponent(`/plan/proposal?planId=${planId}`)}` : `/plan/workspace?planId=${encodeURIComponent(planId)}&tab=documents`}>사업으로 돌아가기</Link></div> : view && !view.saved ? <div className={styles.empty}><h2>B2B 제안서</h2><p>{generationMessage || (view.generation?.editable ? "완성된 생성 결과가 있어요" : "사업계획서를 고객 제안용 12장으로 구성합니다")}</p>{view.generation?.editable ? <button className={styles.primary} disabled={inFlight.current} onClick={() => void send({ type: "initialize", generationToken: view.generation!.token, expectedRevision: 0, requestId: crypto.randomUUID() }, {})}><Plus size={18} />편집본 만들기</button> : <button className={styles.primary} disabled={busy || !view.generationEnabled || ["queued", "running"].includes(view.generation?.status ?? "")} onClick={() => void generate()}><Plus size={18} />{view.generationEnabled ? "제안서 생성" : "생성 기능 검증 중"}</button>}</div> : deck && slide && scene && <div className={styles.layout}>
      <nav className={styles.slides} aria-label="슬라이드 목록">{deck.slides.map((item, index) => <button key={item.id} aria-current={index === slideIndex ? "page" : undefined} onClick={() => { setSlideIndex(index); setElement("title"); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.eyebrow || item.title}</strong></button>)}</nav>
      <section className={styles.stage}><div className={styles.toolbar}><span>{slideIndex + 1} / {deck.slides.length}</span><button aria-label="이전 슬라이드" title="이전 슬라이드" disabled={!slideIndex} onClick={() => setSlideIndex(slideIndex - 1)}><ChevronLeft size={18} /></button><button aria-label="다음 슬라이드" title="다음 슬라이드" disabled={slideIndex === deck.slides.length - 1} onClick={() => setSlideIndex(slideIndex + 1)}><ChevronRight size={18} /></button><span className={styles.spacer} /><button aria-label="편집 되돌리기" title="편집 되돌리기" disabled={!undo.current.length || inFlight.current} onClick={() => { const previous = undo.current.pop(); if (previous) change(previous, false); }}><Undo2 size={18} /></button><button aria-label="이 슬라이드 편집 초기화" title="이 슬라이드 편집 초기화" disabled={!edits[slide.id!]} onClick={() => { const next = { ...edits }; delete next[slide.id!]; change(next); }}><RotateCcw size={18} /></button></div>
        <div inert={sourceWorking || businessWorking || documentWorking}><ProposalCanvas scene={scene} selected={element} onSelect={setElement} onChange={move} /></div>
        <div className={styles.sources}><span>원문 근거</span>{slide.sourceSections?.join(" · ")}</div>
      </section>
      <aside className={styles.inspector} aria-label="슬라이드 편집" inert={sourceWorking || businessWorking || documentWorking}>
        {historyOpen && <section className={styles.versions}><h2>버전 기록</h2><p>현재 v{view?.saved?.revision}</p>{[...(view?.saved?.history ?? [])].reverse().map(item => <button key={item.revision} disabled={status !== "saved"} onClick={() => { if (window.confirm(`v${item.revision}의 편집 상태로 복원할까요? 현재 상태도 기록에 남습니다.`)) void send({ type: "restore", requestId: crypto.randomUUID(), expectedRevision: view!.saved!.revision, revision: item.revision }, edits); }}><History size={15} /><span>v{item.revision}<small>{new Date(item.savedAt).toLocaleString("ko-KR")}</small></span><RotateCcw size={15} /></button>)}</section>}
        <div className={styles.editScope}><h2>이 페이지 편집</h2><Link href={`/plan/document?planId=${encodeURIComponent(planId)}`}>공통 원문 수정</Link></div><label>제목<textarea aria-label="슬라이드 제목" maxLength={60} rows={3} value={slide.title} onChange={event => patch({ text: { title: event.target.value } })} /></label>
        <label>설명<textarea aria-label="슬라이드 설명" maxLength={140} rows={3} value={slide.lead ?? ""} onChange={event => patch({ text: { lead: event.target.value } })} /></label>
        {slide.points?.map((point, index) => <fieldset key={index}><legend>본문 {index + 1}</legend><input aria-label={`본문 ${index + 1} 제목`} maxLength={20} value={point.label} onChange={event => patch({ content: { points: slide.points!.map((p, i) => i === index ? { ...p, label: event.target.value } : p) } })} /><textarea aria-label={`본문 ${index + 1} 내용`} maxLength={slide.composition?.layout === "summary" ? 40 : slide.points?.length === 4 ? 60 : 90} rows={2} value={point.detail} onChange={event => patch({ content: { points: slide.points!.map((p, i) => i === index ? { ...p, detail: event.target.value } : p) } })} /></fieldset>)}
        {slide.table && <fieldset><legend>표</legend>{[slide.table.headers, ...slide.table.rows].map((row, ri) => <div className={styles.tableRow} key={ri}>{row.map((cell, ci) => <input key={ci} aria-label={`표 ${ri === 0 ? "머리글" : `${ri}행`} ${ci + 1}열`} maxLength={ri === 0 ? 12 : 25} value={cell} onChange={event => { const table = structuredClone(slide.table!); (ri === 0 ? table.headers : table.rows[ri - 1])[ci] = event.target.value; patch({ content: { table } }); }} />)}</div>)}</fieldset>}
        <section className={styles.geometry}><h2>배치</h2><div className={styles.segmented}>{(["title", "lead", ...(slide.image ? ["image"] : [])] as ProposalElement[]).map(key => <button key={key} aria-pressed={element === key} onClick={() => setElement(key)}>{labels[key]}</button>)}</div>{box ? <div className={styles.coordinates}>{(["x", "y", "w", "h"] as const).map(key => <label key={key}>{({ x: "가로 위치", y: "세로 위치", w: "너비", h: "높이" })[key]}<input type="number" aria-label={labels[element] + " " + ({ x: "가로 위치", y: "세로 위치", w: "너비", h: "높이" })[key]} step="0.05" min={key === "w" ? .25 : key === "h" ? .2 : 0} max={key === "x" || key === "w" ? 13.33 : 7.5} value={Number(box[key].toFixed(2))} onChange={event => { if (event.target.value !== "") move(element, { x: box.x, y: box.y, w: box.w, h: box.h, [key]: Number(event.target.value) }); }} /></label>)}</div> : <p>내용을 입력하면 배치할 수 있어요</p>}</section>
        <label>발표자 노트<textarea aria-label="발표자 노트" maxLength={4000} rows={4} value={slide.note ?? ""} onChange={event => patch({ text: { note: event.target.value } })} /></label>
      </aside>
    </div>}
  </main>;
}
export default function ProposalPage() { return <Suspense fallback={<main className={styles.empty}>제안서 불러오는 중</main>}><Editor /></Suspense>; }
