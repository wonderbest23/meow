"use client";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Calculator,
  CircleDollarSign,
  CircleHelp,
  Clock3,
  ClipboardCheck,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Gift,
  Layers3,
  LoaderCircle,
  PanelLeft,
  PackageCheck,
  Presentation,
  ReceiptText,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRAINWAVE_CREDIT } from "../lib/landing/brainwave/catalog";
import { HOME_LOGO, HOME_LOGO_FILTER } from "../lib/landing/home-logo";
import {
  founderLabels,
  type FounderAxis,
} from "../lib/assessment";
import {
  type RankedOpportunity,
} from "../lib/opportunity-engine";
import type { ArtifactRecord, ProjectRecord } from "../lib/service-domain";
import { SiteHeader, SiteLogo } from "../components/site-header";
import { HomeOpening } from "../components/home-opening";
import { HomeServiceOverview } from "../components/home-service-overview";
import { HomeCopyChrome } from "../components/home-copy-chrome";
import homeTypography from "../components/home-typography.module.css";
import homeCinematic from "../components/home-cinematic-hero.module.css";
import { needsPhysicalLocationAnalysis } from "../lib/business/domain";
import { useRouter } from "next/navigation";
import { inferBusinessArchetype } from "../lib/business/router";
import { BeginnerMissionRoadmap } from "../components/beginner-mission-roadmap";
import { DeliveryDocumentPreview } from "../components/delivery-document-preview";
import {
  DocumentEditorStudio,
  type DocumentQuickBlock,
} from "../components/document-editor-studio";
import { LandingQuickEditor } from "../components/landing-quick-editor";
import { LandingBlocksRenderer } from "../components/landing-blocks";
import {
  PresentationEditorPanel,
  type PresentationAssistResult,
} from "../components/presentation-editor-panel";
import { ProjectRefinementStudio } from "../components/project-refinement-studio";
import {
  applyDeliveryDocumentDraft,
  assembleDeliveryPackage,
  type DeliveryItem,
} from "../lib/delivery/package-assembler";
import {
  appendDocumentDraftVersion,
  isDeliveryDocumentId,
  type DocumentDraftVersion,
  type DocumentDrafts,
} from "../lib/delivery/document-drafts";
import { createPaidReportDemoItems } from "../lib/delivery/demo-package";
import {
  createBusinessDocumentsBlob,
  downloadBusinessDocuments,
  saveDownloadBlob,
  type DownloadFormat,
} from "../lib/delivery/client-download";
import {
  applyPresentationDraft,
  buildPresentationSlides,
  type PresentationDeckDrafts,
  type PresentationDeckInput,
  type PresentationDeckType,
  type PresentationSlide,
  type PresentationSlideOverride,
} from "../lib/delivery/presentation-deck";
import { buildTwelveMonthForecast } from "../lib/delivery/financial-model";
import type { GenerationJobRecord } from "../lib/service-audit/domain";
import {
  createLandingDraft,
  ensureLandingPageData,
  landingDraftSchema,
  type LandingDraft,
  type LandingSiteRecord,
} from "../lib/landing/domain";
import { createLandingPageData } from "../lib/landing/page-data";
import {
  mergeStageInputs,
} from "../lib/planning-inputs";
import { deriveAutoDraftContext } from "../lib/auto-draft";
import {
  draftPackageStepDefinitions,
  type DraftPackageRun,
  type DraftRefinementInput,
} from "../lib/draft-package/domain";
import { refinementInputFromProject } from "../lib/refinement/domain";
import {
  PACKAGE_AMOUNT,
  PACKAGE_NAME,
} from "../lib/payments/domain";
import { mailOrderStatusLabels, type MailOrderStatus } from "../lib/platform-legal/domain";

type Screen = "home" | "start" | "project";
type SampleView = "summary" | "presentation" | "landing";

/*
 * 예전 흐름(진단·탐색·미리보기·계좌이체 결제·샘플)은 더 이상 열지 않는다.
 * 지금 서비스는 새 대화(/plan/chat)로 시작하고 카드로만 결제한다(약관 2026-10-05).
 * 그 화면 코드는 지웠고, 주소로 열 수 있는 것은 예전에 결제한 결과물(project)과 새 대화로 넘기는 start 뿐.
 */
const legacyStorageKeys = [
  "venture-current-screen",
  "venture-dna",
  "venture-selected-opportunity",
  "venture-sample-return",
  "venture-sample-view",
  "venture-conversation-draft",
  "venture-direct-plan-job",
];

async function fetchWithTransientRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  attempts = 3,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok || ![502, 503, 504].includes(response.status) || attempt === attempts - 1) {
        return response;
      }
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("서버 연결을 다시 확인해주세요.");
}

function formatDeckPreviewMoney(value: number) {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1).replace(/\.0$/, "")}억원`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

const presentationDeckMeta: Record<PresentationDeckType, {
  title: string;
  type: string;
  description: string;
  pageCount: number;
  slides: string[];
}> = {
  intro: {
    title: "사업소개서",
    type: "고객·파트너 설명용 파워포인트(PPTX)",
    description: "이 사업이 누구의 어떤 문제를 어떻게 해결하고, 무엇을 판매하는지 한 번에 설명합니다.",
    pageCount: 12,
    slides: ["표지", "한눈에 보기", "고객 문제", "해결 방식", "첫 상품", "고객과 이용 장면", "시장 근거", "수익 구조", "첫 시장 진입", "차별점", "운영과 위험", "다음 대화"],
  },
  ir: {
    title: "투자제안서(IR)",
    type: "투자자·지원기관 제안용 파워포인트(PPTX)",
    description: "시장 크기, 경쟁 구도, 검증 지표, 단위 경제성, 팀, 투자금 사용처와 달성 목표를 투자 심사 흐름으로 정리합니다.",
    pageCount: 16,
    slides: ["표지", "투자 핵심", "문제와 시점", "해결책", "TAM·SAM·SOM", "사업 모델", "검증 지표", "경쟁 구도", "시장 진입", "성장 구조", "재무 시나리오", "팀", "투자 요청", "달성 목표", "위험과 실사", "투자 대화"],
  },
};

function PresentationSlideCanvas({
  slide,
  input,
  index,
  total,
}: {
  slide: PresentationSlide;
  input: PresentationDeckInput;
  index: number;
  total: number;
}) {
  const page = String(index + 1).padStart(2, "0");
  const isBookend = slide.kind === "cover" || slide.kind === "closing";
  const financialMonths = slide.monthlyForecast ?? [];
  const maximumMonthlyProfit = Math.max(1, ...financialMonths.map((month) => Math.abs(month.operatingProfitBeforeTaxWon)));
  const annualFinancialRevenue = financialMonths.reduce((sum, month) => sum + month.grossRevenueWon, 0);
  const annualFinancialProfit = financialMonths.reduce((sum, month) => sum + month.operatingProfitBeforeTaxWon, 0);

  return <section
    className={`deck-slide-preview kind-${slide.kind} ${input.deckType === "ir" ? "ir-deck" : ""} ${slide.dark ? "dark" : ""}`}
    data-slide-index={index}
    data-slide-kind={slide.kind}
    style={{ "--deck-accent": input.accentColor } as React.CSSProperties}
  >
    {slide.kind === "cover" ? <>
      <div className="deck-preview-cover-rule" />
      <div className="deck-preview-cover-copy"><small>{slide.eyebrow}</small><h2>{slide.title}</h2><p>{slide.lead}</p><span>{slide.supporting}</span></div>
      <strong className="deck-preview-cover-mark">{input.deckType === "ir" ? "IR" : "BI"}</strong>
    </> : slide.kind === "closing" ? <>
      <div className="deck-preview-closing-copy"><small>{slide.eyebrow}</small><h2>{slide.title}</h2><p>{slide.statement}</p><i /><strong>{input.brandName}</strong><span>{slide.supporting}</span></div>
    </> : <>
      <header className="deck-preview-heading"><small>{slide.eyebrow}</small><span>{page}</span><h2>{slide.title}</h2></header>
      <div className="deck-preview-content">
        {slide.chart ? <div className="deck-preview-chart">
          <strong>{slide.chart.title}</strong>
          <div>{slide.chart.items.map((item) => {
            const maximum = slide.chart?.preset === "fit" ? 100 : Math.max(1, ...slide.chart!.items.map((chartItem) => chartItem.value));
            return <article key={item.label}><span>{item.label}</span><i><b style={{ width: `${Math.max(0, Math.min(100, item.value / maximum * 100))}%` }} /></i><em>{Math.round(item.value).toLocaleString("ko-KR")}{slide.chart?.unit}</em></article>;
          })}</div>
          <p>{slide.chart.sourceNote}</p>
        </div> : <>
          {slide.kind === "statement" && <div className="deck-preview-statement"><b>“</b><strong>{slide.statement}</strong><i /><p>{slide.supporting}</p></div>}
          {slide.kind === "split" && <div className="deck-preview-split"><aside><small>핵심</small><strong>{slide.lead}</strong>{slide.note && <p>{slide.note}</p>}</aside><div>{slide.points?.map((point, pointIndex) => <article key={`${slide.id}-${point.label}`}><span>{String(pointIndex + 1).padStart(2, "0")}</span><strong>{point.label}</strong><p>{point.detail}</p></article>)}</div></div>}
          {slide.kind === "process" && <><p className="deck-preview-lead">{slide.lead}</p><div className="deck-preview-process">{slide.steps?.map((step, stepIndex) => <article key={`${slide.id}-${step.title}`}><b>{String(stepIndex + 1).padStart(2, "0")}</b><i /><strong>{step.title}</strong><p>{step.detail}</p></article>)}</div></>}
          {slide.kind === "metrics" && <><p className="deck-preview-lead">{slide.lead}</p><div className="deck-preview-metrics">{slide.metrics?.map((metric) => <article key={`${slide.id}-${metric.label}`}><small>{metric.label}</small><strong>{metric.value}</strong><p>{metric.note}</p></article>)}</div></>}
          {slide.kind === "evidence" && <><p className="deck-preview-lead">{slide.lead}</p><div className="deck-preview-evidence">{slide.sources?.map((source, sourceIndex) => <article key={`${slide.id}-${source.title}`}><span>{String(sourceIndex + 1).padStart(2, "0")}</span><strong>{source.title}</strong><em>{source.status}</em></article>)}</div>{slide.note && <p className="deck-preview-note">{slide.note}</p>}</>}
          {slide.kind === "timeline" && <><p className="deck-preview-lead">{slide.lead}</p><div className="deck-preview-timeline">{slide.steps?.map((step, stepIndex) => <article key={`${slide.id}-${step.title}`} className={stepIndex === 0 ? "active" : ""}><strong>{step.title}</strong><i /><p>{step.detail}</p></article>)}</div>{slide.note && <p className="deck-preview-timeline-note">{slide.note}</p>}</>}
          {slide.kind === "funding" && <div className="deck-preview-funding"><aside><small>현재 필요 자금</small><strong>{slide.lead}</strong><p>{slide.note}</p></aside><div>{slide.points?.map((point) => <article key={`${slide.id}-${point.label}`}><strong>{point.label}</strong><p>{point.detail}</p></article>)}</div></div>}
          {slide.kind === "thesis" && <div className="deck-preview-thesis"><p>{slide.lead}</p><div>{slide.metrics?.map((metric) => <article key={`${slide.id}-${metric.label}`}><small>{metric.label}</small><strong>{metric.value}</strong><span>{metric.note}</span></article>)}</div>{slide.note && <em>{slide.note}</em>}</div>}
          {slide.kind === "market" && <div className="deck-preview-market"><p>{slide.lead}</p><div>{slide.marketTiers?.map((tier) => <article key={tier.label}><b>{tier.label}</b><small>{tier.name}</small><strong>{tier.value}</strong><span>{tier.formula}</span><em>{tier.status}</em></article>)}</div>{slide.note && <footer>{slide.note}</footer>}</div>}
          {slide.kind === "matrix" && <div className="deck-preview-matrix"><p>{slide.lead}</p><div role="table"><header role="row">{slide.matrix?.columns.map((column, columnIndex) => <strong role="columnheader" key={`${slide.id}-${column}`}>{columnIndex === slide.matrix!.columns.length - 1 && <i />}{column}</strong>)}</header>{slide.matrix?.rows.map((row) => <article role="row" key={`${slide.id}-${row.label}`}><b role="rowheader">{row.label}</b>{row.values.map((value, valueIndex) => <span role="cell" className={valueIndex === row.values.length - 1 ? "ours" : ""} key={`${row.label}-${value}`}>{value}</span>)}</article>)}</div>{slide.matrix?.note && <em>{slide.matrix.note}</em>}</div>}
          {slide.kind === "financial" && (financialMonths.length === 12 ? <div className="deck-preview-financial-chart"><p>{slide.lead}</p><div className="deck-preview-financial-chart-body"><section><header><strong>월별 영업손익</strong><span>단위 · 만원</span></header><div className="deck-financial-bars">{financialMonths.map((month) => <article key={`${slide.id}-${month.month}`}><i><b className={month.operatingProfitBeforeTaxWon < 0 ? "loss" : ""} style={{ height: `${Math.max(5, Math.abs(month.operatingProfitBeforeTaxWon) / maximumMonthlyProfit * 100)}%` }} /></i><strong>{Math.round(month.operatingProfitBeforeTaxWon / 10_000).toLocaleString("ko-KR")}</strong><span>{month.month.replace(/^\d{4}년\s*/, "")}</span></article>)}</div></section><aside><span><small>12개월 매출</small><strong>{formatDeckPreviewMoney(annualFinancialRevenue)}</strong><em>부가세 포함</em></span><span><small>12개월 영업손익</small><strong className={annualFinancialProfit < 0 ? "loss" : ""}>{formatDeckPreviewMoney(annualFinancialProfit)}</strong><em>세전·입력값 기준</em></span><span><small>첫 월 흑자</small><strong>{financialMonths.find((month) => month.operatingProfitBeforeTaxWon >= 0)?.month ?? "미도달"}</strong><em>월 영업손익 0원 이상</em></span></aside></div>{slide.note && <em>{slide.note}</em>}</div> : <div className="deck-preview-financial"><p>{slide.lead}</p><div><header><span>시나리오</span><span>월 판매</span><span>연환산 매출</span><span>연환산 영업손익</span></header>{slide.financialScenarios && slide.financialScenarios.length > 0 ? slide.financialScenarios.map((scenario) => <article key={`${slide.id}-${scenario.name}`}><strong>{scenario.name}</strong><span>{scenario.monthlyUnits.toLocaleString("ko-KR")}건</span><span>{formatDeckPreviewMoney(scenario.netRevenue * 12)}</span><b className={scenario.operatingProfitBeforeTax < 0 ? "loss" : ""}>{formatDeckPreviewMoney(scenario.operatingProfitBeforeTax * 12)}</b></article>) : <article className="empty"><strong>입력 필요</strong><span>판매량</span><span>매출</span><b>영업손익</b></article>}</div>{slide.note && <em>{slide.note}</em>}</div>)}
          {slide.kind === "team" && <div className="deck-preview-team"><aside><small>대표자·팀의 실행 근거</small><strong>{slide.lead}</strong><span>{slide.note}</span></aside><div>{slide.points?.map((point, pointIndex) => <article key={`${slide.id}-${point.label}`}><b>{String(pointIndex + 1).padStart(2, "0")}</b><strong>{point.label}</strong><p>{point.detail}</p></article>)}</div></div>}
          {slide.kind === "ask" && <div className="deck-preview-ask"><aside><small>이번 요청</small><strong>{slide.lead}</strong><p>{slide.supporting}</p><span>{slide.note}</span></aside><div className="deck-preview-ask-body"><section><small>자금 사용처</small>{slide.fundingUses && slide.fundingUses.length > 0 ? slide.fundingUses.map((item) => <p key={`${slide.id}-${item.label}`}><span>{item.label}</span><strong>{formatDeckPreviewMoney(item.amountWon)}</strong></p>) : <p><span>사용처</span><strong>확정 필요</strong></p>}</section><section><small>달성 목표</small>{slide.points?.map((point) => <p key={`${slide.id}-${point.label}`}><span>{point.label}</span><strong>{point.detail}</strong></p>)}</section></div></div>}
        </>}
      </div>
    </>}
    {!isBookend && <footer><span>{input.brandName} · {input.deckType === "ir" ? "INVESTOR RELATIONS" : "BUSINESS INTRODUCTION"}</span><em>{page} / {String(total).padStart(2, "0")}</em></footer>}
    {isBookend && <em className="deck-preview-bookend-page">{page} / {String(total).padStart(2, "0")}</em>}
  </section>;
}

function PresentationSlideThumbnail({ slide, index }: { slide: PresentationSlide; index: number }) {
  return <span className={`presentation-thumbnail-art kind-${slide.kind} ${slide.dark ? "dark" : ""}`}>
    <i />
    <small>{slide.eyebrow}</small>
    <strong>{slide.title}</strong>
    <em>{String(index + 1).padStart(2, "0")}</em>
  </span>;
}

function editablePresentationValue(slide: PresentationSlide): PresentationSlideOverride {
  return {
    title: slide.title,
    ...(slide.lead !== undefined ? { lead: slide.lead } : {}),
    ...(slide.statement !== undefined ? { statement: slide.statement } : {}),
    ...(slide.supporting !== undefined ? { supporting: slide.supporting } : {}),
    ...(slide.note !== undefined ? { note: slide.note } : {}),
    chartPreset: slide.chart?.preset ?? null,
  };
}

/*
 * 이 파일 안에서만 쓰던 헤더를 components/site-header.tsx 로 옮겼다.
 * 계정 화면이 자기 헤더를 따로 그리느라 여백과 테두리가 어긋나 있었기 때문이다.
 * 여기 호출 지점이 열 곳이 넘어서 이름은 그대로 두고 속만 갈아 끼운다.
 */
const Header = SiteHeader;
const Logo = SiteLogo;

function Home({
  onStart,
}: {
  onStart: () => void;
}) {
  const [businessInfo, setBusinessInfo] = useState<{
    operatorName: string; representativeName: string; businessRegistrationNumber: string; mailOrderSalesNumber: string;
    mailOrderStatus: MailOrderStatus; internetDomainName: string;
    businessAddress: string; supportEmail: string; supportPhone: string; hostingProvider: string;
  } | null>(null);
  useEffect(() => {
    void fetch("/api/platform/readiness", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setBusinessInfo(data.business ?? null);
      })
      .catch(() => undefined);
  }, []);
  /*
   * 어드민이 고친 홈 문구(/admin/homepage). 코드의 기본 문구로 먼저 그려지고,
   * 오버라이드가 오면 바꿔 끼운다 — 실패하면 그냥 기본 문구다.
   */
  const [siteCopy, setSiteCopy] = useState<{ texts: Record<string, string>; hidden: string[] }>({ texts: {}, hidden: [] });
  useEffect(() => {
    fetch("/api/site-copy", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { texts?: Record<string, string>; hidden?: string[] }) => { if (j && typeof j === "object") setSiteCopy({ texts: j.texts ?? {}, hidden: j.hidden ?? [] }); })
      .catch(() => {});
  }, []);
  /*
   * 어드민 편집 미리보기(/admin/homepage 의 iframe, ?copyEdit=1) — 저장 전 초안을 받아 바로 그리고,
   * 섹션 테두리(HomeCopyChrome)를 얹어 누르면 어드민 쪽 입력칸으로 간다.
   * 예전엔 이 연결이 빠져 있어 미리보기가 저장 전에는 바뀌지 않고 눌러도 아무 일이 없었다.
   */
  const [copyEdit, setCopyEdit] = useState(false);
  const [copySelected, setCopySelected] = useState<string | null>(null);
  useEffect(() => {
    if (window.parent === window || new URL(window.location.href).searchParams.get("copyEdit") !== "1") return;
    setCopyEdit(true);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const data = event.data as { type?: string; id?: string; texts?: Record<string, string>; hidden?: string[] } | null;
      if (data?.type === "sc-draft") setSiteCopy({ texts: data.texts ?? {}, hidden: data.hidden ?? [] });
      if (data?.type === "sc-selected" && data.id) {
        setCopySelected(data.id);
        document.querySelector(`[data-sc-section="${data.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "sc-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  /*
   * 상단 서리(점진 블러): 맨 위에서는 헤더가 투명하고, 내려가면 헤더 뒤로 겹친 띠 4장이 뒤 배경을 흐리게 한다.
   * 세기는 스크롤 0~120px 구간에서 0→1로 오르는 --frost 하나로 정한다(띠의 흐림·색·투명도가 모두 이 값을 따른다).
   */
  const headerShell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shell = headerShell.current;
    if (!shell) return;
    let frame = 0;
    const apply = () => { frame = 0; shell.style.setProperty("--frost", Math.min(1, Math.max(0, window.scrollY / 120)).toFixed(3)); };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(apply); };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, []);
  const sc = (id: string, def: string) => siteCopy.texts[id] ?? def;
  /** \n 을 <br/> 로 */
  const scBr = (id: string, def: string) => sc(id, def).split("\n").map((line, i, all) => <Fragment key={i}>{line}{i < all.length - 1 ? <br /> : null}</Fragment>);

  const openConsult = () => {
    onStart();
  };



  return (
    <main className={`new-home simple-home product-home cinematic-home ${homeTypography.theme} ${homeCinematic.page}`} style={{ "--home-logo-filter": HOME_LOGO_FILTER } as React.CSSProperties}>
      <div className="home-header-shell" ref={headerShell}>
        <div className="home-header-frost" aria-hidden="true"><i /><i /><i /><i /></div>
        {/* 헤더에는 로고·안내·마이페이지만 둔다. 시작 단추는 본문(입력창·행동 버튼)에 있어 겹친다. */}
        <Header light homeNav logo={HOME_LOGO} onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
      </div>
      <HomeOpening
        title={sc("chatHome.title", "오늘창업")}
        subtitle={siteCopy.texts["chatHome.subtitle"] ? scBr("chatHome.subtitle", "") : undefined}
        hidden={siteCopy.hidden}
        onStart={openConsult}
      />

      <HomeServiceOverview onStart={onStart} />
      {copyEdit ? <HomeCopyChrome hidden={siteCopy.hidden} selected={copySelected} /> : null}

      {/*
        푸터 — 가는 선으로 나눈 세 구획.
        ① 로고와 안내 링크 ② 접이식 상세(사업자 정보 항목표 · 이용 안내 · 디자인 출처) ③ 저작권 줄.
        상세는 기본으로 접어 두어 화면 아래를 길게 차지하지 않는다. 사업자 법정 표기와
        AI 고지는 한 번 눌러 펼치는 자리에 두되, 디자인이 어떻게 바뀌어도 지우지 않는다.
      */}
      <footer className="home-footer">
        <div className="home-footer-head">
          <Logo logo={HOME_LOGO} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
          <nav aria-label="하단 안내">
            <a href="/business-info">사업자·통신판매 정보</a>
            <a href="/privacy">개인정보처리방침</a>
            <a href="/ai-notice">인공지능·국외 처리</a>
            <a href="/terms">이용약관</a>
            <a href="/refund">취소·환불 기준</a>
            <a href="/account">로그인·계정 복구</a>
          </nav>
        </div>
        <details className="home-footer-details">
          <summary>
            <span>사업자 정보 · 이용 안내</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </summary>
          <div className="home-footer-body">
            <div aria-labelledby="footer-business-heading">
              <strong className="home-footer-title" id="footer-business-heading">사업자 정보</strong>
              {businessInfo?.operatorName ? (
                <dl className="home-footer-info">
                  <dt>상호</dt><dd>{businessInfo.operatorName}</dd>
                  <dt>대표</dt><dd>{businessInfo.representativeName}</dd>
                  <dt>사업자등록번호</dt><dd>{businessInfo.businessRegistrationNumber}</dd>
                  {/* 상태 문구가 '통신판매업 신고 완료'처럼 항목명을 되풀이하므로 값에서는 뗀다 */}
                  <dt>통신판매업</dt><dd>{mailOrderStatusLabels[businessInfo.mailOrderStatus].replace(/^통신판매업\s*/, "")}{businessInfo.mailOrderSalesNumber ? ` · ${businessInfo.mailOrderSalesNumber}` : ""}</dd>
                  <dt>주소</dt><dd>{businessInfo.businessAddress}</dd>
                  {businessInfo.supportPhone && <><dt>전화</dt><dd><a href={`tel:${businessInfo.supportPhone.replace(/[^\d+]/g, "")}`}>{businessInfo.supportPhone}</a></dd></>}
                  {businessInfo.supportEmail && <><dt>이메일</dt><dd><a href={`mailto:${businessInfo.supportEmail}`}>{businessInfo.supportEmail}</a></dd></>}
                  <dt>사이트</dt><dd>{businessInfo.internetDomainName}</dd>
                  <dt>호스팅</dt><dd>{businessInfo.hostingProvider}</dd>
                </dl>
              ) : (
                <p className="home-footer-empty">사업자 정보를 불러오지 못했어요. <a href="/business-info">사업자 정보 보기</a></p>
              )}
            </div>
            <div aria-labelledby="footer-notes-heading">
              <strong className="home-footer-title" id="footer-notes-heading">이용 안내</strong>
              <ul className="home-footer-notes">
                <li>인공지능 생성 내용은 반드시 원문과 현장 자료로 확인해야 합니다.</li>
                <li>사진과 화면 예시는 AI로 만든 브랜드 이미지와 가상 사업 예시이며 실제 고객이나 실적이 아닙니다.</li>
                <li>전체 문서 생성과 파일 내려받기는 결제 후 이용할 수 있습니다.</li>
              </ul>
            </div>
            <p className="home-footer-credits">
              디자인 출처 · BRIX Templates의 Website Wireframes UI Kit · Khoa (JAK)의 Neuros Lite · <a href={BRAINWAVE_CREDIT.url} target="_blank" rel="noopener noreferrer">{BRAINWAVE_CREDIT.text}</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
            </p>
          </div>
        </details>
        <div className="home-footer-legal">
          <small>© 2026 오늘창업</small>
        </div>
      </footer>
    </main>
  );
}

