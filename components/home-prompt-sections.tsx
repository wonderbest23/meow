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
 * '어떤 사업이든' 구간 — 한마디가 사업 방향 한 장이 되는 모습을 통째로 보여 준다(2026-11-18 사장님: 제목만 보여서는 좋은 점이 안 보인다 · 구간을 나누지 말고 합치기 · 채팅 모양 · 차례로 나타나게).
 * 탭 세 개가 예전 시작 카드 세 장이다(처음 창업해요 · 이미 사업 중이에요 · 아이디어가 아직 없어요). 탭마다 손님 한마디 → 사업 방향 한 장(제목 · 소개 · 이름 후보 · 시작 순서 · 바로 쓸 글) → 시작 단추.
 * 내용은 2026-11-17 AI 손님 점검(가상 손님 · 실제 AI)의 사업 방향 카드에서 왔다. 가상 손님이라 실제 고객 사례가 아니다 — "예시 대화"라고 적는다.
 * 제목 · 소개 · 이름은 나온 그대로, 손님 말 · 시작 순서 · 바로 쓸 글은 줄였다. 본전 · 예산 같은 계산 숫자는 넣지 않는다(점검에서 지적이 많았다).
 * 조각은 차례로 나타난다(구간이 보일 때만). 다 나오면 잠시 머물다 다음 탭으로 넘어가고, 탭을 직접 누르면 저절로 넘기지 않는다.
 * 움직임 줄이기나 스크립트가 없으면 처음부터 다 보인다. 세 탭을 같은 칸에 겹쳐 두어 탭이 바뀌어도 높이가 변하지 않는다.
 */
