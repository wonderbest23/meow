"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, List, X, FileDown, FileText, Presentation, Check, RotateCcw, RefreshCw, Download, MessageSquare, PenLine } from "lucide-react";
import BusinessAppChrome from "../BusinessAppChrome";
import InlineDocEditor, { withBodyHeadingLevels } from "../InlineDocEditor";
import PlanLoading from "../PlanLoading";
import frame from "../chat/page.module.css";
import styles from "./DocumentWorkspace.module.css";
import type { assembleSections } from "../../../lib/plan-builder/plan-store";
import type { EditState } from "./use-document-edits";
import { DocumentChapterHeading, DocumentReadHeading, DocumentSectionHeading } from "./DocumentReadContent";
import ChapterPicker from "./ChapterPicker";
import editorStyles from "../InlineDocEditor.module.css";
import DocumentSourceReview, { type DocumentReviewSource } from "./DocumentSourceReview";
import type { StoredSection } from "../../../lib/plan-builder/plan-store";
import type { ExecutiveSummary } from "../../../lib/plan-builder/executive-summary";
import ExecutiveSummaryView from "./ExecutiveSummaryView";
import { useHomepageStatus } from "../use-homepage";
import { journeyNext, type HomepageStatus } from "../../../lib/plan-builder/journey";
import { loadState } from "../../../lib/plan-builder/plan-store";
import { PPT_GENERATION_VERIFIED } from "../../../lib/plan-builder/deck-availability";
import { FactCard, FactPopover, highlightFacts, pendingFactChanges, previewFactChanges, useFactEdit } from "./FactEdit";
import { RewriteConfirm } from "../chat/intake-ui/IntakePanels";
import { askConfirm } from "../../../components/confirm-dialog";
import { restoreRangeTildes } from "../../../lib/plan-builder/range-tildes";
import { withTableCellLabels } from "../../../lib/plan-builder/table-cells";
import { useStudioHeaderActions, useStudioHeaderCenter, useStudioNav, useStudioPane } from "../studio/StudioContext";
import paneHeader from "../workspace/PaneHeaderActions.module.css";
import { paneLinkCapture } from "./pane-link";
import { planChapterComposeRequest } from "../../../lib/plan-builder/studio-plan-edit";

/** Chat edits after the plan exists (phase B); the choice stays hidden until the server side is live. */
const EDIT_CHAT = process.env.NEXT_PUBLIC_INTAKE_EDIT_CHAT === "1";

type Format = "pdf" | "docx" | "pptx";