const launchStages = [
  {
    name: "시작 준비",
    period: "1단계",
    title: "사업의 전체 틀을 잡아요",
    description: "선택한 아이디어를 실제 사업의 모양으로 정리하고, 함께 완성할 결과물의 우선순위를 정합니다.",
    tasks: ["AI가 만든 사업 실행 요약서 확인"],
    output: "사업 실행 요약서",
  },
  {
    name: "고객·시장 정의",
    period: "2단계",
    title: "누구의 어떤 문제인지 선명하게 정의해요",
    description: "목표 고객과 그들의 문제, 현재 대안을 구체적으로 정리합니다. 고객 확인이 필요할 때 활용할 인터뷰 질문도 함께 담습니다.",
    tasks: ["AI가 만든 고객·시장 초안 확인"],
    output: "고객·시장 진단서",
  },
  {
    name: "상품·가격",
    period: "3단계",
    title: "실제로 팔 수 있는 상품으로 설계해요",
    description: "고객의 문제를 해결하는 첫 상품과 가격, 손익 구조를 설계합니다.",
    tasks: ["AI가 제안한 상품·가격 초안 확인"],
    output: "상품 구성표·손익 시트",
  },
  {
    name: "이름·소개 문구",
    period: "4단계",
    title: "고객이 이해할 언어를 만들어요",
    description: "이름보다 먼저 고객에게 할 약속과 다른 점을 정하고 한 줄 소개 문구로 발전시킵니다.",
    tasks: ["AI가 제안한 이름·소개 문구 확인"],
    output: "이름·소개 문구 모음",
  },
  {
    name: "판매 페이지",
    period: "5단계",
    title: "사업을 보여줄 페이지를 구성해요",
    description: "문제, 해결책, 가격, 자주 묻는 질문과 문의 행동이 연결된 휴대전화용 판매 페이지를 제작합니다.",
    tasks: ["AI가 만든 판매 페이지 초안 확인"],
    output: "공개 가능한 판매 페이지",
  },
  {
    name: "실행 계획",
    period: "6단계",
    title: "실행 순서와 다음 단계를 정리해요",
    description: "사업을 실제로 굴리기 위한 준비물과 실행 순서를 정리합니다. 고객 반응 확인은 준비되면 시작할 수 있는 다음 단계로 담습니다.",
    tasks: ["AI가 만든 실행 계획 확인"],
    output: "첫 공개 문서·30일 실행안",
  },
];

const paidReportDemoOpportunity: RankedOpportunity = {
  id: "paid-report-demo-pet-safety",
  title: "1인 가구 반려동물 비상 돌봄망",
  oneLiner: "보호자가 갑자기 자리를 비울 때 검증된 돌봄 파트너를 30분 안에 연결합니다.",
  sector: "펫·안전",
  model: "월 회원비 + 연결 수수료",
  customer: "서울 거주 1인 반려가구",
  capital: "소액",
  launchTime: "3~6주",
  revenue: "월 회원비 + 건별 연결 수수료",
  stage: "지역 시험 운영",
  riasec: ["S", "C", "R"],
  founder: ["customer", "execution"],
  market: 74,
  novelty: 68,
  feasibility: 82,
  evidenceStatus: "verified",
  evidenceSources: [],
  regulation: 42,
  skills: ["고객 상담", "파트너 검증", "지역 운영"],
  risk: "돌봄 제공자의 신원·보험·사고 책임 범위를 계약과 운영 절차로 먼저 고정해야 합니다.",
  firstTest: "한 생활권에서 보호자 10명과 돌봄 파트너 5명을 모집해 유료 연결 3건을 수동 운영합니다.",
  color: "sage",
  match: 86,
  reasons: ["고객 문제를 직접 듣고 조정하는 강점이 맞습니다.", "작은 지역 시험 운영으로 시작할 수 있습니다."],
  caution: "실제 영업 전 신원 확인, 보험, 개인정보 처리 절차를 다시 검토해야 합니다.",
  scoreBreakdown: { personalFit: 86, market: 74, feasibility: 82, novelty: 68 },
};

const paidReportDemoItems = createPaidReportDemoItems(paidReportDemoOpportunity);

function createFinalLandingDraft(
  opportunity: RankedOpportunity,
  brandChoice: string,
  sellingPrice: number,
  demo: boolean,
): LandingDraft {
  const draft = createLandingDraft({
    title: brandChoice || opportunity.title,
    oneLiner: opportunity.oneLiner,
    customer: opportunity.customer,
    model: opportunity.model,
    legalNotice: opportunity.caution,
    sector: opportunity.sector,
  });
  const finalDraft: LandingDraft = {
    ...draft,
    businessName: brandChoice || opportunity.title,
    heroLabel: demo ? "서울 서북권 첫 이용자 모집" : draft.heroLabel,
    headline: demo ? "갑자기 집을 비워야 할 때, 반려동물을 혼자 두지 마세요." : draft.headline,
    subheadline: demo
      ? "신원과 돌봄 기준을 확인한 지역 파트너를 연결하고, 요청부터 인계까지 기록으로 남깁니다."
      : draft.subheadline,
    ctaLabel: demo ? "비상 돌봄 신청하기" : draft.ctaLabel,
    accentColor: "#0b7254",
    backgroundTone: "white",
    offerTitle: demo ? "30분 내 비상 돌봄 연결" : draft.offerTitle,
    offerDescription: demo
      ? "요청 확인, 파트너 연결, 돌봄 인계 기록까지 한 번에 진행합니다."
      : draft.offerDescription,
    priceLabel: `${sellingPrice.toLocaleString("ko-KR")}원부터`,
    benefits: demo ? [
      { title: "확인된 파트너", description: "신원과 가능 시간을 확인한 지역 돌봄 파트너만 연결합니다." },
      { title: "빠른 응답", description: "요청 접수 후 30분 안에 연결 가능 여부를 안내합니다." },
      { title: "인계 기록", description: "요청 내용과 돌봄 완료 상태를 보호자에게 기록으로 전달합니다." },
    ] : draft.benefits,
    proofItems: demo ? ["보호자 인터뷰 12건 반영", "지역 파트너 검증 절차 수립", "사고 대응 체크리스트 포함"] : draft.proofItems,
    privacyController: brandChoice || opportunity.title,
    privacyContact: demo ? "privacy@gyeotbom.kr" : draft.privacyContact,
    heroImageUrl: demo
      ? "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=1800&q=82"
      : draft.heroImageUrl,
    heroImageAlt: demo ? "집에서 편안하게 쉬고 있는 반려견" : draft.heroImageAlt,
    businessRepresentative: demo ? "김가람" : draft.businessRepresentative,
    businessAddress: demo ? "서울특별시 은평구 통일로 00, 2층" : draft.businessAddress,
    businessPhone: demo ? "02-000-0000" : draft.businessPhone,
    businessEmail: demo ? "hello@gyeotbom.kr" : draft.businessEmail,
    businessContact: demo ? "02-000-0000" : draft.businessContact,
    businessRegistrationNumber: demo ? "123-45-67890" : draft.businessRegistrationNumber,
    mailOrderSalesNumber: demo ? "제2026-서울은평-0000호" : draft.mailOrderSalesNumber,
  };
  return {
    ...finalDraft,
    pageData: createLandingPageData(finalDraft, finalDraft.templateId),
  };
}

function InstantDraftBuilder({
  opportunity,
  run,
  error,
  connectionMessage,
  onRetry,
  onHome,
}: {
  opportunity: RankedOpportunity;
  run: DraftPackageRun | null;
  error: string;
  connectionMessage: string;
  onRetry: () => void;
  onHome: () => void;
}) {
  const completedSteps = run?.completedSteps ?? 0;
  const totalSteps = run?.totalSteps ?? draftPackageStepDefinitions.length;
  const progress = Math.max(run?.status === "complete" ? 100 : 3, Math.min(100, Math.round((completedSteps / totalSteps) * 100)));
  const steps = run?.steps ?? draftPackageStepDefinitions.map((item) => ({
    ...item,
    status: "waiting" as const,
    startedAt: null,
    completedAt: null,
  }));
  const mode = run?.mode ?? "initial";
  const waitingForAI = run?.status === "waiting";
  const reconnecting = Boolean(connectionMessage);
  const currentStepIndex = Math.min(
    Math.max(run?.currentStep ?? completedSteps, 0),
    Math.max(totalSteps - 1, 0),
  );
  const currentStep = steps[currentStepIndex] ?? steps[0];
  const nextStep = steps.slice(currentStepIndex + 1).find((step) => step.status !== "complete") ?? null;
  const currentStepNumber = Math.min(totalSteps, currentStepIndex + 1);
  const currentAction = waitingForAI
    ? "서버 연결을 기다리고 있어요"
    : reconnecting
      ? "진행 화면을 다시 연결하고 있어요"
      : mode === "refine"
        ? `${currentStep?.label ?? "자료"}을 다시 다듬고 있어요`
        : `${currentStep?.label ?? "자료"}을 만들고 있어요`;
  return (
    <main className="instant-draft-page">
      <Header onHome={onHome} />
      <section className="instant-draft-card">
        <header className="instant-draft-heading" aria-live="polite">
          <small>{error ? "제작 상태 확인" : reconnecting ? "자동 재연결 중" : waitingForAI ? "서버 자동 재시도" : mode === "refine" ? "전체 초안 수정" : "맞춤 사업 자료 제작"}</small>
          <h1>{error ? "자료 제작이 잠시 멈췄어요" : currentAction}</h1>
          <p>{error || connectionMessage || run?.message || `${opportunity.title}에 맞는 제작 순서를 준비하고 있습니다.`}</p>
        </header>

        {error ? (
          <div className="instant-draft-error-panel">
            <span><CircleHelp /></span>
            <small>확인이 필요한 자료</small>
            <strong>{currentStep?.label ?? "현재 자료"}</strong>
            <button className="instant-draft-retry" onClick={onRetry}><RefreshCw /> 멈춘 단계부터 다시 만들기</button>
          </div>
        ) : (
          <>
            <div className={`instant-draft-visual ${waitingForAI || reconnecting ? "waiting" : ""}`} key={currentStep?.key ?? "preparing"} aria-hidden="true">
              <i className="instant-draft-sheet sheet-back"><FileText /></i>
              <i className="instant-draft-sheet sheet-middle"><FileText /></i>
              <div className="instant-draft-document">
                <div><span><FileText /></span><em>{currentStepNumber} / {totalSteps}</em></div>
                <small>{waitingForAI ? "자동 재시도 대기" : reconnecting ? "서버 제작 계속 진행 중" : "현재 제작 중"}</small>
                <strong>{currentStep?.label ?? "사업 자료"}</strong>
                <p>{currentStep?.description ?? "사업에 필요한 내용을 정리하고 있어요."}</p>
                <i /><i /><i />
                <b />
              </div>
            </div>

            <div className="instant-draft-progress-card">
              <div><strong>{progress}%</strong><span>{completedSteps}개 완료</span></div>
              <i role="progressbar" aria-label="전체 자료 제작 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><b style={{ width: `${progress}%` }} /></i>
              <div className="instant-draft-stage-cue">
                <span className="current">{waitingForAI ? <Clock3 /> : reconnecting ? <RefreshCw /> : <LoaderCircle className="spin" />}<small>현재</small><strong>{currentStep?.label ?? "준비 중"}</strong></span>
                {nextStep && <><ArrowRight /><span><small>다음</small><strong>{nextStep.label}</strong></span></>}
              </div>
            </div>

            <div className="instant-draft-away-notice"><CheckCircle2 /><span><strong>{reconnecting ? "화면 연결이 끊겨도 서버 제작은 중단되지 않습니다" : waitingForAI ? "이 화면에서 기다리거나 다시 시작할 필요가 없습니다" : "화면을 닫아도 제작은 계속됩니다"}</strong><small>{reconnecting ? "자동으로 다시 연결해 최신 진행률이나 완성 결과를 불러옵니다." : waitingForAI ? "서버가 연결 상태를 확인해 자동으로 재개합니다. 같은 브라우저로 돌아오면 최신 진행 상황을 보여드려요." : "같은 브라우저로 다시 들어오면 현재 진행 상황부터 이어서 보여드려요."}</small></span></div>
            <div className="instant-draft-note">{waitingForAI ? <RefreshCw /> : <Sparkles />}<span><strong>{waitingForAI ? "연결이 가능해지면 서버가 자동으로 재개해요" : "보통 8~15분 정도 걸려요"}</strong><small>{waitingForAI ? "완료 전까지 진행 상태를 안전하게 보관합니다." : "완료되면 바로 수정하고 내려받을 수 있는 결과 화면으로 전환됩니다."}</small></span></div>
          </>
        )}
      </section>
    </main>
  );
}

