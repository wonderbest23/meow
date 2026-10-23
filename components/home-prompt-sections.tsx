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
import { BUNDLE_PRODUCT_AMOUNT, BUNDLE_PRODUCT_NAME, HOMEPAGE_PRODUCT_AMOUNT, LAUNCH_PRICE_LABEL, PACKAGE_AMOUNT, REGEN_INCLUDED } from "../lib/payments/domain";
import { PPT_GENERATION_VERIFIED } from "../lib/plan-builder/deck-availability";
import { landingIdeaHref, rememberLandingIdea } from "./home-prompt-hero";
import { newChatEntryHref, newChatHref, studioHref, type EntryMode } from "../lib/plan-builder/studio";
import { JOURNEY_LABELS } from "../lib/plan-builder/journey-steps";
import styles from "./home-prompt-sections.module.css";

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
const SAMPLE_PLAN = "/plan/document?planId=sample_coffee";
const SAMPLE_HOMEPAGE = "/plan/homepage?planId=sample_coffee";
/* 예시 사업의 개업 준비 — 작업실에서 로그인 없이 열린다(유지보수 탭은 예시 사업의 실적 기록을 불러오지 못해 예시로 쓰지 않는다) */
const SAMPLE_LAUNCH = studioHref("sample_coffee", "launch");
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
const STARTS: Array<{ title: string; body: string; action: string; entry: EntryMode }> = [
  { title: "처음 창업해요", body: "관심 있는 일이나 해 본 일을 이야기하면, 고객과 상품부터 시작 방법까지 함께 정리해요.", action: "아이디어로 시작하기", entry: "startup" },
  { title: "이미 사업 중이에요", body: "지금 사업에서 바꾸고 싶은 점을 이야기하면, 실제 매출과 비용으로 다음 계획을 세워요.", action: "내 사업 개선하기", entry: "operating" },
  { title: "아이디어가 아직 없어요", body: "쓸 수 있는 시간과 돈, 잘하는 것을 알려 주시면 나에게 맞는 사업안 몇 가지를 골라 드려요.", action: "사업안 추천받기", entry: "exploring" },
];

/* 업종 칩 — 누르면 그 말을 첫 메시지로 들고 새 대화를 연다(모두 받침으로 끝나 '을'로 잇는다) */
const INDUSTRIES = ["카페 창업", "음식점 창업", "배송 사업", "온라인 쇼핑몰", "공방 창업", "꽃집 창업", "앱 개발", "반려동물 돌봄", "가구 제작", "프리랜서 창업"];
const industryIdea = (label: string) => `${label}을 해 보고 싶어요.`;

const RESULTS = [
  { src: "/home-media/results/report-01.webp", width: 1132, height: 1600, alt: "새벽커피 예시 사업계획서 표지", title: "실행용 사업계획서", body: "사업 소개부터 고객, 돈, 12주 할 일까지. PDF와 수정 가능한 Word로 받아요." },
  { src: "/home-media/showcase/numbers.webp", width: 640, height: 640, alt: "판매가와 비용으로 계산한 손익분기 화면", title: "내 조건으로 계산한 숫자", body: "시작 예산과 쓸 수 있는 시간으로 손익분기, 버틸 수 있는 기간을 계산해요." },
  { src: "/home-media/showcase/summary.webp", width: 640, height: 640, alt: "사업과 고객, 상품과 가격을 정리한 한 장 요약 화면", title: "한 장 요약", body: "누구에게 무엇을 얼마에 팔고, 첫 달에 무엇을 할지 한 장으로 봐요." },
  { src: "/home-media/showcase/chat-edit.webp", width: 640, height: 640, alt: "대화로 계획서 내용을 고치는 화면", title: "대화로 고치기", body: "“가격을 9,000원으로 바꿔 줘”처럼 말하면 바뀔 내용을 먼저 보여 주고, 계획서에 반영해요." },
];

/*
 * 로그인 전에는 '내 사업 열기'가 로그인 안내로만 가서 무엇인지 볼 수 없었다(점검 2026-10-23) — 예시 사업으로 보여 준다.
 * 유지보수는 예시 사업으로 볼 수 있는 화면이 없어(실적 기록을 불러오지 못함) 로그인 전에는 새 대화로 보낸다.
 */
