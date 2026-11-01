"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Download, ExternalLink, FileText, History, Mic, Monitor, MoreHorizontal, PanelLeftClose, PanelLeftOpen, RotateCw, Save, Share2, X } from "lucide-react";
import BusinessAppChrome, { type ChromeMenu } from "../BusinessAppChrome";
import PlanLoading from "../PlanLoading";
import { MissingBusinessBody } from "../MissingBusiness";
import { lockedGuide } from "../BusinessRailTree";
import BusinessIntake from "../chat/BusinessIntake";
import { PlanDocumentBody } from "../document/PlanDocumentBody";
import { HomepageScreen } from "../homepage/HomepageScreen";
import { BusinessWorkspace } from "../workspace/BusinessWorkspace";
import { useHomepage } from "../use-homepage";
import { useGenerationProgress } from "../GenerationProgress";
import frame from "../chat/page.module.css";
import hub from "../BusinessHub.module.css";
import styles from "./Studio.module.css";
import { sendStudioCommand, StudioNavContext, StudioPaneContext, type StudioCommand, type StudioComposeRequest, type StudioEditHandler, type StudioEditPreviewChapters, type StudioEditTarget, type StudioNav, type StudioPane } from "./StudioContext";
import { hydrateFromServer, isSamplePlan, lastHydrationFailed, loadState, setActivePlan, subscribePlanState, subscribePlanTitle, type Plan } from "../../../lib/plan-builder/plan-store";
import { journeySteps, JOURNEY_ORDER, WORKSPACE_TAB_EVENT, type JourneyState, type JourneyStepId } from "../../../lib/plan-builder/journey";
import { businessChatHref, businessHubState, shouldResumeBusinessChat } from "../../../lib/plan-builder/business-hub";
import { launchStatus, launchSteps, readLaunch } from "../../../lib/plan-builder/business-launch";
import { readCoach } from "../../../lib/plan-builder/coach";
import { businessDisplayName, draftBusinessTitle } from "../../../lib/plan-builder/business-name";
import { isStudioTab, newChatHref, studioChatComplete, studioChips, studioLockedStep, studioRedirectHref, studioStatusText, studioSteps, studioSwitchUrl, studioTabForStep, studioTarget, STUDIO_REDIRECT, STUDIO_TAB_LABELS, studioHref, type StudioChip, type StudioTab, type StudioTarget } from "../../../lib/plan-builder/studio";
import type { IntakeSnapshot } from "../../../lib/plan-builder/intake-types";
import { trackFunnel } from "../../../lib/funnel/client";
import { askConfirm, showCopyText, showNotice } from "../../../components/confirm-dialog";
import { openLogin } from "../../../components/login-dialog";
import { loadAuthSession } from "../../../lib/client/auth-session";
import StudioLoading from "./loading";
import StudioIntakeSummary from "./StudioIntakeSummary";
import { AppButton } from "../../../components/app-button";
import { JourneyGuideTurn } from "../chat/intake-ui/JourneyGuideTurn";
import { GUIDE_PARAM, journeyGuide, journeyGuideContext, readJourneyGuide } from "../../../lib/plan-builder/journey-guides";
import { useDictation } from "../../../components/use-dictation";
import { PopMenu, type PopMenuItem } from "./PopMenu";
import { BizMenu, PageSelect, ToolButton, type PageOption } from "./StudioBars";

/*
 * 사업 작업실 — PC(1024px 이상)는 왼쪽 대화 칸 + 오른쪽 [사업계획서 | 홈페이지 | 개업 준비 | 유지보수] 탭,
 * 휴대폰·태블릿은 [대화 | 계획서 | 홈페이지 | 개업·운영] 탭으로 한 칸씩 바꿔 본다.
 *
 * 각 칸은 처음 열 때 만들고 그 뒤로는 지우지 않고 숨기기만 한다(visibility:hidden + inert, 같은 크기로 겹쳐 둠) —
 * 대화 입력이나 홈페이지에서 고치던 내용이 탭을 바꿔도 남는다. display:none 이면 크기가 0이 되어 홈페이지 편집기와
 * 대화 자동 스크롤(ResizeObserver)의 크기 계산이 깨진다.
 * 홈페이지 칸은 그 탭을 처음 열 때까지 만들지 않는다 — 열리는 순간 홈페이지를 만들고 AI 자동 채우기를 시작한다.
 *
 * 2단계: 머리줄 하나(사업명 + 지금 하는 일 · 진행 단계 칩 · 보이는 칸의 단추), 새 대화도 작업실에서(주소에 사업 없음 → 대화 칸만,
 * 대화가 사업을 만들면 그 사업을 주소에 적고 그대로 이어 간다 — BusinessKeyed adoptFirst), 숨은 칸의 새 소식 점.
 *
 * 새 PC 작업실(대표 승인 시안 2026-10-24): 머리줄 한 줄 — 왼쪽(대화 칸 폭)은 ← · 로고 · 사업명 ⌄(서랍) · 지금 하는 일 · ☰,
 * 오른쪽은 [사업계획서 | 홈페이지 | 개업 준비 | 유지보수] 탭(✓ 끝난 단계) · 가운데 알약(보이는 칸이 올린 것 — setHeaderCenter) ·
 * 작은 진행 막대(2/4) · 보이는 칸의 단추. 대화만 할 때는 탭 대신 1 대화 — 2 계획서 — 3 홈페이지 — 4 개업 준비.
 * 바탕은 옅은 회색, 대화 칸은 바탕 위에, 오른쪽 칸은 흰 카드 하나(칸 내용은 카드 안에서 스크롤). 휴대폰은 예전 그대로.
 */

type RightTab = Exclude<StudioTab, "chat">;
type Lock = { message: string; back: StudioTab; label: string };
type SelectOptions = { focus?: "heading"; link?: { params: Record<string, string>; hash: string } };
type TabSource = "click" | "link" | "auto";
/* designRunning — 대화 칸이 사업 방향을 정리하는 중(사업안 만들기 작업이 도는 중) */
type IntakeCount = { answered: number; total: number; complete: boolean; designRunning: boolean };

/* 미리보기 판의 페이지 — 위 막대 페이지 선택(PC) · 아래 막대 … 메뉴(휴대폰)가 고른다. 예전 네 칸 탭을 흡수했다 */
const RIGHT_TABS: RightTab[] = ["plan", "homepage", "launch", "operations"];
/* 휴대폰 아래 막대의 파란 주 단추 — 보는 페이지마다 하나(계획서 내려받기 · 홈페이지 공개하기 · 개업 준비 다음 단계 · 유지보수 기록 추가) */
const PRIMARY: Record<RightTab, { label: string; command: StudioCommand }> = {
  plan: { label: "내려받기", command: "plan-download" },
  homepage: { label: "공개하기", command: "homepage-publish" },
  launch: { label: "다음 단계", command: "launch-next" },
  operations: { label: "기록 추가", command: "operations-add" },
};
const LEAVE_MESSAGE = "저장하지 않은 수정이 있어요. 이 화면을 나가면 고친 내용이 사라져요. 나갈까요?";
/* 작성이 멈춘 상태(아직 안 쓴 장이 남았는데 작업이 끝남) — GenerationProgress 와 같은 기준 */
const GENERATION_FAILED = ["errored", "terminated", "complete"];
/* 대화 질문 진행(질문 6/14)을 다시 묻는 간격 — 대화 칸이 따로 자주 묻고 있어 머리줄은 느리게. AI 를 부르지 않는 읽기 요청 */
const INTAKE_POLL_MS = 15_000;
/* 새 대화 — 아직 사업이 없어 오른쪽 칸은 모두 막는다(PC 는 안내 대신 지금까지 답한 내용 — StudioIntakeSummary) */
const FRESH_LOCK: Lock = { message: "대화를 마치면 열려요", back: "chat", label: "대화로 가기" };
/* 다른 창에서 같은 사업을 고쳤을 수 있다 — 이 창으로 돌아오면 보이는 칸을 다시 읽는다. 창을 자주 오가도 이 간격에 한 번만 */
const WAKE_REFRESH_MS = 5_000;
/* 칸 ↔ 그 칸이 저장 안 한 수정을 알리는 이름(useStudioDirty) — 고치는 중인 칸은 돌아와도 다시 읽지 않는다 */
const PANE_DIRTY_ID: Record<RightTab, string> = { plan: "plan-document", homepage: "homepage", launch: "workspace-launch", operations: "workspace-operations" };

