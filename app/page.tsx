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
  LockKeyhole,
  Maximize2,
  MessageCircle,
  PackageCheck,
  Printer,
  ReceiptText,
  RefreshCw,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  ThumbsDown,
  TrendingUp,
  Undo2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyPreference,
  calculateProfile,
  coreQuestions,
  founderInterpretations,
  founderLabels,
  inferProfileFromNarrative,
  type AssessmentAnswers,
  type FounderProfile,
  type NarrativeInference,
} from "../lib/assessment";
import {
  rankOpportunities,
  type OpportunityFeedback,
  type RankedOpportunity,
} from "../lib/opportunity-engine";
import type { ManualPreferences } from "../lib/idea-generator";
import type { ProjectRecord } from "../lib/service-domain";
import { BusinessSetupPanel } from "../components/business-setup-panel";
import { MarketPlanPanel } from "../components/market-plan-panel";
import { LandingBuilderPanel } from "../components/landing-builder-panel";
import { OperationsPanel } from "../components/operations-panel";
import { ExecutionLoopPanel } from "../components/execution-loop-panel";
import { RegionalCoveragePanel } from "../components/regional-coverage-panel";
import { QualityAssurancePanel } from "../components/quality-assurance-panel";
import { GrantMatcherPanel } from "../components/grant-matcher-panel";
import { ServiceOpsPanel } from "../components/service-ops-panel";
import { OpenAISettings } from "../components/openai-settings";
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

type Screen =
  | "home"
  | "start"
  | "assessment"
  | "conversation"
  | "profile"
  | "explore"
  | "checkout"
  | "project"
  | "sample"
  | "delivery";
type CapitalFilter = "전체" | "소액" | "중간" | "높음";

const resumableScreens: Screen[] = ["start", "assessment", "conversation", "profile", "explore"];
const directScreens: Screen[] = [...resumableScreens, "sample", "delivery"];

