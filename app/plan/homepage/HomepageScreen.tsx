"use client";

import { announceHomepageStatus } from "../use-homepage";
import { appendixFromDraft } from "../../../components/public-appendix-preview";
import { apiMessage, fetchWithTimeout, isTimeoutError, koreanText, userErrorMessage } from "../../../lib/client/user-error";
import { loadAuthSession } from "../../../lib/client/auth-session";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LayoutTemplate, Maximize2, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import { LandingQuickEditor } from "../../../components/landing-quick-editor";
import { HomepageKitPanel, homepageMissingInfo, withBusinessName } from "../../../components/homepage-kit-panel";
import { BUSINESS_TEMPLATE_PROFILES } from "../../../lib/landing/brainwave/business-content";
import { LandingBlocksRenderer } from "../../../components/landing-blocks";
import { createLandingPageData } from "../../../lib/landing/page-data";
import { landingDraftFromPlan } from "../../../lib/landing/from-plan";
import { aiFillLanded, aiFillMark, needsAutoAiFill } from "../../../lib/landing/ai-fill-auto";
import { SAMPLE_DOCS } from "../../../lib/plan-builder/samples";
import { KO_SAMPLE, koTextsFor } from "../../../lib/landing/brainwave/ko";
import { landingSlugIssue, type LandingDraft, type LandingSiteRecord } from "../../../lib/landing/domain";
import { hydrateFromServer, activePlan, lastHydrationFailed, loadState, isSamplePlan, planOwnerEpoch, setActivePlan, subscribePlanOwnerChange } from "../../../lib/plan-builder/plan-store";
import { LANDING_LOGIN_REQUIRED, LANDING_LOGIN_MESSAGE, LandingSaveError, persistLandingDraft } from "../../../lib/landing/save-client";
import { hasUnpublishedEdits, isLiveUpToDate, landingDraftFingerprint } from "../../../lib/landing/save-contract";
import Link from "next/link";
import styles from "./page.module.css";
import { StatusBadge } from "../../../components/status-badge";
import PlanLoading, { Spinner } from "../PlanLoading";
import BusinessAppChrome from "../BusinessAppChrome";
import { MISSING_BUSINESS_DETAIL, MISSING_BUSINESS_TITLE } from "../../../lib/plan-builder/missing-business";
import { businessChatHref } from "../../../lib/plan-builder/business-hub";
import { homepageHref, journeyLabel, journeyNext, launchHref } from "../../../lib/plan-builder/journey";
import { readCoach } from "../../../lib/plan-builder/coach";
import { NextServicesCard } from "../../../components/next-services";
import frame from "../chat/page.module.css";
import { ArrowUpToLine, Check, ExternalLink, Globe, Link2, MessageSquare, Monitor, Pencil, Rocket, RotateCw, Save, Smartphone } from "lucide-react";
import { HOMEPAGE_PRODUCT_AMOUNT } from "../../../lib/payments/domain";
import { askConfirm } from "../../../components/confirm-dialog";
import { withRo } from "../../../lib/josa";
import { useDialogFocus } from "../../../components/use-dialog-focus";
import { useStudioCommand, useStudioDirty, useStudioHeaderActions, useStudioHeaderCenter, useStudioNav, useStudioPane, type StudioEditHandler } from "../studio/StudioContext";
import { nativePlatform } from "../../../lib/native-app";
import { loadBrainwavePage } from "../../../components/brainwave-page";
import { aiEditChanges, aiEditCostLine, aiEditErrorMessage, aiEditSummary, applyAiEditPatch, undoAiEditPatch } from "../../../lib/landing/ai-edit-proposal";
import paneHeader from "../workspace/PaneHeaderActions.module.css";
import { paneLinkCapture } from "../document/pane-link";
import { closedForLaunch } from "../../../lib/launch-scope";
import PublishedMenu from "./PublishedMenu";
/* 홈페이지 도구(.hk-*)의 다크 테마 덮개 — 다크일 때만 켜진다 */
import "./homepage-kit-dark.css";
import { AppButton } from "../../../components/app-button";

/* 운영에서는 홈페이지 AI 수정 주소가 아직 닫혀 있다(lib/launch-scope) — 닫혀 있으면 대화로 고치기 권유·단추를 보이지 않는다 */
const HOMEPAGE_CHAT_EDIT_OPEN = closedForLaunch("/api/projects/_/landing/ai-edit") === null;

/* 작업실 PC 새 배치 기준 — 작업실(Studio)의 1024px 와 같다 */
const WIDE_QUERY = "(min-width: 1024px)";
const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readWide = () => window.matchMedia(WIDE_QUERY).matches;
const serverWide = () => false;
/* 새 배치에서 카드 본문(미리보기 + 설정)을 굴리는 상자 */
const PRO_SCROLL_ID = "hp-studio-scroll";
/* 가운데 알약의 짧은 주소 — 'jakeun-gyumoro-sijak-b788' → 'jakeun…-b788'(앞 낱말 · 끝 꼬리). 짧으면 그대로 */
function shortSlug(slug: string): string {
  if (slug.length <= 14) return slug;
  const dash = slug.lastIndexOf("-");
  const tail = dash > 0 && slug.length - dash <= 7 ? slug.slice(dash) : slug.slice(-5);
  const head = slug.slice(0, Math.min(slug.indexOf("-") > 0 ? slug.indexOf("-") : 6, 8));
  return `${head}…${tail}`;
}

/*
 * 섹션을 넣고 빼고 끌어서 순서를 바꾸는 편집기.
 * 이미 만들어져 있었는데 어디에도 붙어 있지 않았다 — 결제한 사람이 쓸 수 있게
 * 여기에 단다. 글자만 고치는 폼(LandingQuickEditor)은 그대로 두고 함께 쓴다:
 * 문구만 손볼 때 굳이 배치 편집기를 열 필요는 없다.
 */
const LandingVisualBuilder = dynamic(
  () => import("../../../components/landing-visual-builder").then((m) => m.LandingVisualBuilder),
  { ssr: false },
);

/*
 * 사업계획서로 만드는 홈페이지.
 *
 * 계획서를 다 쓰면 홈페이지에 실을 말은 이미 다 답해 둔 상태다.
 * 이 화면은 그 답변으로 만든 초안을 보여주고, 다듬어서 공개하는 곳이다.
 */

type Phase = "loading" | "ready" | "blocked";
type Action = "idle" | "saving" | "saved" | "publishing" | "unpublishing";

