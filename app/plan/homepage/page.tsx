"use client";

import { announceHomepageStatus } from "../use-homepage";
import { appendixFromDraft } from "../../../components/public-appendix-preview";
import { apiMessage, fetchWithTimeout, isTimeoutError, koreanText, userErrorMessage } from "../../../lib/client/user-error";
import { loadAuthSession } from "../../../lib/client/auth-session";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutTemplate, Maximize2, ArrowRight } from "lucide-react";
import dynamic from "next/dynamic";
import { LandingQuickEditor } from "../../../components/landing-quick-editor";
import { HomepageKitPanel, homepageMissingInfo, withBusinessName } from "../../../components/homepage-kit-panel";
import { BUSINESS_TEMPLATE_PROFILES } from "../../../lib/landing/brainwave/business-content";
import { LandingBlocksRenderer } from "../../../components/landing-blocks";
import { createLandingPageData } from "../../../lib/landing/page-data";
import { landingDraftFromPlan } from "../../../lib/landing/from-plan";
import { aiFillLanded, aiFillMark, needsAutoAiFill } from "../../../lib/landing/ai-fill-auto";
import { SAMPLE_DOCS } from "../../../lib/plan-builder/samples";
import { koTextsFor } from "../../../lib/landing/brainwave/ko";
import { landingSlugIssue, type LandingDraft, type LandingSiteRecord } from "../../../lib/landing/domain";
import { hydrateFromServer, activePlan, lastHydrationFailed, loadState, isSamplePlan, planOwnerEpoch, setActivePlan, subscribePlanOwnerChange } from "../../../lib/plan-builder/plan-store";
import { LANDING_LOGIN_REQUIRED, LANDING_LOGIN_MESSAGE, LandingSaveError, persistLandingDraft } from "../../../lib/landing/save-client";
import { hasUnpublishedEdits, isLiveUpToDate, landingDraftFingerprint } from "../../../lib/landing/save-contract";
import Link from "next/link";
import styles from "./page.module.css";
import PlanLoading, { Spinner } from "../PlanLoading";
import BusinessAppChrome from "../BusinessAppChrome";
import { businessChatHref } from "../../../lib/plan-builder/business-hub";
import { homepageHref, journeyNext, launchHref } from "../../../lib/plan-builder/journey";
import { readCoach } from "../../../lib/plan-builder/coach";
import { NextServicesCard } from "../../../components/next-services";
import frame from "../chat/page.module.css";
import { Check, Rocket, Save } from "lucide-react";
import { HOMEPAGE_PRODUCT_AMOUNT } from "../../../lib/payments/domain";
import { askConfirm } from "../../../components/confirm-dialog";
import { useDialogFocus } from "../../../components/use-dialog-focus";

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

