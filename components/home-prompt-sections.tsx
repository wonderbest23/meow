"use client";

/*
 * 첫 화면 아래 구간(2026-10-23 승인 디자인) — 계획부터 개업까지 · 어떤 사업이든 · 결과물 · 계획 다음의 일 · 이용 요금 · 자주 묻는 질문 · 마지막 시작 단추.
 *
 * 링크는 실제로 열리는 곳으로만 보낸다: 예시 계획서·예시 홈페이지(sample_coffee, 로그인 없이 열람), 새 대화, 내 사업.
 * 단계 이름(개업 준비·유지보수)은 journey-steps.ts 한 곳의 이름을 쓴다.
 * 가격은 lib/payments/domain.ts 값을 그대로 쓴다(화면에 숫자를 적어 두지 않는다).
 * 등장 움직임은 자바스크립트가 붙은 뒤에만 숨김 상태를 얹는다 — 스크립트가 없거나 움직임 줄이기면 처음부터 다 보인다.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { BUNDLE_PRODUCT_AMOUNT, BUNDLE_PRODUCT_NAME, DOMAIN_PRODUCT_AMOUNT, DOMAIN_PURCHASE_PRODUCT_AMOUNT, HOMEPAGE_PRODUCT_AMOUNT, PACKAGE_AMOUNT, REGEN_INCLUDED } from "../lib/payments/domain";
import { PPT_GENERATION_VERIFIED } from "../lib/plan-builder/deck-availability";
import { newChatEntryHref, newChatHref, studioHref, type EntryMode } from "../lib/plan-builder/studio";
import { JOURNEY_LABELS } from "../lib/plan-builder/journey-steps";
import { IphoneMockup } from "./iphone-mockup";
import styles from "./home-prompt-sections.module.css";

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
const SAMPLE_PLAN = "/plan/document?planId=sample_coffee";
const SAMPLE_HOMEPAGE = "/plan/homepage?planId=sample_coffee";
/* 예시 사업의 개업 준비·유지보수 — 작업실에서 로그인 없이 열린다(유지보수는 예시 실적 기록을 보기 전용으로 보여 준다, sample-operations.ts) */
const SAMPLE_OPERATIONS = studioHref("sample_coffee", "operations");
/* 새 대화 — 작업실이 켜져 있으면 작업실의 새 대화로(newChatHref) */
const NEW_CHAT = newChatHref();

const FEATURES = [
  { label: "실행용 사업계획서", href: SAMPLE_PLAN },
  { label: "계획서로 만드는 홈페이지", href: SAMPLE_HOMEPAGE },
  { label: "업종별 신고·등록 순서 안내", href: "#after-launch" },
  { label: "홍보 문구·SNS 글 만들기", href: "#after-launch" },
  { label: "개업 뒤 매출·할 일 관리", href: "#after-ops" },
  { label: "막힐 때 바로 묻는 창업 상담", href: NEW_CHAT },
];

/* 새 대화의 첫 선택지(생각한 사업이 있어요 · 사업을 운영 중이에요 · 아이디어를 찾고 있어요)를 카드가 미리 골라 준다(?entry=) */
/*
 * '어떤 사업이든' 구간 — 한 손님이 거친 과정 전부를 단계별로 보여 준다(2026-11-18 사장님: 제목이나 홍보 글만 보여서는 사업을 기획해 주는 것으로 안 보인다 · 진행한 과정 전부를 · 차례로 넘어가게).
 * 다섯 단계: 대화 → 정리된 사업 정보 → 사업 방향(숫자 포함) → 다른 길과 확인할 것 → 바로 할 일.
 * 내용은 2026-11-17 AI 손님 점검(가상 손님 · 실제 AI)의 타로 상담 손님 기록 그대로다. 가상 손님이라 실제 고객 사례가 아니다 — "예시"라고 적는다.
 * 이 손님을 고른 까닭: 심사 점수가 가장 높고 카드 숫자가 서로 맞는다(15,000원 − 1,000원 = 14,000원, 30,000원 ÷ 14,000원 → 3명 · 직접 검산).
 * 점검에서 지적받은 값(업종 · 하루 10명 · 6개월 목표)과 그 값을 언급한 문장은 뺐다.
 * 읽기 쉽게(2026-11-18 사장님: 토스페이먼츠 수준으로) 단계마다 큰 제목 한 줄 · 짧은 글 · 넓은 여백으로 줄였다. 제목 · 이름 · 숫자는 나온 그대로고, 나머지 문장은 뜻을 바꾸지 않고 짧게 고쳤다.
 * 단계는 7초마다 다음으로 넘어간다(구간이 보일 때만 · 단계를 직접 누르면 멈춘다). 움직임 줄이기면 넘기지 않는다. 다섯 단계를 같은 칸에 겹쳐 높이가 변하지 않는다.
 */