/* 작업실 PC 새 화면의 기준 폭 — 작업실(Studio.tsx WIDE_QUERY)과 같은 1024px */
const WIDE_QUERY = "(min-width: 1024px)";
function subscribeWide(callback: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const readWide = () => window.matchMedia(WIDE_QUERY).matches;
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

/** 작업실 대화 칸(showPlan)이 계획서 칸을 1장 맨 위로 열 때 붙이는 주소 꼬리(#doc-top) */
const DOC_TOP_HASH = "doc-top";

/** 쓰는 중 — 지금 쓰는 장 이름 뒤에 깜빡이는 커서, 아래로 글줄이 차오르는 듯한 자리 */
function WritingStatus({ done, total, current }: { done: number; total: number; current: string | null }) {
  return <div className={styles.writing} role="status" aria-live="polite">
    <div className={styles.writingHead}><strong>사업계획서를 작성하고 있어요</strong><span>{done} / {total}</span></div>
    <progress value={done} max={total || 1} aria-label="작성한 항목" />
    {current && <p className={styles.writingNow}>지금 쓰는 중 · <b>{current}</b><i className={styles.caret} aria-hidden="true" /></p>}
    <div className={styles.writingLines} aria-hidden="true"><i /><i /><i /></div>
    <small>창을 닫아도 계속 써요.</small>
  </div>;
}

/**
 * 다음 단계 버튼 — 화면 맨 아래, 수정·내려받기 옆 늘 같은 자리에 하나만 둔다.
 * 오른쪽 칸·문서 위 카드·완료 알림에 흩어져 있던 다음 단계 안내를 여기 하나로 모았다(사용자 피드백 2026-10).
 */
/*
 * 건너뛰는 길 — 홈페이지보다 영업신고·사업자등록이 급한 사장님이 '개업 준비'를 바로 찾게(여정 점검 2026-10-22).
 * 아래 단추 줄은 두 개로 두고(대표 요청: 아래 단추 세 개는 이상하다), 완료 알림 안에 글 링크로 둔다.
 */
function SecondaryNext({ planId, homepage }: { planId: string; homepage: HomepageStatus }) {
  const plan = loadState().plans.find(item => item.id === planId);
  const secondary = plan ? journeyNext(plan, homepage).secondary : undefined;
  if (!secondary) return null;
  return <p className={styles.secondaryNext}><Link href={secondary.href}>{secondary.title} →</Link></p>;
}

function NextStepButton({ planId, homepage, className = styles.nextButton }: { planId: string; homepage: HomepageStatus; className?: string }) {
  const plan = loadState().plans.find(item => item.id === planId);
  if (!plan) return null;
  const next = journeyNext(plan, homepage);
  /* 머리줄(PC) 단추는 이름만 — '다음 단계 · 홈페이지 만들기'의 앞말은 단추 자리가 이미 말한다(r37 글 점검). 낭독기는 aria-label 로 듣는다 */
  if (className !== styles.nextButton) return <Link className={className} href={next.href} aria-label={`다음 단계: ${next.title}`}><b>{next.title}</b><ChevronRight size={16} aria-hidden="true" /></Link>;
  return <Link className={className} href={next.href}><span>다음 단계</span><b>{next.title}</b><ChevronRight size={20} aria-hidden="true" /></Link>;
}

export default function DocumentWorkspace(props: Props) {
  const { title, planId, grouped, ready, isSample, coachHref, onSave } = props;
  /* 작업실 안이면 머리줄·왼쪽 메뉴 없이 칸 본문만 그린다 — 목차는 문서 옆에, 다른 단계 링크는 탭 바꾸기로 */
  const pane = useStudioPane();
  const nav = useStudioNav();
  const paneActive = pane?.active ?? false;
  /*
   * 작업실 안(머리줄이 있는 작업실). PC(1024px 이상)는 새 화면(studioPc — 작업실 새 화면 2026-10-24): 왼쪽 목차 칸·도구 줄 대신
   * 칸 위 얇은 줄(문서 이름 · 상세/요약 · 직접 고치기), 머리줄 가운데 장 고르기 알약, 아래 가운데 떠 있는 장 넘기기.
   * 휴대폰과 작업실 밖(예전 /plan/document)은 그대로다.
   */
  const studioHeader = !!pane && !!nav?.setHeaderActions;
  const wide = useSyncExternalStore(subscribeWide, readWide, () => false);
  const studioPc = studioHeader && wide;
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
   * 작업실 안에서는 칸이 살아 있는 채로 주소만 바뀐다(대화 칸의 '직접 고치기' 링크 등). 이 칸으로 오는 링크마다
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
   * 실제로 내려가는 상자 — 작업실 칸 안에서는 본문(.scroll)이 아니라 바깥 칸(studio-panel-*)이 내려간다.
   * 본문이 따로 스크롤 상자이던 때는 그 위에서 휠·손가락이 먹지 않았다(오른쪽 칸 따라가기 점검 2026-10-24).
   */
  const scroller = () => scroll.current?.closest<HTMLElement>('[id^="studio-panel-"]') ?? scroll.current;
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
      /* 표 위 구석의 확대 그림(표 감싸개의 ::before)을 눌러도 그 표를 띄운다 */
      const target = event.target as Element | null;
      const table = target?.closest?.(".tiptap[contenteditable=false] table") ?? target?.closest?.(".tiptap[contenteditable=false] .tableWrapper")?.querySelector("table");
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
  /*
   * 따라 읽기 — 작성 중 새 항목이 써지면 그 항목으로 부드럽게 옮겨 보여 준다(대표 요청 2026-10-24: 오른쪽에 내용이 붙어도 그대로 있었다).
   * 다만 사람이 직접 문서를 내리거나 누른 지 8초 안이면 읽는 자리를 빼앗지 않고 예전처럼 '새 항목이 써졌어요' 알림만 띄운다.
   */
  const lastReadAt = useRef(0);
  /* 마지막 장은 '작성 중'이 꺼지는 순간에 함께 도착하기도 한다 — 방금까지 쓰고 있었으면 그 장도 따라간다 */
  const wasWriting = useRef(false);
  if (props.writing) wasWriting.current = true;
  useEffect(() => {
    // 읽는 중 감지는 실제로 내려가는 상자(작업실 칸)에 건다 — 목차·여백·스크롤바·키보드로 내려도 읽는 중이다
    const node = scroller();
    if (!node) return;
    const mark = () => { lastReadAt.current = Date.now(); };
    const events = ["wheel", "touchmove", "pointerdown", "keydown"] as const;
    for (const name of events) node.addEventListener(name, mark, { passive: true });
    // 바깥 칸이 내려가도 숫자 고치기 말풍선을 닫는다(본문 onScroll 은 작업실에서는 오지 않는다)
    const closePick = () => setFactPick(null);
    node.addEventListener("scroll", closePick, { passive: true });
    return () => { for (const name of events) node.removeEventListener(name, mark); node.removeEventListener("scroll", closePick); };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!props.freshKeys?.size || continuous || summaryMode || editing || factMode) return;
    const follow = (!!props.writing || wasWriting.current) && Date.now() - lastReadAt.current > 8000;
    if (!props.writing) wasWriting.current = false;
    const keys = [...props.freshKeys];
    for (const key of keys.reverse()) {
      const index = grouped.findIndex(([, list]) => list.some(section => section.key === key));
      if (index < 0) continue;
      const section = grouped[index][1].find(item => item.key === key)!;
      const id = `sec-${key.replace("/", "-")}`;
      if (follow) {
        setArrival(null);
        if (index !== chapter) setChapter(index);
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 120);
        return;
      }
      if (index === chapter) continue;
      setArrival({ index, title: section.sectionTitle, id });
      return;
    }
  }, [props.freshKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  /* 작성이 끝나면 알림을 거둔다(그리기도 쓰는 중일 때만) — 다 쓴 뒤에도 '새 항목이 써졌어요'가 남아 있었다(여정 점검 2026-10-23) */
  useEffect(() => { if (!props.writing) setArrival(null); }, [props.writing]);
  const homepage = useHomepageStatus(isSample ? null : planId);
  /* ← 는 내 사업 목록으로 — 예전엔 사업 관리 문서 탭으로 가서, 거기 큰 단추('사업계획서 열기')가 다시 여기로 돌려보냈다 */
  const back = "/plan";

  /*
   * 완료 알림은 이 화면에서 쓰는 걸 지켜보다 끝났을 때만 — 다 만든 계획서를 다시 열 때마다(새 창 · 새 세션) 초록 띠가 다시 떴다(r37 점검).
   */
  const sawWriting = useRef(false);
  if (props.writing) sawWriting.current = true;
  useEffect(() => {
    if (!ready || !props.completionKey || isSample) { setCelebrate(false); return; }
    const key = `oneulstart:document-complete:${props.completionKey}`;
    if (!sawWriting.current) { announced.current = key; return; }
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
   * 만드는 중이면 요약 대신 '쓰는 중' 화면을 보여 준다 — 요약을 저절로 띄운 뒤에 작성이 시작돼도(작업실에서 칸을 먼저 열어 둔 경우) 상세로 돌아온다.
   */
  const autoSummary = useRef(false);
  useEffect(() => {
    if (ready && !grouped.length && props.summary && !props.writing) { autoSummary.current = true; setSummaryMode(true); }
    else if ((grouped.length || props.writing) && autoSummary.current) { autoSummary.current = false; setSummaryMode(false); }
  }, [ready, grouped.length, props.summary, props.writing]);
  /*
   * 작업실 안에서는 이 칸으로 오는 링크마다(이동 번호 paneNav) 주소의 #sec- 를 다시 읽어 그 장을 열고 옮긴다 — 칸이 이미 보여도.
   * 같은 번호로는 한 번만(칸을 오갈 때마다 끌려가지 않게). 요약·이어 읽기 중이었으면 그 장 보기로 돌아온다.
   */
  const handledHash = useRef<number | null>(null);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    /* '#doc-top' — 대화 칸의 '계획서 보기' · 작성이 끝난 순간: 1장 맨 위로(r37 점검: 보던 장 중간에 머물렀다) */
    const top = hash === DOC_TOP_HASH;
    const index = top ? (grouped.length ? 0 : -1) : grouped.findIndex(([, list]) => list.some(s => `sec-${s.key.replace("/", "-")}` === hash));
    if (index < 0) return;
    if (pane) {
      if (!paneActive || handledHash.current === paneNav) return;
      handledHash.current = paneNav;
      setContinuous(false); setSummaryMode(false);
    }
    setChapter(index);
    if (top) { scroller()?.scrollTo({ top: 0, behavior: "instant" }); return; }
    const timer = setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }), 150);
    return () => clearTimeout(timer);
  }, [grouped.length, paneActive, paneNav]); // eslint-disable-line react-hooks/exhaustive-deps

  function readAll() { setContinuous(true); setSummaryMode(false); setModal(null); scroller()?.scrollTo({ top: 0 }); }
  /* PC에서는 목차가 왼쪽 메뉴의 이 사업 아래에 붙는다(내 사업 → 사업 → 사업계획서 → 장) */
  /* 작업실 안에는 왼쪽 메뉴가 없다 — 목차를 머리줄로 넘기지 않고 문서 옆에 그린다 */
  const documentToc = planId && !isSample && !pane && grouped.length > 0 ? {
    planId, chapters: grouped.map(([name]) => name), current: continuous && !summaryMode ? "all" as const : chapter,
    onSelect: (index: number | "all") => index === "all" ? readAll() : selectChapter(index),
  } : undefined;
  function selectChapter(index: number) {
    /* 완료 알림은 다른 장으로 넘어가면 닫는다 — 장마다 위에 붙어 읽을 자리를 가렸다 */
    setChapter(index); setContinuous(false); setSummaryMode(false); setModal(null); setCelebrate(false);
    scroller()?.scrollTo({ top: 0, behavior: "instant" });
  }

  const toc = () => <nav className={styles.toc} aria-label="문서 목차">
    {grouped.map(([name], index) => <button key={name} aria-current={!summaryMode && !continuous && chapter === index ? "page" : undefined} onClick={() => selectChapter(index)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong></button>)}
    <button className={styles.continuous} aria-current={continuous && !summaryMode ? "page" : undefined} onClick={readAll}>전체 이어 읽기</button>
  </nav>;

  /* 고친 내용이 아직 계획서에 반영되지 않았는지 — 예전엔 '계획서에 반영하기'가 화면 위 카드에만 있어 아래 '수정 마치기'로 그냥 끝내기 쉬웠다 */
  const factsUnapplied = factMode && facts.snapshot?.documentStatus === "stale";
  /* 이번에 직접 고친 사실이 있을 때만 '반영하지 않고 마칠까요?'를 묻는다 — 대화로 고친 뒤 열기만 하고 닫아도 물었다(r37 점검) */
  const [factSavedHere, setFactSavedHere] = useState(false);
  useEffect(() => { if (!factMode) setFactSavedHere(false); }, [factMode]);
  /*
   * 한 장 요약은 읽기 전용 요약이라 수정 단추를 두지 않는다.
   * 고치기 단추 이름은 둘뿐 — '대화로 고치기' · '직접 고치기'(여정 점검 2026-10-23: 같은 일을 하는 단추 이름이 네 가지로 섞여 있었다).
   * 작업실 안에서는 '대화로 고치기'가 장 머리·도구 줄에 따로 있어 이 단추는 바로 직접 고치기를 연다. 예전 화면만 고르는 창(대화로 · 직접)을 연다.
   */
  const chooseEdit = EDIT_CHAT && !!coachHref && !pane;
  const editButton = summaryMode ? null : <button className={styles.secondary} disabled={!grouped.length || (factEditable && !!props.writing)} onClick={() => { if (factEditable) { /* 고를 방법이 하나뿐이면(채팅 수정 꺼짐) 창 없이 바로 문장 고치기로(대표 요청 2026-10-15) */ if (chooseEdit) setModal("edit"); else setFactMode(true); return; } setEditing(!editing); }}>{editing ? "수정 마치기" : factEditable && chooseEdit ? "고치기" : "직접 고치기"}</button>;
  /*
   * 3단계(작업실 안): 장마다 '대화로 고치기' — 대화 칸 입력창을 그 장 고치기로 연다(nav.composeInChat).
   * 고치기는 대화 칸의 기존 채팅 수정(바꿀 사실 카드 → 바꾸기/그대로 두기)이 맡는다 — 계획서 칸은 plan-section 처리기를 등록하지 않는다.
   * 채팅 수정이 꺼져 있거나(EDIT_CHAT) 작업실 밖·예시·작성 중이면 단추가 없다. '직접 고치기'는 예전 수정하기(사실 고치기 · 본문 고치기)와 같다.
   */
  const chatEdit = EDIT_CHAT && factEditable && !!nav?.composeInChat && !props.writing;
  const askChatEdit = (index: number) => {
    const entry = grouped[index];
    if (!entry || !nav?.composeInChat) return;
    nav.composeInChat(planChapterComposeRequest(index + 1, entry[0], entry[1].map(section => section.key)));
  };
  const directEdit = () => { if (factEditable) { setSummaryMode(false); setFactMode(true); } else setEditing(true); };
  const directEditable = !(factEditable && props.writing);
  /* PC 새 화면은 '직접 고치기'가 칸 위 얇은 줄에 하나만 있다 — 장 머리에는 '대화로 고치기'만 */
  const directInChapter = directEditable && !studioPc;
  const chapterActions = (index: number, name: string) => !pane || isSample || !planId || factMode || editing || !(chatEdit || directInChapter) ? undefined : <>
    {chatEdit && <button type="button" className={styles.chapterAction} aria-label={`${index + 1}장 ${name} — 대화로 고치기`} onClick={() => askChatEdit(index)}><MessageSquare size={14} aria-hidden="true" />대화로 고치기</button>}
    {directInChapter && <button type="button" className={styles.chapterAction} aria-label={`${index + 1}장 ${name} — 직접 고치기`} onClick={directEdit}><PenLine size={14} aria-hidden="true" />직접 고치기</button>}
  </>;
  const actionButtons = factMode ? <>
    <button className={styles.secondary} onClick={async () => {
      if (factsUnapplied && factSavedHere && !await askConfirm({ message: "고친 내용을 아직 계획서에 반영하지 않았어요. 반영하지 않고 마칠까요?", confirmLabel: "그냥 마치기", cancelLabel: "계속 고치기" })) return;
      setFactMode(false); setFactPick(null);
    }}>수정 마치기</button>
    {/* 아래 단추도 위 카드와 같은 확인창을 바로 연다 — 예전엔 위로 데려가기만 해서 같은 이름의 단추를 또 눌러야 했다 */}
    {factsUnapplied && facts.snapshot && <RewriteConfirm snapshot={facts.snapshot} disabled={facts.busy} label="계획서에 반영하기" className={styles.primary} onConfirm={() => void reflectFacts()} />}
  </> : isSample ? <>
    {/* 예시 계획서 — 예전엔 누를 수 없는 회색 '예시 · 읽기 전용'만 있어 고장 난 것처럼 보였고 다음으로 갈 길이 없었다. 예시라는 표시는 문서 제목 위에 있다 */}
    <Link className={styles.nextButton} href="/plan/chat?new=1">내 사업 시작하기</Link>
  </> : <>
    {/* 한 장 요약은 읽기 전용 요약이라 수정 단추를 두지 않는다 · 내려받기는 문서 위 '작성 완료' 옆으로 옮겼다(대표 요청 2026-10-17) */}
    {editButton}
    {showNext && planId && <NextStepButton planId={planId} homepage={homepage} />}
  </>;
  const hasActions = factMode || isSample || !summaryMode || Boolean(showNext && planId);
  const singleAction = !factMode && !(!summaryMode && showNext && planId);
  /*
   * 작업실 안(머리줄이 있는 작업실) — '다음 단계'와 '내려받기'는 작업실 머리줄 오른쪽으로 올린다(넓은 화면).
   * 문서 위 도구 줄에는 보기 바꾸기(상세/한 장 요약)·장 번호·수정하기만 남긴다. 좁은 화면은 머리줄이 좁아
   * 예전처럼 칸 아래 단추 줄(수정하기 · 다음 단계)과 문서 머리의 내려받기를 쓴다.
   */
  const toolbarButtons = studioHeader && !factMode && !isSample ? editButton : actionButtons;
  const toolbarHas = studioHeader && !factMode && !isSample ? !summaryMode : hasActions;
  /* 내려받기는 문서 머리의 칩과 같은 기준 — 상세 항목이 하나라도 있을 때 */
  const canDownloadDoc = grouped.length > 0;
  const headerNext = showNext && !!planId && !factMode;
  const studioActions = useMemo(() => {
    if (!studioHeader || isSample || (!canDownloadDoc && !headerNext)) return null;
    return <div className={`${paneHeader.group} ${paneHeader.wideOnly}`} onClickCapture={paneLinkCapture(nav, planId)}>
      {canDownloadDoc && <button type="button" className={paneHeader.btn} aria-label="내려받기" onClick={() => setModal("download")}><Download size={15} aria-hidden="true" /><span className={paneHeader.label}>내려받기</span></button>}
      {headerNext && planId && <NextStepButton planId={planId} homepage={homepage} className={`${paneHeader.btn} ${paneHeader.primary}`} />}
    </div>;
  }, [studioHeader, isSample, canDownloadDoc, headerNext, planId, homepage, nav]);
  useStudioHeaderActions(studioActions);

  /*
   * PC 새 화면: 머리줄 가운데 알약 '1장 사업 개요 1 / 5 ⌄' — 누르면 장 목록 · 전체 이어 읽기. 작업실이 가운데 자리를 주지 않으면(setHeaderCenter 없음)
   * 칸 위 얇은 줄 안에 같은 알약을 그린다.
   */
  const chapterNames = grouped.map(([name]) => name);
  const chapterKey = chapterNames.join("\n");
  const pickerCurrent = summaryMode ? "summary" as const : continuous ? "all" as const : chapter;
  const picker = useMemo(() => !studioPc || !ready || !chapterNames.length ? null
    : <ChapterPicker chapters={chapterNames} current={pickerCurrent} onSelect={pick => pick === "all" ? readAll() : selectChapter(pick)} />,
  [studioPc, ready, chapterKey, pickerCurrent]); // eslint-disable-line react-hooks/exhaustive-deps
  const centerInHeader = !!nav?.setHeaderCenter;
  useStudioHeaderCenter(centerInHeader ? picker : null);

  /*
   * 대화로 고치는 중 미리보기(PC 새 화면) — 대화 칸의 '이렇게 바꿀게요' 카드가 열려 있으면 본문에서 바뀔 글에 ~~지금~~ 바꿀 값을 겹쳐 보여 준다.
   * 대화 칸이 제안을 만들었다는 신호가 따로 없어, 이 칸 밖(대화 칸)에서 보내기·누르기가 있은 뒤 1분 동안과 제안이 열려 있는 동안만
   * 4초마다 사업 정보를 다시 읽는다(읽기만 — AI 호출 없음). 바꾸기·취소하면 다음 읽기에서 사라지고, 바꾸기는 칸 새로 읽기(refresh)로 본문도 맞춘다.
   */
  const paneRefresh = pane?.refresh ?? 0;
  const previewOn = EDIT_CHAT && studioPc && factEditable && ready && !props.writing;
  const rootRef = useRef<HTMLElement>(null);
  const factsRef = useRef(facts);
  factsRef.current = facts;
  const chatPokeAt = useRef(0);
  useEffect(() => {
    if (!previewOn) return;
    void factsRef.current.load(true);
    const poke = (event: Event) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      if (event instanceof KeyboardEvent && (event.key !== "Enter" || event.isComposing || event.shiftKey)) return;
      chatPokeAt.current = Date.now();
    };
    document.addEventListener("keydown", poke, true);
    document.addEventListener("click", poke, true);
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const job = factsRef.current.snapshot?.intake.job;
      const open = job?.kind === "edit" && (job.status === "queued" || job.status === "running" || (job.status === "complete" && !!job.proposal?.length && !job.proposalStatus));
      if (open || Date.now() - chatPokeAt.current < 60_000) void factsRef.current.load(true);
    }, 4000);
    return () => { document.removeEventListener("keydown", poke, true); document.removeEventListener("click", poke, true); window.clearInterval(timer); };
  }, [previewOn, paneRefresh]);
  const pendingJson = previewOn ? JSON.stringify(pendingFactChanges(facts.snapshot)) : "[]";
  /* 바뀔 글이 있는 항목 — 직접 고치는 중에도 계산해 둔다(대화 칸 카드의 장 칩). 본문 미리보기는 읽는 중일 때만 */
  const changedSections = useMemo(() => {
    const map = new Map<string, string>();
    const changes = JSON.parse(pendingJson) as ReturnType<typeof pendingFactChanges>;
    if (!changes.length) return map;
    for (const [, list] of grouped) for (const section of list) {
      const html = previewFactChanges(withTableCellLabels(restoreRangeTildes(section.html)), changes);
      if (html) map.set(section.key, html);
    }
    return map;
  }, [pendingJson, grouped]);
  const previews = useMemo(() => factMode || editing ? new Map<string, string>() : changedSections, [changedSections, factMode, editing]);
  /*
   * 대화 칸의 '이렇게 바꿀게요' 카드 아래 장 칩('1장 사업 개요 · 6장 가격 전략') — 바뀔 글을 찾은 장 이름을 작업실에 올린다(PC).
   * 그 제안(작업 id)의 것임을 같이 올려 카드가 앞 제안의 장을 잘못 보이지 않게 한다. 제안이 닫히거나 이 칸이 사라지면 내린다.
   */
  const pendingJobId = pendingJson !== "[]" ? facts.snapshot?.intake.job?.id ?? null : null;
  const changingChapters = grouped.flatMap(([name, list], index) => list.some(section => changedSections.has(section.key)) ? [`${index + 1}장 ${name}`] : []).join("\n");
  const publishChapters = nav?.setEditPreviewChapters;
  useEffect(() => {
    publishChapters?.(pendingJobId && changingChapters ? { jobId: pendingJobId, chapters: changingChapters.split("\n") } : null);
  }, [publishChapters, pendingJobId, changingChapters]);
  useEffect(() => () => publishChapters?.(null), [publishChapters]);
  /* 대화 칸 '고칠 곳 고르기'가 여는 장 목록(PC) — 장마다 '대화로 고치기'와 같은 요청. 고칠 수 없으면(작성 중 · 예시 등) 내린다 */
  const publishEditList = nav?.setEditChapterList;
  const editListKey = chatEdit && studioPc && !isSample ? grouped.map(([name, list]) => `${name}\u0000${list.map(section => section.key).join(",")}`).join("\u0001") : "";
  useEffect(() => {
    publishEditList?.(editListKey ? editListKey.split("\u0001").map((entry, index) => {
      const [name, keys] = entry.split("\u0000");
      return planChapterComposeRequest(index + 1, name, keys ? keys.split(",") : []);
    }) : null);
  }, [publishEditList, editListKey]);
  useEffect(() => () => publishEditList?.(null), [publishEditList]);

  // 본문 머리(사업명·빈 문서 안내)가 h1을 가질 때는 머리줄 '사업계획서'를 h1로 두지 않는다 — 2장부터는 사업명 머리가 접혀 머리줄이 h1이 된다
  const bodyTitle = ready && !(grouped.length && !summaryMode && !continuous && chapter > 0);
  /* 작업실 안이면 main 대신 칸 본문(div) — 작업실 루트가 페이지의 유일한 main 이다 */
  const Root = pane ? "div" : "main";
  const stripEdit = summaryMode ? null : <button type="button" className={styles.stripButton} disabled={!grouped.length || (factEditable && !!props.writing)} onClick={() => { if (factEditable) { setSummaryMode(false); setFactMode(true); return; } setEditing(!editing); }}><PenLine size={14} aria-hidden="true" />{editing ? "수정 마치기" : "직접 고치기"}</button>;
  return <Root ref={rootRef as never} className={`${frame.page} ${styles.page}`} data-embedded={pane ? "" : undefined} data-studio-pc={studioPc ? "" : undefined} onClickCapture={paneLinkCapture(nav, planId)}>
    <BusinessAppChrome title="사업계획서" backHref={back} showRail={!isSample} documentToc={documentToc} titleHeading={!bodyTitle}>
      {!ready ? <PlanLoading fill variant="compact" note="문서를 불러오고 있어요" /> : <div className={styles.layout}>
        {/* 예시 문서는 왼쪽 메뉴에 사업이 없으니 문서 옆에 목차를 그대로 둔다 — 작업실 안도 왼쪽 메뉴가 없어 같다 */}
        {(isSample || pane) && !studioPc && grouped.length > 0 && <aside className={styles.sidebar}><h2>목차</h2>{toc()}</aside>}
        <div className={styles.document}>
          {/* One toolbar: view toggle and page count on the left, actions on the right (PC). Phones keep the actions at the bottom. */}
          {/* PC 새 화면: 칸 위 얇은 줄 — 문서 이름 · 계획서 종류 왼쪽, 상세/요약 · 직접 고치기 오른쪽(고치는 중이면 그 단추들) */}
          {studioPc && <div className={styles.strip}>
            <FileText size={15} aria-hidden="true" className={styles.stripIcon} />
            {/* 사업명은 머리줄에, 계획서 종류 · 항목 수는 읽는 데 필요 없어 이름만(r37 글 점검) — 예시는 '예시' 표시를 남긴다 */}
            <span className={styles.stripTitle}>{isSample ? "예시 사업계획서" : "사업계획서"}</span>
            {!centerInHeader && picker}
            <span className={styles.stripSpace} />
            {/* 문서가 아직 없으면(작성 전) 보기 바꾸기 · 직접 고치기를 두지 않는다(r37 점검) */}
            {!grouped.length && !props.writing && !factMode ? null : factMode || isSample ? <div className={styles.stripActions}>{actionButtons}</div> : <>
              {props.summary && <div className={styles.stripSeg} role="group" aria-label="문서 보기 방식">
                <button type="button" aria-pressed={!summaryMode} onClick={() => { setSummaryMode(false); scroller()?.scrollTo({ top: 0 }); }}>상세 계획서</button>
                <button type="button" aria-pressed={summaryMode} onClick={() => { setSummaryMode(true); setEditing(false); scroller()?.scrollTo({ top: 0 }); }}>한 장 요약</button>
              </div>}
              {stripEdit}
            </>}
          </div>}
          {!studioPc && <div className={styles.readingBar}>
            <button className={styles.tocToggle} onClick={() => setModal("toc")} disabled={!grouped.length}><List size={19} aria-hidden="true" /><span className={styles.tocLabel}>목차</span></button>
            {props.summary && <div className={styles.viewSelector} role="group" aria-label="문서 보기 방식">
              <button aria-pressed={!summaryMode} onClick={() => { setSummaryMode(false); scroller()?.scrollTo({ top: 0 }); }}>상세 계획서</button>
              <button aria-pressed={summaryMode} onClick={() => { setSummaryMode(true); setEditing(false); scroller()?.scrollTo({ top: 0 }); }}>한 장 요약</button>
            </div>}
            <span className={styles.pageCount}>{summaryMode ? props.summary ? "" : "한 장 요약" : continuous ? "전체 이어 읽기" : grouped.length ? `${chapter + 1} / ${grouped.length}장` : "사업계획서"}</span>
            {/* 휴대폰(좁은 화면)의 도구 줄 — 장 머리가 위로 밀려 올라가도 지금 보는 장을 대화로 고칠 수 있게. 넓은 화면은 장 머리 단추만 */}
            {chatEdit && !factMode && !editing && !summaryMode && !continuous && grouped[chapter] && <button type="button" className={styles.chapterChatEdit} aria-label={`${chapter + 1}장 ${grouped[chapter][0]} — 대화로 고치기`} onClick={() => askChatEdit(chapter)}><MessageSquare size={15} aria-hidden="true" />대화로 고치기</button>}
            {toolbarHas && <div className={styles.toolbarActions} data-next={(showNext && !studioHeader) || undefined}>{toolbarButtons}</div>}
          </div>}
          {props.summaryError && <p className={styles.notice} role="alert">{props.summaryError}</p>}
          <div ref={scroll} className={styles.scroll} tabIndex={0} aria-label="사업계획서 본문" data-fact-mode={factMode || undefined} onScroll={() => setFactPick(null)}>
            {/* 완료 알림은 본문과 함께 올라간다(예전엔 위에 고정돼 장마다 85px 를 가렸다) */}
            {celebrate && <div className={styles.completionNotice} role="status" aria-live="polite"><span className={styles.completeMark}><Check size={22} aria-hidden="true" /></span><div><strong>사업계획서 작성이 끝났어요</strong>{planId && !studioHeader && <SecondaryNext planId={planId} homepage={homepage} />}</div><button aria-label="완료 알림 닫기" onClick={() => setCelebrate(false)}><X size={18} /></button></div>}
            {!grouped.length && !(summaryMode && props.summary) && props.writing ? <article className={styles.article}><DocumentReadHeading level={pane ? 2 : 1} studio={studioHeader} title={title} planType={props.planType} isSample={isSample} identity={props.identity} /><WritingStatus {...props.writing} /></article> : !grouped.length && !(summaryMode && props.summary) ? <div className={styles.empty} data-pane={pane ? "" : undefined}>{pane ? <h2>아직 만든 문서가 없어요</h2> : <h1>아직 만든 문서가 없어요</h1>}{/* 작업실 안은 대화 칸에 있는 '사업계획서 만들기'로 — 예전 '사업안으로 돌아가기'는 어디로 가는지 몰랐다(r37 점검) */}{pane ? <Link className={styles.emptyPrimary} href={coachHref ?? back}>사업계획서 만들기<ChevronRight size={18} aria-hidden="true" /></Link> : <><p>사업 이야기를 이어서 계획서를 만들어 보세요.</p><Link href={coachHref ?? back}>사업안으로 돌아가기</Link></>}</div> : <article className={styles.article}>
              {/* 사업명·설명 머리 묶음은 맨 앞(1장·전체 이어 읽기·한 장 요약)에서만 — 장마다 되풀이돼 휴대폰에서 읽을 칸이 좁았다. 다른 장에서는 작성 완료·내려받기 칩만 */}
              <DocumentReadHeading level={pane ? 2 : 1} studio={studioHeader} pc={studioPc} title={title} planType={props.planType} isSample={isSample} completed={!!props.completionKey} identity={props.identity} onDownload={grouped.length ? () => setModal("download") : undefined} compact={!summaryMode && !continuous && chapter > 0} />
                            {props.writing && <WritingStatus {...props.writing} />}
                            {props.writing && arrival && arrival.index !== chapter && !continuous && <button type="button" className={styles.arrival} onClick={() => { setChapter(arrival.index); const id = arrival.id; setArrival(null); requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>새 항목이 써졌어요 · <b>{arrival.title}</b> 보기 →</button>}
              {factMode && <FactCard edit={facts} onPick={(id, rect) => setFactPick({ id, rect })} onReflect={() => void reflectFacts()} />}
              {props.notice && !props.writing && !factMode && <div className={`${styles.notice} ${styles.noticeRow}`} role="status"><span>{props.notice}</span>{factEditable && facts.snapshot?.documentStatus === "stale"
                /* 반영 단추는 바로 '다시 쓸까요?' 확인창을 연다 — 예전엔 고치기 화면만 열려 같은 단추를 또 찾아 눌러야 했다 */
                ? <RewriteConfirm snapshot={facts.snapshot} disabled={facts.busy} label="계획서에 반영하기" className={styles.noticeAction} onConfirm={() => void reflectFacts()} />
                : factEditable ? <button type="button" className={styles.noticeAction} onClick={() => { setSummaryMode(false); setFactMode(true); }}>직접 고치기</button> : coachHref && <Link className={styles.noticeAction} href={coachHref}>대화로 고치기</Link>}{facts.error && <span className={styles.factError} role="alert">{facts.error.message} {facts.error.href && <Link href={facts.error.href}>{facts.error.label}</Link>}</span>}</div>}
              {summaryMode && props.summary ? <ExecutiveSummaryView summary={props.summary} /> : grouped.map(([name, list], index) => (continuous || chapter === index) && <div key={name} className={styles.chapter} data-changing={(studioPc && list.some(section => previews.has(section.key))) || undefined}>
                <DocumentChapterHeading number={index + 1} title={name} pc={studioPc} lead={studioPc && index === 0 ? props.identity : undefined}
                  actions={studioPc && list.some(section => previews.has(section.key)) ? <><span className={styles.changingBadge}><i aria-hidden="true" />대화로 고치는 중</span>{chapterActions(index, name)}</> : chapterActions(index, name)} />
                {list.map(section => <section className={styles.section} key={section.key} id={`sec-${section.key.replace("/", "-")}`}>
                  <DocumentSectionHeading number={props.numbering.get(section.key)?.num} title={section.sectionTitle} />
                  <div className={styles.body} data-fresh={props.freshKeys?.has(section.key) || undefined}>{factMode
                    ? <div className={`tiptap ${styles.factBody}`} onClick={event => pickFact(event.target)} onKeyDown={event => { if (event.key === "Enter") pickFact(event.target); }} dangerouslySetInnerHTML={{ __html: withBodyHeadingLevels(highlightFacts(withTableCellLabels(restoreRangeTildes(section.html)), facts.facts)) }} />
                    /* 대화로 고치는 중 미리보기 — 바뀔 글이 있는 항목만 읽기 화면과 같은 모양의 고정 글로 그린다(편집기는 <s>·<ins> 를 지운다) */
                    : previews.has(section.key) ? <div className={editorStyles.wrap}><div><div className={`tiptap ProseMirror ${editorStyles.surface} ${styles.changePreview}`} contentEditable={false} dangerouslySetInnerHTML={{ __html: withBodyHeadingLevels(previews.get(section.key)!) }} /></div></div>
                    : <InlineDocEditor html={section.html} readOnly={isSample || !editing} status={props.editStates[section.key]?.status ?? "idle"} onDraft={html => props.onDraft(section.key, html)} onChange={html => onSave(section.key, html)} />}</div>
                  {!isSample && <div className={styles.saveState}>
                    {props.editStates[section.key]?.status === "failed" ? <><p role="alert">{props.editStates[section.key].message}</p><button onClick={() => props.onRetrySave(section.key)}><RefreshCw size={15} />다시 저장</button><button onClick={() => props.onDiscardDraft(section.key)}>서버 내용 불러오기</button></> : !editing && props.editStates[section.key] && <span role="status">{props.editStates[section.key].status === "saving" ? "서버에 저장 중…" : "서버에 저장됨"}</span>}
                    {editing && props.restoreKeys.includes(section.key) && !["saving", "failed"].includes(props.editStates[section.key]?.status ?? "") && <button onClick={() => props.onRestore(section.key)}><RotateCcw size={15} />직전 내용으로 되돌리기</button>}
                  </div>}
                  {/* 고치는 중에는 항목마다 붙는 '이전 조건으로 작성됨' 검토 묶음을 숨긴다 — 반영하기 전부터 문서 열 곳에 같은 상자가 붙어 어지러웠다 */}
                  {!factMode && !isSample && planId && props.reviewSource?.sections[section.key] && props.onReviewed && <DocumentSourceReview key={`${section.key}:${props.reviewSource.revision}:${props.reviewSource.sections[section.key]}`} planId={planId} sectionKey={section.key} source={props.reviewSource} disabled={editing || ["saving", "failed"].includes(props.editStates[section.key]?.status ?? "")} onReviewed={props.onReviewed} />}
                </section>)}
              </div>)}
              {!summaryMode && !continuous && !studioPc && <nav className={styles.paging} aria-label="문서 장 이동"><button disabled={chapter === 0} onClick={() => selectChapter(chapter - 1)}><ChevronLeft size={18} />이전 장</button><button disabled={chapter === grouped.length - 1} onClick={() => selectChapter(chapter + 1)}>다음 장<ChevronRight size={18} /></button></nav>}
                          </article>}
          </div>
          {/* PC 새 화면: 아래 가운데 떠 있는 장 넘기기 — '‹ 1장 / 5장 2장 고객과 시장 ›' */}
          {studioPc && ready && !summaryMode && !continuous && grouped.length > 1 && <nav className={styles.pager} aria-label="문서 장 이동">
            <button type="button" className={styles.pagerIcon} aria-label="이전 장" disabled={chapter === 0} onClick={() => selectChapter(chapter - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
            {chapter < grouped.length - 1
              ? <button type="button" className={styles.pagerNext} onClick={() => selectChapter(chapter + 1)} aria-label={`다음 장: ${chapter + 2}장 ${grouped[chapter + 1][0]}`}><span>{chapter + 2}장 {grouped[chapter + 1][0]}</span><ChevronRight size={16} aria-hidden="true" /></button>
              : <button type="button" className={styles.pagerNext} onClick={readAll}><span>전체 이어 읽기</span></button>}
          </nav>}
          {hasActions && <footer className={styles.actions} data-next={showNext || undefined} data-single={singleAction || undefined}>{actionButtons}</footer>}
        </div>
      </div>}
    </BusinessAppChrome>
    <dialog ref={dialog} className={styles.dialog} onCancel={() => setModal(null)} onClose={() => setModal(null)} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) setModal(null); } }} aria-labelledby="document-dialog-title">
      <header className={styles.dialogHeader}><h2 id="document-dialog-title">{modal === "toc" ? "어디부터 볼까요?" : modal === "edit" ? "어떻게 고칠까요?" : summaryMode && props.summary ? "한 장 요약 내려받기" : "상세 계획서 내려받기"}</h2><button aria-label="닫기" onClick={() => setModal(null)}><X size={22} /></button></header>
      {modal === "edit" ? <div className={styles.editChoices}>
        {EDIT_CHAT && coachHref && <Link href={`${coachHref}&edit=chat`} onClick={() => setModal(null)}><strong>대화로 고치기</strong><small>“가격을 올려줘”처럼 말하기</small></Link>}
        <button onClick={() => { setModal(null); setSummaryMode(false); setFactMode(true); }}><strong>직접 고치기</strong><small>숫자·사실을 눌러 바꾸기</small></button>
      </div> : modal === "toc" ? toc() : <div className={styles.downloads}>
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
  {factMode && factPick && <FactPopover key={factPick.id} edit={facts} questionId={factPick.id} anchor={factPick.rect} onClose={() => setFactPick(null)} onSaved={() => { setFactPick(null); setFactSavedHere(true); props.onFactsSaved?.(); }} />}
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