/* 화면 폭 — CSS 의 1024px 기준과 같다(칸을 만들고 inert 를 거는 판단에 쓴다) */
const WIDE_QUERY = "(min-width: 1024px)";
const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readWide = () => window.matchMedia(WIDE_QUERY).matches;
const serverWide = () => false;
/* 왼쪽 메뉴(256)를 늘 펴 두는 폭 — 그보다 좁은 PC 는 미리보기 판 자리를 남기려고 접고, 대화 열 머리의 ☰ 로 같은 메뉴를 연다 */
const RAIL_QUERY = "(min-width: 1360px)";
const subscribeRail = (onChange: () => void) => {
  const query = window.matchMedia(RAIL_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readRail = () => window.matchMedia(RAIL_QUERY).matches;

/*
 * 아직 갈 수 없는 단계 — 왼쪽 메뉴(BusinessRailTree)와 같은 문구(lockedGuide). 막힌 탭은 칸을 만들지 않고 안내만 보인다
 * (막힌 홈페이지 칸을 만들면 쓰지도 않을 홈페이지와 AI 비용이 생긴다).
 * 작업실은 대화가 끝났는지를 studioChatComplete(사업안이 있거나 핵심 질문을 다 답함)로 본다 — 첫 답만으로는 계획서 · 개업 준비 ·
 * 유지보수가 열리지 않는다. 문서가 이미 있으면 대화는 늘 끝난 것이라 막히지 않는다. 대화 없이 쓴 예전 사업(코치 없음)은 예전 규칙 그대로.
 * pending — 새 대화로 시작해 아직 사업이 없다(또는 대화가 막 만든 사업을 아직 못 불러옴): 오른쪽 칸은 모두 대화로 안내한다.
 */
function lockFor(tab: StudioTab, plan: Plan | null, steps: ReadonlyArray<{ id: JourneyStepId; state: JourneyState }> | null, chatComplete: boolean, pending: boolean): Lock | null {
  if (tab === "chat") return null;
  if (!plan || !steps) return pending ? FRESH_LOCK : null;
  if (isSamplePlan(plan.id)) return null;
  const workspaceOpen = !shouldResumeBusinessChat(plan) && (chatComplete || !readCoach(plan.answers));
  const step = studioLockedStep(tab, steps, workspaceOpen);
  if (!step) return null;
  const guide = lockedGuide(step, readCoach(plan.answers)?.stage === "operating");
  return { message: guide.message, back: studioTabForStep(JOURNEY_ORDER[guide.back]), label: guide.label };
}

/* 이 기기 저장본과 서버 것 중 나중에 저장한 쪽 — 대화는 서버에만 저장해 이 기기 저장본이 늦을 수 있다 */
function newer(a: Plan | null, b: Plan | null): Plan | null {
  if (!a) return b;
  if (!b) return a;
  return (b.updatedAt || "").localeCompare(a.updatedAt || "") > 0 ? b : a;
}

export default function Studio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId") ?? "";
  const urlTab = searchParams.get("tab");
  const intakeV2 = process.env.NEXT_PUBLIC_BUSINESS_INTAKE_V2 === "1";
  /*
   * 새 대화 — 주소에 사업이 없다. 대화 칸만 열고 오른쪽 탭은 막아 둔다. 대화가 사업을 만들면 주소에 사업이 적히고
   * (BusinessIntake 의 updateUrl) 작업실은 다시 그려지지 않은 채 그 사업을 이어 받는다(BusinessKeyed adoptFirst).
   */
  const fresh = !planId;
  const [startedFresh] = useState(fresh);
  const newIntent = searchParams.get("new") === "1" || !!searchParams.get("idea") || !!searchParams.get("prompt");

  /*
   * 새 대화 화면이 꺼져 있으면 예전 대화로 — 그때는 예전 화면이 작업실로 보내지 않으므로(STUDIO_REDIRECT) 서로 보내는 고리가 없다.
   * 결제 결과의 작성 시작(start=1)은 그대로 싣는다 — 빠지면 결제하고도 작성이 시작되지 않는다.
   */
  useEffect(() => {
    const start = intakeV2 ? null : new URLSearchParams(window.location.search).get("start");
    if (!intakeV2) router.replace(planId ? `${businessChatHref(planId)}${start ? `&start=${encodeURIComponent(start)}` : ""}` : `/plan/chat${window.location.search}`);
  }, [intakeV2, planId, router]);

  /* ── 탭 ─────────────────────────────────────────────── */
  /* 탭을 왜 바꿨는지(눌렀다 · 링크 · 칸이 요청) — 깔때기 이벤트(studio_tab_view)에 싣는다 */
  const tabSource = useRef<TabSource>("click");
  const [tab, setTab] = useState<StudioTab>(() => (isStudioTab(urlTab) ? urlTab : "chat"));
  /* 주소의 탭이 바뀌면(뒤로 가기·다른 곳의 replaceState) 따라간다 — 탭이 빠진 주소는 지금 탭 그대로 */
  const seenUrlTab = useRef(urlTab);
  useEffect(() => {
    if (seenUrlTab.current === urlTab) return;
    seenUrlTab.current = urlTab;
    if (isStudioTab(urlTab)) { tabSource.current = "link"; setTab(urlTab); }
  }, [urlTab]);
  /* PC 에서 주소 탭이 '대화'일 때 오른쪽에 보일 칸 — 마지막으로 연 오른쪽 탭(처음엔 사업계획서) */
  const [lastRight, setLastRight] = useState<RightTab>(() => (isStudioTab(urlTab) && urlTab !== "chat" ? urlTab : "plan"));
  useEffect(() => { if (tab !== "chat") setLastRight(tab); }, [tab]);
  const rightTab: RightTab = tab === "chat" ? lastRight : tab;
  const wide = useSyncExternalStore(subscribeWide, readWide, serverWide);
  const railOpen = useSyncExternalStore(subscribeRail, readRail, serverWide);

  const headings = useRef<Partial<Record<StudioTab, HTMLHeadingElement | null>>>({});
  /* PC 대화 열 접기(머리 '패널 접기') — 미리보기 판이 넓어진다. 대화로 고치기를 부르면 다시 편다 */
  const [chatCollapsed, setChatCollapsed] = useState(false);

  /* 링크로 칸을 열 때마다 그 칸의 이동 번호를 올린다 — 이미 보이는 칸도 주소의 edit · #sec- 를 다시 읽는다(useStudioPane().nav) */
  const [navSeq, setNavSeq] = useState<Partial<Record<StudioTab, number>>>({});
  /*
   * 칸에 새 소식이 있다고 알릴 때마다(showTab · markActivity) 그 칸의 새로 읽기 번호를 올린다(useStudioPane().refresh) —
   * 이미 보이는 계획서 칸은 작성이 시작돼도 스스로 진행을 다시 묻지 않아(처음 물었을 때 쉬고 있으면 멈춤) 창을 다시 눌러야 장이 보였다.
   */
  const [refreshSeq, setRefreshSeq] = useState<Partial<Record<StudioTab, number>>>({});
  const bumpRefresh = useCallback((target: StudioTab) => setRefreshSeq(seq => ({ ...seq, [target]: (seq[target] ?? 0) + 1 })), []);

  const selectTab = useCallback((next: StudioTab, options: SelectOptions = {}) => {
    /*
     * 주소는 replaceState 로(기록을 쌓지 않음). 앞 링크가 실어 온 값(edit · step · start)과 해시는 지우고,
     * 링크로 온 것이면 그 링크의 값과 해시만 싣는다 — 탭을 그냥 누르면 모두 지운다(studioSwitchUrl).
     */
    const nextUrl = studioSwitchUrl(window.location.href, next, options.link);
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      seenUrlTab.current = next;
      window.history.replaceState(null, "", nextUrl);
      if (options.link?.hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
    if (options.link) setNavSeq(seq => ({ ...seq, [next]: (seq[next] ?? 0) + 1 }));
    tabSource.current = options.link ? "link" : "click";
    setTab(next);
    /* 왼쪽 메뉴(서랍)가 지금 탭을 다시 표시한다 */
    window.dispatchEvent(new Event(WORKSPACE_TAB_EVENT));
    /*
     * 누른 것이면 칸 제목으로 초점을 옮긴다(칸 제목은 칸을 만들기 전에도 있다). 링크로 온 #자리가 이미 그려져 있으면 그리로 —
     * 계획서의 #sec- 는 그 장이 아직 안 그려졌을 수 있어 계획서 칸이 이동 번호(nav)를 보고 장을 바꾼 뒤 옮긴다.
     */
    if (options.focus === "heading") requestAnimationFrame(() => {
      headings.current[next]?.focus({ preventScroll: true });
      const hash = options.link?.hash.replace(/^#/, "");
      if (hash) document.getElementById(decodeURIComponent(hash))?.scrollIntoView({ block: "start" });
    });
  }, []);

  /* ── 사업 불러오기 — 작업실이 한 번 불러온 뒤에 오른쪽 칸을 만든다(동시에 부르면 먼저 부른 칸이 옛 저장본을 받는다) ── */
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const planNow = useRef<Plan | null>(null);
  planNow.current = plan;
  const [missing, setMissing] = useState(false);
  /*
   * 로그인이 풀려서 못 찾았다 — 세션이 끝나면 서버가 빈 목록(로그인 안 됨)을 주고 이 기기 저장본도 비워져, 예전엔
   * '사업을 찾지 못했어요'와 '내 사업으로'만 보였다(점검 2026-10-23). 그때는 '로그인이 풀렸어요'와 다시 로그인하는 길을 연다.
   */
  const [signedOut, setSignedOut] = useState(false);
  const [title, setTitle] = useState("");
  useEffect(() => {
    if (!planId || !intakeV2) return;
    let alive = true;
    hydrateFromServer().catch(() => loadState()).then(async state => {
      if (!alive) return;
      const found = state.plans.find(item => item.id === planId) ?? null;
      /* 새 대화가 막 만든 사업은 서버 목록에 늦게 보일 수 있다 — 못 찾았다고 대화까지 덮지 않고 막힌 탭에서 다시 확인한다 */
      const lost = !found && !lastHydrationFailed() && !isSamplePlan(planId) && !startedFresh;
      /* 로그인 상태를 확인하지 못하면 예전처럼 '찾지 못했어요'(로그인 안 됨으로 단정하지 않는다) */
      const loggedOut = lost && await loadAuthSession().then(session => session.authenticated === false, () => false);
      if (!alive) return;
      if (found) setActivePlan(planId);
      setPlan(found);
      setTitle(found?.title ?? "");
      setMissing(lost);
      setSignedOut(loggedOut);
      setReady(true);
    });
    return () => { alive = false; };
  }, [planId, intakeV2, startedFresh]);
  /* 다른 칸이 이 기기 저장본을 고치면 다시 읽는다(잠김 판단·제목) */
  useEffect(() => subscribePlanState(() => {
    const found = loadState().plans.find(item => item.id === planId) ?? null;
    if (found) setPlan(current => newer(current, found));
  }), [planId]);
  useEffect(() => subscribePlanTitle(notice => { if (notice.planId === planId) setTitle(notice.title); }), [planId]);
  /*
   * 대화가 끝나거나 작성을 시작하면, 또 막힌 탭을 누르면 서버 것을 읽기만 해서 잠김을 다시 판단한다 —
   * hydrateFromServer 를 또 부르면 칸들이 부른 것과 겹쳐 먼저 부른 쪽이 옛 저장본을 받는다.
   */
  /* 읽는 중이면 그 읽기를 돌려준다 — 사업 방향 정리가 끝난 뒤 사업안이 올 때까지 기다리는 쪽(designSettling)이 함께 쓴다 */
  const refreshing = useRef<Promise<void> | null>(null);
  const refreshPlan = useCallback((): Promise<void> => {
    if (!planId) return Promise.resolve();
    if (refreshing.current) return refreshing.current;
    const request = fetch("/api/plan/state", { cache: "no-store" })
      .then(response => (response.ok ? response.json() : null))
      .then((data: { plans?: Plan[] } | null) => {
        const found = data?.plans?.find(item => item.id === planId) ?? null;
        if (!found) return;
        /* 다른 창에서 이름을 바꿨으면(서버 것이 더 새것) 머리줄 이름도 따라간다 — 예전엔 처음 이름을 계속 보였다(점검 r42) */
        const fresher = newer(planNow.current, found) === found;
        setPlan(current => newer(current, found));
        setTitle(current => (fresher && found.title) || current || found.title);
        setMissing(false);
        setSignedOut(false);
      })
      .catch(() => { /* 다음에 다시 확인한다 */ })
      .finally(() => { refreshing.current = null; });
    refreshing.current = request;
    return request;
  }, [planId]);

  const homepageInfo = useHomepage(planId || null);
  const homepage = homepageInfo.status;
  const pending = fresh || startedFresh;

  /* ── 머리줄 상태 — 작성 진행 · 대화 질문 진행 · 개업 준비(AI 를 부르지 않는 읽기만) ── */
  const generationRecord = plan?.answers.__coach_generation as { runId?: unknown } | undefined;
  const generationKey = typeof generationRecord?.runId === "string" ? generationRecord.runId : "";
  /* 작성이 시작됐다고 칸이 알려 오면(계획서 탭 보이기 · 점) 이 기기 저장본에 작업 번호가 오기 전에도 진행을 묻는다 */
  const [generationWanted, setGenerationWanted] = useState(false);
  const { state: generation, restart: restartGeneration, authLost: generationAuthLost } = useGenerationProgress(planId || null, ready && (!!generationKey || generationWanted));
  const restartGenerationRef = useRef(restartGeneration);
  useEffect(() => { restartGenerationRef.current = restartGeneration; });
  /* 다시 쓰기처럼 작업 번호가 바뀌면 다시 묻기 시작한다(처음 생긴 번호는 위 enabled 가 켜지며 묻는다) */
  const seenGenerationKey = useRef(generationKey);
  useEffect(() => {
    const before = seenGenerationKey.current;
    seenGenerationKey.current = generationKey;
    if (before && generationKey && before !== generationKey) restartGenerationRef.current();
  }, [generationKey]);
  const generationStalled = !!generation?.active && GENERATION_FAILED.includes(generation.runStatus ?? "");
  const generationRunning = !!generation?.active && !generationStalled;
  /* 작성이 끝나면 서버 것을 다시 읽어 계획서 단계를 '완료'로 */
  const wasGenerating = useRef(false);
  useEffect(() => {
    if (wasGenerating.current && !generationRunning) refreshPlan();
    wasGenerating.current = generationRunning;
  }, [generationRunning, refreshPlan]);

  const operating = readCoach(plan?.answers ?? {})?.stage === "operating";

  /* 대화 질문 진행(질문 6/14) — 대화 단계일 때만, 화면이 보일 때만 느리게 묻는다. 대화 칸이 답을 저장하거나 새 소식을 알리면 바로 다시 묻는다 */
  const [intake, setIntake] = useState<IntakeCount | null>(null);
  const [intakeTick, setIntakeTick] = useState(0);
  /* 다른 사업으로 바뀌면(새 대화 → 사업, 다른 사업 링크) 앞 사업의 질문 수를 쓰지 않는다 — 그리는 중에 맞춘다 */
  const [intakePlanId, setIntakePlanId] = useState(planId);
  /* 지금까지 답한 내용(대화 칸 '요약'과 같은 자료) — PC 에서 대화가 끝나기 전 오른쪽 칸에 보인다 */
  const [intakeSnapshot, setIntakeSnapshot] = useState<IntakeSnapshot | null>(null);
  /*
   * 대화 칸이 바로 알려 온 사업 방향 정리(nav.setDesignRunning) — running 은 정리하는 중, settling 은 막 끝나 사업안을 다시 읽는 중
   * (그 사이 '대화 중 · 마무리'로 잠깐 돌아가지 않게). 질문 수 묻기(15초)만 기다리면 30~40초 정리 동안 머리줄이 최대 15초 늦었다.
   * 사업이 바뀌어도 지우지 않는다 — 대화 칸은 늘 하나라 새 사업에서 값이 달라지면 그때 다시 알린다.
   */
  const [chatDesign, setChatDesign] = useState<"running" | "settling" | null>(null);
  if (intakePlanId !== planId) { setIntakePlanId(planId); setIntake(null); setIntakeSnapshot(null); }
  /* 제목이 바뀌면(첫 답 · 이름 정함) 사업 설명도 바로 다시 읽는다 — 임시 제목(provisionalTitle)이 15초 늦지 않게 */
  useEffect(() => subscribePlanTitle(notice => { if (notice.planId === planId) setIntakeTick(value => value + 1); }), [planId]);
  const chatDesignRunning = useRef(false);
  const setDesignRunning = useCallback((running: boolean) => {
    if (chatDesignRunning.current === running) return;
    chatDesignRunning.current = running;
    /* 서버의 정리 작업 상태(질문 수 묻기)도 바로 다시 묻는다 — 실패했으면 그쪽이 정리 중을 끈다 */
    setIntakeTick(value => value + 1);
    if (running) { setChatDesign("running"); return; }
    setChatDesign("settling");
    void refreshPlan().finally(() => setChatDesign(current => (current === "settling" ? null : current)));
  }, [refreshPlan]);
  /*
   * 작업실의 대화 완료 — 사업안이 있거나 · 계획서 장이 있거나(쓰는 중 포함) · 핵심 질문을 다 답했을 때(studioChatComplete).
   * coach.ready(첫 답만 와도 켜짐)로 보지 않는다 — 칩 ✓ · 휴대폰 탭 ✓ · 부제 · 질문 수 묻기 · 오른쪽 탭 잠김이 모두 이 값을 쓴다.
   * 사업 방향을 정리하는 동안은 핵심 질문을 다 답했어도 아직 대화 단계다(대화 칸의 '정리하고 있어요'와 칩 · 부제가 같게).
   */
  const hubState = useMemo(() => (plan ? businessHubState(plan) : null), [plan]);
  const designRunning = !hubState?.coach?.design && (chatDesign !== null || !!intake?.designRunning);
  const chatComplete = !!plan && studioChatComplete({ design: !!hubState?.coach?.design, documents: hubState?.documents.length ?? 0, running: generationRunning, coreComplete: intake?.complete, designRunning });
  const steps = useMemo(() => {
    if (!plan) return null;
    /* 작성 중이면 이 기기 저장본에 작업 번호가 아직 없어도 대화는 끝났고 계획서는 진행 중이다 */
    return studioSteps(journeySteps(plan, homepage, generationRunning ? "running" : generationStalled ? generation?.runStatus : null), chatComplete, generationRunning);
  }, [plan, homepage, chatComplete, generationRunning, generationStalled, generation?.runStatus]);
  const chatDone = steps?.find(step => step.id === "chat")?.state === "done";
  /* 질문은 끝났는데 사업안이 아직 없다 — 사업 방향을 정리하는 중인지 계속 물어 머리줄이 '정리됨'을 미리 말하지 않게 */
  const designPending = chatDone && !!hubState?.coach && !hubState.coach.design && !hubState.documents.length && !generationRunning;
  const watchIntake = !chatDone || designPending;
  useEffect(() => {
    if (!planId || !ready || !watchIntake || !intakeV2) return;
    let alive = true, timer = 0;
    const load = async () => {
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch(`/api/plan/chat?planId=${encodeURIComponent(planId)}`, { cache: "no-store", headers: { "x-business-intake": "2" } });
          const data = response.ok ? await response.json() as { plan?: IntakeSnapshot | null } : null;
          const snapshot = data?.plan;
          if (alive && snapshot && typeof snapshot.coreAnswered === "number" && typeof snapshot.coreTotal === "number") {
            const job = snapshot.intake?.job;
            const next = { answered: snapshot.coreAnswered, total: snapshot.coreTotal, complete: snapshot.coreComplete === true, designRunning: job?.kind === "design" && (job.status === "queued" || job.status === "running") };
            setIntake(current => current && current.answered === next.answered && current.total === next.total && current.complete === next.complete && current.designRunning === next.designRunning ? current : next);
            setIntakeSnapshot(current => current && current.updatedAt === snapshot.updatedAt && current.coreAnswered === snapshot.coreAnswered ? current : snapshot);
          }
        } catch { /* 다음 차례에 다시 묻는다 */ }
      }
      if (alive) timer = window.setTimeout(load, INTAKE_POLL_MS);
    };
    void load();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [planId, ready, watchIntake, intakeV2, intakeTick]);

  const locks = useMemo(() => {
    const result: Partial<Record<StudioTab, Lock | null>> = {};
    for (const id of RIGHT_TABS) result[id] = lockFor(id, plan, steps, chatComplete, pending);
    return result;
  }, [plan, steps, chatComplete, pending]);
  /*
   * 대화만 할 때 — 사업 방향을 정하기 전에는 오른쪽 칸이 모두 막혀 있는데 위에 네 칸 탭이 다 보여 헷갈렸다(대표 요청 2026-10-24).
   * 이때는 탭 줄을 숨기고 대화만 보인다(PC 는 오른쪽에 지금까지 정한 내용만). 방향이 정해져 칸이 하나라도 열리면 탭이 나타난다.
   */
  const chatOnly = !isSamplePlan(planId) && !chatComplete && RIGHT_TABS.every(id => !!locks[id]);
  /* 대화 없이 만든 사업 — 서버에 대화 기록(coach)이 없다. 대화 칸은 '찾지 못했어요' 대신 읽기 전용 안내(오른쪽 칸은 그대로 열린다) */
  const noChat = !!plan && !isSamplePlan(planId) && !pending && !readCoach(plan.answers);
  /* 막힌 탭을 보고 있으면 서버 것을 다시 확인한다(대화로 방향을 정한 직후 등) */
  const visibleRight: RightTab | null = wide || tab !== "chat" ? rightTab : null;
  const visibleLocked = !!(visibleRight && locks[visibleRight]);
  useEffect(() => { if (ready && visibleLocked) refreshPlan(); }, [ready, visibleLocked, visibleRight, refreshPlan]);

  /* 처음 보이는 칸만 만든다 — 한 번 만든 칸은 지우지 않는다(한 번에 한 칸씩 만들어져 사업 관리 칸 둘이 동시에 불러오지 않는다) */
  const [mounted, setMounted] = useState<RightTab[]>([]);
  if (ready && !missing && visibleRight && !locks[visibleRight] && !mounted.includes(visibleRight)) setMounted([...mounted, visibleRight]);

  const statusText = useMemo(() => {
    const launchState = plan ? readLaunch(plan) : null;
    const launchList = plan && launchState ? launchSteps(plan, launchState) : [];
    /* 로그인이 풀려 작성 진행을 묻지 못한다 — 진행이 멈춘 것처럼 보이지 않게 먼저 알린다(머리줄 '다시 로그인하기') */
    if (generationAuthLost) return "로그인이 풀렸어요 · 다시 로그인해 주세요";
    return studioStatusText({
      fresh: !plan && pending,
      loading: !plan && !ready,
      steps,
      intake,
      /* PC 는 대화 칸이 늘 보이고, 질문 중이면 그 맨 위 진행 줄이 번호를 보인다 */
      questionCount: wide,
      generation: generation ? { done: generation.done, total: generation.total, active: generation.active, stalled: generationStalled } : null,
      /* PC 는 대화 칸 작성 줄이, 휴대폰 계획서 탭은 진행 카드가 항목 수를 보인다 */
      generationCount: wide || tab === "plan",
      documents: hubState ? { done: hubState.documents.length, total: hubState.keys.length } : null,
      homepage,
      launch: launchState ? { configured: launchState.configured, total: launchList.length, done: launchList.filter(step => ["done", "skipped"].includes(launchStatus(launchState, step))).length } : null,
      operating,
      design: hubState?.coach ? !!hubState.coach.design : undefined,
      designRunning,
      stale: !!hubState?.stale,
      /* 보고 있는 칸 — PC 는 오른쪽 칸, 휴대폰은 지금 탭(대화 탭이면 전체 진행) */
      tab: wide ? rightTab : tab,
    });
  }, [plan, hubState, pending, ready, steps, intake, designRunning, generation, generationStalled, generationAuthLost, homepage, operating, wide, rightTab, tab]);
  /* 주소의 사업을 아직 못 불러왔으면(steps 없음, 새 대화 아님) 진행 단계를 그리지 않는다 — 다 끝난 사업이 잠깐 '대화(지금 단계)'로 보였다 */
  const chips = useMemo(() => (steps || pending ? studioChips(steps, operating) : []), [steps, pending, operating]);
  const chipFor = (step: StudioChip["step"]) => chips.find(chip => chip.step === step);

  /* ── 숨은 칸의 새 소식 점 · 칸 단추(머리줄) ───────────── */
  const visibleTabs = useMemo<StudioTab[]>(() => (wide ? ["chat", rightTab] : [tab]), [wide, rightTab, tab]);
  const visibleRef = useRef(visibleTabs);
  useEffect(() => { visibleRef.current = visibleTabs; }, [visibleTabs]);
  const [unread, setUnread] = useState<StudioTab[]>([]);
  /* 보이게 된 칸의 점은 지운다(그리는 중에 맞추기 — 효과에서 지우면 한 번 더 그려진다) */
  if (unread.some(item => visibleTabs.includes(item))) setUnread(unread.filter(item => !visibleTabs.includes(item)));
  /* 대화 칸은 답을 저장할 때마다 보이는 채로도 부른다(질문 수를 바로 다시 묻기) — 보이는 칸에는 점을 찍지 않는다 */
  const markActivity = useCallback((target: StudioTab) => {
    if (target === "chat") setIntakeTick(value => value + 1);
    else bumpRefresh(target);
    if (target === "plan") { setGenerationWanted(true); restartGenerationRef.current(); }
    if (visibleRef.current.includes(target)) return;
    setUnread(list => (list.includes(target) ? list : [...list, target]));
  }, [bumpRefresh]);
  const showTab = useCallback((next: StudioTab) => {
    /* 주소의 다른 값(edit · start 등)은 그대로 두고 탭만 바꾼다 — 칸이 요청한 것이라 초점은 옮기지 않는다 */
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== next) {
      url.searchParams.set("tab", next);
      seenUrlTab.current = next;
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    if (next === "plan") { setGenerationWanted(true); restartGenerationRef.current(); }
    if (next !== "chat") bumpRefresh(next);
    tabSource.current = "auto";
    setTab(next);
    window.dispatchEvent(new Event(WORKSPACE_TAB_EVENT));
  }, [bumpRefresh]);
  /*
   * 단계별 대화 세트(guide=, journey-guides.ts) — 말풍선은 대화 칸에 있다. 휴대폰은 한 칸씩 보여서, 바깥에서 guide 주소로 들어오면
   * 대화 탭부터 연다(주소의 탭은 오른쪽 칸으로 기억해 둔다 — 말풍선의 첫 단추가 그 탭으로 간다). 작업실 안의 링크로 실려 오면 탭은
   * 링크대로 두고 대화 탭에 새 소식 점만 찍는다. 예시 사업 · 대화 없는 사업은 대화 칸 대신 안내에 같은 말풍선을 보인다(저장 없음).
   */
  const urlGuide = readJourneyGuide(searchParams.get(GUIDE_PARAM));
  const [arrivalGuide] = useState(urlGuide);
  useEffect(() => {
    if (arrivalGuide && !readWide()) showTab("chat");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 들어올 때 한 번만
  }, []);
  const seenGuide = useRef(urlGuide);
  useEffect(() => {
    if (seenGuide.current === urlGuide) return;
    seenGuide.current = urlGuide;
    if (urlGuide) markActivity("chat");
  }, [urlGuide, markActivity]);
  const [noteGuide, setNoteGuide] = useState(urlGuide);
  if (urlGuide && urlGuide !== noteGuide) setNoteGuide(urlGuide);
  /* 칸 단추 — 칸마다 하나씩 보관하고 보이는 칸의 것만 머리줄에 그린다. 같은 것을 다시 주면 무시한다(칸이 단추를 memo 한다) */
  const [headerNodes, setHeaderNodes] = useState<Partial<Record<StudioTab, ReactNode>>>({});
  const setHeaderActions = useCallback((target: StudioTab, node: ReactNode | null) => {
    setHeaderNodes(current => {
      const next = node ?? null;
      if ((current[target] ?? null) === next) return current;
      const copy = { ...current };
      if (next === null) delete copy[target]; else copy[target] = next;
      return copy;
    });
  }, []);

  /* 가운데 알약(PC 머리줄) — 칸 단추와 같은 방식. 휴대폰에서는 통로를 주지 않아(nav.setHeaderCenter 없음) 칸이 자기 안에 그린다 */
  const [centerNodes, setCenterNodes] = useState<Partial<Record<StudioTab, ReactNode>>>({});
  const setHeaderCenter = useCallback((target: StudioTab, node: ReactNode | null) => {
    setCenterNodes(current => {
      const next = node ?? null;
      if ((current[target] ?? null) === next) return current;
      const copy = { ...current };
      if (next === null) delete copy[target]; else copy[target] = next;
      return copy;
    });
  }, []);

  /*
   * ── 3단계: 대화로 고치기 — 오른쪽 칸의 고치기 처리기 보관함 · 대화 입력창 열기 ──
   * 처리기는 칸이 처음 그려질 때 등록하고 칸이 사라지면 내린다(늦게 내린 앞 처리기가 새 처리기를 지우지 않게 같은 것일 때만).
   * 상태가 아니라 ref 로 둔다 — 등록할 때마다 작업실 전체를 다시 그리지 않고, 대화 칸은 보낼 때 editHandler 로 그때그때 찾는다.
   */
  const editHandlers = useRef(new Map<StudioEditTarget, StudioEditHandler>());
  const registerEditHandler = useCallback((target: StudioEditTarget, handler: StudioEditHandler) => {
    editHandlers.current.set(target, handler);
    return () => { if (editHandlers.current.get(target) === handler) editHandlers.current.delete(target); };
  }, []);
  const editHandler = useCallback((target: StudioEditTarget) => editHandlers.current.get(target) ?? null, []);
  /* 대화 칸이 등록한 받는 곳 — 대화 칸은 늘 있지만 첫 그리기 전에 온 요청은 하나만 보관했다가 넘긴다 */
  const composeListener = useRef<((request: StudioComposeRequest) => void) | null>(null);
  const pendingCompose = useRef<StudioComposeRequest | null>(null);
  const onComposeRequest = useCallback((listener: (request: StudioComposeRequest) => void) => {
    composeListener.current = listener;
    const waiting = pendingCompose.current;
    pendingCompose.current = null;
    if (waiting) listener(waiting);
    return () => { if (composeListener.current === listener) composeListener.current = null; };
  }, []);
  const composeInChat = useCallback((request: StudioComposeRequest) => {
    /* 휴대폰은 한 칸씩 보이므로 대화 탭으로 — PC 는 대화 칸이 늘 보인다(접어 두었으면 편다) */
    if (!readWide()) showTab("chat");
    else setChatCollapsed(false);
    if (composeListener.current) composeListener.current(request);
    else pendingCompose.current = request;
  }, [showTab]);

  /*
   * 계획서 칸 → 대화 칸: 열린 채팅 수정 제안이 닿는 장 이름(PC). 상태가 아니라 ref + 알림으로 둔다 — 바뀔 때 작업실 전체가 아니라
   * 그 값을 읽는 대화 칸 카드만 다시 그린다. 같은 값이 다시 오면 알리지 않는다.
   */
  const editPreview = useRef<StudioEditPreviewChapters | null>(null);
  const editPreviewListeners = useRef(new Set<() => void>());
  const setEditPreviewChapters = useCallback((preview: StudioEditPreviewChapters | null) => {
    const next = preview?.chapters.length ? preview : null;
    const prev = editPreview.current;
    if (prev === next || (prev && next && prev.jobId === next.jobId && prev.chapters.join("\n") === next.chapters.join("\n"))) return;
    editPreview.current = next;
    editPreviewListeners.current.forEach(listener => listener());
  }, []);
  const subscribeEditPreviewChapters = useCallback((listener: () => void) => {
    editPreviewListeners.current.add(listener);
    return () => { editPreviewListeners.current.delete(listener); };
  }, []);
  const editPreviewChapters = useCallback(() => editPreview.current, []);
  /* 계획서 칸 → 대화 칸: 대화로 고칠 수 있는 장 목록(PC '고칠 곳 고르기'). 위와 같이 ref + 알림 — 같은 목록이면 알리지 않는다 */
  const editChapters = useRef<StudioComposeRequest[] | null>(null);
  const editChapterListeners = useRef(new Set<() => void>());
  const setEditChapterList = useCallback((list: StudioComposeRequest[] | null) => {
    const next = list?.length ? list : null;
    const key = (value: StudioComposeRequest[] | null) => (value ?? []).map(item => `${item.label}\u0000${item.sectionId ?? ""}`).join("\u0001");
    if (key(editChapters.current) === key(next)) return;
    editChapters.current = next;
    editChapterListeners.current.forEach(listener => listener());
  }, []);
  const subscribeEditChapterList = useCallback((listener: () => void) => {
    editChapterListeners.current.add(listener);
    return () => { editChapterListeners.current.delete(listener); };
  }, []);
  const editChapterList = useCallback(() => editChapters.current, []);

  /* ── 깔때기 — 작업실을 열었다 · 다른 탭을 봤다(측정만, 실패해도 조용히) ── */
  const opened = useRef(false);
  useEffect(() => {
    if (!intakeV2 || opened.current) return;
    opened.current = true;
    trackFunnel("studio_open", { tab, entry: planId ? "business" : "new", layout: window.matchMedia(WIDE_QUERY).matches ? "wide" : "narrow" });
    /* 처음 한 번만 — 주소에서 사업을 이어 받아도(새 대화 → 사업) 다시 보내지 않는다(그래서 tab · planId 는 기다리지 않는다) */
  }, [intakeV2]); // eslint-disable-line react-hooks/exhaustive-deps
  const seenTab = useRef(tab);
  useEffect(() => {
    if (seenTab.current === tab) return;
    seenTab.current = tab;
    trackFunnel("studio_tab_view", { tab, source: tabSource.current, layout: window.matchMedia(WIDE_QUERY).matches ? "wide" : "narrow" });
  }, [tab]);

  /* ── 저장 안 한 수정과 이동 ───────────────────────────── */
  const dirty = useRef(new Map<string, string | undefined>());
  const confirmLeave = useCallback(async () => {
    if (!dirty.current.size) return true;
    const message = [...dirty.current.values()].find(Boolean) ?? LEAVE_MESSAGE;
    const ok = await askConfirm({ message, confirmLabel: "나가기", cancelLabel: "계속 고치기" });
    if (ok) dirty.current.clear();
    return ok;
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (!dirty.current.size) return; event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  /*
   * 같은 사업을 두 창에서 열어 두면 한 창에서 고친 것이 다른 창에 안 보였다(점검 2026-10-23) — 이 창으로 돌아오면(포커스 · 보이기)
   * 머리줄 상태와 대화 질문 수를 한 번 다시 묻고, 보이는 오른쪽 칸에 새로 읽기 번호를 올린다(5초에 한 번까지).
   * 저장 안 한 수정이 있는 칸은 건드리지 않는다(고치던 내용을 서버 것으로 덮지 않게).
   */
  const lastWake = useRef(0);
  useEffect(() => {
    if (!planId || !ready || !intakeV2) return;
    /* 막 불러왔으니 곧바로 오는 포커스(창을 연 직후)에는 다시 묻지 않는다 */
    if (!lastWake.current) lastWake.current = Date.now();
    const wake = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastWake.current < WAKE_REFRESH_MS) return;
      lastWake.current = Date.now();
      refreshPlan();
      setIntakeTick(value => value + 1);
      for (const pane of visibleRef.current) {
        if (pane === "chat" || dirty.current.has(PANE_DIRTY_ID[pane])) continue;
        bumpRefresh(pane);
      }
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => { document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); };
  }, [planId, ready, intakeV2, refreshPlan, bumpRefresh]);
  const openTarget = useCallback((target: StudioTarget) => {
    selectTab(target.tab, { focus: "heading", link: { params: target.params, hash: target.hash } });
  }, [selectTab]);
  const nav = useMemo<StudioNav>(() => {
    const go = (href: string, mode: "push" | "replace") => {
      const target = studioTarget(href, planId, window.location.origin);
      if (target) { openTarget(target); return; }
      /* 다른 사업 · 새 대화의 예전 주소는 예전 화면을 거치지 않고 바로 작업실로 */
      const destination = (STUDIO_REDIRECT && studioRedirectHref(href, window.location.origin)) || href;
      void confirmLeave().then(ok => { if (ok) (mode === "push" ? router.push(destination) : router.replace(destination)); });
    };
    return {
      push: href => go(href, "push"),
      replace: href => go(href, "replace"),
      setDirty: (id, isDirty, message) => {
        if (isDirty) dirty.current.set(id, message);
        else dirty.current.delete(id);
      },
      setHeaderActions,
      setHeaderCenter: wide ? setHeaderCenter : undefined,
      markActivity,
      showTab,
      setDesignRunning,
      registerEditHandler,
      editHandler,
      composeInChat,
      onComposeRequest,
      setEditPreviewChapters: wide ? setEditPreviewChapters : undefined,
      subscribeEditPreviewChapters: wide ? subscribeEditPreviewChapters : undefined,
      editPreviewChapters: wide ? editPreviewChapters : undefined,
      setEditChapterList: wide ? setEditChapterList : undefined,
      subscribeEditChapterList: wide ? subscribeEditChapterList : undefined,
      editChapterList: wide ? editChapterList : undefined,
      /* 내려받기 · 한 장 요약은 위 막대(PC) · 아래 막대(휴대폰)가 그린다 — 칸은 같은 단추를 머리줄에 또 올리지 않는다 */
      toolbarTools: true,
      /* 계획서의 장 고르기는 칸 맨 위 줄에 — 위 막대 가운데는 홈페이지 기기 전환 자리다(시안) */
      headerCenterFor: target => target !== "plan",
    };
  }, [planId, openTarget, confirmLeave, router, setHeaderActions, wide, setHeaderCenter, markActivity, showTab, setDesignRunning, registerEditHandler, editHandler, composeInChat, onComposeRequest, setEditPreviewChapters, subscribeEditPreviewChapters, editPreviewChapters, setEditChapterList, subscribeEditChapterList, editChapterList]);

  /*
   * 이 사업의 다른 화면으로 가는 링크는 이동 대신 탭 바꾸기 — 대화·계획서 안의 고정 링크를 하나하나 고치지 않아도 된다.
   * 캡처 단계에서 기본 동작을 막으면 Next 의 Link 는 이동하지 않는다. 작업실 밖으로 나가는 링크(뒤로·서랍·내 사업)는
   * 저장 안 한 수정이 있으면 한 번만 묻는다. 다른 사업 · 새 대화의 예전 주소는 바로 작업실로(예전 화면을 거쳐 다시 보내지 않게).
   */
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
    let url: URL;
    try { url = new URL(anchor.href, window.location.href); } catch { return; }
    if (url.origin !== window.location.origin) return;
    const here = window.location;
    /* 같은 화면 안의 # 이동(목차 등)은 그대로 */
    if (url.pathname === here.pathname && url.search === here.search && url.hash) return;
    const target = studioTarget(url.href, planId, here.origin);
    if (target) { event.preventDefault(); openTarget(target); return; }
    const redirect = STUDIO_REDIRECT ? studioRedirectHref(url.href, here.origin) : null;
    if (!redirect && !dirty.current.size) return;
    event.preventDefault();
    const href = redirect ?? `${url.pathname}${url.search}${url.hash}`;
    void confirmLeave().then(ok => { if (ok) router.push(href); });
  };

  /* ── 페이지 고르기(예전 탭 줄) ───────────────────────── */
  /* 위 막대 페이지 선택(PC) · 아래 막대 … 메뉴(휴대폰)에서 고른다. 막힌 페이지도 고를 수 있다 — 칸이 잠김 안내(또는 PC 대화 중이면 지금까지 정한 내용)를 보인다 */
  const pickPage = useCallback((id: RightTab) => selectTab(id, { focus: "heading" }), [selectTab]);

  /*
   * 브라우저 탭 제목 — '사업명 · 보는 칸 | 오늘창업'(layout 의 '사업 작업실 | 오늘창업'은 사업을 부르기 전까지만). 창을 여럿 열어도 구분된다.
   * PC 는 오른쪽 칸, 휴대폰은 지금 탭. 새 대화 · 못 찾음 · 로그인이 풀림은 칸 이름 없이.
   */
  /* 이름을 정하기 전 제목은 첫 답 문장 그대로라(머리줄에 '…가게를 하…'로 잘림) 업종 이름이나 '새 사업'을 잠깐 보여 준다(r37 휴대폰 점검) */
  const shownCoach = intakeSnapshot?.coach ?? (plan ? readCoach(plan.answers) : null);
  const draftTitle = provisionalTitle(title || plan?.title || "", shownCoach, intakeSnapshot?.ksic?.name);
  /* 대표 결정 r41: '이미 사업 중이에요'로 시작한 대화의 임시 이름은 '내 사업 개선', 이름이 빈 사업은 '이름 없는 사업'(표시만) */
  const operatingDraft = shownCoach?.stage === "operating";
  const shownTitle = plan ? businessDisplayName(draftTitle, { operating: operatingDraft }) : draftBusinessTitle(draftTitle, operatingDraft);
  const pageName = sampleTitle(planId, shownTitle);
  const pageTab = STUDIO_TAB_LABELS[wide ? rightTab : tab];
  useEffect(() => {
    if (!intakeV2) return;
    const name = missing ? (signedOut ? "로그인이 풀렸어요" : "사업을 찾지 못했어요") : pageName ? `${pageName} · ${pageTab}` : fresh && newIntent ? "새 대화" : "";
    if (name) document.title = `${name} | 오늘창업`;
  }, [intakeV2, missing, signedOut, pageName, pageTab, fresh, newIntent]);

  /* 휴대폰 아래 막대의 마이크 — 대화 화면으로 돌아가 말로 적기를 켠다(브라우저가 지원할 때만 단추가 있다) */
  const dictation = useDictation(() => {});

  if (!intakeV2) return <StudioLoading />;

  /* PC 는 대화 열과 미리보기 판이 늘 함께(대화 열을 접으면 판만), 휴대폰은 대화 화면 ↔ 미리보기 화면 */
  const chatVisible = (wide && !chatCollapsed) || (!wide && (tab === "chat" || chatOnly));
  const rightVisible = wide || (tab !== "chat" && !chatOnly);
  /* 예시 사업 이름은 목록용 꼬리표 '샘플 · '로 저장돼 있다 — 화면에서는 다른 곳과 같게 '예시 · '로 부른다 */
  const businessTitle = sampleTitle(planId, shownTitle || (fresh && newIntent ? "새 대화" : "사업 작업실"));
  const headingRef = (id: StudioTab) => (node: HTMLHeadingElement | null) => { headings.current[id] = node; };
  const isVisible = (id: StudioTab) => (id === "chat" ? chatVisible : rightVisible && rightTab === id);

  const rightBody = (id: RightTab): ReactNode => {
    const lock = locks[id];
    if (!ready && !(fresh && lock)) return <PlanLoading variant="compact" note="사업을 불러오고 있어요" />;
    if (!mounted.includes(id)) {
      /* PC 에서 대화가 끝나기 전 — 대화는 바로 왼쪽에 있으니 '대화로 가기' 대신 지금까지 답한 내용을 보여 준다 */
      if (lock && wide && !chatComplete) return <StudioIntakeSummary snapshot={plan ? intakeSnapshot : null} />;
      if (lock) return <div className={styles.locked}>
        <p>{lock.message}</p>
        <AppButton variant="primary" onClick={() => selectTab(lock.back, { focus: "heading" })}>{lock.label}</AppButton>
      </div>;
      return null;
    }
    if (id === "plan") return <PlanDocumentBody />;
    if (id === "homepage") return <HomepageScreen />;
    return <BusinessWorkspace view={id} />;
  };

  /* 칸 단추 — 그 칸의 작업실 정보(useStudioPane)를 그대로 받게 감싼다(위 막대는 칸 밖이다) */
  const headerSlot = (id: StudioTab) => {
    const node = headerNodes[id];
    if (!node || !isVisible(id)) return null;
    return <StudioPaneContext.Provider key={id} value={{ planId, tab: id, active: true, nav: navSeq[id] ?? 0, refresh: refreshSeq[id] ?? 0 }}><div className={styles.headerSlot}>{node}</div></StudioPaneContext.Provider>;
  };
  /* 가운데 알약(PC) — 보이는 오른쪽 칸이 올린 것만(홈페이지: 첫 화면 · 휴대폰/컴퓨터). 없으면 아무것도 그리지 않는다 */
  const centerSlot = (id: StudioTab) => {
    const node = centerNodes[id];
    if (!node || !isVisible(id)) return null;
    return <StudioPaneContext.Provider key={id} value={{ planId, tab: id, active: true, nav: navSeq[id] ?? 0, refresh: refreshSeq[id] ?? 0 }}>{node}</StudioPaneContext.Provider>;
  };

  /* 작성 진행을 묻다 로그인이 풀렸으면(401) 다시 로그인하는 단추 — 로그인 팝업이 끝나면 지금 화면으로 돌아온다 */
  const relogin = generationAuthLost && !missing ? <AppButton key="relogin" variant="primary" size="small" className={styles.relogin} onClick={() => openLogin()}>다시 로그인하기</AppButton> : null;
  /* 페이지 선택의 ✓ — 그 단계가 끝났을 때. 유지보수는 끝나는 단계가 아니라 없다 */
  const tabDone = (item: RightTab) => item !== "operations" && chipFor(item === "plan" ? "document" : item)?.state === "done";
  const tabCurrent = (item: RightTab) => item !== "operations" && chipFor(item === "plan" ? "document" : item)?.state === "current";
  /* 지금 하는 일 옆 점 — 대화 · 정리 · 작성처럼 지금 움직이는 일이 있으면 은은하게 번진다 */
  const live = !missing && (!chatDone || designRunning || generationRunning);
  const pageOptions: PageOption[] = RIGHT_TABS.map(id => ({
    id,
    label: id === "launch" && plan ? launchLabel(plan) : STUDIO_TAB_LABELS[id],
    done: tabDone(id),
    current: tabCurrent(id),
    locked: locks[id]?.message ?? null,
    unread: unread.includes(id) && rightTab !== id,
  }));
  const anyUnread = RIGHT_TABS.some(id => unread.includes(id));

  /* ── 미리보기 도구(위 막대 · 아래 막대 … 메뉴가 같이 쓴다) ── */
  const planTools = !missing && !locks.plan && (hubState?.documents.length ?? 0) > 0;
  /* 계획서 도구는 계획서 페이지를 보이게 한 뒤 칸에 명령을 보낸다(칸이 아직 없으면 생기는 순간 받는다) */
  const runPlan = (command: StudioCommand) => {
    if (rightTab !== "plan" || !rightVisible) selectTab("plan");
    sendStudioCommand(command);
  };
  const refreshView = () => {
    void refreshPlan();
    setIntakeTick(value => value + 1);
    if (!dirty.current.has(PANE_DIRTY_ID[rightTab])) bumpRefresh(rightTab);
  };
  const publicUrl = homepageInfo.publicPath ?? "";
  const openHref = rightTab === "homepage" && publicUrl ? publicUrl : planId ? studioHref(planId, rightTab) : "";
  const share = async () => {
    if (!publicUrl) return;
    const url = new URL(publicUrl, window.location.origin).href;
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title: businessTitle, url }); return; } catch (error) { if ((error as Error)?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); void showNotice("홈페이지 주소를 복사했어요.", { title: "주소 복사" }); }
    catch { void showCopyText(url); }
  };
  const shareTitle = publicUrl ? "홈페이지 주소 나누기" : "홈페이지를 공개하면 주소를 나눌 수 있어요";
  const toolItems: PopMenuItem[] = [
    /* 휴대폰 홈페이지 — 칸 위 '저장 · 공개하기' 줄을 접었으니 저장은 여기서(공개하기는 아래 막대 파란 단추) */
    ...(!wide && rightTab === "homepage" && !locks.homepage ? [{ key: "save", label: "홈페이지 저장", icon: <Save />, onSelect: () => sendStudioCommand("homepage-save") }] : []),
    { key: "download", label: "사업계획서 내려받기", icon: <Download />, disabled: !planTools, title: planTools ? undefined : "계획서를 쓰면 내려받을 수 있어요", onSelect: () => runPlan("plan-download") },
    { key: "summary", label: "한 장 요약", icon: <FileText />, disabled: !planTools, title: planTools ? undefined : "계획서를 쓰면 볼 수 있어요", onSelect: () => runPlan("plan-summary") },
    { key: "records", label: "실적과 개선 기록", icon: <ClipboardList />, disabled: !!locks.operations, title: locks.operations?.message, onSelect: () => pickPage("operations") },
    { key: "refresh", label: "새로고침", icon: <RotateCw />, disabled: !planId, onSelect: refreshView },
    ...(openHref ? [{ key: "open", label: "새 창에서 열기", icon: <ExternalLink />, href: openHref, external: true }] : []),
    { key: "share", label: "홈페이지 주소 나누기", icon: <Share2 />, disabled: !publicUrl, title: publicUrl ? undefined : shareTitle, onSelect: () => void share() },
  ];

  /*
   * PC 위 막대(48px, 시안 PcStudio) — 왼쪽은 대화 열 폭(451): 사업명 ▾ · 기록 · 패널 접기.
   * 오른쪽은 미리보기 판의 막대: '미리보기' 알약 · 내려받기/요약/기록 · 가운데 기기 전환(홈페이지) · 새로고침 · 페이지 선택(260) · 새 창 · 칸 단추 · 공유 원.
   */
  const pcBar = (menu: ChromeMenu) => <header className={styles.topBar} data-collapsed={chatCollapsed || undefined} data-missing={missing || undefined}>
    <div className={styles.chatHead}>
      {!railOpen && menu.button(styles.tool, 18)}
      <BizMenu planId={planId} title={businessTitle} canRename={!!plan && !isSamplePlan(planId) && !missing} onRenamed={setTitle} className={styles.bizName}
        label={<><h1 className={styles.bizTitle}>{businessTitle}</h1><ChevronDown aria-hidden="true" /></>} />
      <span className={styles.grow} />
      {headerSlot("chat")}
      {!chatCollapsed && <ToolButton label="지금까지 답한 기록 보기" icon={<History aria-hidden="true" />} disabled={!plan || missing || isSamplePlan(planId) || noChat} onClick={() => sendStudioCommand("chat-summary")} />}
      <ToolButton label={chatCollapsed ? "대화 열 펴기" : "대화 열 접기"} pressed={chatCollapsed} icon={chatCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />} onClick={() => setChatCollapsed(value => !value)} />
    </div>
    {!missing && <div className={styles.toolbar}>
      <span className={styles.previewPill}><Monitor aria-hidden="true" />미리보기</span>
      <ToolButton label="사업계획서 내려받기" title={planTools ? "사업계획서 내려받기" : "계획서를 쓰면 내려받을 수 있어요"} icon={<Download aria-hidden="true" />} disabled={!planTools} onClick={() => runPlan("plan-download")} />
      <ToolButton label="한 장 요약 보기" title={planTools ? "한 장 요약" : "계획서를 쓰면 볼 수 있어요"} icon={<FileText aria-hidden="true" />} disabled={!planTools} onClick={() => runPlan("plan-summary")} />
      <ToolButton label="실적과 개선 기록 보기" title={locks.operations?.message ?? "실적과 개선 기록"} icon={<ClipboardList aria-hidden="true" />} disabled={!!locks.operations} pressed={rightTab === "operations"} onClick={() => pickPage("operations")} />
      <span className={styles.grow} />
      <div className={styles.toolCenter}>
        {!chatOnly && centerSlot(rightTab)}
        <ToolButton label="새로고침" title="최신 내용 다시 불러오기" icon={<RotateCw aria-hidden="true" />} disabled={!planId} onClick={refreshView} />
        <PageSelect options={pageOptions} value={rightTab} status={statusText || undefined} live={live} onSelect={pickPage} className={styles.pageSelect} />
        {openHref ? <a className={styles.tool} href={openHref} target="_blank" rel="noreferrer" aria-label="새 창에서 열기" title={rightTab === "homepage" && publicUrl ? "공개한 홈페이지 새 창으로 보기" : "이 화면을 새 창에서 열기"}><ExternalLink aria-hidden="true" /></a>
          : <ToolButton label="새 창에서 열기" title="사업이 생기면 열 수 있어요" icon={<ExternalLink aria-hidden="true" />} disabled onClick={() => {}} />}
      </div>
      <span className={styles.grow} />
      <div className={styles.tbActs}>
        {relogin}
        {!chatOnly && headerSlot(rightTab)}
        <ToolButton className={styles.shareRound} label={shareTitle} icon={<Share2 aria-hidden="true" />} disabled={!publicUrl} onClick={() => void share()} />
      </div>
    </div>}
  </header>;

  /*
   * 휴대폰 대화 화면 머리(56px, 시안 MChat) — ✕(44 원, 첫 화면으로) · 사업명 알약 44 ▾(사업 전환 · 이름 바꾸기) · ›(44 원, 미리보기로).
   * 미리보기 화면은 머리 없이 전체 화면 + 아래 100px 막대.
   */
  const mobileHead = chatVisible ? <header className={styles.mHead}>
    <Link className={styles.round44} href="/plan" aria-label="첫 화면으로" title="첫 화면으로"><X aria-hidden="true" /></Link>
    <BizMenu planId={planId} title={businessTitle} canRename={!!plan && !isSamplePlan(planId) && !missing} onRenamed={setTitle} className={styles.namePill} align="center"
      label={<><h1 className={styles.bizTitle}>{businessTitle}</h1><ChevronDown aria-hidden="true" /></>} />
    <button type="button" className={styles.round44} aria-label={`미리보기 보기${anyUnread ? " (새 소식)" : ""}`} title={chatOnly ? "대화를 마치면 열려요" : "미리보기 보기"} disabled={chatOnly || missing} onClick={() => selectTab(lastRight, { focus: "heading" })}>
      <ChevronRight aria-hidden="true" />{anyUnread && <i className={styles.dot} aria-hidden="true" />}
    </button>
  </header> : null;

  /* 휴대폰 미리보기 아래 68px 막대(lovable 실측) — ‹ 대화 알약 36 · 마이크 36 원 · … 36 원(페이지 바꾸기 · 내려받기 · 요약 등) · 파랑 주 단추 36 */
  const primary = PRIMARY[rightTab];
  const bottomBar = !wide && rightVisible && !missing ? <nav className={styles.bottomBar} aria-label="미리보기 도구">
    <button type="button" className={styles.backPill} onClick={() => selectTab("chat", { focus: "heading" })}><ChevronLeft aria-hidden="true" />대화{unread.includes("chat") && <i className={styles.dot} aria-hidden="true" />}</button>
    <span className={styles.grow} />
    {dictation.supported && <button type="button" className={styles.round48} aria-label="말로 요청하기" title="말로 요청하기" onClick={() => { selectTab("chat"); sendStudioCommand("chat-dictate"); }}><Mic aria-hidden="true" /></button>}
    <PopMenu placement="above" align="end" buttonClassName={styles.round48} buttonLabel={`더 보기 — 페이지 바꾸기 · 내려받기 · 요약${anyUnread ? " (새 소식)" : ""}`} buttonTitle="더 보기" menuLabel="미리보기 메뉴"
      label={<><MoreHorizontal aria-hidden="true" />{RIGHT_TABS.some(id => unread.includes(id) && id !== rightTab) && <i className={styles.dot} aria-hidden="true" />}</>}
      groups={[
        { key: "pages", heading: "페이지", items: pageOptions.map(item => ({ key: item.id, label: item.label, current: item.id === rightTab, title: item.locked ?? undefined, ariaLabel: `${item.label}${item.done ? " (완료)" : ""}${item.locked ? ` (${item.locked})` : ""}${item.unread ? " (새 소식)" : ""}`, onSelect: () => pickPage(item.id) })) },
        { key: "tools", heading: "도구", items: toolItems },
      ]} />
    <button type="button" className={styles.primary48} disabled={!!locks[rightTab]} title={locks[rightTab]?.message} onClick={() => sendStudioCommand(primary.command)}>{primary.label}</button>
  </nav> : null;

  /* 예시 사업 · 대화 없는 사업의 대화 칸 안내 아래 — 대화 칸(BusinessIntake)이 없어 여기서 같은 말풍선을 그린다 */
  const noteGuideTurn = noteGuide && plan && plan.id === planId ? <div className={styles.noteGuide}><JourneyGuideTurn guide={journeyGuide(noteGuide, planId, journeyGuideContext(plan))} /></div> : null;

  return <StudioNavContext.Provider value={nav}>
    <main className={`${frame.page} ${styles.page}`} data-wide={wide || undefined} onClickCapture={onClickCapture}>
      <BusinessAppChrome title={businessTitle} subtitle={missing ? undefined : statusText} showRail={wide && railOpen} bare={wide} backHref="/plan" active={fresh ? "new" : "plans"} topBar={menu => (wide ? pcBar(menu) : mobileHead)}>
        {/* 로그인이 풀렸을 때(휴대폰) — 머리 아래 한 줄에 다시 로그인하기 */}
        {!wide && relogin && <div className={styles.reloginRow}>{relogin}</div>}
        {/* 주소의 사업을 찾지 못했으면 칸마다 따로 알리지 않고(왼쪽·오른쪽 두 번 보였다) 작업실에서 한 번만 */}
        {/* 로그인이 풀려 못 찾았으면 '다시 로그인하기'(팝업, 끝나면 이 주소로 돌아온다) — 사업이 사라진 게 아니다 */}
        {missing ? <div className={styles.missingNote}><div className={hub.content}>{signedOut
          ? <MissingBusinessBody title="로그인이 풀렸어요" detail="다시 로그인하면 이 사업을 이어서 볼 수 있어요." action={<AppButton type="button" variant="primary" className={hub.primary} onClick={() => openLogin()}>다시 로그인하기</AppButton>} />
          : <MissingBusinessBody />}</div></div> : <div className={styles.studio} data-wide={wide || undefined} data-collapsed={wide && chatCollapsed || undefined}>
          <Pane id="chat" planId={planId} visible={chatVisible} nav={navSeq.chat ?? 0} refresh={refreshSeq.chat ?? 0} className={styles.chatCol} headingRef={headingRef("chat")}>
            {/* PC 에서 오른쪽에 보이는 열린 칸 — 대화 칸이 '홈페이지를 대화로 고치기' 같은 제안을 고른다(막힌 칸이면 null) */}
            {/* 예시 사업은 서버에 대화가 없어 대화 칸이 '사업을 찾지 못했어요 · 내 사업으로'를 보였다(감사 2026-10-23) — 읽기 전용 안내와 새 대화 길로 */}
            {/* 대화 없이 만든 사업(예전 편집 화면 등)도 서버에 대화가 없어 '사업을 찾지 못했어요'가 보였다 — 오른쪽 칸은 그대로 쓰니 읽기 전용 안내만 */}
            {isSamplePlan(planId)
              ? <div className={styles.chatNote}><div className={hub.content}><section className={hub.empty}>
                <h2>예시 사업이에요</h2>
                <AppButton variant="primary" className={hub.primary} href={newChatHref()}><span className={styles.nowrap}>대화로 내 사업 시작하기</span><ChevronRight size={18} aria-hidden="true" /></AppButton>
              </section>{noteGuideTurn}</div></div>
              : noChat
                ? <div className={styles.chatNote}><div className={hub.content}><section className={hub.empty}>
                  <h2>대화 기록이 없는 사업이에요</h2>
                </section>{noteGuideTurn}</div></div>
                : <BusinessIntake onPrepared={refreshPlan} onDesignComplete={refreshPlan} studioSide={wide && !locks[rightTab] ? rightTab : null} />}
          </Pane>

          {/* 미리보기 판 — PC 는 r16 흰 판(대화 열 오른쪽), 휴대폰은 전체 화면 + 아래 100px 막대 */}
          <div className={styles.rightCol} data-visible={rightVisible || undefined} inert={!rightVisible}>
            <div className={styles.panes}>
              {RIGHT_TABS.map(id => <Pane key={id} id={id} planId={planId} visible={rightVisible && rightTab === id} nav={navSeq[id] ?? 0} refresh={refreshSeq[id] ?? 0} className={styles.pane} headingRef={headingRef(id)}>
                {rightBody(id)}
              </Pane>)}
            </div>
          </div>
          {bottomBar}
        </div>}
      </BusinessAppChrome>
    </main>
  </StudioNavContext.Provider>;
}

