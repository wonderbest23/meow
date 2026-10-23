"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, List, X, FileDown, FileText, Presentation, Check, RotateCcw, RefreshCw } from "lucide-react";
import BusinessAppChrome from "../BusinessAppChrome";
import InlineDocEditor, { withBodyHeadingLevels } from "../InlineDocEditor";
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
import { PPT_GENERATION_VERIFIED } from "../../../lib/plan-builder/deck-availability";
import { FactCard, FactPopover, highlightFacts, useFactEdit } from "./FactEdit";
import { RewriteConfirm } from "../chat/intake-ui/IntakePanels";
import { askConfirm } from "../../../components/confirm-dialog";
import { restoreRangeTildes } from "../../../lib/plan-builder/range-tildes";
import { withTableCellLabels } from "../../../lib/plan-builder/table-cells";
import { useStudioNav, useStudioPane } from "../studio/StudioContext";
import { paneLinkCapture } from "./pane-link";

/** Chat edits after the plan exists (phase B); the choice stays hidden until the server side is live. */
const EDIT_CHAT = process.env.NEXT_PUBLIC_INTAKE_EDIT_CHAT === "1";

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
  /** 내려받기 — 파일을 받았으면 true(창을 닫고 '내려받았어요'를 잠깐 보인다) */
  onDownload: (format: Format, view?: "summary" | "detailed") => Promise<boolean> | boolean | void; canDownload: (format: Format, view?: "summary" | "detailed") => boolean;
  summary?: ExecutiveSummary | null; summaryError?: string;
  reviewSource?: DocumentReviewSource | null;
  onReviewed?: (key: string, section: StoredSection, updatedAt: string) => void;
  /** The owner re-applied changed facts: the document is being rewritten, so restart the progress polling. */
  onReflected?: () => void;
  /** A fact was saved from the document; amounts may have been swapped into the text on the server. */
  onFactsSaved?: () => void;
};

/** 쓰는 중 — 지금 쓰는 장 이름 뒤에 깜빡이는 커서, 아래로 글줄이 차오르는 듯한 자리 */
function WritingStatus({ done, total, current }: { done: number; total: number; current: string | null }) {
  return <div className={styles.writing} role="status" aria-live="polite">
    <div className={styles.writingHead}><strong>사업계획서를 작성하고 있어요</strong><span>{done} / {total}</span></div>
    <progress value={done} max={total || 1} aria-label="작성한 항목" />
    {current && <p className={styles.writingNow}>지금 쓰는 중 · <b>{current}</b><i className={styles.caret} aria-hidden="true" /></p>}
    <div className={styles.writingLines} aria-hidden="true"><i /><i /><i /></div>
    <small>새 항목이 끝날 때마다 바로 나타나요. 다른 장에 써지면 알려 드려요. 창을 닫아도 계속 만들어져요.</small>
  </div>;
}

/**
 * 다음 단계 버튼 — 화면 맨 아래, 수정·내려받기 옆 늘 같은 자리에 하나만 둔다.
 * 오른쪽 칸·문서 위 카드·완료 알림에 흩어져 있던 다음 단계 안내를 여기 하나로 모았다(사용자 피드백 2026-10).
 */
/*
 * 건너뛰는 길 — 홈페이지보다 영업신고·사업자등록이 급한 사장님이 '사업 시작하기'를 바로 찾게(여정 점검 2026-10-22).
 * 아래 단추 줄은 두 개로 두고(대표 요청: 아래 단추 세 개는 이상하다), 완료 알림 안에 글 링크로 둔다.
 */
function SecondaryNext({ planId, homepage }: { planId: string; homepage: HomepageStatus }) {
  const plan = loadState().plans.find(item => item.id === planId);
  const secondary = plan ? journeyNext(plan, homepage).secondary : undefined;
  if (!secondary) return null;
  return <p className={styles.secondaryNext}><Link href={secondary.href}>{secondary.title} →</Link></p>;
}