function afterCards(signedIn: boolean | null) {
  const mine = signedIn === true;
  return [
    { id: "after-homepage", href: SAMPLE_HOMEPAGE, title: "내 사업 홈페이지", body: "사업계획서 내용으로 홈페이지 초안을 자동으로 만들어요. 초안 만들기 → 문구 다듬기 → 미리보기.", action: "예시 홈페이지 보기" },
    { id: "after-launch", href: mine ? "/plan" : SAMPLE_LAUNCH, title: JOURNEY_LABELS.launch, body: "업종에 맞는 신고·등록 순서와 결제·홍보 준비를 할 일 목록으로 안내해요.", action: mine ? "내 사업 열기" : "예시 보기" },
    { id: "after-ops", href: mine ? "/plan" : NEW_CHAT, title: JOURNEY_LABELS.care, body: "문을 연 뒤에는 매출과 할 일을 기록하고, 막힐 때 대화로 바로 물어봐요.", action: mine ? "내 사업 열기" : "대화로 시작하기" },
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

function Arrow() {
  return <svg className={styles.arrow} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

/** signedIn — 로그인했는지(확인 전이면 null). '계획 다음의 일' 카드가 내 사업 또는 예시로 간다 */
export function HomePromptSections({ signedIn = null }: { signedIn?: boolean | null } = {}) {
  const root = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
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
        <p className={styles.lead}>대화로 정한 내용이 사업계획서, 홈페이지, 개업 준비로 그대로 이어져요. 처음부터 다시 적을 필요가 없어요.</p>
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

    <section id="who" className={styles.section} aria-labelledby="home-who-title" data-reveal>
      <header className={`${styles.sectionHead} ${styles.center}`}>
        <h2 id="home-who-title" className={styles.heading}>어떤 사업이든 시작할 수 있어요</h2>
        <p className={styles.lead}>완벽한 아이디어가 아니어도 괜찮아요. 내 경험과 조건에서 사업의 가능성을 찾아요.</p>
      </header>
      <div className={styles.grid3}>
        {STARTS.map(card => <article key={card.title} className={styles.panel}>
          <h3>{card.title}</h3>
          <p>{card.body}</p>
          <a className={styles.panelLink} href={newChatEntryHref(card.entry)}>{card.action} <span aria-hidden="true">→</span></a>
        </article>)}
      </div>
      <ul className={styles.chips} aria-label="업종 예시로 대화 시작">
        {INDUSTRIES.map(label => <li key={label}><a href={landingIdeaHref(industryIdea(label))} onClick={() => rememberLandingIdea(industryIdea(label))}>{label}</a></li>)}
      </ul>
    </section>

    <section id="deliverables" className={styles.section} aria-labelledby="home-result-title" data-reveal>
      <header className={styles.sectionHead}>
        <h2 id="home-result-title" className={styles.heading}>읽고, 고치고, 바로 쓰는 결과물</h2>
        <p className={styles.lead}>내 조건으로 계산한 숫자와 할 일이 들어간 문서예요. 고칠 곳은 대화로 말하면 돼요.</p>
      </header>
      <div className={styles.grid4}>
        {RESULTS.map(item => <article key={item.title} className={styles.result}>
          <img src={item.src} width={item.width} height={item.height} loading="lazy" decoding="async" alt={item.alt} />
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>)}
      </div>
      <a className={styles.outlineAction} href="/samples/sample_coffee.pdf" target="_blank" rel="noopener noreferrer">완성 예시 PDF 열기<span className={styles.srOnly}> (새 창)</span> <span aria-hidden="true">↗</span></a>
    </section>

    <section id="after" className={styles.section} aria-labelledby="home-after-title" data-reveal>
      <header className={styles.sectionHead}>
        <h2 id="home-after-title" className={styles.heading}>계획 다음의 일도 끊기지 않게</h2>
        <p className={styles.lead}>사업 요약과 문서, 대화, 다음 할 일을 사업마다 한곳에서 이어가요.</p>
      </header>
      <div className={styles.grid3}>
        {afterCards(signedIn).map(card => <a key={card.id} id={card.id} href={card.href} className={`${styles.panel} ${styles.panelAnchor}`}>
          <h3>{card.title}</h3>
          <p>{card.body}</p>
          <span className={styles.panelLink}>{card.action} <span aria-hidden="true">→</span></span>
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
          <p>사업 이야기를 나누고 사업 방향을 한 장으로 정리하는 데까지</p>
        </article>
        <article className={`${styles.panel} ${styles.featured}`}>
          <h3 className={styles.priceName}>사업계획서</h3>
          {/* 결제 화면과 같은 표시(LAUNCH_PRICE_LABEL) — 종전가·할인율은 적지 않는다(lib/payments/domain.ts) */}
          <span className={styles.launchTag}>{LAUNCH_PRICE_LABEL}</span>
          <strong className={styles.price}>{won(PACKAGE_AMOUNT)}</strong>
          <p>사업계획서 작성, {formats} 내려받기, 항목별 다시 생성 {REGEN_INCLUDED}회</p>
        </article>
        <article className={styles.panel}>
          <h3 className={styles.priceName}>{BUNDLE_PRODUCT_NAME}</h3>
          <span className={styles.launchTag}>{LAUNCH_PRICE_LABEL}</span>
          <strong className={styles.price}>{won(BUNDLE_PRODUCT_AMOUNT)}</strong>
          <p>따로 사면 {won(PACKAGE_AMOUNT + HOMEPAGE_PRODUCT_AMOUNT)}이라 함께 사면 {won(PACKAGE_AMOUNT + HOMEPAGE_PRODUCT_AMOUNT - BUNDLE_PRODUCT_AMOUNT)} 저렴해요</p>
        </article>
      </div>
      <p className={styles.note}>사업 하나당 가격이에요. 최종 금액과 제공 범위는 결제 화면에서 확인해 주세요.</p>
    </section>

    {/* 문구는 예전 첫 화면(home-service-overview)의 질문·답 그대로 — 금액은 결제 상수에서 */}
    <section id="faq" className={`${styles.section} ${styles.faq}`} aria-labelledby="home-faq-title" data-reveal>
      <h2 id="home-faq-title" className={`${styles.heading} ${styles.centerText}`}>자주 묻는 질문</h2>
      <div className={styles.faqList}>
        <details open><summary>아이디어가 없거나 이미 사업 중이어도 되나요?<span className={styles.plus} aria-hidden="true">+</span></summary><p>네. 관심 있는 일, 해 본 일, 지금 사업에서 바꾸고 싶은 점을 이야기해 주세요. 사업자등록 없이도 사업안을 기획할 수 있어요.</p></details>
        <details><summary>어디까지 무료이고, 언제 결제하나요?<span className={styles.plus} aria-hidden="true">+</span></summary><p>사업 이야기를 나누고 사업 방향을 한 장으로 정리하는 데까지는 무료예요. 사업계획서 문서 작성과 {formats} 내려받기는 사업 하나당 {won(PACKAGE_AMOUNT)} 결제 후 시작해요. 홈페이지까지 함께 사면 {won(BUNDLE_PRODUCT_AMOUNT)}이에요. 따로 사면 {won(PACKAGE_AMOUNT + HOMEPAGE_PRODUCT_AMOUNT)}이라 함께 사면 {won(PACKAGE_AMOUNT + HOMEPAGE_PRODUCT_AMOUNT - BUNDLE_PRODUCT_AMOUNT)} 저렴해요. 항목별 ‘다시 생성’ {REGEN_INCLUDED}회가 포함되며, 최종 금액과 제공 범위는 결제 화면에서 확인해 주세요.{!PPT_GENERATION_VERIFIED && " PPT 자동 생성은 제공 준비 중이며 현재 결제 제공 범위에 포함되지 않아요."}</p></details>
        <details><summary>완성한 내용을 그대로 제출해도 되나요?<span className={styles.plus} aria-hidden="true">+</span></summary><p>내용과 수치를 직접 확인한 뒤 사용해 주세요. 시장 조사나 전문가 검토를 대신하지 않으며, 지원사업 제출 적합성이나 사업 성공을 보장하지 않아요.</p></details>
        <details><summary>홈페이지 제작이나 사업자등록도 자동으로 되나요?<span className={styles.plus} aria-hidden="true">+</span></summary><p>사업계획서에 정리한 내용으로 홈페이지 초안을 자동 생성해요. 초안 미리보기는 무료이며, 편집·공개는 사업계획서와 함께 {won(BUNDLE_PRODUCT_AMOUNT)}(사업계획서를 이미 결제했다면 홈페이지만 {won(HOMEPAGE_PRODUCT_AMOUNT)}) 결제 후 이용해요. 사업자등록·세무·계약이 자동으로 완료되는 서비스는 아니에요.</p></details>
      </div>
    </section>

    <section className={`${styles.section} ${styles.closing}`} aria-labelledby="home-closing-title" data-reveal>
      <h2 id="home-closing-title" className={styles.closingTitle}>내 사업의 첫날,<br />오늘 시작해요</h2>
      <a className={styles.closingAction} href={NEW_CHAT} onClick={event => { if (!document.getElementById("home-idea")) return; event.preventDefault(); focusHeroPrompt(); }}>대화로 시작하기</a>
    </section>
  </div>;
}