/*
 * 사업 이름이 아직 없을 때의 제목 — 서버는 첫 답(사업 설명)을 그대로(60자 넘으면 '…') 제목으로 둔다.
 * 사용자가 이름을 정했거나 사업 방향 정리로 이름이 생기면 그 이름을 그대로 쓴다.
 */
function provisionalTitle(title: string, coach: ReturnType<typeof readCoach>, ksicName?: string | null): string {
  if (!title || !coach || coach.design || coach.business.nameConfirmed) return title;
  const description = coach.business.description.trim();
  const fromDescription = !!description && (title === description || (title.endsWith("…") && description.startsWith(title.slice(0, -1).trimEnd())));
  if (!fromDescription) return title;
  const industry = coach.business.industry.trim();
  return ksicName?.trim() || (industry && !industry.startsWith("새로운 사업") ? industry : "") || "새 사업";
}

function sampleTitle(planId: string, title: string): string {
  return isSamplePlan(planId) ? title.replace(/^샘플(\s*·\s*)/, "예시$1") : title;
}

/* 운영 중인 사업은 4단계 이름이 '운영 개선'(journeySteps 와 같은 이름) */
function launchLabel(plan: Plan): string {
  return journeySteps(plan, null).find(step => step.id === "launch")?.label ?? STUDIO_TAB_LABELS.launch;
}

/** 칸 하나 — 칸 제목(낭독기용, 탭을 바꾸면 초점이 온다)과 이 칸의 작업실 정보(useStudioPane) */
function Pane({ id, planId, visible, nav, refresh, className, headingRef, children }: {
  id: StudioTab; planId: string; visible: boolean; nav: number; refresh: number; className: string;
  headingRef: (node: HTMLHeadingElement | null) => void; children: ReactNode;
}) {
  const value = useMemo<StudioPane>(() => ({ planId, tab: id, active: visible, nav, refresh }), [planId, id, visible, nav, refresh]);
  return <section className={className} id={`studio-panel-${id}`} aria-label={STUDIO_TAB_LABELS[id]} data-visible={visible || undefined} inert={!visible}>
    <h2 ref={headingRef} className={styles.paneHeading} tabIndex={-1}>{STUDIO_TAB_LABELS[id]}</h2>
    {/* 칸 본문 자리 — 이것만 칸 높이를 채운다(안의 아무 요소나 늘리면 단추·안내가 칸 높이만큼 늘어났다) */}
    <div className={styles.paneBody}><StudioPaneContext.Provider value={value}>{children}</StudioPaneContext.Provider></div>
  </section>;
}
