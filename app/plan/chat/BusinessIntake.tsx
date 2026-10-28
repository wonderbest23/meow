"use client";

import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PlanLoading from "../PlanLoading";
import { AlertCircle, ArrowDown, ArrowUp, Bookmark, ChevronLeft, ChevronRight, FileText, FolderOpen, Home, ListChecks, LoaderCircle, LogIn, PencilLine, RefreshCw, Sparkles, Target, Undo2, X, MessageCircle } from "lucide-react";
import BusinessAppChrome from "../BusinessAppChrome";
import { MISSING_BUSINESS_DETAIL, MISSING_BUSINESS_TITLE } from "../../../lib/plan-builder/missing-business";
import type { IntakeCommand, IntakePayload, IntakeSnapshot, IntakeValue } from "../../../lib/plan-builder/intake-types";
import { getIntakeQuestion } from "../../../lib/plan-builder/intake-questions";
import { ksicSectorLabel } from "../../../lib/plan-builder/ksic-hints";
import { announcePlanTitle, subscribePlanOwnerChange } from "../../../lib/plan-builder/plan-store";
import { loadAuthSession } from "../../../lib/client/auth-session";
import { AnswerHistory, BusinessIdentityHero, DesignProgress, DesignResult, DocumentLockedTurn, EditChatTurn, GenerationFinishedTurn, BusinessSummary, ChatSpeaker, ConversationHistory, ConversationText, currentIdentity, DesignDirection, EntryChoices, ExtractionReview, isDesignReplyText, JobProgress, NextStepAction, QuestionForm, ReplyTyping } from "./intake-ui/IntakePanels";
import { useChatSplit } from "./useChatSplit";
import { useReplyTransition } from "./intake-ui/use-reply-transition";
import { LiveComment, useLiveComment } from "./intake-ui/LiveComment";
import { useAnswerSuggestions } from "./intake-ui/AnswerSuggestions";
import { intakeNextStep, chatReflectStyle, choiceDraftSubmission, isHybridQuestion, COUNT_PREFIX, customCandidateDraftKey, draftKey, emptyAnswer, emptyDraft, entryMessage, entrySubmission, confirmedEntryCommand, isConsultationText, needsPolling, parseDraft, persistDraft, previewIntakeAnswer, readIntakePayload, routeComposerInput, seedAnswerDraft, settleDraft, shouldAcceptSnapshot, shouldShowIdeaExploration, summaryAnswerText, withRo, answerCheckPrompt, type IntakeDraft, type PendingRequest, type SuggestedNumber } from "./intake-ui/model";
import { readChatResponse } from "../../../lib/http/read-chat-response";
import { sectorCheckPrompt } from "../../../lib/plan-builder/intake-core";
import styles from "./intake.module.css";
import chatUi from "../../../components/coach-chat-ui.module.css";
import ChatLoading from "./loading";
import { GenerationCard, GenerationDialog, generationFinished, generationStalled, useGenerationProgress } from "../GenerationProgress";
import { InlineLogin } from "../../../components/login-dialog";
import { ResourcePanel } from "./intake-ui/ResourcePanel";
import { IdeaExploration } from "./intake-ui/IdeaExploration";
import { incompleteChoiceText, nextRefinementQuestion, questionPromptText } from "./intake-ui/model";
import { composerEnterSends, composerLimitNote, resultUpdateNotice, resumeSummary, visibleComposerText } from "./intake-ui/guidance";
import { nativePlatform } from "../../../lib/native-app";
import { BUNDLE_PRODUCT_AMOUNT, PACKAGE_AMOUNT } from "../../../lib/payments/domain";
import { LANDING_IDEA_PARAM, clearLandingIdea, readLandingIdea, stashLandingIdea, withoutLandingIdea } from "../../../lib/plan-builder/landing-idea";
import { ENTRY_PARAM, isEntryMode, STUDIO_PATH, studioHref, type StudioTab } from "../../../lib/plan-builder/studio";
import { homepageHref } from "../../../lib/plan-builder/journey";
import { useStudioEditChapterList, useStudioEditPreviewChapters, useStudioNav, useStudioPane, type StudioComposeRequest, type StudioEditHandler, type StudioEditTarget } from "../studio/StudioContext";
import { QueuedStudioRequests, StudioEditTurns } from "./intake-ui/StudioEditTurns";
import { planSectionEditMessage } from "../../../lib/plan-builder/studio-plan-edit";
import { WorkLog } from "./intake-ui/WorkLog";
import { designLogItem, planLogItem } from "./intake-ui/work-log";
import { editExamples } from "../../../lib/plan-builder/edit-examples";
import { STUDIO_QUEUE_LIMIT, editTurnBusy, editTurnsKey, enqueueRequest, queuedRequestRoute, readRequestQueue, requestQueueKey, restoreEditTurns, sectionHint, studioEditAction, studioEditError, studioEditReducer, studioTargetChipText, type QueuedStudioRequest, type StudioEditTurn } from "./intake-ui/studio-edit";

type SaveStatus = "saved" | "draft" | "saving" | "failed" | "conflict";
type CommandInput = Omit<IntakeCommand, "requestId" | "revision" | "planId">;

/*
 * 이 브라우저에서 마지막으로 연 사업과 그때의 로그인 여부. 다시 왔을 때 목록이 비어 있으면
 * "로그인이 풀린 것"인지 "다른 브라우저인 것"인지 구분해 안내하는 데만 쓴다(내용은 저장하지 않는다).
 */
const LAST_INTAKE_KEY = "oneul:last-intake";
function rememberLastIntake(planId: string, signedIn: boolean) {
  try { window.localStorage.setItem(LAST_INTAKE_KEY, JSON.stringify({ planId, signedIn, at: Date.now() })); } catch { /* 저장소를 못 써도 안내만 덜 구체적일 뿐이다 */ }
}
/** 로그인 전 방문자에게 질문 대신 보여 주는 첫 화면 — 안내 버튼을 한 번 더 누르지 않게 로그인 폼을 바로 펼친다. 로그인하면 지금 주소(새 대화·사업)로 돌아온다. */
function LoginGate() {
  const next = typeof window === "undefined" ? "/plan/chat?new=1" : `${window.location.pathname}${window.location.search}`;
  return <InlineLogin next={next} />;
}

/** sessionStorage — 막힌 브라우저(사생활 보호 등)에서는 꺼내기만 해도 오류가 나므로 null로 둔다 */
function sessionStore(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}
/** 랜딩에서 넘겨받을 아이디어가 있는지(주소의 idea 또는 5분 안의 보관본) — 지우지 않고 보기만 한다 */
function pendingLandingIdea() {
  return readLandingIdea(window.location.search, sessionStore(), Date.now());
}

/**
 * 작업실 탭(tab)은 대화와 상관없는 값이다 — 작업실에서 탭을 바꿀 때마다 주소의 tab 만 바뀌는데,
 * 이 값까지 보면 대화를 다시 불러오며 입력·대기열이 초기화될 수 있다. 랜딩 아이디어(idea)를 빼는 것과 같은 방식으로 뺀다.
 */
function withoutStudioTab(query: string): string {
  const params = new URLSearchParams(query);
  params.delete("tab");
  // 첫 화면 카드가 실어 보낸 시작 길(entry)도 같다 — 첫 선택지를 대신 누른 뒤 주소에서 지우는데, 그때 다시 불러오면 보내던 시작 요청이 끊긴다
  params.delete(ENTRY_PARAM);
  return params.toString();
}

/*
 * 작업실의 넓은 화면 기준 — 작업실(Studio.tsx)의 WIDE_QUERY 와 같다. 넓으면 대화와 오른쪽 칸이 나란히 보여서
 * 계획서 작성이 시작될 때 오른쪽을 계획서로 바꿔 장이 채워지는 걸 보게 하고, 좁으면(휴대폰 탭) 대화에 머물고 계획서 탭에 점만 찍는다.
 */
const STUDIO_WIDE_QUERY = "(min-width: 1024px)";

/** 작업실 3단계 기록(고치기 카드 · 기다리는 요청)용 세션 저장소 — 막힌 브라우저에서는 이 화면에서만 보인다 */
function readSession(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}
function writeSession(key: string, value: string | null) {
  try { if (value === null) window.sessionStorage.removeItem(key); else window.sessionStorage.setItem(key, value); } catch { /* 저장소를 못 쓰면 새로 고칠 때 사라질 뿐이다 */ }
}
/* 홈페이지 칸을 처음 열고 고치기 처리기가 등록되기를 기다리는 시간 — 홈페이지 칸은 처음 열 때 만든다 */
const HANDLER_WAIT_MS = 10_000;
/*
 * 작업실 대화 칸의 작성 진행 카드 안내 — PC 는 두지 않는다(오른쪽 계획서 칸이 '창을 닫아도 계속 써요'를 한 번만, r37 글 점검).
 * 휴대폰은 계획서 칸이 다른 탭이라 쓰는 동안 보낸 요청을 받아 둔다는 말까지 짧게 남긴다.
 */
const STUDIO_RUN_NOTE = "창을 닫아도 계속 써요. 기다리는 동안 보낸 요청은 다 쓰면 반영해요.";
/*
 * 작업실 PC: 홈페이지를 고치는 중일 때 입력창 위 '추천' 칩 — 누르면 입력창에 문장이 채워진다(보내지는 않는다).
 * 홈페이지 칸이 이미 받는 고치기 말(제목 · 안내 글 · 단추 글)만 고른다.
 */
const HOMEPAGE_SUGGESTIONS = [
  { label: "제목 짧게 다듬기", fill: "첫 화면 제목을 더 짧게 다듬어 줘" },
  { label: "영업시간 안내 넣기", fill: "영업시간 안내를 넣어 줘" },
  { label: "예약 단추 문구 바꾸기", fill: "예약 단추 문구를 더 분명하게 바꿔 줘" },
];
/*
 * 작업실 PC: 입력창 위 '추천' 칩 줄 — 두 줄까지 감싸 보이고, 셋째 줄로 넘어가는 칩은 통째로 숨긴다.
 * 예전엔 한 줄로 옆으로 밀게 했더니 마지막 칩이 '주 고…'처럼 칩 중간에서 잘려 보였다(새 배치 점검 2026-10-24).
 * 칸 폭이 바뀔 때마다 다시 잰다. 한 칩이 한 줄보다 길면 그 칩만 말줄임(title 에 전체 문장).
 */
type SuggestionChip = { label: string; fill?: string; pick?: () => void };
function SuggestRow({ chips, onPick }: { chips: SuggestionChip[]; onPick: (chip: SuggestionChip) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const labels = chips.map(chip => chip.label).join("\u0000");
  useLayoutEffect(() => {
    const node = row.current;
    if (!node) return;
    let width = -1;
    const fit = () => {
      if (node.clientWidth === width) return;
      width = node.clientWidth;
      const items = [...node.children] as HTMLElement[];
      const label = items.find(item => !(item instanceof HTMLButtonElement));
      const buttons = items.filter((item): item is HTMLButtonElement => item instanceof HTMLButtonElement);
      items.forEach(item => { item.hidden = false; });
      /* 줄마다 가운데 높이가 같다(align-items:center) — 서로 다른 가운데 높이 수가 줄 수 */
      const measure = () => {
        const middles = items.filter(item => !item.hidden).map(item => item.offsetTop + item.offsetHeight / 2);
        const lines: number[] = [];
        for (const middle of [...middles].sort((a, b) => a - b)) if (!lines.some(value => Math.abs(value - middle) < 8)) lines.push(middle);
        return (item: HTMLElement) => lines.findIndex(value => Math.abs(value - (item.offsetTop + item.offsetHeight / 2)) < 8);
      };
      let lineOf = measure();
      /* 좁은 칸(1024px)에서 첫 칩이 다음 줄로 넘어가 '추천' 글자만 한 줄을 차지하면 글자를 숨긴다(무리 이름은 aria-label 에 남는다) */
      if (label && buttons[0] && lineOf(buttons[0]) > lineOf(label)) { label.hidden = true; lineOf = measure(); }
      buttons.forEach(button => { if (lineOf(button) >= 2) button.hidden = true; });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [labels]);
  return <div ref={row} className={styles.suggestRow} role="group" aria-label="추천">
    <span className={styles.suggestLabel}><Sparkles size={13} aria-hidden="true" />추천</span>
    {chips.map(chip => <button key={chip.label} type="button" className={styles.suggestChip} title={chip.fill ?? chip.label} onClick={() => onPick(chip)}>{chip.label}</button>)}
  </div>;
}
/*
 * 작업실 PC: 입력창 왼쪽 아래 '고칠 곳 고르기' — 누르면 계획서의 장 목록이 열리고, 장을 고르면 입력창이 그 장 고치기로 열린다
 * (계획서 칸 장 머리의 '대화로 고치기'와 같은 요청). 예전엔 누르면 '오른쪽 계획서에서 … 누르세요' 안내 글만 떴다(r37 글 점검).
 * 키보드: 열면 첫 장에 초점, ↑↓·Home·End 로 옮기고 Enter 로 고른다. Esc · 바깥 누르기로 닫고 초점은 단추로 돌아온다.
 */
function PickChapterMenu({ chapters, onPick }: { chapters: StudioComposeRequest[]; onPick: (request: StudioComposeRequest) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const items = () => [...(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus({ preventScroll: true });
    const close = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (index: number) => { event.preventDefault(); list[(index + list.length) % list.length]?.focus(); };
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); }
  };
  return <div ref={wrap} className={styles.pickWrap}>
    <button ref={button} type="button" className={styles.composerAction} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}><Target size={14} aria-hidden="true" />고칠 곳 고르기</button>
    {open && <div id={menuId} className={styles.pickMenu} role="menu" aria-label="고칠 장 고르기" onKeyDown={onKey}>
      {chapters.map(request => <button key={`${request.label}:${request.sectionId ?? ""}`} type="button" role="menuitem" tabIndex={-1} onClick={() => { setOpen(false); onPick(request); }}>{sectionHint(request.label)}</button>)}
    </div>}
  </div>;
}

function readLastIntake(): { planId: string; signedIn: boolean } | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(LAST_INTAKE_KEY) ?? "null");
    return value && typeof value.planId === "string" ? { planId: value.planId, signedIn: value.signedIn === true } : null;
  } catch { return null; }
}
export type BusinessIntakeProps = {
  onPrepared?: (payload: IntakePayload) => void;
  onDesignComplete?: (snapshot: IntakeSnapshot) => void;
  /** 작업실 PC 에서 오른쪽에 보이는 열린 칸 — '홈페이지를 대화로 고치기' 제안에 쓴다. 작업실 밖·휴대폰은 없음 */
  studioSide?: StudioTab | null;
};
const HEADERS = { "x-business-intake": "2" };
/** Browser network failures ("Failed to fetch", "Load failed") become plain Korean; our own messages pass through. */
function friendlyError(caught: unknown): string | null {
  if (!(caught instanceof Error)) return null;
  if (caught.name === "TypeError" || /failed to fetch|load failed|networkerror|network request failed/i.test(caught.message)) return "인터넷 연결이 잠시 끊겼어요. 입력은 이 기기에 보관해 뒀어요.";
  return caught.message;
}
/*
 * 불러오기·보내기가 막힌 이유 중 손님이 할 일이 다른 두 가지 — 로그인이 풀림(401)은 다시 로그인하기, 요청이 잠시 많음(429)은 잠시 뒤 다시 시도.
 * 예전엔 둘 다 '사업 정보를 불러오지 못했어요 · 최신 내용 불러오기'로 보여 무엇을 해야 할지 몰랐다(점검 2026-10-23).
 */
const SESSION_LOST_TEXT = "로그인이 풀렸어요. 입력한 내용은 이 기기에 보관해 뒀어요.";
const BUSY_TEXT = "요청이 잠시 많아요. 잠시 후 다시 시도해 주세요.";
class SnapshotError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const sessionExpired = (caught: unknown) => caught instanceof SnapshotError && caught.status === 401;
const COACH_CHAT = process.env.NEXT_PUBLIC_INTAKE_COACH_CHAT === "1";
// Chat edits after the plan exists (phase B); the entry button stays hidden until the server side is live.
const COACH_EDIT_CHAT = process.env.NEXT_PUBLIC_INTAKE_EDIT_CHAT === "1";

function hasLocalInput(draft: IntakeDraft) {
  return !!draft.memo || !!draft.help || !!draft.introMessage || !!draft.resourceEditor && Object.keys(draft.resourceEditor).length > 0 || Object.values(draft.answers).some(answer => answer.text.length > 0 || answer.selected.length > 0 || answer.unknown);
}

export default function BusinessIntake(props: BusinessIntakeProps) {
  /* 바깥 로딩(ChatLoading)과 같은 틀 — 왼쪽 메뉴가 사라졌다 나타나지 않게. 작업실 칸 안에서는 ChatLoading 이 칸 안의 작은 로딩만 그린다 */
  return <Suspense fallback={<ChatLoading />}><IntakeWorkspace {...props} /></Suspense>;
}

