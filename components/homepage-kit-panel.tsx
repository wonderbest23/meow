"use client";

import { appendixFromDraft, PublicAppendixPreview } from "./public-appendix-preview";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrainwaveTemplatePicker } from "./brainwave-template-picker";
import { withRo } from "../lib/josa";
import { Check, ChevronDown, Copy, ExternalLink, Globe2, Inbox, LayoutTemplate, Palette, PauseCircle, Pencil, PhoneCall, RefreshCw, Rocket, Save, Share2, ShieldCheck, Sparkles, Target, Undo2 } from "lucide-react";
import { applyContactMethod, CONTACT_METHOD_INFO, CONTACT_METHODS, contactHref, DEFAULT_CONTACT, draftPhone, normalizeWebUrl, quickActions, type LandingContact } from "../lib/landing/contact-method";
import { landingEmailIssue, landingSlugIssue, privacyPolicyWithContact, type LandingDraft, type LandingSiteRecord } from "../lib/landing/domain";
import { unansweredCount, useInquiries } from "../app/plan/inquiries/use-inquiries";
import { hasUnpublishedEdits, isLiveUpToDate } from "../lib/landing/save-contract";
import { LandingBlocksRenderer } from "./landing-blocks";
import { LandingDomainConnector } from "./landing-domain-connector";
import { HomepageAlertSettings } from "./homepage-alert-settings";
import { HomepageExpertConsult } from "./homepage-expert-consult";
import { BRAINWAVE_PAGES } from "../lib/landing/brainwave/catalog";
import { createBusinessTemplate } from "../lib/landing/brainwave/business-content";
import { homepageMissingInfo } from "../lib/landing/publish-check";
import { carryEditedTexts, switchHomepageDesign } from "../lib/landing/ai-fill";
import { askConfirm } from "./confirm-dialog";
import { applyBusinessContent } from "../lib/landing/page-data";
import { LANDING_THEMES } from "../lib/landing/themes";
import PlanLoading, { Spinner } from "../app/plan/PlanLoading";
import { AddressSearchButton } from "./address-search";
import { nativePlatform } from "../lib/native-app";
import { showCopyText } from "./confirm-dialog";

/*
 * 킷 페이지 홈페이지 화면.
 *
 * 예전 화면은 옛 블록 편집기 시절의 3단계(디자인 8종 고르기 → 문구 폼 →
 * 사업자)와 '자유 편집' 단추, 포함 안내, 전문가 제작 광고가 한 화면에 쌓여
 * 있었다. 킷 페이지에서는 디자인 고르기·문구 폼이 편집기 안으로 들어갔으니
 * 밖에 남길 것은 넷뿐이다:
 *   1) 페이지 미리보기 + 편집 열기 (주된 행동 하나)
 *   2) 사업자 정보 — 법으로 적어야 하는 것, 공개 전 필수
 *   3) 내 도메인
 *   4) 접수된 문의 — 신청폼으로 들어온 것
 * 저장·공개는 맨 위 한 줄에만 둔다.
 *
 * 2026-08-25 개편(사용자 요청): 화면이 길어 읽기 어렵다 —
 *   - 주된 행동(템플릿 선택·에디터)은 미리보기 위의 큰 버튼 두 개로 강조하고,
 *   - 2·3·4 는 접이식으로 접어 두되 요약 줄에 상태 배지(채울 것 n개·문의 n건)를 단다.
 *   - 공개 전의 /launch/ 주소는 눌러도 404 라서 링크 대신 안내로만 보여 준다.
 */
type Action = "idle" | "saving" | "saved" | "publishing" | "unpublishing";

/* 접이식 카드 — 요약 줄(아이콘·제목·상태 배지)만 보이다가 누르면 펼쳐진다 */
function Fold({ icon, title, badge, hint, children, defaultOpen, id, step }: {
  /** 화면 순서 번호 — 왼쪽 목록의 홈페이지 목차와 같은 번호(소유자 지적: 순서가 헷갈림) */
  step?: number;
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** 왼쪽 사이드바에서 바로 찾아오는 앵커 */
  id?: string;
}) {
  return (
    <details className="hk-fold" open={defaultOpen} id={id}>
      <summary>
        {step ? <b className="hk-step-no" aria-label={`${step}번`}>{step}</b> : null}
        {/* 번호(왼쪽 목차와 같은 순서)만 둔다 — 번호와 아이콘 상자가 둘 다 있어 표시가 겹쳤다(대표 요청 2026-10-15) */}
        <span className="hk-fold-tt">
          <strong>{title} {badge}</strong>
          {hint ? <small>{hint}</small> : null}
        </span>
        <ChevronDown size={18} className="hk-fold-chev" aria-hidden />
      </summary>
      <div className="hk-fold-body">{children}</div>
    </details>
  );
}

/* 방침 '처리 항목' 줄을 실제로 받는 연락처에 맞춘다(사장님이 손댄 문구면 그 줄만 바꾼다) */
function leadPolicyItems(policy: string, phone: boolean, email: boolean): string {
  const items = ["이름", ...(phone ? ["휴대폰 번호"] : []), ...(email ? ["이메일"] : []), "문의 내용"].join(", ");
  return policy.replace(/^2\. 처리 항목: .*$/m, `2. 처리 항목: ${items} 중 신청폼에 표시된 항목`);
}

/** 홈페이지 글에 바로 들어가는 사업 정보 칸 — 고치면 applyBusinessContent 로 곧바로 반영한다 */
const BUSINESS_CONTENT_KEYS: Array<keyof LandingDraft> = ["businessName", "offerTitle", "offerDescription", "priceLabel", "ctaLabel", "heroImageUrl"];
export function contentSourceOf(draft: LandingDraft) {
  return { businessName: draft.businessName, ...(draft.pageData?.businessContent?.headline ? { headline: draft.pageData.businessContent.headline } : {}), offer: draft.offerTitle, description: draft.offerDescription, customer: draft.pageData?.businessContent?.customer ?? "", price: draft.priceLabel, cta: draft.ctaLabel, image: draft.heroImageUrl };
}

/* 공개 전 '채울 것' 목록 — 화면 없이 시험할 수 있게 lib 로 옮겼다(공개 확인창도 같은 목록을 쓴다) */
export { homepageMissingInfo, looksDescriptiveName } from "../lib/landing/publish-check";