export default function PlanHomepagePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [blocked, setBlocked] = useState<{ title: string; detail: string; missing: string[]; cta: "pay" | "plan" | "login" | "retry" }>({
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
  const [message, setMessage] = useState("");
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
      setMessage(auto ? "" : "AI가 계획서로 홈페이지를 채웠어요. 마음에 안 드는 글은 에디터에서 바로 고칠 수 있어요.");
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
      else setMessage(apiMessage(data, "AI 채우기를 하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } catch {
      if (controller.signal.aborted || !current()) return;
      const filled = await recover().catch(() => null);
      if (!current()) return;
      if (filled) done(filled);
      else if (auto) setAiFillFailed(true);
      else setMessage("AI 채우기 연결이 끊겼어요. 잠시 후 다시 시도해 주세요.");
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
    document.addEventListener("click", confirmLink, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", confirmLink, true); };
  }, [unsaved]);

  useEffect(() => {
    let alive = true;
    let loadEpoch = planOwnerEpoch();
    (async () => {
      let state = await hydrateFromServer();
      const epoch = planOwnerEpoch();
      loadEpoch = epoch;
      /* 문서 화면의 '홈페이지 만들기'처럼 주소로 사업을 고르면 그 사업으로 연다 */
      const requested = new URLSearchParams(window.location.search).get("planId");
      if (requested && state.plans.some(item => item.id === requested)) { setActivePlan(requested); state = { ...state, activePlanId: requested }; }
      else if (requested) {
        /*
         * 주소로 고른 사업을 못 찾았으면 다른 사업으로 넘어가지 않는다 — 예전엔 마지막에 보던 사업으로 넘어가
         * 그 사업의 홈페이지를 만들고 AI 채우기까지 시작했다(다른 기기에서 만든 사업·목록을 못 불러온 때).
         */
        if (!alive) return;
        setBlocked({ title: "이 사업을 찾지 못했어요", detail: lastHydrationFailed() ? "사업 목록을 불러오지 못했어요. 연결을 확인하고 새로고침해 주세요." : "삭제했거나 다른 계정의 사업일 수 있어요. 내 사업에서 다시 골라 주세요.", missing: [], cta: "plan" });
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
          ? { ...draft, pageData: { ...draft.pageData, brainwave: { page, texts: koTextsFor(page, shopName || plan.title), images: {}, links: {}, sizes: {}, hidden: [], order: [] } } }
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
        setBlocked({ title: "결제 후 이용할 수 있어요", detail: "홈페이지 편집·공개는 결제 후 열려요. 사업계획서를 결제했다면 홈페이지만, 아직이라면 사업계획서 + 홈페이지로 함께 결제할 수 있어요.", missing: [], cta: "pay" });
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
          detail: "로그인하면 지금까지 쓴 내용이 저장되고, 그 내용으로 홈페이지를 만들 수 있어요.",
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
        else setMessage(userErrorMessage(error, "저장하지 못했어요."));
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
      if (!res.ok || !data.site) { setMessage(apiMessage(data, "최신 내용을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")); return; }
      // 편집기가 이 탭에 보관한 옛 수정본도 버린다 — 다시 열 때 '복구할까요?'가 뜨지 않게
      try { sessionStorage.removeItem(`oneul:homepage-editor:${projectId}`); } catch { /* 보관본이 없거나 막힌 브라우저 */ }
      siteRef.current = data.site; setSite(data.site); setDraft(data.site.draft);
      setSaveTrouble(null); setAction("idle"); setMessage("최신 내용을 불러왔어요.");
      setBuilderKey(key => key + 1);
    } catch {
      if (mounted.current) setMessage("최신 내용을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
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
    const missingInfo = siteRef.current?.status === "published" ? [] : homepageMissingInfo(draft);
    if (missingInfo.length && !await askConfirm({
      title: "비어 있는 사업자 정보가 있어요",
      message: `비어 있는 항목: ${missingInfo.join(", ")}. ${missingInfo.includes("개인정보 문의처") ? "문의 양식을 켜 두었다면 개인정보 문의처는 꼭 적어야 공개할 수 있어요." : "지금 공개해도 되지만, 손님에게 돈을 받기 전에는 채워 주세요."} 채울 곳은 아래 '사업자 정보'예요.`,
      cancelLabel: "채우러 가기",
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
      if (current()) setMessage(message);
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
      if (!res.ok || !data.site) { if (res.status === 401) setSaveTrouble("login"); setMessage(res.status === 401 ? LANDING_LOGIN_MESSAGE : apiMessage(data, "공개를 멈추지 못했어요. 잠시 후 다시 시도해 주세요.")); return; }
      siteRef.current = data.site; setSite(data.site);
      setMessage("공개를 멈췄어요. 손님 주소로는 열리지 않아요. ‘다시 공개’를 누르면 같은 주소로 다시 열려요.");
    } catch (error) {
      if (current()) setMessage(userErrorMessage(error, "연결을 확인하고 다시 시도해 주세요."));
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
      setMessage("다른 화면에서 초안이 바뀌었어요. 지금 수정한 내용은 그대로 두었어요. 최신 내용을 확인해 주세요.");
      return;
    }
    siteRef.current = next; setSite(next);
  };
  const applySourceSite = (next: LandingSiteRecord, expectedUpdatedAt: string) => {
    if (!mounted.current || requestRef.current || next.projectId !== projectId || siteRef.current?.updatedAt !== expectedUpdatedAt
      || !draft || landingDraftFingerprint(draft) !== landingDraftFingerprint(siteRef.current.draft)) {
      setMessage("초안을 반영하는 동안 화면이 바뀌었어요. 저장하지 않은 수정은 그대로 두었어요. 최신 초안을 다시 확인해 주세요.");
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
    void askConfirm({ title: "가게 이름도 바꿀까요?", message: `큰 제목을 '${title}'(으)로 고쳤어요. 가게 이름도 '${title}'(으)로 바꿀까요? 홈페이지 맨 위 이름, 개인정보 처리 주체, 손님 문의·문자 안내에 이 이름이 들어가요.`, cancelLabel: "그대로 두기", confirmLabel: "가게 이름 바꾸기" })
      .then(ok => {
        if (!ok) return;
        const renamed = withBusinessName(draft, title);
        saveDraft(renamed).then(() => setMessage(`가게 이름을 '${title}'(으)로 바꿨어요. 손님 화면에는 공개하면 반영돼요.`)).catch(() => { setDraft(renamed); setMessage("가게 이름을 바꿨어요. 저장을 눌러 주세요."); });
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
  function blockedHref(cta: "pay" | "plan" | "login" | "retry"): string {
    /* 로그인하고 돌아올 곳도 그 사업의 홈페이지 — 사업 정보를 빠뜨리면 다른 사업이 열릴 수 있다 */
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
  const headerActions = kitEditing ? <div className={styles.headerActions}>
    <button type="button" aria-label="저장" disabled={busy} onClick={() => void save()}>{action === "saving" ? <Spinner /> : <Save size={15} />}<span>저장</span></button>
    {/* 고친 게 없으면 손님 화면과 같다 — '새 버전 공개'를 늘 파랗게 켜 두면 눌러야 하는 줄 안다 */}
    <button type="button" className={styles.headerPrimary} data-done={liveUpToDate || undefined} disabled={busy || liveUpToDate} onClick={() => void publish()}>{action === "publishing" ? <Spinner /> : liveUpToDate ? <Check size={15} /> : <Rocket size={15} />}<span>{liveUpToDate ? "공개됨" : site?.status === "published" ? "새 버전 공개" : site?.status === "unpublished" ? "다시 공개" : "공개하기"}</span></button>
  </div> : undefined;
  const back = screenPlanId && !sample ? `/plan/document?planId=${encodeURIComponent(screenPlanId)}` : "/plan";
  /* 이 화면의 사업 — 공개 뒤 다음 단계와 '사업 시작 준비 먼저 하기'에 쓴다(이 기기에 저장된 사업) */
  const screenPlan = phase === "ready" && screenPlanId && !sample ? loadState().plans.find(item => item.id === screenPlanId) ?? null : null;
  const screenNext = screenPlan ? journeyNext(screenPlan, "published") : screenPlanId ? { href: launchHref(screenPlanId), title: "사업 시작하기", note: "업종 신고·사업자등록·결제·첫 홍보를 차례로 준비해요" } : null;

  return (
    <main className={frame.page}><BusinessAppChrome title="홈페이지" backHref={back} actions={headerActions}>
    <div className={styles.frameScroll}><div className={styles.frameInner}>
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
          <button type="button" className={styles.cta} onClick={() => { if (blocked.cta === "retry") window.location.reload(); else router.push(blockedHref(blocked.cta)); }}>
            {blocked.cta === "retry" ? "다시 시도" : blocked.cta === "pay" ? "결제하러 가기 →" : blocked.cta === "login" ? "로그인하기 →" : screenPlanId ? "계획서 이어 쓰기 →" : "대화로 사업 시작하기 →"}
          </button>
        </div>
      )}

      {/*
        결제 전에는 만들어진 홈페이지를 보여만 준다.
        사기 전에 자기 사업이 어떻게 보이는지 확인할 수 있어야 한다.
      */}
      {phase === "ready" && draft && !editable && (
        <div className={styles.previewWrap}>
          <div className={styles.payBar}>
            <div>
              <strong className={styles.payTitle}>{sample ? "예시 홈페이지" : planPaid ? "홈페이지 고치기·공개" : "사업계획서 + 홈페이지"}</strong>
              <p className={styles.payNote}>
                {sample
                  ? "예시 홈페이지입니다. 내 사업으로 만들면 이 페이지의 글과 사진을 바꿔 쓰게 됩니다."
                  : planPaid ? `사진·글·버튼을 직접 고치고 인터넷에 공개하려면 결제가 필요해요. ${price.toLocaleString("ko-KR")}원.`
                    : `홈페이지는 사업계획서와 함께 열어요. 둘 다 ${price.toLocaleString("ko-KR")}원.`}
              </p>
            </div>
            <div className={styles.payActions}>
              {sample ? (
                <a className={styles.cta} href="/plan/chat?new=1">내 사업으로 만들기 →</a>
              ) : (
                <button type="button" className={styles.cta} onClick={() => router.push(blockedHref("pay"))}>
                  {planPaid ? "결제하고 홈페이지 고치기 →" : "함께 결제하기 →"}
                </button>
              )}
              {/* 홈페이지는 나중에 해도 된다 — 결제 단추 하나뿐이라 사업 시작하기로 넘어갈 길이 없었다(여정 점검 2026-10-22) */}
              {!sample && screenPlanId && <Link className={styles.ctaSecondary} href={launchHref(screenPlanId)} onClick={() => setActivePlan(screenPlanId)}>
                {screenPlan && readCoach(screenPlan.answers)?.stage === "operating" ? "운영 개선 먼저 하기 →" : "사업 시작 준비 먼저 하기 →"}
              </Link>}
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
            <LandingBlocksRenderer data={draft.pageData ?? createLandingPageData(draft, draft.templateId)} />
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
          <span className={styles.builderOpenText}>
            <strong>자유 편집 열기</strong>
            <small>글을 누르면 그 자리에서 고치고, 사진을 누르면 바꿉니다. 다른 디자인으로도 바꿀 수 있어요</small>
          </span>
          <ArrowRight size={16} />
        </button>
      )}

      {/* 저장이 막혔을 때 다음 할 일 — 로그인이 풀렸으면 다시 로그인, 다른 화면에서 먼저 저장됐으면 최신 내용 불러오기/계속 고치기 */}
      {phase === "ready" && draft && editable && saveTrouble && !builderOpen && (
        <div className={styles.aiFillNotice} role="alert">
          <span>{saveTrouble === "login" ? LANDING_LOGIN_MESSAGE : "다른 화면에서 먼저 저장된 내용이 있어요. 최신 내용을 불러오거나, 지금 고친 내용으로 계속 고칠 수 있어요."}</span>
          {saveTrouble === "login"
            ? <Link className={styles.troubleLink} href={blockedHref("login")}>다시 로그인하기</Link>
            : <><button type="button" disabled={busy} onClick={() => void reloadLatest()}>최신 내용 불러오기</button><button type="button" onClick={() => setSaveTrouble(null)}>계속 고치기</button></>}
        </div>
      )}

      {/* 처음 저절로 채우기가 실패했을 때 — 한 줄 안내와 다시 채우기(누를 때만 다시 돈다) */}
      {phase === "ready" && draft && editable && aiFillFailed && !aiFilling && projectId && site && (
        <p className={styles.aiFillNotice} role="status">
          <span>AI로 다듬지 못해 계획서 답을 그대로 넣었어요. 직접 고치거나 [다시 채우기]를 눌러 주세요.</span>
          <button type="button" disabled={busy} onClick={() => {
            if (landingDraftFingerprint(draft) !== landingDraftFingerprint(site.draft)) { setMessage("저장하지 않은 수정이 있어요. 먼저 저장한 뒤 다시 채워 주세요."); return; }
            void runAiFill(projectId, site.updatedAt, false);
          }}>다시 채우기</button>
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
          onChange={updateDraft}
          onSave={save}
          onPublish={publish}
          onUnpublish={unpublish}
          slugError={slugError}
          slugFocus={slugFocus}
          onOpenEditor={() => setBuilderOpen(true)}
          onSiteUpdated={updateSite}
          onSourceApplied={applySourceSite}
          aiFill={projectId && site && !sample ? {
            running: aiFilling,
            run: () => {
              if (draft && landingDraftFingerprint(draft) !== landingDraftFingerprint(site.draft)) { setMessage("저장하지 않은 변경이 있어요. 먼저 저장한 뒤 AI로 채워 주세요."); return; }
              void runAiFill(projectId, site.updatedAt, false);
            },
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
      {/* 다음 단계는 단계 순서(journey.ts)대로 — 사업 시작하기를 아직 안 했으면 그것부터, 했으면 유지보수(예전엔 4단계를 건너뛰었다) */}
      {phase === "ready" && site?.status === "published" && screenPlanId && !sample && screenNext && <div className={styles.nextRow}>
        <Link className={styles.nextCare} href={screenNext.href} onClick={() => setActivePlan(screenPlanId)}>
          <span>다음 단계</span>
          <strong>{screenNext.title} →</strong>
          <small>{screenNext.note}</small>
        </Link>
        {/* 그다음 — 홍보 상담(목록은 유지보수 화면 한 곳에) */}
        <NextServicesCard planId={screenPlanId} className={styles.nextCard} />
      </div>}
    </div></div>
    </BusinessAppChrome></main>
  );
}