function readConversationDraft() {
  if (typeof window === "undefined") return { step: 0, responses: ["", "", "", ""] };
  try {
    const parsed = JSON.parse(window.localStorage.getItem("venture-conversation-draft") ?? "null") as {
      step?: number;
      responses?: string[];
    } | null;
    if (!parsed?.responses || parsed.responses.length !== 4) return { step: 0, responses: ["", "", "", ""] };
    return {
      step: Math.min(Math.max(parsed.step ?? 0, 0), 3),
      responses: parsed.responses.map((response) => typeof response === "string" ? response : ""),
    };
  } catch {
    return { step: 0, responses: ["", "", "", ""] };
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
        <OpenAISettings light={light} />
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

function Home({
  onStart,
  onPreview,
}: {
  onStart: () => void;
  onPreview: () => void;
}) {
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
        <nav aria-label="하단 안내"><a href="#how">진행 방식</a><a href="#deliverables">결과물</a><a href="#evidence">근거 기준</a><a href="#price">베타 이용</a></nav>
        <div className="home-footer-notice"><strong>이용 안내</strong><p>인공지능 생성 내용은 반드시 원문과 현장 자료로 확인해야 합니다. 전문 자격이 필요한 판단은 관련 기관 또는 전문가에게 문의하세요.</p><small>© 2026 오늘창업</small></div>
      </footer>
    </main>
  );
}

function StartChoice({
  onQuestionnaire,
  onConversation,
  onBack,
  questionnaireProgress,
  conversationInProgress,
}: {
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
          <h1>둘중 하나를<br className="start-heading-break" /> 선택하세요!</h1>
        </div>
        <div className="start-mode-cards">
          <button onClick={onQuestionnaire}>
            <CheckCircle2 />
            <span><strong>질문으로 찾기</strong><small>{questionnaireProgress ? `${Math.min(questionnaireProgress + 1, coreQuestions.length)}번부터 이어서 하기` : "8개의 간단한 선택"}</small></span>
            <ArrowRight />
          </button>
          <button className="conversation-mode" onClick={onConversation}>
            <MessageCircle />
            <span><strong>대화로 찾기</strong><small>{conversationInProgress ? "작성하던 내용 이어서 하기" : "경험과 관심사를 직접 입력"}</small></span>
            <ArrowRight />
          </button>
        </div>
        <div className="start-privacy"><ShieldCheck /><span>주민등록번호나 상세 주소는 입력하지 마세요.</span></div>
      </section>
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
    question: "사업에 사용할 수 있는 예산과 시간, 피하고 싶은 일을 알려주세요.",
    help: "구체적일수록 현실적인 기회를 찾을 수 있어요. 온라인·오프라인 선호도 함께 적어주세요.",
    placeholder: "예: 예산은 300만원 정도, 하루 3시간 가능해요. 재고가 많은 사업과 반복적인 전화 영업은 피하고 온라인 중심이면 좋아요.",
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
  const [review, setReview] = useState<NarrativeInference | null>(null);
  const prompt = conversationPrompts[step];
  const responseLength = responses[step].trim().length;
  const canContinue = responseLength >= minimumConversationResponseLength;
  const remainingCharacters = Math.max(minimumConversationResponseLength - responseLength, 0);
  const update = (value: string) => setResponses((current) => current.map((response, index) => index === step ? value : response));

  const next = () => {
    if (step < conversationPrompts.length - 1) setStep((current) => current + 1);
    else setReview(inferProfileFromNarrative(responses));
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canContinue) next();
  };

  useEffect(() => {
    window.localStorage.setItem("venture-conversation-draft", JSON.stringify({ step, responses }));
  }, [step, responses]);

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
      <div className="assessment-progress"><span style={{ width: `${((step + 1) / conversationPrompts.length) * 100}%` }} /></div>
      <section className="conversation-content">
        <div className="assessment-nav"><button onClick={() => step ? setStep(step - 1) : onBack()}><ArrowLeft /> 이전</button><span>{step + 1} <i>/ {conversationPrompts.length}</i></span></div>
        <div className="conversation-bubble"><span><Sparkles /></span><div><small>{prompt.label}</small><h1>{prompt.question}</h1><p>{prompt.help}</p></div></div>
        <div className="narrative-input">
          <textarea
            autoFocus
            value={responses[step]}
            onChange={(event) => update(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={prompt.placeholder}
            aria-describedby="conversation-input-hint"
            maxLength={1000}
          />
          <div className="narrative-input-meta" id="conversation-input-hint" aria-live="polite">
            <span className={canContinue ? "ready" : ""}>{canContinue ? "Enter를 누르면 다음으로 이동합니다" : `${remainingCharacters}자만 더 적어주세요`}</span>
            <span>{responses[step].length} / 1,000</span>
          </div>
        </div>
        <PrimaryButton onClick={next} disabled={!canContinue}>{step === conversationPrompts.length - 1 ? "입력 내용 확인" : "다음"} <ArrowRight /></PrimaryButton>
      </section>
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
  onComplete: (answers: AssessmentAnswers) => void;
}) {
  const [step, setStep] = useState(Math.min(Object.keys(answers).length, coreQuestions.length - 1));
  const question = coreQuestions[step];
  const selected = answers[question.id];

  const choose = (optionId: string) => {
    const next = { ...answers, [question.id]: optionId };
    setAnswers(next);
    window.setTimeout(() => {
      if (step === coreQuestions.length - 1) onComplete(next);
      else setStep((current) => current + 1);
    }, 260);
  };

  return (
    <main className="assessment-page">
      <Header onHome={onExit} />
      <div className="assessment-progress"><span style={{ width: `${((step + 1) / coreQuestions.length) * 100}%` }} /></div>
      <section className="assessment-content">
        <div className="assessment-nav">
          <button onClick={() => step ? setStep(step - 1) : onExit()}><ArrowLeft /> 이전</button>
          <span>{step + 1} <i>/ {coreQuestions.length}</i></span>
        </div>
        <div className="question-intro">
          <p>{question.context}</p>
          <h1>{question.title}</h1>
        </div>
        <div className="choice-pair">
          {question.options.map((option, index) => (
            <button key={option.id} className={selected === option.id ? "selected" : ""} onClick={() => choose(option.id)}>
              <span className="choice-letter">{String.fromCharCode(65 + index)}</span>
              <h2>{option.title}</h2>
              <p>{option.description}</p>
              <i>{selected === option.id ? <Check /> : <ArrowRight />}</i>
            </button>
          ))}
          <b className="choice-or">또는</b>
        </div>
      </section>
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
        <span className="complete-label"><Check /> 찾기 완료</span>
        <h1><em>{leadInterpretation.title}</em>와<br /><em>{secondInterpretation.title}</em> 성향이 강해요.</h1>
        <p>{leadInterpretation.strength} {secondInterpretation.strength}</p>
        <div className="profile-strengths">
          {profile.topFounder.map((axis) => (
            <article key={axis}><CheckCircle2 /><span><small>나의 강점</small><strong>{founderLabels[axis]}</strong></span></article>
          ))}
        </div>
        <div className="profile-caution"><ShieldCheck /><span><small>시작할 때 주의할 점</small><strong>{leadInterpretation.watchout}</strong></span></div>
        <PrimaryButton onClick={onExplore}>추천 사업 보기 <ArrowRight /></PrimaryButton>
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
  return (
    <article className={`opportunity-card ${item.color} ${state === "saved" ? "saved" : ""}`}>
      <div className="op-card-top">
        <span>{item.sector}</span>
        {state === "saved" && <strong><Check /> 저장됨</strong>}
      </div>
      <h3>{item.title}</h3>
      <p className="op-line">{item.oneLiner}</p>
      <div className="op-meta">
        <span><small>시작 비용</small><strong>{item.capital}</strong></span>
        <span><small>시험 기간</small><strong>{item.launchTime}</strong></span>
        <span><small>수익 방식</small><strong>{item.revenue}</strong></span>
      </div>
      <div className="op-actions">
        <button className={state === "saved" ? "active" : ""} aria-label={state === "saved" ? "저장 취소" : "사업 저장"} title={state === "saved" ? "저장 취소" : "사업 저장"} onClick={onSave}><Heart /></button>
        <button aria-label="추천에서 제외" title="추천에서 제외" onClick={onExclude}><ThumbsDown /></button>
        <button onClick={onOpen}>자세히 <ArrowRight /></button>
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
        <div>
          <span className="section-label">맞춤 추천</span>
          <h1>어떤 사업이<br /><em>마음에 드세요?</em></h1>
          <p>관심 있는 사업을 저장하거나 자세히 살펴보세요.</p>
        </div>
        <div className="explore-head-actions">
          <div className="mode-tabs" aria-label="추천 방식">
            <button className={mode === "dna" ? "active" : ""} onClick={() => { setMode("dna"); setSector(""); }}>맞춤 추천</button>
            <button className={mode === "manual" ? "active" : ""} onClick={() => { setMode("manual"); setCapital("전체"); setSector(""); }}>조건 변경</button>
          </div>
          <button className="regenerate-button" title="새 추천 받기" aria-label="새 추천 받기" onClick={regenerate}><RefreshCw /></button>
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
          <div className="capital-tabs">
            {(["전체", "소액", "중간", "높음"] as CapitalFilter[]).map((value) => <button className={capital === value ? "active" : ""} key={value} onClick={() => setCapital(value)}>{value === "전체" ? "모든 자본 규모" : `${value} 자본`}</button>)}
          </div>
        ) : null}
        <label><select aria-label="사업 분야" value={sector} onChange={(event) => setSector(event.target.value)}><option value="">모든 분야</option>{availableSectors.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown /></label>
      </section>

      <section className="opportunity-grid">
        {visible.map((item) => (
          <div className="op-card-wrap" key={item.id}>
            <OpportunityCard item={item} state={feedback[item.id]} onOpen={() => setSelected(item)} onSave={() => react(item, "saved")} onExclude={() => react(item, "excluded")} />
          </div>
        ))}
      </section>
      {!ranked.length && <div className="empty-results"><Compass /><h3>이 조건의 기회를 모두 살펴봤어요</h3><p>필터를 넓히거나 제외한 아이디어를 다시 불러와보세요.</p><button onClick={() => { setCapital("전체"); setSector(""); setFeedback({}); }}>전체 기회 다시 보기</button></div>}
      {ranked.length > 4 && <button className="more-opportunities" onClick={() => setShowAll(!showAll)}>{showAll ? "추천 접기" : `추천 ${ranked.length - 4}개 더 보기`} <ChevronDown /></button>}

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
  const [method, setMethod] = useState("card");
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");

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
            service: true,
            privacy: true,
            refund: true,
            aiLimitations: true,
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
            <label className="agreement"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span><strong>필수 약관에 모두 동의합니다.</strong><small>서비스 제공 범위, 환불 정책, 인공지능 생성 결과물의 한계를 확인했습니다.</small></span><ArrowRight /></label>
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
            <button className="pay-button" disabled={!agreed || paying} onClick={pay}>{paying ? <><span className="pay-spinner" /> 안전한 결제창 준비 중...</> : <>990,000원 결제하기 <ArrowRight /></>}</button>
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
    tasks: ["선택한 사업 기회 최종 확인", "자동 시작 질문 확인", "보유 자료와 참고 주소 제출"],
    output: "사업 실행 요약서",
  },
  {
    name: "고객 진단",
    period: "2~4일차",
    title: "누구의 어떤 문제인지 선명하게 만들어요",
    description: "가정으로 남아 있는 고객 문제를 인터뷰 질문과 시장 자료로 검증합니다.",
    tasks: ["핵심 고객 한 문장으로 정의", "고객 인터뷰 질문 검토", "경쟁 대안과 시장 근거 확인"],
    output: "고객·시장 진단서",
  },
  {
    name: "상품·가격",
    period: "5~8일차",
    title: "실제로 살 수 있는 상품으로 바꿔요",
    description: "고객의 문제를 가장 작게 해결하는 첫 상품과 가격, 손익 기준을 설계합니다.",
    tasks: ["3단계 상품 구성 선택", "추천 가격과 원가 입력", "첫 매출 목표 고객 수 확인"],
    output: "상품 구성표·손익 시트",
  },
  {
    name: "이름·소개 문구",
    period: "9~12일차",
    title: "고객이 이해할 언어를 만들어요",
    description: "이름보다 먼저 고객에게 할 약속과 다른 점을 정하고 한 줄 소개 문구로 발전시킵니다.",
    tasks: ["핵심 문구 방향 선택", "고객에게 보여줄 이름 후보 검토", "표현 방식과 쓰면 안 되는 표현 확인"],
    output: "이름·소개 문구 모음",
  },
  {
    name: "판매 페이지",
    period: "13~17일차",
    title: "첫 고객을 만날 페이지를 열어요",
    description: "문제, 해결책, 가격, 자주 묻는 질문과 문의 행동이 연결된 휴대전화용 판매 페이지를 제작합니다.",
    tasks: ["첫 화면 문구와 신청 버튼 승인", "상품·가격 영역 확인", "문의 입력칸과 휴대전화 화면 시험"],
    output: "공개 가능한 판매 페이지",
  },
  {
    name: "첫 공개",
    period: "18~21일차",
    title: "작게 공개하고 실제 반응을 확인해요",
    description: "큰 광고비를 쓰기 전에 잠재 고객에게 제안하고 다음 개선점을 수집합니다.",
    tasks: ["첫 고객 10명 목록 만들기", "제안 메시지 발송", "반응 기록과 30일 계획 확정"],
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

function FinalDelivery({
  opportunity,
  price,
  brandChoice,
  serverProject,
  demo = false,
  onHome,
  onStart,
}: {
  opportunity: RankedOpportunity;
  price: number;
  brandChoice: string;
  serverProject: ProjectRecord | null;
  demo?: boolean;
  onHome: () => void;
  onStart?: () => void;
}) {
  const savedStageBrand = typeof serverProject?.stages[3]?.inputs.selectedName === "string"
    ? serverProject.stages[3].inputs.selectedName
    : "";
  const missionBrand = serverProject?.launchMissionWorkspace?.brand.brandName ?? "";
  const resolvedBrandName = brandChoice || missionBrand || savedStageBrand || opportunity.title;
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
  const sellingPrice = financial?.grossPrice ?? price;
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
    customer: opportunity.customer,
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
      <section className="delivery-content" id={demo ? "sample-result-details" : "delivery-result-details"}>
        <div className="delivery-main">
          <section className={`final-report-viewer ${activeReport === "launch" ? "mission-mode" : ""}`}>
            <header className="final-report-chrome">
              <div aria-hidden="true"><i /><i /><i /></div>
              <span><Sparkles /> {resolvedBrandName} 맞춤 사업 실행 보고서</span>
              <em><i /> {deliveryQuality?.status === "blocked" ? "보강 필요" : "완성"}</em>
            </header>
            <aside className="final-report-sidebar">
              <header><small>최종 결과</small><strong>{resolvedBrandName}</strong></header>
              <nav aria-label="최종 보고서 목차">
                {reportTabs.map((tab, index) => {
                  const Icon = tab.icon;
                  return <button key={tab.id} aria-label={tab.label} data-report-tab={tab.id} className={activeReport === tab.id ? "active" : ""} onClick={() => setActiveReport(tab.id)}><Icon /><span><b>{tab.label}</b><small>{tab.id === "launch" ? "선택 · 결과물과 별도" : `${index + 1}단계${tab.id === "documents" ? " · 최종" : ""}`}</small></span>{activeReport === tab.id && <Check />}</button>;
                })}
              </nav>
              <div className="final-report-sidebar-status"><span><CheckCircle2 /> AI 자동 검수</span><strong>{deliveryPack?.qualityScore ?? 0}점</strong><small>{deliveryQuality?.label ?? `${deliveryPack?.completeCount ?? 0}개 결과물 준비`}</small></div>
            </aside>
            <div className="final-report-main">
              <header><div><span><ActiveReportIcon /> 맞춤 사업 실행 보고서</span><h2>{activeReportTab.label}</h2></div><em><i /> {activeReport === "documents" && deliveryQuality?.status === "blocked" ? "보강 필요" : "준비됨"}</em></header>
              <article className="report-sheet">
              {activeReport === "summary" && <>
                <h3>{opportunity.title}</h3>
                <p className="report-lead">{opportunity.oneLiner}</p>
                <div className="report-verdict"><BadgeCheck /><span><small>추천 시작 방법</small><strong>한 지역에서 직접 운영해 본 뒤, 반복 수요가 확인되면 넓히세요.</strong></span></div>
                <div className="report-facts">
                  <div><small>핵심 고객</small><strong>{opportunity.customer}</strong></div>
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
                    customer: opportunity.customer,
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
                <section className="delivery-gift-hero"><div className="delivery-gift-mark"><Gift /><i><Sparkles /></i></div><div><small>당신의 사업 시작 상자</small><h3>{resolvedBrandName}의 첫 실행 자료가 준비되었습니다</h3><p>확인된 내용, 자동 계산, 아직 확인할 내용을 나누고 문서마다 다른 납품 기준으로 검사했습니다.</p><span><CheckCircle2 /> AI 자동 검수 {deliveryPack?.qualityScore ?? 0}점</span></div><aside><strong>{deliveryPack?.completeCount ?? 0}</strong><small>/ {deliveryQuality?.totalCount ?? 10}개 기준 통과</small><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("zip")}><Download /> 한 번에 받기</button></aside></section>
                <div className="delivery-section-heading"><div className="report-title-row"><PackageCheck /><div><small>6단계 · 최종</small><h3>결과물 열기와 내려받기</h3></div></div><div className="delivery-package-actions"><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("pdf")}><FileText /> 전체 PDF</button><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("docx")}><BookOpen /> 전체 워드</button><button disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("zip")}><Download /> 전체 받기</button></div></div>
                <p className="report-lead"><strong>이곳이 마지막 단계입니다.</strong> 실행 도우미를 완료하지 않아도 아래 결과물은 그대로 열고 내려받을 수 있습니다.</p>
                {deliveryQuality && <section className={`delivery-quality-panel ${deliveryQuality.status}`}>
                  <header><span><ShieldCheck /></span><div><small>AI 납품 전 자동 검수</small><strong>{deliveryQuality.label}</strong><p>문서 분량만 세지 않고 숫자 일치, 출처 표시, 시험용 자료, 필수 내용을 함께 확인합니다.</p></div><em>{deliveryQuality.score}점</em></header>
                  <div>{deliveryQuality.checks.map((check) => <article key={check.id} className={check.passed ? "passed" : "needs-work"}><i>{check.passed ? <Check /> : <CircleHelp />}</i><span><strong>{check.label}</strong><small>{check.detail}</small></span></article>)}</div>
                  {deliveryQuality.actions.length > 0 && <footer><CircleHelp /><p><strong>결과물은 지금 받을 수 있습니다.</strong> {deliveryQuality.actions[0]}</p></footer>}
                </section>}
                {documentMessage && <p className="delivery-document-status" role="status">{documentMessage}</p>}
                <div className="deliverable-list">
                  {(deliveryPack?.items ?? []).map((item, index) => {
                    const Icon = deliveryIcons[item.id as keyof typeof deliveryIcons] ?? FileText;
                    return <article key={item.id} className={item.quality?.status === "needs_work" ? "needs-work" : ""} style={{ "--delivery-index": index } as React.CSSProperties}><span className="delivery-doc-icon"><Icon /></span><div className="delivery-document-summary"><small>{String(index + 1).padStart(2, "0")} · {item.complete ? "최종 확인 완료" : item.contentReady ? "문서 준비 · 사실 확인 남음" : item.quality?.label ?? "생성 필요"}</small><strong>{item.title}</strong><p>{item.type}</p>{item.quality && <span>{item.quality.metrics.estimatedPages}쪽 예상 · {item.quality.verificationLabel} · 자동 검수 {item.quality.score}점</span>}{item.qualityReason && <span className="document-readiness-note">{item.qualityReason}</span>}</div><div className="delivery-document-actions"><button onClick={() => setDocumentPreview(item)}><Maximize2 /> 열기</button><button title="인쇄용 PDF 받기" aria-label={`${item.title} 인쇄용 PDF 받기`} disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("pdf", item)}><FileText /></button><button title="수정용 워드 받기" aria-label={`${item.title} 수정용 워드 받기`} disabled={Boolean(documentDownload)} onClick={() => void downloadDocuments("docx", item)}><BookOpen /></button></div></article>;
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
            <section className="document-preview-cover"><span>창업 실행 캔버스</span><h1>{documentPreview.title}</h1><p>{documentPreview.type}</p><dl><div><dt>프로젝트</dt><dd>{landingDraft.businessName || opportunity.title}</dd></div><div><dt>목표 고객</dt><dd>{opportunity.customer}</dd></div>{documentPreview.quality && <><div><dt>자동 검수</dt><dd>{documentPreview.quality.score}점 · {documentPreview.quality.label}</dd></div><div><dt>근거 상태</dt><dd>{documentPreview.quality.verificationLabel}</dd></div></>}</dl>{demo && <aside>화면 검증용 가상 사례이며 실제 사업 판단에 사용할 수 없습니다.</aside>}</section>
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

function buildStageInput(
  stageIndex: number,
  opportunity: RankedOpportunity,
  price: number,
  brandChoice: string,
  note: string,
) {
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
      primaryCustomer: opportunity.customer,
      problemStatement: opportunity.oneLiner,
      interviewNotes: [],
      evidenceUrls: [],
      unknowns: ["실제 지불 의사", "구매 결정자", "구매 빈도"],
    },
    {
      coreOutcome: opportunity.oneLiner,
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
      preferredNames: brandChoice ? [brandChoice] : [],
      selectedName: brandChoice || undefined,
      legalNameCheckRequired: true,
    },
    {
      headline: opportunity.oneLiner,
      subheadline: "현재 상황을 진단하고 가장 작은 실행부터 함께 만듭니다.",
      callToAction: "무료 진단 신청",
      contactMethod: "신청폼",
      contactValue: "https://venture-dna.kr/contact",
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
  const [price, setPrice] = useState(opportunity.capital === "소액" ? 290000 : opportunity.capital === "중간" ? 790000 : 1490000);
  const [brandChoice, setBrandChoice] = useState("");
  const [stageNote, setStageNote] = useState("");
  const [revisionText, setRevisionText] = useState("");
  const [serviceAction, setServiceAction] = useState<"idle" | "saving" | "generating" | "approving" | "revising" | "retrying">("idle");
  const [serviceError, setServiceError] = useState("");
  const [latestJob, setLatestJob] = useState<GenerationJobRecord | null>(null);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const current = launchStages[activeStage];
  const completedStages = activeStage;
  const progress = Math.round((completedStages / launchStages.length) * 100);
  const allCurrentChecked = current.tasks.every((_, index) => checked[`${activeStage}-${index}`]);
  const currentServerStage = serverProject?.stages[activeStage];
  const latestArtifact = currentServerStage?.artifacts[0];
  const betaAccess = serverProject?.packagePrice === 0;
  const setupRequired = activeStage === 0 && Boolean(serverProject) && !serverProject?.businessAssessment;
  const reviewStep = !latestArtifact ? 1 : allCurrentChecked ? 3 : 2;
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

  useEffect(() => {
    setStageNote("");
    setRevisionText("");
    setServiceError("");
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
    setChecked((currentChecked) => ({ ...currentChecked, [key]: !currentChecked[key] }));
  };

  const moveToChecklist = () => {
    document.getElementById("stage-checklist")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const moveToRevision = () => {
    const selector = latestArtifact ? ".artifact-review-actions textarea" : ".service-workflow > label textarea";
    const input = document.querySelector<HTMLTextAreaElement>(selector);
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
      const inputResponse = await fetch(`/api/projects/${serverProject.id}/stages/${activeStage}/inputs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildStageInput(activeStage, opportunity, price, brandChoice, stageNote)),
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

  if (delivered || serverProject?.status === "completed") {
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
          <div><strong>{activeStage + 1}단계 / {launchStages.length}단계</strong><span>{current.name}</span></div>
          <div>
            {launchStages.map((stage, index) => <button key={stage.name} aria-current={index === activeStage ? "step" : undefined} disabled={index > activeStage} className={`${index === activeStage ? "active" : ""} ${index < activeStage ? "done" : ""}`} onClick={() => setActiveStage(index)}><span>{index < activeStage ? <Check /> : index + 1}</span><small>{stage.name}</small></button>)}
          </div>
        </nav>
        <div className="project-overview">
          <div><span className="project-status">진행 중 · {current.period}</span><p>21일 창업 실행 과정</p><h1>{opportunity.title}</h1><div><span><CalendarDays /> 목표 공개일 7월 31일</span><span><BriefcaseBusiness /> {opportunity.model}</span></div></div>
          <div className="project-progress"><strong>{progress}<small>%</small></strong><span>전체 진행률</span><i><b style={{ width: `${progress}%` }} /></i></div>
        </div>
        <div className="stage-layout">
          <article className="current-stage-card">
            <div className="stage-heading"><span>{String(activeStage + 1).padStart(2, "0")}</span><div><small>{current.period} · 현재 단계</small><h2>{current.title}</h2><p>{current.description}</p></div></div>
            {serverProject && activeStage === 0 && <BusinessSetupPanel project={serverProject} onSaved={setServerProject} />}
            {serverProject && activeStage === 1 && <MarketPlanPanel project={serverProject} onSaved={setServerProject} />}
            {serverProject && activeStage === 1 && <RegionalCoveragePanel project={serverProject} />}
            {serverProject && activeStage === 4 && <LandingBuilderPanel project={serverProject} />}
            {serverProject && activeStage === 5 && <OperationsPanel project={serverProject} onSaved={setServerProject} />}
            {serverProject && activeStage === 5 && <ExecutionLoopPanel project={serverProject} onSaved={setServerProject} />}
            {serverProject && activeStage === 5 && <QualityAssurancePanel project={serverProject} onSaved={setServerProject} />}
            {serverProject && activeStage === 5 && <GrantMatcherPanel project={serverProject} onSaved={setServerProject} />}
            {serverProject && (
              <section className="service-workflow">
                <div className="step-by-step-guide" aria-label="현재 단계 진행 방법">
                  <div className={reviewStep >= 1 ? "active" : ""}><span>{reviewStep > 1 ? <Check /> : "1"}</span><p><strong>정보 확인</strong><small>조건을 적고 초안을 만들어요</small></p></div>
                  <i />
                  <div className={reviewStep >= 2 ? "active" : ""}><span>{reviewStep > 2 ? <Check /> : "2"}</span><p><strong>내용 검토</strong><small>결과와 체크리스트를 확인해요</small></p></div>
                  <i />
                  <div className={reviewStep >= 3 ? "active" : ""}><span>3</span><p><strong>승인하고 이동</strong><small>완료하면 다음 단계로 가요</small></p></div>
                </div>
                <div className="service-workflow-head">
                  <div><span className={`service-state ${currentServerStage?.status ?? "not_started"}`} /><p><strong>{latestArtifact ? "초안이 준비됐어요" : "먼저 정보를 확인해주세요"}</strong><small>{stageStatusLabel[currentServerStage?.status ?? "not_started"]} · 자동 저장 프로젝트</small></p></div>
                  {latestArtifact && <em>결과물 {latestArtifact.version}판</em>}
                </div>
                <label><span>추가로 알려줄 내용 <em>선택사항</em></span><textarea value={stageNote} onChange={(event) => setStageNote(event.target.value)} placeholder="예: 예산은 100만 원이고, 평일 저녁에만 운영할 수 있어요." /><small>잘 모르겠다면 비워두어도 됩니다. 기본 정보로 초안을 만들어드려요.</small></label>
                {serviceError && <div className="service-error"><CircleHelp /> <span>{serviceError}</span><button disabled={serviceAction !== "idle" || (!canRetryGeneration && currentServerStage?.status === "failed")} onClick={handleGenerationRecovery}>{currentServerStage?.status === "failed" ? (canRetryGeneration ? `다시 시도 (${latestJob?.attempt ?? 0}/3)` : "재시도 한도 초과") : "다시 시도"}</button></div>}
                {!latestArtifact ? (
                  <button className="generate-real-artifact" disabled={serviceAction !== "idle" || setupRequired} onClick={generateServerArtifact}>{setupRequired ? "먼저 위에서 사업 조건과 손익분기점을 계산해주세요" : serviceAction === "saving" ? "입력 내용을 안전하게 저장 중..." : serviceAction === "generating" ? "맞춤 초안을 만들고 있어요..." : <><Sparkles /> 이 정보로 초안 만들기 <ArrowRight /></>}</button>
                ) : (
                  <div className="artifact-review-actions">
                    <div className="review-ready"><CheckCircle2 /><p><strong>검토할 초안이 준비됐어요</strong><small>아래 내용을 읽고 체크리스트를 완료해주세요.</small></p><button onClick={moveToChecklist}>검토하러 가기 <ArrowDown /></button></div>
                    <details><summary>전문가용 원본 자료 보기</summary><pre>{JSON.stringify(latestArtifact.content, null, 2)}</pre></details>
                    <label><span>수정하고 싶은 점 <em>선택사항</em></span><textarea value={revisionText} onChange={(event) => setRevisionText(event.target.value)} placeholder="예: 가격 근거를 더 쉽게 설명하고, 직장인 고객 사례를 추가해주세요." /><small>{revisionText.trim().length}/10자 이상 입력하면 수정본을 만들 수 있어요.</small></label>
                    <div><button disabled={revisionText.trim().length < 10 || serviceAction !== "idle"} onClick={reviseServerArtifact}><RefreshCw /> {serviceAction === "revising" ? "요청을 반영하는 중..." : "수정 요청 보내기"}</button><button className="approve-real-artifact" disabled={!allCurrentChecked || serviceAction !== "idle"} onClick={approveServerArtifact}><CheckCircle2 /> {serviceAction === "approving" ? "다음 단계를 준비 중..." : allCurrentChecked ? "확인 완료 · 다음 단계로" : "먼저 아래 항목을 확인해주세요"}</button></div>
                  </div>
                )}
              </section>
            )}
            <StageWorkProduct stage={activeStage} opportunity={opportunity} price={price} setPrice={setPrice} brandChoice={brandChoice} setBrandChoice={setBrandChoice} onRegenerate={generateServerArtifact} onRequestRevision={moveToRevision} isWorking={serviceAction !== "idle"} />
            <div className="stage-task-list" id="stage-checklist">
              <div><strong>하나씩 확인해주세요</strong><span>{current.tasks.filter((_, index) => checked[`${activeStage}-${index}`]).length} / {current.tasks.length} 확인</span></div>
              <p className="checklist-help">내용을 읽고 이해했다면 항목을 눌러 체크하세요. 언제든 다시 해제할 수 있어요.</p>
              {current.tasks.map((task, index) => <button key={task} aria-pressed={Boolean(checked[`${activeStage}-${index}`])} className={checked[`${activeStage}-${index}`] ? "checked" : ""} onClick={() => toggleTask(index)}><span>{checked[`${activeStage}-${index}`] ? <Check /> : index + 1}</span><strong>{task}</strong><em>{checked[`${activeStage}-${index}`] ? "확인됨" : "눌러서 확인"}</em></button>)}
            </div>
            <div className="stage-output"><PackageCheck /><div><small>이 단계가 끝나면</small><strong>{current.output}</strong>이 완성됩니다.</div></div>
            {!serverProject && <button className="complete-stage" disabled={!allCurrentChecked} onClick={() => activeStage < launchStages.length - 1 ? setActiveStage((stage) => stage + 1) : setDelivered(true)}>{activeStage === launchStages.length - 1 && allCurrentChecked ? "최종 납품함 열기" : allCurrentChecked ? "이 단계 완료하고 다음으로" : "할 일을 모두 확인해주세요"} <ArrowRight /></button>}
          </article>
          <aside className="project-side-panel">
            <section><div className="panel-title"><Sparkles /><div><strong>생성 작업 상태</strong><small>실제 서버 상태를 표시합니다</small></div></div><div className="generation-status"><span className={serviceAction !== "idle" ? "running" : ""} /><p><strong>{current.output}</strong><small>{serviceAction === "saving" ? "입력 저장 중" : serviceAction === "generating" || serviceAction === "revising" || serviceAction === "retrying" ? "결과 생성 중" : latestArtifact ? `버전 ${latestArtifact.version} 검토 가능` : currentServerStage?.status === "failed" ? `생성 실패 · 시도 ${latestJob?.attempt ?? 0}/3` : "입력 대기"}</small></p><em>{currentServerStage?.status ?? "demo"}</em></div></section>
            {serverProject && <ServiceOpsPanel project={serverProject} />}
            <section><div className="panel-title"><FileText /><div><strong>승인된 문서</strong><small>단계 승인 후 여기에 쌓입니다</small></div></div>{serverProject ? serverProject.stages.filter((stage) => stage.approvedArtifactId).map((stage) => <button className="project-doc" key={stage.id}><span><FileText /></span><div><strong>{launchStages[stage.stageIndex].output}</strong><small>{stage.artifacts.find((artifact) => artifact.id === stage.approvedArtifactId)?.version ?? 1}판 · 승인 완료</small></div><ArrowRight /></button>) : activeStage === 0 ? <p className="empty-doc">첫 단계 완료 후 문서가 생성됩니다.</p> : launchStages.slice(0, activeStage).map((stage) => <button className="project-doc" key={stage.output}><span><FileText /></span><div><strong>{stage.output}</strong><small>화면 확인용 문서</small></div><ArrowRight /></button>)}</section>
            <section className="help-panel"><CircleHelp /><div><strong>다음 행동이 헷갈리나요?</strong><p>현재 단계의 체크리스트로 이동해 하나씩 확인하면 자동으로 다음 행동을 안내합니다.</p><button onClick={moveToChecklist}>현재 할 일 보기</button></div></section>
          </aside>
        </div>
        <div className="mobile-sticky-action" aria-live="polite">
          <div><small>현재 할 일</small><strong>{!serverProject ? `체크리스트 확인 · ${current.tasks.filter((_, index) => checked[`${activeStage}-${index}`]).length}/${current.tasks.length}` : !latestArtifact ? "맞춤 초안 만들기" : !allCurrentChecked ? `내용 확인하기 · ${current.tasks.filter((_, index) => checked[`${activeStage}-${index}`]).length}/${current.tasks.length}` : "확인 완료, 다음 단계로 이동"}</strong></div>
          {!serverProject ? <button disabled={!allCurrentChecked} onClick={() => activeStage < launchStages.length - 1 ? setActiveStage((stage) => stage + 1) : setDelivered(true)}>다음 <ArrowRight /></button> : !latestArtifact ? <button disabled={serviceAction !== "idle" || setupRequired} onClick={generateServerArtifact}>{setupRequired ? "사업 조건·손익 계산 먼저" : serviceAction === "idle" ? "초안 만들기" : "처리 중..."}</button> : !allCurrentChecked ? <button onClick={moveToChecklist}>확인하기 <ArrowDown /></button> : <button disabled={serviceAction !== "idle"} onClick={approveServerArtifact}>{serviceAction === "idle" ? "승인하고 다음" : "처리 중..."}</button>}
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
  const [selectedProject, setSelectedProject] = useState<RankedOpportunity | null>(null);
  const [serverProject, setServerProject] = useState<ProjectRecord | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const mounted = useRef(false);

  const navigate = useCallback((next: Screen, options?: { replace?: boolean }) => {
    const url = new URL(window.location.href);
    if (next === "home") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    const method = options?.replace ? "replaceState" : "pushState";
    window.history[method]({ screen: next }, "", `${url.pathname}${url.search}${url.hash}`);
    setScreen(next);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("venture-dna");
      if (saved) {
        const parsed = JSON.parse(saved) as { answers?: AssessmentAnswers; profile?: FounderProfile; feedback?: OpportunityFeedback };
        if (parsed.answers) setAnswers(parsed.answers);
        if (parsed.profile) setProfile(parsed.profile);
        if (parsed.feedback) setFeedback(parsed.feedback);
      }
    } catch {
      // A broken local draft should never block the assessment.
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    window.localStorage.setItem("venture-dna", JSON.stringify({ answers, profile, feedback }));
  }, [answers, draftLoaded, profile, feedback]);

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
    if (new URL(window.location.href).searchParams.get("view") === "delivery") return;
    const projectId = window.localStorage.getItem("venture-project-id");
    if (!projectId) return;
    void fetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("저장된 프로젝트를 불러오지 못했습니다.");
        return response.json();
      })
      .then((payload: { project: ProjectRecord }) => {
        setServerProject(payload.project);
        setSelectedProject(payload.project.opportunity as unknown as RankedOpportunity);
        navigate("project", { replace: true });
      })
      .catch(() => {
        window.localStorage.removeItem("venture-project-id");
      });
  }, [navigate]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  const startQuestionnaire = () => {
    setFeedback({});
    navigate("assessment");
  };
  const complete = (completedAnswers: AssessmentAnswers) => {
    setProfile(calculateProfile(completedAnswers));
    navigate("profile");
  };
  const completeConversation = (inference: NarrativeInference) => {
    setAnswers({});
    setFeedback({});
    setProfile(inference.profile);
    navigate("profile");
  };
  const restartDiscovery = () => {
    setAnswers({});
    setFeedback({});
    window.localStorage.removeItem("venture-conversation-draft");
    navigate("start");
  };
  const openPaidProject = async (project: ProjectRecord) => {
    setServerProject(project);
    window.localStorage.setItem("venture-project-id", project.id);
    navigate("project");
  };
  const startOpportunity = async (opportunity: RankedOpportunity) => {
    setSelectedProject(opportunity);
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunity, founderProfile: profile }),
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

  if (screen === "start") {
    const conversationInProgress = readConversationDraft().responses.some((response) => response.trim().length > 0);
    return <StartChoice questionnaireProgress={Object.keys(answers).length} conversationInProgress={conversationInProgress} onQuestionnaire={startQuestionnaire} onConversation={() => navigate("conversation")} onBack={() => navigate("home")} />;
  }
  if (screen === "assessment") return <Assessment answers={answers} setAnswers={setAnswers} onExit={() => navigate("start")} onComplete={complete} />;
  if (screen === "conversation") return <ConversationDiscovery onBack={() => navigate("start")} onComplete={completeConversation} />;
  if (screen === "profile") return <ProfileResult profile={profile} onExplore={() => navigate("explore")} onRestart={restartDiscovery} />;
  if (screen === "checkout" && selectedProject) return <Checkout opportunity={selectedProject} founderProfile={profile} onBack={() => navigate("explore")} onSuccess={openPaidProject} />;
  if (screen === "project" && selectedProject) return <ProjectWorkspace opportunity={selectedProject} serverProject={serverProject} setServerProject={setServerProject} onHome={() => navigate("home")} />;
  if (screen === "sample" || screen === "delivery") return <FinalDelivery opportunity={paidReportDemoOpportunity} price={49000} brandChoice="곁봄" serverProject={null} demo onHome={() => navigate("home")} onStart={() => navigate("start")} />;
  if (screen === "explore") return <Explore profile={profile} setProfile={setProfile} feedback={feedback} setFeedback={setFeedback} onHome={() => navigate("home")} onStartOpportunity={startOpportunity} />;
  return <Home onStart={() => navigate("start")} onPreview={() => navigate("sample")} />;
}