/**
 * 가게 이름 바꾸기 — 이름이 들어가는 곳(맨 위 이름 등 자동 문구, 개인정보 '처리 주체')을 함께 바꾼다.
 * 처리 주체는 예전 이름과 같았을 때만 따라 바꾼다(사장님이 따로 적은 법인명 등은 그대로). 직접 고친 홈페이지 글은 그대로 둔다.
 * 예전엔 큰 제목이나 사업 이름 칸을 고쳐도 머리줄·처리 주체·문의 문자에 옛 이름이 남았다(여정 점검 2026-10-22).
 */
export function withBusinessName(draft: LandingDraft, name: string): LandingDraft {
  const old = draft.businessName.trim();
  const controller = draft.privacyController.trim();
  const next: LandingDraft = { ...draft, businessName: name, ...(!controller || controller === old ? { privacyController: name } : {}) };
  const brainwave = next.pageData?.brainwave;
  const landing = Boolean(brainwave && BRAINWAVE_PAGES.some(page => page.id === brainwave.page && page.group === "landing"));
  return next.pageData && landing && name.trim() ? { ...next, pageData: applyBusinessContent(next.pageData, contentSourceOf(next)) } : next;
}

const SR_ONLY = { position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 } as const;

export function HomepageKitPanel({
  draft,
  site,
  projectId,
  publicPath,
  action,
  message,
  messageAlert = false,
  onChange,
  onSave,
  onPublish,
  onUnpublish,
  slugError = "",
  slugFocus = 0,
  onOpenEditor,
  onSiteUpdated,
  onSourceApplied,
  aiFill,
  inChrome = false,
  planId,
  nameCandidates = false,
  previewView,
  studio = false,
  pick,
  onChatEdit,
}: {
  /** 휴대폰 작업실 — '홈페이지 고치기' 옆의 작은 '대화로 고치기'(대화 칸으로 보낸다). 없으면 숨긴다 */
  onChatEdit?: () => void;
  /** 작업실(PC) 배치 — 미리보기가 카드 끝까지 차고, 미리보기 위 이름·도구 줄 대신 아래 '홈페이지 설정' 칸에 도구·접는 칸을 모은다 */
  studio?: boolean;
  /** 대화로 고치기 제안이 떠 있는 동안 바뀔 글(글 자리 id · 지금 글) — 미리보기에서 그 글을 테두리로 짚는다 */
  pick?: { ids: string[]; texts: string[] } | null;
  /** 계획서에 가게 이름 후보가 있고 아직 이름을 정하지 않았는지 — '채울 것'에 가게 이름을 넣는다 */
  nameCandidates?: boolean;
  /** 공개 멈추기 — 손님 주소로 안 열리게(초안·주소는 남는다) */
  onUnpublish?: () => void;
  /** 무료 주소 끝부분 저장 오류(서버·저장 전 확인) — 그 칸 바로 아래에 보인다 */
  slugError?: string;
  /** 바뀌면 사업자 정보 칸을 펼쳐 무료 주소 칸으로 데려간다(저장 오류·공개 뒤 '주소 바꾸기') */
  slugFocus?: number;
  /** 이 홈페이지의 사업 — 6번 전문가 상담 신청에 쓴다 */
  planId?: string | null;
  draft: LandingDraft;
  site: LandingSiteRecord | null;
  projectId: string | null;
  publicPath: string;
  action: Action;
  message: string;
  /** message가 실패·충돌 안내인지 — 낭독기에 alert로 바로 읽힌다(나머지는 status) */
  messageAlert?: boolean;
  onChange: (draft: LandingDraft) => void;
  onSave: () => void;
  onPublish: () => void;
  onOpenEditor: () => void;
  onSiteUpdated: (site: LandingSiteRecord) => void;
  onSourceApplied?: (site: LandingSiteRecord, expectedUpdatedAt: string) => void;
  /** 계획서로 채우기(AI) — 카드·이용 순서·마무리 문구와 업종 사진 */
  aiFill?: { running: boolean; run: () => void };
  /** 앱 머리줄(← 홈페이지 · 저장 · 공개) 안에 놓일 때 — 이 패널의 뒤로가기·제목·저장/공개 줄을 빼고 주소 상태만 남긴다 */
  inChrome?: boolean;
  /** 작업실 안 — 미리보기 모양(휴대폰/컴퓨터)을 작업실 머리줄이 정한다. 주면 패널 안의 모양 단추는 숨긴다 */
  previewView?: "mobile" | "pc";
}) {
  /*
   * 앱 안에서는 '내 도메인 연결'(웹에서만 파는 상품 — 앱 결제 상품이 아니다)을 보이지 않는다. 앱에서 결제 단추를 누르면
   * '앱에서 결제할 수 없어요'로 막혔다. 연결된 도메인은 그대로 동작하고, 관리는 웹에서 한다. 뒤 단계 번호는 하나씩 당긴다.
   */
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(nativePlatform() !== null); }, []);
  /*
   * 사업 정보 칸(상호·소개·가격·버튼 문구·대표 사진)을 고치면 홈페이지 글에 바로 넣는다 — 예전엔 '사업 정보 적용' 단추를 따로 눌러야 했다.
   * 직접 고친 글과 사진은 그대로 둔다(applyBusinessContent). 랜딩 템플릿일 때만.
   */
  const update = (patch: Partial<LandingDraft>) => {
    const next = { ...draft, ...patch };
    /* 사업 이름을 고치면 개인정보 '처리 주체'도 같은 이름이었을 때 따라간다 */
    if (patch.businessName !== undefined && (!draft.privacyController.trim() || draft.privacyController.trim() === draft.businessName.trim())) next.privacyController = patch.businessName;
    const brainwave = next.pageData?.brainwave;
    const landing = Boolean(brainwave && BRAINWAVE_PAGES.some(page => page.id === brainwave.page && page.group === "landing"));
    if (next.pageData && landing && next.businessName.trim() && BUSINESS_CONTENT_KEYS.some(key => key in patch)) {
      onChange({ ...next, pageData: applyBusinessContent(next.pageData, contentSourceOf(next)) });
      return;
    }
    onChange(next);
  };
  const busy = action === "saving" || action === "publishing" || action === "unpublishing" || Boolean(aiFill?.running);
  /*
   * 미리보기는 휴대폰 모양이 먼저 — PC 모양은 화면에 다 안 들어와 '눌러서 고치는 건지' 헷갈렸다(사용자 지적).
   * 휴대폰 틀(390px) 안에서는 템플릿이 폭을 보고 스스로 모바일 배치로 그린다.
   */
  const [ownView, setView] = useState<"mobile" | "pc">("mobile");
  const view = previewView ?? ownView;
  /*
   * '바꿀 곳' 표시 — 제안이 바꿀 글을 미리보기에서 찾아 테두리를 두르고, 컴퓨터 모양이면 그 자리에 이름표를 얹는다.
   * 미리보기에는 글 자리 표시(data-bw-text, 편집기에서만 붙는다)가 없어 지금 글과 똑같은 글을 찾는다 — 단추 안 글이면 단추를 짚는다.
   * 템플릿이 그린 요소에 표시용 속성만 붙인다(글·모양은 건드리지 않는다). 못 찾으면 아무것도 그리지 않는다.
   */
  const previewBodyRef = useRef<HTMLDivElement>(null);
  const [pickBox, setPickBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const pickKey = pick ? JSON.stringify(pick) : "";
  useEffect(() => {
    const body = previewBodyRef.current;
    setPickBox(null);
    if (!body || !pickKey) return;
    const { ids, texts } = JSON.parse(pickKey) as { ids: string[]; texts: string[] };
    const norm = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
    const byText = (text: string) => {
      const want = norm(text);
      if (!want) return [];
      const hits = [...body.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,p,span,a,button,li,strong,em,b,small,div,label")].filter(el => norm(el.textContent) === want);
      /* 가장 안쪽 것만 — 단추·링크 안의 글이면 그 단추를 */
      return hits.filter(el => !hits.some(other => other !== el && el.contains(other))).slice(0, 1)
        .map(el => { const box = el.parentElement?.closest<HTMLElement>("button, a"); return box && body.contains(box) && norm(box.textContent) === want ? box : el; });
    };
    const tagged = ids.flatMap(id => [...body.querySelectorAll<HTMLElement>(`[data-bw-text="${CSS.escape(id)}"]`)]);
    const marked = tagged.length ? tagged : texts.flatMap(byText);
    for (const el of marked) el.setAttribute("data-hk-pick", "");
    const first = marked[0];
    const place = () => {
      if (!first || view === "mobile") { setPickBox(null); return; }
      const outer = body.getBoundingClientRect();
      const rect = first.getBoundingClientRect();
      if (!rect.width && !rect.height) { setPickBox(null); return; }
      setPickBox({ left: rect.left - outer.left - 4, top: rect.top - outer.top - 4, width: rect.width + 8, height: rect.height + 8 });
    };
    place();
    first?.scrollIntoView?.({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    observer?.observe(body);
    return () => { observer?.disconnect(); for (const el of marked) el.removeAttribute("data-hk-pick"); };
  }, [pickKey, view, draft.pageData]);
  /* AI 채우기 진행 — 보통 30초. 몇 초째인지 보여 줘야 언제까지 기다릴지 안다 */
  const [fillSeconds, setFillSeconds] = useState(0);
  useEffect(() => {
    if (!aiFill?.running) { setFillSeconds(0); return; }
    const started = Date.now();
    const timer = window.setInterval(() => setFillSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [aiFill?.running]);
  const published = site?.status === "published";
  const stopped = site?.status === "unpublished";
  /*
   * 무료 주소 끝부분 — 예전엔 한글·띄어쓰기를 소리 없이 지워('Dongne 빵집' → 'dongne') 무엇이 바뀌었는지 몰랐고,
   * 틀린 주소는 저장할 때 맨 위 한 줄로만 알렸다. 이제 적은 그대로 두고 칸 바로 아래에 이유를 보인다.
   * 한글·기호처럼 바로 알 수 있는 것은 적는 동안, 길이·맨 앞뒤 - 는 칸을 떠날 때 알린다.
   */
  const [slugLeft, setSlugLeft] = useState(false);
  // 이메일 형식 안내는 칸을 떠난 뒤에만 보인다(입력 중 'hello@'에서 미리 혼내지 않게)
  const [emailLeft, setEmailLeft] = useState(false);
  const emailMessage = emailLeft ? landingEmailIssue(draft.businessEmail) : "";
  const slugIssue = landingSlugIssue(draft.slug);
  const slugMessage = slugError || (slugIssue && (slugLeft || /[^a-z0-9-]/.test(draft.slug)) ? slugIssue : "");
  const liveSlug = published ? site?.publishedSlug ?? null : null;
  const slugRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!slugFocus) return;
    const timer = window.setTimeout(() => {
      const fold = document.getElementById("hk-business");
      if (fold instanceof HTMLDetailsElement) fold.open = true;
      slugRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      slugRef.current?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [slugFocus]);
  /* 저장은 됐지만 아직 '새 버전 공개'를 안 누른 고친 내용 — '공개 중'만 보고 손님 화면도 바뀐 줄 알기 쉽다 */
  const unpublishedEdits = hasUnpublishedEdits(site);
  const liveUpToDate = isLiveUpToDate(site);
  const [domainReady, setDomainReady] = useState(false);
  /*
   * 주소 끝의 #hk-… 로 왔으면(내 문의의 '번호 등록하러 가기' 등) 그 칸을 펼쳐 내려 준다 —
   * 이 화면은 늦게 그려져 브라우저가 스스로 그 칸을 못 찾고, 칸이 접혀 있으면 찾아도 안 보인다.
   */
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!/^hk-[a-z-]+$/.test(id)) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(id);
      if (target instanceof HTMLDetailsElement) target.open = true;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, []);
  /* 손님 연락 방법 — 바꾸면 문의 버튼의 이동·글이 한 번에 따라간다(applyContactMethod) */
  const contact = draft.contact ?? DEFAULT_CONTACT;
  const contactInfo = CONTACT_METHOD_INFO[contact.method];
  const setContact = (patch: Partial<LandingContact>) => onChange(applyContactMethod(draft, { ...draft, contact: { ...contact, ...patch } }));
  const setPhone = (value: string) => onChange(applyContactMethod(draft, { ...draft, businessPhone: value, businessContact: value }));
  /* '문의 양식'인데 양식이 꺼져 있으면 손님 문의 버튼이 갈 곳이 없다 — 준비 안 됨으로 알린다 */
  const formOff = contact.method === "form" && !draft.leadCaptureEnabled;
  const contactReady = contactHref(contact, draftPhone(draft)) !== null && !formOff;
  const quickCount = quickActions(contact, draftPhone(draft), draft.leadCaptureEnabled).length;
  /* 공개한 주소 복사·공유 — 오픈하자마자 단골·단지 커뮤니티에 뿌릴 수 있게 */
  const [copied, setCopied] = useState(false);
  const publicUrl = typeof window !== "undefined" && publicPath ? `${window.location.origin}${publicPath}` : publicPath;
  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { void showCopyText(publicUrl); }
  };
  const shareUrl = async () => {
    if (typeof navigator.share === "function") { try { await navigator.share({ title: draft.businessName, text: `${draft.businessName} 홈페이지`, url: publicUrl }); return; } catch { return; } }
    await copyUrl();
  };
  const page = BRAINWAVE_PAGES.find((p) => p.id === draft.pageData?.brainwave?.page);
  const [picking, setPicking] = useState(false);
  /* 디자인을 바꾸기 직전 모습 — 바꾼 뒤 '되돌리기'로 한 번 돌아갈 수 있다 */
  const [beforeSwitch, setBeforeSwitch] = useState<{ draft: LandingDraft; from: string; carried: number } | null>(null);
  const bw = draft.pageData?.brainwave;
  // 큰 제목(계획서의 한 줄 소개)은 폼에 칸이 없다 — 템플릿을 바꿔도 이어 쓴다
  const contentSource = () => contentSourceOf(draft);
  /*
   * 디자인 바꾸기 — AI 가 쓴 글(한 줄 소개·카드·이용 순서·메뉴·마무리)은 새 디자인의 같은 역할 자리로 옮겨 담는다(switchHomepageDesign).
   * 예전엔 템플릿 기본 글로 새로 만들어 AI 글이 사라지고, 원래 디자인으로 돌아가도 되살아나지 않았다.
   */
  /*
   * 직접 고친 글(큰 제목 등)은 새 디자인의 같은 역할 자리로 옮긴다(carryEditedTexts) — 예전엔 디자인을 바꾸면 고친 큰 제목이 사업 이름으로 돌아갔다(감사 r36).
   * 옮길 자리가 없는 글이 있으면 바꾸기 전에 몇 곳인지 묻는다. 바꾼 뒤에도 아래 '되돌리기'는 다른 디자인으로 다시 바꾸기 전까지 남는다.
   */
  const pickTemplate = async (id: string) => {
    if (!draft.pageData || !bw || busy) return;
    setPicking(false);
    if (id === bw.page) return;
    const businessContent = { ...contentSource(), businessName: draft.businessName.trim() || "내 사업" };
    const base = { ...draft, pageData: { ...draft.pageData, businessContent } };
    const switched = switchHomepageDesign(base, id, () => createBusinessTemplate(businessContent, id));
    const nextBw = switched.pageData?.brainwave;
    const carry = nextBw ? carryEditedTexts(bw.page, bw.texts, businessContent, draft.pageData.aiFill?.texts ?? {}, id, nextBw.texts) : null;
    if (carry?.lost && !await askConfirm({ title: `직접 고친 글 ${carry.lost}곳이 바뀌어요`, message: "새 디자인에는 그 글을 옮겨 담을 자리가 없어 디자인 기본 글로 바뀌어요. 바꾼 뒤에도 '되돌리기'로 지금 모습으로 돌아올 수 있어요.", cancelLabel: "그대로 두기", confirmLabel: "디자인 바꾸기" })) return;
    onChange(carry && nextBw && switched.pageData ? { ...switched, pageData: { ...switched.pageData, brainwave: { ...nextBw, texts: carry.texts } } } : switched);
    setBeforeSwitch({ draft, from: page?.ko ?? "이전 디자인", carried: carry?.carried ?? 0 });
  };

  /* 접수된 문의 수 — '내 문의'와 같은 목록을 함께 쓴다(따로 무거운 landing API 를 다시 부르지 않는다) */
  const inquiries = useInquiries(Boolean(projectId));
  const leads = inquiries.items ? inquiries.items.filter(item => item.projectId === projectId).map(item => item.lead) : null;
  const leadsError = inquiries.items ? "" : inquiries.error;
  const openLeads = leads ? unansweredCount(leads) : 0;

  /* 공개 전에 비어 있으면 안 되는 것 — 법정 표기 */
  const missing = homepageMissingInfo(draft, { nameCandidates });

  /*
   * 공개 상태 줄 — 예전 화면은 맨 위에. 작업실(PC)은 카드 맨 위 줄이 주소·공개 상태를 보이므로,
   * 공개한 뒤에만(주소 복사·공유·공개 멈추기) 미리보기 아래 설정 칸 맨 앞에 둔다.
   */
  const top = (
    <header className="hk-top" data-in-chrome={inChrome || undefined}>
      {/* 개요·문서·섹션 화면과 같은 머리 규칙 — [←] 제목 20px · 아래 13px */}
      {!inChrome && <a href="/plan/overview" className="hk-back" aria-label="플랜 개요로">←</a>}
      <div>
        {!inChrome && <h3>내 사업 홈페이지</h3>}
        {publicPath ? (
          <p className="hk-url">
            {/* 작업실(PC)은 카드 맨 위 주소 줄이 공개 상태를 한 번 보인다 — 여기서 또 적지 않는다(군더더기 점검 r37) */}
            {!studio && <span>{published ? "공개 중" : stopped ? "공개 멈춤" : "아직 비공개"}</span>}
            {unpublishedEdits && !studio ? <em className="hk-url-dirty">공개 안 된 수정 있음</em> : null}
            {/*
              긴 주소(/launch/영문-이름-번호)는 글자로 늘어놓지 않는다(대표 요청 2026-10-15: URL 이 과하게 보인다).
              공개 뒤에는 열기·주소 복사·공유 단추만, 공개 전에는 한 줄 안내만(그 주소는 아직 없어서 404).
            */}
            {/* 공개 뒤에는 주소를 글로도 보여 준다 — 단추만 있으니 어떤 주소인지 몰라 손님에게 말로 알려 줄 수 없었다(여정 점검 2026-10-22). 길면 말줄임 */}
            {published
              ? <><em className="hk-url-pending" title={publicUrl}>{publicUrl.replace(/^https?:\/\//, "")}</em><a className="hk-url-btn" href={publicPath} target="_blank" rel="noreferrer"><ExternalLink size={13} /> 홈페이지 열기</a>
                {/* 휴대폰에서는 복사·공유·멈추기를 그림 단추로 줄여 한 줄에(모바일 점검 r37: '공개 멈추기'만 둘째 줄에 떨어졌다). 이름은 aria-label·title 로 */}
                <button type="button" className="hk-url-btn" aria-label={copied ? "복사됨" : "주소 복사"} title={copied ? "복사됨" : "주소 복사"} onClick={copyUrl}>{copied ? <Check size={13} /> : <Copy size={13} />} <span className="hk-url-label">{copied ? "복사됨" : "주소 복사"}</span></button>
                <button type="button" className="hk-url-btn" aria-label="공유" title="공유" onClick={shareUrl}><Share2 size={13} /> <span className="hk-url-label">공유</span></button>
                {onUnpublish ? <button type="button" className="hk-url-btn hk-url-stop" aria-label="공개 멈추기" title="공개 멈추기" disabled={busy} onClick={onUnpublish}>{action === "unpublishing" ? <Spinner /> : <PauseCircle size={13} />} <span className="hk-url-label">공개 멈추기</span></button> : null}</>
              : <em className="hk-url-pending">{stopped ? "‘다시 공개’하면 같은 주소로 열려요" : "공개하면 주소가 생겨요"}</em>}
          </p>
        ) : <p className="hk-url">처음 공개하면 주소가 생겨요</p>}
      </div>
      {!inChrome && <div className="hk-actions">
        <button type="button" disabled={busy} onClick={onSave}>{action === "saving" ? <Spinner /> : <Save size={15} />} 저장</button>
        <button type="button" className="hk-primary" data-done={liveUpToDate || undefined} disabled={busy || liveUpToDate} onClick={onPublish}>{action === "publishing" ? <Spinner /> : liveUpToDate ? <Check size={15} /> : <Rocket size={15} />} {liveUpToDate ? "공개됨" : published ? "새 버전 공개" : stopped ? "다시 공개" : "공개하기"}</button>
      </div>}
    </header>
  );

  /*
   * 도구 한 줄 — '디자인'(템플릿·분위기)만. '내용 채우기'(AI로 채우기·최신 사업정보·사업 정보 적용) 줄은 뺐다
   * (대표 요청 2026-10-15: AI 비용만 나가고, 사업 정보는 아래 칸을 고치면 바로 반영되면 된다).
   * 작업실(PC)에서는 미리보기가 카드 끝까지 차므로 미리보기 아래 설정 칸으로 내린다.
   */
  const tools = (
    <div className="hk-tools">
      {bw && draft.pageData ? <div className="hk-tool-row" role="radiogroup" aria-label="분위기">
        <span className="hk-tool-label"><Palette size={14} aria-hidden /> 디자인·색</span>
        <button type="button" className="hk-tool-btn" disabled={busy} onClick={() => setPicking(true)} title={page ? `지금 디자인: ${page.ko}` : "디자인 바꾸기"}>
          <LayoutTemplate size={14} /> 디자인 바꾸기
        </button>
        <span className="hk-themes">
          {[{ id: undefined, label: "기본", note: "디자인 원래 색", tokens: null }, ...LANDING_THEMES].map((theme) => {
            const on = (draft.pageData?.theme ?? undefined) === theme.id;
            return <button key={theme.id ?? "base"} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} disabled={busy} title={theme.note}
              onClick={() => onChange({ ...draft, pageData: { ...draft.pageData!, theme: theme.id } })}>
              <i aria-hidden style={theme.tokens ? { background: theme.tokens.accent } : undefined} />
              {theme.label}
            </button>;
          })}
        </span>
      </div> : null}
    </div>
  );
  /* 디자인을 바꾼 뒤 안내 · 디자인 고르기 · 접는 칸(연락 방법·사업자 정보·도메인·문의·전문가) */
  const rest = <>
    {/* 디자인을 바꾼 바로 뒤 — 되돌리기와 AI로 다시 채우기(채우는 단추는 여기에만 둔다: 늘 보이면 AI 비용만 나간다) */}
    {beforeSwitch && bw && beforeSwitch.draft.pageData?.brainwave?.page !== bw.page ? (
      <div className="hk-switch-note" role="status">
        <span>{draft.pageData?.aiFill ? "디자인을 바꿨어요. AI가 쓴 글은 새 디자인 자리에 옮겨 담았어요. 칸 수가 달라 빠진 글은 되돌리면 그대로 있어요." : "디자인을 바꿨어요. 글은 사업 정보로 새로 채웠어요."}{beforeSwitch.carried ? ` 직접 고친 글 ${beforeSwitch.carried}곳은 새 디자인의 같은 자리로 옮겼어요.` : ""}</span>
        <span className="hk-switch-actions">
          <button type="button" disabled={busy} onClick={() => { onChange(beforeSwitch.draft); setBeforeSwitch(null); }}><Undo2 size={14} aria-hidden /> {withRo(beforeSwitch.from)} 되돌리기</button>
          {aiFill ? <button type="button" disabled={busy} onClick={() => { setBeforeSwitch(null); aiFill.run(); }}><Sparkles size={14} aria-hidden /> 이 디자인에 맞게 AI로 다시 채우기</button> : null}
        </span>
      </div>
    ) : null}
    {picking && bw ? <BrainwaveTemplatePicker current={bw.page} aiFilled={Boolean(draft.pageData?.aiFill)} onPick={(id) => void pickTemplate(id)} onClose={() => setPicking(false)} /> : null}

    {/* 손님 연락 방법 — 문의·예약 버튼과 휴대폰 아래 고정 버튼이 어디로 연결될지 */}
    <Fold
      step={studio ? 1 : 2}
      id="hk-contact"
      icon={<PhoneCall size={18} />}
      title="손님 연락 방법"
      badge={<em className={`hk-badge ${contactReady ? "hk-badge-ok" : "hk-badge-warn"}`}>{contactReady ? contactInfo.label : formOff ? "문의 양식 — 꺼져 있음" : `${contactInfo.label} — 입력 필요`}</em>}
    >
      <div className="hk-contact-methods" role="radiogroup" aria-label="연결 방법">
        {CONTACT_METHODS.map((method) => (
          <label key={method} className={method === contact.method ? "on" : ""}>
            <input type="radio" name="hk-contact-method" checked={method === contact.method} onChange={() => setContact({ method })} />
            {CONTACT_METHOD_INFO[method].label}
          </label>
        ))}
      </div>
      <p className="hk-contact-hint">{contactInfo.hint} 모든 문의 버튼에 한 번에 적용돼요(버튼 하나만 따로 정한 것은 그대로예요).</p>
      {formOff && <p className="hk-contact-hint" role="status">문의 양식이 꺼져 있어 손님이 문의 버튼을 눌러도 신청할 수 없어요. 아래 ‘사업자 정보’에서 문의 양식을 켜거나, 전화·카카오톡 등 다른 연결 방법을 골라 주세요.</p>}
      <div className="hk-grid">
        {contactInfo.field === "phone" ? (
          <label className="wide"><span>전화번호</span><input inputMode="tel" value={draft.businessPhone} onChange={(e) => setPhone(e.target.value)} placeholder={contactInfo.placeholder} /></label>
        ) : null}
        {contactInfo.field && contactInfo.field !== "phone" ? (
          <label className="wide"><span>{contactInfo.label} 주소</span>
            <input inputMode="url" value={contact[contactInfo.field]} onChange={(e) => setContact({ [contactInfo.field as string]: e.target.value } as Partial<LandingContact>)}
              onBlur={(e) => setContact({ [contactInfo.field as string]: normalizeWebUrl(e.target.value) } as Partial<LandingContact>)} placeholder={contactInfo.placeholder} />
          </label>
        ) : null}
      </div>
      {!contactReady && !formOff ? <p className="hk-contact-warn">{contactInfo.field === "phone" ? "전화번호" : "주소"}를 넣으면 버튼이 연결돼요. {draft.leadCaptureEnabled ? " 그 전까지는 문의 양식으로 연결돼요." : " 지금은 문의 양식도 꺼져 있어 손님이 연락할 곳이 없어요."}</p> : null}
      <div className="hk-contact-quick">
        <label className="hk-switch">
          <input type="checkbox" checked={contact.quickBar} onChange={(e) => setContact({ quickBar: e.target.checked })} />
          <span>휴대폰 화면 아래 고정 버튼 <small>{quickCount ? `손님 휴대폰에 ${quickCount}개가 떠 있어요(전화·카톡·예약 중 넣은 것).` : "전화번호·카카오톡 채널·예약 주소 중 하나를 넣으면 나타나요."}</small></span>
        </label>
        {contact.quickBar ? (
          <div className="hk-grid">
            {contactInfo.field !== "phone" ? <label><span>전화번호</span><input inputMode="tel" value={draft.businessPhone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" /></label> : null}
            {contact.method !== "kakao" ? <label><span>카카오톡 채널</span><input inputMode="url" value={contact.kakaoUrl} onChange={(e) => setContact({ kakaoUrl: e.target.value })} onBlur={(e) => setContact({ kakaoUrl: normalizeWebUrl(e.target.value) })} placeholder="https://pf.kakao.com/_xxxxx" /></label> : null}
            {contact.method !== "booking" ? <label><span>예약 페이지</span><input inputMode="url" value={contact.bookingUrl} onChange={(e) => setContact({ bookingUrl: e.target.value })} onBlur={(e) => setContact({ bookingUrl: normalizeWebUrl(e.target.value) })} placeholder="https://booking.naver.com/…" /></label> : null}
          </div>
        ) : null}
      </div>
      <div className="hk-fold-save">
        <button type="button" disabled={busy} onClick={onSave}>{action === "saving" ? <Spinner /> : <Save size={14} />} 연락 방법 저장</button>
      </div>
    </Fold>

    {/* 2. 사업자 정보 — 접이식 */}
    <Fold
      step={studio ? 2 : 3}
      id="hk-business"
      icon={<ShieldCheck size={18} />}
      title="사업자 정보"
      badge={missing.length ? <em className="hk-badge hk-badge-warn">채울 것 {missing.length}개</em> : <em className="hk-badge hk-badge-ok">완료</em>}
    >
      <div className="hk-grid">
        <label><span>사업 이름</span><input value={draft.businessName} maxLength={120} onChange={(e) => update({ businessName: e.target.value })} /></label>
        <label><span>대표자</span><input value={draft.businessRepresentative} onChange={(e) => update({ businessRepresentative: e.target.value })} placeholder="사업자등록증과 같은 이름" /></label>
        <label><span>전화번호</span><input type="tel" inputMode="tel" autoComplete="tel" value={draft.businessPhone} onChange={(e) => update({ businessPhone: e.target.value, businessContact: e.target.value })} placeholder="010-0000-0000" /></label>
        <label><span>이메일</span><input type="email" autoComplete="email" value={draft.businessEmail} onChange={(e) => update({ businessEmail: e.target.value })} onBlur={() => setEmailLeft(true)} placeholder="hello@mybusiness.kr" aria-invalid={emailMessage ? true : undefined} aria-describedby={emailMessage ? "hk-email-error" : undefined} />{emailMessage && <small id="hk-email-error" className="hk-slug-error" role="alert">{emailMessage}</small>}</label>
        <label><span>사업자등록번호</span><input inputMode="numeric" value={draft.businessRegistrationNumber} onChange={(e) => update({ businessRegistrationNumber: e.target.value })} placeholder="000-00-00000" /></label>
        <label><span>통신판매업 신고번호</span><input value={draft.mailOrderSalesNumber} onChange={(e) => update({ mailOrderSalesNumber: e.target.value })} placeholder="없으면 비워 두세요" /></label>
        <div className="wide address-field"><label><span>사업장 주소</span><input value={draft.businessAddress} onChange={(e) => update({ businessAddress: e.target.value })} placeholder="고객 문의를 처리할 수 있는 실제 주소" /></label><AddressSearchButton onPick={(picked) => update({ businessAddress: picked.address })} /></div>
        <label className="wide"><span>영업시간</span><input value={draft.openHours} onChange={(e) => update({ openHours: e.target.value })} placeholder="예: 평일 09:00–19:00 · 일요일 휴무" /></label>
        <label className="wide hk-switch">
          <input type="checkbox" checked={draft.leadCaptureEnabled} onChange={(e) => update({ leadCaptureEnabled: e.target.checked })} />
          <span>고객 문의 양식 받기 <small>문의는 손님 문의에 모여요</small></span>
        </label>
        {/*
         * 받을 연락처 — 예전 편집 화면에 있던 토글이 사라져 휴대폰 칸을 켤 방법이 없었다. 그래서 '문의자 이름·연락처 문자',
         * 손님 '접수됐어요' 문자, [전화]·[문자] 바로 답하기가 늘 비어 있었다. 켜면 방침의 처리 항목도 함께 맞춘다
         */}
        {draft.leadCaptureEnabled ? <div className="wide hk-lead-fields">
          <label className="hk-switch"><input type="checkbox" checked={draft.collectPhone} onChange={(e) => update({ collectPhone: e.target.checked, ...(e.target.checked || draft.collectEmail ? {} : { collectEmail: true }), privacyPolicy: leadPolicyItems(draft.privacyPolicy, e.target.checked, e.target.checked || draft.collectEmail ? draft.collectEmail : true) })} /><span>휴대폰 번호 받기 <small>전화·문자로 바로 연락할 수 있어요(추천)</small></span></label>
          <label className="hk-switch"><input type="checkbox" checked={draft.collectEmail} onChange={(e) => update({ collectEmail: e.target.checked, ...(e.target.checked || draft.collectPhone ? {} : { collectPhone: true }), privacyPolicy: leadPolicyItems(draft.privacyPolicy, e.target.checked || draft.collectPhone ? draft.collectPhone : true, e.target.checked) })} /><span>이메일 받기</span></label>
        </div> : null}
        <label className="wide hk-switch">
          <input type="checkbox" checked={draft.analyticsEnabled} onChange={(e) => update({ analyticsEnabled: e.target.checked })} />
          <span>방문 수 세기 <small>동의한 손님만 세요. 주간 리포트의 '방문'과 '버튼 누름'이 여기서 나와요(끄면 0).</small></span>
        </label>
        {draft.leadCaptureEnabled ? <label><span>개인정보 문의처</span><input value={draft.privacyContact} onChange={(e) => update({ privacyContact: e.target.value, privacyPolicy: privacyPolicyWithContact(draft.privacyPolicy, e.target.value) })} placeholder="이메일 또는 전화번호" /></label> : null}
        <label><span>문의 버튼 문구</span><input value={draft.ctaLabel} maxLength={40} onChange={(e) => update({ ctaLabel: e.target.value })} /></label>
        <div className="wide hk-slug-field">
          <label htmlFor="hk-slug"><span>무료 주소 끝부분</span></label>
          <div className="slug-input" data-invalid={slugMessage ? "" : undefined}><em>/launch/</em><input id="hk-slug" ref={slugRef} value={draft.slug} maxLength={60} autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url"
            aria-invalid={slugMessage ? true : undefined} aria-describedby="hk-slug-help"
            onChange={(e) => update({ slug: e.target.value.toLowerCase() })} onBlur={() => setSlugLeft(true)} /></div>
          <small id="hk-slug-help" className={slugMessage ? "hk-slug-error" : "hk-slug-hint"} role={slugMessage ? "alert" : undefined}>
            {slugMessage || (liveSlug && liveSlug !== draft.slug
              ? `지금 손님 주소는 /launch/${liveSlug} 예요. ‘새 버전 공개’를 누르면 주소가 바뀌고 예전 주소로는 열리지 않아요.`
              : "영어 소문자·숫자·- 로 3글자 이상 적어 주세요. 예: dongne-bbang")}
          </small>
        </div>
      </div>
      {/* 이 칸에서 고친 것을 바로 저장 — 위로 스크롤해 전체 저장을 찾지 않게 */}
      <div className="hk-fold-save">
        <button type="button" disabled={busy} onClick={onSave}>{action === "saving" ? <Spinner /> : <Save size={14} />} 사업자 정보 저장</button>
      </div>
    </Fold>

    {/* 3. 도메인 — 접이식. 카드 안의 자체 제목은 CSS 로 숨긴다(요약 줄과 중복) */}
    {!inApp && <Fold
      step={studio ? 3 : 4}
      id="hk-domain"
      icon={<Globe2 size={18} />}
      title="내 도메인 연결"
      badge={site?.customDomain ? <em className={`hk-badge ${domainReady ? "hk-badge-ok" : "hk-badge-warn"}`}>{domainReady ? site.customDomain : `${site.customDomain} · 연결 확인 중`}</em> : null}
    >
      <LandingDomainConnector
        onReadyChange={setDomainReady}
        projectId={projectId}
        initialCustomDomain={site?.customDomain ?? ""}
        published={Boolean(published)}
        demo={false}
        onSiteUpdated={onSiteUpdated}
      />
    </Fold>}

    {/* 5. 문의 알림 번호 — 문의 목록은 '내 문의' 화면에 */}
    <Fold
      step={(inApp ? 4 : 5) - (studio ? 1 : 0)}
      id="hk-leads"
      icon={<Inbox size={18} />}
      title="문의 알림 · 손님 문의"
      badge={leadsError ? <em className="hk-badge hk-badge-warn">확인 필요</em> : leads === null ? <em className="hk-badge">불러오는 중</em> : <em className={`hk-badge ${leads.length ? "hk-badge-info" : ""}`}>{leads.length}건{openLeads ? ` · 답할 것 ${openLeads}건` : ""}</em>}
      hint={draft.leadCaptureEnabled ? undefined : "문의 양식이 꺼져 있어요"}
    >
      <HomepageAlertSettings projectId={projectId} suggestedPhone={draft.businessPhone} />
      {/* 문의 목록은 왼쪽 메뉴 '내 문의'에서 메신저처럼 본다(소유자 요청 2026-10-07). 여기서는 알림 번호만 정한다 */}
      <a className="hk-inquiries-link" href="/plan/inquiries">
        <span><strong>손님 문의에서 보기</strong><small>{leadsError ? "문의 수를 불러오지 못했어요 · 손님 문의에서 다시 확인해 주세요" : leads === null ? "문의를 확인하고 있어요" : leads.length ? `받은 문의 ${leads.length}건${openLeads ? ` · 답할 것 ${openLeads}건` : ""}` : "아직 들어온 문의가 없어요"}</small></span>
        <ChevronDown size={18} aria-hidden style={{ transform: "rotate(-90deg)" }} />
      </a>
    </Fold>

    {/* 6. 전문가 상담 — 담당자가 직접 고쳐 주는 개별 상담. 신청하면 운영자에게 문자가 간다 */}
    <Fold step={(inApp ? 5 : 6) - (studio ? 1 : 0)} id="hk-expert" icon={<PhoneCall size={18} />} title="전문가 상담">
      <HomepageExpertConsult planId={planId ?? null} />
    </Fold>
  </>;

  return (
    <section className="hk" aria-busy={busy} data-studio={studio || undefined}>
      {/* AI 채우기·저장·공개 중에는 입력 칸을 잠근다 — 예전엔 입력이 받아지는 것처럼 보였지만 고친 글이 조용히 버려졌다 */}
      <fieldset className="hk-lock" disabled={busy}>
      {!studio && top}
      {message ? <p className="hk-msg">{message}</p> : null}
      {/* 낭독기 알림 — 늘 붙어 있는 칸에 넣어야 빠짐없이 읽힌다(내용과 같이 생기는 칸은 놓칠 때가 있다). 실패·충돌은 alert로 */}
      <span style={SR_ONLY} role="status" aria-live="polite">{messageAlert ? "" : message}</span>
      <span style={SR_ONLY} role="alert">{messageAlert ? message : ""}</span>

      {/*
        미리보기 — 예전엔 가짜 브라우저 창(신호등 점 + 주소창)에 담았는데 꾸밈이 많고 폰에서 옆으로 밀렸다(대표 요청 2026-10-15).
        에디터 버튼만 둔 줄 하나로('미리보기' 이름표는 군더더기라 걷음 2026-10-24).
        템플릿·에디터 버튼은 목업 바 오른쪽의 작은 버튼으로 — 예전의 큰 버튼
        두 개는 미리보기보다 목소리가 컸다(사용자 지적).
      */}
      {!studio && <p className="hk-step-head"><b className="hk-step-no" aria-hidden="true">1</b> 미리보기·고치기</p>}
      <div className="hk-preview hk-mock" id="hk-preview">
        {!studio && <div className="hk-mock-bar">
          <span className="hk-mock-actions">
            <button type="button" className="hk-mock-edit" disabled={busy} onClick={onOpenEditor}>
              <Pencil size={14} /> 홈페이지 고치기
            </button>
            {/* 고치는 길은 큰 단추 하나 + 작은 글 단추 하나(모바일 점검 r37: 대화로 고치기·홈페이지 고치기·'미리보기를 누르면…' 셋이 겹쳤다) */}
            {onChatEdit ? <button type="button" className="hk-mock-chat" disabled={busy} onClick={onChatEdit}>대화로 고치기</button> : null}
          </span>
        </div>}
        {!studio && tools}
        {/* '미리보기를 누르면 고칠 수 있어요'는 걷었다 — 바로 위 '홈페이지 고치기'와 같은 말. 모양 단추가 필요할 때만 이 줄을 둔다 */}
        {!studio && !previewView && <div className="hk-preview-hint">
          <span className="hk-view-switch" role="radiogroup" aria-label="미리보기 모양">
            <button type="button" role="radio" aria-checked={view === "mobile"} className={view === "mobile" ? "on" : ""} onClick={() => setView("mobile")}>휴대폰</button>
            <button type="button" role="radio" aria-checked={view === "pc"} className={view === "pc" ? "on" : ""} onClick={() => setView("pc")}>컴퓨터</button>
          </span>
        </div>}
        {/* 미리보기 안에 킷 템플릿의 <button>·<input> 이 있어서 <button> 으로 감싸면 invalid HTML(하이드레이션 오류) */}
        <div role="button" tabIndex={busy ? -1 : 0} aria-disabled={busy} aria-busy={aiFill?.running || undefined} ref={previewBodyRef} className={`hk-preview-body ${view === "mobile" ? "hk-preview-phone" : ""}`} onClick={() => { if (!busy) onOpenEditor(); }} onKeyDown={(e) => { if (!busy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpenEditor(); } }} aria-label="홈페이지 고치기">
          {/* 미리보기 속 단추·입력칸은 진짜가 아니다 — inert로 Tab·낭독기에서 빼고, 바깥 '홈페이지 고치기' 단추 하나만 남긴다(휴대폰 틀은 스크롤되게 틀 안쪽에만) */}
          {view === "mobile"
            ? <div className="hk-phone"><div inert aria-hidden="true"><LandingBlocksRenderer data={draft.pageData!} /><PublicAppendixPreview appendix={appendixFromDraft(draft)} /></div></div>
            : <div inert aria-hidden="true"><LandingBlocksRenderer data={draft.pageData!} /><PublicAppendixPreview appendix={appendixFromDraft(draft)} /></div>}
          {/* AI가 채우는 동안 — 다른 화면과 같은 로딩 모양으로, 몇 초째인지 함께 */}
          {/* 대화로 고칠 곳 — 제안 카드가 떠 있는 동안 그 글 위에 '바꿀 곳' 표시(컴퓨터 모양에서만 이름표, 휴대폰 틀은 테두리만) */}
          {pickBox ? <span className="hk-target" aria-hidden="true" style={{ left: pickBox.left, top: pickBox.top, width: pickBox.width, height: pickBox.height }}><span className="hk-target-label"><Target size={12} /> 바꿀 곳</span></span> : null}
          {aiFill?.running ? <div className="hk-preview-loading">
            <PlanLoading note={`AI가 계획서를 읽고 홈페이지를 채우고 있어요. 보통 30초쯤 걸려요 · ${fillSeconds}초`} />
          </div> : null}
        </div>
      </div>
      {studio ? <div className="hk-studio-settings">
        <p className="hk-studio-settings-head">홈페이지 설정</p>
        {published || stopped ? top : null}
        {tools}
        {rest}
      </div> : rest}
      </fieldset>
    </section>
  );
}