const DEMO_STAGES = ["대화", "사업 정보 정리", "사업 방향", "다른 길 · 확인할 것", "바로 할 일"];
const DEMO_STAGE_MS = 7000;
const DEMO_TALK: Array<{ who: "me" | "ai"; text: string }> = [
  { who: "me", text: "저 타로 보는 사람인데요, 온라인으로 타로 상담 해 보고 싶어요!!" },
  { who: "ai", text: "준비에 쓸 수 있는 돈은 얼마인가요?" },
  { who: "me", text: "한 50만원 정도요? 타로카드랑 천은 이미 있어요" },
  { who: "ai", text: "일주일에 몇 시간 쓸 수 있나요?" },
  { who: "me", text: "평일 저녁이랑 주말에 한 20시간 정도요" },
];
const DEMO_FIELDS: Array<{ label: string; value: string; mine?: boolean }> = [
  { label: "제공할 상품", value: "온라인 타로 상담", mine: true },
  { label: "주요 고객", value: "연애·진로 고민 있는 20~30대" },
  { label: "고객을 만나는 곳", value: "인스타그램" },
  { label: "판매 가격", value: "15,000원" },
  { label: "준비 예산", value: "500,000원", mine: true },
  { label: "일주일에 쓸 시간", value: "20시간", mine: true },
];
const DEMO_START = ["인스타그램으로 알리고 DM으로 예약받기", "채팅·통화로 20~30분 상담", "풀이 요약을 보내고 후기 받기"];
const DEMO_ALTERNATIVES = [
  { name: "상담 앱에 입점하기", tradeoff: "손님 모으기는 쉽지만 수수료만큼 남는 돈이 줄어요." },
  { name: "평일 저녁마다 + 주말 종일", tradeoff: "주 20시간을 10시간 넘게 넘겨요. 알바와 함께 하기엔 지쳐요." },
];
const DEMO_ASSUMPTIONS = [
  { statement: "모르는 사람도 15,000원을 낼까?", check: "인스타에 안내 글을 올려 지인이 아닌 분의 예약 의사를 세어 봐요." },
  { statement: "상담 1건이 30분 안에 끝날까?", check: "지인 상담 3~5건의 시간을 재 봐요." },
];
const STARTS: Array<{ title: string; action: string; entry: EntryMode }> = [
  { title: "처음 창업해요", action: "아이디어로 시작하기", entry: "startup" },
  { title: "이미 사업 중이에요", action: "내 사업 개선하기", entry: "operating" },
  { title: "아이디어가 아직 없어요", action: "사업안 추천받기", entry: "exploring" },
];

/*
 * 결과물 그림 — 첫 화면 진열 띠와 같은 예시 사업('퇴근필라', 실제 AI로 만든 화면). 카드 그림 칸은 3:4.
 * 휴대폰 화면(phone)은 390×790으로 따로 찍은 화면을 작은 아이폰 틀(iphone-mockup)에 넣고, 나머지는 컴퓨터 화면에서 문서 부분만 잘라 쓴다.
 */
const RESULTS = [
  { src: "/home-media/showcase/pilates-plan-card.webp", width: 600, height: 800, phone: false, alt: "퇴근필라 사업계획서 첫 장 — 제목 '퇴근 후, 붐비지 않는 4인 기구 필라테스'와 '퇴근 후 4인 기구 필라테스 주 2회 정기권' 하나로 시작한다는 사업 개요, 고객·문제·상품·가격(월 220,000원) 표", title: "실행용 사업계획서" },
  { src: "/home-media/showcase/pilates-plan-m.webp", width: 780, height: 1580, phone: true, alt: "휴대폰으로 본 사업계획서의 숫자 — 정기권 220,000원에서 변동비 15,000원을 뺀 회원 1명당 205,000원, 손익분기 월 정기 회원 22명(매출 4,840,000원), 하루 6타임 × 월 26일 = 156타임", title: "내 조건으로 계산한 숫자" },
  { src: "/home-media/showcase/pilates-summary-card.webp", width: 600, height: 800, phone: false, alt: "퇴근필라 한 장 요약 — 사업과 고객, 제공안과 판매(4인 소그룹 주 2회 정기권 220,000원), 수익 구조와 계획 계산(손익분기 월 22명 / 매출 4,840,000원)", title: "한 장 요약" },
  { src: "/home-media/showcase/pilates-chat-m.webp", width: 780, height: 1580, phone: true, alt: "휴대폰 대화에서 '정기권 가격을 240,000원으로 올려 줘'라고 하자 판매 가격 220,000원을 240,000원으로 바꾸는 확인 카드가 뜬 화면", title: "대화로 고치기" },
];