export function HomepageScreen() {
  const router = useRouter();
  /* 작업실 안이면 머리줄 없이 칸 본문만 — 이동은 작업실 탭 바꾸기로, 저장 안 한 수정은 작업실에 알린다 */
  const pane = useStudioPane();
  const nav = useStudioNav();
  const embedded = !!pane;
  /* 처음 불러올 때 고를 사업 — 작업실 칸은 작업실이 정해 준 사업(주소를 읽지 않아도 된다) */
  const panePlanId = useRef(pane?.planId ?? null);
  const go = (href: string) => { if (nav) nav.push(href); else router.push(href); };
  const [phase, setPhase] = useState<Phase>("loading");
  const [blocked, setBlocked] = useState<{ title: string; detail: string; missing: string[]; cta: "pay" | "plan" | "login" | "retry" | "list" }>({
    title: "",
    detail: "",
    missing: [],
    cta: "plan",
  });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [site, setSite] = useState<LandingSiteRecord | null>(null);
  const [draft, setDraft] = useState<LandingDraft | null>(null);
  const [editable, setEditable] = useState(false);
  const [sample, setSample] = useState(false);
  /** 이 화면이 보여 주는 사업 — 머리줄 뒤로가기(그 사업의 계획서)에 쓴다 */
  const [screenPlanId, setScreenPlanId] = useState<string | null>(null);
  /** 앱 껍데기를 걷어내고 홈페이지만 화면 가득 — 실제로 어떻게 보이는지 확인용 */
  const [fullscreen, setFullscreen] = useState(false);
  /* 전체 화면 미리보기 — 열면 닫기 단추로 초점을 옮기고, Tab 은 안에서만 돌고, Esc 로 닫으면 연 단추로 돌아간다 */
  const fullscreenRef = useDialogFocus<HTMLDivElement>(fullscreen, { onEscape: () => setFullscreen(false) });
  /** 섹션 배치 편집기 — 결제한 사람만 연다 */
  const [builderOpen, setBuilderOpen] = useState(false);
  const [price, setPrice] = useState(HOMEPAGE_PRODUCT_AMOUNT);
  /* 이 사업의 계획서를 결제했는지 — 아니면 홈페이지는 계획서와 묶음으로만 열린다 */
  const [planPaid, setPlanPaid] = useState(true);
  const [action, setAction] = useState<Action>("idle");
  const [message, setMessageText] = useState("");
  // 실패·충돌 안내인지 — 홈페이지 패널이 낭독기에 alert로 읽게 한다(나머지 안내는 status)
  const [messageAlert, setMessageAlert] = useState(false);
  const setMessage = (text: string, alert = false) => { setMessageText(text); setMessageAlert(alert); };
  /*
   * 저장이 막힌 이유 — 로그인이 풀렸거나(login) 다른 화면에서 먼저 저장됐을 때(conflict).
   * 예전엔 '홈페이지를 찾을 수 없습니다'·'변경됐습니다…편집해주세요' 글만 떠 다음에 할 일이 없었다. 단추를 함께 둔다.
   */
  const [saveTrouble, setSaveTrouble] = useState<null | "login" | "conflict">(null);
  /* 편집기를 새로 열 때마다 바뀐다 — 최신 내용을 불러오면 편집기를 그 내용으로 다시 연다 */
  const [builderKey, setBuilderKey] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const leaving = useRef(false);
  const siteRef = useRef(site); siteRef.current = site;
  /* 공개 확인창이 '가게 이름'을 물을지 — 아래 화면 계산(nameCandidates)을 공개 함수가 읽는다 */
  const nameCandidatesRef = useRef(false);
  const [aiFilling, setAiFilling] = useState(false);
  /* 처음 저절로 채우기(AI)가 실패했을 때 — 조용히 넘어가면 사장님은 계획서 답이 그대로 들어간 줄 몰랐다. 한 줄로 알리고 다시 채우기를 둔다(저절로 다시 돌리지 않는다) */
  const [aiFillFailed, setAiFillFailed] = useState(false);
  /* 무료 주소 끝부분 오류 — 맨 위가 아니라 그 칸 바로 아래에 보인다. slugFocus 가 바뀌면 그 칸을 펼쳐 데려간다 */
  const [slugError, setSlugError] = useState("");
  const [slugFocus, setSlugFocus] = useState(0);
  const showSlugError = (text: string) => { setSlugError(text); setSlugFocus(n => n + 1); };
  /*
   * 계획서로 채우기(AI). 새로 만든 홈페이지에서 한 번만 자동으로 돈다 — 다시 채우는 단추는 뺐다(대표 요청 2026-10-15: AI 비용만 나간다).
   * 도는 동안(30초 안팎) 저장·공개·편집을 막는다 — 끝나면 서버에 저장된 초안으로 바꾼다.
   */
  const runAiFill = useCallback(async (targetProjectId: string, expectedUpdatedAt: string, auto: boolean) => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const epoch = planOwnerEpoch();
    const current = () => mounted.current && epoch === planOwnerEpoch();
    setAiFilling(true);
    setAiFillFailed(false);
    /* 처음 한 번 저절로 채울 때는 위쪽 안내 문구를 띄우지 않는다 — 미리보기 위 로딩 표시로 충분하다(대표 요청 2026-10-15: AI 문구가 어색하다) */
    if (!auto) setMessage("AI가 계획서로 홈페이지를 다시 채우고 있어요. 30초쯤 걸려요.");
    const before = aiFillMark(siteRef.current);
    const done = (filled: LandingSiteRecord) => {
      siteRef.current = filled; setSite(filled); setDraft(filled.draft); setAction("saved");
      setMessage(auto ? "" : "홈페이지를 채웠어요.");
    };
    /* 답을 못 받았으면 서버가 저장을 마쳤는지 잠깐(최대 1분) 확인한다 */
    const recover = async () => {
      for (let i = 0; i < 12 && current() && !controller.signal.aborted; i++) {
        const res = await fetch(`/api/projects/${targetProjectId}/landing`, { cache: "no-store", signal: controller.signal }).catch(() => null);
        const data = res?.ok ? (await res.json().catch(() => ({}))) as { site?: LandingSiteRecord } : {};
        if (aiFillLanded(before, data.site)) return data.site!;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      return null;
    };
    try {
      const res = await fetch(`/api/projects/${targetProjectId}/landing/ai-fill`, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt }) });
      const data = (await res.json().catch(() => ({}))) as { site?: LandingSiteRecord; error?: { message?: string } };
      if (!current()) return;
      if (res.ok && data.site) { done(data.site); return; }
      // 서버가 이유를 알려 준 실패(한도·AI 실패·충돌)는 그대로 보여 준다. 이유가 없으면 중간 연결이 끊긴 것
      const filled = data.error ? null : await recover();
      if (!current()) return;
      if (filled) done(filled);
      /* 처음 자동 채우기가 실패하면 위쪽 안내 대신 미리보기 위 한 줄로 알린다(다시 채우기 단추). 다음에 열 때도 한 번 더 저절로 채운다(needsAutoAiFill) */
      else if (auto) setAiFillFailed(true);
      else setMessage(apiMessage(data, "AI 채우기를 하지 못했어요. 잠시 후 다시 시도해 주세요."), true);
    } catch {
      if (controller.signal.aborted || !current()) return;
      const filled = await recover().catch(() => null);
      if (!current()) return;
      if (filled) done(filled);
      else if (auto) setAiFillFailed(true);
      else setMessage("AI 채우기 연결이 끊겼어요. 잠시 후 다시 시도해 주세요.", true);
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (current()) setAiFilling(false);
    }
  }, []);
  const unsaved = editable && (builderOpen || (!!draft && landingDraftFingerprint(draft) !== landingDraftFingerprint(site?.draft)));

  useEffect(() => {
    mounted.current = true;
    const invalidate = () => {
      requestRef.current?.abort();
      requestRef.current = null;
      setBuilderOpen(false); setFullscreen(false); setEditable(false);
      setDraft(null); setSite(null); setProjectId(null); setAction("idle"); setMessage("");
      setBlocked({ title: "계정이 바뀌었어요", detail: "지금 계정으로 홈페이지를 다시 열어 주세요.", missing: [], cta: "login" });
      setPhase("blocked");
      /* 로그인이 풀린 것이면(세션 만료·다른 탭에서 로그아웃) 그렇게 알린다 — 편집기에서 고친 내용은 이 탭에 보관돼 다시 로그인하면 복구할 수 있다 */
      void loadAuthSession().then(session => {
        if (!mounted.current || session.authenticated) return;
        setBlocked({ title: "로그인이 풀렸어요", detail: "다시 로그인하면 이어서 할 수 있어요. 편집기에서 고친 내용은 이 탭에 보관해 뒀어요.", missing: [], cta: "login" });
      }).catch(() => {});
    };
    const unsubscribe = subscribePlanOwnerChange(invalidate);
    return () => { mounted.current = false; requestRef.current?.abort(); unsubscribe(); };
  }, []);

  /* 작업실 안 — 탭을 바꿔도 이 칸은 그대로 남으니 링크마다 묻지 않고, 작업실 밖으로 나갈 때 작업실이 한 번 묻는다 */
  useStudioDirty("homepage", unsaved, "저장되지 않은 홈페이지 수정 내용이 있어요.");
  useEffect(() => {
    if (!unsaved) return;
    const epoch = planOwnerEpoch();
    const warn = (event: BeforeUnloadEvent) => {
      if (epoch !== planOwnerEpoch()) return;
      event.preventDefault(); event.returnValue = "";
    };
    const confirmLink = (event: MouseEvent) => {
      if (epoch !== planOwnerEpoch() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href, location.href);
      if (target.origin === location.origin && target.pathname === location.pathname && target.search === location.search) return;
      // 일단 멈추고 확인창 — '나가기'를 고르면 같은 링크를 다시 누른다(이때는 묻지 않는다)
      if (leaving.current) { leaving.current = false; return; }
      event.preventDefault(); event.stopPropagation();
      void askConfirm({ message: "저장되지 않은 수정 내용이 있을 수 있어요. 이 화면을 나갈까요?", confirmLabel: "나가기" }).then(ok => { if (ok) { leaving.current = true; link.click(); } });
    };
    window.addEventListener("beforeunload", warn);
    /* 문서 전체 링크 가로채기는 예전 화면에서만 — 작업실 안에서는 탭 바꾸는 링크마다 잘못 경고가 떴다(새로 고침·닫기 경고는 그대로) */
    if (!embedded) document.addEventListener("click", confirmLink, true);
    return () => { window.removeEventListener("beforeunload", warn); if (!embedded) document.removeEventListener("click", confirmLink, true); };
  }, [unsaved, embedded]);

  useEffect(() => {
    let alive = true;
    let loadEpoch = planOwnerEpoch();
    (async () => {
      let state = await hydrateFromServer();
      const epoch = planOwnerEpoch();
      loadEpoch = epoch;
      /* 문서 화면의 '홈페이지 만들기'처럼 주소로 사업을 고르면 그 사업으로 연다 */
      const requested = panePlanId.current ?? new URLSearchParams(window.location.search).get("planId");
      if (requested && state.plans.some(item => item.id === requested)) { setActivePlan(requested); state = { ...state, activePlanId: requested }; }
      else if (requested) {
        /*
         * 주소로 고른 사업을 못 찾았으면 다른 사업으로 넘어가지 않는다 — 예전엔 마지막에 보던 사업으로 넘어가
         * 그 사업의 홈페이지를 만들고 AI 채우기까지 시작했다(다른 기기에서 만든 사업·목록을 못 불러온 때).
         */
        if (!alive) return;
        // 다른 화면과 같은 말(MissingBusiness) — 갈 곳은 새 대화가 아니라 내 사업 목록
        setBlocked(lastHydrationFailed() ? { title: "사업을 불러오지 못했어요", detail: "연결을 확인하고 다시 시도해 주세요.", missing: [], cta: "retry" } : { title: MISSING_BUSINESS_TITLE, detail: MISSING_BUSINESS_DETAIL, missing: [], cta: "list" });
        setPhase("blocked");
        return;
      }
      const plan = activePlan(state);
      if (!alive) return;
      setScreenPlanId(plan?.id ?? null);
      if (!plan) {
        setBlocked({ title: "먼저 사업계획서를 만들어 주세요", detail: "홈페이지는 계획서에 답한 내용으로 만들어요.", missing: [], cta: "plan" });
        setPhase("blocked");
        return;
      }
      /*
       * 예시 문서 — 서버를 거치지 않고 그 자리에서 만들어 보여준다.
       * 답변이 이미 들어 있고 변환은 순수 계산이라 AI도 저장도 필요 없다.
       * 결과물이 어떻게 생겼는지 보여주는 게 목적이므로 열람만 가능하다.
       */
      if (isSamplePlan(plan.id)) {
        /*
         * 예시에는 사업 정보가 없다. 업종을 안 넘기면 기본 템플릿(일반 서비스)이
         * 잡혀 커피집에 낯선 사진과 색이 붙는다 — 예시의 업종을 함께 넘긴다.
         */
        const doc = SAMPLE_DOCS.find((item) => item.id === plan.id);
        /*
         * 플랜 이름은 목록에서 구분하려고 "샘플 · 새벽커피 (창업 초기)"처럼
         * 붙여 뒀는데, 그게 홈페이지 상호명 자리에 그대로 들어가
         * "샘플 · 새벽커피 (창업 초기)에 문의해 보세요"가 손님 화면에 섰다.
         * 가게 이름만 남긴다.
         */
        const shopName = plan.title.replace(/^샘플\s*·\s*/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
        const draft = landingDraftFromPlan({
          planTitle: shopName || plan.title,
          /*
           * 예시는 남의 가게 이야기다. 여기에 로그인한 사람의 사업 정보를 섞으면
           * 안 된다.
           *
           * 실제로 그렇게 나갔다 — 사업 정보에 "한빛싱크"를 적어 둔 계정에서는
           * 무인꽃집 예시가 "한빛싱크"라는 제목으로, "한빛싱크 가격 안내" 밑에
           * 중형 꽃다발 25,000원을 파는 화면으로 보였다. 결제 전에 물건을 보러 온
           * 사람에게 보여주는 화면이 이러면 안 된다.
           *
           * 예시 자신의 업종만 쓰고, 상호·지역은 비워 예시의 계획서 답변에서
           * 채우게 한다.
           */
          business: { ...state.business, name: "", region: "", industry: doc?.industry ?? "" },
          answers: plan.answers,
        });
        /*
         * 예시마다 업종에 맞는 킷 페이지를 고른다 — 업종 추정만 믿으면 커피집도
         * 꽃집도 똑같이 '매장'으로 잡혀 같은 페이지가 나온다.
         *   새벽커피(카페) → 03 Coworking(공간·매장)
         *   퇴근필라(필라테스) → 03 Coworking(동네 가게) + 필라테스 문구(KO_SAMPLE) — 커피 문구가 붙어 나왔다(점검 2026-10-22)
         *   무인꽃집(소매) → 06 ECommerce(온라인 상점)
         */
        const samplePage: Record<string, string> = {
          sample_pilates: "0-2226",
          sample_coffee: "0-2226",
          sample_flower_psst: "0-1102",
          sample_flower_fm: "0-1102",
        };
        const page = samplePage[plan.id];
        /* 예시는 한글로 — 가게 이름을 넣은 문구 세트(디자인은 그대로, 글만) */
        setDraft(page && draft.pageData?.brainwave
          ? { ...draft, pageData: { ...draft.pageData, brainwave: { page, texts: KO_SAMPLE[plan.id]?.page === page ? KO_SAMPLE[plan.id].texts(shopName || plan.title) : koTextsFor(page, shopName || plan.title), images: {}, links: {}, sizes: {}, hidden: [], order: [] } } }
          : draft);
        setEditable(false);
        setSample(true);
        setPhase("ready");
        return;
      }
      // 서버가 답을 주지 않으면 20초 뒤 끊고 '늦어지고 있어요'와 다시 시도를 보여 준다
      const res = await fetchWithTimeout("/api/plan/landing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      if (!alive || epoch !== planOwnerEpoch()) return;

      if (res.ok) {
        const data = (await res.json()) as { site: LandingSiteRecord; projectId: string; editable?: boolean; price?: number; planPaid?: boolean; created?: boolean };
        if (!alive || epoch !== planOwnerEpoch()) return;
        setSite(data.site);
        setProjectId(data.projectId);
        setDraft(data.site.draft);
        setEditable(Boolean(data.editable));
        /*
         * 고칠 수 있는 사람에게는 자유 편집을 바로 연다.
         *
         * 그 앞에 있던 화면은 제목·처음 설정·전체화면·저장하고 공개·결제 안내·
         * 주소·디자인 고르기가 한 줄로 쌓여 있어, 무엇부터 할지 읽히지 않았다.
         * 이 화면에서 할 일은 결국 홈페이지를 고치는 것 하나다.
         *
         * 닫으면 그 화면으로 돌아간다 — 주소 확인이나 공개는 거기서 한다.
         */
        /* 옛 블록 페이지만 편집기를 바로 연다 — 킷 페이지는 화면(미리보기·사업자·문의)부터 보여준다 */
        if (data.editable && !data.site.draft.pageData?.brainwave) setBuilderOpen(true);
        if (typeof data.price === "number") setPrice(data.price);
        if (typeof data.planPaid === "boolean") setPlanPaid(data.planPaid);
        setPhase("ready");
        // 방금 만든(또는 만든 뒤 채우지도 고치지도 않은) 홈페이지는 계획서로 한 번 채운다(카드·이용 순서·마무리 문구·업종 사진)
        if ((data.created && data.site.draft.pageData?.brainwave) || needsAutoAiFill(data.site)) void runAiFill(data.projectId, data.site.updatedAt, true);
        return;
      }

      const error = (await res.json().catch(() => ({}))) as { error?: string | { message?: string }; message?: string; missing?: string[] };
      const errorMessage = error.message ?? (typeof error.error === "object" ? error.error?.message : undefined);
      if (!alive || epoch !== planOwnerEpoch()) return;
      if (res.status === 401) {
        setBlocked({ title: "로그인이 필요해요", detail: "홈페이지는 내 계정에 저장돼요. 로그인하면 이어서 할 수 있어요.", missing: [], cta: "login" });
      } else if (res.status === 402) {
        setBlocked({ title: "결제 후 이용할 수 있어요", detail: "사업계획서를 결제했다면 홈페이지만, 아직이라면 사업계획서 + 홈페이지로 함께 결제할 수 있어요.", missing: [], cta: "pay" });
      } else if (error.error === "plan_incomplete") {
        setBlocked({
          title: "홈페이지에 실을 내용이 조금 부족해요",
          detail: "아래 질문에 답하면 그 내용으로 홈페이지를 만들어 드려요.",
          missing: error.missing ?? [],
          cta: "plan",
        });
      } else if (res.status === 404) {
        // 서버에 이 플랜이 없다 — 로그인 전이라 아직 계정에 저장되지 않은 경우가 대부분이다
        setBlocked({
          title: "이 계획서가 아직 계정에 저장되지 않았어요",
          detail: "로그인하면 이어서 만들 수 있어요",
          missing: [],
          cta: "login",
        });
      } else {
        /* 잠깐의 오류(요청이 몰림 429 등)에 '계획서 이어 쓰기'로 보내면 막다른 길이다 — 다시 시도 */
        setBlocked({ title: "홈페이지를 준비하지 못했어요", detail: res.status === 429 ? "잠시 요청이 많았어요. 조금 뒤 다시 시도해 주세요." : koreanText(errorMessage, "잠시 후 다시 시도해 주세요."), missing: [], cta: "retry" });
      }
      setPhase("blocked");
    })().catch((error: unknown) => {
      if (!alive || loadEpoch !== planOwnerEpoch()) return;
      setBlocked(isTimeoutError(error)
        ? { title: "불러오기가 늦어지고 있어요", detail: "연결이 느리거나 서버가 잠시 바빠요. 다시 시도해 주세요.", missing: [], cta: "retry" }
        : { title: "홈페이지를 불러오지 못했어요", detail: "연결 상태를 확인하고 다시 시도해 주세요.", missing: [], cta: "retry" });
      setPhase("blocked");
    });
    return () => {
      alive = false;
    };
  }, []);

  const saveDraft = useCallback(async (next: LandingDraft) => {
    if (!projectId || !editable || requestRef.current) throw new Error("지금은 저장할 수 없어요. 잠시 후 다시 시도해 주세요.");
    /* 주소 칸이 틀렸으면 서버에 보내기 전에 그 칸에서 알린다 */
    const slugProblem = landingSlugIssue(next.slug);
    if (slugProblem) {
      setDraft(next); setAction("idle"); setMessage("");
      showSlugError(slugProblem);
      throw new Error(`무료 주소 끝부분을 고쳐 주세요 · ${slugProblem}`);
    }
    const controller = new AbortController();
    requestRef.current = controller;
    const epoch = planOwnerEpoch();
    const current = () => mounted.current && epoch === planOwnerEpoch();
    setDraft(next);
    setAction("saving");
    setMessage("");
    try {
      const saved = await persistLandingDraft(projectId, next, siteRef.current?.updatedAt ?? null, { signal: controller.signal });
      if (!current()) throw new Error("계정이 바뀌어 저장 결과를 보여 드리지 않았어요.");
      siteRef.current = saved;
      setSite(saved);
      setDraft(value => value === next ? saved.draft : value);
      setAction("saved");
      setMessage("저장했어요.");
      setSaveTrouble(null);
    } catch (error) {
      if (current()) {
        setAction("idle");
        if (error instanceof LandingSaveError && (error.code === "SLUG_TAKEN" || error.code === "LANDING_SLUG_INVALID")) { setMessage(""); showSlugError(error.message); }
        else setMessage(userErrorMessage(error, "저장하지 못했어요."), true);
        if (error instanceof LandingSaveError) setSaveTrouble(error.code === LANDING_LOGIN_REQUIRED ? "login" : error.code === "LANDING_DRAFT_CONFLICT" ? "conflict" : null);
      }
      throw error;
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [projectId, editable]);

  /*
   * 다른 화면(탭·기기)에서 먼저 저장했을 때 — 이 화면의 수정을 버리고 서버의 최신 내용으로 바꾼다.
   * 몰래 덮어쓰지 않는다: 사장님이 고르기 전까지는 어느 쪽도 저장하지 않는다.
   */
  const reloadLatest = useCallback(async () => {
    if (!projectId || requestRef.current) return;
    if (!await askConfirm({ title: "최신 내용을 불러올까요?", message: "이 화면에서 고치고 저장하지 못한 내용은 사라져요.", confirmLabel: "최신 내용 불러오기", cancelLabel: "계속 고치기" })) return;
    const epoch = planOwnerEpoch();
    try {
      const res = await fetchWithTimeout(`/api/projects/${encodeURIComponent(projectId)}/landing`, { cache: "no-store" });
      const data = await res.json().catch(() => ({})) as { site?: LandingSiteRecord | null };
      if (!mounted.current || epoch !== planOwnerEpoch()) return;
      if (!res.ok || !data.site) { setMessage(apiMessage(data, "최신 내용을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."), true); return; }
      // 편집기가 이 탭에 보관한 옛 수정본도 버린다 — 다시 열 때 '복구할까요?'가 뜨지 않게
      try { sessionStorage.removeItem(`oneul:homepage-editor:${projectId}`); } catch { /* 보관본이 없거나 막힌 브라우저 */ }
      siteRef.current = data.site; setSite(data.site); setDraft(data.site.draft);
      setSaveTrouble(null); setAction("idle"); setMessage("최신 내용을 불러왔어요.");
      setBuilderKey(key => key + 1);
    } catch {
      if (mounted.current) setMessage("최신 내용을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.", true);
    }
  }, [projectId]);

  const save = useCallback(async () => {
    if (!draft) return;
    try { await saveDraft(draft); } catch { /* The draft and visible failure message are retained. */ }
  }, [draft, saveDraft]);

  /** 공개 결과 — 에디터 저장 팝업이 주소를 바로 보여 주려고 쓴다. 실패면 손님에게 보일 문장 */
  const publish = useCallback(async (): Promise<{ ok: true; site: LandingSiteRecord } | { ok: false; message: string; cancelled?: boolean }> => {
    if (!projectId || !draft || !editable || requestRef.current) return { ok: false, message: "지금은 공개할 수 없어요. 잠시 후 다시 시도해 주세요." };
    const slugProblem = landingSlugIssue(draft.slug);
    if (slugProblem) { showSlugError(slugProblem); return { ok: false, message: `무료 주소 끝부분을 고쳐 주세요 · ${slugProblem}` }; }
    /* 공개 중인 주소를 바꾸면 예전 링크가 끊긴다 — 공개 전에 한 번 묻는다 */
    const liveSlug = siteRef.current?.status === "published" ? siteRef.current.publishedSlug : null;
    if (liveSlug && liveSlug !== draft.slug && !await askConfirm({
      title: "주소를 바꿀까요?",
      message: `주소를 바꾸면 예전 주소로는 열리지 않아요. 이미 손님에게 보낸 링크도 바뀌어요. (예전 /launch/${liveSlug} → 새 /launch/${draft.slug})`,
      confirmLabel: "바꾸고 공개",
      danger: true,
    })) return { ok: false, message: "", cancelled: true };
    /*
     * 처음 공개(또는 멈췄다 다시 공개)할 때 비어 있는 사업자 정보를 한 번 알린다 — 예전엔 '채울 것 5개'가 있어도 묻지 않고 공개됐다.
     * 그래도 공개할 수 있다(문의 양식을 켠 채 개인정보 문의처가 비면 서버가 공개를 막는다 — 그 경우는 따로 알린다).
     */
    const missingInfo = siteRef.current?.status === "published" ? [] : homepageMissingInfo(draft, { nameCandidates: nameCandidatesRef.current });
    if (missingInfo.length && !await askConfirm({
      title: "비어 있는 정보가 있어요",
      /* 넓은 창 + 왼쪽 정렬 목록 — 360px 창 가운데에 쉼표로 늘어놓아 읽기 어려웠다(작업실 PC 점검 r37) */
      message: missingInfo.includes("개인정보 문의처") ? "문의 양식을 켜 두었다면 개인정보 문의처는 꼭 적어야 공개할 수 있어요." : "지금 공개해도 되지만, 손님에게 돈을 받기 전에는 채워 주세요.",
      list: missingInfo,
      wide: true,
      cancelLabel: "사업자 정보 채우기",
      confirmLabel: "그래도 공개",
    })) {
      const fold = document.getElementById("hk-business");
      if (fold instanceof HTMLDetailsElement) { fold.open = true; fold.scrollIntoView({ behavior: "smooth", block: "start" }); }
      return { ok: false, message: "", cancelled: true };
    }
    if (requestRef.current) return { ok: false, message: "지금은 공개할 수 없어요. 잠시 후 다시 시도해 주세요." };
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const epoch = planOwnerEpoch();
    const current = () => mounted.current && epoch === planOwnerEpoch();
    setAction("publishing");
    setMessage("");
    let draftSaved = false;
    try {
      const saved = await persistLandingDraft(projectId, draft, siteRef.current?.updatedAt ?? null, { signal: controller.signal });
      if (!current()) return { ok: false, message: "다른 화면으로 바뀌어 공개를 멈췄어요." };
      draftSaved = true;
      siteRef.current = saved; setSite(saved);
      setDraft(value => value === draft ? saved.draft : value);
      const res = await fetch(`/api/projects/${projectId}/landing/publish`, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: saved.updatedAt }) });
      const data = await res.json().catch(() => ({})) as { site?: LandingSiteRecord; error?: { code?: string; message?: string } };
      // 화면이 바뀌어도 서버 공개는 이미 끝났을 수 있다 — 결과는 그대로 알려 준다.
      if (!current()) return res.ok && data.site ? { ok: true, site: data.site as LandingSiteRecord } : { ok: false, message: apiMessage(data, "공개 결과를 확인하지 못했어요.") };
      if (!res.ok || !data.site) {
        if (data.error?.code === "SLUG_TAKEN") showSlugError("이 주소는 다른 홈페이지가 쓰고 있어요. 다른 주소를 적어 주세요.");
        if (res.status === 401) { setSaveTrouble("login"); throw new Error(LANDING_LOGIN_MESSAGE); }
        throw new Error(apiMessage(data, "공개 결과를 확인하지 못했어요."));
      }
      siteRef.current = data.site; setSite(data.site);
      setMessage("홈페이지를 공개했어요. 손님 화면에 바로 보여요.");
      return { ok: true, site: data.site as LandingSiteRecord };
    } catch (error) {
      const message = `${draftSaved ? "고친 내용은 저장됐지만 공개는 확인하지 못했어요. " : ""}${userErrorMessage(error, "연결을 확인하고 다시 시도해 주세요.")}`;
      if (error instanceof LandingSaveError && (error.code === "SLUG_TAKEN" || error.code === "LANDING_SLUG_INVALID")) {
        if (current()) { setMessage(""); showSlugError(error.message); }
        return { ok: false, message: `무료 주소 끝부분을 고쳐 주세요 · ${error.message}` };
      }
      if (error instanceof LandingSaveError && current()) setSaveTrouble(error.code === LANDING_LOGIN_REQUIRED ? "login" : error.code === "LANDING_DRAFT_CONFLICT" ? "conflict" : null);
      if (current()) setMessage(message, true);
      return { ok: false, message };
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
      if (current()) setAction("idle");
    }
  }, [projectId, draft, editable]);

  /*
   * 공개 멈추기 — 손님 주소로 더는 열리지 않게. 초안·주소는 남아 '다시 공개'하면 같은 주소로 열린다.
   * 예전엔 한 번 공개하면 내릴 방법이 없었다.
   */
  const unpublish = useCallback(async () => {
    if (!projectId || !editable || requestRef.current || siteRef.current?.status !== "published") return;
    if (!await askConfirm({
      title: "공개를 멈출까요?",
      message: "손님이 주소로 들어와도 홈페이지가 열리지 않아요. 고친 내용과 주소는 그대로 남고, 언제든 다시 공개할 수 있어요.",
      confirmLabel: "공개 멈추기",
      danger: true,
    })) return;
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const epoch = planOwnerEpoch();
    const current = () => mounted.current && epoch === planOwnerEpoch();
    setAction("unpublishing");
    setMessage("");
    try {
      const res = await fetch(`/api/projects/${projectId}/landing/unpublish`, { method: "POST", signal: controller.signal });
      const data = await res.json().catch(() => ({})) as { site?: LandingSiteRecord; error?: { message?: string } };
      if (!current()) return;
      if (!res.ok || !data.site) { if (res.status === 401) setSaveTrouble("login"); setMessage(res.status === 401 ? LANDING_LOGIN_MESSAGE : apiMessage(data, "공개를 멈추지 못했어요. 잠시 후 다시 시도해 주세요."), true); return; }
      siteRef.current = data.site; setSite(data.site);
      setMessage("공개를 멈췄어요. 손님 주소로는 열리지 않아요. ‘다시 공개’를 누르면 같은 주소로 다시 열려요.");
    } catch (error) {
      if (current()) setMessage(userErrorMessage(error, "연결을 확인하고 다시 시도해 주세요."), true);
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (current()) setAction("idle");
    }
  }, [projectId, editable]);

  const updateDraft = (next: LandingDraft) => {
    if (requestRef.current) { setMessage(aiFilling ? "AI가 내용을 채우는 중이에요. 끝난 뒤에 고쳐 주세요." : "저장·공개하는 중이에요. 끝난 뒤에 고쳐 주세요."); return; }
    /* 바꿨다가 원래대로 되돌리면(분위기 색 등) 저장된 것과 같다 — '저장하지 않은 수정' 안내를 남기지 않는다 */
    const sameAsSaved = !!siteRef.current && landingDraftFingerprint(next) === landingDraftFingerprint(siteRef.current.draft);
    if (next.slug !== draft?.slug) setSlugError("");
    setDraft(next); setAction("idle"); setMessage(sameAsSaved ? "" : "저장하지 않은 수정이 있어요.");
  };
  const updateSite = (next: LandingSiteRecord) => {
    /*
     * 지금 가진 것보다 옛 홈페이지 정보면 버린다 — 도메인 상태 확인(8초마다)이 공개·저장 직전에 읽은 정보를
     * 늦게 돌려주면, 화면이 '아직 비공개'로 돌아가고 유지보수가 다시 잠겼다.
     */
    const held = siteRef.current;
    if (held && held.id === next.id && next.updatedAt < held.updatedAt) return;
    if (site && landingDraftFingerprint(site.draft) !== landingDraftFingerprint(next.draft)) {
      setMessage("다른 화면에서 초안이 바뀌었어요. 지금 수정한 내용은 그대로 두었어요. 최신 내용을 확인해 주세요.", true);
      return;
    }
    siteRef.current = next; setSite(next);
  };
  const applySourceSite = (next: LandingSiteRecord, expectedUpdatedAt: string) => {
    if (!mounted.current || requestRef.current || next.projectId !== projectId || siteRef.current?.updatedAt !== expectedUpdatedAt
      || !draft || landingDraftFingerprint(draft) !== landingDraftFingerprint(siteRef.current.draft)) {
      setMessage("초안을 반영하는 동안 화면이 바뀌었어요. 저장하지 않은 수정은 그대로 두었어요. 최신 초안을 다시 확인해 주세요.", true);
      return;
    }
    siteRef.current = next; setSite(next); setDraft(next.draft); setAction("saved");
    setMessage("고른 사업 정보를 초안에 반영했어요. 공개 중인 홈페이지는 아직 그대로예요.");
  };

  /*
   * 편집기에서 큰 제목을 고치면 닫을 때 한 번 묻는다 — "가게 이름도 '…'로 바꿀까요?" 예전엔 큰 제목만 바뀌고 머리줄 이름·개인정보 처리 주체·
   * 문의·문자 안내에는 옛 이름이 남았다(여정 점검 2026-10-22). 같은 이름은 다시 묻지 않는다. 편집 중에 묻지 않는 건 편집기가 따로 저장하기 때문이다.
   */
  const heroTitle = (value: LandingDraft | null) => {
    const bw = value?.pageData?.brainwave;
    const profile = bw ? BUSINESS_TEMPLATE_PROFILES[bw.page] : undefined;
    return bw && profile ? (bw.texts[profile.headline] ?? "").replace(/\s+/g, " ").trim() : "";
  };
  const openedTitle = useRef<string | null>(null);
  const askedNames = useRef(new Set<string>());
  useEffect(() => {
    if (builderOpen) { openedTitle.current = heroTitle(draft); return; }
    const opened = openedTitle.current;
    openedTitle.current = null;
    if (opened === null || !draft || !editable) return;
    const title = heroTitle(draft);
    if (!title || title === opened || title.length > 30 || title === draft.businessName.trim() || askedNames.current.has(title)) return;
    askedNames.current.add(title);
    void askConfirm({ title: "사업 이름도 바꿀까요?", message: `큰 제목을 ${withRo(`'${title}'`)} 고쳤어요. 사업 이름도 ${withRo(`'${title}'`)} 바꿀까요? 홈페이지 맨 위 이름, 개인정보 처리 주체, 손님 문의·문자 안내에 이 이름이 들어가요.`, cancelLabel: "그대로 두기", confirmLabel: "사업 이름 바꾸기" })
      .then(ok => {
        if (!ok) return;
        const renamed = withBusinessName(draft, title);
        saveDraft(renamed).then(() => setMessage(`사업 이름을 ${withRo(`'${title}'`)} 바꿨어요. 손님 화면에는 공개하면 반영돼요.`)).catch(() => { setDraft(renamed); setMessage("사업 이름을 바꿨어요. 저장을 눌러 주세요."); });
      });
  }, [builderOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const publicPath = site ? `/launch/${site.publishedSlug ?? site.slug}` : "";
  /* 공개·공개 중지가 끝나면 왼쪽 목록(유지보수 단계)에 바로 알린다 — 새로 고침 없이 '유지보수'가 열린다 */
  useEffect(() => {
    if (!screenPlanId || !site) return;
    const published = site.status === "published";
    announceHomepageStatus(screenPlanId, { status: published ? "published" : "draft", publicPath: published ? `/launch/${site.publishedSlug ?? site.slug}` : null });
  }, [screenPlanId, site?.status, site?.slug, site?.publishedSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 막힌 이유마다 다음 행동이 다르다 — 결제·로그인·계획서 이어쓰기 */
  function blockedHref(cta: "pay" | "plan" | "login" | "retry" | "list"): string {
    /* 로그인하고 돌아올 곳도 그 사업의 홈페이지 — 사업 정보를 빠뜨리면 다른 사업이 열릴 수 있다 */
    if (cta === "list") return "/plan";
    if (cta === "login") return `/account?next=${encodeURIComponent(screenPlanId ? homepageHref(screenPlanId) : "/plan/homepage")}`;
    /* 계획서를 마저 쓸 곳은 그 사업의 대화 — 옛 '플랜 개요'로 보내지 않는다 */
    /* 사업이 아직 없으면(첫 화면에서 바로 온 사람) 이어 쓸 계획서가 없다 — 새 대화로 */
    if (cta !== "pay") return screenPlanId ? businessChatHref(screenPlanId) : "/plan/chat?new=1";
    /* 결제할 사업은 지금 화면의 사업 — 작업 중 사업(activePlan)이 다를 수 있다 */
    const state = loadState();
    const plan = (screenPlanId ? state.plans.find((p) => p.id === screenPlanId) : null) ?? activePlan(state);
    const query = plan
      ? `?planId=${encodeURIComponent(plan.id)}&planType=${encodeURIComponent(plan.planType)}&product=${planPaid ? "homepage" : "bundle"}`
      : "?product=homepage";
    return `/plan/pay${query}`;
  }

  /*
   * 대화·계획서·유지보수 화면과 같은 틀 — 머리줄(← 홈페이지 ☰)과 왼쪽 메뉴.
   * 예전엔 이 화면만 옛 틀(PlanShell)이라 폰에서 머리줄 모양과 메뉴가 달랐다.
   * 저장·공개는 머리줄 오른쪽으로 올려, 편집 화면 위쪽에 버튼이 줄줄이 쌓이지 않게 한다.
   */
  const kitEditing = phase === "ready" && !!draft && editable && !!draft.pageData?.brainwave;
  /* AI 채우기 중에도 머리줄 저장·공개를 잠근다 — 예전엔 눌러도 '저장할 수 없는 상태' 안내만 나오거나 아무 반응이 없었다 */
  const busy = action === "saving" || action === "publishing" || action === "unpublishing" || aiFilling;
  const liveUpToDate = isLiveUpToDate(site, draft ?? undefined);
  /* 공개된 그대로면 '✓ 공개됨'을 누르면 메뉴(주소 복사·새 창으로 보기·공개 멈추기) — 아니면 null(공개 단추를 그린다) */
  const unpublishRef = useRef(unpublish); unpublishRef.current = unpublish;
  const publishedPath = site ? `/launch/${site.publishedSlug ?? site.slug}` : "";
  const publishedMenu = (className: string) => liveUpToDate && site?.status === "published" && publishedPath
    ? <PublishedMenu className={className} publicPath={publishedPath} disabled={busy} onUnpublish={() => void unpublishRef.current()} onCopied={() => setMessage("주소를 복사했어요.")}><Check size={15} aria-hidden /><span>공개됨</span></PublishedMenu>
    : null;
  const headerActions = kitEditing ? <div className={styles.headerActions}>
    <AppButton variant="secondary" size="small" type="button" aria-label="저장" disabled={busy} onClick={() => void save()}>{action === "saving" ? <Spinner /> : <Save size={15} />}<span>저장</span></AppButton>
    {/* 고친 게 없으면 손님 화면과 같다 — '새 버전 공개'를 늘 파랗게 켜 두면 눌러야 하는 줄 안다 */}
    {publishedMenu(styles.headerPrimary) ?? <AppButton type="button" variant="primary" size="small" className={styles.headerPrimary} disabled={busy} onClick={() => void publish()}>{action === "publishing" ? <Spinner /> : <Rocket size={15} />}<span>{site?.status === "published" ? "새 버전 공개" : site?.status === "unpublished" ? "다시 공개" : "공개하기"}</span></AppButton>}
  </div> : undefined;
  /*
   * 작업실 안 — 저장·공개를 칸 위 도구 줄이 아니라 작업실 머리줄 오른쪽으로 올린다(시안: '홈페이지 공개하기'가 오른쪽 위 파란 단추).
   * 미리보기 모양(휴대폰/컴퓨터)도 머리줄에서 고른다. 머리줄이 없는 작업실(예전 틀)이면 예전처럼 칸 도구 줄(actions)로 그린다.
   * 단추 묶음은 바뀔 때만 새로 만든다 — 매번 새로 만들면 작업실이 다시 그려질 때마다 등록이 되풀이된다.
   */
  const studioHeader = embedded && !!nav?.setHeaderActions;
  /*
   * 작업실 PC(1024px 이상) 새 배치 — 오른쪽 칸 전체가 흰 카드 하나: 맨 위 공개 주소 줄 + 사이트가 카드 끝까지(시안 ③).
   * 휴대폰 모양/컴퓨터 모양은 머리줄 가운데 알약('첫 화면 /launch/…')에서, 저장·공개하기는 머리줄 오른쪽에서 고른다.
   * 킷 페이지(편집)와 결제 전 보기만 — 옛 블록 페이지·불러오는 중·막힘은 예전 모양 그대로.
   */
  const wideScreen = useSyncExternalStore(subscribeWide, readWide, serverWide);
  const studioPro = embedded && wideScreen && phase === "ready" && !!draft && (editable ? !!draft.pageData?.brainwave : true);
  /* 가운데 알약을 그릴 수 있는 작업실인지 — 없으면 휴대폰/컴퓨터 단추를 카드 맨 위 줄에 둔다 */
  const hasCenter = !!nav?.setHeaderCenter;
  /* 작업실 PC 는 컴퓨터 모양부터(시안) — 좁은 화면·예전 화면은 휴대폰 모양부터 */
  const [previewView, setPreviewView] = useState<"mobile" | "pc">(() => (embedded && typeof window !== "undefined" && readWide() ? "pc" : "mobile"));
  const saveRef = useRef(save); saveRef.current = save;
  const publishRef = useRef(publish); publishRef.current = publish;
  const siteStatus = site?.status;
  /* 미리보기 크기 — 넓은 화면은 머리줄, 좁은 화면(태블릿)은 칸 맨 위 줄에 같은 단추. 아주 좁은 폰(560px 이하)은 휴대폰 모양만 */
  const previewSwitch = <span className={paneHeader.segment} role="radiogroup" aria-label="미리보기 크기">
    <button type="button" role="radio" aria-checked={previewView === "mobile"} onClick={() => setPreviewView("mobile")}>휴대폰</button>
    <button type="button" role="radio" aria-checked={previewView === "pc"} onClick={() => setPreviewView("pc")}>컴퓨터</button>
  </span>;
  /* 새 배치의 휴대폰/컴퓨터 — 글자 대신 그림 두 개(이름은 낭독기·말풍선으로) */
  const deviceSwitch = <span className={styles.device} role="radiogroup" aria-label="미리보기 크기">
    <button type="button" role="radio" aria-checked={previewView === "mobile"} aria-label="휴대폰 모양" title="휴대폰 모양" onClick={() => setPreviewView("mobile")}><Smartphone size={14} aria-hidden /></button>
    <button type="button" role="radio" aria-checked={previewView === "pc"} aria-label="컴퓨터 모양" title="컴퓨터 모양" onClick={() => setPreviewView("pc")}><Monitor size={14} aria-hidden /></button>
  </span>;
  /*
   * 결제 전에 [공개하기]를 누르면 — 예전 칸 안의 결제 안내 상자(19,000원)를 확인창으로 띄운다. 예시면 '내 사업으로 만들기'.
   */
  const openPayPrompt = async () => {
    if (sample) {
      if (await askConfirm({ title: "예시 홈페이지예요", message: "내 사업으로 만들면 이 페이지의 글과 사진을 바꿔 쓰고 공개할 수 있어요.", confirmLabel: "내 사업으로 만들기", cancelLabel: "닫기" })) go("/plan/chat?new=1");
      return;
    }
    const ok = await askConfirm({
      title: planPaid ? "결제하면 바로 공개할 수 있어요" : "사업계획서와 함께 열어요",
      /* 본문은 걷었다 — 제목과 단추(금액 포함)가 다 말한다(군더더기 점검 r37) */
      message: "",
      confirmLabel: planPaid ? `결제하고 공개하기 · ${price.toLocaleString("ko-KR")}원` : `함께 결제하기 · ${price.toLocaleString("ko-KR")}원`,
      cancelLabel: "나중에 하기",
      wide: true,
    });
    if (ok) go(blockedHref("pay"));
  };
  const payPromptRef = useRef(openPayPrompt); payPromptRef.current = openPayPrompt;
  /* 머리줄 저장 — 고친 게 없으면 '저장됨'으로 잠그고, 누르면 '저장 중…' 뒤 '저장됨'(작업실 PC 점검 r37: 눌러도 아무 표시가 없었다) */
  const saveLabel = action === "saving" ? "저장 중…" : unsaved ? "저장" : "저장됨";
  const studioActions = useMemo(() => {
    if (!studioHeader) return null;
    /* 새 배치 — 저장(보조) · 🌐 공개하기(파랑). 결제 전이면 공개하기만 두고 누르면 결제 안내 */
    if (studioPro) {
      if (!editable) return <div className={paneHeader.group}>
        <AppButton type="button" variant="primary" size="small" className={`${paneHeader.btn} ${paneHeader.primary}`} onClick={() => void payPromptRef.current()}><Globe size={15} aria-hidden /><span>공개하기</span></AppButton>
      </div>;
      const label = liveUpToDate ? "공개됨" : siteStatus === "published" ? "새 버전 공개" : siteStatus === "unpublished" ? "다시 공개" : "공개하기";
      return <div className={paneHeader.group}>
        {/* lovable 구조 2단계 — 저장은 미리보기 판 아래 떠 있는 도구 알약으로(위 막대 자리가 좁다). 예전 머리줄이면 여기 그대로 */}
        {!nav?.toolbarTools && <AppButton type="button" variant="secondary" size="small" className={paneHeader.btn} aria-label={saveLabel} disabled={busy || !unsaved} data-done={!unsaved && action !== "saving" || undefined} onClick={() => void saveRef.current()}>{action === "saving" ? <Spinner /> : unsaved ? <Save size={15} /> : <Check size={15} />}<span className={paneHeader.label}>{saveLabel}</span></AppButton>}
        {publishedMenu(paneHeader.btn) ?? <AppButton type="button" variant="primary" size="small" className={`${paneHeader.btn} ${paneHeader.primary}`} disabled={busy} onClick={() => void publishRef.current()}>{action === "publishing" ? <Spinner /> : <Globe size={15} aria-hidden />}<span>{label}</span></AppButton>}
      </div>;
    }
    if (!kitEditing) return null;
    const label = liveUpToDate ? "공개됨" : siteStatus === "published" ? "새 버전 공개" : siteStatus === "unpublished" ? "다시 공개" : "공개하기";
    return <div className={`${paneHeader.group} ${paneHeader.wideOnly}`}>
      {previewSwitch}
      <AppButton type="button" variant="secondary" size="small" className={paneHeader.btn} aria-label={saveLabel} disabled={busy || !unsaved} data-done={!unsaved && action !== "saving" || undefined} onClick={() => void saveRef.current()}>{action === "saving" ? <Spinner /> : unsaved ? <Save size={15} /> : <Check size={15} />}<span className={paneHeader.label}>{saveLabel}</span></AppButton>
      {/* 처음 공개는 '홈페이지 공개하기' — 무엇을 공개하는지 머리줄에서도 읽히게(좁은 화면은 '공개하기'만) */}
      {publishedMenu(paneHeader.btn) ?? <AppButton type="button" variant="primary" size="small" className={`${paneHeader.btn} ${paneHeader.primary}`} disabled={busy} onClick={() => void publishRef.current()}>{action === "publishing" ? <Spinner /> : <Rocket size={15} />}<span>{label === "공개하기" && <span className={paneHeader.longLabel}>홈페이지 </span>}{label}</span></AppButton>}
    </div>;
  }, [studioHeader, studioPro, editable, kitEditing, liveUpToDate, siteStatus, publishedPath, previewView, busy, action, unsaved, saveLabel]); // eslint-disable-line react-hooks/exhaustive-deps -- previewSwitch 는 previewView 로, publishedMenu 는 liveUpToDate·publishedPath·busy 로만 바뀐다
  useStudioHeaderActions(studioActions);
  /*
   * 휴대폰 아래 막대의 파란 '공개하기'(lovable 구조 2단계) — 위 머리줄 [공개하기]와 같다: 결제 전·예시면 결제 안내, 고친 게 없으면 알림, 아니면 공개.
   */
  useStudioCommand("homepage-publish", () => {
    if (sample || !editable) { void payPromptRef.current(); return; }
    if (liveUpToDate && siteStatus === "published") { void askConfirm({ title: "이미 공개했어요", message: "공개한 홈페이지가 지금 내용과 같아요.", confirmLabel: "확인", cancelLabel: null }); return; }
    if (busy) return;
    void publishRef.current();
  }, embedded && phase === "ready" && !!draft);
  /* 휴대폰 아래 막대 … 메뉴의 '홈페이지 저장' — 머리줄 · 도구 알약의 저장과 같다. 고친 게 없으면 알린다 */
  useStudioCommand("homepage-save", () => {
    if (!editable || sample) { void payPromptRef.current(); return; }
    if (busy) return;
    if (!unsaved) { void askConfirm({ title: "저장됨", message: "저장할 고친 내용이 없어요.", confirmLabel: "확인", cancelLabel: null }); return; }
    void saveRef.current();
  }, embedded && phase === "ready" && !!draft);

  /* 공개 주소 — 공개했으면 손님이 여는 주소, 아직이면 공개하면 생길 주소(지금 적어 둔 주소 끝부분) */
  const livePublished = site?.status === "published";
  const stripSlug = (livePublished ? site?.publishedSlug ?? site?.slug : draft?.slug || site?.slug) ?? "";
  const stripPath = stripSlug ? `/launch/${stripSlug}` : "";
  const [stripHost, setStripHost] = useState("oneulstart.com");
  useEffect(() => { setStripHost(window.location.host); }, []);
  const stripBadge = sample ? "예시" : livePublished ? (liveUpToDate || !editable ? "공개 중" : "공개 중 · 고친 내용 공개 전") : site?.status === "unpublished" ? "공개 멈춤" : "공개 전";
  /* 미리보기를 맨 위(첫 화면)로 — 카드 본문과 휴대폰 틀 둘 다 */
  const scrollPreviewTop = () => {
    const behavior: ScrollBehavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    document.getElementById(PRO_SCROLL_ID)?.scrollTo({ top: 0, behavior });
    document.querySelector<HTMLElement>(`#${PRO_SCROLL_ID} .hk-phone, #${PRO_SCROLL_ID} [data-hp-phone]`)?.scrollTo({ top: 0, behavior });
  };
  /*
   * 가운데 알약 — '⟳ 첫 화면 /launch/…-b788' + 휴대폰/컴퓨터. 바뀔 때만 새로 만든다(등록이 되풀이되지 않게).
   * 주소는 가운데를 줄여(앞 몇 글자 … 끝 꼬리) 1440 에서도 끝에서 잘리지 않게 한다 — 전체 주소는 title · 낭독기 이름에(점검 2026-10-24)
   */
  const centerNode = useMemo(() => {
    if (!studioPro || !hasCenter) return null;
    /* lovable 구조 2단계 — 위 막대 가운데는 기기 전환만(새로고침은 위 막대, '첫 화면'은 아래 떠 있는 도구 알약) */
    if (nav?.toolbarTools) return <span className={styles.pill}>{deviceSwitch}</span>;
    const fullUrl = stripPath ? `${stripHost}${stripPath}` : "";
    return <span className={styles.pill}>
      <button type="button" className={styles.pillHome} onClick={scrollPreviewTop} title={fullUrl ? `첫 화면 맨 위부터 보기 — ${fullUrl}` : "첫 화면 맨 위부터 보기"} aria-label={`첫 화면 맨 위부터 보기${fullUrl ? ` (${fullUrl})` : ""}`}>
        {/* 주소는 바로 아래 주소 줄에 한 번만 보인다(PC 점검 2026-10-24: 알약과 주소 줄에 두 번) — 알약은 페이지 이름과 휴대폰/컴퓨터만 */}
        <RotateCw size={14} aria-hidden /><span className={styles.pillLabel}>첫 화면</span>
      </button>
      <span className={styles.pillRule} aria-hidden="true" />
      {deviceSwitch}
    </span>;
  }, [studioPro, hasCenter, stripPath, stripHost, previewView]); // eslint-disable-line react-hooks/exhaustive-deps -- deviceSwitch·scrollPreviewTop 은 previewView 로만 바뀐다
  useStudioHeaderCenter(centerNode);
  /* '내 주소 연결' — 아래 설정의 '내 도메인 연결' 칸을 펼쳐 데려간다(앱 안에서는 그 칸이 없어 단추도 없다) */
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(nativePlatform() !== null); }, []);
  const openDomain = () => {
    const fold = document.getElementById("hk-domain");
    if (fold instanceof HTMLDetailsElement) fold.open = true;
    fold?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  /*
   * lovable 구조 2단계 — 미리보기 판 아래 가운데 떠 있는 도구 알약(시안 PcStudio: 커서/글자/펜/댓글 자리). 홈페이지일 때만.
   * 기존 기능 그대로: 직접 고치기(빌더 열기) · 대화로 고치기 · 첫 화면 맨 위로 · 내 주소 연결. 위 주소 줄의 같은 단추는 접는다.
   */
  const floatTools = studioPro && !!nav?.toolbarTools;
  const chatEditOpen = embedded && HOMEPAGE_CHAT_EDIT_OPEN && !!nav?.composeInChat && editable;
  const floatingTools = floatTools ? <div className={styles.floatTools} role="toolbar" aria-label="홈페이지 도구">
    {editable && <button type="button" className={styles.floatTool} disabled={busy} onClick={() => setBuilderOpen(true)} title="글과 사진 직접 고치기"><Pencil size={15} aria-hidden /><span>직접 고치기</span></button>}
    {editable && <button type="button" className={styles.floatTool} aria-label={saveLabel} title={saveLabel} disabled={busy || !unsaved} data-done={!unsaved && action !== "saving" || undefined} onClick={() => void saveRef.current()}>{action === "saving" ? <Spinner /> : unsaved ? <Save size={15} aria-hidden /> : <Check size={15} aria-hidden />}<span>{saveLabel}</span></button>}
    {chatEditOpen && <button type="button" className={styles.floatTool} onClick={() => nav?.composeInChat?.({ target: "homepage", label: "홈페이지" })} title="대화로 고치기"><MessageSquare size={15} aria-hidden /><span>대화로 고치기</span></button>}
    <button type="button" className={styles.floatTool} data-icon-only="" onClick={scrollPreviewTop} aria-label="첫 화면 맨 위부터 보기" title="첫 화면 맨 위부터 보기"><ArrowUpToLine size={15} aria-hidden /></button>
    {editable && !inApp && <button type="button" className={styles.floatTool} data-icon-only="" onClick={openDomain} aria-label={site?.customDomain ? `내 주소 ${site.customDomain}` : "내 주소 연결"} title={site?.customDomain ? site.customDomain : "내 주소 연결"}><Link2 size={15} aria-hidden /></button>}
  </div> : null;
  const strip = studioPro ? <div className={styles.strip}>
    {/* 좁은 PC(1180px 이하)는 주소 가운데를 줄여(앞 몇 글자 … 끝 꼬리) 끝이 잘리지 않게 — 전체 주소는 title 에 */}
    <span className={styles.stripUrl} title={`${stripHost}${stripPath}`}><Globe size={14} aria-hidden /><b>{stripHost}</b><span className={styles.stripPathFull}>{stripPath}</span>{stripSlug && <span className={styles.stripPathShort} aria-hidden="true">/launch/{shortSlug(stripSlug)}</span>}</span>
    <StatusBadge tone={livePublished ? "success" : "neutral"} className={styles.stripBadge}>{stripBadge}</StatusBadge>
    <span className={styles.stripGap} />
    {/* 휴대폰/컴퓨터 — 보통은 머리줄 가운데 알약에. 알약을 못 그리거나 머리줄 가운데가 비좁은 PC(1120px 이하)면 여기에 */}
    <span className={styles.stripDevice} data-always={hasCenter ? undefined : ""}>{deviceSwitch}</span>
    {/*
      결제 전(홈페이지만 · 계획서도 결제 전 · 예시 사업)에는 칸 위 줄에 단추를 두지 않는다 — 같은 결제 안내를 여는 머리줄 [공개하기] 하나(대표 결정 r40·r40-2).
      예시 사업은 왼쪽 대화 칸의 '대화로 내 사업 시작하기'로 내 사업을 시작한다. 주소·상태는 그대로
    */}
    {editable && !floatTools && <>
      {!inApp && <button type="button" className={`${styles.stripBtn} ${styles.stripSoft}`} onClick={openDomain}><Link2 size={14} aria-hidden />{site?.customDomain ? site.customDomain : "내 주소 연결"}</button>}
      <button type="button" className={styles.stripBtn} disabled={busy} onClick={() => setBuilderOpen(true)}><Pencil size={14} aria-hidden />직접 고치기</button>
    </>}
    {livePublished && publicPath && <a className={styles.stripIcon} href={publicPath} target="_blank" rel="noreferrer" aria-label="공개한 홈페이지 새 창으로 열기" title="새 창으로 보기"><ExternalLink size={15} aria-hidden /></a>}
  </div> : null;

  /*
   * 3단계: 대화로 홈페이지 고치기 — 작업실 대화 칸이 이 핸들러로 "이렇게 바꿀게요" 카드를 만들고 적용·되돌린다.
   * 편집기의 AI 수정과 같은 유료 경로(POST …/landing/ai-edit, 토큰 차감)를 쓰고, 적용은 편집기가 AI 결과를 받을 때와 같은 규칙,
   * 저장은 이 화면의 저장(saveDraft — 다른 화면에서 먼저 저장됐으면 막힌다)으로 한다. 공개는 하지 않는다(사장님이 [새 버전 공개]를 누른다).
   * 핸들러는 칸이 살아 있는 동안 한 번만 등록하고, 지금 값은 live 에서 읽는다(다시 그릴 때마다 등록이 되풀이되지 않게).
   */
  const live = useRef({ phase, blocked, draft, editable, sample, planPaid, builderOpen, aiFilling, projectId, saveDraft, screenPlanId, site });
  live.current = { phase, blocked, draft, editable, sample, planPaid, builderOpen, aiFilling, projectId, saveDraft, screenPlanId, site };
  type ChatEdit = { projectId: string; page: string; before: Record<string, string>; patch: Record<string, string>; status: "proposed" | "applied"; snapshot?: Record<string, string | null>; appliedValues?: Record<string, string> };
  const chatEdits = useRef(new Map<string, ChatEdit>());
  const chatEditBusy = useRef(false);
  /* 토큰이 모자라 대화로 고치지 못했을 때 — 홈페이지 칸에 [토큰 충전하기]를 띄운다 */
  const [tokenShortage, setTokenShortage] = useState(false);
  /* 대화 칸에 '이렇게 바꿀게요' 카드가 떠 있는 동안 바뀔 글 자리 — 미리보기에서 '바꿀 곳'으로 짚는다(적용·취소하면 지운다) */
  const [pick, setPick] = useState<{ ids: string[]; texts: string[] } | null>(null);
  /* 바뀐 글을 미리보기에서 잠깐 반짝인다 — 글 자리를 못 찾으면(휴대폰 모양 미리보기) 미리보기 전체를 */
  const flashPreview = useCallback((ids: string[]) => {
    window.setTimeout(() => {
      const root = document.getElementById("hk-preview");
      if (!root) return;
      const frames: Keyframe[] = [{ outline: "3px solid rgba(37, 99, 235, 0.9)", outlineOffset: "2px", backgroundColor: "rgba(37, 99, 235, 0.12)" }, { outline: "3px solid rgba(37, 99, 235, 0)", outlineOffset: "2px", backgroundColor: "rgba(37, 99, 235, 0)" }];
      const hits = ids.flatMap(id => [...root.querySelectorAll<HTMLElement>(`[data-bw-text="${CSS.escape(id)}"]`)]);
      const targets = hits.length ? hits : [root.querySelector<HTMLElement>(".hk-preview-body")].filter((el): el is HTMLElement => !!el);
      // 바뀐 글이 미리보기 아래쪽이면 반짝임이 화면 밖에서 일어나 무엇이 바뀌었는지 안 보였다 — 처음 바뀐 곳을 가운데로
      hits[0]?.scrollIntoView?.({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      for (const el of targets) el.animate?.(frames, { duration: 2200, easing: "ease-out" });
    }, 150);
  }, []);
  useEffect(() => {
    if (!embedded || !nav?.registerEditHandler) return;
    const edits = chatEdits.current;
    /* 지금 대화로 고칠 수 있는지 — 안 되면 다음에 할 일을 담은 한국어 문장으로 멈춘다 */
    /*
     * 결제·로그인이 먼저면 대화 카드에 [다시 시도] 대신 그 단추를 붙여 던진다(대화 칸이 studioEditAction 으로 읽는다) —
     * 예전엔 결제 전에 보내면 '홈페이지 칸의 [결제…]를 눌러 주세요'와 뜻 없는 [다시 시도]만 나왔다(여정 점검 2026-10-23).
     * 이 처리기는 한 번만 등록되므로 결제 주소는 그때그때 live 값으로 만든다(blockedHref 는 첫 화면 값에 묶인다).
     */
    const withAction = (message: string, label: string, href: string) => Object.assign(new Error(message), { action: { label, href } });
    const payLink = (now: typeof live.current) => {
      const state = loadState();
      const plan = (now.screenPlanId ? state.plans.find(item => item.id === now.screenPlanId) : null) ?? activePlan(state);
      return plan ? `/plan/pay?planId=${encodeURIComponent(plan.id)}&planType=${encodeURIComponent(plan.planType)}&product=${now.planPaid ? "homepage" : "bundle"}` : "/plan/pay?product=homepage";
    };
    const usable = (forSave: boolean) => {
      const now = live.current;
      if (now.phase === "loading") throw new Error("홈페이지를 아직 불러오고 있어요. 잠시 후 다시 말씀해 주세요.");
      if (now.phase === "blocked") {
        const cta = now.blocked.cta;
        if (cta === "pay") throw withAction("홈페이지는 결제한 뒤 대화로 고칠 수 있어요.", "결제하러 가기", payLink(now));
        if (cta === "login") throw withAction("로그인한 뒤 대화로 고칠 수 있어요.", "로그인하기", `/account?next=${encodeURIComponent(now.screenPlanId ? homepageHref(now.screenPlanId) : "/plan/homepage")}`);
        throw new Error(cta === "plan" ? "먼저 사업계획서를 만들어 주세요 — 홈페이지는 계획서에 답한 내용으로 만들어요." : `${now.blocked.title}. 홈페이지 화면을 확인해 주세요.`);
      }
      if (now.sample) throw new Error("예시 홈페이지는 고칠 수 없어요. 내 사업으로 만들면 대화로 고칠 수 있어요.");
      if (!now.draft || !now.projectId) throw new Error("홈페이지를 아직 불러오지 못했어요. 홈페이지 화면을 확인해 주세요.");
      if (!now.editable) throw now.planPaid ? withAction("홈페이지 결제 후 대화로 고칠 수 있어요.", "결제하고 홈페이지 고치기", payLink(now)) : withAction("홈페이지는 사업계획서와 함께 결제한 뒤 대화로 고칠 수 있어요.", "함께 결제하기", payLink(now));
      const bw = now.draft.pageData?.brainwave;
      if (!now.draft.pageData || !bw) throw new Error("이 홈페이지는 대화로 고칠 수 없어요. 홈페이지 화면의 편집기에서 직접 고쳐 주세요.");
      if (now.aiFilling) throw new Error("AI가 계획서로 홈페이지를 채우는 중이에요. 끝난 뒤 다시 말씀해 주세요.");
      if (now.builderOpen) throw new Error("홈페이지 편집기가 열려 있어요. 편집기를 닫은 뒤 다시 말씀해 주세요.");
      if (forSave && (chatEditBusy.current || requestRef.current)) throw new Error("저장하는 중이에요. 끝난 뒤 다시 눌러 주세요.");
      return { draft: now.draft, pageData: now.draft.pageData, bw, projectId: now.projectId, saveDraft: now.saveDraft, published: now.site?.status === "published" };
    };
    /* 글 묶음을 바꿔 저장한다 — 실패하면 화면의 초안을 바꾸기 전으로 돌리고(카드는 그대로라 다시 누를 수 있다) 이유를 알린다 */
    const saveTexts = async (texts: Record<string, string>, failVerb: string) => {
      const { draft: previous, pageData, bw, saveDraft: save } = usable(true);
      const next = { ...previous, pageData: { ...pageData, brainwave: { ...bw, texts } } };
      chatEditBusy.current = true;
      try { await save(next); }
      catch (error) {
        if (mounted.current) setDraft(value => value === next ? previous : value);
        if (error instanceof LandingSaveError && error.code === "LANDING_DRAFT_CONFLICT") throw new Error(`다른 화면에서 먼저 저장된 내용이 있어 ${failVerb}지 못했어요. 홈페이지 화면에서 [최신 내용 불러오기]를 누른 뒤 다시 말씀해 주세요.`);
        if (error instanceof LandingSaveError && error.code === LANDING_LOGIN_REQUIRED) throw new Error(`로그인이 풀려 ${failVerb}지 못했어요. 다시 로그인한 뒤 다시 눌러 주세요.`);
        throw new Error(`저장하지 못해 ${failVerb}지 않았어요. ${userErrorMessage(error, "잠시 후 다시 눌러 주세요.")}`);
      } finally { chatEditBusy.current = false; }
    };
    const handler: StudioEditHandler = {
      /* 결제 전(편집 불가)·예시·로그인 전·불러오는 중에는 대화 칸이 "대화로 고치기" 권유를 띄우지 않게 — 예전엔 결제 전에도 권했다 */
      available: () => HOMEPAGE_CHAT_EDIT_OPEN && live.current.phase !== "blocked" && live.current.phase !== "loading" && !live.current.sample && live.current.editable,
      async propose(instruction) {
        const text = instruction.trim();
        if (text.length < 2) throw new Error("무엇을 어떻게 바꿀지 조금 더 적어 주세요.");
        if (text.length > 1000) throw new Error("지시가 너무 길어요 — 1,000자 안으로 줄여 주세요.");
        const { draft: current, bw, projectId: target } = usable(false);
        const before = { ...bw.texts };
        const epoch = planOwnerEpoch();
        const business = { name: current.businessName.slice(0, 120), summary: (current.subheadline || current.offerDescription || "").slice(0, 600) };
        const meta = loadBrainwavePage(bw.page).catch(() => null);
        let res: Response;
        try {
          // AI 는 1분 안에 답한다(서버 시간 제한) — 조금 넉넉히 기다린다
          res = await fetchWithTimeout(`/api/projects/${encodeURIComponent(target)}/landing/ai-edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction: text, page: bw.page, texts: before, business }) }, 75_000);
        } catch (error) {
          throw new Error(isTimeoutError(error) ? "AI 답이 늦어 기다리기를 멈췄어요. 잠시 후 다시 말씀해 주세요." : "연결이 끊겼어요. 연결을 확인하고 다시 말씀해 주세요.");
        }
        const data = await res.json().catch(() => ({})) as { texts?: Record<string, string>; usage?: { inputTokens?: number; outputTokens?: number }; balance?: { remaining?: number } | null; error?: { code?: string; message?: string } };
        if (!mounted.current || epoch !== planOwnerEpoch()) throw new Error("계정이나 화면이 바뀌어 결과를 보여 드리지 않았어요. 다시 말씀해 주세요.");
        if (!res.ok) {
          const message = aiEditErrorMessage(res.status, data.error?.code, data.error?.message);
          const planId = live.current.screenPlanId;
          if (data.error?.code === "TOKENS_REQUIRED") {
            setTokenShortage(true);
            if (planId) throw withAction(message, "AI 수정 충전하기", `/plan/pay?planId=${encodeURIComponent(planId)}&product=tokens`);
          }
          if (data.error?.code === "HOMEPAGE_PAYMENT_REQUIRED" || res.status === 402 && !data.error?.code) throw withAction(message, "결제하러 가기", payLink(live.current));
          throw new Error(message);
        }
        setTokenShortage(false);
        const changes = aiEditChanges({ patch: data.texts ?? {}, texts: before, page: await meta });
        const cost = aiEditCostLine(data.usage, data.balance);
        if (!changes.length) throw new Error(`AI가 바꿀 글을 찾지 못했어요. 어느 부분을 어떻게 바꿀지 조금 더 구체적으로 말씀해 주세요.${cost ? ` (${cost})` : ""}`);
        const id = `homepage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        edits.set(id, { projectId: target, page: bw.page, before, patch: Object.fromEntries(changes.map(change => [change.id, change.after])), status: "proposed" });
        if (mounted.current) setPick({ ids: changes.map(change => change.id), texts: changes.map(change => change.before) });
        /* 오래된 카드는 잊는다(적용한 것은 되돌리기를 위해 남긴다) */
        for (const [key, value] of edits) if (edits.size > 30 && value.status === "proposed" && key !== id) edits.delete(key);
        return { id, target: "homepage", summary: aiEditSummary(changes), changes: changes.map(({ label, before: was, after }) => ({ label, before: was, after })), cost };
      },
      async apply(proposalId) {
        const edit = edits.get(proposalId);
        if (!edit) throw new Error("이 제안은 더 이상 쓸 수 없어요. 다시 말씀해 주세요.");
        if (edit.status === "applied") return;
        const { bw, projectId: target, published } = usable(true);
        if (target !== edit.projectId || bw.page !== edit.page) throw new Error("제안을 만든 뒤 홈페이지 디자인이 바뀌었어요. 다시 말씀해 주시면 지금 디자인으로 새로 만들어 드려요.");
        const result = applyAiEditPatch(bw.texts, edit.before, edit.patch);
        if (!result.applied.length && result.conflicts.length) throw new Error("제안을 만든 뒤 같은 글을 직접 고치셔서 바꾸지 않았어요. 다시 말씀해 주시면 지금 글로 새로 만들어 드려요.");
        if (result.applied.length) await saveTexts(result.texts, "바꾸");
        edit.status = "applied";
        edit.snapshot = result.snapshot;
        edit.appliedValues = Object.fromEntries(result.applied.map(id => [id, result.texts[id]]));
        if (mounted.current) {
          setMessage(`대화로 고친 글을 저장했어요${result.conflicts.length ? ` · 직접 고친 ${result.conflicts.length}곳은 그대로 두었어요` : ""}.${published ? " 손님 화면에는 [새 버전 공개]를 눌러야 반영돼요." : ""}`);
          setPick(null);
          flashPreview(result.applied);
        }
      },
      dismiss(proposalId) {
        if (mounted.current) setPick(null);
        if (edits.get(proposalId)?.status !== "applied") edits.delete(proposalId);
      },
      async undo(proposalId) {
        const edit = edits.get(proposalId);
        if (!edit || edit.status !== "applied" || !edit.snapshot || !edit.appliedValues) throw new Error("되돌릴 수 있는 바꾸기가 없어요.");
        const { bw, projectId: target } = usable(true);
        if (target !== edit.projectId || bw.page !== edit.page) throw new Error("바꾼 뒤 홈페이지 디자인이 바뀌어 되돌릴 수 없어요. 홈페이지 화면의 편집기에서 직접 고쳐 주세요.");
        const result = undoAiEditPatch(bw.texts, edit.snapshot, edit.appliedValues);
        if (!result.restored.length && Object.keys(edit.snapshot).length) throw new Error("바꾼 뒤 같은 글을 직접 고치셔서 되돌릴 곳이 없어요.");
        if (result.restored.length) await saveTexts(result.texts, "되돌리");
        /* 되돌린 카드는 다시 [바꾸기]할 수 있다 */
        edit.status = "proposed"; edit.snapshot = undefined; edit.appliedValues = undefined;
        if (mounted.current) {
          setMessage(`바꾸기 전으로 되돌렸어요${result.kept.length ? ` · 그 뒤에 직접 고친 ${result.kept.length}곳은 그대로 두었어요` : ""}.`);
          flashPreview(result.restored);
        }
      },
    };
    return nav.registerEditHandler("homepage", handler);
  }, [embedded, nav, flashPreview]);
  /* 계정이 바뀌거나 칸이 닫히면 이전 카드는 쓸 수 없다 — 등록을 다시 하는 것과는 따로(다시 등록해도 카드는 살아 있게) */
  useEffect(() => {
    const edits = chatEdits.current;
    const unsubscribe = subscribePlanOwnerChange(() => { edits.clear(); setPick(null); });
    return () => { unsubscribe(); edits.clear(); };
  }, []);
  const tokenPayHref = screenPlanId ? `/plan/pay?planId=${encodeURIComponent(screenPlanId)}&product=tokens` : "";

  const back =screenPlanId && !sample ? `/plan/document?planId=${encodeURIComponent(screenPlanId)}` : "/plan";
  /* 이 화면의 사업 — 공개 뒤 다음 단계와 '개업 준비 먼저 하기'에 쓴다(이 기기에 저장된 사업) */
  const screenPlan = phase === "ready" && screenPlanId && !sample ? loadState().plans.find(item => item.id === screenPlanId) ?? null : null;
  /* 계획서에 가게 이름 후보가 있는데 아직 이름을 정하지 않았는지 — 설명 같은 이름이면 공개 전 '채울 것'에 가게 이름을 넣는다 */
  const screenCoach = screenPlan ? readCoach(screenPlan.answers) : null;
  const nameCandidates = Boolean(screenCoach && !screenCoach.business.nameConfirmed && (screenCoach.design?.identity?.names?.length ?? 0) > 0);
  nameCandidatesRef.current = nameCandidates;
  const screenNext = screenPlan ? journeyNext(screenPlan, "published") : screenPlanId ? { href: launchHref(screenPlanId), title: `${journeyLabel("launch")}하기`, note: "업종 신고·사업자등록·결제·첫 홍보를 차례로 준비해요" } : null;

  const Root = embedded ? "div" : "main";
  return (
    /* 작업실 안이면 main 대신 칸 본문(div) — 저장·공개 단추는 작업실 머리줄(넓은 화면)·칸 맨 위 줄(좁은 화면)에. 머리줄이 없는 작업실이면 예전처럼 칸 위 도구 줄(actions) */
    /* 작업실 PC 새 배치(studioPro)면 바깥 스크롤 틀 대신 흰 카드 — 맨 위 공개 주소 줄(strip) + 그 아래만 굴러가는 본문 */
    <Root className={`${frame.page} ${styles.page}`} data-embedded={embedded ? "" : undefined} data-studio-pro={studioPro ? "" : undefined} onClickCapture={paneLinkCapture(nav, screenPlanId)}><BusinessAppChrome title="홈페이지" backHref={back} actions={studioHeader ? undefined : headerActions}>
    <div className={studioPro ? styles.proCard : styles.frameScroll}>{strip}{floatingTools}<div className={studioPro ? styles.proScroll : styles.frameInner} id={studioPro ? PRO_SCROLL_ID : undefined}>
      {/* 작업실 좁은 화면 — 머리줄 대신 칸 맨 위에 저장·공개(넓은 화면에서는 머리줄 단추가 같은 일을 한다) */}
      {/* lovable 구조 2단계 — 아래 100px 막대(공개하기 · … 안의 저장)가 있는 작업실 휴대폰은 같은 단추를 칸 위에 두지 않는다. 막대에 없는 미리보기 크기 · 공개됨 메뉴(주소 복사 · 공개 멈추기)는 그대로 */}
      {studioHeader && nav?.toolbarTools ? <div className={`${styles.studioNarrowBar} ${paneHeader.narrowOnly}`}>{previewSwitch}{publishedMenu(styles.headerPrimary)}</div>
        : studioHeader && headerActions && <div className={`${styles.studioNarrowBar} ${paneHeader.narrowOnly}`}>{previewSwitch}{headerActions}</div>}
      {/* 휴대폰의 '대화로 고치기'는 미리보기 위 '홈페이지 고치기' 옆 작은 글 단추로 옮겼다(모바일 점검 r37: 고치는 길이 셋이었다) — chatEdit 참고 */}
      {/* 전체 화면 — 방문자가 보는 그대로 */}
      {fullscreen && draft && (
        <div ref={fullscreenRef} className={styles.fullscreen} role="dialog" aria-modal="true" aria-label="홈페이지 전체 화면">
          <button type="button" className={styles.fullscreenClose} onClick={() => setFullscreen(false)}>
            닫기 ✕
          </button>
          <div className={styles.fullscreenBody}>
            <LandingBlocksRenderer data={draft.pageData ?? createLandingPageData(draft, draft.templateId)} />
          </div>
        </div>
      )}
      {phase === "loading" && (
        <PlanLoading fill note="홈페이지를 불러오고 있어요" />
      )}

      {phase === "blocked" && (
        <div className={styles.center}>
          <p className={styles.centerTitle}>{blocked.title}</p>
          <p className={styles.centerNote}>{blocked.detail}</p>
          {blocked.missing.length > 0 && (
            <ul className={styles.missing}>
              {blocked.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <AppButton type="button" variant="primary" className={styles.cta} onClick={() => { if (blocked.cta === "retry") window.location.reload(); else go(blockedHref(blocked.cta)); }}>
            {blocked.cta === "retry" ? "다시 시도" : blocked.cta === "pay" ? "결제하러 가기" : blocked.cta === "login" ? "로그인하기" : blocked.cta === "list" ? "내 사업으로" : screenPlanId ? "계획서 이어 쓰기" : "대화로 사업 시작하기"}
            {/* 다른 화면으로 가는 단추만 끝에 '>'(대표 규칙 2026-10-24) — 다시 시도는 이 화면에서 하는 일 */}
            {blocked.cta === "retry" ? null : <ChevronRight size={18} aria-hidden="true" />}
          </AppButton>
        </div>
      )}

      {/*
        결제 전에는 만들어진 홈페이지를 보여만 준다.
        사기 전에 자기 사업이 어떻게 보이는지 확인할 수 있어야 한다.
      */}
      {/* 새 배치의 결제 전 보기 — 안내 상자 없이 사이트만 카드 끝까지. 결제 안내는 머리줄 [공개하기]의 확인창으로 */}
      {studioPro && draft && !editable && (
        <div className={styles.proPreview} data-view={previewView} aria-label="홈페이지 미리보기">
          {previewView === "mobile"
            ? <div className={styles.proPhone} data-hp-phone=""><div inert aria-hidden="true"><LandingBlocksRenderer data={draft.pageData ?? createLandingPageData(draft, draft.templateId)} /></div></div>
            : <div inert aria-hidden="true"><LandingBlocksRenderer data={draft.pageData ?? createLandingPageData(draft, draft.templateId)} /></div>}
        </div>
      )}
      {!studioPro && phase === "ready" && draft && !editable && (
        <div className={styles.previewWrap}>
          <div className={styles.payBar}>
            {/* 홈페이지만 결제할 때는 제목 없이 단추 하나 — 문구는 맨 위 줄 단추·공개 확인창과 같은 '결제하고 공개하기 · 금액'(대표 결정 r39) */}
            {(sample || !planPaid) && <div>
              <strong className={styles.payTitle}>{sample ? "예시 홈페이지" : `사업계획서 + 홈페이지 · ${price.toLocaleString("ko-KR")}원`}</strong>
            </div>}
            <div className={styles.payActions}>
              {sample ? (
                <AppButton as="a" variant="primary" className={styles.cta} href="/plan/chat?new=1">내 사업으로 만들기<ChevronRight size={18} aria-hidden="true" /></AppButton>
              ) : (
                <AppButton type="button" variant="primary" className={styles.cta} onClick={() => go(blockedHref("pay"))}>
                  {/* 화살표만 다음 줄로 떨어지지 않게 마지막 낱말과 붙인다(줄바꿈 없는 빈칸, 감사 r36) */}
                  {planPaid ? `결제하고 공개하기 · ${price.toLocaleString("ko-KR")}원` : "결제하기"}<ChevronRight size={18} aria-hidden="true" />
                </AppButton>
              )}
              {/* 홈페이지는 나중에 해도 된다 — 결제 단추 하나뿐이라 개업 준비로 넘어갈 길이 없었다(여정 점검 2026-10-22) */}
              {!sample && screenPlanId && <AppButton variant="text" className={styles.ctaSecondary} href={launchHref(screenPlanId)} onClick={() => setActivePlan(screenPlanId)}>
                {journeyLabel("launch", !!screenPlan && readCoach(screenPlan.answers)?.stage === "operating")} 먼저<ChevronRight size={16} aria-hidden="true" />
              </AppButton>}
            </div>
          </div>
          {/*
            전체 화면은 문서 화면과 같은 방식 — 미리보기 위에 떠 있는 버튼 하나.
            안내 줄에 나란히 두면 '수정하러 가기'와 무게가 같아 보여, 정작 눌러야
            할 것이 뭔지 흐려진다.
          */}
          <div className={styles.preview} aria-label="홈페이지 미리보기">
            <button type="button" className={styles.fsFloat} onClick={() => setFullscreen(true)} title="홈페이지만 화면 가득 보기">
              <Maximize2 size={14} /> 전체 화면
            </button>
            {/* 미리보기 속 사이트 제목(h1)·버튼은 화면 낭독기·Tab 에 잡히지 않게 — 보이는 그림일 뿐이다 */}
            <div inert aria-hidden="true"><LandingBlocksRenderer data={draft.pageData ?? createLandingPageData(draft, draft.templateId)} /></div>
          </div>
        </div>
      )}

      {/* 섹션 배치 편집기 — 화면을 덮고 열린다. 저장하면 초안의 pageData가 바뀐다 */}
      {builderOpen && draft && editable && (
        <LandingVisualBuilder
          key={builderKey}
          data={draft.pageData ?? createLandingPageData(draft, draft.templateId)}
          businessName={draft.businessName}
          projectId={projectId}
          businessSummary={draft.subheadline || draft.offerDescription}
          published={site?.status === "published"}
          liveUrl={site?.status === "published" && typeof window !== "undefined" ? `${window.location.origin}${publicPath}` : null}
          appendix={appendixFromDraft(draft)}
          kit={{
            liveUpToDate,
            /* 홈페이지 화면에서 고치고 아직 저장 안 한 것(분위기 색 등) — 편집기가 '저장됨'이라 하지 않고 함께 저장한다 */
            pendingOutside: !!site && landingDraftFingerprint(draft) !== landingDraftFingerprint(site.draft),
            onEditAddress: () => { setBuilderOpen(false); setSlugFocus(n => n + 1); },
            onReloadLatest: () => void reloadLatest(),
            /* 작업실 PC 에서 '컴퓨터'로 보고 있었으면 편집기도 컴퓨터 폭으로(아주 좁은 화면은 늘 휴대폰) */
            initialView: previewView === "pc" && wideScreen ? "pc" : "mobile",
          }}
          onPublish={async () => {
            const result = await publish();
            if (!result.ok && result.cancelled) return { cancelled: true as const };
            return result.ok ? { url: `${window.location.origin}/launch/${result.site.publishedSlug ?? result.site.slug}` } : { error: result.message };
          }}
          onClose={() => setBuilderOpen(false)}
          onSave={async (pageData) => {
            await saveDraft({ ...draft, pageData });
            // 킷 에디터는 자동 저장하며 열려 있어야 한다(닫기는 에디터의 닫기로). 옛 블록 편집기만 저장하면 닫는다
            if (!pageData.brainwave) setBuilderOpen(false);
          }}
        />
      )}

      {/*
        * 자유 편집이 이 화면의 주된 행동이다.
        *
        * 예전에는 "섹션 넣고 빼고 순서 바꾸기"라는 이름으로 제목보다 위, 테두리만
        * 있는 작은 단추로 놓여 있었다. 무엇을 여는 단추인지 읽히지 않아 그 아래
        * 설정들과 같은 무게로 보였다.
        *
        * 이름을 하는 일로 바꾸고, 무슨 화면이 열리는지 한 줄 붙여 맨 위에 크게 둔다.
        */}
      {phase === "ready" && draft && editable && !draft.pageData?.brainwave && (
        <button type="button" className={styles.builderOpen} onClick={() => setBuilderOpen(true)}>
          <span className={styles.builderOpenIcon}><LayoutTemplate size={18} /></span>
          <span className={styles.builderOpenText} title="글을 누르면 그 자리에서 고치고, 사진을 누르면 바꿔요">
            <strong>자유 편집 열기</strong>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}

      {/* 저장이 막혔을 때 다음 할 일 — 로그인이 풀렸으면 다시 로그인, 다른 화면에서 먼저 저장됐으면 최신 내용 불러오기/계속 고치기 */}
      {phase === "ready" && draft && editable && saveTrouble && !builderOpen && (
        <div className={styles.aiFillNotice} role="alert">
          <span>{saveTrouble === "login" ? LANDING_LOGIN_MESSAGE : "다른 화면에서 먼저 저장된 내용이 있어요. 최신 내용을 불러오거나, 지금 고친 내용으로 계속 고칠 수 있어요."}</span>
          {saveTrouble === "login"
            ? <AppButton variant="primary" size="small" className={styles.troubleLink} href={blockedHref("login")}>다시 로그인하기</AppButton>
            : <><AppButton variant="secondary" size="small" type="button" disabled={busy} onClick={() => void reloadLatest()}>최신 내용 불러오기</AppButton><AppButton variant="text" size="small" type="button" onClick={() => setSaveTrouble(null)}>계속 고치기</AppButton></>}
        </div>
      )}

      {/* 대화로 고치려다 AI 수정 토큰이 모자랐을 때 — 충전하러 가는 단추(대화 칸의 안내가 이 단추를 가리킨다) */}
      {phase === "ready" && draft && editable && tokenShortage && tokenPayHref && (
        <p className={styles.aiFillNotice} role="status">
          <span>AI 수정 횟수를 다 써서 대화로 홈페이지를 고치지 못했어요. 충전한 뒤 대화에서 다시 말씀해 주세요.</span>
          <AppButton variant="primary" size="small" type="button" onClick={() => go(tokenPayHref)}>AI 수정 충전하기</AppButton>
          <AppButton variant="text" size="small" type="button" onClick={() => setTokenShortage(false)}>닫기</AppButton>
        </p>
      )}

      {/* 처음 저절로 채우기가 실패했을 때 — 한 줄 안내와 다시 채우기(누를 때만 다시 돈다) */}
      {phase === "ready" && draft && editable && aiFillFailed && !aiFilling && projectId && site && (
        <p className={styles.aiFillNotice} role="status">
          <span>AI로 다듬지 못해 계획서 답을 그대로 넣었어요. 직접 고치거나 [다시 채우기]를 눌러 주세요.</span>
          <AppButton variant="secondary" size="small" type="button" disabled={busy} onClick={() => {
            if (landingDraftFingerprint(draft) !== landingDraftFingerprint(site.draft)) { setMessage("저장하지 않은 수정이 있어요. 먼저 저장한 뒤 다시 채워 주세요."); return; }
            void runAiFill(projectId, site.updatedAt, false);
          }}>다시 채우기</AppButton>
        </p>
      )}

      {/* 킷 페이지 — 편집은 미리보기를 눌러 열고, 밖에는 사업자 정보·도메인·문의만 */}
      {phase === "ready" && draft && editable && draft.pageData?.brainwave && (
        <HomepageKitPanel
          inChrome
          planId={screenPlanId}
          draft={draft}
          site={site}
          projectId={projectId}
          publicPath={publicPath}
          action={action}
          message={message}
          messageAlert={messageAlert}
          onChange={updateDraft}
          onSave={save}
          onPublish={publish}
          onUnpublish={unpublish}
          slugError={slugError}
          slugFocus={slugFocus}
          onOpenEditor={() => setBuilderOpen(true)}
          onSiteUpdated={updateSite}
          onSourceApplied={applySourceSite}
          nameCandidates={nameCandidates}
          previewView={studioHeader ? previewView : undefined}
          studio={studioPro}
          /* 휴대폰에서는 오른쪽 칸이 없어 대화 칸이 '홈페이지를 대화로 고치기'를 권하지 못한다 — 여기서 대화로 보낸다(결제 전·불러오는 중이면 숨김) */
          onChatEdit={embedded && HOMEPAGE_CHAT_EDIT_OPEN && nav?.composeInChat && editable ? () => nav.composeInChat?.({ target: "homepage", label: "홈페이지" }) : undefined}
          pick={pick}
          aiFill={projectId && site && !sample ? {
            running: aiFilling,
            /* 디자인을 바꾼 뒤 '이 디자인에 맞게 AI로 다시 채우기' — 바꾼 디자인은 아직 저장 전이라 먼저 저장하고 채운다 */
            run: () => void (async () => {
              if (draft && landingDraftFingerprint(draft) !== landingDraftFingerprint(site.draft)) {
                try { await saveDraft(draft); } catch { return; }
              }
              const latest = siteRef.current;
              if (latest) void runAiFill(projectId, latest.updatedAt, false);
            })(),
          } : undefined}
        />
      )}

      {phase === "ready" && draft && editable && !draft.pageData?.brainwave && (
        <LandingQuickEditor
          draft={draft}
          action={action === "unpublishing" ? "publishing" : action}
          message={message}
          published={site?.status === "published"}
          unpublishedEdits={hasUnpublishedEdits(site, draft)}
          /* 공개 전 주소는 아직 없다(열면 404) — 공개한 뒤에만 주소와 '열기'를 보인다 */
          publicPath={site?.status === "published" ? publicPath : ""}
          projectId={projectId}
          customDomain={site?.customDomain ?? ""}
          demo={false}
          onChange={updateDraft}
          onReset={() => site && setDraft(site.draft)}
          onSave={save}
          onPublish={publish}
          onPreview={() => (site?.status === "published" && publicPath ? window.open(publicPath, "_blank", "noopener") : setFullscreen(true))}
          onSiteUpdated={updateSite}
          onOpenEditor={() => setBuilderOpen(true)}
        />
      )}

      {/* 공개한 뒤의 다음 단계는 하나 — 유지보수(홈페이지 고치기, 문의·실적 관리) */}
      {/* 다음 단계 두 개를 나란히 — 예전엔 화면 끝까지 넓은 띠 두 개라 글씨만 작아 보였다(소유자 지적 2026-10-07) */}
      {/* 다음 단계는 단계 순서(journey.ts)대로 — 개업 준비를 아직 안 했으면 그것부터, 했으면 유지보수(예전엔 4단계를 건너뛰었다) */}
      {phase === "ready" && site?.status === "published" && screenPlanId && !sample && screenNext && <div className={styles.nextRow}>
        <Link className={styles.nextCare} href={screenNext.href} onClick={() => setActivePlan(screenPlanId)}>
          <span>다음 단계</span>
          <strong className={styles.nextTitle}>{screenNext.title}<ChevronRight size={18} aria-hidden="true" /></strong>
          <small>{screenNext.note}</small>
        </Link>
        {/* 그다음 — 홍보 상담(목록은 유지보수 화면 한 곳에) */}
        <NextServicesCard planId={screenPlanId} className={styles.nextCard} />
      </div>}
    </div></div>
    </BusinessAppChrome></Root>
  );
}