function NextStepButton({ planId, homepage }: { planId: string; homepage: HomepageStatus }) {
  const plan = loadState().plans.find(item => item.id === planId);
  if (!plan) return null;
  const next = journeyNext(plan, homepage);
  return <Link className={styles.nextButton} href={next.href}><span>다음 단계</span><b>{next.title}</b><ChevronRight size={20} aria-hidden="true" /></Link>;
}

export default function DocumentWorkspace(props: Props) {
  const { title, planId, grouped, ready, isSample, coachHref, onSave } = props;
  /* 작업실 안이면 머리줄·왼쪽 메뉴 없이 칸 본문만 그린다 — 목차는 문서 옆에, 다른 단계 링크는 탭 바꾸기로 */
  const pane = useStudioPane();
  const nav = useStudioNav();
  const paneActive = pane?.active ?? false;
  const [chapter, setChapter] = useState(0);
  const [continuous, setContinuous] = useState(false);
  const [editing, setEditing] = useState(false);
  const [summaryMode, setSummaryMode] = useState(false);
  const [modal, setModal] = useState<"toc" | "download" | "edit" | null>(null);
  /*
   * 계획서가 있는 사업의 "수정하기"(소유자 결정 2026-10-07): 본문 전체 자유 편집 대신 핵심 사실만 고친다.
   * 고친 내용은 모아 두었다가 "계획서에 반영하기" 한 번으로 다시 쓴다 — 항목마다 전체를 다시 쓰지 않도록.
   */
  const factEditable = !!coachHref && !!planId && !isSample;
  const [factMode, setFactMode] = useState(false);
  const [factPick, setFactPick] = useState<{ id: string; rect: DOMRect } | null>(null);
  /* 위 '바꾼 답이 아직 계획서에 들어가지 않았어요' 안내의 반영 단추도 같은 확인창을 바로 연다 — 사업 정보를 미리 불러 둔다 */
  const facts = useFactEdit(planId, factEditable && (factMode || Boolean(props.notice)));
  /*
   * 작업실 안에서는 칸이 살아 있는 채로 주소만 바뀐다(대화 칸의 '문장에서 바로 고치기' 링크 등). 이 칸으로 오는 링크마다
   * 이동 번호(paneNav)가 오르므로, 칸이 보이는 동안 번호가 바뀌면 주소를 다시 읽는다 — 이미 보이는 칸에서도 고치기가 열린다.
   * 같은 번호로는 한 번만(탭을 오갈 때마다 다시 열리지 않게).
   */
  const paneNav = pane?.nav ?? 0;
  const handledEdit = useRef<number | null>(null);
  useEffect(() => {
    if (!factEditable || new URLSearchParams(location.search).get("edit") !== "facts") return;
    if (pane) {
      if (!paneActive || handledEdit.current === paneNav) return;
      handledEdit.current = paneNav;
      setSummaryMode(false);
    }
    setFactMode(true);
  }, [factEditable, paneActive, paneNav]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickFact = (target: EventTarget | null) => {
    const mark = target instanceof Element ? target.closest<HTMLElement>("mark[data-fact]") : null;
    if (mark) setFactPick({ id: mark.dataset.fact!, rect: mark.getBoundingClientRect() });
  };
  async function reflectFacts() {
    const result = await facts.post({ action: "prepare" });
    if (result) { setFactMode(false); setFactPick(null); props.onReflected?.(); }
  }
  const [celebrate, setCelebrate] = useState(false);
  /* 내려받은 뒤 잠깐 보이는 알림 */
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2600); return () => clearTimeout(timer); }, [toast]);
  async function download(format: Format) {
    const view = summaryMode && props.summary ? "summary" as const : "detailed" as const;
    const done = await props.onDownload(format, view);
    if (done === true) { setModal(null); setToast("내려받았어요"); }
  }
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
  /*
   * PDF처럼 처음엔 표 전체를 화면 폭에 맞춰 줄여 보여 주고, '크게 보기'면 원래 크기로 상하좌우 스크롤.
   * 맞추면 60%보다 작아지는 넓은 표는 글자가 읽히지 않으므로(실제 생성 2026-10-22: '12주 할 일' 표가 4px 글자) 처음부터 크게 보기로 연다.
   */
  const [zoomFit, setZoomFit] = useState(true);
  const [zoomScale, setZoomScale] = useState(1);
  const zoomModeChosen = useRef(false);
  useEffect(() => {
    if (!zoomTable) return;
    zoomModeChosen.current = false;
    const measure = () => {
      const body = zoomBody.current, table = body?.querySelector("table");
      if (!body || !table) return;
      const available = body.clientWidth - 32;
      const scale = Math.min(1, available / Math.max(1, table.scrollWidth));
      setZoomScale(scale);
      if (!zoomModeChosen.current) { zoomModeChosen.current = true; if (scale < 0.6) setZoomFit(false); }
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
  /* 작성 중 새 항목이 지금 보고 있지 않은 장에 써지면 알려 주고 누르면 그 장으로 간다 — 예전엔 장 번호만 바뀌어 새로고침해야 하는 줄 알았다 */
  const [arrival, setArrival] = useState<{ index: number; title: string; id: string } | null>(null);
  useEffect(() => {
    if (!props.freshKeys?.size || continuous) return;
    for (const key of props.freshKeys) {
      const index = grouped.findIndex(([, list]) => list.some(section => section.key === key));
      if (index < 0 || index === chapter) continue;
      const section = grouped[index][1].find(item => item.key === key)!;
      setArrival({ index, title: section.sectionTitle, id: `sec-${key.replace("/", "-")}` });
      return;
    }
  }, [props.freshKeys]); // eslint-disable-line react-hooks/exhaustive-deps
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
  /*
   * 작업실 안에서는 이 칸으로 오는 링크마다(이동 번호 paneNav) 주소의 #sec- 를 다시 읽어 그 장을 열고 옮긴다 — 칸이 이미 보여도.
   * 같은 번호로는 한 번만(칸을 오갈 때마다 끌려가지 않게). 요약·이어 읽기 중이었으면 그 장 보기로 돌아온다.
   */
  const handledHash = useRef<number | null>(null);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const index = grouped.findIndex(([, list]) => list.some(s => `sec-${s.key.replace("/", "-")}` === hash));
    if (index < 0) return;
    if (pane) {
      if (!paneActive || handledHash.current === paneNav) return;
      handledHash.current = paneNav;
      setContinuous(false); setSummaryMode(false);
    }
    setChapter(index);
    const timer = setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }), 150);
    return () => clearTimeout(timer);
  }, [grouped.length, paneActive, paneNav]); // eslint-disable-line react-hooks/exhaustive-deps

  function readAll() { setContinuous(true); setSummaryMode(false); setModal(null); scroll.current?.scrollTo({ top: 0 }); }
  /* PC에서는 목차가 왼쪽 메뉴의 이 사업 아래에 붙는다(내 사업 → 사업 → 사업계획서 → 장) */
  /* 작업실 안에는 왼쪽 메뉴가 없다 — 목차를 머리줄로 넘기지 않고 문서 옆에 그린다 */
  const documentToc = planId && !isSample && !pane && grouped.length > 0 ? {
    planId, chapters: grouped.map(([name]) => name), current: continuous && !summaryMode ? "all" as const : chapter,
    onSelect: (index: number | "all") => index === "all" ? readAll() : selectChapter(index),
  } : undefined;
  function selectChapter(index: number) {
    /* 완료 알림은 다른 장으로 넘어가면 닫는다 — 장마다 위에 붙어 읽을 자리를 가렸다 */
    setChapter(index); setContinuous(false); setSummaryMode(false); setModal(null); setCelebrate(false);
    scroll.current?.scrollTo({ top: 0, behavior: "instant" });
  }

  const toc = () => <nav className={styles.toc} aria-label="문서 목차">
    {grouped.map(([name], index) => <button key={name} aria-current={!summaryMode && !continuous && chapter === index ? "page" : undefined} onClick={() => selectChapter(index)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong></button>)}
    <button className={styles.continuous} aria-current={continuous && !summaryMode ? "page" : undefined} onClick={readAll}>전체 이어 읽기</button>
  </nav>;

  /* 고친 내용이 아직 계획서에 반영되지 않았는지 — 예전엔 '계획서에 반영하기'가 화면 위 카드에만 있어 아래 '수정 마치기'로 그냥 끝내기 쉬웠다 */
  const factsUnapplied = factMode && facts.snapshot?.documentStatus === "stale";
  const actionButtons = factMode ? <>
    {factsUnapplied ? null : <span className={styles.factHint}>노란 부분만 고칠 수 있어요</span>}
    <button className={styles.secondary} onClick={async () => {
      if (factsUnapplied && !await askConfirm({ message: "고친 내용을 아직 계획서에 반영하지 않았어요. 반영하지 않고 마칠까요?", confirmLabel: "그냥 마치기", cancelLabel: "계속 고치기" })) return;
      setFactMode(false); setFactPick(null);
    }}>수정 마치기</button>
    {/* 아래 단추도 위 카드와 같은 확인창을 바로 연다 — 예전엔 위로 데려가기만 해서 같은 이름의 단추를 또 눌러야 했다 */}
    {factsUnapplied && facts.snapshot && <RewriteConfirm snapshot={facts.snapshot} disabled={facts.busy} label="계획서에 반영하기" className={styles.primary} onConfirm={() => void reflectFacts()} />}
  </> : isSample ? <>
    {/* 예시 계획서 — 예전엔 누를 수 없는 회색 '예시 · 읽기 전용'만 있어 고장 난 것처럼 보였고 다음으로 갈 길이 없었다. 예시라는 표시는 문서 제목 위에 있다 */}
    <Link className={styles.nextButton} href="/plan/chat?new=1">내 사업 시작하기</Link>
  </> : <>
    {/* 한 장 요약은 읽기 전용 요약이라 수정 단추를 두지 않는다 · 내려받기는 문서 위 '작성 완료' 옆으로 옮겼다(대표 요청 2026-10-17) */}
    {!summaryMode && <button className={styles.secondary} disabled={!grouped.length || (factEditable && !!props.writing)} onClick={() => { if (factEditable) { /* 고를 방법이 하나뿐이면(채팅 수정 꺼짐) 창 없이 바로 문장 고치기로(대표 요청 2026-10-15) */ if (EDIT_CHAT && coachHref) setModal("edit"); else setFactMode(true); return; } setEditing(!editing); }}>{editing ? "수정 마치기" : "수정하기"}</button>}
    {showNext && planId && <NextStepButton planId={planId} homepage={homepage} />}
  </>;
  const hasActions = factMode || isSample || !summaryMode || Boolean(showNext && planId);
  const singleAction = !factMode && !(!summaryMode && showNext && planId);

  // 본문 머리(사업명·빈 문서 안내)가 h1을 가질 때는 머리줄 '사업계획서'를 h1로 두지 않는다 — 2장부터는 사업명 머리가 접혀 머리줄이 h1이 된다
  const bodyTitle = ready && !(grouped.length && !summaryMode && !continuous && chapter > 0);
  /* 작업실 안이면 main 대신 칸 본문(div) — 작업실 루트가 페이지의 유일한 main 이다 */
  const Root = pane ? "div" : "main";
  return <Root className={`${frame.page} ${styles.page}`} data-embedded={pane ? "" : undefined} onClickCapture={paneLinkCapture(nav, planId)}>
    <BusinessAppChrome title="사업계획서" backHref={back} showRail={!isSample} documentToc={documentToc} titleHeading={!bodyTitle}>
      {!ready ? <PlanLoading fill variant="compact" note="문서를 불러오고 있어요" /> : <div className={styles.layout}>
        {/* 예시 문서는 왼쪽 메뉴에 사업이 없으니 문서 옆에 목차를 그대로 둔다 — 작업실 안도 왼쪽 메뉴가 없어 같다 */}
        {(isSample || pane) && grouped.length > 0 && <aside className={styles.sidebar}><h2>목차</h2>{toc()}</aside>}
        <div className={styles.document}>
          {/* One toolbar: view toggle and page count on the left, actions on the right (PC). Phones keep the actions at the bottom. */}
          <div className={styles.readingBar}>
            <button className={styles.tocToggle} onClick={() => setModal("toc")} disabled={!grouped.length}><List size={19} />목차</button>
            {props.summary && <div className={styles.viewSelector} role="group" aria-label="문서 보기 방식">
              <button aria-pressed={!summaryMode} onClick={() => { setSummaryMode(false); scroll.current?.scrollTo({ top: 0 }); }}>상세 계획서</button>
              <button aria-pressed={summaryMode} onClick={() => { setSummaryMode(true); setEditing(false); scroll.current?.scrollTo({ top: 0 }); }}>한 장 요약</button>
            </div>}
            <span className={styles.pageCount}>{summaryMode ? props.summary ? "" : "한 장 요약" : continuous ? "전체 이어 읽기" : grouped.length ? `${chapter + 1} / ${grouped.length}장` : "사업계획서"}</span>
            {hasActions && <div className={styles.toolbarActions} data-next={showNext || undefined}>{actionButtons}</div>}
          </div>
          {props.summaryError && <p className={styles.notice} role="alert">{props.summaryError}</p>}
          <div ref={scroll} className={styles.scroll} tabIndex={0} aria-label="사업계획서 본문" data-fact-mode={factMode || undefined} onScroll={() => setFactPick(null)}>
            {/* 완료 알림은 본문과 함께 올라간다(예전엔 위에 고정돼 장마다 85px 를 가렸다) */}
            {celebrate && <div className={styles.completionNotice} role="status" aria-live="polite"><span className={styles.completeMark}><Check size={22} aria-hidden="true" /></span><div><strong>사업계획서 작성이 끝났어요</strong><p>내용을 확인하고 필요한 부분만 다듬어 보세요. 준비되면 화면 아래 버튼으로 다음 단계를 이어가요.</p>{planId && <SecondaryNext planId={planId} homepage={homepage} />}</div><button aria-label="완료 알림 닫기" onClick={() => setCelebrate(false)}><X size={18} /></button></div>}
            {!grouped.length && !(summaryMode && props.summary) && props.writing ? <article className={styles.article}><DocumentReadHeading level={pane ? 2 : 1} title={title} planType={props.planType} isSample={isSample} identity={props.identity} /><WritingStatus {...props.writing} /></article> : !grouped.length && !(summaryMode && props.summary) ? <div className={styles.empty}>{pane ? <h2>아직 만든 문서가 없어요</h2> : <h1>아직 만든 문서가 없어요</h1>}<p>사업 이야기를 이어서 계획서를 만들어 보세요.</p><Link href={coachHref ?? back}>사업안으로 돌아가기</Link></div> : <article className={styles.article}>
              {/* 사업명·설명 머리 묶음은 맨 앞(1장·전체 이어 읽기·한 장 요약)에서만 — 장마다 되풀이돼 휴대폰에서 읽을 칸이 좁았다. 다른 장에서는 작성 완료·내려받기 칩만 */}
              <DocumentReadHeading level={pane ? 2 : 1} title={title} planType={props.planType} isSample={isSample} completed={!!props.completionKey} identity={props.identity} onDownload={grouped.length ? () => setModal("download") : undefined} compact={!summaryMode && !continuous && chapter > 0} />
                            {props.writing && <WritingStatus {...props.writing} />}
                            {arrival && arrival.index !== chapter && !continuous && <button type="button" className={styles.arrival} onClick={() => { setChapter(arrival.index); const id = arrival.id; setArrival(null); requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>새 항목이 써졌어요 · <b>{arrival.title}</b> 보기 →</button>}
              {factMode && <FactCard edit={facts} onPick={(id, rect) => setFactPick({ id, rect })} onReflect={() => void reflectFacts()} />}
              {props.notice && !props.writing && !factMode && <div className={`${styles.notice} ${styles.noticeRow}`} role="status"><span>{props.notice}</span>{factEditable && facts.snapshot?.documentStatus === "stale"
                /* 반영 단추는 바로 '다시 쓸까요?' 확인창을 연다 — 예전엔 고치기 화면만 열려 같은 단추를 또 찾아 눌러야 했다 */
                ? <RewriteConfirm snapshot={facts.snapshot} disabled={facts.busy} label="계획서에 반영하기" className={styles.noticeAction} onConfirm={() => void reflectFacts()} />
                : factEditable ? <button type="button" className={styles.noticeAction} onClick={() => { setSummaryMode(false); setFactMode(true); }}>고칠 곳 보기</button> : coachHref && <Link className={styles.noticeAction} href={coachHref}>대화로 수정하기</Link>}{facts.error && <span className={styles.factError} role="alert">{facts.error.message} {facts.error.href && <Link href={facts.error.href}>{facts.error.label}</Link>}</span>}</div>}
              {summaryMode && props.summary ? <ExecutiveSummaryView summary={props.summary} /> : grouped.map(([name, list], index) => (continuous || chapter === index) && <div key={name} className={styles.chapter}>
                <DocumentChapterHeading number={index + 1} title={name} />
                {list.map(section => <section className={styles.section} key={section.key} id={`sec-${section.key.replace("/", "-")}`}>
                  <DocumentSectionHeading number={props.numbering.get(section.key)?.num} title={section.sectionTitle} />
                  <div className={styles.body} data-fresh={props.freshKeys?.has(section.key) || undefined}>{factMode
                    ? <div className={`tiptap ${styles.factBody}`} onClick={event => pickFact(event.target)} onKeyDown={event => { if (event.key === "Enter") pickFact(event.target); }} dangerouslySetInnerHTML={{ __html: withBodyHeadingLevels(highlightFacts(withTableCellLabels(restoreRangeTildes(section.html)), facts.facts)) }} />
                    : <InlineDocEditor html={section.html} readOnly={isSample || !editing} status={props.editStates[section.key]?.status ?? "idle"} onDraft={html => props.onDraft(section.key, html)} onChange={html => onSave(section.key, html)} />}</div>
                  {!isSample && <div className={styles.saveState}>
                    {props.editStates[section.key]?.status === "failed" ? <><p role="alert">{props.editStates[section.key].message}</p><button onClick={() => props.onRetrySave(section.key)}><RefreshCw size={15} />다시 저장</button><button onClick={() => props.onDiscardDraft(section.key)}>서버 내용 불러오기</button></> : !editing && props.editStates[section.key] && <span role="status">{props.editStates[section.key].status === "saving" ? "서버에 저장 중…" : "서버에 저장됨"}</span>}
                    {editing && props.restoreKeys.includes(section.key) && !["saving", "failed"].includes(props.editStates[section.key]?.status ?? "") && <button onClick={() => props.onRestore(section.key)}><RotateCcw size={15} />직전 내용으로 되돌리기</button>}
                  </div>}
                  {/* 고치는 중에는 항목마다 붙는 '이전 조건으로 작성됨' 검토 묶음을 숨긴다 — 반영하기 전부터 문서 열 곳에 같은 상자가 붙어 어지러웠다 */}
                  {!factMode && !isSample && planId && props.reviewSource?.sections[section.key] && props.onReviewed && <DocumentSourceReview key={`${section.key}:${props.reviewSource.revision}:${props.reviewSource.sections[section.key]}`} planId={planId} sectionKey={section.key} source={props.reviewSource} disabled={editing || ["saving", "failed"].includes(props.editStates[section.key]?.status ?? "")} onReviewed={props.onReviewed} />}
                </section>)}
              </div>)}
              {!summaryMode && !continuous && <nav className={styles.paging} aria-label="문서 장 이동"><button disabled={chapter === 0} onClick={() => selectChapter(chapter - 1)}><ChevronLeft size={18} />이전 장</button><button disabled={chapter === grouped.length - 1} onClick={() => selectChapter(chapter + 1)}>다음 장<ChevronRight size={18} /></button></nav>}
                          </article>}
          </div>
          {hasActions && <footer className={styles.actions} data-next={showNext || undefined} data-single={singleAction || undefined}>{actionButtons}</footer>}
        </div>
      </div>}
    </BusinessAppChrome>
    <dialog ref={dialog} className={styles.dialog} onCancel={() => setModal(null)} onClose={() => setModal(null)} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) setModal(null); } }} aria-labelledby="document-dialog-title">
      <header className={styles.dialogHeader}><h2 id="document-dialog-title">{modal === "toc" ? "어디부터 볼까요?" : modal === "edit" ? "어떻게 고칠까요?" : "파일 내려받기"}</h2><button aria-label="닫기" onClick={() => setModal(null)}><X size={22} /></button></header>
      {modal === "edit" ? <div className={styles.editChoices}>
        <p>계획서 내용 중 이 사업에 관한 것만 고칠 수 있어요.</p>
        {EDIT_CHAT && coachHref && <Link href={`${coachHref}&edit=chat`} onClick={() => setModal(null)}><strong>채팅으로 수정하기</strong><small>“가격을 올려줘”처럼 말하면 바뀔 내용을 정리해 보여 드려요</small></Link>}
        <button onClick={() => { setModal(null); setSummaryMode(false); setFactMode(true); }}><strong>문장에서 바로 고치기</strong><small>고칠 수 있는 숫자·사실만 표시돼요. 누르고 바꾸면 돼요</small></button>
      </div> : modal === "toc" ? toc() : <div className={styles.downloads}>
        {/* 지금 보고 있는 문서를 받는다 — 예전엔 한 장 요약을 보면서도 말없이 상세 계획서 전체가 받아졌다 */}
        <p className={styles.downloadWhich}>{summaryMode && props.summary ? "지금 보고 있는 ‘한 장 요약’을 내려받아요." : "‘상세 계획서’ 전체를 내려받아요."}</p>
        {props.locked && <p className={styles.notice}>파일 내려받기는 결제 후 이용할 수 있어요. 형식을 선택하면 결제로 이어져요.</p>}
        {props.accessError ? <div className={styles.notice} role="alert">이용 권한을 확인하지 못했어요. <button className={styles.help} onClick={props.onRetryAccess}>다시 확인</button></div> : props.accessPending && <p role="status">이용 권한을 확인하고 있어요.</p>}
        {([{ format: "pdf", name: "PDF", description: "인쇄하거나 공유할 때", Icon: FileDown }, { format: "docx", name: "Word", description: "문서를 직접 고쳐 쓸 때", Icon: FileText }, { format: "pptx", name: props.deckLabel || "발표자료 PPT", description: "계획서를 발표자료로 만들 때", Icon: Presentation }] as const)
          /* PPT 는 제공 준비 중이면 줄 자체를 두지 않는다 — 결제 전 사람에게 'PPT 상태 다시 확인'이 보였다 */
          .filter(({ format }) => format !== "pptx" || (PPT_GENERATION_VERIFIED && !(summaryMode && props.summary))).map(({ format, name, description, Icon }) => <button key={format} disabled={props.exporting !== null || props.accessPending || !props.canDownload(format, summaryMode && props.summary ? "summary" : "detailed")} onClick={() => void download(format)}><Icon size={24} /><span><strong>{props.exporting === format ? "파일을 준비하고 있어요…" : name}</strong><small>{description}</small></span><ChevronRight size={20} /></button>)}
        {PPT_GENERATION_VERIFIED && props.deckStatus && <p role="status" aria-live="polite">{props.deckStatus}</p>}
        {PPT_GENERATION_VERIFIED && !isSample && planId && <Link href={`/plan/proposal?planId=${encodeURIComponent(planId)}`}>제안서 편집·제작 상태 확인</Link>}
        {Object.values(props.editStates).some(state => state.status !== "saved") && <p role="status">저장이 끝난 뒤 파일을 받을 수 있어요. 저장에 실패한 항목은 본문에서 확인해 주세요.</p>}
        {props.error && <p role="alert">{props.error}</p>}
      </div>}
    </dialog>
  {toast && <p className={styles.toast} role="status" aria-live="polite">{toast}</p>}
  {factMode && factPick && <FactPopover key={factPick.id} edit={facts} questionId={factPick.id} anchor={factPick.rect} onClose={() => setFactPick(null)} onSaved={() => { setFactPick(null); props.onFactsSaved?.(); }} />}
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
    </Root>;
}