/*
 * 로그인 전에는 '내 사업 열기'가 로그인 안내로만 가서 무엇인지 볼 수 없었다(점검 2026-10-23) — 예시 사업으로 보여 준다.
 * 유지보수도 예시 사업의 기록을 보기 전용으로 보여 줄 수 있게 되어(점검 r36) 개업 준비와 같이 예시로 보낸다.
 */
function afterCards(signedIn: boolean | null) {
  const mine = signedIn === true;
  return [
    { id: "after-homepage", href: SAMPLE_HOMEPAGE, title: "내 사업 홈페이지", body: "사업계획서로 홈페이지 초안을 바로 만들어요.", action: "예시 홈페이지 보기" },
    { id: "after-launch", href: mine ? "/plan" : SAMPLE_OPERATIONS, title: JOURNEY_LABELS.launch, body: "신고·등록부터 홍보까지 할 일 목록으로 안내해요.", action: mine ? "내 사업 열기" : "예시 보기" },
    { id: "after-ops", href: mine ? "/plan" : SAMPLE_OPERATIONS, title: JOURNEY_LABELS.care, body: "문을 연 뒤 매출과 할 일을 기록해요.", action: mine ? "내 사업 열기" : "예시 보기" },
  ];
}

/** 마지막 단추 — 맨 위 입력칸으로 올라가 커서를 둔다 */
function focusHeroPrompt() {
  const input = document.getElementById("home-idea") as HTMLTextAreaElement | null;
  if (!input) { window.location.href = NEW_CHAT; return; }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  input.closest("form")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  input.focus({ preventScroll: true });
}

/* 다른 화면으로 가는 줄·카드 끝은 › (대표 규칙 2026-10-24 — → 쓰지 않음, 점검 r39) */
function Arrow() {
  return <ChevronRight className={styles.arrow} size={20} aria-hidden="true" />;
}

