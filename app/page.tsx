"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Calculator,
  CircleDollarSign,
  CircleHelp,
  ClipboardCheck,
  Compass,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FlaskConical,
  Heart,
  Gift,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  MessageCircle,
  UserRound,
  PackageCheck,
  Printer,
  ReceiptText,
  RefreshCw,
  Rocket,
  Search,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  ThumbsDown,
  TrendingUp,
  Trash2,
  Undo2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyPreference,
  calculateProfile,
  coreQuestions,
  founderInterpretations,
  founderLabels,
  inferProfileFromNarrative,
  type AssessmentAnswers,
  type FounderAxis,
  type FounderProfile,
  type NarrativeInference,
} from "../lib/assessment";
import {
  rankOpportunities,
  type OpportunityFeedback,
  type RankedOpportunity,
} from "../lib/opportunity-engine";
import type { ManualPreferences } from "../lib/idea-generator";
import type { ArtifactRecord, ProjectRecord } from "../lib/service-domain";
import { BusinessSetupPanel } from "../components/business-setup-panel";
import { archetypeLabels, emptyBusinessSetup, legalFormLabels, needsPhysicalLocationAnalysis, workplaceLabels } from "../lib/business/domain";
import { inferBusinessArchetype } from "../lib/business/router";
import { MarketPlanPanel } from "../components/market-plan-panel";
import { LandingBuilderPanel } from "../components/landing-builder-panel";
import { OperationsPanel } from "../components/operations-panel";
import { ExecutionLoopPanel } from "../components/execution-loop-panel";
import { RegionalCoveragePanel } from "../components/regional-coverage-panel";
import { QualityAssurancePanel } from "../components/quality-assurance-panel";
import { GrantMatcherPanel } from "../components/grant-matcher-panel";
import { ServiceOpsPanel } from "../components/service-ops-panel";
import { HomeHeroScene, HomeResearchEvidence } from "../components/home-hero-scene";
import { BeginnerMissionRoadmap } from "../components/beginner-mission-roadmap";
import { DeliveryDocumentPreview } from "../components/delivery-document-preview";
import { LandingQuickEditor } from "../components/landing-quick-editor";
import {
  assembleDeliveryPackage,
  type DeliveryItem,
} from "../lib/delivery/package-assembler";
import { createPaidReportDemoItems } from "../lib/delivery/demo-package";
import { downloadBusinessDocuments, type DownloadFormat } from "../lib/delivery/client-download";
import type { GenerationJobRecord } from "../lib/service-audit/domain";
import { createLandingDraft, type LandingDraft, type LandingSiteRecord } from "../lib/landing/domain";
import {
  createDirectOpportunity,
  createFounderProfilePayload,
  createInitialStageInputs,
  isPlanningConstraints,
  mergeStageInputs,
  type DirectPlanInput,
  type PlanningConstraints,
} from "../lib/planning-inputs";
import { deriveAutoDraftContext } from "../lib/auto-draft";

type Screen =
  | "home"
  | "start"
  | "direct"
  | "assessment"
  | "conversation"
  | "profile"
  | "explore"
  | "checkout"
  | "project"
  | "sample"
  | "delivery";
type CapitalFilter = "전체" | "소액" | "중간" | "높음";

const resumableScreens: Screen[] = ["start", "direct", "assessment", "conversation", "profile", "explore"];
const directScreens: Screen[] = [...resumableScreens, "project", "sample", "delivery"];

const founderCharacterImages: Record<FounderAxis, string> = {
  opportunity: "/archetypes/opportunity.png",
  customer: "/archetypes/customer.png",
  creation: "/archetypes/creation.png",
  execution: "/archetypes/execution.png",
  uncertainty: "/archetypes/uncertainty.png",
  scale: "/archetypes/scale.png",
};

const assessmentOptionIcons: Record<string, React.ReactNode> = {
  make: <PackageCheck />, discover: <Search />, energy: <Users />, system: <ClipboardCheck />,
  change: <Heart />, original: <Sparkles />, talk: <MessageCircle />, map: <BarChart3 />,
  prototype: <FlaskConical />, pitch: <TrendingUp />, craft: <Gift />, repeat: <Layers3 />,
  experiment: <Rocket />, evidence: <ShieldCheck />, close: <Users />, platform: <Zap />,
};

function emptyConversationDraft() {
  return { step: 0, responses: ["", "", "", ""], budgetManwon: "", availableHoursPerWeek: "" };
}

function readConversationDraft() {
  if (typeof window === "undefined") return emptyConversationDraft();
  try {
    const parsed = JSON.parse(window.localStorage.getItem("venture-conversation-draft") ?? "null") as {
      step?: number;
      responses?: string[];
      budgetManwon?: string | number;
      availableHoursPerWeek?: string | number;
    } | null;
    if (!parsed?.responses || parsed.responses.length !== 4) return emptyConversationDraft();
    return {
      step: Math.min(Math.max(parsed.step ?? 0, 0), 5),
      responses: parsed.responses.map((response) => typeof response === "string" ? response : ""),
      budgetManwon: parsed.budgetManwon === undefined ? "" : String(parsed.budgetManwon),
      availableHoursPerWeek: parsed.availableHoursPerWeek === undefined ? "" : String(parsed.availableHoursPerWeek),
    };
  } catch {
    return emptyConversationDraft();
  }
}

function Logo({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" onClick={onClick} aria-label="오늘창업 홈으로">
      <img className="brand-logo" src="/today-startup-logo.png" alt="오늘창업" width="2200" height="650" />
    </button>
  );
}