const STARTS: Array<{ title: string; said: string; headline: string; pitch: string; extra: { label: string; value: string }; steps: string[]; text: { label: string; body: string }; action: string; entry: EntryMode }> = [
  {
    title: "처음 창업해요", entry: "startup", action: "아이디어로 시작하기",
    said: "강아지 산책 알바 하고 있는데 이걸 사업으로 키워 보고 싶어요. 대학생이라 돈은 별로 없어요",
    headline: "바쁜 날에도 우리 강아지는 매일 동네를 걸어요",
    pitch: "바쁜 맞벌이·1인 가구 보호자에게 강아지 산책을 집 앞으로 찾아가 1시간 단위로 대신해 드리는 대학생 1인 방문 산책 서비스",
    extra: { label: "이름 후보", value: "오늘산책 · 꼬리산책 · 동네산책친구" },
    steps: ["당근에 소개 글 올리기", "첫 만남에서 강아지 성격·건강·주의사항 확인", "정해진 요일에 산책하고 사진·짧은 기록 보내기", "다음 예약 잡기"],
    text: { label: "당근에 바로 올릴 글", body: "안녕하세요! 이 동네 사는 대학생이에요 🐶 지금 강아지 산책 알바를 하고 있는데, 직접 방문 산책을 시작해 보려고 미리 여쭤봐요.\n- 1회 1시간, 집 앞으로 찾아가요\n- 산책 후 사진과 짧은 기록을 보내 드려요 …" },
  },
  {
    title: "이미 사업 중이에요", entry: "operating", action: "내 사업 개선하기",
    said: "동네에서 분식집 5년째 하고 있어요. 요즘 매출이 좀 줄었네요",
    headline: "단골이 배달앱 대신 가게로 직접 주문하는 동네 분식집",
    pitch: "동네 가족·주부와 학원가 학생에게 떡볶이·김밥 분식을 매장·포장·전화 주문으로 더 자주 드리고, 배달앱 의존을 줄이는 5년 차 분식집 운영 개선",
    extra: { label: "함께 본 다른 길", value: "떡볶이 가격 500원 조정 시험 · 배달앱 안에서 주문 늘리기" },
    steps: ["메뉴판·전단에 포장·전화 주문 번호와 포장 혜택 크게 알리기", "배달 봉투에 '다음엔 전화로' 쿠폰 넣기", "하교 시간 세트·저녁 포장 세트 1~2개 정하기", "매달 판매를 경로별로 적어 비교하기"],
    text: { label: "배달 봉투에 넣을 쿠폰 문구", body: "늘 찾아주셔서 감사해요! 다음엔 가게로 직접 주문해 주세요. 📞 전화 주문·포장 시 이 쿠폰을 보여 주시면 [혜택]을 드려요. 5년 동안 같은 자리에서 매일 아침 직접 만든 떡볶이·김밥으로 기다릴게요." },
  },
  {
    title: "아이디어가 아직 없어요", entry: "exploring", action: "사업안 추천받기",
    said: "잘 모르겠는데 손재주는 좀 있어요. 집에서 애 보면서 하루 3시간 정도 할 수 있으면 좋겠어요",
    headline: "아이 낮잠 시간에 그린 그림이 스티커·메모지가 돼요",
    pitch: "문구를 좋아하는 손님에게 직접 디자인한 스티커·메모지를 스마트스토어에서 소량으로 만들어 택배로 보내는 1인 문구 판매점",
    extra: { label: "이름 후보", value: "오후세시 문방 · 세시의 종이 · 낮잠문구" },
    steps: ["스티커 2~3종·메모지 1~2종 디자인", "인쇄소에 소량 제작 맡기기", "사진 찍고 상세 페이지 쓰기", "주문이 들어오면 포장해 택배 발송"],
    text: { label: "인쇄소에 보낼 견적 문의", body: "안녕하세요, 소량으로 스티커와 메모지를 제작하려고 견적 문의드려요.\n1) 스티커: 크기 약 10x15cm, 반칼 커팅, 수량 50장·100장\n2) 메모지: 크기 약 9x9cm, 50매 묶음, 수량 30권·50권 …" },
  },
];
/* 차례로 나오는 조각 수(손님 말 · 제목과 소개 · 이름 · 시작 순서 · 바로 쓸 글 · 시작 단추)와 박자 — 0.9초에 하나씩, 다 나온 뒤 7초쯤 머물고 다음 탭 */
const DEMO_PARTS = 6;
const DEMO_TICK_MS = 900;
const DEMO_HOLD_TICKS = 8;

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
  /* 예시 화면 — 고른 탭과 지금까지 나온 조각 수(null 이면 움직이지 않고 다 보인다) */
  const who = useRef<HTMLElement>(null);
  const [tab, setTab] = useState(0);
  const [shown, setShown] = useState<number | null>(null);
  const demo = useRef({ tab: 0, shown: 1, hold: 0, auto: true, moving: false });
  useEffect(() => {
    const element = who.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const state = demo.current;
    state.moving = true;
    let timer: number | undefined;
    const stop = () => { if (timer !== undefined) window.clearInterval(timer); timer = undefined; };
    const step = () => {
      if (state.shown < DEMO_PARTS) { state.shown += 1; setShown(state.shown); return; }
      if (!state.auto) return;
      state.hold += 1;
      if (state.hold < DEMO_HOLD_TICKS) return;
      state.hold = 0; state.shown = 1; state.tab = (state.tab + 1) % STARTS.length;
      setTab(state.tab); setShown(1);
    };
    const observer = new IntersectionObserver(([entry]) => {
      stop();
      if (!entry.isIntersecting) return;
      setShown(state.shown);
      timer = window.setInterval(step, DEMO_TICK_MS);
    }, { threshold: 0.25 });
    observer.observe(element);
    return () => { stop(); state.moving = false; observer.disconnect(); };
  }, []);
  const pickTab = (index: number) => {
    const state = demo.current;
    state.auto = false; state.tab = index; state.hold = 0;
    setTab(index);
    if (state.moving) { state.shown = 1; setShown(1); }
  };
  const off = (index: number) => shown !== null && index > shown ? true : undefined;
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
        <p className={styles.headNote}>한마디가 이렇게 정리돼요 <span>예시 대화</span></p>
      </header>
      <div className={styles.demoTabs} role="tablist" aria-label="내 상황 고르기">
        {STARTS.map((card, index) => <button key={card.title} type="button" role="tab" id={`home-who-tab-${index}`} aria-selected={tab === index} aria-controls={`home-who-panel-${index}`} onClick={() => pickTab(index)}>{card.title}</button>)}
      </div>
      <div className={styles.demoStack}>
        {STARTS.map((card, index) => {
          const active = tab === index;
          const hide = (part: number) => active ? off(part) : undefined;
          return <div key={card.title} className={styles.demo} role="tabpanel" id={`home-who-panel-${index}`} aria-labelledby={`home-who-tab-${index}`} data-active={active || undefined} aria-hidden={!active} inert={!active}>
            <div className={styles.demoChat}>
              <p className={styles.chatMe} data-off={hide(1)}>{card.said}</p>
              <p className={styles.chatAi} data-off={hide(2)}><span>오늘창업</span>말씀하신 내용으로 사업 방향을 한 장으로 정리했어요.</p>
              <a className={styles.demoAction} data-off={hide(6)} href={newChatEntryHref(card.entry)}>{card.action}<ChevronRight size={18} aria-hidden="true" /></a>
            </div>
            <article className={styles.sheet}>
              <div data-off={hide(2)}>
                <span className={styles.sheetLabel}>사업 방향</span>
                <h3>{card.headline}</h3>
                <p>{card.pitch}</p>
              </div>
              <div data-off={hide(3)}>
                <span className={styles.sheetLabel}>{card.extra.label}</span>
                <p className={styles.sheetStrong}>{card.extra.value}</p>
              </div>
              <div data-off={hide(4)}>
                <span className={styles.sheetLabel}>처음 시작하는 순서</span>
                <ol>{card.steps.map(step => <li key={step}>{step}</li>)}</ol>
              </div>
              <div data-off={hide(5)}>
                <span className={styles.sheetLabel}>{card.text.label}</span>
                <p className={styles.sheetText}>{card.text.body}</p>
              </div>
            </article>
          </div>;
        })}
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