/** signedIn — 로그인했는지(확인 전이면 null). '계획 다음의 일' 카드가 내 사업 또는 예시로 간다 */
export function HomePromptSections({ signedIn = null }: { signedIn?: boolean | null } = {}) {
  const root = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  /* 예시 화면 — 지금 보이는 단계. 구간이 보이는 동안 7초마다 다음 단계로, 단계를 직접 누르면 멈춘다 */
  const who = useRef<HTMLElement>(null);
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const autoStage = useRef(true);
  useEffect(() => {
    const element = who.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    let timer: number | undefined;
    const stop = () => { if (timer !== undefined) window.clearInterval(timer); timer = undefined; setPlaying(false); };
    const observer = new IntersectionObserver(([entry]) => {
      stop();
      if (!entry.isIntersecting || !autoStage.current) return;
      setPlaying(true);
      timer = window.setInterval(() => {
        if (!autoStage.current) { stop(); return; }
        setStage(current => (current + 1) % DEMO_STAGES.length);
      }, DEMO_STAGE_MS);
    }, { threshold: 0.2 });
    observer.observe(element);
    return () => { stop(); observer.disconnect(); };
  }, []);
  const pickStage = (index: number) => { autoStage.current = false; setPlaying(false); setStage(index); };
  const stageProps = (index: number) => ({ className: styles.stage, role: "tabpanel", id: `home-who-stage-${index}`, "aria-labelledby": `home-who-step-${index}`, "data-active": stage === index || undefined, "aria-hidden": stage !== index, inert: stage !== index });
  useEffect(() => {
    const element = root.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const targets = [...element.querySelectorAll<HTMLElement>("[data-reveal]")];
    /* 이미 화면 안에 있는 구간은 숨기지 않는다 — 깜빡이지 않게 */
    for (const target of targets) if (target.getBoundingClientRect().top < window.innerHeight - 60) target.dataset.seen = "true";
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.seen = "true";
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -60px 0px" });
    targets.filter(target => target.dataset.seen !== "true").forEach(target => observer.observe(target));
    setArmed(true);
    return () => observer.disconnect();
  }, []);

  const formats = PPT_GENERATION_VERIFIED ? "PDF·Word·PPT" : "PDF·Word";
  return <div className={styles.sections} ref={root} data-armed={armed || undefined}>
    <section id="how" className={`${styles.section} ${styles.features}`} aria-labelledby="home-how-title" data-reveal>
      <div className={styles.featureCopy}>
        <h2 id="home-how-title" className={styles.heading}>계획부터 개업까지.<br />따로 찾지 않아도 돼요.</h2>
        <img
          className={styles.teamPhoto}
          src="/home-media/oneulstart-team.webp"
          srcSet="/home-media/oneulstart-team-800.webp 800w, /home-media/oneulstart-team-1200.webp 1200w, /home-media/oneulstart-team.webp 1942w"
          sizes="(max-width: 900px) calc(100vw - 32px), 640px"
          width="1942"
          height="809"
          loading="lazy"
          decoding="async"
          alt="노트북 앞에서 사업 아이디어를 함께 이야기하는 사람들"
        />
      </div>
      <ul className={styles.linkList}>
        {FEATURES.map(item => <li key={item.label}><a href={item.href}>{item.label}<Arrow /></a></li>)}
      </ul>
    </section>

    <section id="who" ref={who} className={styles.section} aria-labelledby="home-who-title" data-reveal>
      <header className={`${styles.sectionHead} ${styles.center}`}>
        <h2 id="home-who-title" className={styles.heading}>어떤 사업이든 시작할 수 있어요</h2>
        <p className={styles.headNote}>한마디에서 실행 계획까지 <span>예시 · 온라인 타로 상담</span></p>
      </header>
      <div className={styles.demo}>
        <ol className={styles.steps} role="tablist" aria-label="진행 단계">
          {DEMO_STAGES.map((name, index) => <li key={name} role="presentation"><button type="button" role="tab" id={`home-who-step-${index}`} aria-selected={stage === index} aria-controls={`home-who-stage-${index}`} data-done={index < stage || undefined} data-playing={playing && stage === index || undefined} onClick={() => pickStage(index)}><i>{index + 1}</i>{name}</button></li>)}
        </ol>
        <div className={styles.stages}>
          <div {...stageProps(0)}>
            <h3 className={styles.stageTitle}>한마디만 적으면 돼요<small>모자란 것만 물어봐요</small></h3>
            <div className={styles.talk}>
              {DEMO_TALK.map(line => <p key={line.text} className={line.who === "me" ? styles.chatMe : styles.chatAi}>{line.text}</p>)}
            </div>
          </div>
          <div {...stageProps(1)}>
            <h3 className={styles.stageTitle}>대화가 표로 정리돼요<small>틀린 값은 눌러서 바로 고쳐요</small></h3>
            <dl className={styles.fields}>
              {DEMO_FIELDS.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd><em data-mine={field.mine || undefined}>{field.mine ? "내가 말함" : "AI가 채움"}</em></div>)}
            </dl>
          </div>
          <div {...stageProps(2)}>
            <h3 className={styles.stageTitle}>잠들기 전, 연애·진로 고민을<br />카드로 풀어 보는 시간<small>이름 후보 · 달빛타로 · 보라카드 · 오늘의 한 장</small></h3>
            <ul className={styles.calc}>
              <li><span>한 건에 남는 돈</span><b>14,000원</b><small>15,000원 − 1,000원</small></li>
              <li><span>본전이 되는 상담 수</span><b>한 달 3명</b><small>매달 30,000원 ÷ 14,000원</small></li>
            </ul>
            <ol className={styles.startList}>{DEMO_START.map(item => <li key={item}>{item}</li>)}</ol>
            <p className={styles.fine}>결제 수수료를 빼기 전 숫자예요.</p>
          </div>
          <div {...stageProps(3)}>
            <h3 className={styles.stageTitle}>다른 길도 함께 따져요<small>돈 쓰기 전에 확인할 것까지</small></h3>
            <div className={styles.cols}>
              <div>
                <span className={styles.sheetLabel}>다른 길</span>
                {DEMO_ALTERNATIVES.map(item => <div key={item.name} className={styles.memo}><b>{item.name}</b><p>{item.tradeoff}</p></div>)}
              </div>
              <div>
                <span className={styles.sheetLabel}>먼저 확인할 것</span>
                {DEMO_ASSUMPTIONS.map(item => <div key={item.statement} className={styles.memo}><b>{item.statement}</b><p>{item.check}</p></div>)}
              </div>
            </div>
          </div>
          <div {...stageProps(4)}>
            <h3 className={styles.stageTitle}>이번 주 할 일까지 정해요<small>그대로 올리면 되는 글도 써 드려요</small></h3>
            <div className={styles.cols}>
              <div>
                <div className={styles.memo}><b>인스타그램에 예약 조사 글 올리기</b><p>2주 안에 응답 6개가 모이면 끝이에요.</p></div>
                <p className={styles.chatMe}>달빛타로 이름 완전 맘에 들어요. 글부터 올려 볼게요!!</p>
              </div>
              <div>
                <p className={styles.sheetText}>{"온라인 1:1 타로 상담, 첫 손님을 찾고 있어요\n\n연애·진로 고민을 20~30분 동안 카드로 풀어 드려요. (1회 15,000원 예정)\n\n원하는 날짜와 한 달에 몇 번 받고 싶은지 DM으로 알려 주세요!"}</p>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.demoStarts}>
          <span>내 사업으로 해 보기</span>
          {STARTS.map(card => <a key={card.title} href={newChatEntryHref(card.entry)}>{card.title}<ChevronRight size={16} aria-hidden="true" /></a>)}
        </div>
      </div>
    </section>

    <section id="deliverables" className={styles.section} aria-labelledby="home-result-title" data-reveal>
      <header className={styles.sectionHead}>
        <h2 id="home-result-title" className={styles.heading}>읽고, 고치고, 바로 쓰는 결과물</h2>
      </header>
      <div className={styles.grid4}>
        {RESULTS.map(item => <article key={item.title} className={styles.result}>
          {item.phone
            ? <div className={styles.resultPhone}><IphoneMockup src={item.src} alt={item.alt} width={item.width} height={item.height} /></div>
            : <img src={item.src} width={item.width} height={item.height} loading="lazy" decoding="async" alt={item.alt} />}
          <h3>{item.title}</h3>
        </article>)}
      </div>
      <a className={styles.outlineAction} href="/samples/sample_coffee.pdf" target="_blank" rel="noopener noreferrer">완성 예시 PDF 열기<span className={styles.srOnly}> (새 창)</span> <span aria-hidden="true">↗</span></a>
    </section>

    <section id="after" className={styles.section} aria-labelledby="home-after-title" data-reveal>
      <header className={styles.sectionHead}>
        <h2 id="home-after-title" className={styles.heading}>계획 다음의 일도 끊기지 않게</h2>
      </header>
      <div className={styles.grid3}>
        {afterCards(signedIn).map(card => <a key={card.id} id={card.id} href={card.href} className={`${styles.panel} ${styles.panelAnchor}`}>
          <h3>{card.title}</h3>
          <p>{card.body}</p>
          <span className={styles.panelLink}>{card.action}<ChevronRight size={18} aria-hidden="true" /></span>
        </a>)}
      </div>
    </section>

    {/* 머리말 '이용 요금'(#price)이 바로 이 구간으로 온다 */}
    <section id="price" className={styles.section} aria-labelledby="home-price-title" data-reveal>
      <h2 id="home-price-title" className={`${styles.heading} ${styles.centerText}`}>이용 요금</h2>
      <div className={styles.grid3}>
        <article className={styles.panel}>
          <h3 className={styles.priceName}>대화·사업 방향 정리</h3>
          <strong className={styles.price}>무료</strong>
          <p>사업 방향 한 장 정리까지</p>
        </article>
        <article className={`${styles.panel} ${styles.featured}`}>
          <h3 className={styles.priceName}>사업계획서</h3>
          <strong className={styles.price}>{won(PACKAGE_AMOUNT)}</strong>
          <p>사업계획서 작성, {formats} 내려받기, 항목별 <span className={styles.nowrap}>다시 생성 {REGEN_INCLUDED}회</span></p>
        </article>
        <article className={styles.panel}>
          <h3 className={styles.priceName}>{BUNDLE_PRODUCT_NAME}</h3>
          <strong className={styles.price}>{won(BUNDLE_PRODUCT_AMOUNT)}</strong>
          <p>따로 사면 {won(PACKAGE_AMOUNT + HOMEPAGE_PRODUCT_AMOUNT)}</p>
        </article>
      </div>
      <p className={styles.note}>사업 하나당 · 부가세 포함</p>
      {/* 홈페이지 주소(도메인) 비용 — 약관에만 있고 요금표에 없었다(점검 2026-11-16). 값은 결제 상수 그대로 */}
      <p className={styles.note}>홈페이지는 무료 주소로 공개돼요. 내 도메인을 쓰려면 연결 1년 {won(DOMAIN_PRODUCT_AMOUNT)}, 도메인 구매까지 맡기면 {won(DOMAIN_PURCHASE_PRODUCT_AMOUNT)}(첫해 등록비 포함)이에요.</p>
    </section>

    {/* 문구는 예전 첫 화면(home-service-overview)의 질문·답 그대로 — 금액은 결제 상수에서 */}
    <section id="faq" className={`${styles.section} ${styles.faq}`} aria-labelledby="home-faq-title" data-reveal>
      <h2 id="home-faq-title" className={`${styles.heading} ${styles.centerText}`}>자주 묻는 질문</h2>
      <div className={styles.faqList}>
        <details open><summary>아이디어가 없거나 이미 사업 중이어도 되나요?<span className={styles.plus} aria-hidden="true">+</span></summary><p>네. 관심 있는 일, 해 본 일, 지금 사업에서 바꾸고 싶은 점을 이야기해 주세요. 사업자등록 없이도 사업안을 기획할 수 있어요.</p></details>
        <details><summary>어디까지 무료이고, 언제 결제하나요?<span className={styles.plus} aria-hidden="true">+</span></summary><p>사업 이야기를 나누고 사업 방향을 한 장으로 정리하는 데까지는 무료예요. 사업계획서 문서 작성과 {formats} 내려받기는 사업 하나당 {won(PACKAGE_AMOUNT)} 결제 후 시작해요. 홈페이지까지 함께 사면 {won(BUNDLE_PRODUCT_AMOUNT)}이에요. 따로 사면 {won(PACKAGE_AMOUNT + HOMEPAGE_PRODUCT_AMOUNT)}이라 함께 사면 {won(PACKAGE_AMOUNT + HOMEPAGE_PRODUCT_AMOUNT - BUNDLE_PRODUCT_AMOUNT)} 저렴해요. 항목별 ‘다시 생성’ {REGEN_INCLUDED}회가 포함되며, 최종 금액과 제공 범위는 결제 화면에서 확인해 주세요.{!PPT_GENERATION_VERIFIED && " PPT 자동 생성은 제공 준비 중이며 현재 결제 제공 범위에 포함되지 않아요."}</p></details>
        <details><summary>완성한 내용을 그대로 제출해도 되나요?<span className={styles.plus} aria-hidden="true">+</span></summary><p>내용과 수치를 직접 확인한 뒤 사용해 주세요. 시장 조사나 전문가 검토를 대신하지 않으며, 지원사업 제출 적합성이나 사업 성공을 보장하지 않아요.</p></details>
        <details><summary>홈페이지·사업자등록도 자동인가요?<span className={styles.plus} aria-hidden="true">+</span></summary><p>사업계획서에 정리한 내용으로 홈페이지 초안을 자동 생성해요. 초안 미리보기는 무료이며, 편집·공개는 사업계획서와 함께 {won(BUNDLE_PRODUCT_AMOUNT)}(사업계획서를 이미 결제했다면 홈페이지만 {won(HOMEPAGE_PRODUCT_AMOUNT)}) 결제 후 이용해요. 사업자등록·세무·계약이 자동으로 완료되는 서비스는 아니에요.</p></details>
        <details><summary>홈페이지 주소(도메인) 비용은 따로 있나요?<span className={styles.plus} aria-hidden="true">+</span></summary><p>홈페이지는 추가 비용 없이 무료 주소로 공개돼요. 내 도메인(예: 가게이름.com)을 쓰고 싶을 때만 선택해요. 이미 가진 도메인을 연결하면 1년 {won(DOMAIN_PRODUCT_AMOUNT)}, 도메인이 없어 구매까지 맡기면 1년 {won(DOMAIN_PURCHASE_PRODUCT_AMOUNT)}(첫해 등록비 포함)이에요.</p></details>
      </div>
    </section>

    <section className={`${styles.section} ${styles.closing}`} aria-labelledby="home-closing-title" data-reveal>
      <h2 id="home-closing-title" className={styles.closingTitle}>내 사업의 첫날,<br />오늘 시작해요</h2>
      <a className={styles.closingAction} href={NEW_CHAT} onClick={event => { if (!document.getElementById("home-idea")) return; event.preventDefault(); focusHeroPrompt(); }}>대화로 시작하기<ChevronRight size={18} aria-hidden="true" /></a>
    </section>
  </div>;
}