function Header({
  onHome,
  onStart,
  light = false,
  homeNav = false,
}: {
  onHome: () => void;
  onStart?: () => void;
  light?: boolean;
  homeNav?: boolean;
}) {
  return (
    <header className={`site-header ${light ? "light" : ""}`}>
      <Logo onClick={onHome} />
      {homeNav && (
        <nav className="home-header-nav" aria-label="메인 안내">
          <a href="#how">진행 방식</a>
          <a href="#deliverables">결과물</a>
          <a href="#evidence">근거 기준</a>
          <a href="#price">베타 이용</a>
        </nav>
      )}
      <div className="header-actions">
        <a className="account-link" href="/account" aria-label="마이페이지" title="마이페이지"><UserRound /><span>마이페이지</span></a>
        {onStart && <button className="small-start" onClick={onStart}>시작하기 <ArrowRight size={15} /></button>}
      </div>
    </header>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled = false,
  dark = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  dark?: boolean;
}) {
  return (
    <button className={`primary-cta ${dark ? "dark" : ""}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function GuidedActionBar({
  onBack,
  onUnknown,
  onNext,
  nextLabel = "다음",
  nextDisabled = false,
  busy = false,
}: {
  onBack: () => void;
  onUnknown?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
}) {
  return (
    <footer className="guided-action-bar">
      <div>
        <button type="button" className="guided-back" aria-label="이전" title="이전" onClick={onBack} disabled={busy}><ArrowLeft /><span>이전</span></button>
        {onUnknown ? <button type="button" className="guided-unknown" onClick={onUnknown} disabled={busy}><CircleHelp /> 모르겠음</button> : <span />}
        <button type="button" className="guided-next" onClick={onNext} disabled={nextDisabled || busy}>{nextLabel} <ArrowRight /></button>
      </div>
    </footer>
  );
}

function Home({
  onStart,
  onPreview,
}: {
  onStart: () => void;
  onPreview: () => void;
}) {
  const [businessInfo, setBusinessInfo] = useState<{
    operatorName: string; representativeName: string; businessRegistrationNumber: string; mailOrderSalesNumber: string;
    businessAddress: string; supportEmail: string; supportPhone: string; hostingProvider: string;
  } | null>(null);
  useEffect(() => {
    void fetch("/api/platform/readiness", { cache: "no-store" }).then((response) => response.json()).then((data) => setBusinessInfo(data.business ?? null)).catch(() => undefined);
  }, []);
  const deliverables = [
    "사업 실행 요약서",
    "고객·시장 진단서",
    "상품 구성·손익표",
    "이름·소개 문구 모음",
    "판매 페이지 원고",
    "30일 첫 고객 실행안",
    "근거 기반 사업계획서",
    "영업 운영 준비서",
    "실행 결과 검증 보고서",
    "공공지원사업 신청 초안",
  ];

  return (
    <main className="new-home simple-home">
      <div className="hero-shell">
        <HomeHeroScene />
        <Header light homeNav onStart={onStart} onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
        <section className="simple-home-choice">
          <div className="home-hero-copy">
            <span className="section-label">직업 탐색부터 사업 실행까지</span>
            <h1>나에게 맞는 일,<br />사업으로 시작하세요.</h1>
            <p>대화로 가능성을 찾고, 근거가 있는 실행 계획까지 만듭니다.</p>
            <div className="home-hero-actions">
              <button className="conversation-choice" onClick={onStart} aria-label="나에게 맞는 사업 찾기 시작"><strong>시작하기</strong><ArrowRight /></button>
            </div>
            <p className="home-hero-assurance"><ShieldCheck /> 베타 기간에는 모든 기능을 결제 없이 이용합니다.</p>
          </div>
        </section>
        <a className="home-scroll-hint" href="#how"><ArrowDown /> 아래에서 제공 범위 확인</a>
      </div>

      <HomeResearchEvidence />

      <section className="home-proof-bar" aria-label="서비스 구성 요약">
        <div><strong>무료</strong><span>전체 기능 베타 이용</span></div>
        <div><strong>10종</strong><span>단계별 사업 실행 결과물</span></div>
        <div><strong>21일</strong><span>초보자용 실행 일정</span></div>
        <div><strong>PDF·워드·PPTX</strong><span>바로 쓰는 문서 형식</span></div>
      </section>

      <section className="home-section home-method" id="how">
        <div className="home-section-heading">
          <span>진행 방식</span>
          <h2>아이디어만 주는 것이 아니라<br />확인하고 실행하는 순서까지 만듭니다</h2>
          <p>초보자가 다음 행동을 고민하지 않도록 입력, 근거 확인, 결과물, 실행 미션을 한 흐름으로 연결합니다.</p>
        </div>
        <div className="home-method-flow">
          <article><em>01</em><MessageCircle /><h3>나를 먼저 파악</h3><p>경험, 관심사, 가능한 시간, 자본과 지역을 대화 또는 8개 질문으로 정리합니다.</p></article>
          <article><em>02</em><BarChart3 /><h3>사업 가능성 확인</h3><p>고객 문제, 기존 대안, 가격과 인허가 조건을 확인하고 아직 모르는 값은 가정으로 남깁니다.</p></article>
          <article><em>03</em><PackageCheck /><h3>실행 자료 제작</h3><p>시장 진단, 손익표, 사업계획서, 판매 페이지와 첫 고객 실행안을 순서대로 완성합니다.</p></article>
          <article><em>04</em><CalendarDays /><h3>선택 실행 도우미</h3><p>결과물을 받은 뒤 필요할 때 사업자 등록, 계약, 세무, 홍보를 한 번에 한 가지씩 확인합니다.</p></article>
        </div>
      </section>

      <section className="home-deliverables" id="deliverables">
        <div className="home-deliverables-inner">
          <div className="home-deliverables-copy">
            <span>최종 결과물</span>
            <h2>시작하면 무엇을 받는지<br />처음부터 분명하게</h2>
            <p>진행 단계가 끝날 때마다 결과물을 확인하고 수정합니다. 완성 문서는 PDF와 워드로, 사업소개서는 파워포인트로 받을 수 있습니다.</p>
            <ul>{deliverables.map((item) => <li key={item}><Check /> {item}</li>)}</ul>
            <button className="home-sample-preview" onClick={onPreview}><Eye /> 완성 결과 예시 보기 <ArrowRight /></button>
          </div>
        </div>
      </section>

      <section className="home-section home-evidence" id="evidence">
        <div className="home-evidence-intro">
          <span>근거 확인 방식</span>
          <h2>인공지능의 답을<br />그대로 믿게 하지 않습니다</h2>
          <p>추천은 출발점입니다. 숫자와 조건마다 어디서 왔는지, 무엇을 더 확인해야 하는지 구분해 보여줍니다.</p>
          <div className="home-evidence-note"><ShieldCheck /><p><strong>확정처럼 쓰지 않는 원칙</strong>공식 원문, 실제 견적, 고객 반응이 없으면 ‘가정’ 또는 ‘확인 필요’로 남깁니다.</p></div>
        </div>
        <div className="home-evidence-table">
          <div><em>1</em><span><strong>사용자 조건</strong><small>경험·시간·자본·지역</small></span><b>직접 입력</b></div>
          <div><em>2</em><span><strong>공식 자료</strong><small>통계·법령·지원사업 공고</small></span><b>원문·확인일</b></div>
          <div><em>3</em><span><strong>현장 근거</strong><small>고객 인터뷰·견적·가격 반응</small></span><b>직접 확인</b></div>
          <div><em>4</em><span><strong>최종 판정</strong><small>확인됨·가정·확인 필요</small></span><b>사용자 승인</b></div>
        </div>
      </section>

      <section className="home-price" id="price">
        <div className="home-price-inner">
          <div className="home-price-copy">
            <span>베타 테스트</span>
            <h2>결제 없이 모든 기능을<br />직접 확인하세요</h2>
            <p>정식 결제 기능을 추가하기 전까지 추천, 21일 실행 과정, 판매 페이지와 문서 제작을 모두 무료로 테스트할 수 있습니다.</p>
            <div><ShieldCheck /><span><strong>현재 전체 기능 무료</strong><small>카드나 계좌 정보를 입력하지 않습니다</small></span></div>
          </div>
          <article className="home-price-panel">
            <header><span>21일 창업 실행 과정</span><h3>베타 전체 기능 이용</h3><p>테스트 기간 한정</p></header>
            <strong className="home-price-number">무료</strong>
            <ul>
              <li><Check /> 단계 완료에 따라 실행 결과물 10종</li>
              <li><Check /> 판매 페이지 제작·수정·전체 화면 미리보기</li>
              <li><Check /> PDF·워드·파워포인트 문서</li>
              <li><Check /> 사업자·세무·인허가·지원사업 실행 안내</li>
              <li><Check /> 단계별 승인과 수정 요청</li>
            </ul>
            <button onClick={onStart}>무료로 시작하기 <ArrowRight /></button>
            <small>결제 정보 입력 없음</small>
          </article>
        </div>
      </section>

      <section className="home-faq" aria-labelledby="home-faq-title">
        <div><span>자주 묻는 질문</span><h2 id="home-faq-title">시작 전에 확인하세요</h2></div>
        <div>
          <details><summary>사업 아이디어가 없어도 시작할 수 있나요?<ChevronDown /></summary><p>네. 지금까지의 경험, 관심사, 가능한 시간과 자본을 바탕으로 현실적인 후보부터 찾습니다.</p></details>
          <details><summary>결과가 성공을 보장하나요?<ChevronDown /></summary><p>아닙니다. 추천과 문서는 실행을 위한 초안입니다. 시장 반응은 고객 인터뷰와 실제 결제로 확인하며, 세무·법률·인허가의 최종 판단은 공식 기관이나 전문가 확인이 필요합니다.</p></details>
          <details><summary>문서를 직접 수정할 수 있나요?<ChevronDown /></summary><p>판매 페이지는 화면에서 직접 수정하고 전체 화면으로 확인할 수 있습니다. 문서는 워드로 내려받아 이어서 편집할 수 있습니다.</p></details>
        </div>
      </section>

      <footer className="home-footer">
        <div><Logo onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} /><p>경험에서 사업 기회를 찾고, 근거와 실행 순서까지 만드는 창업 실행 서비스</p></div>
        <nav aria-label="하단 안내"><a href="/business-info">사업자 정보</a><a href="/privacy">개인정보처리방침</a><a href="/ai-notice">인공지능·국외 처리</a><a href="/terms">이용약관</a><a href="/refund">취소·환불 기준</a><a href="/account">로그인·계정 복구</a></nav>
        <div className="home-footer-notice"><strong>판매자·이용 안내</strong>{businessInfo?.operatorName ? <div className="home-business-info"><span>{businessInfo.operatorName} · 대표 {businessInfo.representativeName}</span><span>사업자등록번호 {businessInfo.businessRegistrationNumber}</span><span>통신판매업 {businessInfo.mailOrderSalesNumber}</span><span>{businessInfo.businessAddress}</span><span>{businessInfo.supportPhone} · {businessInfo.supportEmail}</span><span>호스팅 {businessInfo.hostingProvider}</span></div> : <p>현재는 결제 없는 베타 서비스입니다. 실제 판매자 정보가 확인되기 전에는 유료 결제가 열리지 않습니다.</p>}<p>인공지능 생성 내용은 반드시 원문과 현장 자료로 확인해야 합니다.</p><small>© 2026 오늘창업</small></div>
      </footer>
    </main>
  );
}

function StartChoice({
  onDirect,
  onQuestionnaire,
  onConversation,
  onBack,
  questionnaireProgress,
  conversationInProgress,
}: {
  onDirect: () => void;
  onQuestionnaire: () => void;
  onConversation: () => void;
  onBack: () => void;
  questionnaireProgress: number;
  conversationInProgress: boolean;
}) {
  return (
    <main className="start-choice-page">
      <Header onHome={onBack} />
      <section className="start-choice-content">
        <button className="start-back" onClick={onBack}><ArrowLeft /> 처음으로</button>
        <div className="start-choice-heading">
          <span>3가지 중 하나만 고르면 돼요</span>
          <h1>어떻게 시작할까요?</h1>
          <p>가장 쉬운 방법을 먼저 준비했어요.</p>
        </div>
        <div className="start-mode-cards">
          <button className="recommended-mode" onClick={onQuestionnaire}>
            <span className="start-mode-icon"><CheckCircle2 /></span>
            <span><em>가장 쉬워요</em><strong>질문으로 찾기</strong><small>{questionnaireProgress ? `${Math.min(questionnaireProgress + 1, coreQuestions.length)}번째 질문부터 이어서` : "두 가지 중 하나씩, 8번만 선택"}</small></span>
            <span className="start-mode-action" aria-hidden="true"><ArrowRight /></span>
          </button>
          <button className="direct-mode" onClick={onDirect}>
            <span className="start-mode-icon"><BriefcaseBusiness /></span>
            <span><strong>내 아이디어로 바로 기획</strong><small>아이디어가 이미 있을 때</small></span>
            <span className="start-mode-action" aria-hidden="true"><ArrowRight /></span>
          </button>
          <button className="conversation-mode" onClick={onConversation}>
            <span className="start-mode-icon"><MessageCircle /></span>
            <span><strong>내 경험을 적으며 찾기</strong><small>{conversationInProgress ? "작성하던 내용 이어서" : "하고 싶은 일이 아직 막연할 때"}</small></span>
            <span className="start-mode-action" aria-hidden="true"><ArrowRight /></span>
          </button>
        </div>
        <details className="start-privacy"><summary><ShieldCheck /> 입력 정보 이용 안내 <ChevronDown /></summary><p>입력 내용은 맞춤 추천과 문서 생성에만 사용합니다. 주민등록번호, 상세 주소, 계좌번호는 입력하지 마세요. <a href="/privacy" target="_blank" rel="noreferrer">개인정보 안내</a> · <a href="/ai-notice" target="_blank" rel="noreferrer">인공지능 처리 안내</a></p></details>
      </section>
    </main>
  );
}

function DirectPlanning({
  onBack,
  onStart,
}: {
  onBack: () => void;
  onStart: (input: DirectPlanInput) => Promise<void>;
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [idea, setIdea] = useState("");
  const [budgetManwon, setBudgetManwon] = useState("");
  const [availableHoursPerWeek, setAvailableHoursPerWeek] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const budget = Number(budgetManwon);
  const hours = Number(availableHoursPerWeek);
  const validIdea = idea.trim().length >= 5;
  const validBudget = budgetManwon !== "" && Number.isFinite(budget) && budget >= 0 && budget <= 1_000_000;
  const validHours = availableHoursPerWeek !== "" && Number.isFinite(hours) && hours >= 1 && hours <= 100;
  const canContinue = step === 0 ? validIdea : step === 1 ? validBudget : validHours;

  const startProject = async (nextBudget: number, nextHours: number) => {
    setBusy(true);
    setError("");
    try {
      await onStart({
        idea: idea.trim(),
        budgetWon: Math.round(nextBudget * 10_000),
        availableHoursPerWeek: Math.round(nextHours),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "기획을 시작하지 못했습니다.");
      setBusy(false);
    }
  };

  const advance = async () => {
    if (!canContinue || busy) return;
    if (step < 2) {
      setStep((step + 1) as 1 | 2);
      setError("");
      return;
    }
    await startProject(budget, hours);
  };

  const useRecommended = () => {
    if (step === 1) {
      setBudgetManwon("0");
      setStep(2);
      return;
    }
    if (step === 2) {
      setAvailableHoursPerWeek("10");
      void startProject(budget, 10);
    }
  };

  const goBack = () => {
    if (busy) return;
    if (step === 0) onBack();
    else setStep((step - 1) as 0 | 1);
  };

  const stepCopy = [
    { label: "아이디어", title: "어떤 사업을\n하고 싶으세요?", description: "완벽하게 정리하지 않아도 괜찮아요. 떠오른 생각 그대로 적어주세요." },
    { label: "예산", title: "얼마로\n시작할까요?", description: "지금 준비된 금액을 알려주세요. 예산이 아직 없다면 0원으로 시작해도 됩니다." },
    { label: "시간", title: "일주일에 얼마나\n할 수 있나요?", description: "현실적으로 꾸준히 사용할 수 있는 시간을 선택해주세요." },
  ][step];

  return (
    <main className="conversation-page direct-planning-page">
      <Header onHome={onBack} />
      <section className="direct-planning-shell">
        <div className="direct-step-progress" aria-label={`전체 3단계 중 ${step + 1}단계`}>
          <span>{step + 1} / 3</span>
          <div>{[0, 1, 2].map((index) => <i key={index} className={index <= step ? "active" : ""} />)}</div>
        </div>
        <header>
          <span>{stepCopy.label}</span>
          <h1>{stepCopy.title.split("\n").map((line, index) => <Fragment key={line}>{index > 0 && <br />}{line}</Fragment>)}</h1>
          <p>{stepCopy.description}</p>
        </header>
        <form onSubmit={(event) => event.preventDefault()} data-testid="direct-planning-form">
          <div className="direct-step-panel" key={step}>
            {step === 0 && <label className="direct-idea-field">
              <span>하고 싶은 사업</span>
              <textarea
                autoFocus
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="예: 반려동물 사진으로 달력을 만들어 판매하고 싶어요."
                minLength={5}
                maxLength={1000}
                required
              />
              <small>{idea.trim().length < 5 ? `${5 - idea.trim().length}자만 더 적어주세요` : "좋아요. 이 생각을 바탕으로 구체화할게요."}</small>
            </label>}
            {step === 1 && <div className="direct-single-number">
              <div className="direct-quick-options" aria-label="예산 빠른 선택">
                {[0, 100, 300, 1000].map((amount) => <button type="button" className={budgetManwon === String(amount) ? "active" : ""} key={amount} onClick={() => setBudgetManwon(String(amount))}>{amount === 0 ? "0원" : `${amount.toLocaleString("ko-KR")}만원`}</button>)}
              </div>
              <label><span>직접 입력</span><div><input autoFocus aria-label="시작 예산" type="number" inputMode="numeric" min="0" max="1000000" step="1" value={budgetManwon} onChange={(event) => setBudgetManwon(event.target.value)} placeholder="0" required /><em>만원</em></div><small>사업 준비에 실제로 사용할 수 있는 금액을 입력하세요.</small></label>
            </div>}
            {step === 2 && <div className="direct-single-number">
              <div className="direct-quick-options" aria-label="시간 빠른 선택">
                {[5, 10, 20, 40].map((amount) => <button type="button" className={availableHoursPerWeek === String(amount) ? "active" : ""} key={amount} onClick={() => setAvailableHoursPerWeek(String(amount))}>주 {amount}시간</button>)}
              </div>
              <label><span>직접 입력</span><div><input autoFocus aria-label="주당 사용할 시간" type="number" inputMode="numeric" min="1" max="100" step="1" value={availableHoursPerWeek} onChange={(event) => setAvailableHoursPerWeek(event.target.value)} placeholder="10" required /><em>시간</em></div><small>평일과 주말을 합친 일주일 기준입니다.</small></label>
            </div>}
          </div>
          {error && <p className="direct-plan-error" role="alert">{error}</p>}
        </form>
      </section>
      <GuidedActionBar
        onBack={goBack}
        onUnknown={step === 0 ? undefined : useRecommended}
        onNext={() => void advance()}
        nextDisabled={!canContinue}
        busy={busy}
        nextLabel={busy ? "프로젝트 만드는 중" : step < 2 ? "다음" : "기획 시작"}
      />
    </main>
  );
}

const conversationPrompts = [
  {
    label: "경험",
    question: "최근 몇 년 동안 가장 몰입하거나 뿌듯했던 일은 무엇인가요?",
    help: "직장, 취미, 가족을 도운 일 모두 좋아요. 무엇을 했고 왜 좋았는지 들려주세요.",
    placeholder: "예: 친구의 작은 카페 메뉴를 정리해줬는데, 복잡했던 선택지가 명확해지고 실제 주문이 늘어나는 과정이 재미있었어요.",
  },
  {
    label: "관심 문제",
    question: "요즘 자꾸 눈에 들어오는 불편이나 변화가 있나요?",
    help: "아직 해결책을 몰라도 괜찮아요. 누구의 어떤 상황이 신경 쓰이는지 적어주세요.",
    placeholder: "예: 부모님이 병원과 약국에서 들은 내용을 자주 잊는데 가족이 매번 확인하기 어려운 점이 마음에 걸려요.",
  },
  {
    label: "실행 방식",
    question: "사람들과 일할 때 어떤 역할이 가장 자연스러운가요?",
    help: "말하고 설득하기, 분석하기, 직접 만들기, 정리하고 운영하기 등 실제 행동을 적어주세요.",
    placeholder: "예: 새로운 아이디어를 내는 것보다 자료를 정리하고 일정과 역할을 나눠 끝까지 운영하는 일을 잘해요.",
  },
  {
    label: "현실 조건",
    question: "사업을 시작할 때 피하고 싶은 일이나 운영 방식은 무엇인가요?",
    help: "예산과 시간은 아래 숫자로 정확히 입력합니다. 여기에는 재고, 영업, 온라인·오프라인 선호를 적어주세요.",
    placeholder: "예: 재고가 많은 사업과 반복적인 전화 영업은 피하고 온라인 중심으로 시작하고 싶어요.",
  },
];

const minimumConversationResponseLength = 5;

function ConversationDiscovery({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: (inference: NarrativeInference) => void;
}) {
  const initialDraft = useMemo(readConversationDraft, []);
  const [step, setStep] = useState(initialDraft.step);
  const [responses, setResponses] = useState<string[]>(initialDraft.responses);
  const [budgetManwon, setBudgetManwon] = useState(initialDraft.budgetManwon);
  const [availableHoursPerWeek, setAvailableHoursPerWeek] = useState(initialDraft.availableHoursPerWeek);
  const [review, setReview] = useState<NarrativeInference | null>(null);
  const totalSteps = conversationPrompts.length + 2;
  const textStep = step < conversationPrompts.length;
  const budgetStep = step === conversationPrompts.length;
  const prompt = conversationPrompts[Math.min(step, conversationPrompts.length - 1)];
  const responseLength = textStep ? responses[step].trim().length : 0;
  const budget = Number(budgetManwon);
  const hours = Number(availableHoursPerWeek);
  const hasValidBudget = budgetManwon !== "" && Number.isFinite(budget) && budget >= 0 && budget <= 1_000_000;
  const hasValidHours = availableHoursPerWeek !== "" && Number.isFinite(hours) && hours >= 1 && hours <= 100;
  const canContinue = textStep ? responseLength >= minimumConversationResponseLength : budgetStep ? hasValidBudget : hasValidHours;
  const remainingCharacters = Math.max(minimumConversationResponseLength - responseLength, 0);
  const update = (value: string) => setResponses((current) => current.map((response, index) => index === step ? value : response));

  const next = () => {
    if (step < totalSteps - 1) setStep((current) => current + 1);
    else setReview(inferProfileFromNarrative(responses, {
      budgetWon: Math.round(budget * 10_000),
      availableHoursPerWeek: Math.round(hours),
    }));
  };

  const skip = () => {
    if (textStep) {
      setResponses((current) => current.map((response, index) => index === step ? "아직 잘 모르겠어요." : response));
      setStep((current) => current + 1);
      return;
    }
    if (budgetStep) {
      setBudgetManwon("0");
      setStep((current) => current + 1);
      return;
    }
    setAvailableHoursPerWeek("10");
    setReview(inferProfileFromNarrative(responses, {
      budgetWon: Math.round((hasValidBudget ? budget : 0) * 10_000),
      availableHoursPerWeek: 10,
    }));
  };

  useEffect(() => {
    window.localStorage.setItem("venture-conversation-draft", JSON.stringify({ step, responses, budgetManwon, availableHoursPerWeek }));
  }, [availableHoursPerWeek, budgetManwon, step, responses]);

  const finish = () => {
    if (!review) return;
    window.localStorage.removeItem("venture-conversation-draft");
    onComplete(review);
  };

  if (review) {
    return (
      <main className="conversation-page">
        <Header onHome={onBack} />
        <section className="understanding-review">
          <button className="start-back" onClick={() => setReview(null)}><ArrowLeft /> 답변 수정</button>
          <div className="review-heading"><h1>입력한 내용을 확인하세요</h1><p>내용이 맞으면 바로 추천 결과로 이동할 수 있어요.</p></div>
          <div className="understanding-card">
            <div className="understanding-grid">
              <div><small>강점</small><div>{review.signals.slice(0, 3).map((signal) => <span key={signal}>{signal}</span>)}</div></div>
              <div><small>일하는 방식</small><strong>{review.preferredMode}</strong></div>
              <div><small>시작 예산</small><strong>{review.budget}</strong></div>
              <div><small>사용할 수 있는 시간</small><strong>{review.availableTime}</strong></div>
            </div>
          </div>
          <div className="review-actions"><button onClick={() => setReview(null)}>수정하기</button><PrimaryButton onClick={finish}>추천 결과 보기 <ArrowRight /></PrimaryButton></div>
        </section>
      </main>
    );
  }

  return (
    <main className="conversation-page">
      <Header onHome={onBack} />
      <div className="assessment-progress"><span style={{ width: `${((step + 1) / totalSteps) * 100}%` }} /></div>
      <section className="conversation-content">
        <div className="guided-step-count"><span>{step + 1} / {totalSteps}</span></div>
        <div className="conversation-bubble"><span>{textStep ? <Sparkles /> : budgetStep ? <CircleDollarSign /> : <CalendarDays />}</span><div><small>{textStep ? prompt.label : budgetStep ? "시작 예산" : "사용할 시간"}</small><h1>{textStep ? prompt.question : budgetStep ? "얼마로 시작할까요?" : "일주일에 몇 시간을 쓸 수 있나요?"}</h1><p>{textStep ? prompt.help : budgetStep ? "모르면 0원으로 시작해도 괜찮아요." : "모르면 주 10시간을 기준으로 추천할게요."}</p></div></div>
        <div className="narrative-input">
          {textStep ? <textarea
            autoFocus
            value={responses[step]}
            onChange={(event) => update(event.target.value)}
            placeholder={prompt.placeholder}
            aria-describedby="conversation-input-hint"
            maxLength={1000}
          /> : <div className="planning-number-fields single"><label><span>{budgetStep ? "시작 예산" : "주당 사용할 시간"}</span><div><input autoFocus aria-label={budgetStep ? "대화 시작 예산" : "대화 주당 사용할 시간"} type="number" inputMode="numeric" min={budgetStep ? "0" : "1"} max={budgetStep ? "1000000" : "100"} step="1" value={budgetStep ? budgetManwon : availableHoursPerWeek} onChange={(event) => budgetStep ? setBudgetManwon(event.target.value) : setAvailableHoursPerWeek(event.target.value)} required /><em>{budgetStep ? "만원" : "시간"}</em></div></label></div>}
          <div className="narrative-input-meta" id="conversation-input-hint" aria-live="polite">
            <span className={canContinue ? "ready" : ""}>{canContinue ? "좋아요. 아래 다음 버튼을 눌러주세요." : textStep && remainingCharacters ? `${remainingCharacters}자만 더 적어주세요` : "숫자를 입력하거나 모르겠음을 눌러주세요."}</span>
            {textStep && <span>{responses[step].length} / 1,000</span>}
          </div>
        </div>
      </section>
      <GuidedActionBar onBack={() => step ? setStep(step - 1) : onBack()} onUnknown={skip} onNext={next} nextDisabled={!canContinue} nextLabel={step === totalSteps - 1 ? "입력 내용 확인" : "다음"} />
    </main>
  );
}

function Assessment({
  answers,
  setAnswers,
  onExit,
  onComplete,
}: {
  answers: AssessmentAnswers;
  setAnswers: (answers: AssessmentAnswers) => void;
  onExit: () => void;
  onComplete: (answers: AssessmentAnswers, constraints: PlanningConstraints) => void;
}) {
  const [step, setStep] = useState(Math.min(Object.keys(answers).length, coreQuestions.length - 1));
  const [showConstraints, setShowConstraints] = useState(false);
  const [constraintStep, setConstraintStep] = useState<0 | 1>(0);
  const [budgetManwon, setBudgetManwon] = useState("");
  const [availableHoursPerWeek, setAvailableHoursPerWeek] = useState("");
  const question = coreQuestions[step];
  const selected = answers[question.id];
  const budget = Number(budgetManwon);
  const hours = Number(availableHoursPerWeek);
  const budgetReady = budgetManwon !== "" && Number.isFinite(budget) && budget >= 0 && budget <= 1_000_000;
  const hoursReady = availableHoursPerWeek !== "" && Number.isFinite(hours) && hours >= 1 && hours <= 100;

  const choose = (optionId: string) => {
    setAnswers({ ...answers, [question.id]: optionId });
  };

  const nextQuestion = () => {
    if (!selected) return;
    if (step === coreQuestions.length - 1) {
      setConstraintStep(0);
      setShowConstraints(true);
    } else setStep((current) => current + 1);
  };

  const skipQuestion = () => {
    const next = { ...answers };
    delete next[question.id];
    setAnswers(next);
    if (step === coreQuestions.length - 1) {
      setConstraintStep(0);
      setShowConstraints(true);
    } else setStep((current) => current + 1);
  };

  const finishAssessment = (finalBudget: number, finalHours: number) => onComplete(answers, {
    budgetWon: Math.round(finalBudget * 10_000),
    availableHoursPerWeek: Math.round(finalHours),
    notes: "8개 질문 완료 후 사용자가 직접 입력한 실행 조건",
    source: "questionnaire",
  });

  if (showConstraints) {
    return (
      <main className="assessment-page">
        <Header onHome={onExit} />
        <div className="assessment-progress"><span style={{ width: `${((coreQuestions.length + constraintStep + 1) / (coreQuestions.length + 2)) * 100}%` }} /></div>
        <section className="assessment-content assessment-constraints">
          <div className="guided-step-count"><span>마지막 {constraintStep + 1} / 2</span></div>
          <div className="question-intro">
            <p>추천을 현실적인 범위로 맞출게요.</p>
            <h1>{constraintStep === 0 ? "시작 예산은 얼마인가요?" : "일주일에 몇 시간을 쓸 수 있나요?"}</h1>
          </div>
          <div className="questionnaire-number-fields single">
            {constraintStep === 0 ? <label><span>시작 예산</span><div><input autoFocus aria-label="질문 시작 예산" type="number" inputMode="numeric" min="0" max="1000000" value={budgetManwon} onChange={(event) => setBudgetManwon(event.target.value)} /><em>만원</em></div><small>아직 정하지 않았다면 ‘모르겠음’을 눌러도 됩니다.</small></label>
              : <label><span>주당 사용할 시간</span><div><input autoFocus aria-label="질문 주당 사용할 시간" type="number" inputMode="numeric" min="1" max="100" value={availableHoursPerWeek} onChange={(event) => setAvailableHoursPerWeek(event.target.value)} /><em>시간</em></div><small>모르면 주 10시간을 기준으로 추천합니다.</small></label>}
          </div>
        </section>
        <GuidedActionBar
          onBack={() => constraintStep === 0 ? setShowConstraints(false) : setConstraintStep(0)}
          onUnknown={() => {
            if (constraintStep === 0) { setBudgetManwon("0"); setConstraintStep(1); }
            else { setAvailableHoursPerWeek("10"); finishAssessment(budgetReady ? budget : 0, 10); }
          }}
          onNext={() => constraintStep === 0 ? setConstraintStep(1) : finishAssessment(budget, hours)}
          nextDisabled={constraintStep === 0 ? !budgetReady : !hoursReady}
          nextLabel={constraintStep === 0 ? "다음" : "결과 보기"}
        />
      </main>
    );
  }

  return (
    <main className="assessment-page">
      <Header onHome={onExit} />
      <div className="assessment-progress"><span style={{ width: `${((step + 1) / coreQuestions.length) * 100}%` }} /></div>
      <section className="assessment-content">
        <div className="guided-step-count"><span>{step + 1} / {coreQuestions.length}</span></div>
        <div className="question-intro">
          <p>{question.context}</p>
          <h1>{question.title}</h1>
        </div>
        <div className="choice-pair">
          {question.options.map((option, index) => (
            <button key={option.id} className={selected === option.id ? "selected" : ""} onClick={() => choose(option.id)}>
              <span className="choice-letter">{assessmentOptionIcons[option.id] ?? String.fromCharCode(65 + index)}</span>
              <h2>{option.title}</h2>
              <p>{option.description}</p>
              <i>{selected === option.id ? <Check /> : <ArrowRight />}</i>
            </button>
          ))}
          <b className="choice-or">또는</b>
        </div>
      </section>
      <GuidedActionBar
        onBack={() => step ? setStep(step - 1) : onExit()}
        onUnknown={skipQuestion}
        onNext={nextQuestion}
        nextDisabled={!selected}
      />
    </main>
  );
}

function ProfileResult({
  profile,
  onExplore,
  onRestart,
}: {
  profile: FounderProfile;
  onExplore: () => void;
  onRestart: () => void;
}) {
  const lead = profile.topFounder[0];
  const second = profile.topFounder[1];
  const leadInterpretation = founderInterpretations[lead];
  const secondInterpretation = founderInterpretations[second];
  return (
    <main className="profile-page">
      <Header onHome={onRestart} />
      <section className="profile-simple">
        <div className="profile-result-hero">
          <div><span className="complete-label"><Check /> 성향 찾기 완료</span><h1>당신은<br /><em>{leadInterpretation.title}</em>예요.</h1><p>{leadInterpretation.strength}</p><span className="profile-second-type">함께 나타난 성향 · {secondInterpretation.title}</span></div>
          <figure className={`founder-character character-${lead}`}><img src={founderCharacterImages[lead]} alt={`${leadInterpretation.title} 성향 캐릭터`} /><i /><i /></figure>
        </div>
        <div className="profile-strengths">
          {profile.topFounder.map((axis) => (
            <article key={axis}><CheckCircle2 /><span><small>나의 강점</small><strong>{founderLabels[axis]}</strong></span></article>
          ))}
        </div>
        <div className="profile-caution"><ShieldCheck /><span><small>시작할 때 주의할 점</small><strong>{leadInterpretation.watchout}</strong></span></div>
        <PrimaryButton onClick={onExplore}>내 사업 찾기 시작 <ArrowRight /></PrimaryButton>
        <button className="restart-text" onClick={onRestart}><RefreshCw /> 다시 답하기</button>
      </section>
    </main>
  );
}

function OpportunityCard({
  item,
  state,
  onOpen,
  onSave,
  onExclude,
}: {
  item: RankedOpportunity;
  state?: "saved" | "excluded";
  onOpen: () => void;
  onSave: () => void;
  onExclude: () => void;
}) {
  const founderCategory = founderLabels[item.founder[0] ?? "opportunity"];
  return (
    <article className={`opportunity-card ${item.color} ${state === "saved" ? "saved" : ""}`}>
      <div className="op-card-top">
        <div className="op-card-categories"><span>{item.sector}</span><span>{founderCategory}</span></div>
        {state === "saved" && <strong>저장됨</strong>}
      </div>
      <h3>{item.title}</h3>
      <p className="op-line">{item.oneLiner}</p>
      <div className="op-meta">
        <span><small>시작 비용</small><strong>{item.capital}</strong></span>
        <span><small>시험 기간</small><strong>{item.launchTime}</strong></span>
        <span><small>수익 방식</small><strong>{item.revenue}</strong></span>
      </div>
      <div className="op-actions">
        <button className={state === "saved" ? "active" : ""} onClick={onSave}>{state === "saved" ? "저장 취소" : "저장"}</button>
        <button onClick={onExclude}>관심 없음</button>
        <button className="op-start-preview" onClick={onOpen}>시작하기</button>
      </div>
    </article>
  );
}

function Explore({
  profile,
  setProfile,
  feedback,
  setFeedback,
  onHome,
  onStartOpportunity,
}: {
  profile: FounderProfile;
  setProfile: (profile: FounderProfile) => void;
  feedback: OpportunityFeedback;
  setFeedback: (feedback: OpportunityFeedback) => void;
  onHome: () => void;
  onStartOpportunity: (opportunity: RankedOpportunity) => Promise<void>;
}) {
  const [mode, setMode] = useState<"dna" | "manual">("dna");
  const [generationSeed, setGenerationSeed] = useState(120726);
  const [capital, setCapital] = useState<CapitalFilter>("전체");
  const [sector, setSector] = useState("");
  const [manual, setManual] = useState<ManualPreferences>({
    budget: "100만원 이하",
    time: "주말·저녁",
    channel: "제한 없음",
    customer: "제한 없음",
  });
  const [selected, setSelected] = useState<RankedOpportunity | null>(null);
  const [startingOpportunityId, setStartingOpportunityId] = useState("");
  const [startError, setStartError] = useState("");

  useEffect(() => {
    if (!selected) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelected(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      window.setTimeout(() => previousFocus?.focus(), 0);
    };
  }, [selected]);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setGenerationSeed(Date.now() % 100000000);
  }, []);
  const allRanked = useMemo(
    () =>
      rankOpportunities(
        profile,
        feedback,
        { capital },
        generationSeed,
        mode === "manual" ? manual : undefined,
      ),
    [profile, feedback, capital, generationSeed, mode, manual],
  );
  const availableSectors = useMemo(
    () => [...new Set(allRanked.map((item) => item.sector))],
    [allRanked],
  );
  const ranked = sector ? allRanked.filter((item) => item.sector === sector) : allRanked;
  const visible = showAll ? ranked : ranked.slice(0, 4);
  const regenerate = () => {
    setGenerationSeed((current) => current + 7919);
    setSector("");
    setShowAll(false);
    setFeedback({});
  };

  const react = (item: RankedOpportunity, action: "saved" | "excluded") => {
    const isUndo = feedback[item.id] === action;
    const next = { ...feedback };
    if (isUndo) delete next[item.id];
    else next[item.id] = action;
    setFeedback(next);
    let nextProfile = profile;
    const previous = feedback[item.id];
    if (previous) {
      nextProfile = applyPreference(
        nextProfile,
        { riasec: item.riasec, founder: item.founder },
        previous === "saved" ? -1 : 1,
      );
    }
    if (!isUndo) {
      nextProfile = applyPreference(
        nextProfile,
        { riasec: item.riasec, founder: item.founder },
        action === "saved" ? 1 : -1,
      );
    }
    setProfile(nextProfile);
  };

  const startOpportunity = async (opportunity: RankedOpportunity) => {
    if (startingOpportunityId) return;
    setStartingOpportunityId(opportunity.id);
    setStartError("");
    try {
      await onStartOpportunity(opportunity);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "프로젝트를 시작하지 못했습니다.");
      setStartingOpportunityId("");
    }
  };

  return (
    <main className="explore-page">
      <Header onHome={onHome} />
      <section className="explore-head">
        <div className="explore-head-copy">
          <span className="section-label">맞춤 추천</span>
          <h1>내게 맞는 사업을 골라보세요</h1>
          <p>관심 있는 사업을 저장하거나 자세히 살펴보세요.</p>
          <div className="explore-profile-tags" aria-label="나의 창업 성향">
            <span>나의 창업 성향</span>
            <strong>{founderInterpretations[profile.topFounder[0]].title}</strong>
          </div>
        </div>
        <div className="explore-head-actions">
          <div className="mode-tabs" aria-label="추천 방식">
            <button className={mode === "dna" ? "active" : ""} onClick={() => { setMode("dna"); setSector(""); }}>맞춤 추천</button>
            <button className={mode === "manual" ? "active" : ""} onClick={() => { setMode("manual"); setCapital("전체"); setSector(""); }}>조건 변경</button>
          </div>
          <button className="regenerate-button" onClick={regenerate}>추천 다시 받기</button>
        </div>
      </section>

      {mode === "manual" && (
        <section className="manual-finder">
          <div className="manual-fields">
            <label><span>시작 예산</span><select value={manual.budget} onChange={(event) => setManual({ ...manual, budget: event.target.value as ManualPreferences["budget"] })}><option>100만원 이하</option><option>100~1,000만원</option><option>1,000만원 이상</option><option>제한 없음</option></select></label>
            <label><span>투입 시간</span><select value={manual.time} onChange={(event) => setManual({ ...manual, time: event.target.value as ManualPreferences["time"] })}><option>주말·저녁</option><option>부업</option><option>전업</option><option>제한 없음</option></select></label>
            <label><span>운영 방식</span><select value={manual.channel} onChange={(event) => setManual({ ...manual, channel: event.target.value as ManualPreferences["channel"] })}><option>온라인</option><option>오프라인</option><option>혼합</option><option>제한 없음</option></select></label>
            <label><span>주요 고객</span><select value={manual.customer} onChange={(event) => setManual({ ...manual, customer: event.target.value as ManualPreferences["customer"] })}><option>개인</option><option>기업</option><option>공공·지역</option><option>제한 없음</option></select></label>
          </div>
        </section>
      )}

      <section className="explore-tools">
        {mode === "dna" ? (
          <label><select aria-label="시작 자본" value={capital} onChange={(event) => setCapital(event.target.value as CapitalFilter)}>{(["전체", "소액", "중간", "높음"] as CapitalFilter[]).map((value) => <option key={value} value={value}>{value === "전체" ? "모든 자본 규모" : `${value} 자본`}</option>)}</select></label>
        ) : null}
        <label><select aria-label="사업 분야" value={sector} onChange={(event) => setSector(event.target.value)}><option value="">모든 분야</option>{availableSectors.map((value) => <option key={value}>{value}</option>)}</select></label>
      </section>

      <section className="opportunity-grid">
        {visible.map((item) => (
          <div className="op-card-wrap" key={item.id}>
            <OpportunityCard item={item} state={feedback[item.id]} onOpen={() => setSelected(item)} onSave={() => react(item, "saved")} onExclude={() => react(item, "excluded")} />
          </div>
        ))}
      </section>
      {!ranked.length && <div className="empty-results"><h3>이 조건의 기회를 모두 살펴봤어요</h3><p>필터를 넓히거나 제외한 아이디어를 다시 불러와보세요.</p><button onClick={() => { setCapital("전체"); setSector(""); setFeedback({}); }}>전체 기회 다시 보기</button></div>}
      {ranked.length > 4 && <button className="more-opportunities" onClick={() => setShowAll(!showAll)}>{showAll ? "추천 접기" : `추천 ${ranked.length - 4}개 더 보기`}</button>}

      {selected && (
        <div className="detail-backdrop" onClick={() => setSelected(null)}>
          <article className="op-detail" role="dialog" aria-modal="true" aria-labelledby="opportunity-detail-title" onClick={(event) => event.stopPropagation()}>
            <button autoFocus className="detail-close" aria-label="상세 팝업 닫기" onClick={() => setSelected(null)}><X /></button>
            <div className="op-detail-scroll">
              <span className="detail-sector">{selected.sector} · {selected.model}</span>
              <h2 id="opportunity-detail-title">{selected.title}</h2>
              <p className="detail-lead">{selected.oneLiner}</p>
              <section className="first-test"><FlaskConical /><div><small>돈을 쓰기 전 첫 검증</small><strong>{selected.firstTest}</strong></div></section>
              <section><h3>필요한 준비</h3><div className="skill-tags">{selected.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></section>
              <section className="risk-box"><ShieldCheck /><div><small>먼저 확인할 위험</small><p>{selected.risk}</p><em>{selected.caution}</em></div></section>
            </div>
            <div className="op-detail-footer">
              <div className="detail-actions detail-actions-stacked">
                <button onClick={() => { react(selected, "excluded"); setSelected(null); }}><ThumbsDown /> 내 방향과 달라요</button>
                <button className={feedback[selected.id] === "saved" ? "saved" : ""} onClick={() => react(selected, "saved")}><Heart /> {feedback[selected.id] === "saved" ? "저장했어요" : "기회 저장"}</button>
                <button className="start-opportunity" disabled={Boolean(startingOpportunityId)} onClick={() => void startOpportunity(selected)}><Rocket /> {startingOpportunityId === selected.id ? "프로젝트 준비 중..." : "이 사업으로 시작하기"} <ArrowRight /></button>
                {startError && <p className="op-start-error" role="alert">{startError}</p>}
              </div>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}

function Checkout({
  opportunity,
  founderProfile,
  onBack,
  onSuccess,
}: {
  opportunity: RankedOpportunity;
  founderProfile: FounderProfile;
  onBack: () => void;
  onSuccess: (project: ProjectRecord) => Promise<void>;
}) {
  const [agreed, setAgreed] = useState(false);
  const [agreementItems, setAgreementItems] = useState({ service: false, privacy: false, refund: false, aiLimitations: false, digitalSupply: false });
  const [launchReadiness, setLaunchReadiness] = useState<{ paymentAllowed: boolean; missing: string[] } | null>(null);
  const [accountReady, setAccountReady] = useState<boolean | null>(null);
  const [method, setMethod] = useState("card");
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  useEffect(() => {
    void Promise.all([
      fetch("/api/platform/readiness", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([readinessPayload, accountPayload]) => {
      setLaunchReadiness(readinessPayload.readiness);
      setAccountReady(Boolean(accountPayload.authenticated));
    }).catch(() => {
      setLaunchReadiness({ paymentAllowed: false, missing: ["출시 준비 상태 확인"] });
      setAccountReady(false);
    });
  }, []);

  useEffect(() => {
    setAgreed(Object.values(agreementItems).every(Boolean));
  }, [agreementItems]);

  const pay = async () => {
    if (!agreed || paying) return;
    setPaying(true);
    setPaymentError("");
    try {
      const orderResponse = await fetch("/api/payments/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunity,
          founderProfile,
          method: method === "toss" ? "TOSSPAY" : method === "transfer" ? "TRANSFER" : "CARD",
          terms: {
            ...agreementItems,
          },
        }),
      });
      const orderPayload = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(orderPayload.error?.message ?? "결제 주문을 만들지 못했습니다.");
      window.localStorage.setItem("venture-pending-order", JSON.stringify(orderPayload.order));
      if (orderPayload.paymentMode === "development_test") {
        const testResponse = await fetch("/api/payments/test-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: orderPayload.order.orderId }),
        });
        const testPayload = await testResponse.json();
        if (!testResponse.ok) throw new Error(testPayload.error?.message ?? "테스트 결제를 완료하지 못했습니다.");
        window.localStorage.removeItem("venture-pending-order");
        await onSuccess(testPayload.project);
        return;
      }
      if (!orderPayload.clientKey) throw new Error("결제 클라이언트 키가 없습니다.");
      const { loadTossPayments, ANONYMOUS } = await import("@tosspayments/tosspayments-sdk");
      const payment = (await loadTossPayments(orderPayload.clientKey)).payment({ customerKey: ANONYMOUS });
      const common = {
        amount: { currency: "KRW" as const, value: orderPayload.order.amount },
        orderId: orderPayload.order.orderId,
        orderName: orderPayload.order.orderName,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
      };
      if (method === "transfer") {
        await payment.requestPayment({
          ...common,
          method: "TRANSFER",
          transfer: { cashReceipt: { type: "소득공제" }, useEscrow: false },
        });
      } else {
        await payment.requestPayment({
          ...common,
          method: "CARD",
          card: {
            useEscrow: false,
            flowMode: method === "toss" ? "DIRECT" : "DEFAULT",
            easyPay: method === "toss" ? "TOSSPAY" : undefined,
            useCardPoint: false,
            useAppCardOnly: false,
          },
        });
      }
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "프로젝트 생성에 실패했습니다.");
      setPaying(false);
    }
  };

  return (
    <main className="checkout-page">
      <Header onHome={onBack} />
      <section className="checkout-shell">
        <button className="start-back" onClick={onBack}><ArrowLeft /> 기회 상세로 돌아가기</button>
        <div className="checkout-heading"><span className="section-label">사업 실행 시작</span><h1>아이디어를 실행 가능한<br />사업으로 만들어볼게요.</h1><p>결제가 확인되면 선택한 기회를 기준으로 21일 프로젝트가 즉시 생성됩니다.</p></div>
        <div className="checkout-layout">
          <div className="checkout-form">
            <section>
              <div className="checkout-section-title"><span>01</span><div><h2>선택한 사업 기회</h2><p>이 기회를 중심으로 프로젝트 결과물이 맞춤 구성됩니다.</p></div></div>
              <div className="chosen-opportunity"><span>{opportunity.sector}</span><h3>{opportunity.title}</h3><p>{opportunity.oneLiner}</p><div><em>적합도 {opportunity.match}%</em><em>{opportunity.model}</em><em>예상 검증 {opportunity.launchTime}</em></div></div>
            </section>
            <section>
              <div className="checkout-section-title"><span>02</span><div><h2>결제 수단</h2><p>토스페이먼츠 결제창에서 카드·간편결제·계좌이체를 안전하게 처리합니다.</p></div></div>
              <div className="payment-methods">
                <button className={method === "card" ? "active" : ""} onClick={() => setMethod("card")}><CreditCard /><span><strong>신용·체크카드</strong><small>모든 국내 카드</small></span><i>{method === "card" && <Check />}</i></button>
                <button className={method === "toss" ? "active" : ""} onClick={() => setMethod("toss")}><span className="toss-symbol">toss</span><span><strong>토스페이</strong><small>간편하게 결제</small></span><i>{method === "toss" && <Check />}</i></button>
                <button className={method === "transfer" ? "active" : ""} onClick={() => setMethod("transfer")}><Building2 /><span><strong>계좌이체</strong><small>현금영수증 가능</small></span><i>{method === "transfer" && <Check />}</i></button>
              </div>
            </section>
            <section className="checkout-agreements">
              <label className="agreement agreement-all"><input type="checkbox" checked={agreed} onChange={(event) => setAgreementItems({ service: event.target.checked, privacy: event.target.checked, refund: event.target.checked, aiLimitations: event.target.checked, digitalSupply: event.target.checked })} /><span><strong>필수 항목에 모두 동의합니다.</strong><small>각 문서를 열어 실제 제공 조건을 확인할 수 있습니다.</small></span></label>
              <div>
                <label><input type="checkbox" checked={agreementItems.service} onChange={(event) => setAgreementItems((current) => ({ ...current, service: event.target.checked }))} /><span><a href="/terms" target="_blank" rel="noreferrer">이용약관</a> 동의</span></label>
                <label><input type="checkbox" checked={agreementItems.privacy} onChange={(event) => setAgreementItems((current) => ({ ...current, privacy: event.target.checked }))} /><span><a href="/privacy" target="_blank" rel="noreferrer">개인정보처리방침</a> 동의</span></label>
                <label><input type="checkbox" checked={agreementItems.aiLimitations} onChange={(event) => setAgreementItems((current) => ({ ...current, aiLimitations: event.target.checked }))} /><span><a href="/ai-notice" target="_blank" rel="noreferrer">인공지능·국외 처리 안내</a> 확인</span></label>
                <label><input type="checkbox" checked={agreementItems.refund} onChange={(event) => setAgreementItems((current) => ({ ...current, refund: event.target.checked }))} /><span><a href="/refund" target="_blank" rel="noreferrer">취소·환불 기준</a> 동의</span></label>
                <label><input type="checkbox" checked={agreementItems.digitalSupply} onChange={(event) => setAgreementItems((current) => ({ ...current, digitalSupply: event.target.checked }))} /><span>결제 직후 디지털 결과물 공급이 시작됨을 확인</span></label>
              </div>
            </section>
            {accountReady === false && <div className="checkout-blocked"><LockKeyhole /><p><strong>결제 전에 로그인이 필요합니다.</strong><a href="/account">로그인 또는 회원가입</a></p></div>}
            {launchReadiness && !launchReadiness.paymentAllowed && <div className="checkout-blocked"><ShieldCheck /><p><strong>아직 정식 결제를 준비하고 있습니다.</strong>{launchReadiness.missing.join(" · ")}</p></div>}
            <div className="checkout-security"><LockKeyhole /><p>카드·계좌 정보는 저장하지 않습니다. 서버가 주문금액과 결제사 승인 결과를 다시 대조한 뒤 프로젝트를 생성합니다.</p></div>
          </div>
          <aside className="order-summary">
            <span className="package-label">21일 창업 실행 과정</span>
            <h2>창업 실행 문서와 단계별 안내</h2>
            <div className="package-includes">
              {["인공지능 맞춤 시작 안내", "고객·시장 확인 보고서", "상품 구성과 가격 설계", "이름과 한 줄 소개 문구", "판매 페이지 제작", "첫 고객 확인 실행안"].map((item) => <span key={item}><CheckCircle2 /> {item}</span>)}
            </div>
            <div className="price-line"><span>전체 서비스 금액</span><strong>900,000원</strong></div>
            <div className="price-line"><span>부가세</span><strong>90,000원</strong></div>
            <div className="total-line"><span>총 결제금액</span><strong>990,000<small>원</small></strong></div>
            <button className="pay-button" disabled={!agreed || paying || accountReady !== true || launchReadiness?.paymentAllowed !== true} onClick={pay}>{paying ? <><span className="pay-spinner" /> 안전한 결제창 준비 중...</> : <>990,000원 결제하기 <ArrowRight /></>}</button>
            {paymentError && <div className="payment-error"><CircleHelp /> {paymentError}<button onClick={pay}>다시 시도</button></div>}
            <p><ShieldCheck /> 서버 금액 검증 · 중복 결제 방지</p>
          </aside>
        </div>
      </section>
    </main>
  );
}

const launchStages = [
  {
    name: "시작 준비",
    period: "1일차",
    title: "프로젝트의 기준을 맞춰요",
    description: "결제 정보와 선택한 기회를 확인하고, 21일 동안 함께 만들 결과물의 우선순위를 정합니다.",
    tasks: ["AI가 만든 사업 실행 요약서 확인"],
    output: "사업 실행 요약서",
  },
  {
    name: "고객 진단",
    period: "2~4일차",
    title: "누구의 어떤 문제인지 선명하게 만들어요",
    description: "가정으로 남아 있는 고객 문제를 인터뷰 질문과 시장 자료로 검증합니다.",
    tasks: ["AI가 만든 고객·시장 초안 확인"],
    output: "고객·시장 진단서",
  },
  {
    name: "상품·가격",
    period: "5~8일차",
    title: "실제로 살 수 있는 상품으로 바꿔요",
    description: "고객의 문제를 가장 작게 해결하는 첫 상품과 가격, 손익 기준을 설계합니다.",
    tasks: ["AI가 제안한 상품·가격 초안 확인"],
    output: "상품 구성표·손익 시트",
  },
  {
    name: "이름·소개 문구",
    period: "9~12일차",
    title: "고객이 이해할 언어를 만들어요",
    description: "이름보다 먼저 고객에게 할 약속과 다른 점을 정하고 한 줄 소개 문구로 발전시킵니다.",
    tasks: ["AI가 제안한 이름·소개 문구 확인"],
    output: "이름·소개 문구 모음",
  },
  {
    name: "판매 페이지",
    period: "13~17일차",
    title: "첫 고객을 만날 페이지를 열어요",
    description: "문제, 해결책, 가격, 자주 묻는 질문과 문의 행동이 연결된 휴대전화용 판매 페이지를 제작합니다.",
    tasks: ["AI가 만든 판매 페이지 초안 확인"],
    output: "공개 가능한 판매 페이지",
  },
  {
    name: "첫 공개",
    period: "18~21일차",
    title: "작게 공개하고 실제 반응을 확인해요",
    description: "큰 광고비를 쓰기 전에 잠재 고객에게 제안하고 다음 개선점을 수집합니다.",
    tasks: ["AI가 만든 첫 공개 계획 확인"],
    output: "첫 공개 문서·30일 실행안",
  },
];

const automaticDraftItems = [
  ["사업 방향", "예산·시간 반영", "21일 실행 범위"],
  ["첫 고객 가설", "고객 문제", "인터뷰 질문"],
  ["상품 3가지", "권장 가격", "손익분기점"],
  ["이름 후보", "한 줄 소개", "사용 금지 표현"],
  ["첫 화면 문구", "상품·가격", "문의·필수 안내"],
  ["첫 연락 문구", "고객 만날 경로", "30일 일정"],
] as const;

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
  return {
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
}

type DraftRefinementInput = {
  brandName: string;
  customer: string;
  oneLiner: string;
  priceWon: number;
  note: string;
};

function InstantDraftBuilder({
  opportunity,
  step,
  message,
  mode,
  error,
  onRetry,
  onHome,
}: {
  opportunity: RankedOpportunity;
  step: number;
  message: string;
  mode: "initial" | "refine";
  error: string;
  onRetry: () => void;
  onHome: () => void;
}) {
  const progress = Math.max(4, Math.min(100, Math.round((step / 10) * 100)));
  const outputs = ["사업 방향", "상품·가격", "사업계획서", "판매 페이지", "실행 자료"];
  return (
    <main className="instant-draft-page">
      <Header onHome={onHome} />
      <section className="instant-draft-card">
        <div className="instant-draft-mark">{error ? <CircleHelp /> : <LoaderCircle className="spin" />}</div>
        <small>{mode === "refine" ? "전체 초안 수정" : "맞춤 사업 초안 자동 생성"}</small>
        <h1>{error ? "초안을 만드는 중 잠시 멈췄어요" : mode === "refine" ? "수정 내용을 모든 문서에 반영하고 있어요" : "아이디어만으로 전체 초안을 만들고 있어요"}</h1>
        <p>{error || message || `${opportunity.title}에 맞는 결과물을 준비하고 있습니다.`}</p>
        {!error && <div className="instant-draft-progress"><i><b style={{ width: `${progress}%` }} /></i><span>{progress}%</span></div>}
        <div className="instant-draft-output-list">
          {outputs.map((output, index) => <span key={output} className={step >= (index + 1) * 2 ? "done" : ""}>{step >= (index + 1) * 2 ? <Check /> : index + 1}<strong>{output}</strong></span>)}
        </div>
        {error ? <button className="instant-draft-retry" onClick={onRetry}><RefreshCw /> 다시 이어서 만들기</button> : <div className="instant-draft-note"><Sparkles /><span><strong>추가 입력은 필요하지 않습니다</strong><small>모르는 값은 합리적인 가정으로 채우고 결과 화면에서 나중에 바꿀 수 있어요.</small></span></div>}
      </section>
    </main>
  );
}

function DraftRefinementPanel({
  initialBrandName,
  initialCustomer,
  initialOneLiner,
  initialPrice,
  onRefine,
}: {
  initialBrandName: string;
  initialCustomer: string;
  initialOneLiner: string;
  initialPrice: number;
  onRefine: (input: DraftRefinementInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [brandName, setBrandName] = useState(initialBrandName);
  const [customer, setCustomer] = useState(initialCustomer);
  const [oneLiner, setOneLiner] = useState(initialOneLiner);
  const [priceWon, setPriceWon] = useState(initialPrice);
  const [note, setNote] = useState("");
  const valid = brandName.trim().length >= 2 && customer.trim().length >= 2 && oneLiner.trim().length >= 10 && priceWon >= 1000;

  return (
    <section className={`draft-refinement-panel ${open ? "open" : ""}`}>
      <header>
        <div><span><Sparkles /></span><div><small>초안은 이미 완성됐어요</small><strong>필요한 부분만 간단히 바꾸세요</strong><p>수정하지 않아도 모든 결과물을 바로 볼 수 있습니다.</p></div></div>
        <button onClick={() => setOpen((current) => !current)}>{open ? "닫기" : "기본정보 수정"} <ChevronDown /></button>
      </header>
      {open && <div className="draft-refinement-form">
        <label><span>사업 이름</span><input value={brandName} maxLength={100} onChange={(event) => setBrandName(event.target.value)} /></label>
        <label><span>주요 고객</span><input value={customer} maxLength={300} onChange={(event) => setCustomer(event.target.value)} /></label>
        <label className="wide"><span>한 줄 소개</span><textarea value={oneLiner} maxLength={1000} rows={3} onChange={(event) => setOneLiner(event.target.value)} /></label>
        <label><span>첫 상품 가격</span><input type="number" min="1000" step="1000" value={priceWon} onChange={(event) => setPriceWon(Math.max(0, Number(event.target.value) || 0))} /><small>{priceWon.toLocaleString("ko-KR")}원</small></label>
        <label className="wide"><span>추가로 바꾸고 싶은 점 <em>선택</em></span><textarea value={note} maxLength={1000} rows={3} onChange={(event) => setNote(event.target.value)} placeholder="예: 직장인 고객에게 더 친근한 말투로 바꿔주세요." /></label>
        <div className="draft-refinement-actions"><p><CheckCircle2 /> 입력한 내용은 사업계획서, 판매 페이지 원고와 전체 문서에 함께 반영됩니다.</p><button disabled={!valid} onClick={() => void onRefine({ brandName: brandName.trim(), customer: customer.trim(), oneLiner: oneLiner.trim(), priceWon, note: note.trim() })}><RefreshCw /> 전체 초안 다시 만들기</button></div>
      </div>}
    </section>
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
  onRefine,
}: {
  opportunity: RankedOpportunity;
  price: number;
  brandChoice: string;
  serverProject: ProjectRecord | null;
  demo?: boolean;
  onHome: () => void;
  onStart?: () => void;
  onRefine?: (input: DraftRefinementInput) => Promise<void>;
}) {
  const savedStageBrand = typeof serverProject?.stages[3]?.inputs.selectedName === "string"
    ? serverProject.stages[3].inputs.selectedName
    : "";
  const missionBrand = serverProject?.launchMissionWorkspace?.brand.brandName ?? "";
  const resolvedBrandName = brandChoice || missionBrand || savedStageBrand || opportunity.title;
  const approvedMarketArtifact = serverProject?.stages[1]?.artifacts.find((artifact) => artifact.id === serverProject.stages[1].approvedArtifactId);
  const artifactCustomer = typeof approvedMarketArtifact?.content.primaryCustomer === "string" ? approvedMarketArtifact.content.primaryCustomer : "";
  const resolvedCustomer = artifactCustomer || deriveAutoDraftContext(opportunity).customer;
  const approvedArtifacts = serverProject?.stages
    .map((stage) => stage.artifacts.find((artifact) => artifact.id === stage.approvedArtifactId))
    .filter((artifact): artifact is ArtifactRecord => Boolean(artifact)) ?? [];
  const aiGeneratedCount = approvedArtifacts.filter((artifact) => artifact.explanations.some((item) => item.includes("생성 방식: OpenAI API"))).length;
  const generationModel = approvedArtifacts
    .flatMap((artifact) => artifact.explanations)
    .map((item) => item.match(/생성 방식: OpenAI API · (.+)$/)?.[1])
    .find((model): model is string => Boolean(model));
  const generationMode = demo ? "sample" : aiGeneratedCount === 6 ? "ai" : aiGeneratedCount > 0 ? "mixed" : "fallback";
  const generationTitle = generationMode === "ai"
    ? `OpenAI API 핵심 초안 6단계 고도화 완료${generationModel ? ` · ${generationModel}` : ""}`
    : generationMode === "mixed"
      ? `OpenAI API ${aiGeneratedCount}/6단계 적용`
      : generationMode === "sample"
        ? "화면 확인용 가상 사례"
        : "규칙 기반 안전 초안 · OpenAI API 미적용";
  const generationDescription = generationMode === "ai"
    ? "사업 전용 생성 규칙과 사실성 검수를 통과했습니다. 계획서·발표자료는 승인 초안과 저장된 계산을 다시 조립하며, 출처·인허가는 연결된 원문을 기준으로 최종 확인하세요."
    : generationMode === "mixed"
      ? "일부 단계만 OpenAI로 생성되었습니다. 나머지는 사용자 입력과 저장된 계산만 사용하는 안전 초안입니다."
      : generationMode === "sample"
        ? "실제 사업 판단에 사용할 수 없는 화면 구성 예시입니다."
        : "허구의 실적과 시장 수치를 만들지 않는 기본 초안입니다. AI 고도화가 적용된 결과로 오해하지 마세요.";
  const [landingPreview, setLandingPreview] = useState(false);
  const [fundingBreakdownOpen, setFundingBreakdownOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<"summary" | "business" | "market" | "landing" | "launch" | "documents">("summary");
  const [landingDraft, setLandingDraft] = useState<LandingDraft>(() =>
    createFinalLandingDraft(opportunity, resolvedBrandName, price, demo),
  );
  const [landingAction, setLandingAction] = useState<"idle" | "saving" | "saved" | "publishing">("idle");
  const [landingMessage, setLandingMessage] = useState("");
  const [landingSite, setLandingSite] = useState<LandingSiteRecord | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DeliveryItem | null>(null);
  const [documentDownload, setDocumentDownload] = useState("");
  const [documentMessage, setDocumentMessage] = useState("");
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
    } : null,
    [demo, serverProject],
  );
  const deliveryQuality = deliveryPack?.deliveryQuality;
  const paidAmount = serverProject?.packagePrice ?? 990000;
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
  const reportTabs = [
    { id: "summary" as const, label: "사업 요약", icon: FileText },
    { id: "business" as const, label: "상품·손익", icon: BarChart3 },
    { id: "market" as const, label: "시장 확인", icon: Users },
    { id: "landing" as const, label: "판매 페이지", icon: Layers3 },
    { id: "launch" as const, label: "실행 도우미", icon: CalendarDays },
    { id: "documents" as const, label: "최종 결과물", icon: PackageCheck },
  ];
  const activeReportTab = reportTabs.find((tab) => tab.id === activeReport) ?? reportTabs[0];
  const ActiveReportIcon = activeReportTab.icon;

  useEffect(() => {
    let cancelled = false;
    if (demo) {
      try {
        const saved = window.localStorage.getItem("venture-paid-report-landing-demo");
        if (saved) setLandingDraft(JSON.parse(saved) as LandingDraft);
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
    if (demo || resolvedBrandName === opportunity.title) return;
    setLandingDraft((current) => current.businessName === opportunity.title ? {
      ...current,
      businessName: resolvedBrandName,
      privacyController: resolvedBrandName,
    } : current);
  }, [demo, opportunity.title, resolvedBrandName]);

  useEffect(() => {
    if (!landingPreview && !documentPreview) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLandingPreview(false);
        setDocumentPreview(null);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [documentPreview, landingPreview]);

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
          body: JSON.stringify(landingDraft),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "판매 페이지를 저장하지 못했습니다.");
        let nextSite = payload.site as LandingSiteRecord;
        if (publish) {
          const publishResponse = await fetch(`/api/projects/${serverProject.id}/landing/publish`, { method: "POST" });
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
      body: JSON.stringify(next),
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

  const downloadDocuments = async (format: DownloadFormat, item?: DeliveryItem) => {
    if (!deliveryPack) return;
    const target = item ? [item] : deliveryPack.items;
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
      `- 상품: 21일 창업 실행 과정`,
      `- ${betaAccess ? "이용 금액" : "결제 금액"}: ${paidAmount.toLocaleString("ko-KR")}원`,
      `- ${betaAccess ? "이용 상태" : "결제 상태"}: ${betaAccess ? "베타 무료 이용" : demo ? "결제완료 예시" : serverProject?.paymentStatus === "paid" ? "토스 승인" : "개발 테스트 승인"}`,
      `- ${betaAccess ? "이용 번호" : "주문 번호"}: ${demo ? "VNT-20260713-1024" : serverProject?.id ?? "확인 필요"}`,
      `- 프로젝트: ${opportunity.title}`,
      "",
      betaAccess ? "> 베타 테스트 기간에 결제 없이 이용한 프로젝트입니다." : demo ? "> 이 영수증은 화면 확인용 예시이며 실제 거래 확인 자료가 아닙니다." : "> 실제 카드전표는 결제사 내역에서 확인하세요.",
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
      {demo && <section className="sample-preview-bar"><div><span><Eye /> 실제 제공 화면 예시 · 가상 사업 사례</span><strong>완료 후 사용자가 보는 화면과 같은 구조입니다.</strong></div>{onStart && <button onClick={onStart}>내 사업 무료로 시작하기 <ArrowRight /></button>}</section>}
      <div className={`delivery-ai-disclosure ${generationMode}`}><ShieldCheck /><p><strong>{generationTitle}</strong> {generationDescription}</p><a href="/ai-notice" target="_blank" rel="noreferrer">처리 안내 보기</a></div>
      <section className="delivery-content" id={demo ? "sample-result-details" : "delivery-result-details"}>
        <div className="delivery-main">
          <section className={`final-report-viewer ${activeReport === "launch" ? "mission-mode" : ""}`}>
            <header className="final-report-chrome">
              <div aria-hidden="true"><i /><i /><i /></div>
              <span><Sparkles /> {resolvedBrandName} 맞춤 사업 실행 보고서</span>
              <em><i /> {generationMode === "ai" ? "AI 고도화" : generationMode === "sample" ? "화면 예시" : "안전 초안"}</em>
            </header>
            <aside className="final-report-sidebar">
              <header><small>최종 결과</small><strong>{resolvedBrandName}</strong></header>
              <nav aria-label="최종 보고서 목차">
                {reportTabs.map((tab, index) => {
                  const Icon = tab.icon;
                  return <button key={tab.id} aria-label={tab.label} data-report-tab={tab.id} className={activeReport === tab.id ? "active" : ""} onClick={() => setActiveReport(tab.id)}><Icon /><span><b>{tab.label}</b><small>{tab.id === "launch" ? "선택 · 결과물과 별도" : `${index + 1}단계${tab.id === "documents" ? " · 최종" : ""}`}</small></span>{activeReport === tab.id && <Check />}</button>;
                })}
              </nav>
              <div className="final-report-sidebar-status"><span><CheckCircle2 /> 전체 초안 생성</span><strong>{deliveryPack?.items.length ?? 0}개</strong><small>지금 열고 내려받을 수 있어요</small></div>
            </aside>
            <div className="final-report-main">
              <header><div><span><ActiveReportIcon /> 맞춤 사업 실행 보고서</span><h2>{activeReportTab.label}</h2></div><em><i /> 준비됨</em></header>
              {activeReport === "summary" && !demo && onRefine && <DraftRefinementPanel initialBrandName={resolvedBrandName} initialCustomer={resolvedCustomer} initialOneLiner={opportunity.oneLiner} initialPrice={sellingPrice} onRefine={onRefine} />}
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
                <ol className="report-evidence-list"><li><span>01</span><div><strong>반복되는 응급 공백</strong><p>{demo ? "보호자 인터뷰 12명 중 8명이 최근 6개월 안에 급한 돌봄 요청 경험이 있다고 답한 예시입니다." : "저장된 고객 인터뷰와 시장 근거를 결과물에서 확인하세요."}</p></div></li><li><span>02</span><div><strong>현재 대안의 신뢰 문제</strong><p>지인 부탁과 공개 커뮤니티는 빠르지만 신원·책임 범위가 불명확하다는 가설을 우선 검증합니다.</p></div></li><li><span>03</span><div><strong>아직 확인할 것</strong><p>야간 추가요금, 사고 대응 책임, 생활권별 파트너 확보 비용은 실제 유료 연결에서 측정해야 합니다.</p></div></li></ol>
                <section className="market-source-panel"><header><ExternalLink /><div><small>문장에 사용한 자료</small><h4>출처와 확인 상태</h4></div><em>{marketSources.length}개</em></header>{marketSources.length > 0 ? <div className="market-source-list">{marketSources.map((source, index) => <article key={`${source.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{source.title}</strong><p>{source.note}</p><small>{source.source} · {source.date}</small></div><em>{source.status}</em>{source.url ? <a href={source.url} target="_blank" rel="noreferrer" aria-label={`${source.title} 원문 열기`}><ExternalLink /></a> : <i>내부 기록</i>}</article>)}</div> : <div className="market-source-empty"><CircleHelp /><p><strong>아직 저장된 출처가 없습니다.</strong> 위 문장은 가설이며, 시장 자료를 추가하기 전까지 확정 근거로 사용하지 않습니다.</p></div>}</section>
              </>}
      {activeReport === "landing" && <>
                <LandingQuickEditor
                  draft={landingDraft}
                  action={landingAction}
                  message={landingMessage}
                  published={demo || landingSite?.status === "published"}
                  publicPath={demo ? `/launch/${landingDraft.slug}` : landingSite ? `/launch/${landingSite.slug}` : ""}
                  demo={demo}
                  onChange={updateLandingDraft}
                  onReset={resetLandingDraft}
                  onSave={() => void saveLandingFromReport(false)}
                  onPublish={() => void saveLandingFromReport(true)}
                  onPreview={() => setLandingPreview(true)}
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
                  onGoToDocuments={() => setActiveReport("documents")}
                />
              </>}
              {activeReport === "documents" && <>
                <section className="delivery-gift-hero"><div className="delivery-gift-mark"><Gift /><i><Sparkles /></i></div><div><small>당신의 사업 시작 상자</small><h3>{resolvedBrandName}의 첫 실행 자료가 준비되었습니다</h3><p>아이디어를 바탕으로 사업계획서, 판매 페이지와 실행 자료를 먼저 완성했습니다.</p><span><CheckCircle2 /> 모든 초안 지금 이용 가능</span></div><aside><strong>{deliveryPack?.items.length ?? 0}</strong><small>개 결과물 준비</small><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("zip")}><Download /> 한 번에 받기</button></aside></section>
                <div className="delivery-section-heading"><div className="report-title-row"><PackageCheck /><div><small>6단계 · 최종</small><h3>결과물 열기와 내려받기</h3></div></div><div className="delivery-package-actions"><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("pdf")}><FileText /> 전체 PDF</button><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("docx")}><BookOpen /> 전체 워드</button><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("zip")}><Download /> 전체 받기</button></div></div>
                <p className="report-lead"><strong>이곳이 마지막 단계입니다.</strong> 실행 도우미를 완료하지 않아도 아래 결과물은 그대로 열고 내려받을 수 있습니다.</p>
                {deliveryQuality && <details className="delivery-quality-panel conditional">
                  <summary><span><ShieldCheck /></span><div><small>선택 확인</small><strong>나중에 확인할 점 보기</strong><p>초안 이용과 내려받기에는 영향을 주지 않습니다.</p></div><em>{deliveryQuality.actions.length}개</em></summary>
                  <div>{deliveryQuality.checks.map((check) => <article key={check.id} className={check.passed ? "passed" : "needs-work"}><i>{check.passed ? <Check /> : <CircleHelp />}</i><span><strong>{check.label}</strong><small>{check.detail}</small></span></article>)}</div>
                  {deliveryQuality.actions.length > 0 && <footer><CircleHelp /><p><strong>지금 하지 않아도 됩니다.</strong> 실제 영업이나 공식 제출 전에 한 가지씩 확인하세요.</p></footer>}
                </details>}
                {documentMessage && <p className="delivery-document-status" role="status">{documentMessage}</p>}
                <div className="deliverable-list">
                  {(deliveryPack?.items ?? []).map((item, index) => {
                    const Icon = deliveryIcons[item.id as keyof typeof deliveryIcons] ?? FileText;
                    return <article key={item.id} className={item.quality?.status === "needs_work" ? "needs-work" : ""} style={{ "--delivery-index": index } as React.CSSProperties}><span className="delivery-doc-icon"><Icon /></span><div className="delivery-document-summary"><small>{String(index + 1).padStart(2, "0")} · {item.complete ? "초안 완성" : item.contentReady ? "초안 완성 · 나중에 사실 확인" : item.quality?.label ?? "생성 필요"}</small><strong>{item.title}</strong><p>{item.type}</p>{item.quality && <span>{item.quality.metrics.estimatedPages}쪽 예상 · {item.quality.verificationLabel}</span>}{item.qualityReason && <span className="document-readiness-note">{item.qualityReason}</span>}</div><div className="delivery-document-actions"><button onClick={() => setDocumentPreview(item)}><Maximize2 /> 열기</button><button title="인쇄용 PDF 받기" aria-label={`${item.title} 인쇄용 PDF 받기`} disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("pdf", item)}><FileText /></button><button title="수정용 워드 받기" aria-label={`${item.title} 수정용 워드 받기`} disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("docx", item)}><BookOpen /></button></div></article>;
                  })}
                </div>
                <div className="delivery-receipt-row"><div><ReceiptText /><span><small>{betaAccess ? "베타 이용 정보" : "결제 내역"}</small><strong>{betaAccess ? "무료 이용" : `${paidAmount.toLocaleString("ko-KR")}원`} · {demo ? "결제완료 예시" : serverProject?.paymentStatus === "paid" ? "토스 승인" : "테스트 승인"}</strong></span></div><nav><button disabled={documentDownload === "receipt-pdf"} onClick={() => void downloadReceipt()}>{documentDownload === "receipt-pdf" ? "문서 제작 중" : betaAccess ? "이용 확인서(PDF)" : "영수증(PDF)"}</button><button title="화면 인쇄" aria-label="화면 인쇄" onClick={() => window.print()}><Printer /></button></nav></div>
              </>}
              </article>
            </div>
          </section>
        </div>
      </section>

      {landingPreview && (
        <div className="landing-fullscreen-preview" role="dialog" aria-modal="true" aria-label="판매 페이지 전체화면 미리보기">
          <header className="landing-preview-toolbar"><div><span><i /> 편집본 미리보기</span><p>버튼과 신청폼은 화면 확인용이며 실제 접수되지 않습니다.</p></div><button title="미리보기 닫기" aria-label="미리보기 닫기" onClick={() => setLandingPreview(false)}><X /></button></header>
          <div className={`public-landing tone-${landingDraft.backgroundTone} template-${landingDraft.templateId}`} style={{ "--landing-accent": landingDraft.accentColor } as React.CSSProperties}>
            <nav className="public-landing-nav"><span className="public-landing-brand">{landingDraft.logoImageUrl ? <img src={landingDraft.logoImageUrl} alt={`${landingDraft.businessName} 로고`} /> : <i>{landingDraft.businessName.replaceAll(" ", "").slice(0, 2)}</i>}<strong>{landingDraft.businessName}</strong></span><button onClick={() => document.querySelector(".landing-fullscreen-preview .public-lead-section")?.scrollIntoView({ behavior: "smooth" })}>{landingDraft.ctaLabel}</button></nav>
            <section className={`public-landing-hero ${landingDraft.heroImageUrl ? "with-image" : "without-image"}`} style={landingDraft.heroImageUrl ? { backgroundImage: `url(${landingDraft.heroImageUrl})` } : undefined} aria-label={landingDraft.heroImageAlt}>
              <div className="public-landing-hero-copy"><span>{landingDraft.heroLabel}</span><h1>{landingDraft.headline}</h1><p>{landingDraft.subheadline}</p><button onClick={() => document.querySelector(".landing-fullscreen-preview .public-lead-section")?.scrollIntoView({ behavior: "smooth" })}>{landingDraft.ctaLabel}<ArrowRight /></button><small><ShieldCheck /> {landingDraft.leadCaptureEnabled ? "신청 정보는 안내 목적으로만 사용됩니다." : "현재는 사업 소개만 공개되어 있습니다."}</small></div>
            </section>
            <section className="public-offer-band"><div><small>첫 상품</small><h2>{landingDraft.offerTitle}</h2><p>{landingDraft.offerDescription}</p></div><strong>{landingDraft.priceLabel}</strong><ul>{landingDraft.benefits.slice(0, 3).map((benefit) => <li key={benefit.title}><Check /> {benefit.title}</li>)}</ul></section>
            <section className="public-benefits"><header><small>진행 방식</small><h2>처음부터 복잡하게 시작하지 않습니다</h2></header><div>{landingDraft.benefits.map((benefit, index) => <article key={`${benefit.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><h3>{benefit.title}</h3><p>{benefit.description}</p></article>)}</div></section>
            {landingDraft.proofItems.length > 0 && <section className="public-proof"><header><small>확인 근거</small><h2>확인할 수 있는 근거</h2></header><div>{landingDraft.proofItems.map((item) => <p key={item}><Check /> {item}</p>)}</div></section>}
            {landingDraft.faq.length > 0 && <section className="public-faq"><header><small>자주 묻는 내용</small><h2>자주 묻는 질문</h2></header><div>{landingDraft.faq.map((item) => <details key={item.question}><summary>{item.question}<ChevronDown /></summary><p>{item.answer}</p></details>)}</div></section>}
            <section className={`public-lead-section ${landingDraft.leadCaptureEnabled ? "" : "brochure"}`}><div><small>신청 시작</small><h2>{landingDraft.ctaLabel}</h2><p>남겨주신 정보를 확인한 뒤 다음 절차를 안내합니다.</p></div>{landingDraft.leadCaptureEnabled ? <form className="preview-lead-form" onSubmit={(event) => event.preventDefault()}><label><span>이름</span><input placeholder="성함 또는 닉네임" /></label>{landingDraft.collectEmail && <label><span>이메일</span><input type="email" placeholder="name@company.kr" /></label>}{landingDraft.collectPhone && <label><span>전화번호</span><input type="tel" placeholder="010-0000-0000" /></label>}<label className="preview-consent"><input type="checkbox" /><span>개인정보 수집·이용 동의</span></label><button type="button">{landingDraft.ctaLabel}<ArrowRight /></button><small>미리보기에서는 신청이 전송되지 않습니다.</small></form> : <div className="public-lead-ready"><ShieldCheck /><h3>홈페이지가 먼저 준비되었습니다</h3><p>사업자 연락처와 개인정보 문의 정보를 확인한 뒤 신청폼을 켤 수 있습니다.</p></div>}</section>
            <footer className="public-landing-footer"><div className="public-footer-brand"><span>{landingDraft.logoImageUrl ? <img src={landingDraft.logoImageUrl} alt="" /> : landingDraft.businessName.replaceAll(" ", "").slice(0, 2)}</span><strong>{landingDraft.businessName}</strong></div><div className="public-business-information"><p>대표자 {landingDraft.businessRepresentative || "등록 전"}</p><p>사업장 {landingDraft.businessAddress || "등록 전"}</p><p>전화 {landingDraft.businessPhone || landingDraft.businessContact || "등록 전"}</p><p>이메일 {landingDraft.businessEmail || "등록 전"}</p><p>사업자등록번호 {landingDraft.businessRegistrationNumber || "등록 전"}</p><p>통신판매업 {landingDraft.mailOrderSalesNumber || "해당 시 등록"}</p></div>{landingDraft.pageMode === "transaction" && <p>교환·환불: {landingDraft.refundPolicy || "공개 전 입력"}</p>}<p>{landingDraft.legalNotice}</p>{landingDraft.leadCaptureEnabled && <small>개인정보 문의 {landingDraft.privacyContact || "공개 전 입력 필요"}</small>}<small>호스팅 제공자 {landingDraft.hostingProvider} · © {new Date().getFullYear()} {landingDraft.businessName}</small></footer>
          </div>
        </div>
      )}

      {documentPreview && (
        <div className="delivery-document-preview" role="dialog" aria-modal="true" aria-label={`${documentPreview.title} 전체 미리보기`}>
          <header>
            <div><strong>{documentPreview.title}</strong></div>
            <nav><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("pdf", documentPreview)}><FileText /> 인쇄용 문서(PDF)</button><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("docx", documentPreview)}><BookOpen /> 수정용 워드 문서</button><button className="document-preview-close" title="문서 미리보기 닫기" aria-label="문서 미리보기 닫기" onClick={() => setDocumentPreview(null)}><X /></button></nav>
          </header>
          <div className="document-preview-scroll">
            <section className="document-preview-cover"><span>창업 실행 캔버스</span><h1>{documentPreview.title}</h1><p>{documentPreview.type}</p><dl><div><dt>프로젝트</dt><dd>{landingDraft.businessName || opportunity.title}</dd></div><div><dt>목표 고객</dt><dd>{resolvedCustomer}</dd></div>{documentPreview.quality && <><div><dt>내용 확인</dt><dd>{documentPreview.quality.label}</dd></div><div><dt>근거 상태</dt><dd>{documentPreview.quality.verificationLabel}</dd></div></>}</dl>{demo && <aside>화면 검증용 가상 사례이며 실제 사업 판단에 사용할 수 없습니다.</aside>}</section>
            <DeliveryDocumentPreview markdown={documentPreview.markdown} />
          </div>
        </div>
      )}
    </main>
  );
}

function StageWorkProduct({
  stage,
  opportunity,
  price,
  setPrice,
  brandChoice,
  setBrandChoice,
  onRegenerate,
  onRequestRevision,
  isWorking,
}: {
  stage: number;
  opportunity: RankedOpportunity;
  price: number;
  setPrice: (price: number) => void;
  brandChoice: string;
  setBrandChoice: (brand: string) => void;
  onRegenerate: () => void;
  onRequestRevision: () => void;
  isWorking: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const baseName = opportunity.title.split(" ").slice(0, 2).join(" ");
  const brands = [`${baseName} 랩`, `${baseName} 프로젝트`, `모두의 ${baseName}`];
  const outreachMessage = `안녕하세요. 현재 ${opportunity.customer} 고객이 겪는 문제를 더 간단하게 해결하는 ${brandChoice || brands[0]}을 준비하고 있습니다. 판매가 아니라 실제 상황을 듣기 위한 20분 인터뷰를 부탁드려도 될까요? 참여해주시면 가장 먼저 무료 진단 결과를 공유드리겠습니다.`;
  const fixedCost = opportunity.capital === "소액" ? 800000 : opportunity.capital === "중간" ? 4500000 : 15000000;
  const variableRate = opportunity.model.includes("제품") || opportunity.model.includes("렌탈") ? 0.35 : 0.18;
  const contribution = Math.round(price * (1 - variableRate));
  const breakEven = Math.max(1, Math.ceil(fixedCost / contribution));

  if (stage === 0) {
    return (
      <section className="work-product">
        <div className="work-product-head"><div><span>자동 생성 초안</span><h3>사업 실행 요약서</h3></div><button disabled={isWorking} onClick={onRegenerate}><RefreshCw /> 초안 다시 만들기</button></div>
        <div className="brief-grid">
          <article><small>해결할 문제</small><strong>{opportunity.oneLiner}</strong></article>
          <article><small>첫 고객</small><strong>{opportunity.customer}</strong></article>
          <article><small>수익 구조</small><strong>{opportunity.revenue}</strong></article>
          <article><small>첫 검증 기간</small><strong>{opportunity.launchTime}</strong></article>
        </div>
        <div className="automation-insight"><BadgeCheck /><p><strong>자동 검토 포인트</strong>처음부터 완제품을 만들지 않고 “{opportunity.firstTest}”를 첫 번째 유료 검증으로 설정합니다.</p></div>
      </section>
    );
  }

  if (stage === 1) {
    return (
      <section className="work-product">
        <div className="work-product-head"><div><span>고객·시장 진단 1판</span><h3>고객·시장 진단 초안</h3></div><button onClick={onRequestRevision}><MessageCircle /> 수정 요청</button></div>
        <div className="diagnosis-document">
          <article><span>01</span><div><small>핵심 고객 문제</small><h4>{opportunity.customer} 고객은 현재 문제를 해결하기 위해 시간과 비용을 여러 곳에 나눠 쓰고 있습니다.</h4><p>{opportunity.oneLiner} 이 가설은 실제 지불 경험을 묻는 인터뷰로 검증해야 합니다.</p></div></article>
          <article><span>02</span><div><small>현재 경쟁 대안</small><h4>직접 해결 · 범용 서비스 · 지인 추천</h4><p>우리의 경쟁자는 같은 업종의 회사만이 아니라 고객이 지금 참고 있는 불편과 수작업입니다.</p></div></article>
          <article><span>03</span><div><small>시장 신호</small><div className="evidence-scores"><b>시장성 {opportunity.market}</b><b>새로움 {opportunity.novelty}</b><b>실행성 {opportunity.feasibility}</b></div><p>이 점수는 초기 가설 우선순위이며, 공식 통계와 고객 인터뷰를 추가해야 확정됩니다.</p></div></article>
        </div>
        <div className="interview-script"><strong>첫 고객 인터뷰 질문 3개</strong><ol><li>이 문제를 마지막으로 겪은 상황을 처음부터 들려주세요.</li><li>현재 어떤 방법으로 해결하며 한 달에 얼마를 쓰나요?</li><li>이 문제가 해결된다면 가장 먼저 달라져야 할 것은 무엇인가요?</li></ol></div>
      </section>
    );
  }

  if (stage === 2) {
    return (
      <section className="work-product">
        <div className="work-product-head"><div><span>상품과 한 건당 손익</span><h3>상품·가격·손익 설계</h3></div><span className="auto-update-label"><Zap /> 가격 입력 시 자동 계산</span></div>
        <div className="pricing-tiers">
          <article><small>입문 상품</small><strong>{Math.round(price * .45).toLocaleString()}원</strong><h4>문제 진단</h4><p>핵심 문제 한 가지를 빠르게 확인하는 입문 상품</p></article>
          <article className="recommended"><span>추천</span><small>핵심 상품</small><label><input type="number" value={price} onChange={(event) => setPrice(Math.max(10000, Number(event.target.value)))} />원</label><h4>핵심 해결 상품</h4><p>고객이 기대하는 대표 결과를 완성하는 주력 상품</p></article>
          <article><small>맞춤 상품</small><strong>{Math.round(price * 2.2).toLocaleString()}원</strong><h4>맞춤 실행</h4><p>운영 대행과 후속 관리를 포함한 고가 상품</p></article>
        </div>
        <div className="economics-grid"><span><small>예상 변동비율</small><strong>{Math.round(variableRate * 100)}%</strong></span><span><small>고객당 공헌이익</small><strong>{contribution.toLocaleString()}원</strong></span><span><small>초기비용 회수</small><strong>{breakEven}명</strong></span><span><small>월 500만원 목표</small><strong>{Math.ceil(5000000 / contribution)}명</strong></span></div>
        <div className="automation-insight warning"><ShieldCheck /><p><strong>반드시 확인할 숫자</strong>현재 손익은 업종 평균이 아니라 가정값입니다. 실제 견적과 고객이 수용하는 가격을 입력하면 자동으로 다시 계산됩니다.</p></div>
      </section>
    );
  }

  if (stage === 3) {
    return (
      <section className="work-product">
        <div className="work-product-head"><div><span>이름과 소개 방향</span><h3>한 줄 소개 문구와 이름</h3></div><button disabled={isWorking} onClick={onRegenerate}><RefreshCw /> 후보 다시 만들기</button></div>
        <div className="brand-core"><small>고객에게 할 한 문장 약속</small><h4>복잡한 시작을 줄이고, {opportunity.customer} 고객이 원하는 변화를 가장 작은 실행부터 만듭니다.</h4><div><span>#신뢰할 수 있는</span><span>#명확한</span><span>#실행 중심</span></div></div>
        <div className="brand-candidates">{brands.map((brand, index) => <button className={brandChoice === brand ? "selected" : ""} onClick={() => setBrandChoice(brand)} key={brand}><span>0{index + 1}</span><strong>{brand}</strong><small>{index === 0 ? "전문적이고 실험적인 인상" : index === 1 ? "확장 가능한 프로젝트 인상" : "친근하고 대중적인 인상"}</small>{brandChoice === brand && <CheckCircle2 />}</button>)}</div>
        <div className="brand-preview"><div className="brand-logo-preview">{brandChoice || brands[0]}</div><div><small>한 줄 소개 문구</small><strong>{opportunity.title}의 새로운 기준을 만듭니다.</strong></div></div>
      </section>
    );
  }

  if (stage === 4) {
    return (
      <section className="work-product">
        <div className="work-product-head"><div><span>판매 페이지 초안</span><h3>실제 판매 페이지 원고</h3></div><span className="auto-update-label"><CheckCircle2 /> 휴대전화 미리보기 적용</span></div>
        <div className="landing-draft">
          <div className="landing-draft-nav"><strong>{brandChoice || brands[0]}</strong><span>서비스 소개　가격　자주 묻는 질문</span><button>상담 신청</button></div>
          <div className="landing-draft-hero"><small>{opportunity.sector}</small><h4>{opportunity.oneLiner}</h4><p>첫 상담에서 현재 상황을 진단하고 가장 작은 실행 계획을 함께 정합니다.</p><button>무료 진단 신청 <ArrowRight /></button></div>
          <div className="landing-copy-blocks"><article><small>고객의 문제</small><strong>혼자 해결하느라 시간과 비용이 반복되고 있나요?</strong></article><article><small>우리의 해결</small><strong>{opportunity.model} 방식으로 필요한 결과만 빠르게 제공합니다.</strong></article><article><small>첫 행동</small><strong>30분 진단 후 맞지 않으면 진행하지 않아도 됩니다.</strong></article></div>
        </div>
        <div className="cta-check"><CheckCircle2 /><span><strong>신청 요소 확인 완료</strong>가격, 자주 묻는 질문, 문의 버튼, 개인정보 동의, 휴대전화 화면</span></div>
      </section>
    );
  }

  return (
    <section className="work-product">
      <div className="work-product-head"><div><span>첫 고객 확보 도구</span><h3>첫 고객 확보 실행 자료</h3></div><button disabled={isWorking} onClick={onRegenerate}><RefreshCw /> 문구 다시 쓰기</button></div>
      <div className="sales-message"><small>1:1 제안 메시지</small><p>{outreachMessage}</p><button onClick={async () => { await navigator.clipboard.writeText(outreachMessage); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}>{copied ? <><Check /> 복사 완료</> : "문구 복사"}</button></div>
      <div className="launch-channels"><article><span>01</span><strong>직접 제안</strong><p>기존 지인 10명에게 고객 대화 요청</p><em>목표 응답 5명</em></article><article><span>02</span><strong>문제 정보 글</strong><p>고객이 검색하는 질문을 정보 글 3개로 발행</p><em>목표 문의 3건</em></article><article><span>03</span><strong>협력 제안</strong><p>같은 고객을 만나는 비경쟁 사업자 5곳에 제안</p><em>목표 상담 2건</em></article></div>
      <div className="support-ready"><Building2 /><div><small>지원사업 준비도</small><strong>사업요약·고객문제·수익모델 초안 준비 완료</strong><p>아래 공공지원사업 매칭에서 공고 자격을 판정하고 신청 초안을 받을 수 있습니다.</p></div><span>매칭 가능</span></div>
    </section>
  );
}

const artifactFieldLabels: Record<string, string> = {
  problem: "고객이 겪는 문제",
  customer: "첫 고객",
  valueProposition: "제공할 핵심 가치",
  constraints: "입력한 실행 조건",
  validationPlan: "첫 검증 계획",
  day21Goal: "21일 뒤 목표",
  automaticDecisions: "AI가 먼저 정한 시작 원칙",
  businessReadiness: "사업 준비 상태",
  primaryCustomer: "핵심 고객",
  jobs: "고객이 해결하려는 일",
  pains: "고객의 불편",
  currentAlternatives: "현재 사용하는 대안",
  evidence: "확인된 근거",
  evidencePlan: "근거를 확인하는 방법",
  interviewScript: "고객에게 물을 질문",
  unknowns: "아직 확인할 내용",
  decisionRule: "계속·수정·중단 기준",
  nextActions: "바로 할 일",
  tiers: "상품 구성",
  recommendedOffer: "가장 먼저 제안할 상품",
  unitEconomics: "한 건 판매 손익",
  breakEvenCustomers: "월 손익분기 고객 수",
  breakEvenRevenueWon: "월 손익분기 매출",
  monthlyFixedCostWon: "월 고정비",
  initialInvestmentWon: "초기 투자비",
  recommendedWorkingCapitalWon: "권장 운전자금",
  totalFundingNeedWon: "전체 필요자금",
  scenarios: "상황별 예상",
  financialWarnings: "숫자 확인사항",
  monthlyGoalCustomers: "월 목표 고객 수",
  assumptions: "확인이 필요한 가정",
  pricingTests: "가격 검증 방법",
  pricingRationale: "이 가격을 제안한 이유",
  priceChangeRules: "가격을 바꾸는 기준",
  nameCandidates: "이름 후보",
  promise: "고객에게 할 약속",
  slogans: "한 줄 문구 후보",
  tone: "말투와 분위기",
  keywords: "핵심 단어",
  prohibitedClaims: "사용하면 안 되는 표현",
  selectionGuide: "이름 선택 방법",
  usageExamples: "사용 예시",
  recommendedDirection: "우선 추천 이름·문구",
  candidateReasons: "이름 후보별 이유",
  nameReviewChecklist: "최종 이름 확인 순서",
  blocks: "판매 페이지 내용",
  contact: "문의 방법",
  legalNotice: "필수 안내 문구",
  publishingChecklist: "공개 전 자동 점검",
  launchDate: "첫 공개일",
  outreachScripts: "첫 연락 문구",
  channelPlan: "고객을 만날 경로",
  weeklyMetrics: "매주 확인할 숫자",
  supportProgramChecklist: "지원사업 준비 항목",
  next30Days: "앞으로 30일 일정",
  decisionCriteria: "계속·수정·중단 기준",
  messageUsageGuide: "첫 연락 문구 사용법",
  launchRiskPlan: "반응이 없거나 문제가 생길 때",
  budgetWon: "시작 예산",
  availableHoursPerWeek: "주당 사용 시간",
  mustAvoid: "피해야 할 조건",
  existingAssets: "이미 가진 자원",
  firstScope: "처음 제공할 범위",
  excludedScope: "이번에 하지 않을 범위",
  archetype: "사업 유형",
  legalForm: "사업자 형태",
  workplaceType: "사업장 형태",
  region: "사업 지역",
  requiredActions: "필수 확인 절차",
  hardBlockCount: "판매 전 해결할 문제 수",
  name: "이름",
  priceWon: "가격",
  outcome: "받게 되는 결과",
  method: "방법",
  value: "연락처",
  reason: "추천 이유",
  includedScope: "포함 범위",
  completionCriteria: "완료 기준",
  usage: "사용 예시",
};

const artifactStringLabels: Record<string, string> = {
  ...archetypeLabels,
  ...legalFormLabels,
  ...workplaceLabels,
};

function artifactLabel(key: string) {
  return artifactFieldLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function artifactNumber(key: string, value: number) {
  if (key === "availableHoursPerWeek") return `주 ${value.toLocaleString("ko-KR")}시간`;
  return /(Won|Price|Cost|Revenue|Funding|Investment|Contribution|budget)/i.test(key)
    ? `${Math.round(value).toLocaleString("ko-KR")}원`
    : value.toLocaleString("ko-KR");
}

function ArtifactValue({ value, fieldKey }: { value: unknown; fieldKey: string }) {
  if (value === null || value === undefined || value === "") return <p className="artifact-empty-value">아직 확인되지 않았어요.</p>;
  if (typeof value === "string") return <p>{artifactStringLabels[value] ?? value}</p>;
  if (typeof value === "number") return <strong className="artifact-number">{artifactNumber(fieldKey, value)}</strong>;
  if (typeof value === "boolean") return <strong>{value ? "해당함" : "해당하지 않음"}</strong>;
  if (Array.isArray(value)) {
    if (!value.length) return <p className="artifact-empty-value">아직 입력된 내용이 없어요.</p>;
    if (value.every((item) => typeof item !== "object" || item === null)) {
      return <ul>{value.map((item, index) => <li key={`${fieldKey}-${index}`}>{String(item)}</li>)}</ul>;
    }
    return <div className="artifact-object-list">{value.map((item, index) => <article key={`${fieldKey}-${index}`}><ArtifactValue value={item} fieldKey={`${fieldKey}-${index}`} /></article>)}</div>;
  }
  if (typeof value === "object") {
    return (
      <dl className="artifact-data-list">
        {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
          <div key={key}><dt>{artifactLabel(key)}</dt><dd><ArtifactValue value={item} fieldKey={key} /></dd></div>
        ))}
      </dl>
    );
  }
  return <p>{String(value)}</p>;
}

function ArtifactContentPreview({ artifact, stageIndex }: { artifact: ArtifactRecord; stageIndex: number }) {
  return (
    <section className="real-artifact-preview" aria-label={`${launchStages[stageIndex].output} 실제 생성 결과`}>
      <header>
        <div><span><FileText /></span><div><small>실제 생성 결과 · {artifact.version}판</small><h3>{launchStages[stageIndex].output}</h3></div></div>
        <em><Sparkles /> 인공지능 활용</em>
      </header>
      <p className="artifact-ai-notice">입력한 정보로 만든 초안입니다. 금액·법적 요건·시장 수치는 아래 확인 항목을 거쳐 직접 승인해야 합니다.</p>
      <div className="artifact-content-grid">
        {Object.entries(artifact.content).map(([key, value]) => (
          <section key={key}><h4>{artifactLabel(key)}</h4><ArtifactValue value={value} fieldKey={key} /></section>
        ))}
      </div>
      {(artifact.assumptions.length > 0 || artifact.sources.length > 0) && (
        <footer>
          {artifact.assumptions.length > 0 && <div><strong>확인이 필요한 가정</strong>{artifact.assumptions.map((item) => <p key={item}>{item}</p>)}</div>}
          {artifact.sources.length > 0 && <div><strong>사용한 출처</strong>{artifact.sources.map((source) => <a key={`${source.url}-${source.title}`} href={source.url} target="_blank" rel="noreferrer">{source.title} <ExternalLink /></a>)}</div>}
        </footer>
      )}
    </section>
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
  const [instantBuild, setInstantBuild] = useState<{ status: "idle" | "building" | "error" | "done"; step: number; message: string; mode: "initial" | "refine"; error: string }>({ status: "idle", step: 0, message: "", mode: "initial", error: "" });
  const instantBuildStartedRef = useRef(false);
  const lastBuildRequestRef = useRef<{ force: boolean; refinement?: DraftRefinementInput }>({ force: false });
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
    const response = await fetch(`/api/projects/${serverProject.id}`, { cache: "no-store" });
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

  const runInstantDraftPackage = useCallback(async (force: boolean, refinement?: DraftRefinementInput) => {
    if (!serverProject || instantBuildStartedRef.current) return;
    instantBuildStartedRef.current = true;
    lastBuildRequestRef.current = { force, refinement };
    setInstantBuild({ status: "building", step: 0, message: force ? "바꾼 기본정보를 정리하고 있어요." : "처음 입력한 아이디어를 정리하고 있어요.", mode: force ? "refine" : "initial", error: "" });

    const readProjectPayload = async (response: Response, fallback: string) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? fallback);
      return payload;
    };

    try {
      let workingProject = serverProject;
      let workingOpportunity = (workingProject.opportunity as unknown as RankedOpportunity);
      let setupChanged = false;
      const nextPrice = refinement?.priceWon ?? (typeof workingProject.stages[2]?.inputs.basePriceWon === "number" ? workingProject.stages[2].inputs.basePriceWon : price);
      const nextBrand = refinement?.brandName ?? (typeof workingProject.stages[3]?.inputs.selectedName === "string" ? workingProject.stages[3].inputs.selectedName : brandChoice);

      if (refinement) {
        const updateResponse = await fetch(`/api/projects/${workingProject.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer: refinement.customer, oneLiner: refinement.oneLiner }),
        });
        const updatePayload = await readProjectPayload(updateResponse, "사업 기본정보를 수정하지 못했습니다.");
        workingProject = updatePayload.project as ProjectRecord;
        workingOpportunity = workingProject.opportunity as unknown as RankedOpportunity;
        setServerProject(workingProject);
      }

      if (!workingProject.businessSetup || refinement) {
        const stageBudget = workingProject.stages[0]?.inputs.budgetWon;
        const availableCash = typeof stageBudget === "number"
          ? stageBudget
          : workingOpportunity.capital === "소액" ? 1000000 : workingOpportunity.capital === "중간" ? 10000000 : 50000000;
        const setup = workingProject.businessSetup
          ? structuredClone(workingProject.businessSetup)
          : emptyBusinessSetup(inferBusinessArchetype(workingOpportunity));
        setup.financial.sellingPrice = nextPrice;
        setup.financial.availableCash = availableCash;
        setup.sectorKeywords = `${workingOpportunity.title} ${workingOpportunity.oneLiner}`.split(/\s+/).filter(Boolean).slice(0, 6);
        setup.onlineSales = setup.archetype === "ecommerce" || setup.archetype === "digital_service";
        setup.handlesPersonalData = setup.handlesPersonalData || setup.onlineSales;
        const setupResponse = await fetch(`/api/projects/${workingProject.id}/setup`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(setup),
        });
        const setupPayload = await readProjectPayload(setupResponse, "추천 비용과 사업 조건을 저장하지 못했습니다.");
        workingProject = setupPayload.project as ProjectRecord;
        workingOpportunity = workingProject.opportunity as unknown as RankedOpportunity;
        setupChanged = true;
        setServerProject(workingProject);
      }

      const revisionInstruction = refinement
        ? [`사업 이름은 '${refinement.brandName}', 주요 고객은 '${refinement.customer}', 첫 상품 가격은 ${refinement.priceWon.toLocaleString("ko-KR")}원으로 반영해주세요.`, refinement.note].filter(Boolean).join(" ")
        : "";

      for (let stageIndex = 0; stageIndex < launchStages.length; stageIndex += 1) {
        setInstantBuild({ status: "building", step: stageIndex + 1, message: `현재 만드는 자료: ${launchStages[stageIndex].output}`, mode: force ? "refine" : "initial", error: "" });
        const stage = workingProject.stages[stageIndex];
        if (!force && stage.approvedArtifactId) continue;

        let inputs = mergeStageInputs(
          buildStageInput(stageIndex, workingOpportunity, nextPrice, nextBrand, refinement?.note ?? ""),
          stage.inputs,
          refinement?.note ?? "",
        );
        if (refinement && stageIndex === 1) inputs = { ...inputs, primaryCustomer: refinement.customer };
        if (stageIndex === 2 && workingProject.businessAssessment) {
          const financial = workingProject.businessAssessment.financial;
          inputs = {
            ...inputs,
            basePriceWon: financial.grossPrice,
            variableCostWon: financial.variableCostPerUnit,
            monthlyFixedCostWon: financial.monthlyFixedCost,
            monthlyRevenueGoalWon: financial.grossPrice * (workingProject.businessSetup?.financial.targetMonthlyUnits ?? 10),
          };
        }
        if (refinement && stageIndex === 3) inputs = { ...inputs, preferredNames: [refinement.brandName], selectedName: refinement.brandName };
        if (refinement && stageIndex === 4) inputs = { ...inputs, headline: refinement.oneLiner };

        const inputResponse = await fetch(`/api/projects/${workingProject.id}/stages/${stageIndex}/inputs`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputs),
        });
        await readProjectPayload(inputResponse, `${launchStages[stageIndex].output}의 기본정보를 저장하지 못했습니다.`);

        const currentArtifactId = stage.artifacts[0]?.id;
        const generationResponse = force && currentArtifactId
          ? await fetch(`/api/projects/${workingProject.id}/stages/${stageIndex}/revise`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ artifactId: currentArtifactId, instruction: revisionInstruction }),
            })
          : await fetch(`/api/projects/${workingProject.id}/stages/${stageIndex}/generate`, { method: "POST" });
        const generationPayload = await readProjectPayload(generationResponse, `${launchStages[stageIndex].output}을 만들지 못했습니다.`);
        const artifactId = generationPayload.artifact?.id as string | undefined;
        if (!artifactId) throw new Error(`${launchStages[stageIndex].output} 생성 결과를 찾지 못했습니다.`);

        const approvalResponse = await fetch(`/api/projects/${workingProject.id}/stages/${stageIndex}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artifactId }),
        });
        const approvalPayload = await readProjectPayload(approvalResponse, `${launchStages[stageIndex].output}을 저장하지 못했습니다.`);
        workingProject = approvalPayload.project as ProjectRecord;
        workingOpportunity = workingProject.opportunity as unknown as RankedOpportunity;
        setServerProject(workingProject);

        if (!force && stageIndex === 1) {
          const approved = workingProject.stages[1].artifacts.find((artifact) => artifact.id === workingProject.stages[1].approvedArtifactId);
          const suggestedCustomer = typeof approved?.content.primaryCustomer === "string" ? approved.content.primaryCustomer.trim() : "";
          if (suggestedCustomer.length >= 2 && suggestedCustomer !== workingOpportunity.customer) {
            const customerResponse = await fetch(`/api/projects/${workingProject.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ customer: suggestedCustomer }),
            });
            const customerPayload = await readProjectPayload(customerResponse, "AI가 제안한 첫 고객을 저장하지 못했습니다.");
            workingProject = customerPayload.project as ProjectRecord;
            workingOpportunity = workingProject.opportunity as unknown as RankedOpportunity;
            setServerProject(workingProject);
          }
        }
      }

      if (force || setupChanged || !workingProject.businessPlan) {
        setInstantBuild({ status: "building", step: 7, message: "사업계획서를 완성하고 있어요.", mode: force ? "refine" : "initial", error: "" });
        const response = await fetch(`/api/projects/${workingProject.id}/business-plan`, { method: "POST" });
        workingProject = (await readProjectPayload(response, "사업계획서를 만들지 못했습니다.")).project as ProjectRecord;
        setServerProject(workingProject);
      }

      const saveGeneratedWorkspace = async (path: "operations" | "execution-loop" | "grants", key: "workspace", fallback: string) => {
        const getResponse = await fetch(`/api/projects/${workingProject.id}/${path}`, { cache: "no-store" });
        const generated = await readProjectPayload(getResponse, fallback);
        const putResponse = await fetch(`/api/projects/${workingProject.id}/${path}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(generated[key]),
        });
        const saved = await readProjectPayload(putResponse, fallback);
        workingProject = saved.project as ProjectRecord;
        setServerProject(workingProject);
      };

      if (force || setupChanged || !workingProject.operationsPackage) {
        setInstantBuild({ status: "building", step: 8, message: "운영 준비서를 정리하고 있어요.", mode: force ? "refine" : "initial", error: "" });
        await saveGeneratedWorkspace("operations", "workspace", "운영 준비서를 만들지 못했습니다.");
      }
      if (force || setupChanged || !workingProject.executionAnalysis) {
        setInstantBuild({ status: "building", step: 9, message: "단계별 실행 보고서를 정리하고 있어요.", mode: force ? "refine" : "initial", error: "" });
        await saveGeneratedWorkspace("execution-loop", "workspace", "실행 보고서를 만들지 못했습니다.");
      }
      if (force || setupChanged || !workingProject.grantPackage) {
        setInstantBuild({ status: "building", step: 10, message: "지원사업 신청 초안을 정리하고 있어요.", mode: force ? "refine" : "initial", error: "" });
        await saveGeneratedWorkspace("grants", "workspace", "지원사업 초안을 만들지 못했습니다.");
      }

      setServerProject(workingProject);
      setInstantBuild({ status: "done", step: 10, message: "전체 초안이 준비되었습니다.", mode: force ? "refine" : "initial", error: "" });
    } catch (error) {
      setInstantBuild((current) => ({ ...current, status: "error", error: error instanceof Error ? error.message : "전체 초안을 만들지 못했습니다." }));
    } finally {
      instantBuildStartedRef.current = false;
    }
  }, [brandChoice, price, serverProject, setServerProject]);

  useEffect(() => {
    if (!serverProject || packageReady || instantBuild.status !== "idle" || instantBuildStartedRef.current) return;
    void runInstantDraftPackage(false);
  }, [instantBuild.status, packageReady, runInstantDraftPackage, serverProject]);

  if (serverProject && (instantBuild.status === "building" || instantBuild.status === "error" || !packageReady)) {
    return <InstantDraftBuilder opportunity={effectiveOpportunity} step={instantBuild.step} message={instantBuild.message} mode={instantBuild.mode} error={instantBuild.error} onRetry={() => { const request = lastBuildRequestRef.current; void runInstantDraftPackage(request.force, request.refinement); }} onHome={onHome} />;
  }

  if (serverProject && packageReady) {
    return <FinalDelivery opportunity={effectiveOpportunity} price={price} brandChoice={brandChoice} serverProject={serverProject} onHome={onHome} onRefine={(input) => runInstantDraftPackage(true, input)} />;
  }

  if (delivered) {
    return <FinalDelivery opportunity={opportunity} price={price} brandChoice={brandChoice} serverProject={serverProject} onHome={onHome} />;
  }

  return (
    <main className="project-page">
      <aside className="project-sidebar">
        <Logo onClick={onHome} />
        <div className="payment-complete"><CheckCircle2 /><span><small>{betaAccess ? "이용 상태 · 베타 테스트" : `결제 상태 · ${serverProject?.paymentStatus === "test_paid" ? "개발 테스트" : "토스 승인"}`}</small><strong>{betaAccess ? "결제 없이 모든 기능 이용 중" : `${(serverProject?.packagePrice ?? 990000).toLocaleString("ko-KR")}원 결제 완료`}</strong></span></div>
        <nav>
          {launchStages.map((stage, index) => <button key={stage.name} className={`${index === activeStage ? "active" : ""} ${index < activeStage ? "done" : ""}`} onClick={() => index <= activeStage && setActiveStage(index)}><span>{index < activeStage ? <Check /> : index + 1}</span><div><strong>{stage.name}</strong><small>{stage.period}</small></div></button>)}
        </nav>
        <div className="automation-card"><span><Zap /></span><div><small>자동 진행 지원</small><strong>창업 실행 자동화</strong><p>24시간 저장 · 생성 · 다시 시도</p></div><RefreshCw /></div>
      </aside>
      <section className="project-workspace">
        <header className="project-topbar"><div><span>내 프로젝트</span><strong>{opportunity.title}</strong></div><button onClick={onHome}>나가기</button></header>
        <nav className="mobile-stepper" aria-label="프로젝트 진행 단계">
          <div><span>{activeStage + 1} / {launchStages.length}</span><strong>{current.name}</strong><em>{current.period}</em></div>
          <i><b style={{ width: `${((activeStage + 1) / launchStages.length) * 100}%` }} /></i>
        </nav>
        <div className="project-overview">
          <div><span className="project-status">진행 중 · {current.period}</span><p>21일 창업 실행 과정</p><h1>{opportunity.title}</h1><div><span><CalendarDays /> 목표 공개일 7월 31일</span><span><BriefcaseBusiness /> {opportunity.model}</span></div></div>
          <div className="project-progress"><strong>{progress}<small>%</small></strong><span>전체 진행률</span><i><b style={{ width: `${progress}%` }} /></i></div>
        </div>
        <div className="stage-layout">
          <article className="current-stage-card">
            <div className="stage-heading"><span>{String(activeStage + 1).padStart(2, "0")}</span><div><small>{current.period} · 현재 단계</small><h2>{current.title}</h2><p>{current.description}</p></div></div>
            {serverProject && <section className="focus-action-banner"><span>지금 할 일</span><div><strong>{focusTitle}</strong><p>{focusDescription}</p></div><em>{setupRequired ? "입력" : !latestArtifact ? "생성" : !allCurrentChecked ? "검토" : "승인"}</em></section>}
            {activeStage === 0 && confirmedBudgetWon !== null && confirmedHoursPerWeek !== null && (
              <div className="confirmed-planning-inputs" aria-label="입력한 기획 조건">
                <p><CheckCircle2 /><strong>처음 입력한 실행 조건</strong></p>
                <div>
                  <span><small>시작 예산</small><strong>{Math.round(confirmedBudgetWon / 10_000).toLocaleString("ko-KR")}만원</strong></span>
                  <span><small>사용 가능 시간</small><strong>주당 {confirmedHoursPerWeek}시간</strong></span>
                </div>
              </div>
            )}
            {serverProject && activeStage === 0 && (setupRequired || showSavedSetup) && <BusinessSetupPanel project={serverProject} onSaved={(project) => { setServerProject(project); setShowSavedSetup(true); }} onComplete={() => { setShowSavedSetup(false); window.setTimeout(() => document.querySelector(".service-workflow")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />}
            {serverProject && activeStage === 0 && !setupRequired && !showSavedSetup && <button className="edit-saved-setup" onClick={() => setShowSavedSetup(true)}><Calculator /> 사업 조건·손익 다시 계산</button>}
            {serverProject && activeStage === 1 && !latestArtifact && <details className="optional-stage-tools"><summary><span>가지고 있는 근거가 있다면 추가 <em>안 해도 됨</em></span><ChevronDown /></summary><MarketPlanPanel project={serverProject} onSaved={setServerProject} /></details>}
            {serverProject && activeStage === 1 && !latestArtifact && locationAnalysisNeeded && <details className="optional-stage-tools"><summary><span>지역 자료가 있다면 추가 <em>안 해도 됨</em></span><ChevronDown /></summary><RegionalCoveragePanel project={serverProject} /></details>}
            {serverProject && activeStage === 4 && !latestArtifact && <LandingBuilderPanel project={serverProject} />}
            {serverProject && activeStage === 5 && !latestArtifact && <details className="optional-stage-tools"><summary><span>운영 계획 직접 바꾸기 <em>선택사항</em></span><ChevronDown /></summary><OperationsPanel project={serverProject} onSaved={setServerProject} /></details>}
            {serverProject && activeStage === 5 && !latestArtifact && <details className="optional-stage-tools"><summary><span>추가 운영 도구 열기 <em>선택사항</em></span><ChevronDown /></summary><ExecutionLoopPanel project={serverProject} onSaved={setServerProject} /><QualityAssurancePanel project={serverProject} onSaved={setServerProject} /><GrantMatcherPanel project={serverProject} onSaved={setServerProject} /></details>}
            {serverProject && !setupRequired && (
              <section className="service-workflow">
                <div className="step-by-step-guide" aria-label="현재 단계 진행 방법">
                  <div className="active"><span>{latestArtifact ? <Check /> : "1"}</span><p><strong>AI 초안 만들기</strong><small>추가 입력 없이 자동 작성</small></p></div>
                  <i />
                  <div className={latestArtifact ? "active" : ""}><span>2</span><p><strong>그대로 사용 또는 수정</strong><small>한 번 확인하면 다음 단계</small></p></div>
                </div>
                {!latestArtifact && <div className="automatic-draft-scope"><div><Sparkles /><p><small>AI가 알아서 채웁니다</small><strong>지금 더 입력할 내용은 없습니다</strong></p></div><ul>{automaticDraftItems[activeStage].map((item) => <li key={item}><Check /> {item}</li>)}</ul></div>}
                <div className="service-workflow-head">
                  <div><span className={`service-state ${currentServerStage?.status ?? "not_started"}`} /><p><strong>{latestArtifact ? "초안이 준비됐어요" : "버튼 한 번이면 초안이 완성돼요"}</strong><small>{stageStatusLabel[currentServerStage?.status ?? "not_started"]} · 처음 입력한 내용 자동 반영</small></p></div>
                  {latestArtifact && <em>결과물 {latestArtifact.version}판</em>}
                </div>
                {serviceError && <div className="service-error"><CircleHelp /> <span>{serviceError}</span><button disabled={serviceAction !== "idle" || (!canRetryGeneration && currentServerStage?.status === "failed")} onClick={handleGenerationRecovery}>{currentServerStage?.status === "failed" ? (canRetryGeneration ? `다시 시도 (${latestJob?.attempt ?? 0}/3)` : "재시도 한도 초과") : "다시 시도"}</button></div>}
                {!latestArtifact ? (
                  <button className="generate-real-artifact" disabled={serviceAction !== "idle" || setupRequired} onClick={generateServerArtifact}>{setupRequired ? "먼저 위에서 사업 조건과 손익분기점을 계산해주세요" : serviceAction === "saving" ? "처음 입력한 내용을 불러오는 중..." : serviceAction === "generating" ? "맞춤 초안을 만들고 있어요..." : <><Sparkles /> AI가 초안 만들기 <ArrowRight /></>}</button>
                ) : (
                  <div className="artifact-review-actions">
                    <div className="review-ready"><CheckCircle2 /><p><strong>AI가 먼저 만든 초안이 준비됐어요</strong><small>그대로 사용하거나, 원하는 부분만 수정 요청하면 됩니다.</small></p><button onClick={moveToArtifact}>초안 보기 <ArrowDown /></button></div>
                    <details><summary>전문가용 원본 자료 보기</summary><pre>{JSON.stringify(latestArtifact.content, null, 2)}</pre></details>
                    <label><span>수정하고 싶은 점 <em>선택사항</em></span><textarea value={revisionText} onChange={(event) => setRevisionText(event.target.value)} placeholder="예: 가격 근거를 더 쉽게 설명하고, 직장인 고객 사례를 추가해주세요." /><small>{revisionText.trim().length}/10자 이상 입력하면 수정본을 만들 수 있어요.</small></label>
                    <div><button disabled={revisionText.trim().length < 10 || serviceAction !== "idle"} onClick={reviseServerArtifact}><RefreshCw /> {serviceAction === "revising" ? "요청을 반영하는 중..." : "원하는 부분만 수정"}</button><button className="approve-real-artifact" disabled={!allCurrentChecked || serviceAction !== "idle"} onClick={approveServerArtifact}><CheckCircle2 /> {serviceAction === "approving" ? "다음 단계를 준비 중..." : allCurrentChecked ? "이 초안 사용 · 다음 단계" : "아래에서 초안을 한 번 확인해주세요"}</button></div>
                  </div>
                )}
              </section>
            )}
            {latestArtifact ? <details className="artifact-preview-details" open={artifactExpanded} onToggle={(event) => setArtifactExpanded(event.currentTarget.open)}><summary><span><Eye /><strong>완성된 초안 내용 보기</strong><small>필요할 때만 펼쳐보세요</small></span><ChevronDown /></summary><ArtifactContentPreview artifact={latestArtifact} stageIndex={activeStage} /></details> : !serverProject ? <StageWorkProduct stage={activeStage} opportunity={opportunity} price={price} setPrice={setPrice} brandChoice={brandChoice} setBrandChoice={setBrandChoice} onRegenerate={generateServerArtifact} onRequestRevision={moveToRevision} isWorking={serviceAction !== "idle"} /> : null}
            {(latestArtifact || !serverProject) && <div className="stage-task-list" id="stage-checklist">
              <div><strong>마지막으로 한 번만 확인</strong><span>{current.tasks.filter((_, index) => checked[`${activeStage}-${index}`]).length} / {current.tasks.length}</span></div>
              <p className="checklist-help">초안의 방향이 괜찮다면 아래 버튼을 누르세요. 세부 내용은 나중에도 수정할 수 있습니다.</p>
              {current.tasks.map((task, index) => {
                const isChecked = Boolean(checked[`${activeStage}-${index}`]);
                const isCurrent = firstUncheckedTaskIndex === index;
                const isVisible = firstUncheckedTaskIndex === -1 || index <= firstUncheckedTaskIndex;
                if (!isVisible) return null;
                return <button key={task} aria-pressed={isChecked} className={`${isChecked ? "checked" : ""} ${isCurrent ? "current" : ""}`} onClick={() => toggleTask(index)}><span>{isChecked ? <Check /> : index + 1}</span><strong>{task}</strong><em>{isChecked ? "사용하기로 선택" : "이 초안 사용"}</em></button>;
              })}
            </div>}
            {(latestArtifact || !serverProject) && <div className="stage-output"><PackageCheck /><div><small>이 단계가 끝나면</small><strong>{current.output}</strong>이 완성됩니다.</div></div>}
            {!serverProject && <button className="complete-stage" disabled={!allCurrentChecked} onClick={() => activeStage < launchStages.length - 1 ? setActiveStage((stage) => stage + 1) : setDelivered(true)}>{activeStage === launchStages.length - 1 && allCurrentChecked ? "최종 납품함 열기" : allCurrentChecked ? "이 단계 완료하고 다음으로" : "할 일을 모두 확인해주세요"} <ArrowRight /></button>}
          </article>
          <aside className="project-side-panel">
            <section><div className="panel-title"><Sparkles /><div><strong>생성 작업 상태</strong><small>현재 할 일만 간단히 표시합니다</small></div></div><div className="generation-status"><span className={serviceAction !== "idle" ? "running" : ""} /><p><strong>{current.output}</strong><small>{serviceAction === "saving" ? "입력 저장 중" : serviceAction === "generating" || serviceAction === "revising" || serviceAction === "retrying" ? "결과 생성 중" : latestArtifact ? `${latestArtifact.version}판 검토 가능` : currentServerStage?.status === "failed" ? `생성 실패 · 시도 ${latestJob?.attempt ?? 0}/3` : "입력 대기"}</small></p><em>{stageStatusLabel[currentServerStage?.status ?? "not_started"]}</em></div></section>
            {serverProject && <details className="project-technical-details"><summary>저장·생성 상태 자세히</summary><ServiceOpsPanel project={serverProject} /><button className="project-delete-button" disabled={deletingProject} onClick={deleteCurrentProject}><Trash2 /> {deletingProject ? "삭제하는 중..." : "이 프로젝트 삭제"}</button></details>}
            <section><div className="panel-title"><FileText /><div><strong>승인된 문서</strong><small>단계 승인 후 여기에 쌓입니다</small></div></div>{serverProject ? serverProject.stages.filter((stage) => stage.approvedArtifactId).map((stage) => <button className="project-doc" key={stage.id}><span><FileText /></span><div><strong>{launchStages[stage.stageIndex].output}</strong><small>{stage.artifacts.find((artifact) => artifact.id === stage.approvedArtifactId)?.version ?? 1}판 · 승인 완료</small></div><ArrowRight /></button>) : activeStage === 0 ? <p className="empty-doc">첫 단계 완료 후 문서가 생성됩니다.</p> : launchStages.slice(0, activeStage).map((stage) => <button className="project-doc" key={stage.output}><span><FileText /></span><div><strong>{stage.output}</strong><small>화면 확인용 문서</small></div><ArrowRight /></button>)}</section>
            <section className="help-panel"><CircleHelp /><div><strong>다음 행동이 헷갈리나요?</strong><p>현재 단계의 체크리스트로 이동해 하나씩 확인하면 자동으로 다음 행동을 안내합니다.</p><button onClick={moveToChecklist}>현재 할 일 보기</button></div></section>
          </aside>
        </div>
        <div className="mobile-sticky-action" aria-live="polite">
          <div><small>현재 할 일</small><strong>{!serverProject ? `초안 확인 · ${current.tasks.filter((_, index) => checked[`${activeStage}-${index}`]).length}/${current.tasks.length}` : !latestArtifact ? "AI 초안 만들기" : !allCurrentChecked ? "이 초안 사용할지 확인" : "다음 단계로 이동"}</strong></div>
          {!serverProject ? <button disabled={!allCurrentChecked} onClick={() => activeStage < launchStages.length - 1 ? setActiveStage((stage) => stage + 1) : setDelivered(true)}>다음 <ArrowRight /></button> : !latestArtifact ? <button disabled={serviceAction !== "idle" || setupRequired} onClick={generateServerArtifact}>{setupRequired ? "사업 조건·손익 계산 먼저" : serviceAction === "idle" ? "AI 초안" : "처리 중..."}</button> : !allCurrentChecked ? <button onClick={moveToChecklist}>초안 확인 <ArrowDown /></button> : <button disabled={serviceAction !== "idle"} onClick={approveServerArtifact}>{serviceAction === "idle" ? "사용하고 다음" : "처리 중..."}</button>}
        </div>
      </section>
    </main>
  );
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home");
  const [answers, setAnswers] = useState<AssessmentAnswers>({});
  const [profile, setProfile] = useState<FounderProfile>(() => calculateProfile({}));
  const [feedback, setFeedback] = useState<OpportunityFeedback>({});
  const [planningConstraints, setPlanningConstraints] = useState<PlanningConstraints | null>(null);
  const [selectedProject, setSelectedProject] = useState<RankedOpportunity | null>(null);
  const [serverProject, setServerProject] = useState<ProjectRecord | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const mounted = useRef(false);

  const navigate = useCallback((next: Screen, options?: { replace?: boolean; projectId?: string }) => {
    const url = new URL(window.location.href);
    if (next === "home") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    if (next === "project" && options?.projectId) url.searchParams.set("project", options.projectId);
    else if (next !== "project") url.searchParams.delete("project");
    const method = options?.replace ? "replaceState" : "pushState";
    window.history[method]({ screen: next }, "", `${url.pathname}${url.search}${url.hash}`);
    setScreen(next);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("venture-dna");
      if (saved) {
        const parsed = JSON.parse(saved) as { answers?: AssessmentAnswers; profile?: FounderProfile; feedback?: OpportunityFeedback; planningConstraints?: unknown };
        if (parsed.answers) setAnswers(parsed.answers);
        if (parsed.profile) setProfile(parsed.profile);
        if (parsed.feedback) setFeedback(parsed.feedback);
        if (isPlanningConstraints(parsed.planningConstraints)) setPlanningConstraints(parsed.planningConstraints);
      }
    } catch {
      // A broken local draft should never block the assessment.
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    window.localStorage.setItem("venture-dna", JSON.stringify({ answers, profile, feedback, planningConstraints }));
  }, [answers, draftLoaded, profile, feedback, planningConstraints]);

  useEffect(() => {
    const screenFromLocation = () => {
      const requested = new URL(window.location.href).searchParams.get("view") as Screen | null;
      if (requested && directScreens.includes(requested)) return requested;
      return "home";
    };
    const requested = screenFromLocation();
    const saved = window.localStorage.getItem("venture-current-screen") as Screen | null;
    const initial = requested !== "home" ? requested : saved && resumableScreens.includes(saved) ? saved : "home";
    if (initial !== "home") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", initial);
      window.history.replaceState({ screen: initial }, "", `${url.pathname}${url.search}${url.hash}`);
      setScreen(initial);
    } else {
      window.history.replaceState({ screen: "home" }, "", window.location.href);
    }
    const handlePopState = () => setScreen(screenFromLocation());
    window.addEventListener("popstate", handlePopState);
    mounted.current = true;
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!mounted.current) return;
    if (resumableScreens.includes(screen)) window.localStorage.setItem("venture-current-screen", screen);
    else if (screen === "home") window.localStorage.removeItem("venture-current-screen");
  }, [screen]);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const requestedView = currentUrl.searchParams.get("view");
    if (requestedView !== "project") return;
    const linkedProjectId = currentUrl.searchParams.get("project");
    const projectId = linkedProjectId ?? window.localStorage.getItem("venture-project-id");
    if (!projectId) return;
    void fetch(`/api/projects/${projectId}`, { cache: "no-store" })
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
  }, [screen]);

  const startQuestionnaire = () => {
    setFeedback({});
    setPlanningConstraints(null);
    navigate("assessment");
  };
  const complete = (completedAnswers: AssessmentAnswers, constraints: PlanningConstraints) => {
    setProfile(calculateProfile(completedAnswers));
    setPlanningConstraints(constraints);
    navigate("profile");
  };
  const completeConversation = (inference: NarrativeInference) => {
    setAnswers({});
    setFeedback({});
    setProfile(inference.profile);
    if (inference.budgetWon !== null && inference.availableHoursPerWeek !== null) {
      setPlanningConstraints({
        budgetWon: inference.budgetWon,
        availableHoursPerWeek: inference.availableHoursPerWeek,
        notes: inference.planningNotes,
        source: "conversation",
      });
    }
    navigate("profile");
  };
  const restartDiscovery = () => {
    setAnswers({});
    setFeedback({});
    setPlanningConstraints(null);
    window.localStorage.removeItem("venture-conversation-draft");
    navigate("start");
  };
  const openPaidProject = async (project: ProjectRecord) => {
    setServerProject(project);
    window.localStorage.setItem("venture-project-id", project.id);
    navigate("project", { projectId: project.id });
  };
  const startOpportunity = async (
    opportunity: RankedOpportunity,
    constraintOverride?: PlanningConstraints | null,
  ) => {
    const activeConstraints = constraintOverride ?? planningConstraints;
    setSelectedProject(opportunity);
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunity,
        founderProfile: createFounderProfilePayload(profile, activeConstraints),
        initialStageInputs: activeConstraints ? createInitialStageInputs(opportunity, activeConstraints) : undefined,
      }),
    });
    const payload = await response.json();
    if (response.status === 403 && payload.error?.code === "PAYMENT_REQUIRED") {
      navigate("checkout");
      return;
    }
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "프로젝트를 시작하지 못했습니다.");
    }
    if (payload.starterLanding?.publicPath) {
      window.localStorage.setItem("venture-landing-path", payload.starterLanding.publicPath);
    }
    await openPaidProject(payload.project);
  };

  const startDirectPlanning = async (input: DirectPlanInput) => {
    const opportunity = createDirectOpportunity(input);
    const constraints: PlanningConstraints = {
      budgetWon: input.budgetWon,
      availableHoursPerWeek: input.availableHoursPerWeek,
      notes: `사용자가 직접 입력한 사업 아이디어: ${input.idea}`,
      source: "direct",
      idea: input.idea,
    };
    setAnswers({});
    setFeedback({});
    setPlanningConstraints(constraints);
    await startOpportunity(opportunity, constraints);
  };

  if (screen === "start") {
    const conversationInProgress = readConversationDraft().responses.some((response) => response.trim().length > 0);
    return <StartChoice questionnaireProgress={Object.keys(answers).length} conversationInProgress={conversationInProgress} onDirect={() => navigate("direct")} onQuestionnaire={startQuestionnaire} onConversation={() => navigate("conversation")} onBack={() => navigate("home")} />;
  }
  if (screen === "direct") return <DirectPlanning onBack={() => navigate("start")} onStart={startDirectPlanning} />;
  if (screen === "assessment") return <Assessment answers={answers} setAnswers={setAnswers} onExit={() => navigate("start")} onComplete={complete} />;
  if (screen === "conversation") return <ConversationDiscovery onBack={() => navigate("start")} onComplete={completeConversation} />;
  if (screen === "profile") return <ProfileResult profile={profile} onExplore={() => navigate("explore")} onRestart={restartDiscovery} />;
  if (screen === "checkout" && selectedProject) return <Checkout opportunity={selectedProject} founderProfile={profile} onBack={() => navigate("explore")} onSuccess={openPaidProject} />;
  if (screen === "project" && selectedProject) return <ProjectWorkspace opportunity={selectedProject} serverProject={serverProject} setServerProject={setServerProject} onHome={() => navigate("home")} />;
  if (screen === "sample" || screen === "delivery") return <FinalDelivery opportunity={paidReportDemoOpportunity} price={49000} brandChoice="곁봄" serverProject={null} demo onHome={() => navigate("home")} onStart={() => navigate("start")} />;
  if (screen === "explore") return <Explore profile={profile} setProfile={setProfile} feedback={feedback} setFeedback={setFeedback} onHome={() => navigate("home")} onStartOpportunity={startOpportunity} />;
  return <Home onStart={() => navigate("start")} onPreview={() => navigate("sample")} />;
}