function FinalDelivery({
  opportunity,
  price,
  brandChoice,
  serverProject,
  demo = false,
  onHome,
  onStart,
  sampleActionLabel,
  sampleView = "summary",
  onCloseSample,
  onRefine,
  onProjectUpdated,
}: {
  opportunity: RankedOpportunity;
  price: number;
  brandChoice: string;
  serverProject: ProjectRecord | null;
  demo?: boolean;
  onHome: () => void;
  onStart?: () => void;
  sampleActionLabel?: string;
  sampleView?: SampleView;
  onCloseSample?: () => void;
  onRefine?: (input: DraftRefinementInput, source?: "edit" | "restore") => Promise<void>;
  onProjectUpdated?: (project: ProjectRecord) => void;
}) {
  const savedStageBrand = typeof serverProject?.stages[3]?.inputs.selectedName === "string"
    ? serverProject.stages[3].inputs.selectedName
    : "";
  const missionBrand = serverProject?.launchMissionWorkspace?.brand.brandName ?? "";
  const resolvedBrandName = brandChoice || missionBrand || savedStageBrand || opportunity.title;
  const approvedMarketArtifact = serverProject?.stages[1]?.artifacts.find((artifact) => artifact.id === serverProject.stages[1].approvedArtifactId);
  const artifactCustomer = typeof approvedMarketArtifact?.content.primaryCustomer === "string" ? approvedMarketArtifact.content.primaryCustomer : "";
  const resolvedCustomer = artifactCustomer || deriveAutoDraftContext(opportunity).customer;
  const refinementInput = serverProject ? refinementInputFromProject(serverProject) : null;
  const approvedArtifacts = serverProject?.stages
    .map((stage) => stage.artifacts.find((artifact) => artifact.id === stage.approvedArtifactId))
    .filter((artifact): artifact is ArtifactRecord => Boolean(artifact)) ?? [];
  const aiGeneratedCount = approvedArtifacts.filter((artifact) => artifact.explanations.some((item) => /생성 방식: (?:OpenAI API|AI) · /.test(item))).length;
  const generationModel = approvedArtifacts
    .flatMap((artifact) => artifact.explanations)
    .map((item) => item.match(/생성 방식: (?:OpenAI API|AI) · (.+)$/)?.[1])
    .find((model): model is string => Boolean(model));
  const generationMode = demo ? "sample" : aiGeneratedCount === 6 ? "ai" : aiGeneratedCount > 0 ? "mixed" : "fallback";
  const generationTitle = generationMode === "ai"
    ? `AI 핵심 문서 6종 고도화 완료${generationModel ? ` · ${generationModel}` : ""}`
    : generationMode === "mixed"
      ? `AI 핵심 문서 ${aiGeneratedCount}/6종 적용`
      : generationMode === "sample"
        ? "화면 확인용 가상 사례"
        : "규칙 기반 안전 초안 · AI 미적용";
  const generationDescription = generationMode === "ai"
    ? "사업 전용 생성 규칙과 사실성 검수를 통과했습니다. 계획서·발표자료는 승인 초안과 저장된 계산을 다시 조립하며, 출처·인허가는 연결된 원문을 기준으로 최종 확인하세요."
    : generationMode === "mixed"
      ? "일부 단계만 OpenAI로 생성되었습니다. 나머지는 사용자 입력과 저장된 계산만 사용하는 안전 초안입니다."
      : generationMode === "sample"
        ? "실제 사업 판단에 사용할 수 없는 화면 구성 예시입니다."
        : "허구의 실적과 시장 수치를 만들지 않는 기본 초안입니다. AI 고도화가 적용된 결과로 오해하지 마세요.";
  const [landingPreview, setLandingPreview] = useState(demo && sampleView === "landing");
  const [fundingBreakdownOpen, setFundingBreakdownOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<"summary" | "business" | "market" | "landing" | "launch" | "documents">(
    sampleView === "presentation" ? "documents" : sampleView,
  );
  const [mobileReportMenuOpen, setMobileReportMenuOpen] = useState(false);
  const reportMainRef = useRef<HTMLDivElement>(null);
  const [landingDraft, setLandingDraft] = useState<LandingDraft>(() =>
    createFinalLandingDraft(opportunity, resolvedBrandName, price, demo),
  );
  const [landingAction, setLandingAction] = useState<"idle" | "saving" | "saved" | "publishing">("idle");
  const [landingMessage, setLandingMessage] = useState("");
  const [landingSite, setLandingSite] = useState<LandingSiteRecord | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DeliveryItem | null>(null);
  const [documentEditorId, setDocumentEditorId] = useState<string | null>(null);
  const [documentDrafts, setDocumentDrafts] = useState<DocumentDrafts>({});
  const [presentationPreview, setPresentationPreview] = useState<PresentationDeckType | null>(demo && sampleView === "presentation" ? "intro" : null);
  const [presentationSlideIndex, setPresentationSlideIndex] = useState(0);
  const [presentationDrafts, setPresentationDrafts] = useState<PresentationDeckDrafts>({});
  const [presentationEditorOpen, setPresentationEditorOpen] = useState(false);
  const [presentationEditorValue, setPresentationEditorValue] = useState<PresentationSlideOverride>({ title: "" });
  const [presentationAssistResult, setPresentationAssistResult] = useState<PresentationAssistResult | null>(null);
  const [presentationEditorAction, setPresentationEditorAction] = useState<"idle" | "saving" | "spellcheck" | "improve" | "market">("idle");
  const [presentationEditorMessage, setPresentationEditorMessage] = useState("");
  const [marketResearchAction, setMarketResearchAction] = useState<"idle" | "researching">("idle");
  const [marketResearchMessage, setMarketResearchMessage] = useState("");
  const [documentDownload, setDocumentDownload] = useState("");
  const [documentMessage, setDocumentMessage] = useState("");
  const closeSampleOverlay = useCallback((overlay: "landing" | "presentation") => {
    if (overlay === "landing") setLandingPreview(false);
    else {
      setPresentationPreview(null);
      setPresentationSlideIndex(0);
      setPresentationEditorOpen(false);
    }
    if (demo && onCloseSample) onCloseSample();
  }, [demo, onCloseSample]);
  const deliveryIcons = {
    brief: Target,
    market: Users,
    pricing: BarChart3,
    brand: Sparkles,
    landing: Layers3,
    launch: Rocket,
    plan: BriefcaseBusiness,
    operations: ClipboardCheck,
    execution: TrendingUp,
    grants: BadgeCheck,
  } as const;
  const deliveryFriendlyCopy: Record<string, { title: string; description: string }> = {
    brief: { title: "내 사업 한눈에 보기", description: "무엇을 누구에게 어떻게 팔지 한눈에 정리한 파일" },
    market: { title: "고객과 시장 확인하기", description: "고객이 겪는 문제와 지금 사용 중인 다른 해결 방법" },
    pricing: { title: "상품 가격과 예상 수익", description: "상품별 가격, 필요한 비용과 손익분기점" },
    brand: { title: "사업 이름과 소개 문구", description: "추천 이름, 한 줄 소개와 고객에게 쓸 표현" },
    landing: { title: "홈페이지에 넣을 글", description: "휴대전화에서 보는 홈페이지의 전체 글" },
    launch: { title: "첫 고객을 찾는 30일 계획", description: "날짜별로 할 일과 확인할 목표" },
    plan: { title: "사업계획서", description: "시장, 수익, 운영 방법과 필요한 자금" },
    operations: { title: "사업 운영 방법", description: "준비물, 업무 순서와 고객 응대 방법" },
    execution: { title: "판매 결과와 다음 계획", description: "판매 과정과 비용을 확인하고 다음에 바꿀 점" },
    grants: { title: "정부 지원사업 신청서 초안", description: "지원사업 양식에 맞춰 작성한 신청 내용" },
  };
  const deliveryPack = useMemo(
    () => serverProject ? assembleDeliveryPackage(serverProject) : demo ? {
      items: paidReportDemoItems,
      completeCount: paidReportDemoItems.length,
      missingTitles: [],
      qualityStatus: "conditional",
      qualityScore: 88,
      deliveryQuality: {
        score: 88,
        status: "conditional" as const,
        label: "예시 문서 품질 확인",
        readyCount: paidReportDemoItems.length,
        totalCount: paidReportDemoItems.length,
        blockerCount: 0,
        warningCount: 1,
        verifiedSourceCount: 0,
        checks: [
          { id: "documents", label: "10종 결과물", passed: true, detail: "예시 결과물 10개가 준비되었습니다." },
          { id: "depth", label: "문서별 내용 기준", passed: true, detail: "예시 문서는 읽기·표·실행 항목 기준을 충족합니다." },
          { id: "financial", label: "숫자 일치", passed: true, detail: "예시 문서 안의 가격·비용·손익분기점이 일치합니다." },
          { id: "demo", label: "실제 근거 여부", passed: false, detail: "가상 사례이므로 실제 사업 판단에는 사용할 수 없습니다." },
        ],
        actions: ["내 사업으로 시작하면 입력한 조건과 실제 근거를 기준으로 새 문서를 생성합니다."],
        generatedAt: "2026-07-14T09:30:00.000Z",
        engineVersion: "paid-delivery-quality-v2",
      },
      factSummary: {
        total: 14,
        verified: 0,
        userInput: 5,
        calculated: 4,
        assumptions: 4,
        needsInput: 1,
      },
      claimSummary: {
        checkedDocuments: paidReportDemoItems.length,
        safeDocuments: paidReportDemoItems.length,
        convertedClaims: 0,
      },
    } : null,
    [demo, serverProject],
  );
  const deliveryQuality = deliveryPack?.deliveryQuality;
  const deliveryFactSummary = deliveryPack?.factSummary;
  const deliveryItems = useMemo(() => (deliveryPack?.items ?? []).map((item) => {
    if (!isDeliveryDocumentId(item.id)) return item;
    const draft = documentDrafts[item.id];
    if (!draft) return item;
    if (serverProject) return applyDeliveryDocumentDraft(serverProject, item, draft);
    return {
      ...item,
      markdown: draft.markdown,
      generatedAt: draft.updatedAt,
      versionLabel: `${draft.versions.at(-1)?.version ?? 1}차 수정본`,
    };
  }), [deliveryPack, documentDrafts, serverProject]);
  const deliveryClaimSummary = useMemo(() => ({
    checkedDocuments: deliveryItems.filter((item) => item.source !== "missing").length,
    safeDocuments: deliveryItems.filter((item) => item.source !== "missing" && (item.claimSafety?.changedCount ?? 0) === 0).length,
    convertedClaims: deliveryItems.reduce((sum, item) => sum + (item.claimSafety?.changedCount ?? 0), 0),
  }), [deliveryItems]);
  const documentEditorItem = documentEditorId
    ? deliveryItems.find((item) => item.id === documentEditorId) ?? null
    : null;
  const deliveryItemIndex = new Map(deliveryItems.map((item, index) => [item.id, index]));
  const deliveryGroups = [
    {
      id: "start",
      eyebrow: "사업을 시작할 때",
      title: "처음 바로 사용하는 파일",
      description: "사업 내용과 가격을 확인하고, 이름·홈페이지·첫 30일 계획을 살펴보세요.",
      itemIds: ["brief", "pricing", "brand", "landing", "launch"],
    },
    {
      id: "submit",
      eyebrow: "다른 사람에게 설명할 때",
      title: "소개하거나 신청할 때 쓰는 파일",
      description: "사업소개서, 투자제안서, 사업계획서와 정부 지원사업 신청서가 들어 있습니다.",
      itemIds: ["plan", "grants"],
    },
    {
      id: "operate",
      eyebrow: "사업을 운영할 때",
      title: "비용과 운영을 확인하는 파일",
      description: "고객·시장 정보, 업무 방법, 판매 결과와 12개월 예상 수익을 확인하세요.",
      itemIds: ["market", "operations", "execution"],
    },
  ].map((group) => ({ ...group, items: group.itemIds.map((id) => deliveryItems.find((item) => item.id === id)).filter((item): item is DeliveryItem => Boolean(item)) }));
  const resultCount = deliveryItems.length + 3;
  const paidAmount = serverProject?.packagePrice ?? PACKAGE_AMOUNT;
  const betaAccess = serverProject?.packagePrice === 0;
  const financial = serverProject?.businessAssessment?.financial;
  const savedStagePrice = typeof serverProject?.stages[2]?.inputs.basePriceWon === "number"
    ? serverProject.stages[2].inputs.basePriceWon
    : null;
  const sellingPrice = financial?.grossPrice ?? savedStagePrice ?? price;
  const breakEvenUnits = financial?.breakEvenUnits ?? (demo ? 28 : null);
  const totalFundingNeed = financial?.totalFundingNeed ?? (demo ? 3650000 : null);
  const verifiedEvidenceCount = serverProject?.marketAnalysis?.verifiedEvidenceCount ?? (demo ? 4 : 0);
  const setupFinancial = serverProject?.businessSetup?.financial;
  const workingCapitalMonths = setupFinancial?.workingCapitalMonths ?? 3;
  const initialCostLabels: Record<string, string> = {
    deposit: "임차 보증금",
    keyMoney: "권리금",
    brokerage: "중개 수수료",
    interior: "인테리어",
    equipment: "장비·안전용품",
    initialInventory: "첫 재고·재료",
    licensesAndRegistration: "등록·허가·보험 준비",
    launchMarketing: "첫 고객 홍보",
    contingency: "예비비",
    other: "기타 준비비",
  };
  const monthlyCostLabels: Record<string, string> = {
    rent: "월 임차료",
    maintenance: "관리비",
    payrollGross: "급여",
    accounting: "세무·회계",
    software: "업무 도구",
    utilitiesAndTelecom: "공과금·통신",
    businessInsurance: "영업 보험",
    fixedMarketing: "월 홍보비",
    loanInterest: "대출 이자",
    depreciation: "장비 감가상각",
    other: "기타 고정비",
  };
  const initialFundingLines = setupFinancial
    ? Object.entries(setupFinancial.initial).filter(([, amount]) => amount > 0).map(([key, amount]) => ({ label: initialCostLabels[key] ?? key, amount }))
    : demo ? [
      { label: "장비·안전용품", amount: 450000 },
      { label: "등록·허가·보험 준비", amount: 250000 },
      { label: "첫 고객 홍보", amount: 350000 },
      { label: "예비비", amount: 300000 },
      { label: "기타 준비비", amount: 200000 },
    ] : [];
  const monthlyFundingLines = setupFinancial
    ? Object.entries(setupFinancial.monthlyFixed).filter(([key, amount]) => key !== "employerInsuranceRate" && amount > 0).map(([key, amount]) => ({ label: monthlyCostLabels[key] ?? key, amount }))
    : demo ? [
      { label: "이동·공간 운영", amount: 250000 },
      { label: "세무·보험·업무 도구", amount: 150000 },
      { label: "월 고객 홍보", amount: 150000 },
      { label: "통신·운영 예비비", amount: 150000 },
    ] : [];
  if (setupFinancial && setupFinancial.monthlyFixed.payrollGross > 0 && setupFinancial.monthlyFixed.employerInsuranceRate > 0) {
    monthlyFundingLines.push({
      label: "급여 사업주 부담분",
      amount: Math.round(setupFinancial.monthlyFixed.payrollGross * setupFinancial.monthlyFixed.employerInsuranceRate / 100),
    });
  }
  const initialInvestment = financial?.initialInvestment ?? initialFundingLines.reduce((sum, item) => sum + item.amount, 0);
  const monthlyFixedCost = financial?.monthlyFixedCost ?? monthlyFundingLines.reduce((sum, item) => sum + item.amount, 0);
  const workingCapital = financial?.recommendedWorkingCapital ?? monthlyFixedCost * workingCapitalMonths;
  const savedMarketEvidence = serverProject?.marketWorkspace?.evidence ?? [];
  const marketSources = savedMarketEvidence.length > 0
    ? savedMarketEvidence.map((evidence) => ({
      title: evidence.title,
      source: evidence.sourceName,
      date: evidence.observedAt,
      url: evidence.sourceUrl,
      status: evidence.verification === "verified" ? "공식 원문 확인" : evidence.verification === "user_supplied" ? "사용자 입력" : "추가 확인 필요",
      note: evidence.note || `${evidence.metric}: ${evidence.value}${evidence.unit}`,
    }))
    : demo ? [
      { title: "보호자 12명 인터뷰", source: "가상 고객 인터뷰 기록", date: "2026-07-10", url: "", status: "화면 예시", note: "12명 중 8명이 최근 6개월 내 급한 돌봄 공백을 경험했다고 답한 가상 입력값" },
      { title: "생활권 업종·경쟁 확인 경로", source: "서울시 우리마을가게 상권분석서비스", date: "조회 전", url: "https://golmok.seoul.go.kr/", status: "추가 조회 필요", note: "실제 지역과 업종을 정한 뒤 점포·매출·상권 변화를 조회해야 함" },
      { title: "1인 가구 통계 확인 경로", source: "국가통계포털 KOSIS", date: "조회 전", url: "https://kosis.kr/", status: "추가 조회 필요", note: "지역별 1인 가구 규모와 연령 분포를 확인하는 공식 조회 경로" },
      { title: "소상공인 업종 정보 확인 경로", source: "소상공인시장진흥공단 소상공인마당", date: "조회 전", url: "https://www.sbiz.or.kr/", status: "추가 조회 필요", note: "업종별 지원·정책·창업 정보를 확인하는 공식 경로" },
    ] : (opportunity.evidenceSources ?? []).map((source) => ({
      title: source.title,
      source: new URL(source.url).hostname,
      date: source.observedAt,
      url: source.url,
      status: "추천 단계 참고자료",
      note: "사업 지역과 조건을 정한 뒤 최신 원문을 다시 확인하세요.",
    }));
  const documentQuickBlocks: DocumentQuickBlock[] = [];
  if (sellingPrice || monthlyFixedCost || totalFundingNeed) {
    documentQuickBlocks.push({
      id: "saved-financials",
      label: "저장된 사업 숫자표",
      description: "현재 프로젝트의 가격·고정비·준비자금을 같은 값으로 넣습니다.",
      markdown: [
        "### 저장된 사업 숫자",
        "",
        "| 항목 | 현재 저장값 | 확인 상태 |",
        "| --- | ---: | --- |",
        `| 첫 상품 판매가 | ${sellingPrice ? `${sellingPrice.toLocaleString("ko-KR")}원` : "추가 입력 필요"} | 프로젝트 저장값 |`,
        `| 월 고정비 | ${monthlyFixedCost ? `${monthlyFixedCost.toLocaleString("ko-KR")}원` : "추가 입력 필요"} | 프로젝트 저장값 |`,
        `| 월 손익분기 판매량 | ${breakEvenUnits ? `${breakEvenUnits.toLocaleString("ko-KR")}건` : "추가 입력 필요"} | 자동 계산 |`,
        `| 총 필요 준비자금 | ${totalFundingNeed ? `${totalFundingNeed.toLocaleString("ko-KR")}원` : "추가 입력 필요"} | 자동 계산 |`,
      ].join("\n"),
    });
  }
  if (marketSources.length > 0) {
    const sourceRows = marketSources.slice(0, 8).map((source, index) => {
      const clean = (value: string) => value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
      return `| E${String(index + 1).padStart(2, "0")} | ${clean(source.title)} | ${clean(source.status)} | ${source.url ? `[원문](${source.url})` : "내부 기록"} |`;
    });
    documentQuickBlocks.push({
      id: "saved-evidence",
      label: "저장된 시장 근거표",
      description: "시장 확인에 저장된 자료만 출처 주소와 함께 넣습니다.",
      markdown: [
        "### 연결된 시장 근거",
        "",
        "| 번호 | 자료 | 확인 상태 | 원문 |",
        "| --- | --- | --- | --- |",
        ...sourceRows,
      ].join("\n"),
    });
  }
  const reportTabs = [
    { id: "summary" as const, label: "사업 요약", icon: FileText },
    { id: "business" as const, label: "상품·손익", icon: BarChart3 },
    { id: "market" as const, label: "시장 확인", icon: Users },
    { id: "landing" as const, label: "판매 페이지", icon: Layers3 },
    { id: "documents" as const, label: "최종 결과물", icon: PackageCheck },
    { id: "launch" as const, label: "실행 도우미", icon: CalendarDays },
  ];
  const activeReportTab = reportTabs.find((tab) => tab.id === activeReport) ?? reportTabs[0];
  const ActiveReportIcon = activeReportTab.icon;
  const activeReportIndex = reportTabs.findIndex((tab) => tab.id === activeReport);
  const selectReport = (tabId: typeof reportTabs[number]["id"]) => {
    setActiveReport(tabId);
    setMobileReportMenuOpen(false);
    if (typeof window !== "undefined" && window.innerWidth <= 900) {
      window.requestAnimationFrame(() => {
        const target = reportMainRef.current;
        if (!target) return;
        const stickyOffset = document.querySelector<HTMLElement>(".sample-preview-bar")?.getBoundingClientRect().height ?? 0;
        window.scrollTo({
          top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - stickyOffset - 10),
          behavior: "smooth",
        });
      });
    }
  };

  useEffect(() => {
    if (!mobileReportMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileReportMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileReportMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    if (demo) {
      try {
        const saved = window.localStorage.getItem("venture-paid-report-landing-demo");
        if (saved) setLandingDraft(ensureLandingPageData(landingDraftSchema.parse(JSON.parse(saved))));
      } catch {
        window.localStorage.removeItem("venture-paid-report-landing-demo");
      }
      return () => { cancelled = true; };
    }
    if (!serverProject) return () => { cancelled = true; };
    void fetch(`/api/projects/${serverProject.id}/landing`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "판매 페이지를 불러오지 못했습니다.");
        if (!cancelled) {
          setLandingSite(payload.site ?? null);
          setLandingDraft(payload.site?.draft ?? payload.suggestedDraft);
        }
      })
      .catch((error) => {
        if (!cancelled) setLandingMessage(error instanceof Error ? error.message : "판매 페이지를 불러오지 못했습니다.");
      });
    return () => { cancelled = true; };
  }, [demo, serverProject]);

  useEffect(() => {
    setPresentationEditorOpen(false);
    setPresentationAssistResult(null);
    setPresentationEditorMessage("");
    if (!demo) {
      setPresentationDrafts(serverProject?.presentationDecks ?? {});
      return;
    }
    try {
      const saved = window.localStorage.getItem("venture-presentation-drafts-demo-v1");
      setPresentationDrafts(saved ? JSON.parse(saved) as PresentationDeckDrafts : {});
    } catch {
      window.localStorage.removeItem("venture-presentation-drafts-demo-v1");
      setPresentationDrafts({});
    }
  }, [demo, serverProject?.id]);

  useEffect(() => {
    setDocumentEditorId(null);
    if (!demo) {
      setDocumentDrafts(serverProject?.documentDrafts ?? {});
      return;
    }
    try {
      const saved = window.localStorage.getItem("venture-document-drafts-demo-v1");
      setDocumentDrafts(saved ? JSON.parse(saved) as DocumentDrafts : {});
    } catch {
      window.localStorage.removeItem("venture-document-drafts-demo-v1");
      setDocumentDrafts({});
    }
  }, [demo, serverProject?.id]);

  useEffect(() => {
    if (demo || resolvedBrandName === opportunity.title) return;
    setLandingDraft((current) => current.businessName === opportunity.title ? {
      ...current,
      businessName: resolvedBrandName,
      privacyController: resolvedBrandName,
    } : current);
  }, [demo, opportunity.title, resolvedBrandName]);

  useEffect(() => {
    if (!landingPreview && !documentPreview && !presentationPreview && !documentEditorId) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (documentEditorId) {
          setDocumentEditorId(null);
          return;
        }
        if (presentationEditorOpen) {
          setPresentationEditorOpen(false);
          return;
        }
        if (presentationPreview) {
          closeSampleOverlay("presentation");
          return;
        }
        if (landingPreview) {
          closeSampleOverlay("landing");
          return;
        }
        setDocumentPreview(null);
      } else if (presentationPreview && !presentationEditorOpen && event.key === "ArrowRight") {
        setPresentationSlideIndex((current) => Math.min(current + 1, presentationDeckMeta[presentationPreview].pageCount - 1));
      } else if (presentationPreview && !presentationEditorOpen && event.key === "ArrowLeft") {
        setPresentationSlideIndex((current) => Math.max(current - 1, 0));
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeSampleOverlay, documentEditorId, documentPreview, landingPreview, presentationEditorOpen, presentationPreview]);

  const updateLandingDraft = (next: LandingDraft) => {
    setLandingDraft(next);
    setLandingAction("idle");
    setLandingMessage("저장되지 않은 변경사항이 있습니다.");
  };

  const saveLandingFromReport = async (publish = false) => {
    setLandingAction(publish ? "publishing" : "saving");
    setLandingMessage("");
    try {
      if (demo) {
        window.localStorage.setItem("venture-paid-report-landing-demo", JSON.stringify(landingDraft));
      } else if (serverProject) {
        const response = await fetch(`/api/projects/${serverProject.id}/landing`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft: landingDraft, expectedUpdatedAt: landingSite?.updatedAt ?? null }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "판매 페이지를 저장하지 못했습니다.");
        let nextSite = payload.site as LandingSiteRecord;
        if (publish) {
          const publishResponse = await fetch(`/api/projects/${serverProject.id}/landing/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: nextSite.updatedAt }) });
          const publishPayload = await publishResponse.json();
          if (!publishResponse.ok) throw new Error(publishPayload.error?.message ?? "홈페이지를 공개하지 못했습니다.");
          nextSite = publishPayload.site;
        }
        setLandingSite(nextSite);
        setLandingDraft(nextSite.draft);
      }
      setLandingAction("saved");
      setLandingMessage(
        demo
          ? publish ? "예시 홈페이지를 공개 상태로 저장했습니다." : "예시 편집 내용을 이 브라우저에 저장했습니다."
          : publish ? "수정 내용을 저장하고 홈페이지에 바로 공개했습니다." : "홈페이지 초안을 저장했습니다. 공개 페이지는 아직 바뀌지 않았습니다.",
      );
    } catch (error) {
      setLandingAction("idle");
      setLandingMessage(error instanceof Error ? error.message : "판매 페이지를 저장하지 못했습니다.");
    }
  };

  const resetLandingDraft = () => {
    const reset = createFinalLandingDraft(opportunity, resolvedBrandName, sellingPrice, demo);
    setLandingDraft(reset);
    setLandingAction("idle");
    setLandingMessage("추천 원고로 되돌렸습니다. 저장 버튼을 눌러 확정하세요.");
  };

  const applyLogoToHomepage = async (logoImageUrl: string) => {
    const next = { ...landingDraft, logoImageUrl };
    setLandingDraft(next);
    setLandingMessage("새 로고를 홈페이지에 반영했습니다.");
    if (demo) {
      window.localStorage.setItem("venture-paid-report-landing-demo", JSON.stringify(next));
      return;
    }
    if (!serverProject) return;
    const response = await fetch(`/api/projects/${serverProject.id}/landing`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: next, expectedUpdatedAt: landingSite?.updatedAt ?? null }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "로고를 홈페이지에 저장하지 못했습니다.");
    setLandingSite(payload.site);
    setLandingDraft(payload.site.draft);
  };

  const documentProject = {
    title: landingDraft.businessName || opportunity.title,
    sector: opportunity.sector,
    model: opportunity.model,
    customer: resolvedCustomer,
    generatedAt: demo ? "2026-07-14T09:30:00.000Z" : new Date().toISOString(),
    sample: demo,
  };

  const founderProfileRecord = serverProject?.founderProfile ?? {};
  const founderStrengthsForDeck = (
    Array.isArray(founderProfileRecord.topFounder) ? founderProfileRecord.topFounder : []
  ).map((axis) => typeof axis === "string" && axis in founderLabels ? founderLabels[axis as FounderAxis] : null)
    .filter((label): label is string => Boolean(label));
  const founderExperienceForDeck = ["careerSummary", "experience", "teamCapabilities", "founderCapability"]
    .map((key) => founderProfileRecord[key])
    .find((value): value is string => typeof value === "string" && value.trim().length >= 10) ?? "";
  const rawInvestmentAsk = founderProfileRecord.investmentAskWon;
  const investmentAskWon = typeof rawInvestmentAsk === "number" && Number.isFinite(rawInvestmentAsk) && rawInvestmentAsk > 0
    ? rawInvestmentAsk
    : null;
  const deckFundingUses = [
    ...initialFundingLines.map((item) => ({ label: item.label, amountWon: item.amount })),
    ...(workingCapital > 0 ? [{ label: `${workingCapitalMonths}개월 운전자금`, amountWon: workingCapital }] : []),
  ].sort((a, b) => b.amountWon - a.amountWon).slice(0, 4);
  const demoScenarioBaseUnits = setupFinancial?.targetMonthlyUnits ?? 30;
  const demoVariableCost = Math.round(sellingPrice * 0.28);
  const deckFinancialScenarios = financial?.scenarios.map((scenario) => ({
    name: scenario.name,
    monthlyUnits: scenario.monthlyUnits,
    netRevenue: scenario.netRevenue,
    operatingProfitBeforeTax: scenario.operatingProfitBeforeTax,
  })) ?? (demo ? [
    { name: "보수적", monthlyUnits: Math.max(1, Math.round(demoScenarioBaseUnits * 0.6)) },
    { name: "기준", monthlyUnits: demoScenarioBaseUnits },
    { name: "공격적", monthlyUnits: Math.max(1, Math.round(demoScenarioBaseUnits * 1.5)) },
  ].map((scenario) => {
    const netRevenue = Math.round(sellingPrice / 1.1 * scenario.monthlyUnits);
    return {
      ...scenario,
      netRevenue,
      operatingProfitBeforeTax: netRevenue - demoVariableCost * scenario.monthlyUnits - monthlyFixedCost,
    };
  }) : []);
  const monthlyForecast = buildTwelveMonthForecast({
    priceWon: sellingPrice,
    variableCostPerUnit: financial?.variableCostPerUnit ?? (demo ? demoVariableCost : null),
    monthlyFixedCostWon: monthlyFixedCost || null,
    targetMonthlyUnits: setupFinancial?.targetMonthlyUnits ?? (demo ? demoScenarioBaseUnits : null),
    initialInvestmentWon: initialInvestment || null,
  });

  const presentationPayload = (deckType: PresentationDeckType): PresentationDeckInput => ({
    deckType,
    brandName: resolvedBrandName,
    slogan: serverProject?.launchMissionWorkspace?.brand.slogan || landingDraft.subheadline || opportunity.oneLiner,
    title: opportunity.title,
    oneLiner: opportunity.oneLiner,
    customer: resolvedCustomer,
    model: opportunity.model,
    revenue: opportunity.revenue,
    priceWon: sellingPrice,
    risk: opportunity.risk,
    accentColor: landingDraft.accentColor,
    sector: opportunity.sector,
    stage: opportunity.stage,
    launchTime: opportunity.launchTime,
    firstTest: opportunity.firstTest,
    matchScore: opportunity.match ?? null,
    marketScore: opportunity.market ?? null,
    feasibilityScore: opportunity.feasibility ?? null,
    monthlyFixedCostWon: monthlyFixedCost || null,
    breakEvenUnits,
    totalFundingNeedWon: totalFundingNeed,
    targetMonthlyUnits: setupFinancial?.targetMonthlyUnits ?? null,
    variableCostPerUnit: financial?.variableCostPerUnit ?? (demo ? demoVariableCost : null),
    contributionPerUnit: financial?.contributionPerUnit ?? (demo ? Math.round(sellingPrice / 1.1) - demoVariableCost : null),
    contributionMarginRate: financial?.contributionMarginRate ?? (demo ? 69.2 : null),
    breakEvenRevenueWon: financial?.breakEvenRevenue ?? (demo && breakEvenUnits !== null ? Math.ceil(breakEvenUnits) * sellingPrice : null),
    initialInvestmentWon: initialInvestment || null,
    runwayMonths: financial?.runwayMonths ?? (demo ? workingCapitalMonths : null),
    investmentAskWon,
    financialScenarios: deckFinancialScenarios,
    monthlyForecast: monthlyForecast.months,
    fundingUses: deckFundingUses,
    marketEvidence: savedMarketEvidence.length > 0 ? savedMarketEvidence.map((evidence) => ({
      metric: evidence.metric,
      value: evidence.value,
      numericValue: evidence.numericValue,
      unit: evidence.unit,
      region: evidence.region,
      sourceName: evidence.sourceName,
      verification: evidence.verification === "verified" ? "verified" : evidence.verification === "user_supplied" ? "user_supplied" : "unverified",
      ...(evidence.sourceUrl ? { url: evidence.sourceUrl } : {}),
      ...(evidence.observedAt ? { observedAt: evidence.observedAt } : {}),
    })) : demo ? [{
      metric: "서비스 가능 고객 가정",
      value: "5만",
      numericValue: 50_000,
      unit: "가구",
      region: "서울 일부 생활권",
      sourceName: "화면 검증용 가상 입력",
      verification: "example",
      observedAt: "2026-07-14",
    }] : [],
    teamSize: serverProject?.grantWorkspace?.teamSize ?? (demo ? 2 : serverProject?.businessSetup ? Math.max(1, serverProject.businessSetup.employeeCount) : null),
    founderStrengths: founderStrengthsForDeck.length > 0 ? founderStrengthsForDeck : demo ? ["고객 공감", "실행 지속", "구조 운영"] : [],
    founderExperience: founderExperienceForDeck,
    evidenceSources: marketSources.slice(0, 6).map((source) => ({
      title: source.title,
      status: source.status,
      ...(source.url ? { url: source.url } : {}),
      ...(source.date ? { observedAt: source.date } : {}),
    })),
    traction: {
      interviews: serverProject?.executionAnalysis?.totals.interviews ?? (demo ? 12 : 0),
      proposals: serverProject?.executionAnalysis?.totals.proposals ?? (demo ? 5 : 0),
      purchases: serverProject?.executionAnalysis?.totals.purchases ?? (demo ? 3 : 0),
      revenueWon: serverProject?.executionAnalysis?.totals.revenue ?? (demo ? sellingPrice * 3 : 0),
      confidenceScore: serverProject?.executionAnalysis?.confidenceScore ?? (demo ? 72 : 0),
    },
  });

  const financialWorkbookPayload = () => ({
    brandName: resolvedBrandName,
    businessTitle: opportunity.title,
    priceWon: sellingPrice,
    variableCostPerUnit: financial?.variableCostPerUnit ?? (demo ? demoVariableCost : null),
    monthlyFixedCostWon: monthlyFixedCost || null,
    targetMonthlyUnits: setupFinancial?.targetMonthlyUnits ?? (demo ? demoScenarioBaseUnits : null),
    initialInvestmentWon: initialInvestment || null,
    totalFundingNeedWon: totalFundingNeed,
    fundingUses: deckFundingUses,
    evidenceSources: marketSources.slice(0, 30).map((source) => ({
      title: source.title,
      status: source.status,
      ...(source.url ? { url: source.url } : {}),
      ...(source.date && /^\d{4}-\d{2}-\d{2}$/.test(source.date) ? { observedAt: source.date } : {}),
    })),
    startDate: new Date().toISOString().slice(0, 10),
  });

  const requestFinancialWorkbook = async () => {
    const response = await fetch("/api/delivery/financial-workbook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(financialWorkbookPayload()),
    });
    if (response.ok) return response.blob();
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? "12개월 손익 엑셀을 만들지 못했습니다.");
  };

  const downloadFinancialWorkbook = async () => {
    setDocumentDownload("financial-xlsx");
    setDocumentMessage("수정 가능한 12개월 손익 엑셀을 만들고 있습니다.");
    try {
      const workbook = await requestFinancialWorkbook();
      saveDownloadBlob(workbook, `${resolvedBrandName}-12개월-손익계획.xlsx`);
      setDocumentMessage("입력값을 바꾸면 자동 계산되는 12개월 손익 엑셀을 만들었습니다.");
    } catch (error) {
      setDocumentMessage(error instanceof Error ? error.message : "12개월 손익 엑셀을 만들지 못했습니다.");
    } finally {
      setDocumentDownload("");
    }
  };

  const researchMarketEvidence = async () => {
    if (demo) {
      setMarketResearchMessage("예시 화면에서는 실제 검색을 실행하지 않습니다. 내 사업으로 시작하면 공식 원문을 찾을 수 있습니다.");
      return;
    }
    if (!serverProject) return;
    setMarketResearchAction("researching");
    setMarketResearchMessage("통계청·공공데이터 등 공식 원문을 찾고 있습니다. 1~2분 정도 걸릴 수 있습니다.");
    try {
      const response = await fetch(`/api/projects/${serverProject.id}/market/research`, { method: "POST" });
      const payload = await response.json() as { project?: ProjectRecord; addedCount?: number; error?: { message?: string } };
      if (!response.ok || !payload.project) throw new Error(payload.error?.message ?? "공식 시장 근거를 찾지 못했습니다.");
      onProjectUpdated?.(payload.project);
      setMarketResearchMessage(`공식 원문이 인용된 시장 근거 ${payload.addedCount ?? 0}개를 연결했습니다. 외부 제출 전 수치와 기준일을 원문에서 한 번 더 확인하세요.`);
    } catch (error) {
      setMarketResearchMessage(error instanceof Error ? error.message : "공식 시장 근거를 찾지 못했습니다.");
    } finally {
      setMarketResearchAction("idle");
    }
  };

  const persistPresentationDrafts = async (next: PresentationDeckDrafts) => {
    if (demo) {
      window.localStorage.setItem("venture-presentation-drafts-demo-v1", JSON.stringify(next));
      setPresentationDrafts(next);
      return;
    }
    if (!serverProject) throw new Error("저장할 프로젝트를 찾을 수 없습니다.");
    const response = await fetch(`/api/projects/${serverProject.id}/presentations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decks: next }),
    });
    const payload = await response.json() as { decks?: PresentationDeckDrafts; error?: { message?: string } };
    if (!response.ok || !payload.decks) throw new Error(payload.error?.message ?? "발표자료 수정본을 저장하지 못했습니다.");
    setPresentationDrafts(payload.decks);
  };

  const savePresentationSlide = async (deckType: PresentationDeckType, slideId: string) => {
    setPresentationEditorAction("saving");
    setPresentationEditorMessage("수정 내용을 저장하고 있습니다.");
    try {
      const currentDeck = presentationDrafts[deckType];
      const next: PresentationDeckDrafts = {
        ...presentationDrafts,
        [deckType]: {
          slides: { ...(currentDeck?.slides ?? {}), [slideId]: presentationEditorValue },
          updatedAt: new Date().toISOString(),
        },
      };
      await persistPresentationDrafts(next);
      setPresentationAssistResult(null);
      setPresentationEditorMessage("저장했습니다. 내려받는 PPTX에도 같은 내용이 들어갑니다.");
    } catch (error) {
      setPresentationEditorMessage(error instanceof Error ? error.message : "수정 내용을 저장하지 못했습니다.");
    } finally {
      setPresentationEditorAction("idle");
    }
  };

  const resetPresentationSlide = async (deckType: PresentationDeckType, slideId: string) => {
    setPresentationEditorAction("saving");
    setPresentationEditorMessage("원래 초안으로 되돌리고 있습니다.");
    try {
      const nextSlides = { ...(presentationDrafts[deckType]?.slides ?? {}) };
      delete nextSlides[slideId];
      const next: PresentationDeckDrafts = {
        ...presentationDrafts,
        [deckType]: { slides: nextSlides, updatedAt: new Date().toISOString() },
      };
      await persistPresentationDrafts(next);
      const baseInput = presentationPayload(deckType);
      const baseSlide = buildPresentationSlides(baseInput).find((slide) => slide.id === slideId);
      if (baseSlide) setPresentationEditorValue(editablePresentationValue(baseSlide));
      setPresentationAssistResult(null);
      setPresentationEditorMessage("처음 만들어진 문구로 되돌렸습니다.");
    } catch (error) {
      setPresentationEditorMessage(error instanceof Error ? error.message : "원래 문구로 되돌리지 못했습니다.");
    } finally {
      setPresentationEditorAction("idle");
    }
  };

  const requestPresentationAssist = async (mode: "spellcheck" | "improve" | "market", deckType: PresentationDeckType, slideId: string) => {
    setPresentationEditorAction(mode);
    setPresentationEditorMessage(mode === "market" ? "저장된 출처를 확인하고 있습니다." : "문장을 검토하고 있습니다.");
    setPresentationAssistResult(null);
    try {
      const fields = Object.fromEntries(
        Object.entries(presentationEditorValue).filter(([key, value]) => key !== "chartPreset" && typeof value === "string"),
      );
      const response = await fetch("/api/presentations/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          deckType,
          slideId,
          fields,
          business: {
            title: opportunity.title,
            customer: resolvedCustomer,
            model: opportunity.model,
            revenue: opportunity.revenue,
            sector: opportunity.sector,
          },
          evidenceSources: presentationPayload(deckType).evidenceSources,
        }),
      });
      const payload = await response.json() as { result?: PresentationAssistResult; error?: { message?: string } };
      if (!response.ok || !payload.result) throw new Error(payload.error?.message ?? "문장 제안을 받지 못했습니다.");
      setPresentationAssistResult(payload.result);
      setPresentationEditorMessage("제안을 확인한 뒤 적용해주세요. 아직 원문은 바뀌지 않았습니다.");
    } catch (error) {
      setPresentationEditorMessage(error instanceof Error ? error.message : "문장을 검토하지 못했습니다.");
    } finally {
      setPresentationEditorAction("idle");
    }
  };

  const persistDocumentAction = async (input: Record<string, unknown>) => {
    if (demo) {
      if (!isDeliveryDocumentId(String(input.documentId))) throw new Error("수정할 문서를 찾지 못했습니다.");
      const documentId = String(input.documentId) as keyof DocumentDrafts;
      const next = { ...documentDrafts };
      if (input.action === "reset") {
        delete next[documentId];
      } else if (input.action === "restore") {
        const version = next[documentId]?.versions.find((item) => item.id === input.versionId);
        if (!version) throw new Error("되돌릴 수정본을 찾지 못했습니다.");
        next[documentId] = appendDocumentDraftVersion(next[documentId], version.markdown, `${version.version}차 수정본으로 되돌림`);
      } else {
        next[documentId] = appendDocumentDraftVersion(next[documentId], String(input.markdown ?? ""), String(input.summary ?? "문서 내용 수정"));
      }
      window.localStorage.setItem("venture-document-drafts-demo-v1", JSON.stringify(next));
      setDocumentDrafts(next);
      return;
    }
    if (!serverProject) throw new Error("저장할 프로젝트를 찾을 수 없습니다.");
    const response = await fetchWithTransientRetry(`/api/projects/${serverProject.id}/documents`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await response.json() as { drafts?: DocumentDrafts; error?: { message?: string } };
    if (!response.ok || !payload.drafts) throw new Error(payload.error?.message ?? "문서 수정본을 저장하지 못했습니다.");
    setDocumentDrafts(payload.drafts);
  };

  const saveDocumentDraft = async (markdown: string, summary: string) => {
    if (!documentEditorItem || !isDeliveryDocumentId(documentEditorItem.id)) throw new Error("수정할 문서를 찾지 못했습니다.");
    await persistDocumentAction({ action: "save", documentId: documentEditorItem.id, markdown, summary });
    setDocumentMessage(`${documentEditorItem.title} 수정본을 저장했습니다. PDF·워드와 전체 묶음에도 반영됩니다.`);
  };

  const restoreDocumentDraft = async (version: DocumentDraftVersion) => {
    if (!documentEditorItem || !isDeliveryDocumentId(documentEditorItem.id)) throw new Error("수정할 문서를 찾지 못했습니다.");
    await persistDocumentAction({ action: "restore", documentId: documentEditorItem.id, versionId: version.id });
  };

  const resetDocumentDraft = async () => {
    if (!documentEditorItem || !isDeliveryDocumentId(documentEditorItem.id)) throw new Error("수정할 문서를 찾지 못했습니다.");
    await persistDocumentAction({ action: "reset", documentId: documentEditorItem.id });
  };

  const requestPresentationDeck = async (deckType: PresentationDeckType) => {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch("/api/delivery/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...presentationPayload(deckType), edits: presentationDrafts[deckType] }),
      });
      if (response.ok) return response.blob();
      if (![502, 503, 504].includes(response.status) || attempt === 1) break;
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    const payload = await response?.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `${presentationDeckMeta[deckType].title}를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.`);
  };

  const downloadPresentation = async (deckType: PresentationDeckType) => {
    const meta = presentationDeckMeta[deckType];
    setDocumentDownload(`${deckType}-pptx`);
    setDocumentMessage(`${meta.title} 파워포인트를 만들고 있습니다.`);
    try {
      const blob = await requestPresentationDeck(deckType);
      saveDownloadBlob(blob, `${resolvedBrandName}-${deckType === "intro" ? "사업소개서" : "투자제안서-IR"}-초안.pptx`);
      setDocumentMessage(`${meta.pageCount}장 ${meta.title} 파워포인트(PPTX)를 만들었습니다.`);
    } catch (error) {
      setDocumentMessage(error instanceof Error ? error.message : `${meta.title}를 만들지 못했습니다.`);
    } finally {
      setDocumentDownload("");
    }
  };

  const downloadAllResults = async () => {
    if (!deliveryPack) return;
    setDocumentDownload("all-results-zip");
    setDocumentMessage("실행 문서, 발표자료와 손익 엑셀을 한 번에 묶고 있습니다.");
    try {
      const documents = deliveryItems.map(({ id, title, type, versionLabel, markdown }) => ({ id, title, type, versionLabel, markdown }));
      const [documentArchive, jszipModule] = await Promise.all([
        createBusinessDocumentsBlob({ format: "zip", project: documentProject, documents }),
        import("jszip"),
      ]);
      setDocumentMessage("실행 문서를 묶었습니다. 사업소개서 파워포인트를 만들고 있습니다.");
      const introDeck = await requestPresentationDeck("intro");
      setDocumentMessage("사업소개서를 만들었습니다. 투자제안서 파워포인트를 만들고 있습니다.");
      const irDeck = await requestPresentationDeck("ir");
      setDocumentMessage("투자제안서를 만들었습니다. 12개월 손익 엑셀을 만들고 있습니다.");
      const financialWorkbook = await requestFinancialWorkbook();
      const archive = await jszipModule.default.loadAsync(await documentArchive.arrayBuffer());
      archive.file(`${resolvedBrandName}-사업소개서-초안.pptx`, await introDeck.arrayBuffer());
      archive.file(`${resolvedBrandName}-투자제안서-IR-초안.pptx`, await irDeck.arrayBuffer());
      archive.file(`${resolvedBrandName}-12개월-손익계획.xlsx`, await financialWorkbook.arrayBuffer());
      archive.file("파일-안내.txt", [
        `${resolvedBrandName} 전체 사업 자료`,
        "",
        "- 전체 실행 문서: PDF와 수정 가능한 워드",
        "- 사업소개서: 고객·파트너 설명용 PPTX 12장",
        "- 투자제안서(IR): 투자자·지원기관 제안용 PPTX 16장",
        "- 12개월 손익계획: 입력값과 계산식이 연결된 엑셀(XLSX) 5개 시트",
        "",
        "수치·출처·대표자·연락처는 외부 공유 전에 최종 확인하세요.",
      ].join("\n"));
      const bundle = await archive.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      saveDownloadBlob(bundle, `${resolvedBrandName}-전체-사업자료.zip`);
      setDocumentMessage("실행 문서, 사업소개서, 투자제안서와 12개월 손익 엑셀을 전체 묶음으로 만들었습니다.");
    } catch (error) {
      setDocumentMessage(error instanceof Error ? error.message : "전체 결과물 묶음을 만들지 못했습니다.");
    } finally {
      setDocumentDownload("");
    }
  };

  const downloadDocuments = async (format: DownloadFormat, item?: DeliveryItem) => {
    if (!deliveryPack) return;
    const target = item ? [item] : deliveryItems;
    const key = `${item?.id ?? "all"}-${format}`;
    setDocumentDownload(key);
    setDocumentMessage(`${format === "pdf" ? "인쇄용 문서(PDF)" : format === "docx" ? "수정 가능한 워드 문서" : "전체 문서 묶음(ZIP)"}을 만들고 있습니다.`);
    try {
      await downloadBusinessDocuments({
        format,
        project: documentProject,
        documents: target.map(({ id, title, type, versionLabel, markdown }) => ({ id, title, type, versionLabel, markdown })),
      });
      setDocumentMessage(`${target.length}개 결과물을 ${format === "pdf" ? "인쇄용 문서(PDF)" : format === "docx" ? "수정 가능한 워드 문서" : "PDF·워드 전체 묶음(ZIP)"}으로 만들었습니다.`);
    } catch (error) {
      setDocumentMessage(error instanceof Error ? error.message : "문서를 만들지 못했습니다.");
    } finally {
      setDocumentDownload("");
    }
  };

  const downloadReceipt = async () => {
    const receiptBody = [
      betaAccess ? "# 베타 이용 확인서" : "# 결제 영수증",
      "",
      `- 상품: ${PACKAGE_NAME}`,
      `- ${betaAccess ? "이용 금액" : "결제 금액"}: ${paidAmount.toLocaleString("ko-KR")}원`,
      `- ${betaAccess ? "이용 상태" : "결제 상태"}: ${betaAccess ? "베타 무료 이용" : demo ? "결제완료 예시" : serverProject?.paymentStatus === "paid" ? "계좌입금 확인" : "개발 테스트 승인"}`,
      `- ${betaAccess ? "이용 번호" : "주문 번호"}: ${demo ? "VNT-20260713-1024" : serverProject?.id ?? "확인 필요"}`,
      `- 프로젝트: ${opportunity.title}`,
      "",
      betaAccess ? "> 베타 테스트 기간에 결제 없이 이용한 프로젝트입니다." : demo ? "> 이 영수증은 화면 확인용 예시이며 실제 거래 확인 자료가 아닙니다." : "> 계좌이체 내역은 이용 은행에서, 현금영수증 발급 상태는 주문 화면에서 확인하세요.",
    ].join("\n");
    setDocumentDownload("receipt-pdf");
    try {
      await downloadBusinessDocuments({
        format: "pdf",
        project: documentProject,
        documents: [{ id: "receipt", title: betaAccess ? "베타 이용 확인서" : "결제 영수증", type: betaAccess ? "무료 이용 확인" : "주문 및 결제 확인", versionLabel: "발급본", markdown: receiptBody }],
      });
      setDocumentMessage(`${betaAccess ? "베타 이용 확인서" : "결제 영수증"} 인쇄용 문서(PDF)를 만들었습니다.`);
    } catch (error) {
      setDocumentMessage(error instanceof Error ? error.message : "영수증을 만들지 못했습니다.");
    } finally {
      setDocumentDownload("");
    }
  };

  return (
    <main className={`delivery-page ${demo ? "sample-delivery" : "user-delivery"}`}>
      <Header onHome={onHome} />
      {demo && <section className="sample-preview-bar"><div><span><Eye /> 실제 제공 화면 예시 · 가상 사업 사례</span><strong>완료 후 사용자가 보는 화면과 같은 구조입니다.</strong></div>{onStart && <button className="sample-return-button" onClick={onStart}>{sampleActionLabel ?? "내 사업 무료로 시작하기"} <ArrowRight /></button>}</section>}
      <div className={`delivery-ai-disclosure ${generationMode}`}><ShieldCheck /><p><strong>{generationTitle}</strong> {generationDescription}</p><a href="/ai-notice" target="_blank" rel="noreferrer">처리 안내 보기</a></div>
      <section className="delivery-content" id={demo ? "sample-result-details" : "delivery-result-details"}>
        <div className="delivery-main">
          <section className={`final-report-viewer ${activeReport === "launch" ? "mission-mode" : ""}`}>
            <header className="final-report-chrome">
              <div aria-hidden="true"><i /><i /><i /></div>
              <button className="mobile-report-menu-trigger" type="button" aria-label="목차" title="목차" aria-expanded={mobileReportMenuOpen} onClick={() => setMobileReportMenuOpen(true)}><PanelLeft /></button>
              <span><Sparkles /> {resolvedBrandName} 맞춤 사업 실행 보고서</span>
              <em><i /> {generationMode === "ai" ? "AI 고도화" : generationMode === "sample" ? "화면 예시" : "안전 초안"}</em>
            </header>
            <button className={`mobile-report-backdrop ${mobileReportMenuOpen ? "open" : ""}`} type="button" aria-label="결과 목차 닫기" onClick={() => setMobileReportMenuOpen(false)} />
            <aside className={`final-report-sidebar ${mobileReportMenuOpen ? "mobile-open" : ""}`} aria-label="결과 목차">
              <header><span><small>최종 결과</small><strong>{resolvedBrandName}</strong></span><button className="mobile-report-sidebar-close" type="button" aria-label="결과 목차 닫기" onClick={() => setMobileReportMenuOpen(false)}>닫기</button></header>
              <nav aria-label="최종 보고서 목차">
                {reportTabs.map((tab, index) => {
                  const Icon = tab.icon;
                  return <button key={tab.id} aria-label={tab.label} data-report-tab={tab.id} className={activeReport === tab.id ? "active" : ""} onClick={() => selectReport(tab.id)}><Icon /><span><b>{tab.label}</b><small>{tab.id === "launch" ? "선택 · 결과물과 별도" : `${index + 1}단계${tab.id === "documents" ? " · 최종" : ""}`}</small></span>{activeReport === tab.id && <Check />}</button>;
                })}
              </nav>
              <div className="final-report-sidebar-status"><span><CheckCircle2 /> 전체 초안 생성</span><strong>{resultCount}개</strong><small>문서 10종과 발표자료 2종</small></div>
            </aside>
            <div className="final-report-main" ref={reportMainRef}>
              <header><div><span><ActiveReportIcon /> 맞춤 사업 실행 보고서</span><h2>{activeReportTab.label}</h2></div><em><i /> 준비됨</em></header>
              <div className="mobile-report-progress" aria-label={`결과 ${activeReportIndex + 1}/${reportTabs.length}단계`}>
                <button type="button" onClick={() => setMobileReportMenuOpen(true)}><PanelLeft /><span><small>결과 목차</small><strong>{activeReportIndex + 1}. {activeReportTab.label}</strong></span><ArrowRight /></button>
                <i><b style={{ width: `${((activeReportIndex + 1) / reportTabs.length) * 100}%` }} /></i>
              </div>
              {activeReport === "summary" && !demo && onRefine && serverProject && refinementInput && <ProjectRefinementStudio
                projectId={serverProject.id}
                initialInput={refinementInput}
                history={serverProject.refinementHistory ?? []}
                evidence={serverProject.marketWorkspace?.evidence ?? []}
                marketResearching={marketResearchAction === "researching"}
                marketMessage={marketResearchMessage}
                onResearchMarket={researchMarketEvidence}
                onApply={onRefine}
              />}
              <article className="report-sheet">
              {activeReport === "summary" && <>
                <h3>{resolvedBrandName}</h3>
                <p className="report-lead">{opportunity.oneLiner}</p>
                <div className="report-verdict"><BadgeCheck /><span><small>추천 시작 방법</small><strong>한 지역에서 직접 운영해 본 뒤, 반복 수요가 확인되면 넓히세요.</strong></span></div>
                <div className="report-facts">
                  <div><small>핵심 고객</small><strong>{resolvedCustomer}</strong></div>
                  <div><small>수익 방식</small><strong>{opportunity.revenue}</strong></div>
                  <div><small>첫 상품 가격</small><strong>{sellingPrice.toLocaleString("ko-KR")}원</strong></div>
                  <div><small>권장 시작 범위</small><strong>{opportunity.launchTime} 지역 시험 운영</strong></div>
                </div>
                <div className="report-note"><CircleHelp /><p>{demo ? "화면의 수치는 예시입니다." : "확인한 자료 범위에서 만든 결과입니다."} 실제 판매 전 계약·보험·개인정보를 다시 확인하세요.</p></div>
              </>}
              {activeReport === "business" && <>
                <div className="report-title-row"><CircleDollarSign /><div><small>상품과 손익</small><h3>첫 상품과 손익 기준</h3></div></div>
                <p className="report-lead">처음부터 복잡한 정기 회원 상품을 만들지 않고, 확인 가능한 1회 연결 상품으로 지불 의사를 확인합니다.</p>
                <div className="report-facts financial">
                  <div><small>권장 판매가</small><strong>{sellingPrice.toLocaleString("ko-KR")}원</strong><em>1회 연결 기준</em></div>
                  <div><small>월 손익분기</small><strong>{breakEvenUnits ? `${breakEvenUnits}건` : "추가 입력 필요"}</strong><em>현재 비용 가정</em></div>
                  <button className={`funding-summary-card ${fundingBreakdownOpen ? "active" : ""}`} onClick={() => setFundingBreakdownOpen((open) => !open)} aria-expanded={fundingBreakdownOpen}><small>필요 준비자금</small><strong>{totalFundingNeed ? `${Math.round(totalFundingNeed / 10000).toLocaleString("ko-KR")}만원` : "추가 입력 필요"}</strong><em>내역 보기 <ChevronDown /></em></button>
                </div>
                {fundingBreakdownOpen && totalFundingNeed && <section className="funding-breakdown" aria-label="필요 준비자금 세부내역">
                  <header><Calculator /><div><small>계산 근거</small><h4>초기 준비비 + {workingCapitalMonths}개월 운전자금</h4><p>확정 견적이 아니라 입력한 비용으로 계산한 준비 기준입니다. 실제 계약·견적을 입력하면 금액이 다시 계산됩니다.</p></div></header>
                  <div className="funding-formula"><span><small>초기 준비비</small><strong>{initialInvestment.toLocaleString("ko-KR")}원</strong></span><b>+</b><span><small>월 고정비 {monthlyFixedCost.toLocaleString("ko-KR")}원 × {workingCapitalMonths}개월</small><strong>{workingCapital.toLocaleString("ko-KR")}원</strong></span><b>=</b><span className="total"><small>필요 준비자금</small><strong>{totalFundingNeed.toLocaleString("ko-KR")}원</strong></span></div>
                  <div className="funding-line-groups"><section><h5>처음 한 번 필요한 돈</h5>{initialFundingLines.length ? initialFundingLines.map((item) => <p key={item.label}><span>{item.label}</span><strong>{item.amount.toLocaleString("ko-KR")}원</strong></p>) : <p><span>입력된 세부 비용 없음</span><strong>{initialInvestment.toLocaleString("ko-KR")}원</strong></p>}</section><section><h5>매달 나가는 고정비</h5>{monthlyFundingLines.length ? monthlyFundingLines.map((item) => <p key={item.label}><span>{item.label}</span><strong>{item.amount.toLocaleString("ko-KR")}원</strong></p>) : <p><span>입력된 세부 비용 없음</span><strong>{monthlyFixedCost.toLocaleString("ko-KR")}원</strong></p>}<small>매달 비용을 {workingCapitalMonths}개월 버틸 금액으로 계산했습니다.</small></section></div>
                </section>}
                <div className="report-table"><div><span>기본형</span><strong>비상 연락망 등록</strong><em>월 19,000원</em></div><div className="recommended"><span>첫 확인 상품</span><strong>30분 내 돌봄 연결</strong><em>{sellingPrice.toLocaleString("ko-KR")}원</em></div><div><span>확장형</span><strong>정기 안심 돌봄</strong><em>월 59,000원</em></div></div>
                <div className="report-risk"><ShieldCheck /><p><strong>운영 전 확인:</strong> {opportunity.risk}</p></div>
              </>}
              {activeReport === "market" && <>
                <div className="report-title-row"><Users /><div><small>시장 확인</small><h3>확인된 수요와 아직 모르는 점</h3></div></div>
                <p className="report-lead">시장 규모 숫자보다 실제 고객이 최근 어떻게 해결했고 얼마를 지출했는지를 우선 근거로 사용합니다.</p>
                <div className="evidence-summary"><strong>{verifiedEvidenceCount}</strong><span>검증 근거</span><i /><strong>{opportunity.match}%</strong><span>창업자 적합도</span><i /><strong>{opportunity.feasibility}%</strong><span>실행 가능성</span></div>
                <section className="market-auto-research"><div><Search /><span><small>공식 원문 자동 연결</small><strong>내 사업에 맞는 시장 근거 찾기</strong><p>통계청·공공데이터·정부기관 원문을 검색해 출처와 함께 저장합니다.</p></span></div><button disabled={marketResearchAction === "researching"} onClick={() => void researchMarketEvidence()}>{marketResearchAction === "researching" ? <><LoaderCircle className="spin" /> 찾는 중</> : <><Search /> 공식 근거 찾기</>}</button>{marketResearchMessage && <footer role="status"><CircleHelp /> {marketResearchMessage}</footer>}</section>
                <ol className="report-evidence-list"><li><span>01</span><div><strong>반복되는 응급 공백</strong><p>{demo ? "보호자 인터뷰 12명 중 8명이 최근 6개월 안에 급한 돌봄 요청 경험이 있다고 답한 예시입니다." : "저장된 고객 인터뷰와 시장 근거를 결과물에서 확인하세요."}</p></div></li><li><span>02</span><div><strong>현재 대안의 신뢰 문제</strong><p>지인 부탁과 공개 커뮤니티는 빠르지만 신원·책임 범위가 불명확하다는 가설을 우선 검증합니다.</p></div></li><li><span>03</span><div><strong>아직 확인할 것</strong><p>야간 추가요금, 사고 대응 책임, 생활권별 파트너 확보 비용은 실제 유료 연결에서 측정해야 합니다.</p></div></li></ol>
                <section className="market-source-panel"><header><ExternalLink /><div><small>문장에 사용한 자료</small><h4>출처와 확인 상태</h4></div><em>{marketSources.length}개</em></header>{marketSources.length > 0 ? <div className="market-source-list">{marketSources.map((source, index) => <article key={`${source.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{source.title}</strong><p>{source.note}</p><small>{source.source} · {source.date}</small></div><em>{source.status}</em>{source.url ? <a href={source.url} target="_blank" rel="noreferrer" aria-label={`${source.title} 원문 열기`}><ExternalLink /></a> : <i>내부 기록</i>}</article>)}</div> : <div className="market-source-empty"><CircleHelp /><p><strong>아직 저장된 출처가 없습니다.</strong> 위 문장은 가설이며, 시장 자료를 추가하기 전까지 확정 근거로 사용하지 않습니다.</p></div>}</section>
              </>}
      {activeReport === "landing" && <>
                <LandingQuickEditor
                  draft={landingDraft}
                  action={landingAction}
                  message={landingMessage}
                  published={demo || landingSite?.status === "published"}
                  publicPath={demo ? `/launch/${landingDraft.slug}` : landingSite ? `/launch/${landingSite.publishedSlug ?? landingSite.slug}` : ""}
                  projectId={serverProject?.id ?? null}
                  customDomain={landingSite?.customDomain ?? ""}
                  demo={demo}
                  onChange={updateLandingDraft}
                  onReset={resetLandingDraft}
                  onSave={() => void saveLandingFromReport(false)}
                  onPublish={() => void saveLandingFromReport(true)}
                  onPreview={() => setLandingPreview(true)}
                  onSiteUpdated={setLandingSite}
                />
              </>}
              {activeReport === "launch" && <>
                <BeginnerMissionRoadmap
                  project={serverProject}
                  opportunity={{
                    title: opportunity.title,
                    oneLiner: opportunity.oneLiner,
                    customer: resolvedCustomer,
                    model: opportunity.model,
                    revenue: opportunity.revenue,
                    risk: opportunity.risk,
                  }}
                  brandName={landingDraft.businessName || resolvedBrandName}
                  sellingPrice={sellingPrice}
                  demo={demo}
                  onLogoCreated={applyLogoToHomepage}
                  onGoToDocuments={() => selectReport("documents")}
                />
              </>}
              {activeReport === "documents" && <>
                <section className="delivery-gift-hero"><div className="delivery-gift-mark"><Gift /><i><Sparkles /></i></div><div><small>내 사업 파일 모음</small><h3>{resolvedBrandName}의 사업 시작 파일이 준비되었습니다</h3><p>사업계획서, 홈페이지 글, 발표자료와 수정 가능한 12개월 예상 수익 엑셀을 한곳에 모았습니다.</p><span><CheckCircle2 /> 파일 생성 완료 · 확인할 내용도 함께 표시했어요</span></div><aside><strong>{resultCount}</strong><small>개 파일 준비</small><button disabled={Boolean(documentDownload)} onClick={() => void downloadAllResults()}><Download /> 한 번에 받기</button></aside></section>
                <div className="delivery-section-heading"><div className="report-title-row"><PackageCheck /><div><small>마지막 단계</small><h3>파일을 열거나 내려받으세요</h3></div></div><div className="delivery-package-actions"><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("pdf")}><FileText /> 전체 PDF</button><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("docx")}><BookOpen /> 전체 워드</button><button disabled={Boolean(documentDownload)} onClick={() => void downloadAllResults()}><Download /> 전체 받기</button></div></div>
                <p className="report-lead"><strong>여기까지가 핵심 단계예요.</strong> 이어지는 실행 도우미는 사업 시작을 돕는 선택 과정이며, 완료하지 않아도 위 결과물은 그대로 열고 내려받을 수 있습니다.</p>
                {deliveryFactSummary && <div className="delivery-fact-summary" aria-label="파일에 사용된 내용 요약"><span><CheckCircle2 /><strong>{deliveryFactSummary.verified + deliveryFactSummary.userInput}</strong> 내가 입력한 내용</span><span><BarChart3 /><strong>{deliveryFactSummary.calculated}</strong> 자동 계산된 숫자</span><span><CircleHelp /><strong>{deliveryFactSummary.assumptions + deliveryFactSummary.needsInput}</strong> 나중에 확인할 내용</span></div>}
                <div className={`delivery-claim-safety ${deliveryClaimSummary.convertedClaims > 0 ? "changed" : "safe"}`} aria-label="허위 실적 자동 점검 결과">
                  <span><ShieldCheck /></span>
                  <div><strong>사실성 자동 점검 완료</strong><p>{deliveryClaimSummary.convertedClaims > 0 ? `근거가 확인되지 않은 완료 표현 ${deliveryClaimSummary.convertedClaims}개를 ‘확인 필요’ 문장으로 바꿨어요.` : "완료 실적은 저장된 실행 기록이나 증빙이 있을 때만 사실로 표시됩니다."}</p></div>
                  <em>{deliveryClaimSummary.safeDocuments}/{deliveryClaimSummary.checkedDocuments} 문서 이상 없음</em>
                </div>
                {deliveryQuality && <details className="delivery-quality-panel conditional">
                  <summary><span><ShieldCheck /></span><div><small>선택 확인</small><strong>나중에 확인할 점 보기</strong><p>초안 이용과 내려받기에는 영향을 주지 않습니다.</p></div><em>{deliveryQuality.actions.length}개</em></summary>
                  <div>{deliveryQuality.checks.map((check) => <article key={check.id} className={check.passed ? "passed" : "needs-work"}><i>{check.passed ? <Check /> : <CircleHelp />}</i><span><strong>{check.label}</strong><small>{check.detail}</small></span></article>)}</div>
                  {deliveryQuality.actions.length > 0 && <footer><CircleHelp /><p><strong>지금 하지 않아도 됩니다.</strong> 실제 영업이나 공식 제출 전에 한 가지씩 확인하세요.</p></footer>}
                </details>}
                {documentMessage && <p className="delivery-document-status" role="status">{documentMessage}</p>}
                <div className="delivery-result-groups">
                  {deliveryGroups.map((group) => <section className={`delivery-result-group group-${group.id}`} key={group.id} aria-labelledby={`delivery-group-${group.id}`}>
                    <header><small>{group.eyebrow}</small><h4 id={`delivery-group-${group.id}`}>{group.title}</h4><p>{group.description}</p></header>
                    {group.id === "submit" && <section className="presentation-deliverables" aria-labelledby="presentation-deliverables-title">
                      <header><div><small>발표용 파일</small><h4 id="presentation-deliverables-title">사업을 소개하는 발표자료 2개</h4><p>사업소개서는 고객·협력사에게, 투자제안서는 투자자에게 보여주는 파일입니다.</p></div><span><Presentation /> 파일 2개</span></header>
                      <div>{(["intro", "ir"] as const).map((deckType) => {
                        const meta = presentationDeckMeta[deckType];
                        const statusLabel = demo
                          ? "예시 파일 · 글 수정 가능"
                          : deckType === "intro" ? "사업 소개용 · 글 수정 가능" : verifiedEvidenceCount > 0 ? "투자자 설명용 · 글 수정 가능" : "투자자 설명용 · 시장 자료 확인 필요";
                        return <article className={`presentation-deliverable-card ${deckType}`} key={deckType}>
                          <div className="presentation-cover-mini"><small>{deckType === "intro" ? "사업소개서" : "투자제안서"}</small><strong>{resolvedBrandName}</strong><span>{meta.title}</span><em>{meta.pageCount}장</em></div>
                          <div className="presentation-deliverable-copy"><small>{statusLabel}</small><h5>{meta.title}</h5><p>{meta.description}</p><span>{meta.type}</span></div>
                          <div className="presentation-deliverable-actions"><button onClick={() => { setPresentationSlideIndex(0); setPresentationPreview(deckType); }}><Eye /> 전체 미리보기</button><button disabled={Boolean(documentDownload)} onClick={() => void downloadPresentation(deckType)}>{documentDownload === `${deckType}-pptx` ? <LoaderCircle className="spin" /> : <Download />} 파워포인트 받기</button></div>
                        </article>;
                      })}</div>
                    </section>}
                    {group.id === "operate" && <section className="financial-workbook-deliverable" aria-labelledby="financial-workbook-title"><span><FileSpreadsheet /></span><div><small>{monthlyForecast.isCalculated ? "내 숫자로 자동 계산됨" : "예상 판매량을 확인해주세요"}</small><h5 id="financial-workbook-title">12개월 예상 수익 엑셀</h5><p>가격, 비용과 판매량을 바꾸면 매달 예상 매출과 남는 돈이 자동으로 다시 계산됩니다.</p><em>한눈에 보기 · 월별 매출과 비용 · 예상 자금</em></div><button disabled={Boolean(documentDownload)} onClick={() => void downloadFinancialWorkbook()}>{documentDownload === "financial-xlsx" ? <LoaderCircle className="spin" /> : <Download />} 엑셀 받기</button></section>}
                    <div className="deliverable-list">
                      {group.items.map((item) => {
                        const index = deliveryItemIndex.get(item.id) ?? 0;
                        const Icon = deliveryIcons[item.id as keyof typeof deliveryIcons] ?? FileText;
                        const friendlyCopy = deliveryFriendlyCopy[item.id] ?? { title: item.title, description: item.type };
                        const statusLabel = demo ? "예시 파일" : item.useStatus === "ready" ? "바로 사용할 수 있어요" : item.useStatus === "needs_input" ? "내용을 더 넣어야 해요" : "확인할 내용이 있어요";
                        return <article key={item.id} className={`${item.quality?.status === "needs_work" ? "needs-work" : ""} status-${item.useStatus ?? "verify"}`} style={{ "--delivery-index": index } as React.CSSProperties}><span className="delivery-doc-icon"><Icon /></span><div className="delivery-document-summary"><small>{String(index + 1).padStart(2, "0")} · {statusLabel}</small><strong>{friendlyCopy.title}</strong><p>{friendlyCopy.description}</p>{item.quality && <span>{item.quality.metrics.estimatedPages}쪽 예상 · {item.quality.verificationLabel}</span>}{item.qualityReason && <span className="document-readiness-note">{item.qualityReason}</span>}</div><div className="delivery-document-actions"><button className="document-edit-primary" onClick={() => setDocumentEditorId(item.id)}>수정</button><button onClick={() => setDocumentPreview(item)}>열기</button><button title="인쇄용 PDF 받기" aria-label={`${friendlyCopy.title} 인쇄용 PDF 받기`} disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("pdf", item)}>PDF 받기</button><button title="수정용 워드 받기" aria-label={`${friendlyCopy.title} 수정용 워드 받기`} disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("docx", item)}>워드 받기</button></div></article>;
                      })}
                    </div>
                  </section>)}
                </div>
                <div className="delivery-receipt-row"><div><ReceiptText /><span><small>{betaAccess ? "베타 이용 정보" : "결제 내역"}</small><strong>{betaAccess ? "무료 이용" : `${paidAmount.toLocaleString("ko-KR")}원`} · {demo ? "결제완료 예시" : serverProject?.paymentStatus === "paid" ? "계좌입금 확인" : "테스트 승인"}</strong></span></div><nav><button disabled={documentDownload === "receipt-pdf"} onClick={() => void downloadReceipt()}>{documentDownload === "receipt-pdf" ? "문서 제작 중" : betaAccess ? "이용 확인서(PDF)" : "결제 확인서(PDF)"}</button><button title="화면 인쇄" aria-label="화면 인쇄" onClick={() => window.print()}>인쇄</button></nav></div>
              </>}
              </article>
            </div>
          </section>
          <nav className={`mobile-report-actions ${activeReport === "launch" ? "mission-hidden" : ""}`} aria-label="결과 단계 이동">
            <button type="button" disabled={activeReportIndex <= 0} onClick={() => activeReportIndex > 0 && selectReport(reportTabs[activeReportIndex - 1].id)}><ArrowLeft /><span>이전</span></button>
            <button className="mobile-report-actions-next" type="button" disabled={activeReportIndex >= reportTabs.length - 1} onClick={() => activeReportIndex < reportTabs.length - 1 && selectReport(reportTabs[activeReportIndex + 1].id)}><span>{activeReportIndex >= reportTabs.length - 1 ? "마지막 단계" : reportTabs[activeReportIndex + 1]?.id === "launch" ? "실행 도우미(선택)" : "다음"}</span>{activeReportIndex < reportTabs.length - 1 && <ArrowRight />}</button>
          </nav>
        </div>
      </section>

      {landingPreview && (
        <div className="landing-fullscreen-preview" role="dialog" aria-modal="true" aria-label="판매 페이지 전체화면 미리보기">
          <header className="landing-preview-toolbar"><div><span><i /> 편집본 미리보기</span><p>버튼과 신청폼은 화면 확인용이며 실제 접수되지 않습니다.</p></div><button title="미리보기 닫기" aria-label="미리보기 닫기" onClick={() => closeSampleOverlay("landing")}>닫기</button></header>
          <div className={`public-landing tone-${landingDraft.backgroundTone} template-${landingDraft.templateId}`} style={{ "--landing-accent": landingDraft.accentColor } as React.CSSProperties}>
            <nav className="public-landing-nav"><span className="public-landing-brand">{landingDraft.logoImageUrl ? <img src={landingDraft.logoImageUrl} alt={`${landingDraft.businessName} 로고`} /> : <i>{landingDraft.businessName.replaceAll(" ", "").slice(0, 2)}</i>}<strong>{landingDraft.businessName}</strong></span><button onClick={() => document.querySelector(".landing-fullscreen-preview .public-lead-section")?.scrollIntoView({ behavior: "smooth" })}>{landingDraft.ctaLabel}</button></nav>
            {landingDraft.pageData ? <LandingBlocksRenderer data={landingDraft.pageData} /> : <><section className={`public-landing-hero ${landingDraft.heroImageUrl ? "with-image" : "without-image"}`} style={landingDraft.heroImageUrl ? { backgroundImage: `url(${landingDraft.heroImageUrl})` } : undefined} aria-label={landingDraft.heroImageAlt}>
              <div className="public-landing-hero-copy"><span>{landingDraft.heroLabel}</span><h1>{landingDraft.headline}</h1><p>{landingDraft.subheadline}</p><button onClick={() => document.querySelector(".landing-fullscreen-preview .public-lead-section")?.scrollIntoView({ behavior: "smooth" })}>{landingDraft.ctaLabel}<ArrowRight /></button><small><ShieldCheck /> {landingDraft.leadCaptureEnabled ? "신청 정보는 안내 목적으로만 사용됩니다." : "현재는 사업 소개만 공개되어 있습니다."}</small></div>
            </section>
            <section className="public-offer-band"><div><small>첫 상품</small><h2>{landingDraft.offerTitle}</h2><p>{landingDraft.offerDescription}</p></div><strong>{landingDraft.priceLabel}</strong><ul>{landingDraft.benefits.slice(0, 3).map((benefit) => <li key={benefit.title}><Check /> {benefit.title}</li>)}</ul></section>
            <section className="public-benefits"><header><small>진행 방식</small><h2>처음부터 복잡하게 시작하지 않습니다</h2></header><div>{landingDraft.benefits.map((benefit, index) => <article key={`${benefit.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><h3>{benefit.title}</h3><p>{benefit.description}</p></article>)}</div></section>
            {landingDraft.proofItems.length > 0 && <section className="public-proof"><header><small>확인 근거</small><h2>확인할 수 있는 근거</h2></header><div>{landingDraft.proofItems.map((item) => <p key={item}><Check /> {item}</p>)}</div></section>}
            {landingDraft.faq.length > 0 && <section className="public-faq"><header><small>자주 묻는 내용</small><h2>자주 묻는 질문</h2></header><div>{landingDraft.faq.map((item) => <details key={item.question}><summary>{item.question}<ChevronDown /></summary><p>{item.answer}</p></details>)}</div></section>}</>}
            <section id="landing-contact" className={`public-lead-section ${landingDraft.leadCaptureEnabled ? "" : "brochure"}`}><div><small>신청 시작</small><h2>{landingDraft.ctaLabel}</h2><p>남겨주신 정보를 확인한 뒤 다음 절차를 안내합니다.</p></div>{landingDraft.leadCaptureEnabled ? <form className="preview-lead-form" onSubmit={(event) => event.preventDefault()}><label><span>이름</span><input placeholder="성함 또는 닉네임" /></label>{landingDraft.collectEmail && <label><span>이메일</span><input type="email" placeholder="name@company.kr" /></label>}{landingDraft.collectPhone && <label><span>전화번호</span><input type="tel" placeholder="010-0000-0000" /></label>}<label className="preview-consent"><input type="checkbox" /><span>개인정보 수집·이용 동의</span></label><button type="button">{landingDraft.ctaLabel}<ArrowRight /></button><small>미리보기에서는 신청이 전송되지 않습니다.</small></form> : <div className="public-lead-ready"><ShieldCheck /><h3>홈페이지가 먼저 준비되었습니다</h3><p>사업자 연락처와 개인정보 문의 정보를 확인한 뒤 신청폼을 켤 수 있습니다.</p></div>}</section>
            <footer className="public-landing-footer"><div className="public-footer-brand"><span>{landingDraft.logoImageUrl ? <img src={landingDraft.logoImageUrl} alt="" /> : landingDraft.businessName.replaceAll(" ", "").slice(0, 2)}</span><strong>{landingDraft.businessName}</strong></div><div className="public-business-information"><p>대표자 {landingDraft.businessRepresentative || "등록 전"}</p><p>사업장 {landingDraft.businessAddress || "등록 전"}</p><p>전화 {landingDraft.businessPhone || landingDraft.businessContact || "등록 전"}</p><p>이메일 {landingDraft.businessEmail || "등록 전"}</p><p>사업자등록번호 {landingDraft.businessRegistrationNumber || "등록 전"}</p><p>통신판매업 {landingDraft.mailOrderSalesNumber || "해당 시 등록"}</p></div>{landingDraft.pageMode === "transaction" && <p>교환·환불: {landingDraft.refundPolicy || "공개 전 입력"}</p>}<p>{landingDraft.legalNotice}</p>{landingDraft.leadCaptureEnabled && <small>개인정보 문의 {landingDraft.privacyContact || "공개 전 입력 필요"}</small>}<small>호스팅 제공자 {landingDraft.hostingProvider} · © {new Date().getFullYear()} {landingDraft.businessName}</small></footer>
          </div>
        </div>
      )}

      {presentationPreview && (() => {
        const meta = presentationDeckMeta[presentationPreview];
        const input = presentationPayload(presentationPreview);
        const slides = applyPresentationDraft(buildPresentationSlides(input), presentationDrafts[presentationPreview], input);
        const activeIndex = Math.min(presentationSlideIndex, slides.length - 1);
        const activeSlide = slides[activeIndex];
        const selectSlide = (index: number) => {
          setPresentationSlideIndex(index);
          setPresentationEditorOpen(false);
          setPresentationAssistResult(null);
          setPresentationEditorMessage("");
        };
        const selectPrevious = () => selectSlide(Math.max(activeIndex - 1, 0));
        const selectNext = () => selectSlide(Math.min(activeIndex + 1, slides.length - 1));
        const hasFitChart = [input.matchScore, input.marketScore, input.feasibilityScore].filter((value) => value !== null).length >= 2;
        const hasTractionChart = input.traction.interviews + input.traction.proposals + input.traction.purchases > 0;
        return <div className={`presentation-preview ${presentationPreview === "ir" ? "ir-preview" : ""}`} role="dialog" aria-modal="true" aria-label={`${meta.title} 전체 미리보기`}>
          <header><div><span><i /> 편집본 미리보기</span><p>{meta.title} · {meta.type} · {meta.pageCount}장 · 버튼과 문구는 화면 확인용입니다.</p></div><nav><button disabled={Boolean(documentDownload)} onClick={() => void downloadPresentation(presentationPreview)}>{documentDownload === `${presentationPreview}-pptx` ? "PPTX 준비 중" : "PPTX 받기"}</button><button title="미리보기 닫기" aria-label="발표자료 미리보기 닫기" onClick={() => closeSampleOverlay("presentation")}>닫기</button></nav></header>
          <div className={`presentation-preview-body ${presentationEditorOpen ? "editor-open" : ""}`}>
            <aside className="presentation-thumbnail-rail"><header><strong>전체 {slides.length}장</strong><span>보고 싶은 장을 선택하세요</span></header><div>{slides.map((slide, index) => <button className={index === activeIndex ? "active" : ""} key={slide.id} onClick={() => selectSlide(index)} aria-label={`${index + 1}쪽 ${slide.title}`} aria-current={index === activeIndex ? "page" : undefined}><PresentationSlideThumbnail slide={slide} index={index} /><span><b>{String(index + 1).padStart(2, "0")}</b><strong>{slide.title}</strong></span></button>)}</div></aside>
            <main className="presentation-preview-stage">
              <div className="presentation-stage-toolbar"><div><small>{activeSlide.eyebrow}</small><strong>{activeSlide.title}</strong></div><nav><button onClick={() => { setPresentationEditorValue(editablePresentationValue(activeSlide)); setPresentationAssistResult(null); setPresentationEditorMessage(""); setPresentationEditorOpen(true); }}><FileText /> 문구 수정</button><span><b>{activeIndex + 1}</b> / {slides.length}</span></nav></div>
              <div className="presentation-stage-canvas"><PresentationSlideCanvas slide={activeSlide} input={input} index={activeIndex} total={slides.length} /></div>
              <footer className="presentation-stage-navigation"><button disabled={activeIndex === 0} onClick={selectPrevious}><ArrowLeft /> 이전 장</button><p><ShieldCheck /><span><strong>확인된 정보만 반영</strong> 저장된 고객·가격·비용·근거를 사용하며, 없는 수치는 ‘확인 필요’로 표시합니다.</span></p><button disabled={activeIndex === slides.length - 1} onClick={selectNext}>다음 장 <ArrowRight /></button></footer>
            </main>
            {presentationEditorOpen && <PresentationEditorPanel
              slide={activeSlide}
              value={presentationEditorValue}
              assistResult={presentationAssistResult}
              busy={presentationEditorAction}
              message={presentationEditorMessage}
              hasFitChart={hasFitChart}
              hasTractionChart={hasTractionChart}
              onChange={setPresentationEditorValue}
              onAssist={(mode) => void requestPresentationAssist(mode, presentationPreview, activeSlide.id)}
              onApplyAssist={() => {
                if (!presentationAssistResult) return;
                setPresentationEditorValue((current) => ({ ...current, ...presentationAssistResult.fields }));
                setPresentationAssistResult(null);
                setPresentationEditorMessage("제안을 편집창에 반영했습니다. 저장하기를 눌러 확정해주세요.");
              }}
              onSave={() => void savePresentationSlide(presentationPreview, activeSlide.id)}
              onReset={() => void resetPresentationSlide(presentationPreview, activeSlide.id)}
              onClose={() => setPresentationEditorOpen(false)}
            />}
          </div>
        </div>;
      })()}

      {documentPreview && (
        <div className="delivery-document-preview" role="dialog" aria-modal="true" aria-label={`${documentPreview.title} 전체 미리보기`}>
          <header>
            <div><strong>{documentPreview.title}</strong></div>
            <nav><button onClick={() => { setDocumentEditorId(documentPreview.id); setDocumentPreview(null); }}>내용 수정</button><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("pdf", documentPreview)}>인쇄용 문서(PDF)</button><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("docx", documentPreview)}>수정용 워드 문서</button><button className="document-preview-close" title="문서 미리보기 닫기" aria-label="문서 미리보기 닫기" onClick={() => setDocumentPreview(null)}>닫기</button></nav>
          </header>
          <div className="document-preview-scroll">
            <section className="document-preview-cover"><span>창업 실행 캔버스</span><h1>{documentPreview.title}</h1><p>{documentPreview.type}</p><dl><div><dt>프로젝트</dt><dd>{landingDraft.businessName || opportunity.title}</dd></div><div><dt>목표 고객</dt><dd>{resolvedCustomer}</dd></div>{documentPreview.quality && <><div><dt>내용 확인</dt><dd>{documentPreview.quality.label}</dd></div><div><dt>근거 상태</dt><dd>{documentPreview.quality.verificationLabel}</dd></div></>}</dl>{demo && <aside>화면 검증용 가상 사례이며 실제 사업 판단에 사용할 수 없습니다.</aside>}</section>
            <DeliveryDocumentPreview markdown={documentPreview.markdown} />
          </div>
        </div>
      )}
      {documentEditorItem && isDeliveryDocumentId(documentEditorItem.id) && <DocumentEditorStudio
        item={documentEditorItem}
        draft={documentDrafts[documentEditorItem.id]}
        projectId={serverProject?.id}
        demo={demo}
        quickBlocks={documentQuickBlocks}
        onSave={saveDocumentDraft}
        onRestore={restoreDocumentDraft}
        onReset={resetDocumentDraft}
        onClose={() => setDocumentEditorId(null)}
      />}
    </main>
  );
}