function IntakeWorkspace({ onPrepared, onDesignComplete, studioSide = null }: BusinessIntakeProps) {
  const searchParams = useSearchParams();
  // 랜딩 아이디어(idea)는 주소에서 지워도 대화를 다시 불러오지 않게 뺀 값으로 본다 — 지우는 순간 보내던 첫 메시지가 끊기지 않게
  const queryString = withoutLandingIdea(searchParams);
  const routeQuery = withoutStudioTab(queryString);
  /* 작업실(사업 작업실)의 왼쪽 대화 칸 안이면 값이 있다 — 밖(/plan/chat)에서는 null 이라 예전과 똑같이 동작한다 */
  const studioPane = useStudioPane();
  const studioNav = useStudioNav();
  const embedded = !!studioPane;
  /*
   * 작업실 PC(넓은 화면) — 대화 칸을 새 모양(말풍선 없는 AI 글 · 작업 기록 줄 · 흰 질문 카드 · 흰 입력 카드)으로 그린다.
   * 휴대폰 작업실과 예전 대화 화면(/plan/chat)은 예전 모양 그대로다. 화면 폭이 바뀌면 따라 바뀐다.
   */
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!embedded) return;
    const query = window.matchMedia(STUDIO_WIDE_QUERY);
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [embedded]);
  const pro = embedded && wide;
  /* 대화 칸이 지금 보이는지 — 작업실 휴대폰 탭에서 다른 탭을 보는 중이면 false. 효과 안에서 최신 값을 읽으려고 ref 로 둔다 */
  const paneVisible = useRef(true);
  paneVisible.current = studioPane ? studioPane.active : true;
  const [savedPlan, setPlan] = useState<IntakeSnapshot | null>(null);
  const [preview, setPreview] = useState<IntakeSnapshot | null>(null);
  const previewRef = useRef<IntakeSnapshot | null>(null);
  previewRef.current = preview;
  /*
   * 저장을 기다리는 답 — 코치 채팅에서는 앞 답이 서버에 저장되는 동안에도 다음 답을 받는다(소유자 피드백 2026-10-09:
   * 다음 질문이 이미 보이는데 저장 응답까지 2초 동안 눌리지 않았다). 답은 이 기기에서 바로 다음 질문을 그리고,
   * 서버에는 앞 요청이 끝난 뒤 순서대로 보낸다. 앞 저장이 실패하면 기다리던 답은 보내지 않는다(입력은 질문 칸에 남는다).
   */
  const queuedAnswers = useRef<Array<{ input: CommandInput; captured?: Pick<PendingRequest, "answer" | "text" | "intro" | "composer"> }>>([]);
  const plan = preview ?? savedPlan;
  /* 작업실 PC: '이렇게 바꿀게요' 카드의 장 칩 — 계획서 칸이 이 제안(작업 id)에서 찾은 장 이름 */
  const editChapterList = useStudioEditChapterList();
  /*
   * 휴대폰: 자판이 열리면(보이는 높이가 150px 넘게 줄면) 진행 줄을 접는다 — 자판 위에 대화가 거의 안 보였다(r37 휴대폰 점검)
   */
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport || !embedded) return;
    const check = () => setKeyboardOpen(window.innerHeight - viewport.height > 150 && !window.matchMedia(STUDIO_WIDE_QUERY).matches);
    check();
    viewport.addEventListener("resize", check);
    return () => viewport.removeEventListener("resize", check);
  }, [embedded]);
  const editChapters = useStudioEditPreviewChapters(pro && plan?.intake.job?.kind === "edit" ? plan.intake.job.id : null);
  // Keep the conversation primary at completion, without shifting the panes.
  // 채팅에 집중: 오른쪽 요약은 늘 끌어서 줄일 수 있는 최소 너비로 시작한다(소유자 결정 2026-10-07). 끌어서 넓혀도 다음에 열면 다시 최소.
  const split = useChatSplit({ key: "oneulstart:intake-split:answering", defaultShare: 100, minChatPx: 300, minSidePx: 300, maxShare: 85, remember: false });
  const planRef = useRef<IntakeSnapshot | null>(null);
  const ownerScope = useRef<string | null>(null);
  const [ownerChanged, setOwnerChanged] = useState(false);
  const [intentPrompt, setIntentPrompt] = useState<{ text: string; questionId: string | null; revision: number; canAnswer: boolean; suggested?: SuggestedNumber } | null>(null);
  // 판매 가격 0원 확인 — 보낼 답을 들고 있다가 [맞아요]면 그대로 저장한다(입력을 고치면 사라진다)
  /* 금액 확인(판매 가격 0원 · 현실 범위 밖 금액) — 같은 질문을 한 번 더 묻는다. text가 없으면 서버가 멈춰 세운 답이다(입력창과 맞추지 않는다) */
  const [amountCheck, setAmountCheck] = useState<{ text?: string; questionId: string; value: IntakeValue; revision: number; prompt: string } | null>(null);
  const [draft, setDraft] = useState<IntakeDraft>(emptyDraft);
  const liveComment = useLiveComment();
  const answerSuggestions = useAnswerSuggestions(plan?.planId);
  const [ideaRejectIds, setIdeaRejectIds] = useState<string[]>([]);
  // 마지막으로 고른 AI 제안 — 저장하지 못하면 그 카드 바로 아래에 이유를 보인다
  const [ideaPick, setIdeaPick] = useState<string | null>(null);
  // 붙여 넣은 글이 1,200자를 넘어 잘렸는지(조용히 잘리면 뒤쪽이 사라진 줄 모른다)
  const [pasteCut, setPasteCut] = useState(false);
  // 숫자 질문에 읽을 수 없는 숫자를 보냈을 때 예시와 함께 보여 줄 한 줄(새로 입력하면 지운다)
  const [inputHint, setInputHint] = useState("");
  const draftRef = useRef<IntakeDraft>(draft);
  const memoryDrafts = useRef(new Map<string, IntakeDraft>());
  const storageKey = useRef(draftKey());
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [newEntry, setNewEntry] = useState(false);
  const [busy, setBusy] = useState(false);
  // '사업계획서 만들기' 대기 표시 — 결제 화면으로 넘어가는 동안(주소 이동은 몇 초 걸린다)에도 유지한다(대표 지적 2026-10-16: 눌러도 멈춘 것 같았다)
  const [preparing, setPreparing] = useState(false);
  const leavingForPay = useRef(false);
  /* 작업실: 이 화면에서 지켜본 계획서 작성이 방금 끝났는지 — 진행 카드 자리에 마무리 말(계획서 보기 · 홈페이지 만들기)을 남긴다 */
  const [justFinished, setJustFinished] = useState(false);
  const sawGenerating = useRef(false);
  /* 이 화면에서 작성이 끝나는 걸 지켜본 시각 — PC 작업 기록의 '계획서 n장을 썼어요 · 걸린 시간'에만 쓴다(못 봤으면 시간을 붙이지 않는다) */
  const runFinishedAt = useRef<number | null>(null);
  /*
   * 작업실 3단계 — 대화로 고치기 대상(입력창 위 칩 '홈페이지 고치기 ✕'), 그때의 입력, 이 화면에서 연 채팅 수정(계획서 한 장 고치기를
   * 예전 채팅 수정으로 보낼 때 — 주소의 edit=chat 과 같은 화면), 고치기 기록, 계획서를 쓰는 동안 보낸 요청(사업마다 세션 저장소).
   */
  const [editTarget, setEditTarget] = useState<StudioComposeRequest | null>(null);
  const [studioText, setStudioText] = useState("");
  const [chatEditLocal, setChatEditLocal] = useState(false);
  /* 작업실: 계획서가 있는 사업에서 입력창으로 새로 보냈는지 — 그 뒤의 실패는 지난 실패가 아니라 방금 보낸 것의 실패라 알린다 */
  const [chatSent, setChatSent] = useState(false);
  const [editState, dispatchEdit] = useReducer(studioEditReducer, { planId: null, turns: [] });
  const [requestQueue, setRequestQueue] = useState<{ planId: string | null; items: QueuedStudioRequest[] }>({ planId: null, items: [] });
  const studioTail = useRef<HTMLDivElement>(null);
  /* 결제 여부를 '사업계획서 만들기'가 보일 때 미리 알아 둔다 — 결제 전이면 누르는 즉시 결제 화면으로(서버 왕복 두 번을 건너뛴다). 작성 여부는 서버가 다시 막는다 */
  const [payAccess, setPayAccess] = useState<{ planId: string; paid: boolean; authenticated: boolean } | null>(null);
  const router = useRouter();
  /* 화면 안 이동 — 작업실 안에서는 같은 사업의 화면이면 탭만 바꾸고(나머지는 작업실이 실제로 이동), 밖에서는 예전처럼 router */
  const navigate = (href: string) => { if (studioNav) studioNav.push(href); else router.push(href); };
  const busyRef = useRef(false);
  const conflictRef = useRef(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [login, setLogin] = useState(false);
  // 서버가 알려 준 로그인 여부. 모르는 동안은 로그인한 것으로 두어 경고를 미리 띄우지 않는다.
  const [signedIn, setSignedIn] = useState(true);
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;
  /* 로그인이 풀려 저장을 멈췄는지 — '최신 내용 불러오기'(손님 계정으로 바뀌어 입력이 안 보인다) 대신 다시 로그인하는 길만 둔다 */
  const [sessionLost, setSessionLost] = useState(false);
  /* 사업 수 한도(20개)에 닿음 — 시작 단추를 막고 '내 사업으로' 길을 보인다 */
  const [planLimit, setPlanLimit] = useState(false);
  // 사업 기획은 로그인 후에만 시작한다. 서버가 loginRequired 로 알려 주면 질문 대신 로그인 안내를 보여 준다.
  const [loginGate, setLoginGate] = useState(false);
  const [preparedRevision, setPreparedRevision] = useState<number | null>(null);
  const prepared = preparedRevision !== null && preparedRevision === (plan?.coach.documentRevision ?? plan?.coach.revision);
  const [resume, setResume] = useState("");
  const [view, setView] = useState<"input" | "summary">("input");
  // Coach chat (messenger layout, chips that send on their own). Off → the current intake screen, unchanged.
  const coach = COACH_CHAT;
  // PC: the summary side opens on demand while answering, and by itself once the direction summary is ready.
  const [deskSummary, setDeskSummary] = useState(false);
  const autoSubmit = useRef<string | null>(null);
  const [deferredReview, setDeferredReview] = useState("");
  const routeEpoch = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const inputPane = useRef<HTMLElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const currentTurn = useRef<HTMLDivElement>(null);
  /* 작업실 대화 칸의 작성 진행 카드 — 나타나면 카드 전체가 보이게 내린다(scrollToCurrent) */
  const runCard = useRef<HTMLDivElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const { turn: replyTurn, active: replyActive, begin: beginReply, finish: finishReply, reset: resetReply } = useReplyTransition();
  const manualScroll = useRef(false);
  const touchY = useRef(0);
  const lastDesign = useRef("");
  const completedCallback = useRef(onDesignComplete);
  // 랜딩 아이디어를 넘겨받는 단계 — idle(아직) · armed(입력창에 넣고 보내기 직전) · gated(로그인 기다림) · done(보냈거나 없음)
  const landingIdea = useRef<{ phase: "idle" | "armed" | "gated" | "done"; text: string }>({ phase: "idle", text: "" });
  completedCallback.current = onDesignComplete;

  const writeDraft = useCallback((next: IntakeDraft) => {
    const scoped = { ...next, ownerScope: ownerScope.current };
    draftRef.current = scoped;
    setDraft(scoped);
    if (!ownerScope.current) return false;
    const stored = persistDraft(storageKey.current, scoped, memoryDrafts.current, () => sessionStorage);
    setStorageError(!stored);
    return stored;
  }, []);
  const editDraft = (next: IntakeDraft) => {
    writeDraft(next);
    if (!busyRef.current && !draftRef.current.pending && !conflictRef.current) setStatus("draft");
  };
  const restoreDraft = useCallback((id: string | null, scope: string) => {
    ownerScope.current = scope;
    storageKey.current = draftKey(id, scope);
    let next = memoryDrafts.current.get(storageKey.current);
    if (!next || next.ownerScope !== scope) {
      try { next = parseDraft(sessionStorage.getItem(storageKey.current), id, scope); }
      catch { setStorageError(true); next = emptyDraft(); }
    }
    next.ownerScope = scope;
    draftRef.current = next; setDraft(next);
    conflictRef.current = !!next.pending?.conflict;
    setStatus(next.pending?.conflict ? "conflict" : next.pending ? "failed" : hasLocalInput(next) ? "draft" : "saved");
    if (next.pending) setError(next.pending.conflict ? "저장된 내용과 겹쳐 저장하지 못했어요. 입력은 이 기기에 남아 있어요." : "방금 보낸 내용이 저장됐는지 확인하지 못했어요. '다시 시도'를 눌러 주세요.");
  }, []);

  const freezeForOwnerChange = useCallback(() => {
    routeEpoch.current += 1;
    resetReply();
    for (const controller of controllers.current) controller.abort();
    busyRef.current = false; setBusy(false); setLoaded(true);
    conflictRef.current = true; setOwnerChanged(true); setPreview(null); setStatus("conflict");
    setError("계정이 바뀌어 저장을 멈췄어요. 입력한 내용은 이 기기에 따로 보관해 뒀어요. 지금 계정으로 다시 불러와 주세요.");
    /*
     * 로그인해 쓰던 중 로그인이 풀렸으면(세션 만료·다른 탭에서 로그아웃) 다시 로그인하는 길을 연다.
     * 같은 계정으로 돌아오면 보관한 입력(계정별로 따로 보관)이 그대로 이어진다. 확인하지 못하면 위 안내를 그대로 둔다.
     */
    const epoch = routeEpoch.current;
    if (signedInRef.current) void loadAuthSession().then(session => {
      if (epoch !== routeEpoch.current || session.authenticated) return;
      setSessionLost(true); setLogin(true);
      setError(SESSION_LOST_TEXT);
    }).catch(() => {});
  }, [resetReply]);

  const updateUrl = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("planId", id); url.searchParams.delete("new");
    const target = `${url.pathname}${url.search}${url.hash}`;
    if (target === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    // Passing Next's internal history state bypasses its search-parameter update.
    window.history.replaceState(null, "", target);
  }, []);
  const installPlan = useCallback((incoming: IntakeSnapshot, force = false) => {
    if (!force && (conflictRef.current || !shouldAcceptSnapshot(planRef.current, incoming))) return;
    const previous = planRef.current;
    planRef.current = incoming; setPlan(incoming);
    // 사업 이름이 바뀌면(사업 방향 정리·이름 고르기) 왼쪽 목록에 알린다 — 대화는 서버에만 저장해 목록이 옛 이름을 보였다
    if (previous?.planId !== incoming.planId || previous.title !== incoming.title) announcePlanTitle({ planId: incoming.planId, title: incoming.title, updatedAt: incoming.updatedAt });
    const job = incoming.intake.job;
    if (job?.kind === "design" && job.status === "complete" && job.id !== lastDesign.current) {
      lastDesign.current = job.id;
      try { completedCallback.current?.(incoming); } catch { /* A parent navigation callback must not invalidate saved data. */ }
    }
  }, []);

  const getSnapshot = useCallback(async (id?: string | null, signal?: AbortSignal) => {
    const response = await fetch(`/api/plan/chat${id ? `?planId=${encodeURIComponent(id)}` : ""}`, { headers: HEADERS, cache: "no-store", signal });
    const value = readIntakePayload(await readChatResponse(response));
    if (response.status === 401) throw new SnapshotError(SESSION_LOST_TEXT, 401);
    if (response.status === 429) throw new SnapshotError(BUSY_TEXT, 429);
    if (!response.ok) throw new Error(value?.message || "사업 정보를 불러오지 못했어요. 다시 시도해 주세요.");
    if (!value || !value.enabled) throw new Error("지금은 입력 화면을 쓸 수 없어요. 잠시 후 다시 불러와 주세요.");
    if (!value.ownerScope) throw new Error("계정별 저장 정보를 확인하지 못했어요. 입력은 보내지 않고 보관해 둘게요.");
    if (id && value.plan && value.plan.planId !== id) throw new Error("요청한 사업과 다른 응답을 받았어요. 다시 불러와 주세요.");
    return value;
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(routeQuery);
    const id = query.get("planId");
    // 랜딩 아이디어가 있으면 새 대화로 연다 — 로그인을 거치며 주소가 /plan/chat 으로만 돌아와도 보관본으로 이어 받는다
    const startNew = query.get("new") === "1" || !id && !!pendingLandingIdea();
    if (!startNew && id && id === planRef.current?.planId) return;
    landingIdea.current = { phase: "idle", text: "" };
    resetReply(); follow.current = true;
    const epoch = ++routeEpoch.current;
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
    const controller = new AbortController();
    controllers.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    setLoaded(false); setLoadFailed(false); setNewEntry(startNew); setError(""); setLogin(false); setPreparedRevision(null); setResume(""); setConnectionError(false); setView("input"); setOwnerChanged(false); setSessionLost(false); setPlanLimit(false);
    busyRef.current = false; setBusy(false); planRef.current = null; setPlan(null); setPreview(null); ownerScope.current = null; lastDesign.current = ""; setIntentPrompt(null); setAmountCheck(null); setJustFinished(false); sawGenerating.current = false; runFinishedAt.current = null;
    setEditTarget(null); setStudioText(""); setChatEditLocal(false); setChatSent(false);
    draftRef.current = emptyDraft(); setDraft(draftRef.current); conflictRef.current = false;
    void getSnapshot(startNew ? null : id, controller.signal).then(data => {
      if (epoch !== routeEpoch.current || controller.signal.aborted) return;
      setSignedIn(!!data.authenticated); setLoginGate(!!data.loginRequired);
      if (data.plan) rememberLastIntake(data.plan.planId, !!data.authenticated);
      restoreDraft(startNew ? null : data.plan?.planId ?? id, data.ownerScope!);
      if (!startNew && data.plan) {
        installPlan(data.plan, true); updateUrl(data.plan.planId);
        // 계획서 수정 대화(?edit=chat)에서는 '이어가면 돼요' 안내가 맞지 않는다 — 계획서가 있으면 resumeSummary도 비어 있다
        setResume(query.get("edit") === "chat" ? "" : resumeSummary(data.plan));
      }
    }).catch(caught => {
      if (epoch !== routeEpoch.current) return;
      // 로그인이 풀렸으면 '최신 내용 불러오기' 대신 다시 로그인하는 길만 둔다(채팅 수정의 로그인 안내와 같은 모양)
      if (sessionExpired(caught)) { setSessionLost(true); setLogin(true); }
      setLoadFailed(true); setError(controller.signal.aborted ? "불러오기가 지연되고 있어요. 다시 시도해 주세요." : friendlyError(caught) ?? "사업 정보를 불러오지 못했어요.");
    }).finally(() => {
      window.clearTimeout(timeout); controllers.current.delete(controller);
      if (epoch === routeEpoch.current) setLoaded(true);
    });
    return () => { controller.abort(); window.clearTimeout(timeout); controllers.current.delete(controller); };
  }, [routeQuery, getSnapshot, installPlan, restoreDraft, updateUrl, resetReply]);

  useEffect(() => () => { routeEpoch.current += 1; for (const controller of controllers.current) controller.abort(); }, []);

  useEffect(() => subscribePlanOwnerChange(freezeForOwnerChange), [freezeForOwnerChange]);

  const polling = needsPolling(savedPlan);
  useEffect(() => {
    if (!loaded || !plan?.planId || !polling || status === "conflict") return;
    const id = plan.planId, epoch = routeEpoch.current;
    let cancelled = false, inFlight = false;
    let active: AbortController | null = null;
    const poll = async () => {
      if (cancelled || inFlight || conflictRef.current || document.visibilityState === "hidden") return;
      inFlight = true; active = new AbortController();
      const controller = active;
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const data = await getSnapshot(id, controller.signal);
        if (!cancelled && epoch === routeEpoch.current && !conflictRef.current) {
          if (data.ownerScope !== ownerScope.current) { freezeForOwnerChange(); return; }
          if (!data.plan) throw new Error("missing_plan");
          installPlan(data.plan); setConnectionError(false);
        }
      } catch { if (!cancelled && epoch === routeEpoch.current) setConnectionError(true); }
      finally { window.clearTimeout(timeout); inFlight = false; }
    };
    const timer = window.setInterval(() => void poll(), 2500);
    const visible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", visible);
    return () => { cancelled = true; active?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [loaded, savedPlan?.planId, polling, status === "conflict", getSnapshot, installPlan, freezeForOwnerChange]);

  const reload = async () => {
    if (busyRef.current) return;
    const epoch = routeEpoch.current;
    busyRef.current = true; setBusy(true);
    const controller = new AbortController(); controllers.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const id = planRef.current?.planId ?? new URLSearchParams(routeQuery).get("planId");
      const data = await getSnapshot(id, controller.signal);
      if (epoch !== routeEpoch.current) return;
      setSignedIn(!!data.authenticated); setLoginGate(!!data.loginRequired);
      if (data.ownerScope !== ownerScope.current || ownerChanged) {
        restoreDraft(newEntry ? null : data.plan?.planId ?? id, data.ownerScope!);
        setOwnerChanged(false); setPreview(null); planRef.current = null; setPlan(null);
      } else if (!id && !newEntry && data.plan) restoreDraft(data.plan.planId, data.ownerScope!);
      if (!data.plan && !newEntry && id) {
        setLoaded(true); setLoadFailed(false); setError("지금 계정에서는 이 사업을 찾지 못했어요. 이전 계정에서 입력한 내용은 따로 보관돼 있어요."); return;
      }
      if (conflictRef.current) { writeDraft({ ...draftRef.current, pending: null }); conflictRef.current = false; }
      if (!newEntry && data.plan) { installPlan(data.plan, true); updateUrl(data.plan.planId); }
      setStatus(draftRef.current.pending ? "failed" : hasLocalInput(draftRef.current) ? "draft" : "saved");
      setError(draftRef.current.pending ? "방금 보낸 내용이 저장됐는지 확인하지 못했어요. '다시 시도'를 눌러 주세요." : ""); setConnectionError(false); setLoadFailed(false); setLoaded(true);
    } catch (caught) {
      if (epoch !== routeEpoch.current) return;
      if (sessionExpired(caught)) { setSessionLost(true); setLogin(true); }
      setError(!controller.signal.aborted && friendlyError(caught) || "사업 정보를 불러오지 못했어요. 입력은 그대로 남아 있어요.");
    }
    finally { window.clearTimeout(timeout); controllers.current.delete(controller); if (epoch === routeEpoch.current) { busyRef.current = false; setBusy(false); } }
  };

  /*
   * 계획서 작성이 시작되면(작업실 안) 한 번 — 넓은 화면은 오른쪽을 계획서로 바꿔 장이 채워지는 걸 보게 하고,
   * 좁은 화면(휴대폰 탭)은 대화에 머문 채 계획서 탭에 새 소식 점만 찍는다(진행은 대화 안 카드로 본다).
   */
  const revealGeneration = () => {
    if (!studioNav) return;
    if (studioNav.showTab && window.matchMedia(STUDIO_WIDE_QUERY).matches) studioNav.showTab("plan");
    else studioNav.markActivity?.("plan");
  };
  /* 작업실의 계획서 보기 — 탭 보여 주기가 없으면 작업실 이동(같은 사업의 계획서 주소는 탭 바꾸기로 바뀐다) */
  /* 계획서 칸을 1장 맨 위로 연다(#doc-top) — 예전엔 보던 장 중간에 머물렀다(r37 점검). 작업실 밖은 문서 화면으로 */
  const showPlan = (planId: string) => {
    if (studioNav) studioNav.push(`/plan/document?planId=${encodeURIComponent(planId)}#doc-top`);
    else navigate(`/plan/document?planId=${encodeURIComponent(planId)}`);
  };

  async function send(input?: CommandInput, captured?: Pick<PendingRequest, "answer" | "text" | "intro" | "composer">) {
    if (coach && input?.action === "answer" && busyRef.current && draftRef.current.pending?.command.action === "answer" && !replyActive.current && !conflictRef.current && loaded && !loadFailed && queuedAnswers.current.length < 8) {
      const base = previewRef.current ?? planRef.current;
      if (!base) return;
      let next: IntakeSnapshot | null;
      try { next = previewIntakeAnswer(base, { ...input, requestId: "queued", revision: base.coach.revision, planId: base.planId }); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "답변 형식을 확인해 주세요."); return; }
      queuedAnswers.current.push({ input, captured });
      if (next) { previewRef.current = next; setPreview(next); }
      follow.current = true; manualScroll.current = false;
      return;
    }
    if (!loaded || loadFailed || busyRef.current || replyActive.current || conflictRef.current || !ownerScope.current || input && draftRef.current.pending) return;
    const existing = draftRef.current.pending;
    if (!input && !existing) return;
    if (input?.action !== "start" && !existing && !planRef.current) return;
    const pending: PendingRequest = existing ?? { command: { ...input!, requestId: crypto.randomUUID(), revision: planRef.current?.coach.revision ?? 0, ...(planRef.current ? { planId: planRef.current.planId } : {}) }, ...captured };
    let optimistic: IntakeSnapshot | null = null;
    try { if (planRef.current) optimistic = previewIntakeAnswer(planRef.current, pending.command); }
    catch (caught) {
      // 기다리던 답을 보내다 막히면 미리 그려 둔 화면을 지운다 — 서버에 없는 답이 화면에 남지 않게
      queuedAnswers.current = []; previewRef.current = null; setPreview(null);
      setStatus("failed"); setError(caught instanceof Error ? caught.message : "답변 형식을 확인해 주세요."); return;
    }
    const epoch = routeEpoch.current;
    let saved = false;
    // Coach chat: when the next question is already known on this device (rule-based), show it at once — no typing pause.
    const instantNext = coach && pending.command.action === "answer" && !!optimistic?.nextQuestion;
    if (["start", "answer", "details"].includes(pending.command.action) && !instantNext) {
      const initialText = pending.command.action === "start" ? pending.command.message ?? (typeof pending.command.value === "string" ? pending.command.value : { exploring: "아이디어를 찾고 있어요", startup: "생각한 사업이 있어요", operating: "사업을 운영 중이에요" }[pending.command.mode ?? "startup"]) : null;
      beginReply(pending.command.requestId, initialText);
    }
    busyRef.current = true; setBusy(true); setStatus("saving"); setError(""); setLogin(false); setResume("");
    // Keep the edited question visible until acknowledgement; a failed request must retain its composer.
    writeDraft({ ...draftRef.current, pending });
    // 기다리는 답이 더 있으면 그 답까지 얹어 그린다 — 서버 응답 사이에 이미 넘긴 질문이 다시 나타나지 않게
    let display = optimistic;
    for (const item of queuedAnswers.current) {
      if (!display) break;
      try { display = previewIntakeAnswer(display, { ...item.input, requestId: "queued", revision: display.coach.revision, planId: display.planId }) ?? display; } catch { break; }
    }
    previewRef.current = display; setPreview(display);
    follow.current = true; manualScroll.current = false;
    const controller = new AbortController(); controllers.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const identity = await getSnapshot(pending.command.planId, controller.signal);
      if (epoch !== routeEpoch.current) return;
      if (identity.ownerScope !== ownerScope.current) { freezeForOwnerChange(); return; }
      const response = await fetch("/api/plan/chat", { method: "POST", headers: { ...HEADERS, "Content-Type": "application/json", "x-business-intake-owner": ownerScope.current! }, body: JSON.stringify(pending.command), signal: controller.signal });
      let data: IntakePayload | null = null;
      try { data = readIntakePayload(await readChatResponse(response)); } catch { /* A lost response must retain its original idempotency key. */ }
      if (epoch !== routeEpoch.current) return;
      if (data?.code === "owner_changed" || data?.ownerScope && data.ownerScope !== ownerScope.current) { freezeForOwnerChange(); return; }
      if (response.status === 409) {
        conflictRef.current = true; writeDraft({ ...draftRef.current, pending: { ...pending, conflict: true }, ...(pending.command.questionId ? { editingId: customCandidateDraftKey(pending.command.questionId, pending.answer?.custom) } : {}) });
        setStatus("conflict"); setError(data?.message || "다른 곳에서 이 사업의 내용이 바뀌었어요. 최신 내용을 불러온 뒤 답변을 다시 확인해 주세요."); return;
      }
      if (data?.loginRequired) setLoginGate(true);
      // 결제 전 계획서는 작성하지 않는다(무료 체험 없음) — 이 사업의 결제 화면으로 보낸다. 결제가 끝나면 ?start=1 로 돌아와 이어서 작성한다.
      if (response.status === 402 && data?.code === "payment_required" && pending.command.action === "prepare" && planRef.current) {
        writeDraft({ ...draftRef.current, pending: null });
        leavingForPay.current = true;
        navigate(payHref(planRef.current));
        return;
      }
      if (!response.ok || data?.login) {
        setLogin(!!data?.login || response.status === 401);
        if (data?.code === "plan_limit") setPlanLimit(true);
        /*
         * 요청이 잠시 많아 막혔으면(저장 횟수 제한 · 서버 앞단의 요청 제한) 서버는 아무것도 하지 않았다 — 같은 요청을 들고 있다가 [다시 시도]로 보낸다.
         * 하루 한도(ai_limit)처럼 기다려도 안 풀리는 429 는 예전처럼 안내만 한다.
         */
        const busyRetry = response.status === 429 && (!data?.code || data.code === "rate_limited");
        if (busyRetry) { setStatus("failed"); setError(BUSY_TEXT); return; }
        if (response.status >= 400 && response.status < 500 || data?.code && ["ai_unavailable", "ai_limit", "business_required", "disabled"].includes(data.code)) writeDraft({ ...draftRef.current, pending: null });
        // 서버가 금액 확인으로 멈춰 세웠으면(화면이 먼저 묻지 못한 답) 오류 대신 같은 질문을 한 번 더 묻는다
        if (data?.code === "amount_check" && data.message && pending.command.action === "answer" && pending.command.questionId && planRef.current) {
          queuedAnswers.current = []; previewRef.current = null; setPreview(null);
          setAmountCheck({ questionId: pending.command.questionId, value: pending.command.value ?? null, revision: planRef.current.coach.revision, prompt: data.message });
          setStatus(hasLocalInput(draftRef.current) ? "draft" : "saved"); follow.current = true; return;
        }
        // 서버가 업종 확인으로 멈춰 세웠으면(다른 탭 등에서 화면이 먼저 묻지 못한 답) 서버 상태를 다시 깔아 업종 확인 카드를 보여 준다
        if (data?.code === "sector_check" && identity.plan && identity.plan.planId === planRef.current?.planId) {
          queuedAnswers.current = []; previewRef.current = null; setPreview(null);
          installPlan(identity.plan);
          setStatus(hasLocalInput(draftRef.current) ? "draft" : "saved"); follow.current = true; return;
        }
        if (data?.login && data.plan && data.plan.planId === planRef.current?.planId) installPlan(data.plan);
        const aiUnavailable = ["help", "design", "extract", "extract-pending"].includes(pending.command.action) && !!data?.code && ["ai_unavailable", "ai_limit", "business_required"].includes(data.code);
        setStatus(aiUnavailable ? hasLocalInput(draftRef.current) ? "draft" : "saved" : "failed"); setError(data?.message || "요청을 처리하지 못했어요. 입력은 그대로 남아 있어요."); return;
      }
      if (!data?.plan || !data.enabled || pending.command.planId && data.plan.planId !== pending.command.planId) throw new Error("저장 응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.");
      const settled = settleDraft(draftRef.current, pending);
      const previousKey = storageKey.current;
      storageKey.current = draftKey(data.plan.planId, ownerScope.current);
      const stored = writeDraft(settled);
      if (stored && previousKey !== storageKey.current) {
        memoryDrafts.current.delete(previousKey);
        try { sessionStorage.removeItem(previousKey); } catch { /* A stale backup can only replay the same idempotent start request. */ }
      }
      installPlan(data.plan); updateUrl(data.plan.planId); setNewEntry(false);
      if (pending.command.action === "ideas") setIdeaRejectIds([]);
      if (pending.command.action === "answer" && pending.command.questionId === "candidate") writeDraft({ ...draftRef.current, mode: "answer" });
      saved = true;
      setIntentPrompt(null); setAmountCheck(null);
      setStatus(hasLocalInput(settled) ? "draft" : "saved");
      // 작업실 안에서는 팝업 대신 대화 안 진행 카드 + 계획서 칸 보여 주기(revealGeneration), 밖에서는 예전처럼 팝업
      if (pending.command.action === "prepare" && data.started) { setPreparedRevision(data.plan.coach.documentRevision ?? data.plan.coach.revision); setJustFinished(false); if (embedded) revealGeneration(); else setGenerationOpen(true); generation.restart(); try { onPrepared?.(data); } catch { /* The saved document workflow is independent of parent navigation. */ } }
      /* 작업실: 채팅 수정을 적용했으면 계획서 칸이 바뀐 내용을 다시 읽게 한다(보이는 칸도 다시 읽고, 숨어 있으면 점) */
      if (pending.command.action === "edit-apply" && embedded) studioNav?.markActivity?.("plan");
      if (pending.command.action === "details") { writeDraft({ ...draftRef.current, mode: "answer", editingId: null }); setView("input"); }
    } catch (caught) {
      if (epoch === routeEpoch.current) {
        if (sessionExpired(caught)) { setSessionLost(true); setLogin(true); }
        setStatus("failed"); setError(!controller.signal.aborted && friendlyError(caught) || "저장 결과를 확인하지 못했어요. 입력을 보관했으니 같은 요청으로 다시 시도해 주세요.");
      }
    } finally {
      window.clearTimeout(timeout); controllers.current.delete(controller);
      if (epoch === routeEpoch.current) {
        const next = saved ? queuedAnswers.current.shift() : undefined;
        if (!saved) queuedAnswers.current = [];
        if (!next) { previewRef.current = null; setPreview(null); }
        busyRef.current = false; setBusy(false); finishReply(pending.command.requestId, saved);
        if (next) {
          void sendRef.current(next.input, next.captured);
          // 보내기 전에 막혔으면(충돌·로그아웃 등) 기다리던 답과 미리 그린 화면을 버린다 — 입력은 질문 칸에 남아 있다
          if (!busyRef.current) { queuedAnswers.current = []; previewRef.current = null; setPreview(null); }
        }
      }
    }
  }

  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!loaded || !savedPlan || !draft.introMessage || busy || replyTurn || draft.pending || status === "failed" || status === "conflict" || ownerChanged || loadFailed) return;
    void sendRef.current({ action: "note", message: draft.introMessage, noteIntent: isConsultationText(draft.introMessage) ? "question" : "memo" }, { text: draft.introMessage });
  }, [loaded, savedPlan, draft.introMessage, busy, replyTurn, draft.pending, status, ownerChanged, loadFailed]);

  /** 입력창에 커서를 옮긴다. 문장 칩의 '○○'처럼 채울 자리가 있으면 그 글자를 골라 둬서 바로 덮어쓰게 한다. */
  const focusComposer = (select?: string) => window.requestAnimationFrame(() => {
    const input = composerInput.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    const at = select ? input.value.indexOf(select) : -1;
    if (at >= 0) input.setSelectionRange(at, at + select!.length);
    else input.setSelectionRange(input.value.length, input.value.length);
  });
  const focusQuestion = () => { follow.current = true; window.requestAnimationFrame(() => inputPane.current?.querySelector<HTMLElement>("#intake-question-heading")?.focus({ preventScroll: true })); };
  /** 원가 계산기에서 넣은 원가를 아직 답하지 않은 변동비 질문의 입력칸에 미리 넣는다. 이미 답했거나 적어 둔 값이 있으면 그대로 둔다. */
  const carryDraft = (id: string, text: string) => {
    const snapshot = planRef.current;
    if (!snapshot || snapshot.intake.answers[id] || snapshot.coach.fields.some(field => field.key === "unitCost")) return;
    const existing = draftRef.current.answers[id];
    if (existing && (existing.text.trim() || existing.selected.length || existing.unknown)) return;
    writeDraft({ ...draftRef.current, answers: { ...draftRef.current.answers, [id]: { ...emptyAnswer(), text } } });
  };
  const editQuestion = (id: string, refining = false) => {
    if (busyRef.current || replyActive.current) return;
    const snapshot = planRef.current;
    if (!snapshot) return;
    const question = snapshot.questions.find(item => item.id === id) ?? getIntakeQuestion("startup", snapshot.intake.sector, id, snapshot.structure?.values);
    if (!question) { setError("현재 사업에서 수정할 수 없는 질문입니다. 최신 내용을 불러와 주세요."); return; }
    const existing = draftRef.current.answers[id];
    const answer = snapshot.intake.answers[id];
    const fieldValue = snapshot.coach.fields.find(field => field.key === question.fieldKey)?.value;
    const value = answer?.status === "unknown" ? null : answer?.value ?? fieldValue ?? null;
    // Seed rules (spec §6 Phase 2): chips restore only values the current options know; prose numbers become an empty value with the original as a hint.
    const generated = question.id === "candidate" && snapshot.intake.generatedIdeas?.some(idea => idea.id === value);
    const seeded = existing ?? { ...(generated ? { ...emptyAnswer(), selected: [String(value)] } : seedAnswerDraft(question, value, snapshot.candidateIdeas)), unknown: !refining && answer?.status === "unknown" };
    writeDraft({ ...draftRef.current, mode: "answer", editingId: id, refiningId: refining ? id : null, answers: { ...draftRef.current.answers, [id]: seeded } });
    setView("input"); focusQuestion();
  };
  const keepDraftAsMemo = (id: string) => {
    const answer = draftRef.current.answers[id];
    if (!answer) return;
    const content = answer.text || answer.selected.join(", ");
    writeDraft({ ...draftRef.current, editingId: null, mode: "memo", memo: [draftRef.current.memo, `${answer.label || "이전 질문 답변"}\n${content}`].filter(Boolean).join("\n\n") });
    setView("input");
  };
  const question = plan ? draft.editingId ? plan.questions.find(item => item.id === draft.editingId) ?? getIntakeQuestion("startup", plan.intake.sector, draft.editingId, plan.structure?.values) : plan.nextQuestion : null;
  const questionDraft = question ? draft.answers[question.id] ?? emptyAnswer() : emptyAnswer();
  const ideaError = !!ideaPick && !!error && (status === "failed" || status === "conflict") && question?.id === "candidate" && questionDraft.selected[0] === ideaPick ? error : "";
  const blocked = busy || !!replyTurn || !!draft.pending || status === "conflict" || loadFailed || ownerChanged || planLimit;
  // 앞 답을 저장하는 동안에도 다음 질문에는 답할 수 있다(queuedAnswers) — 질문 칸과 보내기만 연다
  const answerQueueOpen = coach && busy && draft.pending?.command.action === "answer" && !replyTurn && status !== "conflict" && !loadFailed && !ownerChanged;
  const answerBlocked = blocked && !answerQueueOpen;
  const aiBusy = ["queued", "running"].includes(plan?.intake.job?.status ?? "");
  const payHref = (target: IntakeSnapshot) => `/plan/pay?${new URLSearchParams({ planId: target.planId, planType: target.planType }).toString()}`;
  const startPrepare = () => {
    /* 계획서가 있는 사업에서 [계획서에 반영하기]를 눌러 실패해도 지난 실패로 숨기지 않는다(점검 r42: 503 이 나도 아무 안내 없이 단추만 돌아왔다) */
    setPreparing(true); setChatSent(true);
    const current = planRef.current;
    if (current && payAccess?.planId === current.planId && payAccess.authenticated && !payAccess.paid) {
      leavingForPay.current = true;
      navigate(payHref(current));
      return;
    }
    void send({ action: "prepare" }).finally(() => { if (!leavingForPay.current) setPreparing(false); });
  };
  const job = plan?.intake.job;
  const lastIntake = !plan && loaded && !newEntry ? readLastIntake() : null;
  // 로그인한 뒤 돌아올 곳 — 작업실 안이면 작업실 대화 탭으로(예전 대화 화면으로 빠지지 않게)
  // 사업을 불러오기 전에 로그인이 풀렸으면(불러오기 401) 주소의 사업으로 돌아온다 — 새 대화로 빠지지 않게
  const unloadedPlanId = !plan && !newEntry ? new URLSearchParams(routeQuery).get("planId") : null;
  const loginHref = unloadedPlanId ? `/account?next=${encodeURIComponent(embedded ? studioHref(unloadedPlanId, "chat") : `/plan/chat?planId=${encodeURIComponent(unloadedPlanId)}`)}`
    : `/account?next=${encodeURIComponent(embedded ? plan ? studioHref(plan.planId, "chat") : `${STUDIO_PATH}?new=1` : `/plan/chat${plan ? `?planId=${encodeURIComponent(plan.planId)}` : "?new=1"}`)}`;
  const saveLabel = !plan && newEntry && status === "saved" ? "시작 전" : { saved: "저장됨", draft: "입력 중 · 이 기기에 보관", saving: "저장 중", failed: "저장하지 못했어요", conflict: sessionLost ? "로그인이 풀렸어요" : "다른 곳에서 바뀌었어요" }[status];
  const choiceQuestion = !!question && !questionDraft.custom && ["single", "multi"].includes(question.kind);
  const directAnswer = !!plan && draft.mode === "answer" && !!question && !choiceQuestion && !questionDraft.unknown;
  const choiceSubmission = draft.mode === "answer" ? choiceDraftSubmission(question ?? null, questionDraft) : null;
  const choiceText = choiceSubmission && question && plan ? choiceSubmission.unknown ? "아직 정하지 않았어요" : question.id === "candidate" ? plan.intake.generatedIdeas?.find(idea => idea.id === choiceSubmission.value)?.title ?? summaryAnswerText(question, choiceSubmission.value, plan.candidateIdeas) : summaryAnswerText(question, choiceSubmission.value, plan.candidateIdeas) : "";
  const questionComposer = !!plan && draft.mode === "answer" && !!question;
  const composerText = questionComposer ? questionDraft.text || (choiceQuestion ? draft.memo : "") : draft.mode === "help" ? draft.help : draft.memo;
  // 폭 없는 공백만 있으면 빈 입력으로 본다
  const composerVisible = visibleComposerText(composerText);
  const unfinishedText = directAnswer && incompleteChoiceText(question, questionDraft);
  // 보내기가 흐린 이유와 글자 수 한도를 입력창 바로 위 한 줄로 알려 준다
  const composerNote = inputHint ? inputHint
    : unfinishedText && /○○|〇〇|◯◯/.test(composerText) ? "○○ 자리를 채워 주세요"
    : unfinishedText && /N원|N건/.test(composerText) ? "N 자리를 숫자로 바꿔 주세요"
    : pasteCut && composerText.length >= 1200 ? "1,200자까지만 넣었어요. 나머지는 나눠서 보내 주세요."
    : composerLimitNote(composerText.length, 1200);
  const composerRoute = plan && !choiceSubmission && composerVisible ? routeComposerInput(plan, question ?? null, composerText) : null;
  const askingAI = draft.mode !== "ideas" && !choiceSubmission && (draft.mode === "help" || composerRoute?.kind === "note" && composerRoute.intent === "question");
  const sendLabel = askingAI ? "AI에게 질문" : "보내기";
  const captureComposer = (): PendingRequest["composer"] => ({ text: composerText, mode: draft.mode, ...(questionComposer && question ? { questionId: question.id } : {}) });
  const liveIntent = intentPrompt && intentPrompt.text === composerText && intentPrompt.questionId === (question?.id ?? null) && intentPrompt.revision === plan?.coach.revision ? intentPrompt : null;
  // 확인이 떠도 원래 질문이 무엇이었는지 보이게 질문 문장을 함께 둔다
  // 글 속 숫자 하나를 읽었으면('3500원 정도요') 그 값으로 답하기를 맨 앞에 — 예전엔 'AI에게 질문 · 메모로 남기기'뿐이라 답할 길이 없었다
  const intentSuggested = liveIntent?.suggested && question ? liveIntent.suggested : null;
  const intentConfirmation = liveIntent && <section className={styles.intentPrompt} aria-label="입력 내용 확인"><ChatSpeaker />{question && <p className={styles.intentQuestion}>{questionPromptText(question.prompt)}</p>}<p>{intentSuggested ? `${withRo(intentSuggested.label)} 답할까요?` : "이 내용은 어떻게 남길까요?"}</p><div className={styles.intentActions}>
    {intentSuggested && question && <button type="button" className={styles.primaryButton} disabled={blocked} onClick={() => { follow.current = true; setIntentPrompt(null); void send({ action: "answer", questionId: question.id, value: intentSuggested.value }, { answer: questionDraft, composer: captureComposer() }); }}>{withRo(intentSuggested.label)} 답하기</button>}
    {liveIntent.canAnswer && question && <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={() => void send({ action: "answer", questionId: question.id === "candidate" && questionDraft.custom ? "business" : question.id, value: liveIntent.text }, { answer: questionDraft, composer: captureComposer() })}>{question.label} 답변으로 저장</button>}
    <button type="button" className={styles.secondaryButton} disabled={blocked || aiBusy} onClick={() => void send({ action: "help", message: liveIntent.text }, { composer: captureComposer() })}><MessageCircle size={16} aria-hidden="true" />AI에게 질문</button>
    <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={() => storeComposerNote("memo")}>메모로 남기기</button>
    {/* 이 확인이 뜨면 원래 질문(선택지)이 가려져 돌아갈 길이 없었다 — 질문으로 돌아가 고르게 한다 */}
    {question && <button type="button" className={styles.textLink} onClick={() => setIntentPrompt(null)}><ChevronLeft size={15} aria-hidden="true" />질문으로 돌아가기</button>}
  </div></section>;
  /*
   * 고른 업종과 사업 설명이 어긋나면(서버 규칙, AI 0회) 다음 질문 전에 한 번만 묻는다.
   * 2026-10-22: 캔들 스마트스토어를 '기업 서비스'로 골라 '프로젝트 1건 가격'을 묻고 표지에도 '기업 서비스'가 찍혔다.
   * 2026-10-28: 코치 채팅이 아닌 화면에서도 묻는다. 서버도 확인 전에는 다음 질문의 답을 받지 않는다(sector_check).
   */
  const sectorSuggestion = plan?.sectorSuggestion && !plan.hasDocuments && !draft.editingId && !liveIntent && question && question.id !== "industry" && question.id !== "business" ? plan.sectorSuggestion : null;
  const sectorConfirmation = sectorSuggestion && <section className={styles.intentPrompt} aria-label="업종 확인"><ChatSpeaker /><p>말씀하신 사업은 &apos;{sectorSuggestion.label}&apos;에 더 가까워 보여요. {sectorCheckPrompt(sectorSuggestion)}</p><p className={styles.intentQuestion}>지금 고른 업종: {sectorSuggestion.current}</p><div className={styles.intentActions}>
    <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={() => { follow.current = true; void send({ action: "answer", questionId: "industry", value: sectorSuggestion.sector }); }}>바꾸기</button>
    <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={() => { follow.current = true; void send({ action: "sector-keep" }); }}>그대로 둘게요</button>
  </div></section>;
  /*
   * 금액 확인 — 업종 확인과 같은 모양의 한 번 묻기. 판매 가격 0원(무료로 주는 상품이면 그대로), 그리고 현실 범위 밖 금액
   * (준비 예산·생활비·월 비용 10만 원 미만, 가격·건당 비용 100원 미만 — 실제 AI 점검 2026-10-27에 3,000원이 확인 없이 계획서까지 갔다).
   * [맞아요]면 confirmed로 그대로 저장하고, [다시 적을게요]면 입력창을 비워 같은 질문에 다시 답한다.
   */
  const liveAmountCheck = amountCheck && question && amountCheck.questionId === question.id && (amountCheck.text === undefined || amountCheck.text === composerText) && amountCheck.revision === plan?.coach.revision ? amountCheck : null;
  const amountConfirmation = liveAmountCheck && question && <section className={styles.intentPrompt} aria-label="금액 확인"><ChatSpeaker /><p className={styles.intentQuestion}>{questionPromptText(question.prompt)}</p><p>{liveAmountCheck.prompt}</p><div className={styles.intentActions}>
    <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={() => { follow.current = true; setAmountCheck(null); void send({ action: "answer", questionId: liveAmountCheck.questionId, value: liveAmountCheck.value, confirmed: true }, { answer: questionDraft, composer: captureComposer() }); }}>맞아요</button>
    <button type="button" className={styles.secondaryButton} disabled={blocked} onClick={() => { setAmountCheck(null); editDraft({ ...draftRef.current, mode: "answer", answers: { ...draftRef.current.answers, [question.id]: { ...questionDraft, text: "" } } }); focusComposer(); }}>다시 적을게요</button>
  </div></section>;
  const lastMessage = plan?.coach.messages.filter(message => message.role === "user").at(-1);
  const questionNote = lastMessage && plan?.intake.notes.find(note => note.intent === "question" && note.id === `${lastMessage.id}:0`);
  const questionHandled = !!questionNote && job?.kind === "help" && job.request === lastMessage?.text;
  const memoPending = plan?.intake.notes.some(note => note.status === "failed" || note.status === "queued" || note.status === "stored" && note.intent === "memo");
  const startFromCard = (mode: "exploring" | "startup" | "operating") => {
    const text = entryMessage(draftRef.current);
    if (text && mode !== "exploring") void answerSuggestions.request(text, mode);
    void send(confirmedEntryCommand(mode, text), { text: draftRef.current.memo, intro: draftRef.current.introMessage });
  };
  const storeComposerNote = (intent: "memo" | "question") => {
    if (!composerVisible) return;
    follow.current = true;
    void send({ action: "note", message: composerVisible, noteIntent: intent }, { composer: captureComposer() });
  };
  const answerQuestion = (value: IntakeValue, unknown = false, questionId = question?.id, extra?: { ksic?: string }) => {
    if (!questionId || !question) return;
    follow.current = true;
    const check = !unknown && questionId === question.id ? answerCheckPrompt(question, value) : null;
    if (check && plan) { setAmountCheck({ text: composerText, questionId, value, revision: plan.coach.revision, prompt: check }); return; }
    // 카드('생각한 사업이 있어요')로 시작해 사업 설명에 답할 때도 맞춤 추천을 받는다 — 예전엔 첫 입력으로 설명을 보낼 때만 받아 이 흐름에서는 추천이 한 번도 안 나왔다(실제 AI 점검 2026-10-22)
    if (!unknown && questionId === "business" && typeof value === "string" && value.trim() && plan && (plan.intake.mode === "startup" || plan.intake.mode === "operating")) void answerSuggestions.request(value.trim(), plan.intake.mode, plan.planId);
    void send({ action: "answer", questionId, value, ...(unknown ? { unknown: true } : {}), ...(extra?.ksic ? { ksic: extra.ksic } : {}) }, { answer: draftRef.current.answers[question.id] ?? emptyAnswer() });
  };
  const submitComposer = () => {
    if (answerBlocked || !loaded || unfinishedText) return;
    if (!plan) {
      const text = entryMessage(draftRef.current);
      if (text.length > 1200) { setError("처음 사업 설명은 1,200자 이내로 나눠 보내 주세요. 입력한 내용은 그대로 보관했어요."); return; }
      const entry = entrySubmission(text);
      // 규격 질문은 규칙으로 바로 진행하고, AI 참고 의견은 옆에서 따로 흘러나온다(서버에서 꺼져 있으면 아무 일도 없다).
      if (text) void liveComment.request(text);
      if (text && entry.kind === "confirm") {
        editDraft({ ...draftRef.current, memo: "", introMessage: text });
        follow.current = true;
      } else if (text && entry.kind === "send") {
        // 구체적인 사업 설명이면 뒤에 나올 고객·문제·상품·경로 질문의 맞춤 추천도 미리 받아 둔다.
        if (entry.command.questionId === "business" && (entry.command.mode === "startup" || entry.command.mode === "operating")) void answerSuggestions.request(text, entry.command.mode);
        void send(entry.command, { text: draftRef.current.memo, intro: draftRef.current.introMessage });
      }
      return;
    }
    if (draft.mode === "ideas" && plan.intake.mode === "exploring") {
      if (!aiBusy && composerVisible) void send({ action: "ideas", message: composerVisible, rejectIds: ideaRejectIds }, { composer: captureComposer() });
      return;
    }
    if (choiceSubmission && question) {
      void send({ action: "answer", questionId: question.id, value: choiceSubmission.value, ...(choiceSubmission.unknown ? { unknown: true } : {}), ...(choiceSubmission.ksic ? { ksic: choiceSubmission.ksic } : {}), ...(composerVisible ? { message: composerVisible } : {}) }, { answer: questionDraft, text: composerText });
      return;
    }
    if (!composerVisible) return;
    // Plan edit chat: every message is an edit request; the server filters it before any AI call.
    // 묻는 말('?'로 끝나거나 '어떻게…')이면 바꾸기 대신 AI 답으로 — 계획서가 있어도 궁금한 걸 물을 수 있다
    if (editTurn) { if (isConsultationText(composerVisible)) { if (!aiBusy) void send({ action: "help", message: composerVisible }, { composer: captureComposer() }); } else void send({ action: "edit", message: composerVisible }, { composer: captureComposer() }); return; }
    // In coach chat the composer is the industry search box on the industry turn; results appear as chips to tap.
    // 보내기를 눌러도 아무 일이 없던 문제(2026-10-22) — 찾은 업종을 누르라고 한 줄로 알려 준다
    if (coach && question?.id === "industry" && !askingAI) { setInputHint("찾은 업종 중 가까운 걸 눌러 주세요. 없으면 다른 이름으로 찾거나 아래 보기에서 골라도 돼요."); return; }
    if (askingAI) { if (!aiBusy) void send({ action: "help", message: composerVisible }, { composer: captureComposer() }); return; }
    const target = question?.id === "candidate" && questionDraft.custom ? getIntakeQuestion("startup", plan.intake.sector, "business", plan.structure?.values) ?? null : question;
    const route = routeComposerInput(plan, target ?? null, composerText);
    if (route.kind === "invalid") { setInputHint(route.hint); return; }
    if (route.kind === "clarify") { setIntentPrompt({ text: composerText, questionId: question?.id ?? null, revision: plan.coach.revision, canAnswer: route.canAnswer, ...(route.suggested ? { suggested: route.suggested } : {}) }); follow.current = true; return; }
    if (route.kind === "note") { storeComposerNote(route.intent); return; }
    const check = !route.unknown && route.questionId === question?.id ? answerCheckPrompt(question, route.value) : null;
    if (check) { setAmountCheck({ text: composerText, questionId: route.questionId, value: route.value, revision: plan.coach.revision, prompt: check }); follow.current = true; return; }
    if (!route.unknown && route.questionId === "business" && typeof route.value === "string" && route.value.trim() && (plan.intake.mode === "startup" || plan.intake.mode === "operating")) void answerSuggestions.request(route.value.trim(), plan.intake.mode, plan.planId);
    void send({ action: "answer", questionId: route.questionId, value: route.value, ...(route.unknown ? { unknown: true } : {}) }, { answer: questionDraft, composer: captureComposer() });
  };
  // 입력창 위 안내('찾은 업종 중 가까운 걸 눌러 주세요' 등)는 그 질문에만 맞는 말 — 다음 질문으로 넘어가면 지운다
  // 예전엔 업종을 고른 뒤 3/14…8/14 질문에도 업종 검색 안내가 남았다(r37 휴대폰 점검)
  const hintQuestionId = question?.id ?? null;
  useEffect(() => { setInputHint(""); }, [hintQuestionId]);
  // A chip that finishes its answer presses "send" for the user, after the draft it wrote has rendered.
  useEffect(() => {
    const id = autoSubmit.current;
    if (!id) return;
    autoSubmit.current = null;
    if (question?.id === id) submitComposer();
  });
  /*
   * 랜딩에서 적은 아이디어 — 새 대화가 준비되면(불러오기 끝·막힘 없음) 입력창에 넣고, 직접 입력하고 보내기를 누른 것과
   * 같은 길(submitComposer)로 한 번만 보낸다. 막연한 글이면 시작 방식 확인, 구체적이면 맞춤 추천·AI 참고 의견까지 그대로 이어진다.
   * 로그인이 먼저 필요하면 보내지 않고 주소의 idea와 보관본을 남겨 둔다(로그인하면 화면을 새로 열어 이어 받는다).
   * 넘겨받는 순간 주소의 idea와 보관본을 지운다 — 새로고침·뒤로 가기·StrictMode 두 번 실행으로 다시 보내지 않게.
   */
  useEffect(() => {
    const state = landingIdea.current;
    if (!loaded || loadFailed || !newEntry || plan || !ownerScope.current) return;
    if (loginGate) {
      if (state.phase === "gated") return;
      const storage = sessionStore();
      // 보낸 뒤에 로그인이 필요하다고 돌아왔으면(세션 만료) 입력창에 남은 그 글을 다시 맡겨 둔다
      const text = state.phase === "idle" ? readLandingIdea(window.location.search, storage, Date.now())?.text : state.text && entryMessage(draftRef.current) === state.text ? state.text : "";
      if (text) stashLandingIdea(storage, text, Date.now());
      state.phase = "gated";
      return;
    }
    if (state.phase === "done") return;
    if (state.phase === "armed") {
      if (answerBlocked) return;
      state.phase = "done";
      if (entryMessage(draftRef.current) === state.text) submitComposer();
      return;
    }
    const storage = sessionStore();
    const idea = readLandingIdea(window.location.search, storage, Date.now());
    // 아이디어가 없으면(5분 지난 보관본 포함) 남은 보관본도 지운다
    if (!idea) { clearLandingIdea(storage); state.phase = "done"; return; }
    if (answerBlocked) return;
    clearLandingIdea(storage);
    const url = new URL(window.location.href);
    if (url.searchParams.has(LANDING_IDEA_PARAM)) {
      url.searchParams.delete(LANDING_IDEA_PARAM);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    state.text = idea.text; state.phase = "armed";
    setPasteCut(false); setInputHint("");
    editDraft({ ...draftRef.current, memo: idea.text, introMessage: "" });
  });
  /*
   * 첫 화면 '어떤 사업이든' 카드가 고른 시작 방식(?entry=exploring|startup|operating) — 새 대화가 준비되면 첫 선택지를 한 번 대신 누른다.
   * 랜딩 아이디어가 함께 왔으면 그 흐름(시작 방식 확인)을 그대로 두고 이 값은 버린다. 읽는 순간 주소에서 지운다(새로고침에 다시 누르지 않게).
   */
  const entryPicked = useRef(false);
  useEffect(() => {
    if (entryPicked.current || !loaded || loadFailed || !newEntry || plan || loginGate || blocked || !ownerScope.current) return;
    entryPicked.current = true;
    const url = new URL(window.location.href);
    const mode = url.searchParams.get(ENTRY_PARAM);
    if (mode === null) return;
    url.searchParams.delete(ENTRY_PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    if (!isEntryMode(mode) || landingIdea.current.phase === "armed" || readLandingIdea(window.location.search, sessionStore(), Date.now())) return;
    startFromCard(mode);
  });
  const settleUntil = useRef(0);
  /* 로그인 폼이 펼쳐져 있을 땐 채팅처럼 맨 아래로 내려가지 않는다 — 제목부터 보여야 한다 */
  const loginGateShown = useRef(false);
  useEffect(() => { loginGateShown.current = loginGate; if (loginGate) conversation.current?.scrollTo({ top: 0 }); }, [loginGate]);
  const scrollToCurrent = useCallback(() => {
    const container = conversation.current;
    if (!container) return;
    if (loginGateShown.current) { container.scrollTo({ top: 0 }); return; }
    const turn = currentTurn.current;
    const containerTop = container.getBoundingClientRect().top;
    const bottom = container.scrollHeight - container.clientHeight;
    // 채팅처럼 새 내용이 오면 맨 아래까지 따라 내려간다. 다만 선택지가 길어 맨 아래로 가면
    // 지금 질문의 제목이 화면 위로 사라질 때는, 제목이 화면 맨 위에 오는 곳에서 멈춘다.
    const turnTop = turn ? container.scrollTop + turn.getBoundingClientRect().top - containerTop - 16 : bottom;
    let top = draftRef.current.editingId ? turnTop : Math.min(bottom, Math.max(0, turnTop));
    /*
     * 작업실의 작성 진행 카드는 사업안 카드 아래에 붙어, 지금 차례 맨 위에서 멈추면 1280 화면에서 카드 아래 절반이 잘렸다(점검 2026-10-23).
     * 카드가 있으면 카드 아래까지 보이게 더 내린다 — 카드가 칸보다 길면 카드 제목이 맨 위에 오는 데까지만.
     */
    const card = runCard.current;
    if (card && !draftRef.current.editingId) {
      const cardTop = container.scrollTop + card.getBoundingClientRect().top - containerTop;
      const cardBottom = cardTop + card.offsetHeight;
      top = Math.min(bottom, Math.max(top, Math.min(cardTop - 16, cardBottom + 16 - container.clientHeight)));
    }
    /*
     * 사업 방향 정리가 끝난 차례 — '사업계획서 만들기' 단추(와 그 아래 한 줄)가 다 보이게 더 내린다.
     * 휴대폰(360~430)에서는 사업안 카드 머리에서 멈춰 단추가 입력창 뒤(화면 아래)에 숨었다(r37 휴대폰 점검).
     */
    const action = turn?.querySelector<HTMLElement>('[data-step="prepare"]');
    if (action && !draftRef.current.editingId) {
      const actionBottom = container.scrollTop + action.getBoundingClientRect().bottom - containerTop;
      top = Math.min(bottom, Math.max(top, actionBottom + 16 - container.clientHeight));
    }
    /* 작업실 3단계: 대화 끝의 고치기 카드 · 기다리는 요청 — 가장 마지막 것이 다 보이게(길면 그 머리가 맨 위에 오는 데까지) */
    const items = studioTail.current?.querySelectorAll<HTMLElement>("[data-studio-item]");
    const tail = items?.length ? items[items.length - 1] : null;
    if (tail && !draftRef.current.editingId) {
      const tailTop = container.scrollTop + tail.getBoundingClientRect().top - containerTop;
      const tailBottom = tailTop + tail.offsetHeight;
      top = Math.min(bottom, Math.max(top, Math.min(tailTop - 16, tailBottom + 16 - container.clientHeight)));
    }
    manualScroll.current = false;
    // 처음 불러온 직후(분할 너비가 자리 잡는 동안 포함)에는 긴 대화를 천천히 훑지 않고 바로 최신 위치로 간다. 그 뒤의 이동만 부드럽게 한다.
    if (!settleUntil.current) settleUntil.current = performance.now() + 1200;
    const settling = performance.now() < settleUntil.current;
    container.scrollTo({ top: Math.max(0, top), behavior: settling || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    setUnseen(false);
  }, []);
  useEffect(() => {
    if (follow.current) { const frame = requestAnimationFrame(scrollToCurrent); return () => cancelAnimationFrame(frame); }
    setUnseen(true);
  }, [plan?.planId, plan?.coach.messages.length, question?.id, draft.editingId, draft.introMessage, replyTurn, view, intentPrompt, scrollToCurrent]);
  useEffect(() => {
    const container = conversation.current;
    if (!container) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      if (follow.current) frame = requestAnimationFrame(scrollToCurrent);
    });
    observer.observe(container);
    // 대화 내용이 늘어날 때(다음 질문 등장, AI 의견 스트리밍)도 맨 아래까지 따라간다.
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [scrollToCurrent]);
  useEffect(() => {
    const input = composerInput.current;
    if (input) { input.style.height = "auto"; input.style.height = `${Math.min(128, input.scrollHeight)}px`; }
  }, [composerText, studioText, view]);

  // 마지막 정리 화면이 보일 때는 진행 게이지를 방금 누른 '다음 단계' 자리에 보여 준다(그 밖에는 대화 흐름의 작업 상태 자리).
  const reviewCandidates = plan?.intake.candidates.filter(candidate => candidate.status === "pending") ?? [];
  const reviewKey = `${plan?.planId}:${reviewCandidates.map(candidate => candidate.id).join(",")}`;
  const showReview = reviewCandidates.length > 0 && deferredReview !== reviewKey && !draft.editingId && !replyTurn && !intentConfirmation && !amountConfirmation && !sectorConfirmation && !draft.pending && !hasLocalInput(draft);
  const showCompletion = !!plan && !showReview && !replyTurn && !intentConfirmation && !question && !draft.editingId;
  /* 사업계획서 만드는 중 — 접수되면 팝업으로 진행을 보여 주고, 닫아도 '작성 중 n/m · 진행 보기'로 다시 연다 */
  const [generationOpen, setGenerationOpen] = useState(false);
  const generation = useGenerationProgress(plan?.planId, !!plan && (prepared || plan.hasDocuments));
  const generating = !!generation.state?.active && !["errored", "terminated"].includes(generation.state.runStatus ?? "");
  // 맡은 장이 남았는데 작업이 멈췄다(오류 · 건너뜀) — 작업실 진행 카드가 '남은 장 이어서 쓰기'를 보인다
  const runStalled = generationStalled(generation.state);
  // 작성 중에는 아직 안 쓴 항목이 있어도 '이어서 작성' 대신 진행 중으로 본다
  const started = prepared || generating;
  const nextStep = plan ? intakeNextStep(plan, started) : null;
  const prepareVisible = nextStep === "prepare" && !!plan && !plan.hasDocuments;
  /*
   * '사업계획서 만들기' 아래에 가격을 미리 보여 준다 — 눌러야 결제 화면에서야 값을 알았다(여정 점검 2026-10-22).
   * 앱에서는 스토어가 값을 정하므로 웹 가격을 적지 않는다. 이미 결제한 사업이면 바로 작성한다고만 알린다.
   */
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(nativePlatform() !== null); }, []);
  const paidPlan = !!plan && payAccess?.planId === plan.planId && payAccess.paid;
  const payNote = paidPlan ? "몇 분 걸려요" : inApp ? undefined : `${PACKAGE_AMOUNT.toLocaleString("ko-KR")}원 결제 후 작성 · 홈페이지까지 ${BUNDLE_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원`;
  useEffect(() => {
    if (!prepareVisible || !plan) return;
    let alive = true;
    router.prefetch(payHref(plan));
    fetch(`/api/plan/access?${new URLSearchParams({ planType: plan.planType, planId: plan.planId }).toString()}`, { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then((data: { paid?: unknown; authenticated?: unknown; unavailable?: unknown } | null) => {
        // 확인하지 못했으면(unavailable·오류) 예전처럼 서버에 물어 본다
        if (alive && data && data.unavailable !== true && typeof data.paid === "boolean") setPayAccess({ planId: plan.planId, paid: data.paid, authenticated: data.authenticated === true });
      })
      .catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 사업이 바뀌거나 단계가 보일 때만
  }, [prepareVisible, plan?.planId]);
  /* 결제 직후(?start=1)에는 손님이 다시 누르지 않아도 사업계획서 작성을 한 번 시작한다 — 결제 결과 화면이 여기로 보낸다 */
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !plan || !loaded || blocked || aiBusy) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("start") !== "1") return;
    autoStarted.current = true;
    url.searchParams.delete("start");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    if (nextStep === "prepare" && url.searchParams.get("planId") === plan.planId) void send({ action: "prepare" });
  });
  const updateNotice = savedPlan ? resultUpdateNotice(savedPlan) : null;
  const refinement = plan ? nextRefinementQuestion(plan, draft.refinementSeen) : null;
  /* '좀 더 개선하기'는 뺐다 — 만든 뒤에 고치는 게 맞고(사용자 피드백), 답을 바꾸려면 '지금까지 답변 보기'의 연필로 고친다 */
  /*
   * 기본 질문이 끝나면 사업 방향 정리를 바로 시작한다 — 예전엔 '사업 방향 정리하기'와 '계획서 만들기'를 차례로 눌러야 해서
   * 시작 단추가 두 번 나와 헷갈렸다(사용자 피드백). 정리는 짧고 싸니 자동으로, 손님이 누를 단추는 '계획서 만들기' 하나만 남긴다.
   * 같은 답변 기준으로는 한 번만 보내고, 실패하면 화면의 '사업 방향 정리하기'로 다시 시도한다.
   */
  const autoDesigned = useRef<string | null>(null);
  const designFailed = plan?.intake.job?.kind === "design" && plan.intake.job.status === "failed";
  // While the direction summary is being written, the coach "replies" (typing bubble + current step) instead of a heading and gauge.
  const designRunning = nextStep === "design" && aiBusy && plan?.intake.job?.kind === "design";
  // 코치 채팅: 마지막 답을 보낸 순간(정리 작업이 서버에 접수되기 전)부터 진행 화면을 보인다 — 자동 정리가 곧 시작되는 경우만
  const designStarting = coach && nextStep === "design" && !designFailed && !aiBusy && !loginGate && status !== "failed" && status !== "conflict";
  /*
   * 작업실: 정리 진행 카드(DesignProgress)가 보이기 시작하고 사라지는 순간 머리줄에 바로 알린다 — 머리줄은 질문 수를 15초마다 묻기만 해서
   * 카드는 '정리하고 있어요'인데 부제는 '대화 중 · 마무리', 칩은 '대화 ✓ · 계획서(지금)'로 최대 15초 어긋났다. 같은 값은 작업실이 거른다.
   */
  const designActive = embedded && !!plan && (designRunning || designStarting);
  useEffect(() => { studioNav?.setDesignRunning?.(designActive); }, [studioNav, designActive]);
  const studioNavRef = useRef(studioNav);
  useEffect(() => { studioNavRef.current = studioNav; }, [studioNav]);
  useEffect(() => () => studioNavRef.current?.setDesignRunning?.(false), []);
  // Coach chat on PC: chat only while answering; the summary slides open on request or once there is a result to read.
  const resultReady = nextStep === "prepare" || nextStep === "open";
  // Once the plan document exists (and is not being written), the chat is a record. ?edit=chat reopens it for edit requests only.
  // 작업실에서 계획서 한 장 고치기를 예전 채팅 수정으로 보냈으면(chatEditLocal) 같은 화면을 연다
  /*
   * 서버에 아직 끝나지 않은 채팅 수정(정리 중이거나 '이렇게 바꿀게요'를 고르기 전)이 있으면 새로고침한 뒤에도 같은 화면을 연다 —
   * chatEditLocal 은 새로고침하면 사라져, 대화에는 '아래에서 확인해 주세요'만 남고 바꾸기·취소 카드가 없었다(실제 AI 점검 2026-10-23).
   */
  const editJob = plan?.intake.job?.kind === "edit" ? plan.intake.job : null;
  const editJobOpen = !!editJob && (["queued", "running"].includes(editJob.status) || editJob.status === "complete" && !!editJob.proposal?.length && !editJob.proposalStatus);
  const chatEditMode = coach && (searchParams.get("edit") === "chat" || chatEditLocal || editJobOpen);
  const locked = coach && !!plan?.hasDocuments && !generating && !chatEditMode && !draft.editingId;
  // Once the plan exists, facts change only through the document's edit choices, not the summary pencils.
  const documentFixed = coach && !!plan?.hasDocuments;
  /*
   * 계획서가 이미 있으면(대화는 기록) 예전 요청의 '저장하지 못했어요'·'저장됐는지 확인하지 못했어요'를 띄우지 않는다 —
   * 입력창도 없는 화면에 지난 실패가 남아 무엇이 잘못됐는지 헷갈렸다(여정 점검 2026-10-22). 계정·충돌·불러오기 문제는 그대로 알린다.
   */
  const staleFailure = locked && !chatSent && !ownerChanged && !sessionLost && !loadFailed && status !== "conflict";
  const editTurn = chatEditMode && COACH_EDIT_CHAT && !!plan?.hasDocuments && !generating && !draft.editingId;
  // One input per turn: chip turns invite free text quietly, typing turns show an example, the industry turn searches.
  const coachPlaceholder = !plan ? "어떤 사업인지 들려주세요" : replyTurn ? "메시지 보내기" : editTurn ? "바꿀 사업 내용이나 궁금한 점을 적어 주세요" : draft.mode === "ideas" && plan.intake.mode === "exploring" ? "원하는 사업을 적어 주세요" : question?.id === "candidate" && questionDraft.custom ? "어떤 사업인지 한 문장으로 적어 주세요" : question?.id === "industry" ? "업종 이름으로 찾기 (예: 네일, 반찬, 학원)" : question?.id === "business" ? "한 문장으로 적어 주세요 (예: 맞벌이 가정에 반찬 정기배송)" : question && (question.options?.length || ["single", "multi"].includes(question.kind) || question.kind === "number") ? "직접 적거나 궁금한 걸 물어보세요" : "메시지 보내기";
  /*
   * 코치 채팅: 고른 칩은 입력창에 글로 채워진다 — 칩을 누르는 것도 채팅을 치는 것처럼 보이게(소유자 피드백 2026-10-09).
   * 정해진 개수를 다 고르면 바로 보내고, 덜 골랐으면 입력창의 보내기로 보낸다(칩 옆 '이대로 보내기'는 없앴다).
   * 입력창에서 칩 글을 지우면 그 칩 선택도 풀린다.
   */
  const coachHybrid = coach && questionComposer && !!question && isHybridQuestion(question) && questionDraft.selected.length > 0;
  const composerShown = composerText;
  // 작업실 칸 안에서는 PC 두 칸 배치를 쓰지 않는다 — 칸이 좁아 늘 휴대폰처럼 대화와 요약(시트)을 번갈아 보인다
  const coachLayout = coach && plan && !embedded ? deskSummary || resultReady ? "split" : "chat" : undefined;
  // 작업실 안에서는 작업실 루트가 페이지의 하나뿐인 main 이다 — 대화 칸은 section 으로 그린다
  const InputPane = embedded ? "section" : "main";
  // The header reads like a chat partner: who you're talking to and what they're doing right now (all real states).
  const coachStatus = !plan ? undefined
    : aiBusy && job ? ({ extract: "메모 정리 중", design: "사업 방향 정리 중", help: "답변 쓰는 중", ideas: "새 사업 찾는 중", edit: "바꿀 내용 정리 중" } as const)[job.kind]
    : busy && !answerQueueOpen || replyTurn ? "생각 중…"
    : plan.coreComplete ? question ? "선택 보완" : "마무리"
    : `답을 기다리는 중 · ${plan.coreAnswered}/${plan.coreTotal}`;
  // Receipt under the newest answer: in flight → saved → the next turn is on screen.
  // 답 저장은 뒤에서 하므로(answerQueueOpen) '보내는 중'으로 붙잡지 않는다 — 실패하면 오류 안내가 따로 뜬다
  // 메신저식 '읽음'은 달지 않는다 — AI 대화라 뜻이 없고 답 말풍선 아래 회색 글만 늘었다(여정 점검 2026-10-23)
  const receipt = busy && !answerQueueOpen ? "보내는 중" : replyTurn ? "전달됨" : undefined;
  /*
   * 화면 낭독기 알림 — 늘 붙어 있는 알림 칸 하나에 새 질문과 다 받은 AI 답만 넣는다(받는 중인 글은 넣지 않는다).
   * 예전엔 '저장됨'만 읽히고 다음 질문은 읽히지 않았다(접근성 점검 2026-10-22). 처음 불러온 대화는 다시 읽지 않는다.
   * 답한 칩·질문 칸이 사라져 포커스를 잃었으면 새 질문 제목으로 옮긴다 — 그때 제목은 포커스로 읽히니 알림에는 넣지 않는다.
   */
  const [announcement, setAnnouncement] = useState("");
  const spoken = useRef<{ planId: string | null; question: string | null; message: string | null } | null>(null);
  const lastAssistant = plan?.coach.messages.filter(message => message.role === "assistant").at(-1);
  useEffect(() => {
    if (!loaded) return;
    /*
     * 작업실 휴대폰 탭에서 대화 칸이 숨어 있으면 알림 칸은 읽히지 않는다 — 읽어 주는 대신 대화 탭에 새 소식 점을 찍고,
     * 숨은 칸으로 초점을 옮기지도 않는다. 대화 칸이 보일 때만 예전처럼 읽어 준다.
     */
    const visible = paneVisible.current;
    if (replyTurn && !visible) { setAnnouncement(""); return; }
    if (replyTurn) { setAnnouncement("다음 질문을 준비하고 있어요"); return; }
    const current = { planId: plan?.planId ?? null, question: question?.id ?? null, message: lastAssistant?.id ?? null };
    const before = spoken.current;
    spoken.current = current;
    if (!before || before.planId && before.planId !== current.planId) return;
    const arrived = !!lastAssistant && current.message !== before.message || !!question && current.question !== before.question;
    if (!visible) { if (arrived) studioNav?.markActivity?.("chat"); setAnnouncement(""); return; }
    const parts: string[] = [];
    if (lastAssistant && current.message !== before.message) parts.push(isDesignReplyText(lastAssistant.text) ? "사업 방향을 정리했어요. 아래 카드에서 확인해 주세요." : lastAssistant.text.length > 400 ? `${lastAssistant.text.slice(0, 400)}…` : lastAssistant.text);
    if (question && current.question !== before.question) {
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) focusQuestion();
      // 답 고치기는 editQuestion이 이미 제목으로 포커스를 옮긴다
      else if (!draft.editingId) parts.push(question.prompt);
    }
    setAnnouncement(parts.join(" "));
    // focusQuestion은 렌더마다 새로 만들어지지만 ref와 DOM만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, plan?.planId, lastAssistant?.id, question?.id, replyTurn]);
  /*
   * 작업실: 답이 서버에 저장될 때마다(저장본의 revision 이 바뀜) 작업실 머리줄의 질문 수(질문 6/14)를 바로 다시 묻게 한다 —
   * 대화 칸이 보이는 동안만(markActivity 는 보이는 칸에 점을 찍지 않는다). 숨어 있으면 위 알림 효과가 점을 찍고, 머리줄은 제 간격대로 묻는다.
   * 처음 불러온 저장본은 알리지 않는다.
   */
  const savedRevision = savedPlan ? `${savedPlan.planId}:${savedPlan.coach.revision}` : null;
  const seenRevision = useRef<string | null>(null);
  useEffect(() => {
    const before = seenRevision.current;
    seenRevision.current = savedRevision;
    if (!embedded || !savedRevision || !before || before === savedRevision || !paneVisible.current) return;
    studioNav?.markActivity?.("chat");
    // 저장본이 바뀔 때만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRevision]);
  /*
   * 작업실: 지켜보던 계획서 작성이 다 끝나면 한 번 — 마무리 말을 남기고, 대화 기록(계획서 있음)을 새로 받아 오고,
   * 대화 칸이 숨어 있으면 대화 탭에 점을, 보이면 알림 칸으로 읽어 준다.
   */
  useEffect(() => {
    if (!embedded || !plan) return;
    if (generating) { sawGenerating.current = true; return; }
    if (!sawGenerating.current || !generationFinished(generation.state)) return;
    sawGenerating.current = false;
    runFinishedAt.current = Date.now();
    setJustFinished(true);
    const id = plan.planId, epoch = routeEpoch.current;
    void getSnapshot(id).then(data => {
      if (epoch !== routeEpoch.current || conflictRef.current) return;
      if (data.ownerScope !== ownerScope.current) { freezeForOwnerChange(); return; }
      if (data.plan) installPlan(data.plan);
    }).catch(() => { /* 기록을 못 받아 와도 마무리 말과 단추는 그대로 쓸 수 있다 */ });
    if (paneVisible.current) setAnnouncement("사업계획서를 다 만들었어요. 계획서 보기와 홈페이지 만들기 중에 고를 수 있어요.");
    else studioNav?.markActivity?.("chat");
    // plan 전체가 아니라 사업이 바뀔 때와 작성 상태가 바뀔 때만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, plan?.planId, generating, generation.state]);
  /*
   * 작성이 멈춘 이유 — 이미 있는 계획서를 다시 쓰는데 다시 생성 횟수가 없으면 장마다 막혀(REGEN_QUOTA_EXCEEDED) 한 장도 못 쓴다.
   * 예전엔 진행 카드가 '0/10 만드는 중'에 머물러 무엇을 해야 할지 몰랐다(여정 점검 2026-10-23). 멈췄거나, 2분이 지나도 한 장도 못 썼을 때만 횟수를 확인한다.
   */
  const runState = generation.state;
  const [runOld, setRunOld] = useState<string | null>(null);
  useEffect(() => {
    const startedAt = runState?.startedAt;
    if (!embedded || !generating || !startedAt || (runState?.done ?? 0) > 0) return;
    const wait = Date.parse(startedAt) + 120_000 - Date.now();
    if (!Number.isFinite(wait)) return;
    const timer = window.setTimeout(() => setRunOld(startedAt), Math.max(0, wait));
    return () => window.clearTimeout(timer);
  }, [embedded, generating, runState?.startedAt, runState?.done]);
  const runSuspect = embedded && !!plan?.hasDocuments && !!runState && (runStalled || generating && runState.done === 0 && runOld === runState.startedAt);
  const runKey = plan && runState ? `${plan.planId}:${runState.startedAt ?? ""}` : "";
  const [regenShort, setRegenShort] = useState<{ key: string; pack: { count: number; amount: number } | null } | null>(null);
  useEffect(() => {
    if (!runSuspect || !plan || regenShort?.key === runKey) return;
    let alive = true;
    fetch(`/api/plan/regen-quota?planId=${encodeURIComponent(plan.planId)}`, { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then((data: { quota?: { remaining?: unknown; unavailable?: unknown } | null; pack?: { count: number; amount: number } } | null) => {
        if (alive && data?.quota && data.quota.unavailable !== true && typeof data.quota.remaining === "number" && data.quota.remaining <= 0) setRegenShort({ key: runKey, pack: data.pack ?? null });
      })
      .catch(() => { /* 횟수를 모르면 진행 카드의 안내만 둔다 */ });
    return () => { alive = false; };
    // 의심되는 작성이 생기거나 바뀔 때만 묻는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSuspect, runKey]);
  const regenFailure = runSuspect && plan && regenShort?.key === runKey ? <div className={styles.notice} role="alert" data-generation-failure>
    <p>다시 생성 횟수를 다 써서 계획서를 다시 쓰지 못하고 있어요. 지금 계획서는 그대로예요. 횟수를 추가하면 남은 장을 이어서 쓸 수 있어요.</p>
    <div className={styles.noticeActions}><Link href={`/plan/pay?${new URLSearchParams({ planId: plan.planId, planType: plan.planType, product: "regen" }).toString()}`}>{regenShort.pack ? `다시 생성 ${regenShort.pack.count}회 추가 (${regenShort.pack.amount.toLocaleString("ko-KR")}원)` : "다시 생성 횟수 추가"}<ChevronRight size={16} aria-hidden="true" /></Link></div>
  </div> : null;
  /* 작업실 대화 칸의 작성 진행 카드(팝업 대신) · 끝난 뒤 마무리 말 — 작업실 밖에서는 둘 다 없다. 멈춘 이유를 알면 카드 바로 아래에 */
  const studioRun = embedded && plan && generation.state && (generating || runStalled)
    ? <div ref={runCard}><GenerationCard state={generation.state} onRetry={startPrepare} retryDisabled={blocked || aiBusy || preparing} onOpen={() => showPlan(plan.planId)} note={pro ? null : STUDIO_RUN_NOTE} compact={pro} />{regenFailure}</div> : null;
  /* 진행 카드가 처음 나타나면(방금 '사업계획서 만들기'를 눌렀다) 따라 내려가 카드 전체를 보인다 — 그 뒤 진행으로 카드 키가 바뀌면 ResizeObserver 가 따라간다 */
  const runShown = !!studioRun;
  useEffect(() => {
    if (!runShown) return;
    follow.current = true;
    const frame = requestAnimationFrame(scrollToCurrent);
    return () => cancelAnimationFrame(frame);
  }, [runShown, scrollToCurrent]);
  const studioTurn = studioRun ?? (embedded && plan && justFinished
    ? <GenerationFinishedTurn planId={plan.planId} onPlan={() => showPlan(plan.planId)} onHomepage={() => navigate(homepageHref(plan.planId))} /> : null);

  /*
   * ── 작업실 3단계: 대화로 고치기 · 계획서를 쓰는 동안 보낸 요청 ──────────
   * 고치기 기록과 기다리는 요청은 사업 답변이 아니라 이 기기에서만 그리는 대화라 서버에 보내지 않고 사업마다 세션 저장소에 둔다
   * (탭을 바꾸거나 새로 고쳐도 이 세션 동안 남는다). 작업실 밖(예전 화면)에서는 모두 없다.
   */
  const studioPlanId = embedded ? plan?.planId ?? null : null;
  useEffect(() => {
    if (!studioPlanId) return;
    dispatchEdit({ type: "load", planId: studioPlanId, turns: restoreEditTurns(readSession(editTurnsKey(studioPlanId))) });
    setRequestQueue({ planId: studioPlanId, items: readRequestQueue(readSession(requestQueueKey(studioPlanId))) });
  }, [studioPlanId]);
  useEffect(() => { if (editState.planId) writeSession(editTurnsKey(editState.planId), editState.turns.length ? JSON.stringify(editState.turns) : null); }, [editState]);
  useEffect(() => { if (requestQueue.planId) writeSession(requestQueueKey(requestQueue.planId), requestQueue.items.length ? JSON.stringify(requestQueue.items) : null); }, [requestQueue]);
  const editTurns = studioPlanId && editState.planId === studioPlanId ? editState.turns : [];
  const queuedRequests = studioPlanId && requestQueue.planId === studioPlanId ? requestQueue.items : [];
  /* 고치기 카드 하나가 만드는 중 · 바꾸는 중 · 되돌리는 중이면 다음 요청과 다른 카드의 단추를 잠시 막는다 */
  const editWorking = editTurns.some(editTurnBusy);
  /* 보이면 알림 칸으로 읽어 주고, 대화 칸이 숨어 있으면(휴대폰의 다른 탭) 대화 탭에 점을 찍는다 */
  const announceEdit = (text: string) => { if (paneVisible.current) setAnnouncement(text); else studioNav?.markActivity?.("chat"); };
  /*
   * 고치기 처리기 찾기 — 홈페이지 칸은 그 탭을 처음 열 때 만들어지므로(AI 자동 채우기도 그때) 아직 없으면 한 번 열고 등록을 기다린다.
   * 휴대폰은 한 칸씩 보이니 기다린 뒤 카드가 있는 대화로 돌아온다(한 번 만든 칸은 숨겨도 남는다).
   */
  const waitForHandler = async (target: StudioEditTarget): Promise<StudioEditHandler | null> => {
    const find = () => studioNav?.editHandler?.(target) ?? null;
    let handler = find();
    if (handler || target !== "homepage" || !studioNav?.showTab) return handler;
    const narrow = !window.matchMedia(STUDIO_WIDE_QUERY).matches;
    studioNav.showTab("homepage");
    const until = Date.now() + HANDLER_WAIT_MS;
    while (!handler && Date.now() < until) {
      await new Promise(resolve => window.setTimeout(resolve, 200));
      handler = find();
    }
    if (narrow) studioNav.showTab("chat");
    return handler;
  };
  const missingHandler = (target: StudioEditTarget) => new Error(target === "homepage" ? "홈페이지를 아직 열지 못했어요. 홈페이지 탭을 한 번 연 뒤 다시 시도해 주세요." : "이 장을 고칠 준비가 아직 안 됐어요. 계획서 탭을 연 뒤 다시 시도해 주세요.");
  const runPropose = async (turn: Pick<StudioEditTurn, "id" | "target" | "instruction" | "sectionId">) => {
    try {
      const handler = await waitForHandler(turn.target);
      if (!handler) throw missingHandler(turn.target);
      const proposal = await handler.propose(turn.instruction, turn.sectionId ? { sectionId: turn.sectionId } : undefined);
      dispatchEdit({ type: "proposed", id: turn.id, proposal });
      announceEdit(`바꿀 내용을 정리했어요. ${proposal.summary}`);
    } catch (caught) {
      const error = studioEditError(caught, "바꿀 내용을 만들지 못했어요. 다시 시도해 주세요.");
      // 결제 전이라 못 고치면 [다시 시도] 대신 결제 단추(홈페이지 칸이 알려 준 곳)
      const action = studioEditAction(caught);
      dispatchEdit({ type: "failed", id: turn.id, error, retry: "propose", ...(action ? { action } : {}) });
      announceEdit(error);
    }
  };
  const startProposal = (target: StudioEditTarget, label: string, instruction: string, sectionId?: string) => {
    const turn = { id: crypto.randomUUID(), target, label, instruction, at: Date.now(), ...(sectionId ? { sectionId } : {}) };
    follow.current = true;
    dispatchEdit({ type: "propose", turn });
    void runPropose(turn);
  };
  const runApply = async (turn: StudioEditTurn) => {
    if (!turn.proposal) return;
    try {
      const handler = await waitForHandler(turn.target);
      if (!handler) throw missingHandler(turn.target);
      await handler.apply(turn.proposal.id);
      dispatchEdit({ type: "applied", id: turn.id });
      announceEdit("바꿨어요. 되돌리려면 되돌리기를 눌러 주세요.");
    } catch (caught) {
      const error = studioEditError(caught, "바꾸지 못했어요. 다시 시도해 주세요.");
      dispatchEdit({ type: "failed", id: turn.id, error, retry: "apply" });
      announceEdit(error);
    }
  };
  const runUndo = async (turn: StudioEditTurn) => {
    if (!turn.proposal) return;
    try {
      const handler = await waitForHandler(turn.target);
      if (!handler) throw missingHandler(turn.target);
      await handler.undo(turn.proposal.id);
      dispatchEdit({ type: "undone", id: turn.id });
      announceEdit("바꾸기 전으로 되돌렸어요.");
    } catch (caught) {
      const error = studioEditError(caught, "되돌리지 못했어요. 다시 시도해 주세요.");
      dispatchEdit({ type: "failed", id: turn.id, error, retry: "undo" });
      announceEdit(error);
    }
  };
  const applyTurn = (turn: StudioEditTurn) => { dispatchEdit({ type: "apply", id: turn.id }); void runApply(turn); };
  const undoTurn = (turn: StudioEditTurn) => { dispatchEdit({ type: "undo", id: turn.id }); void runUndo(turn); };
  const dismissTurn = (turn: StudioEditTurn) => {
    try { if (turn.proposal) studioNav?.editHandler?.(turn.target)?.dismiss(turn.proposal.id); } catch { /* 카드만 접으면 된다 — 적용하지 않은 제안이다 */ }
    dispatchEdit({ type: "dismiss", id: turn.id });
  };
  const retryTurn = (turn: StudioEditTurn) => {
    dispatchEdit({ type: "retry", id: turn.id });
    if (turn.retry === "apply") void runApply(turn);
    else if (turn.retry === "undo") void runUndo(turn);
    else void runPropose(turn);
  };

  /*
   * 대화 입력창의 작업실 모드 — 대상 칩이 있으면(홈페이지 · 계획서 한 장) 그 대상을 고치고, 칩이 없어도 계획서를 쓰는 동안이면
   * 보낸 말을 대기열에 둔다(쓰는 중에는 계획서가 바뀌는 중이라 바로 고칠 수 없다). 남은 질문에 답하는 중이면 예전 입력창 그대로.
   */
  const queueMode = embedded && !!plan && generating && !question && !draft.editingId;
  /*
   * 작업실에서는 입력창이 늘 보인다 — 다 만든 사업을 다시 열거나 사업 방향 정리가 끝난 뒤에도(여정 점검 2026-10-23: 입력창이 없어
   * 대화 중간의 '채팅으로 수정하기'를 찾아야 했다). 대상 칩 없이 보낸 말은 sendStudioChat 이 뜻을 보고 나눈다.
   */
  const studioChatMode = embedded && !!plan && !showReview && !replyTurn && !draft.editingId && (locked || showCompletion && (nextStep === "prepare" || nextStep === "open"));
  const studioComposer = embedded && !!plan && loaded && !loginGate && !loadFailed && !ownerChanged && (!!editTarget || queueMode || studioChatMode);
  const studioRoute: "homepage" | "queue" | "section" | "chat" | null = !studioComposer ? null : editTarget?.target === "homepage" ? "homepage" : queueMode ? "queue" : editTarget ? "section" : "chat";
  const editChatReady = COACH_EDIT_CHAT && !!plan?.hasDocuments;
  const studioSendDisabled = studioRoute === "homepage" ? editWorking
    : studioRoute === "queue" ? queuedRequests.length >= STUDIO_QUEUE_LIMIT
    : studioRoute === "section" || studioRoute === "chat" ? editWorking || blocked || aiBusy : true;
  /* 계획서 한 장 고치기는 장의 문장을 다시 쓰지 않고 사업 내용(답변)을 바꾼다 — 칩도 그렇게 부른다(약속과 하는 일이 같게) */
  const sectionByChat = editTarget?.target === "plan-section" && !studioNav?.editHandler?.("plan-section");
  /* 고칠 곳 칩은 '1장 사업 개요 고치기' 한 줄만(r37 점검) — 예전엔 '사업 내용 바꾸기 · …'와 두 줄 안내가 함께 붙었다 */
  const targetChip = !editTarget ? "" : studioTargetChipText(editTarget.label);
  /*
   * 입력칸 안내는 짧게(360px 에서 잘리지 않게 · r37 점검) — 고칠 곳은 위 칩이 말한다.
   * PC 는 오른쪽에 보이는 칸을 따른다: 계획서 칸이면 바꿀 사업 내용, 다른 칸이면 궁금한 점(홈페이지 고치기는 '추천' 칩이 연다).
   */
  const planSide = !pro || !studioSide || studioSide === "plan";
  /* 대화 칸 '계획서에 반영하기' — PC 에서 계획서 칸이 보이면 그 칸 위 파란 단추 하나만(대표 결정 r42) */
  const reflectStyle = chatReflectStyle(pro, studioSide);
  const studioPlaceholder = studioRoute === "queue" ? "다 쓰면 반영할 내용"
    : studioRoute === "homepage" ? "바꿀 글 (예: 제목 짧게)"
    : studioRoute === "chat" ? plan?.hasDocuments && planSide ? "바꿀 내용이나 궁금한 점" : "궁금한 점을 적어 주세요"
    : sectionByChat ? "예: 가격을 9,000원으로"
    : editTarget ? "바꿀 내용을 적어 주세요" : "";
  const studioNote = inputHint || composerLimitNote(studioText.length, 1200);
  /*
   * 입력창은 작업실 모드(고치기 칩 · 대기열 · 대화)와 질문 답 입력이 서로 다른 글을 들고 있다 — 모드가 바뀌어도 보내지 않은 글은 버리지 않고
   * 다음 입력창으로 옮긴다. 예전엔 계획서를 쓰는 동안 적던 글이 다 쓴 순간 사라졌다(점검 2026-10-23). 옮길 곳에 이미 글이 있으면 다음 줄에 잇는다.
   */
  const routeSeen = useRef(studioRoute);
  useEffect(() => {
    const before = routeSeen.current;
    routeSeen.current = studioRoute;
    if (!before === !studioRoute) return;
    const field = draftRef.current.mode === "help" ? "help" : "memo";
    if (before && !studioRoute) {
      const carried = visibleComposerText(studioText);
      if (!carried) return;
      const join = (current: string) => (visibleComposerText(current) ? `${current}\n${carried}` : carried).slice(0, 1200);
      setStudioText("");
      if (questionComposer && question) {
        const answer = draftRef.current.answers[question.id] ?? emptyAnswer();
        editDraft({ ...draftRef.current, answers: { ...draftRef.current.answers, [question.id]: { ...answer, text: join(answer.text), label: question.label } } });
      } else editDraft({ ...draftRef.current, [field]: join(draftRef.current[field]) });
      return;
    }
    /* 질문 답 입력은 질문 칸의 답이라 옮기지 않는다(칩을 거두면 그대로 다시 보인다) — 메모·질문 글만 옮긴다 */
    if (questionComposer || visibleComposerText(studioText) || !visibleComposerText(draftRef.current[field])) return;
    setStudioText(draftRef.current[field]);
    editDraft({ ...draftRef.current, [field]: "" });
  });
  /* 작업실 입력창의 보내지 않은 글도 질문 답처럼 이 세션에 보관한다 — 새로 고치거나 칸이 다시 그려져도 남게 */
  const studioTextKey = studioPlanId ? `oneul:studio-text:${studioPlanId}` : null;
  const studioTextLoaded = useRef<string | null>(null);
  useEffect(() => {
    if (!studioTextKey || studioTextLoaded.current === studioTextKey) return;
    studioTextLoaded.current = studioTextKey;
    const kept = readSession(studioTextKey);
    if (kept && visibleComposerText(kept)) setStudioText(current => visibleComposerText(current) ? current : kept);
  }, [studioTextKey]);
  useEffect(() => {
    if (studioTextKey && studioTextLoaded.current === studioTextKey) writeSession(studioTextKey, visibleComposerText(studioText) ? studioText : null);
  }, [studioTextKey, studioText]);
  const enterEditTarget = (request: StudioComposeRequest) => {
    /* 적던 글은 지우지 않는다 — 다른 칸에서 넘겨준 글이 있으면 그 아래 줄에 잇는다(이 함수는 한 번 등록돼 상태는 이전 값으로 받는다) */
    const given = request.text ?? "";
    setEditTarget(request); setStudioText(current => !visibleComposerText(current) ? given : given ? `${current}\n${given}`.slice(0, 1200) : current); setInputHint("");
    follow.current = true;
  };
  /* 다른 칸의 '대화로 고치기'(composeInChat) — 작업실이 휴대폰이면 대화 탭으로 바꾼 뒤 여기로 넘긴다 */
  useEffect(() => studioNav?.onComposeRequest?.(enterEditTarget),
    // enterEditTarget 은 상태 설정과 ref 만 쓴다 — 받는 곳은 작업실 이동 정보가 바뀔 때만 다시 등록한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [studioNav]);
  useEffect(() => { if (editTarget) focusComposer(); },
    // 대상 칩이 생기거나 바뀔 때만 입력창으로 — focusComposer 는 ref 만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editTarget]);
  /* keepText — 입력창에서 Esc 로 칩만 거둘 때는 적던 글을 남긴다(✕ 그만두기는 글까지 비운다) */
  const leaveEditTarget = (keepText = false) => {
    setEditTarget(null); if (!keepText) setStudioText(""); setInputHint("");
    /* 예전 채팅 수정으로 보낸 요청이 아직 정리 중이거나 확인을 기다리면 그 화면은 그대로 둔다 */
    const job = planRef.current?.intake.job;
    const editOpen = job?.kind === "edit" && (["queued", "running"].includes(job.status) || job.status === "complete" && !!job.proposal?.length && !job.proposalStatus);
    if (!editOpen) setChatEditLocal(false);
  };
  /*
   * 대상 칩은 그 칸을 보고 있을 때만 — PC 에서 오른쪽 칸을 다른 탭으로 바꾸거나 휴대폰에서 대화 탭을 떠나면 칩을 거둔다
   * (여정 점검 2026-10-23: 홈페이지를 보는데 '1장 사업 개요 고치기' 칩이 그대로였다). 적던 글이 있거나 고치는 중이면 그대로 둔다.
   */
  const paneActive = studioPane?.active ?? true;
  const viewSeen = useRef({ side: studioSide, pane: paneActive });
  useEffect(() => {
    const before = viewSeen.current;
    viewSeen.current = { side: studioSide, pane: paneActive };
    if (!editTarget || editWorking || visibleComposerText(studioText)) return;
    const sideChanged = before.side !== studioSide && studioSide !== (editTarget.target === "homepage" ? "homepage" : "plan");
    if (sideChanged || before.pane && !paneActive) leaveEditTarget();
    // 보이는 칸이 바뀔 때만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioSide, paneActive]);
  /* 계획서 한 장 고치기 — 그 장의 처리기가 있으면 카드로, 없으면 예전 채팅 수정(장 이름을 앞에 붙여 · 하루 한도 · 거르기 그대로), 그것도 꺼져 있으면 메모로 */
  const sendSectionEdit = (label: string, text: string, sectionId?: string) => {
    if (studioNav?.editHandler?.("plan-section")) { startProposal("plan-section", label, text, sectionId); return; }
    if (editChatReady) { setChatEditLocal(true); follow.current = true; void send({ action: "edit", message: planSectionEditMessage(label, text) }); return; }
    follow.current = true;
    dispatchEdit({ type: "note", turn: { id: crypto.randomUUID(), target: "plan-section", label: label || "계획서", instruction: text, at: Date.now(), ...(sectionId ? { sectionId } : {}) } });
  };
  /*
   * 대상 칩 없이 보낸 말 — 묻는 말이면 AI 답, 계획서가 있으면 사업 내용 바꾸기(채팅 수정: 서버가 범위 밖 말·말투 요청을 AI 없이 먼저 거른다),
   * 계획서 전이면 메모로 남긴다(메모 정리로 답변에 반영할 내용을 찾는다).
   */
  const sendStudioChat = (text: string) => {
    follow.current = true; setChatSent(true);
    if (isConsultationText(text)) { void send({ action: "help", message: text }); return; }
    if (plan?.hasDocuments) {
      if (editChatReady) { setChatEditLocal(true); void send({ action: "edit", message: text }); return; }
      dispatchEdit({ type: "note", turn: { id: crypto.randomUUID(), target: "plan-section", label: "계획서", instruction: text, at: Date.now() } });
      return;
    }
    void send({ action: "note", message: text, noteIntent: "memo" });
  };
  const submitStudio = () => {
    const text = visibleComposerText(studioText);
    if (!text || !studioRoute || studioSendDisabled) return;
    if (studioRoute === "chat") sendStudioChat(text);
    else if (studioRoute === "homepage") startProposal("homepage", editTarget?.label || "홈페이지", text);
    else if (studioRoute === "queue") {
      const section = editTarget?.target === "plan-section" ? { label: editTarget.label, ...(editTarget.sectionId ? { sectionId: editTarget.sectionId } : {}) } : undefined;
      const result = enqueueRequest(queuedRequests, { id: crypto.randomUUID(), text, ...(section ? { section } : {}), at: Date.now() });
      if (!result.ok) { setInputHint(queuedRequests.length >= STUDIO_QUEUE_LIMIT ? `기다리는 요청은 ${STUDIO_QUEUE_LIMIT}개까지예요. 다 쓴 뒤에 이어서 보내 주세요.` : "같은 요청이 이미 기다리고 있어요."); return; }
      setRequestQueue({ planId: studioPlanId, items: result.queue });
      follow.current = true;
      announceEdit("요청을 받아 뒀어요. 계획서를 다 쓰면 반영할게요.");
    } else sendSectionEdit(editTarget?.label ?? "", text, editTarget?.sectionId);
    setStudioText(""); setInputHint("");
  };
  const cancelQueued = (id: string) => setRequestQueue(current => ({ ...current, items: current.items.filter(item => item.id !== id) }));
  /*
   * 계획서를 다 쓰면 기다리던 요청을 하나씩 보낸다 — 채팅 수정은 앞 요청의 "이렇게 바꿀게요"를 손님이 고르기 전에는 다음을 보내지 않는다
   * (서버의 수정 작업은 하나뿐이라 다음 요청이 앞 제안을 덮는다). 멈춘 작성 · 실패 · 다른 일 중이면 기다린다.
   */
  const editProposalOpen = job?.kind === "edit" && job.status === "complete" && !!job.proposal?.length && !job.proposalStatus;
  useEffect(() => {
    if (!studioPlanId || !plan || !queuedRequests.length || generating || runStalled || !plan.hasDocuments) return;
    if (!loaded || loginGate || ownerChanged || blocked || aiBusy || editWorking || editProposalOpen || status === "failed") return;
    const [next, ...rest] = queuedRequests;
    setRequestQueue({ planId: studioPlanId, items: rest });
    const route = queuedRequestRoute(next, { sectionHandler: !!studioNav?.editHandler?.("plan-section"), editChat: editChatReady });
    if (route === "section") startProposal("plan-section", next.section!.label, next.text, next.section!.sectionId);
    else if (route === "edit") { setChatEditLocal(true); follow.current = true; void send({ action: "edit", message: next.section ? planSectionEditMessage(next.section.label, next.text) : next.text }); }
    else { follow.current = true; dispatchEdit({ type: "note", turn: { id: next.id, target: "plan-section", label: next.section?.label || "계획서", instruction: next.text, at: Date.now() } }); }
  });
  /* 고치기 카드 · 기다리는 요청이 늘거나 바뀌면 따라 내려가 마지막 것을 보인다 */
  const studioSignature = `${editTurns.map(turn => `${turn.id}:${turn.status}`).join(",")}|${queuedRequests.map(item => item.id).join(",")}`;
  useEffect(() => {
    if (!embedded || studioSignature === "|") return;
    follow.current = true;
    const frame = requestAnimationFrame(scrollToCurrent);
    return () => cancelAnimationFrame(frame);
  }, [embedded, studioSignature, scrollToCurrent]);
  /* PC 에서 오른쪽에 홈페이지가 보이면 '홈페이지를 대화로 고치기' 제안 — 누르면 입력창이 홈페이지 고치기로 바뀐다 */
  const homepageSuggest = embedded && studioSide === "homepage" && !!plan && loaded && !loginGate && studioNav?.editHandler?.("homepage")?.available?.() !== false && !!studioNav?.editHandler?.("homepage") && editTarget?.target !== "homepage";
  useEffect(() => {
    if (!plan || nextStep !== "design" || !showCompletion || blocked || aiBusy || loginGate || designFailed) return;
    const key = `${plan.planId}:${plan.coach.documentRevision ?? plan.coach.revision}`;
    if (autoDesigned.current === key) return;
    autoDesigned.current = key;
    void send({ action: "design" });
    // send는 렌더마다 새로 만들어지지만 위의 key로 한 번만 보낸다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, nextStep, showCompletion, blocked, aiBusy, loginGate, designFailed]);
  // Keep unsent text and failed requests visible; otherwise the completed step is a choice, not another chat turn.
  // 로그인 안내 화면에서는 입력창을 두지 않는다(보내도 서버가 로그인 필요로 거절한다)
  // 작업실: 대화로 고치기 대상이 있거나 계획서를 쓰는 중이면(대기열) 계획서가 있어도 입력창을 연다
  const showComposer = studioComposer || !loginGate && !showReview && !locked && (editTurn || !showCompletion || !nextStep || !!draft.pending || nextStep === "design" && (!!composerVisible || !!draft.memo.trim() || !!draft.help.trim()));
  // Problems read as a coach message at the end of the thread in coach chat, as a banner otherwise.
  const notices = (error && !ideaError && !staleFailure || connectionError || storageError) && <div className={styles.notices} data-coach-notices={coach || undefined}>
      {error && !ideaError && !staleFailure && <div className={styles.notice} role="alert"><p>{error}</p><div className={styles.noticeActions}>{sessionLost ? null : status === "conflict" || loadFailed ? <button type="button" disabled={busy} onClick={() => void reload()}><RefreshCw size={16} aria-hidden="true" />{error === BUSY_TEXT ? "다시 시도" : "최신 내용 불러오기"}</button> : draft.pending && <button type="button" disabled={busy} onClick={() => void send()}><RefreshCw size={16} aria-hidden="true" />다시 시도</button>}{planLimit && <Link href="/plan">내 사업으로<ChevronRight size={16} aria-hidden="true" /></Link>}{login && <Link href={loginHref}>{sessionLost ? "다시 로그인하기" : "로그인하고 이어가기"}<ChevronRight size={16} aria-hidden="true" /></Link>}</div></div>}
      {connectionError && <div className={styles.notice} role="status"><p>정리 상태를 갱신하지 못했어요. 입력은 계속할 수 있습니다.</p><button type="button" disabled={busy} onClick={() => void reload()}><RefreshCw size={16} aria-hidden="true" />상태 새로고침</button></div>}
      {storageError && <p className={styles.notice} role="status">이 기기에 임시 저장하지 못했어요. 서버에 저장하기 전에는 이 화면을 닫지 말아 주세요.</p>}
    </div>;
  /* 사업 요약 열기 — 예전 화면은 머리줄 오른쪽(actions), 작업실 칸 안에서는 대화 칸 맨 위 얇은 줄(진행 막대 옆)에 둔다 */
  const summaryToggle = plan && (plan.coreAnswered > 0 || plan.coach.fields.length > 0) ? <button type="button" className={styles.summaryToggle} aria-label={`사업 요약${plan.coreAnswered > 0 ? ` (답변 ${plan.coreAnswered}개)` : ""}`} aria-controls="intake-summary-panel" aria-expanded={coachLayout ? coachLayout === "split" : view === "summary"} onClick={() => { setView(view === "summary" ? "input" : "summary"); setDeskSummary(open => !open); }}><FileText size={17} aria-hidden="true" /><span aria-hidden="true">요약</span>{plan.coreAnswered > 0 && <b aria-hidden="true">{plan.coreAnswered}</b>}</button> : undefined;
  /*
   * ── 작업실 PC 대화 칸(새 모양) ─────────────────────────────
   * 작업 기록: 계획서가 있으면 사업 방향 정리 · 계획서 작성을 작성을 시작한 시각 자리에 끼운다(쓰는 동안은 진행 카드 그대로).
   */
  const historyLog = pro && plan?.hasDocuments && !studioRun ? { at: generation.state?.startedAt ?? null, node: <WorkLog key="plan-log" items={[designLogItem(plan), planLogItem(generation.state, runFinishedAt.current)]} /> } : undefined;
  /* 질문 카드 — 맨 위 '질문 10 / 14', 맨 아래 직접 적기 안내와 '앞 질문 고치기'(가장 최근에 답한 질문을 다시 연다 · 말풍선 연필과 같다) */
  const questionNumber = plan ? Math.min(plan.coreAnswered + 1, plan.coreTotal) : 0;
  // 답 시각은 나중 저장(구조·정리)에 다시 찍힐 수 있어 대화 순서(답 메시지가 놓인 자리)로 고른다
  const previousAnswerId = pro && plan && question && !draft.editingId && !documentFixed
    ? Object.entries(plan.intake.answers).filter(([id]) => id !== question.id && plan.questions.some(item => item.id === id))
      .map(([id, answer]) => ({ id, order: plan.coach.messages.findIndex(message => message.id === answer.messageId) })).filter(item => item.order >= 0)
      .sort((a, b) => b.order - a.order)[0]?.id ?? null : null;
  // 지난 답을 고칠 때는 카드 머리를 예전 '답변 수정 · 현재 질문으로' 줄이 맡는다
  const questionCard = pro && !!plan && !!question;
  /* 질문 번호는 칸 맨 위 진행 줄('사업 방향 정하기 ▬ 10 / 14')이 한 번만 말한다 — 카드·머리줄까지 세 번 보였다(PC 점검 2026-10-24) */
  const questionCardLabel = questionCard && !draft.editingId && plan.coreComplete ? "더 알려 주면 좋은 질문" : undefined;
  const questionCardFoot = questionCard ? <div className={styles.questionCardFoot}>
    <span>{question?.id === "industry" ? "업종 이름을 아래에 적으면 찾아 드려요" : "보기에 없으면 아래에 바로 적어 주세요"}</span>
    {previousAnswerId && <button type="button" className={styles.questionCardBack} disabled={answerBlocked} onClick={() => editQuestion(previousAnswerId)}><Undo2 size={13} aria-hidden="true" />앞 질문 고치기</button>}
  </div> : undefined;
  /* 입력칸 위 칩은 질문 이름만 — 질문 번호는 위 진행 줄이 말한다(r37 글 점검). 지난 답을 고칠 때만 '고치기'를 붙인다 */
  const questionTarget = pro && !studioRoute && questionComposer && question && plan ? draft.editingId ? `${question.label} 고치기` : question.label : "";
  /*
   * 입력창 왼쪽 아래 작은 단추 — 계획서가 있으면 고칠 곳 고르기(장 목록), 그 밖에는 지금까지 답 보기.
   * 질문 중에는 두지 않는다 — 오른쪽 칸이 지금까지 정한 내용을, 위 진행 줄이 질문 수를 이미 보여 준다(r37 글 점검).
   */
  const openSummary = () => { setView("summary"); setDeskSummary(true); };
  const pickable = pro && !editTarget && !!plan?.hasDocuments && editChatReady && editChapterList.length > 0 && (studioRoute === "chat" || studioRoute === "section");
  const composerSummary = pro && !!plan && !(questionComposer && !studioRoute && !plan.coreComplete) && !pickable && !!summaryToggle;
  const composerAction = !pro || !plan ? null
    : questionComposer && !studioRoute && !plan.coreComplete ? null
    : pickable ? <PickChapterMenu chapters={editChapterList} onPick={request => { studioNav?.showTab?.("plan"); enterEditTarget(request); focusComposer(); }} />
    : composerSummary ? <button type="button" className={styles.composerAction} aria-controls="intake-summary-panel" aria-expanded={view === "summary"} onClick={openSummary}><ListChecks size={14} aria-hidden="true" />지금까지 답 보기</button> : null;
  /* 입력창 위 '추천' 칩 — 누르면 입력창에 글만 채운다(보내지 않는다). 홈페이지를 보고 있으면 먼저 홈페이지 고치기로. 이미 보낸 예시는 다시 권하지 않는다(r42) */
  const priceAnswer = plan?.intake.answers.price;
  const suggestionChips: SuggestionChip[] = !pro || !studioComposer || editWorking ? []
    : homepageSuggest ? [{ label: "홈페이지를 대화로 고치기", pick: () => enterEditTarget({ target: "homepage", label: "홈페이지" }) }]
    : visibleComposerText(studioText) ? []
    : editTarget?.target === "homepage" ? HOMEPAGE_SUGGESTIONS
    : (studioRoute === "chat" && planSide || studioRoute === "section") && !!plan?.hasDocuments && editChatReady && !editProposalOpen && !aiBusy ? editExamples(priceAnswer?.status === "answered" ? priceAnswer.value : null).filter(text => !plan.coach.messages.some(message => message.role === "user" && message.text.endsWith(text))).map(text => ({ label: text, fill: text }))
    : [];
  const pickSuggestion = (chip: SuggestionChip) => {
    if (chip.pick) { chip.pick(); return; }
    if (!chip.fill) return;
    setStudioText(chip.fill); setInputHint(""); focusComposer();
  };
  /* 기다리는 요청의 연필 — 그 글을 입력창으로 되돌리고 대기열에서는 뺀다(적던 글이 있으면 그 아래 줄에 잇는다) */
  const editQueued = (item: QueuedStudioRequest) => {
    cancelQueued(item.id);
    setStudioText(current => (visibleComposerText(current) ? `${current}\n${item.text}` : item.text).slice(0, 1200));
    focusComposer();
  };
  const dockQueue = pro && showComposer && (plan || newEntry);
  /* 보내기 단추 — 예전 모양은 입력칸 오른쪽, PC 는 입력 카드 아래 줄 오른쪽 */
  const sendButton = <button type="submit" className={styles.sendButton} aria-label={studioRoute ? studioRoute === "queue" ? "기다리는 요청으로 보내기" : "보내기" : sendLabel} title={studioRoute ? "보내기" : sendLabel} disabled={studioRoute ? studioSendDisabled || !visibleComposerText(studioText) : !loaded || answerBlocked || ((draft.mode === "ideas" || askingAI) && aiBusy) || unfinishedText || !(plan ? composerVisible || choiceSubmission : entryMessage(draft))}>{!studioRoute && (busy && !answerQueueOpen || replyTurn) ? <LoaderCircle size={20} className={styles.spinner} /> : !studioRoute && askingAI ? <MessageCircle size={21} /> : <ArrowUp size={21} />}</button>;
  return <div className={`${styles.page} ${chatUi.theme}`} data-coach={coach || undefined} data-embedded={embedded || undefined} data-studio-pro={pro || undefined} data-keyboard={keyboardOpen || undefined}><BusinessAppChrome title={coach ? "오늘창업 코치" : !plan && newEntry ? "새 대화" : plan ? "오늘창업 코치" : "사업 기획"} active={newEntry ? "new" : "chat"} backHref="/plan" subtitle={!loaded ? "불러오는 중" : coach && !plan ? busy || replyTurn ? "생각 중…" : newEntry ? "답을 기다리는 중" : undefined : locked ? "사업계획서 완성 · 대화 기록" : editTurn && !aiBusy ? "계획서 수정 중 · 이 사업 내용만" : coachStatus} actions={embedded ? undefined : summaryToggle}>
    {plan && <>
      {/*
        작업실 칸 안: 칸 단추 줄(요약)과 진행 막대를 한 줄로 합친다 — 예전엔 요약 단추만 있는 넓은 줄 아래 막대가 또 있어 대화 위가 무거웠다.
        대화만 스크롤되고 이 줄은 칸 맨 위에 붙어 있다.
      */}
      {/* 작업실 PC: 질문 중에만 '사업 방향 정하기 ▬▬ 10 / 14' 한 줄 — 요약은 입력창 왼쪽 아래 단추가 연다. 입력창이 없을 때만 요약 단추를 이 줄에 남긴다 */}
      {pro ? !plan.coreComplete ? <div className={styles.paneBar} data-pro-head><b>사업 방향 정하기</b><div className={styles.paneProgress} aria-hidden="true"><span style={{ width: `${plan.coreTotal ? Math.round(plan.coreAnswered / plan.coreTotal * 100) : 0}%` }} /></div><span className={styles.paneCount}>{questionNumber} / {plan.coreTotal}</span>{!showComposer && summaryToggle}</div>
        : !showComposer && summaryToggle ? <div className={styles.paneBar} data-pro-head>{summaryToggle}</div> : null
        /* 휴대폰 작업실: 기본 질문을 다 답했으면 진행 막대는 빼고 요약 단추만(머리가 너무 높았다 · r37 휴대폰 점검) */
        : embedded ? <div className={styles.paneBar} data-done={plan.coreComplete || undefined}>{!plan.coreComplete && <div className={styles.paneProgress} aria-hidden="true"><span style={{ width: `${plan.coreTotal ? Math.round(plan.coreAnswered / plan.coreTotal * 100) : 0}%` }} /></div>}{summaryToggle}</div>
        : <div className={styles.progressLine} aria-hidden="true"><span style={{ width: `${plan.coreTotal ? Math.round(plan.coreAnswered / plan.coreTotal * 100) : 0}%` }} /></div>}
      {/* 코치 채팅에서 답 저장은 뒤에서 조용히 한다 — 매 답마다 '저장 중'을 띄우지 않고, 실패·충돌만 보인다(소유자 피드백 2026-10-09) */}
      <div className={!loaded || status === "saving" && !coach || status === "failed" && !staleFailure || status === "conflict" ? styles.statusLine : styles.srOnly} data-status={status} role="status" aria-live="polite">{status === "failed" && !staleFailure || status === "conflict" ? <AlertCircle size={15} aria-hidden="true" /> : !loaded || status === "saving" && !coach ? <LoaderCircle className={styles.spinner} size={15} aria-hidden="true" /> : null}{loaded ? status === "failed" && staleFailure ? "" : saveLabel : "불러오는 중"}</div>
    </>}
    {!coach && notices}
    <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true" data-intake-announcer>{announcement}</div>
    <div ref={split.ref} style={plan && !embedded ? split.style : undefined} data-loading={!loaded || undefined} data-coach-layout={coachLayout} className={`${styles.workspace} ${plan ? styles.withSummary : ""} ${split.dragging ? styles.resizing : ""}`}>
      <InputPane ref={inputPane} id="intake-input-panel" aria-label="사업 기획 대화" className={`${styles.inputPane} ${view !== "input" ? styles.mobileHidden : ""}`}>
        <div ref={conversation} data-intake-conversation className={styles.conversation}
          onWheel={event => { manualScroll.current = true; if (event.deltaY < 0) follow.current = false; }}
          onTouchStart={event => { touchY.current = event.touches[0]?.clientY ?? 0; }}
          onTouchMove={event => { manualScroll.current = true; if ((event.touches[0]?.clientY ?? 0) > touchY.current) follow.current = false; touchY.current = event.touches[0]?.clientY ?? 0; }}
          onPointerDown={event => { if (event.target === event.currentTarget) manualScroll.current = true; }}
          onKeyDown={event => { if (["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) { manualScroll.current = true; if (["PageUp", "Home", "ArrowUp"].includes(event.key)) follow.current = false; } }}
          onScroll={event => { if (!manualScroll.current) return; const node = event.currentTarget; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; if (follow.current) setUnseen(false); }}><div className={styles.inputContent}>
          {/* '사업계획서 만들기'를 누른 뒤 — 단추가 화면 밖으로 밀려도 알 수 있게 화면 전체에 같은 로딩(얇은 원)을 덮는다 */}
          {preparing && <div className={styles.prepareCover}><PlanLoading fill={!embedded} note="사업계획서를 준비하고 있어요" /></div>}
          {!loaded ? <PlanLoading fill={!embedded} note="대화를 불러오고 있어요" /> : loginGate ? <LoginGate /> : !plan ? replyTurn ? <><div className={styles.assistantMessage}><ChatSpeaker /><p>어떤 사업을 생각하고 계세요?</p></div><article className={styles.userMessage} data-coach-message="user"><p>{replyTurn.initialText}</p></article><LiveComment comment={liveComment.comment} onDismiss={liveComment.dismiss} /><div ref={currentTurn}><ReplyTyping /></div></> : newEntry ? <><EntryChoices disabled={blocked} initialMessage={draft.introMessage} onStart={startFromCard} coach={coach} /><LiveComment comment={liveComment.comment} onDismiss={liveComment.dismiss} /></> : !loadFailed && (signedIn ? <section className={styles.empty}><div className={styles.emptyIcon} aria-hidden="true"><FolderOpen size={28} strokeWidth={1.8} /></div>{/* 주소의 사업을 못 찾았으면 다른 화면과 같은 말과 '내 사업으로'(MissingBusiness) — 예전엔 '저장한 사업이 없습니다'(합니다체)였다 */}{searchParams.get("planId") ? <><h1>{MISSING_BUSINESS_TITLE}</h1><p>{MISSING_BUSINESS_DETAIL}</p><Link href="/plan" className={styles.primaryButton}>내 사업으로<ChevronRight size={18} aria-hidden="true" /></Link><Link href="/plan/chat?new=1" className={styles.textLink}>새 대화 시작하기</Link></> : <><h1>저장한 사업이 없어요</h1><Link href="/plan/chat?new=1" className={styles.primaryButton}>새 사업 기획<ChevronRight size={18} aria-hidden="true" /></Link><Link href="/plan" className={styles.textLink}>내 사업으로</Link></>}</section>
              /*
               * 로그인이 풀린 채 돌아오면 서버는 '새 방문자'로 보고 빈 목록을 준다. 예전엔 여기서 "저장한 사업이 없습니다"만 보여 줘서
               * 사업이 지워진 줄 알았다(사용자 피드백). 사업은 계정·브라우저에 그대로 있으니 이유와 되찾는 방법을 알린다.
               * 이 브라우저에서 만든 기록이 아예 없으면(처음 온 사람) '찾지 못했어요'는 맞지 않는 말이라 새로 시작하기를 앞에 둔다.
               */
              : !lastIntake ? <section className={styles.empty}>
                <div className={styles.emptyIcon} aria-hidden="true"><FolderOpen size={28} strokeWidth={1.8} /></div>
                <h1>아직 이어서 할 사업이 없어요</h1>
                <p>다른 기기에서 만든 사업은 로그인하면 보여요.</p>
                <Link href="/plan/chat?new=1" className={styles.primaryButton}>새 사업 기획<ChevronRight size={18} aria-hidden="true" /></Link>
                <Link href={`/account?next=${encodeURIComponent("/plan/chat")}`} className={styles.textLink}>로그인하고 이어가기</Link>
              </section>
              : <section className={styles.empty}>
                <div className={styles.emptyIcon} aria-hidden="true">{lastIntake?.signedIn ? <LogIn size={28} strokeWidth={1.8} /> : <FolderOpen size={28} strokeWidth={1.8} />}</div>
                {/* 제목이 이미 말하는 내용을 긴 설명으로 되풀이하지 않는다 — 한 줄로 다음 할 일만(대표 요청 2026-10-24) */}
                <h1>{lastIntake?.signedIn ? "로그인이 풀렸어요" : "사업을 찾지 못했어요"}</h1>
                <p>{lastIntake?.signedIn ? "다시 로그인하면 이어서 할 수 있어요." : "로그인하거나 처음 만든 브라우저에서 열어 주세요."}</p>
                <Link href={`/account?next=${encodeURIComponent(lastIntake?.planId ? `/plan/chat?planId=${encodeURIComponent(lastIntake.planId)}` : "/plan/chat")}`} className={styles.primaryButton}>로그인하고 이어가기<ChevronRight size={18} aria-hidden="true" /></Link>
                <Link href="/plan/chat?new=1" className={styles.textLink}>새 사업 기획</Link>
              </section>) : <>
            <ConversationHistory snapshot={plan} onEdit={editQuestion} receipt={receipt} readOnly={documentFixed} pro={pro} log={historyLog} />
            <LiveComment comment={liveComment.comment} onDismiss={liveComment.dismiss} />
            {resume && <div className={styles.resumeNotice} role="status"><p>{resume}</p><button type="button" className={styles.iconButton} aria-label="이어하기 안내 닫기" onClick={() => setResume("")}><X size={16} aria-hidden="true" /></button></div>}
            {updateNotice && !coach && <section className={styles.updateNotice} aria-label="변경 내용 반영 상태"><strong>저장된 결과 확인</strong><p>{updateNotice}</p><small>새로 만들기를 선택하기 전까지 기존 결과는 유지돼요.</small></section>}
            {job && <section className={styles.job} aria-label="AI 작업 상태">{aiBusy && (!showCompletion || job.kind === "help") && job.kind !== "design" && job.kind !== "edit" && <JobProgress snapshot={plan} announce variant="chat" />}{job.status === "failed" && <div className={styles.error} role="alert"><p>{job.error || "AI 작업을 완료하지 못했어요."}</p><p>저장한 답변과 메모는 그대로 남아 있습니다.</p><button type="button" className={styles.textButton} disabled={blocked} onClick={() => void send(job.kind === "extract" ? { action: "extract" } : job.kind === "design" ? { action: "design" } : job.kind === "ideas" ? { action: "ideas", message: job.request || "지금 조건으로 다른 사업을 제안해 주세요" } : { action: "help", message: job.request || draft.help })}><RefreshCw size={16} aria-hidden="true" />다시 요청</button></div>}{/* 사업 방향(design) 결과는 아래 카드 한 곳에서만 보인다 — 예전엔 같은 내용이 대화 글로도 한 번 더 나왔다 */}{job.status === "complete" && job.reply && job.kind !== "design" && !plan.coach.messages.some(message => message.id === `${job.id}:reply`) && <div className={styles.aiReply}><h3>{job.kind === "help" ? "AI 답변" : "메모 정리 결과"}</h3><ConversationText key={job.id} text={job.reply} /></div>}</section>}
            {showReview ? <><ExtractionReview key={plan.planId} snapshot={plan} disabled={blocked} onCommand={command => void send(command)} /><button type="button" className={styles.textButton} disabled={blocked} onClick={() => setDeferredReview(reviewKey)}>나중에 확인하고 대화 이어가기</button></> : reviewCandidates.length > 0 && <button type="button" className={styles.textButton} disabled={blocked || hasLocalInput(draft)} onClick={() => { follow.current = true; setDeferredReview(""); }}>메모에서 찾은 내용 {reviewCandidates.length}개 확인</button>}
            {!locked && questionNote && !questionHandled && <section className={styles.noteReceipt} aria-label="저장한 질문"><p>질문을 저장했어요</p><button type="button" className={styles.secondaryButton} disabled={blocked || aiBusy} onClick={() => void send({ action: "help", message: lastMessage!.text })}><MessageCircle size={16} aria-hidden="true" />AI 답변 받기</button></section>}
            {!locked && memoPending && <button type="button" className={styles.textButton} disabled={blocked || aiBusy} onClick={() => void send({ action: "extract" })}><RefreshCw size={15} aria-hidden="true" />저장한 메모 정리</button>}
            <div ref={currentTurn} className={styles.currentTurn} aria-busy={!!replyTurn} hidden={showReview}>
              {/* 쓰는 동안 받아 둔 요청을 보내 채팅 수정 화면이 되어도 마무리 말(계획서 보기 · 홈페이지 만들기)을 먼저 남기고 그 아래에 제안 카드 */}
              {editTurn && !replyTurn ? <>{studioTurn}<EditChatTurn pro={pro} chapters={editChapters} snapshot={plan} disabled={blocked || aiBusy} onSend={text => void send({ action: "edit", message: text })} onApply={() => void send({ action: "edit-apply" })} onDismiss={() => void send({ action: "edit-dismiss" })} />{nextStep === "prepare" && <NextStepAction reflect={reflectStyle} preparing={preparing} payNote={payNote} snapshot={plan} prepared={started} disabled={blocked} aiBusy={aiBusy} announce onDesign={() => void send({ action: "design" })} onPrepare={startPrepare} />}</> : locked && !replyTurn ? <>{studioTurn ?? <DocumentLockedTurn pro={pro} planId={plan.planId} chatEdit={COACH_EDIT_CHAT} onChatEdit={embedded ? () => { follow.current = true; focusComposer(); } : undefined} />}{nextStep === "prepare" && !studioRun && <NextStepAction reflect={reflectStyle} preparing={preparing} payNote={payNote} snapshot={plan} prepared={started} disabled={blocked} aiBusy={aiBusy} announce onDesign={() => void send({ action: "design" })} onPrepare={startPrepare} />}</> : replyTurn ? <ReplyTyping /> : intentConfirmation || amountConfirmation || sectorConfirmation || (question ? <QuestionForm key={`${question.id}:${draft.editingId ?? "current"}`} inChat cardLabel={questionCardLabel} cardFoot={questionCardFoot} question={question} snapshot={plan} draft={questionDraft} editing={!!draft.editingId} refining={draft.refiningId === question.id} suggestions={answerSuggestions.forQuestion(question.id)} disabled={answerBlocked} onChange={(answer, submit) => { editDraft({ ...draftRef.current, mode: "answer", answers: { ...draftRef.current.answers, [question.id]: { ...answer, label: question.label } } }); if (submit) autoSubmit.current = question.id; }} coach={coach} ksicQuery={coach && question.id === "industry" ? questionDraft.text : undefined} onCarry={carryDraft} onComposer={focusComposer} onAnswer={answerQuestion} onCancel={() => { follow.current = true; writeDraft({ ...draftRef.current, editingId: null, refiningId: null }); }} /> : draft.editingId ? <section className={styles.complete}><h2>이전 질문의 입력이 남아 있어요</h2><p>현재 사업 정보에 맞춰 질문 구성이 달라졌습니다.</p><button type="button" className={styles.secondaryButton} onClick={() => writeDraft({ ...draftRef.current, editingId: null, refiningId: null })}>현재 질문으로</button></section> : <section className={styles.complete}>
                {designRunning || designStarting ? <DesignProgress snapshot={plan} announce /> : <>
                {pro && (nextStep === "prepare" || nextStep === "open") && <WorkLog items={[designLogItem(plan)]} />}
                <ChatSpeaker />
                {(nextStep === "prepare" || nextStep === "open") && currentIdentity(plan) ? coach ? <DesignResult snapshot={plan} disabled={blocked} onName={name => void send({ action: "name", value: name })} /> : <BusinessIdentityHero snapshot={plan} disabled={blocked} onName={name => void send({ action: "name", value: name })} /> : <>
                <h2>{nextStep === "design" ? (designFailed ? "사업 방향을 정리하지 못했어요" : "답변으로 사업 방향을 정리하고 있어요") : nextStep === "prepare" ? "사업 방향을 정리했어요" : nextStep === "open" ? "사업계획서 문서를 만들었어요" : "사업 하나만 정하면 시작할 수 있어요"}</h2>
                <p>{nextStep === "design" ? (designFailed ? "저장한 답변은 그대로예요. 아래에서 다시 정리해 주세요." : "기본 질문이 끝나서 바로 정리를 시작했어요. 30~40초 뒤에 사업계획서를 만들 수 있어요.") : nextStep === "prepare" ? "아직 사업계획서 문서는 만들지 않았어요. 아래 방향이 맞으면 2단계에서 문서를 작성해요." : nextStep === "open" ? "사업계획서 문서를 열어 확인하세요." : refinement?.prompt ?? "이어서 사업 내용을 정해볼까요?"}</p>
                </>}
                {(nextStep === "prepare" || nextStep === "open") && !(coach && currentIdentity(plan)) && <DesignDirection snapshot={plan} continued={!!currentIdentity(plan)} />}
                {!nextStep && refinement && <button type="button" className={styles.primaryButton} disabled={blocked || aiBusy} onClick={() => editQuestion(refinement.id)}>{refinement.id === "candidate" ? "살펴볼 사업 정하기" : "사업 소개 정하기"}<ChevronRight size={17} aria-hidden="true" /></button>}
                {/* 작업실 안: 작성 중이면 진행 카드, 방금 끝났으면 마무리 말이 다음 단계 단추 자리를 대신한다 */}
                {studioTurn ?? <NextStepAction reflect={reflectStyle} preparing={preparing} payNote={payNote} snapshot={plan} prepared={started} disabled={blocked} aiBusy={aiBusy} announce minimal={coach && !!currentIdentity(plan)} onDesign={() => void send({ action: "design" })} onPrepare={startPrepare} />}
                </>}
                {generating && generation.state && !embedded && <button type="button" className={styles.secondaryButton} onClick={() => setGenerationOpen(true)}>사업계획서 작성 중 {generation.state.done}/{generation.state.total} · 진행 보기</button>}
                {!signedIn && <p className={styles.guestSaveNote}>로그인하지 않으면 이 브라우저에만 저장돼요. <Link href={loginHref}>로그인</Link>하면 다른 기기·브라우저에서도 이어서 볼 수 있어요.</p>}
                {/* 입력창 아래 '지금까지 답 보기'가 있으면 같은 단추를 또 두지 않는다(r37 점검) */}
                {!(composerSummary && showComposer) && <button type="button" className={styles.editLink} onClick={() => setView("summary")}><PencilLine size={14} aria-hidden="true" />지금까지 답변 보기</button>}
              </section>)}
            </div>
            {/* 작업실 3단계: 대화로 고치기 기록 · 쓰는 동안 보낸 요청 · 홈페이지 고치기 제안 — 기존 대화 뒤에 이 기기에서만 그린다 */}
            {embedded && <div ref={studioTail}>
              <StudioEditTurns pro={pro} turns={editTurns} disabled={editWorking} onApply={applyTurn} onDismiss={dismissTurn} onUndo={undoTurn} onRetry={retryTurn} onAction={navigate} />
              {/* PC 에서는 기다리는 요청을 입력창 바로 위 '다음 요청' 줄로, 홈페이지 고치기 제안은 '추천' 칩 줄로 옮긴다 */}
              {!dockQueue && <QueuedStudioRequests items={queuedRequests} generating={generating} onCancel={cancelQueued} />}
              {homepageSuggest && !pro && <div className={styles.studioSuggest} data-studio-item><button type="button" className={styles.chip} onClick={() => enterEditTarget({ target: "homepage", label: "홈페이지" })}>홈페이지를 대화로 고치기</button></div>}
            </div>}
          </>}
          {!showReview && !locked && shouldShowIdeaExploration(plan, question) && <IdeaExploration snapshot={plan!} selectedDraftId={questionDraft.selected[0]} disabled={blocked || aiBusy} rejected={ideaRejectIds} onReject={setIdeaRejectIds} onRequest={() => { writeDraft({ ...draftRef.current, mode: "ideas" }); void send({ action: "ideas", message: "현재 입력한 관심과 조건을 반영해 목록에 없는 사업 방향도 제안해 주세요" }); }} onCompose={() => { editDraft({ ...draftRef.current, mode: "ideas" }); requestAnimationFrame(() => composerInput.current?.focus()); }} error={ideaError} onSelect={id => {
            const current = draftRef.current.answers.candidate ?? emptyAnswer();
            setIdeaPick(id);
            editDraft({ ...draftRef.current, mode: "answer", answers: { ...draftRef.current.answers, candidate: { ...current, selected: [id], unknown: false, custom: false } } });
            // 코치 채팅에서는 다른 보기 칩처럼 바로 보낸다. 예전엔 입력창으로 커서를 옮기며 질문 맨 위로 화면이 튀어 고른 카드가 가려졌다.
            if (coach) autoSubmit.current = "candidate"; else follow.current = false;
          }} />}
          {plan && draft.introMessage && <div className={styles.introMessage}><article className={styles.userMessage} data-coach-message="user"><p>{draft.introMessage}</p></article><p className={styles.messageStatus}>이 기기에 보관 중</p></div>}
          {coach && notices}
        </div></div>
        {unseen && <button type="button" className={styles.newMessage} onClick={() => { follow.current = true; scrollToCurrent(); }}><ArrowDown size={15} aria-hidden="true" />이어서 대화하기</button>}
        {(plan || newEntry) && showComposer && <footer className={styles.composer} aria-label="대화 입력창">
          {/* 작업실 PC: 입력창 바로 위 — 기다리는 요청('다음 요청' 줄)과 '추천' 칩 줄(누르면 입력창에 글만 채운다) */}
          {dockQueue && <QueuedStudioRequests dock items={queuedRequests} generating={generating} onCancel={cancelQueued} onEdit={editQueued} />}
          {suggestionChips.length > 0 && <SuggestRow chips={suggestionChips} onPick={pickSuggestion} />}
          <form className={styles.composerShell} onSubmit={event => { event.preventDefault(); if (studioRoute) submitStudio(); else submitComposer(); }}>
            {questionTarget && <div className={styles.composerTarget} data-question-target><span title={questionTarget}><Target size={13} aria-hidden="true" /><span className={styles.composerTargetLabel}>{questionTarget}</span></span></div>}
            {/* 작업실: 무엇을 고치는지 칩으로 — ✕ 로 그만두면 예전 입력창으로 돌아간다. 쓰는 중이면 다 쓴 뒤 반영한다고 알린다 */}
            {studioRoute && studioRoute !== "chat" && <div className={styles.composerTarget} data-studio-target={editTarget?.target ?? "queue"}>
              {editTarget && <span title={targetChip}>{pro && (editTarget.target === "homepage" ? <Home size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />)}<span className={styles.composerTargetLabel}>{targetChip}</span><button type="button" aria-label={`${targetChip} 그만두기`} title="그만두기" onClick={() => leaveEditTarget()}><X size={14} aria-hidden="true" /></button></span>}
              {/* 꽉 차면 보내기 단추만 꺼지고 이유가 안 보였다 — 이유를 그 자리에 적는다 */}
              {/* 꽉 찼을 때만 이유를 적는다 — '계획서를 다 쓰면 반영할게요'는 입력칸 안내와 같은 말이라 뺐다(r37 글 점검) */}
              {studioRoute === "queue" && queuedRequests.length >= STUDIO_QUEUE_LIMIT && <small>{`기다리는 요청은 ${STUDIO_QUEUE_LIMIT}개까지예요 · 하나를 취소하면 더 적을 수 있어요`}</small>}
              {/* 장 처리기가 없으면 예전 채팅 수정 — 사업 내용(가격·고객 등)만 바뀐다. 고칠 곳 칩 · 입력칸 예시(가격을 9,000원으로)가 이미 말해 안내 줄은 두지 않는다(r37 글 점검) */}
            </div>}
            {!studioRoute && draft.mode === "ideas" && plan?.intake.mode === "exploring" && <div className={styles.composerContext}>AI에게 다른 사업 제안 요청<button type="button" className={styles.textButton} onClick={() => editDraft({ ...draftRef.current, mode: "answer" })}>질문으로 돌아가기</button></div>}
            {!studioRoute && directAnswer && !coach && <div className={styles.composerContext}>{draft.editingId ? "답변 수정 · " : ""}{question?.label}{question?.unit && <span>{question.unit}{question.period ? ` · ${question.period}` : ""}</span>}</div>}
            {!studioRoute && choiceSubmission && !coach && <div className={styles.composerSelection}><span>{questionDraft.ksic && questionDraft.ksicName ? `${questionDraft.ksicName} · ${ksicSectorLabel(questionDraft.ksic, questionDraft.selected[0], choiceText)}` : choiceText}</span><button type="button" className={styles.iconButton} title="선택 취소" aria-label="선택 취소" disabled={blocked} onClick={() => editDraft({ ...draftRef.current, answers: { ...draftRef.current.answers, [question!.id]: { ...questionDraft, selected: [], unknown: false, ksic: undefined, ksicName: undefined } } })}><X size={16} aria-hidden="true" /></button></div>}
            {!studioRoute && askingAI && <div className={styles.composerContext}><MessageCircle size={14} aria-hidden="true" />AI에게 질문<button type="button" className={styles.textButton} disabled={blocked} onClick={() => storeComposerNote("memo")}><Bookmark size={14} aria-hidden="true" />메모로 저장</button></div>}
            {(studioRoute ? studioNote : composerNote) && <p className={styles.composerHint} role="status" aria-live="polite">{studioRoute ? studioNote : composerNote}</p>}
            <div className={styles.composerRow}>
              <textarea ref={composerInput} id={directAnswer ? `intake-answer-${question!.id}` : "intake-memo"} aria-label="대화 내용" placeholder={studioRoute ? studioPlaceholder : coach ? coachPlaceholder : replyTurn ? "다음 질문을 준비하고 있어요" : choiceSubmission ? "덧붙일 설명 (선택 · 메모로 보관)" : !plan ? "생각을 들려주세요" : "답변이나 궁금한 점을 적어 주세요"} readOnly={!studioRoute && !!replyTurn} disabled={!loaded || loadFailed || ownerChanged} rows={1} enterKeyHint="enter" maxLength={1200} value={studioRoute ? studioText : composerShown} onPaste={event => {
                const input = event.currentTarget, pasted = event.clipboardData.getData("text");
                setPasteCut(pasted.length > 1200 - (input.value.length - (input.selectionEnd - input.selectionStart)));
              }} onChange={event => {
                /* 작업실 고치기 · 대기열 입력은 질문 답과 따로 둔다(답변 임시 저장과 섞이지 않게) */
                if (studioRoute) { setInputHint(""); setStudioText(event.target.value); if (event.target.value.length < 1200) setPasteCut(false); return; }
                setIntentPrompt(null); setAmountCheck(null);
                // 새로 입력하기 시작하면 지난 입력에 대한 안내·오류 말풍선은 지운다(저장 실패·충돌·로그인처럼 다시 시도가 필요한 오류는 남긴다)
                setInputHint("");
                if (error && !draftRef.current.pending && status === "failed" && !login && !sessionLost && !loadFailed) setError("");
                const typed = event.target.value;
                if (typed.length < 1200) setPasteCut(false);
                const label = (value: string) => (question?.options ?? []).find(option => option.value === value)?.label;
                const selected = coachHybrid ? questionDraft.selected.filter(value => value.startsWith(COUNT_PREFIX) || !!label(value) && typed.includes(label(value)!)) : questionDraft.selected;
                if (questionComposer && question) editDraft({ ...draftRef.current, ...(choiceQuestion ? { memo: "" } : {}), answers: { ...draftRef.current.answers, [question.id]: { ...questionDraft, selected, text: typed, label: question.label } } });
                else editDraft({ ...draftRef.current, [draft.mode === "help" ? "help" : "memo"]: event.target.value });
              }} onKeyDown={event => {
                /* Esc — 고치기 칩을 거둔다([그만두기]와 같다). 적던 글이 있으면 칩만 거두고 글은 남긴다 */
                if (event.key === "Escape" && editTarget && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); leaveEditTarget(!!visibleComposerText(studioText)); return; }
                /* 휴대폰 업종 질문: Enter 는 줄바꿈 대신 찾기 — 자판을 내려 찾은 업종이 보이게 한다(찾기는 적는 동안 이미 돈다 · r37 휴대폰 점검) */
                if (!studioRoute && question?.id === "industry" && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && window.matchMedia("(pointer: coarse)").matches) { event.preventDefault(); event.currentTarget.blur(); return; }
                if (composerEnterSends({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode }, window.matchMedia("(pointer: coarse)").matches)) { event.preventDefault(); if (studioRoute) submitStudio(); else submitComposer(); } }} />
              {!pro && sendButton}
            </div>
            {pro && <div className={styles.composerBar}>{composerAction}{sendButton}</div>}
          </form>
        </footer>}
      </InputPane>
      {plan && !embedded && <div {...split.separator} aria-controls="intake-input-panel" className={styles.splitHandle} title="드래그해서 너비 조절 · 두 번 누르면 기본 너비"><span /></div>}
      {plan && <aside id="intake-summary-panel" aria-labelledby="intake-summary-heading" className={`${styles.summaryPane} ${view !== "summary" ? styles.mobileHidden : ""}`}><div className={styles.summarySheetHeader}><button type="button" onClick={() => setView("input")}><ChevronLeft size={18} aria-hidden="true" />대화로 돌아가기</button></div><BusinessSummary snapshot={plan} showActions={false} readOnly={documentFixed} disabled={blocked} onStructure={patch => void send({ action: "structure", structure: patch })} aiBusy={aiBusy} prepared={started} onEdit={editQuestion} onDetails={() => void send({ action: "details" })} onDesign={() => void send({ action: "design" })} onPrepare={startPrepare} /><ResourcePanel snapshot={plan} draft={draft.resourceEditor} disabled={blocked} onDraft={resourceEditor => editDraft({ ...draftRef.current, resourceEditor })} onCommand={command => void send(command)} /><AnswerHistory snapshot={plan} readOnly={documentFixed} drafts={draft.answers} onEdit={editQuestion} onKeepAsMemo={keepDraftAsMemo} /></aside>}
    </div>
  {/* 작성 진행 팝업은 예전 화면에서만 — 작업실에서는 대화 안 진행 카드(GenerationCard)와 계획서 칸이 대신한다 */}
  {plan && !embedded && <GenerationDialog planId={plan.planId} open={generationOpen} state={generation.state} onClose={() => setGenerationOpen(false)} />}
    </BusinessAppChrome></div>;
}