function buildStageInput(
  stageIndex: number,
  opportunity: RankedOpportunity,
  price: number,
  brandChoice: string,
  note: string,
) {
  const autoDraft = deriveAutoDraftContext(opportunity as unknown as Record<string, unknown>);
  const budgetWon =
    opportunity.capital === "소액" ? 1000000 : opportunity.capital === "중간" ? 10000000 : 50000000;
  const inputs = [
    {
      goal: `${opportunity.title}의 첫 유료 고객을 확보할 수 있는 사업 시작 기반 완성`,
      availableHoursPerWeek: 10,
      budgetWon,
      mustAvoid: [],
      existingAssets: opportunity.skills,
      referenceUrls: [],
      notes: note,
    },
    {
      primaryCustomer: autoDraft.customer,
      problemStatement: autoDraft.problem,
      interviewNotes: [],
      evidenceUrls: [],
      unknowns: ["실제 지불 의사", "구매 결정자", "구매 빈도"],
    },
    {
      coreOutcome: autoDraft.coreOutcome,
      deliveryMethod: opportunity.model,
      basePriceWon: price,
      variableCostWon: Math.round(price * 0.2),
      monthlyFixedCostWon: budgetWon,
      monthlyRevenueGoalWon: 5000000,
      capacityPerMonth: 20,
      assumptions: [note || "실제 원가와 고객 가격 인터뷰 후 갱신"],
    },
    {
      preferredKeywords: ["명확한", "신뢰할 수 있는", "실행 중심"],
      prohibitedKeywords: ["무조건", "완벽 보장"],
      tone: "실용적인",
      preferredNames: brandChoice ? [brandChoice] : autoDraft.nameCandidates,
      selectedName: brandChoice || undefined,
      legalNameCheckRequired: true,
    },
    {
      headline: autoDraft.headline,
      subheadline: autoDraft.subheadline,
      callToAction: autoDraft.callToAction,
      contactMethod: "신청폼",
      contactValue: "판매 페이지 신청폼",
      proofItems: [],
      faq: [],
      legalNotice: "상담과 생성 결과는 사업 성과를 보장하지 않습니다.",
    },
    {
      launchDate: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
      channels: ["지인", "커뮤니티", "제휴"],
      leadNames: [],
      weeklyContactGoal: 10,
      monthlyCustomerGoal: 3,
      supportProgramInterest: true,
      notes: note,
    },
  ];
  return inputs[stageIndex] as Record<string, unknown>;
}

function ProjectWorkspace({
  opportunity,
  serverProject,
  setServerProject,
  onHome,
}: {
  opportunity: RankedOpportunity;
  serverProject: ProjectRecord | null;
  setServerProject: (project: ProjectRecord) => void;
  onHome: () => void;
}) {
  const [activeStage, setActiveStage] = useState(serverProject?.activeStage ?? 0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [delivered, setDelivered] = useState(serverProject?.status === "completed");
  const [price, setPrice] = useState(
    serverProject?.businessSetup?.financial.sellingPrice
      ?? (opportunity.capital === "소액" ? 290000 : opportunity.capital === "중간" ? 790000 : 1490000),
  );
  const [brandChoice, setBrandChoice] = useState("");
  const [revisionText, setRevisionText] = useState("");
  const [serviceAction, setServiceAction] = useState<"idle" | "saving" | "generating" | "approving" | "revising" | "retrying">("idle");
  const [serviceError, setServiceError] = useState("");
  const [latestJob, setLatestJob] = useState<GenerationJobRecord | null>(null);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [showSavedSetup, setShowSavedSetup] = useState(false);
  const [artifactExpanded, setArtifactExpanded] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [instantBuild, setInstantBuild] = useState<{ status: "idle" | "building" | "error" | "done"; run: DraftPackageRun | null; error: string; connectionMessage: string }>({
    status: "idle",
    run: serverProject?.draftPackageRun ?? null,
    error: "",
    connectionMessage: "",
  });
  const instantBuildStartedRef = useRef(false);
  const lastBuildRequestRef = useRef<{ force: boolean; refinement?: DraftRefinementInput; refinementSource?: "edit" | "restore" }>({ force: false });
  const effectiveOpportunity = (serverProject?.opportunity as unknown as RankedOpportunity | undefined) ?? opportunity;
  const packageReady = Boolean(
    serverProject
    && serverProject.stages.every((stage) => Boolean(stage.approvedArtifactId))
    && serverProject.businessSetup
    && serverProject.businessAssessment
    && serverProject.businessPlan
    && serverProject.operationsPackage
    && serverProject.executionAnalysis
    && serverProject.grantPackage,
  );
  const current = launchStages[activeStage];
  const completedStages = activeStage;
  const progress = Math.round((completedStages / launchStages.length) * 100);
  const allCurrentChecked = current.tasks.every((_, index) => checked[`${activeStage}-${index}`]);
  const firstUncheckedTaskIndex = current.tasks.findIndex((_, index) => !checked[`${activeStage}-${index}`]);
  const currentServerStage = serverProject?.stages[activeStage];
  const latestArtifact = currentServerStage?.artifacts[0];
  const confirmedBudgetWon = typeof serverProject?.stages[0]?.inputs.budgetWon === "number"
    ? serverProject.stages[0].inputs.budgetWon
    : null;
  const confirmedHoursPerWeek = typeof serverProject?.stages[0]?.inputs.availableHoursPerWeek === "number"
    ? serverProject.stages[0].inputs.availableHoursPerWeek
    : null;
  const betaAccess = serverProject?.packagePrice === 0;
  const setupRequired = activeStage === 0 && Boolean(serverProject) && !serverProject?.businessAssessment;
  const projectArchetype = serverProject?.businessSetup?.archetype ?? inferBusinessArchetype(opportunity);
  const locationAnalysisNeeded = needsPhysicalLocationAnalysis(projectArchetype);
  const stageStatusLabel: Record<string, string> = {
    not_started: "아직 시작 전",
    collecting_input: "정보 입력 중",
    ready_to_generate: "초안 생성 준비",
    generating: "초안 생성 중",
    ready_for_review: "검토할 수 있음",
    revision_requested: "수정 요청됨",
    approved: "승인 완료",
    failed: "다시 시도 필요",
  };
  const focusTitle = setupRequired
    ? "사업 조건과 비용부터 입력하세요"
    : !latestArtifact
      ? `AI가 ${current.output} 초안을 먼저 만들어요`
      : !allCurrentChecked
        ? "만들어진 초안을 보고 한 번만 확인하세요"
        : "확인이 끝났어요. 다음 단계로 이동하세요";
  const focusDescription = setupRequired
    ? "화면에 보이는 한 단계씩 입력하면 손익분기점과 필수 절차를 계산합니다."
    : !latestArtifact
      ? "추가 입력은 필요 없습니다. 처음 입력한 아이디어·예산·시간과 저장된 사업 조건을 자동으로 반영합니다."
      : !allCurrentChecked
        ? "마음에 들면 그대로 사용하고, 원하는 경우에만 수정 요청을 남기면 됩니다."
        : "마지막 승인 버튼을 누르면 현재 결과를 저장하고 다음 단계가 열립니다.";

  useEffect(() => {
    setRevisionText("");
    setServiceError("");
    setShowSavedSetup(false);
    setArtifactExpanded(false);
  }, [activeStage]);

  useEffect(() => {
    if (!serverProject) {
      setLatestJob(null);
      return;
    }
    void fetch(`/api/projects/${serverProject.id}/stages/${activeStage}/jobs`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setLatestJob(payload.job ?? null))
      .catch(() => setLatestJob(null));
  }, [serverProject?.id, activeStage, serverProject?.stages[activeStage]?.status, serverProject?.updatedAt]);

  useEffect(() => {
    const key = `venture-workspace-${serverProject?.id ?? opportunity.id}`;
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as { checked?: Record<string, boolean>; price?: number; brandChoice?: string };
        if (parsed.checked) setChecked(parsed.checked);
        if (parsed.price) setPrice(parsed.price);
        if (parsed.brandChoice) setBrandChoice(parsed.brandChoice);
      }
    } finally {
      setWorkspaceHydrated(true);
    }
  }, [serverProject?.id, opportunity.id]);

  useEffect(() => {
    if (!workspaceHydrated) return;
    const key = `venture-workspace-${serverProject?.id ?? opportunity.id}`;
    window.localStorage.setItem(key, JSON.stringify({ checked, price, brandChoice }));
  }, [workspaceHydrated, serverProject?.id, opportunity.id, checked, price, brandChoice]);

  const toggleTask = (index: number) => {
    const key = `${activeStage}-${index}`;
    setChecked((currentChecked) => {
      const nextChecked = { ...currentChecked, [key]: !currentChecked[key] };
      if (currentChecked[key]) {
        current.tasks.forEach((_, laterIndex) => {
          if (laterIndex > index) delete nextChecked[`${activeStage}-${laterIndex}`];
        });
      }
      return nextChecked;
    });
  };

  const moveToChecklist = () => {
    document.getElementById("stage-checklist")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const moveToArtifact = () => {
    setArtifactExpanded(true);
    window.setTimeout(() => document.querySelector(".artifact-preview-details")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const moveToRevision = () => {
    const input = document.querySelector<HTMLTextAreaElement>(".artifact-review-actions textarea");
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => input?.focus(), 350);
  };

  const refreshProject = async () => {
    if (!serverProject) return null;
    const response = await fetchWithTransientRetry(`/api/projects/${serverProject.id}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "프로젝트를 불러오지 못했습니다.");
    setServerProject(payload.project);
    return payload.project as ProjectRecord;
  };

  const deleteCurrentProject = async () => {
    if (!serverProject || deletingProject) return;
    if (!window.confirm("이 프로젝트와 생성한 문서를 모두 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.")) return;
    setDeletingProject(true);
    setServiceError("");
    try {
      const response = await fetch(`/api/projects/${serverProject.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "프로젝트를 삭제하지 못했습니다.");
      if (window.localStorage.getItem("venture-project-id") === serverProject.id) {
        window.localStorage.removeItem("venture-project-id");
      }
      onHome();
    } catch (error) {
      setServiceError(error instanceof Error ? error.message : "프로젝트를 삭제하지 못했습니다.");
      setDeletingProject(false);
    }
  };

  const generateServerArtifact = async () => {
    if (!serverProject) return;
    if (setupRequired) {
      setServiceError("먼저 실제 사업 조건과 비용을 저장해 사업계획·손익분기 분석을 완료해주세요.");
      document.querySelector(".business-setup-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setServiceError("");
    try {
      setServiceAction("saving");
      const stageInputs = mergeStageInputs(
        buildStageInput(activeStage, opportunity, price, brandChoice, ""),
        currentServerStage?.inputs ?? {},
        "",
      );
      const inputResponse = await fetch(`/api/projects/${serverProject.id}/stages/${activeStage}/inputs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stageInputs),
      });
      const inputPayload = await inputResponse.json();
      if (!inputResponse.ok) throw new Error(inputPayload.error?.message ?? "입력을 저장하지 못했습니다.");
      setServiceAction("generating");
      const response = await fetch(`/api/projects/${serverProject.id}/stages/${activeStage}/generate`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "초안을 생성하지 못했습니다.");
      await refreshProject();
      setServiceAction("idle");
    } catch (error) {
      setServiceError(error instanceof Error ? error.message : "생성 중 오류가 발생했습니다.");
      setServiceAction("idle");
    }
  };

  const retryServerArtifact = async () => {
    if (!serverProject) return;
    setServiceError("");
    setServiceAction("retrying");
    try {
      const response = await fetch(`/api/projects/${serverProject.id}/stages/${activeStage}/jobs`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "재시도하지 못했습니다.");
      await refreshProject();
      setServiceAction("idle");
    } catch (error) {
      setServiceError(error instanceof Error ? error.message : "재시도 중 오류가 발생했습니다.");
      setServiceAction("idle");
    }
  };

  const handleGenerationRecovery = () => {
    if (currentServerStage?.status === "failed" && latestJob?.retryable && (latestJob.attempt ?? 0) < 3) {
      void retryServerArtifact();
      return;
    }
    void generateServerArtifact();
  };

  const canRetryGeneration = currentServerStage?.status === "failed"
    && Boolean(latestJob?.retryable)
    && (latestJob?.attempt ?? 0) < 3;

  const approveServerArtifact = async () => {
    if (!serverProject) return;
    const artifact = serverProject.stages[activeStage]?.artifacts[0];
    if (!artifact) return;
    setServiceError("");
    setServiceAction("approving");
    try {
      const response = await fetch(`/api/projects/${serverProject.id}/stages/${activeStage}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId: artifact.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "승인하지 못했습니다.");
      setServerProject(payload.project);
      if (activeStage === 5) setDelivered(true);
      else setActiveStage(payload.project.activeStage);
    } catch (error) {
      setServiceError(error instanceof Error ? error.message : "승인 중 오류가 발생했습니다.");
    } finally {
      setServiceAction("idle");
    }
  };

  const reviseServerArtifact = async () => {
    if (!serverProject || revisionText.trim().length < 10) return;
    const artifact = serverProject.stages[activeStage]?.artifacts[0];
    if (!artifact) return;
    setServiceError("");
    setServiceAction("revising");
    try {
      const response = await fetch(`/api/projects/${serverProject.id}/stages/${activeStage}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId: artifact.id, instruction: revisionText }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "수정본을 생성하지 못했습니다.");
      setRevisionText("");
      await refreshProject();
    } catch (error) {
      setServiceError(error instanceof Error ? error.message : "수정 중 오류가 발생했습니다.");
    } finally {
      setServiceAction("idle");
    }
  };

  const runInstantDraftPackage = useCallback(async (force: boolean, refinement?: DraftRefinementInput, refinementSource: "edit" | "restore" = "edit") => {
    if (!serverProject || instantBuildStartedRef.current) return;
    instantBuildStartedRef.current = true;
    lastBuildRequestRef.current = { force, refinement, refinementSource };
    setInstantBuild((current) => ({ status: "building", run: current.run, error: "", connectionMessage: "" }));

    try {
      const response = await fetchWithTransientRetry(`/api/projects/${serverProject.id}/draft-package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, refinement, refinementSource }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "자료 제작을 시작하지 못했습니다.");
      if (payload.packageReady && !payload.run) {
        const projectResponse = await fetchWithTransientRetry(`/api/projects/${serverProject.id}`, { cache: "no-store" });
        const projectPayload = await projectResponse.json();
        if (!projectResponse.ok) throw new Error(projectPayload.error?.message ?? "완성된 자료를 불러오지 못했습니다.");
        setServerProject(projectPayload.project as ProjectRecord);
        setInstantBuild({ status: "done", run: null, error: "", connectionMessage: "" });
      } else {
        setInstantBuild({ status: "building", run: (payload.run as DraftPackageRun | null) ?? null, error: "", connectionMessage: "" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "전체 자료를 만들지 못했습니다.";
      setInstantBuild((current) => message === "Failed to fetch"
        ? { ...current, status: "building", error: "", connectionMessage: "진행 화면 연결을 다시 확인하고 있습니다. 서버 제작은 계속됩니다." }
        : { ...current, status: "error", error: message, connectionMessage: "" });
    } finally {
      instantBuildStartedRef.current = false;
    }
  }, [serverProject, setServerProject]);

  useEffect(() => {
    if (!serverProject || instantBuild.status !== "building") return;
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/projects/${serverProject.id}/draft-package`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "제작 상태를 불러오지 못했습니다.");
        if (cancelled) return;
        const run = (payload.run as DraftPackageRun | null) ?? null;
        if (run?.status === "error") {
          setInstantBuild({ status: "error", run, error: run.error || "자료 제작이 중단되었습니다.", connectionMessage: "" });
          return;
        }
        setInstantBuild({ status: "building", run, error: "", connectionMessage: "" });
        if (payload.packageReady && (!run || run.status === "complete")) {
          const projectResponse = await fetchWithTransientRetry(`/api/projects/${serverProject.id}`, { cache: "no-store" });
          const projectPayload = await projectResponse.json();
          if (!projectResponse.ok) throw new Error(projectPayload.error?.message ?? "완성된 자료를 불러오지 못했습니다.");
          if (cancelled) return;
          setServerProject(projectPayload.project as ProjectRecord);
          setInstantBuild({ status: "done", run, error: "", connectionMessage: "" });
        }
      } catch (error) {
        if (!cancelled) {
          setInstantBuild((current) => ({
            ...current,
            status: "building",
            error: "",
            connectionMessage: "진행 화면 연결을 다시 확인하고 있습니다. 서버 제작은 계속됩니다.",
          }));
        }
      }
    };

    void poll();
    const timer = window.setInterval(
      () => void poll(),
      instantBuild.run?.status === "waiting" ? 30_000 : 2500,
    );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [instantBuild.status, instantBuild.run?.status, serverProject?.id, setServerProject]);

  useEffect(() => {
    if (!serverProject || packageReady || instantBuild.status !== "idle" || instantBuildStartedRef.current) return;
    void runInstantDraftPackage(false);
  }, [instantBuild.status, packageReady, runInstantDraftPackage, serverProject]);

  if (serverProject && (instantBuild.status === "building" || instantBuild.status === "error" || !packageReady)) {
    return <InstantDraftBuilder opportunity={effectiveOpportunity} run={instantBuild.run} error={instantBuild.error} connectionMessage={instantBuild.connectionMessage} onRetry={() => { const request = lastBuildRequestRef.current; void runInstantDraftPackage(request.force, request.refinement, request.refinementSource); }} onHome={onHome} />;
  }

  if (serverProject && packageReady) {
    return <FinalDelivery opportunity={effectiveOpportunity} price={price} brandChoice={brandChoice} serverProject={serverProject} onHome={onHome} onRefine={(input, source) => runInstantDraftPackage(true, input, source)} onProjectUpdated={setServerProject} />;
  }

  if (delivered) {
    return <FinalDelivery opportunity={opportunity} price={price} brandChoice={brandChoice} serverProject={serverProject} onHome={onHome} onProjectUpdated={setServerProject} />;
  }

  // 데모/프로젝트 미생성 세션: 6단계 워크스페이스 대신 완성된 결과물 미리보기를 보여준다.
  // 실제 결제 프로젝트는 위(InstantDraftBuilder/FinalDelivery)에서 이미 처리되므로 이 경로는 데모 전용이다.
  return (
    <FinalDelivery
      opportunity={effectiveOpportunity}
      price={price}
      brandChoice={brandChoice}
      serverProject={null}
      demo
      onHome={onHome}
      onProjectUpdated={setServerProject}
    />
  );
}

export default function Page() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedProject, setSelectedProject] = useState<RankedOpportunity | null>(null);
  const [serverProject, setServerProject] = useState<ProjectRecord | null>(null);

  const navigate = useCallback((next: Screen, options?: { replace?: boolean; projectId?: string }) => {
    const url = new URL(window.location.href);
    if (next === "home") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    if (next === "project" && options?.projectId) url.searchParams.set("project", options.projectId);
    else url.searchParams.delete("project");
    const method = options?.replace ? "replaceState" : "pushState";
    window.history[method]({ screen: next }, "", `${url.pathname}${url.search}${url.hash}`);
    setScreen(next);
  }, []);

  useEffect(() => {
    // 예전 흐름이 남긴 기기 저장값 — 더 읽지 않으니 지운다
    for (const key of legacyStorageKeys) window.localStorage.removeItem(key);
    const screenFromLocation = (): Screen => {
      const requested = new URL(window.location.href).searchParams.get("view");
      return requested === "start" || requested === "project" ? requested : "home";
    };
    const initial = screenFromLocation();
    const url = new URL(window.location.href);
    // 지워진 예전 화면 주소(?view=explore 등)로 들어오면 주소도 첫 화면으로 정리한다
    if (initial === "home") url.searchParams.delete("view");
    window.history.replaceState({ screen: initial }, "", `${url.pathname}${url.search}${url.hash}`);
    setScreen(initial);
    const handlePopState = () => setScreen(screenFromLocation());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("view") !== "project") return;
    const linkedProjectId = currentUrl.searchParams.get("project");
    const projectId = linkedProjectId ?? window.localStorage.getItem("venture-project-id");
    if (!projectId) {
      navigate("start", { replace: true });
      return;
    }
    void fetchWithTransientRetry(`/api/projects/${projectId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("저장된 프로젝트를 불러오지 못했습니다.");
        return response.json();
      })
      .then((payload: { project: ProjectRecord }) => {
        setServerProject(payload.project);
        setSelectedProject(payload.project.opportunity as unknown as RankedOpportunity);
        window.localStorage.setItem("venture-project-id", payload.project.id);
        navigate("project", { replace: true, projectId: payload.project.id });
      })
      .catch(() => {
        if (!linkedProjectId) window.localStorage.removeItem("venture-project-id");
        navigate("start", { replace: true });
      });
  }, [navigate]);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (screen === "start") router.replace("/plan/chat?new=1");
  }, [screen, router]);

  if (screen === "start") return <div role="status">사업 기획 대화를 열고 있어요.</div>;
  if (screen === "project") {
    if (selectedProject) return <ProjectWorkspace opportunity={selectedProject} serverProject={serverProject} setServerProject={setServerProject} onHome={() => navigate("home")} />;
    return <div role="status">예전 결과물을 불러오고 있어요.</div>;
  }
  // 새 기획은 대화로 시작하고, 이미 작성한 예전 결과물 경로(?view=project)는 유지한다.
  return <Home onStart={() => router.push("/plan/chat?new=1")} />;
}
