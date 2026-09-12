"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUp, ArrowUpRight, BatteryFull, Check, ChevronLeft, ChevronRight, Ellipsis, FileCheck2, FileText, FolderOpen, MessageCircle, Paperclip, Signal, Wifi } from "lucide-react";
import styles from "./home-phone-story.module.css";
import { CoachMessage, CoachResultCard, CoachWelcome } from "./coach-chat-ui";
import chatUi from "./coach-chat-ui.module.css";

const messageLines = ["사진 찍는 걸 좋아해요.", "주 5시간, 100만원으로", "시작할 수 있을까요?"];
const message = messageLines.join(" ");
const business = "동네 가게 메뉴 사진 제작";

function MessageText() {
  return <p>{messageLines.map(line => <span className={styles.messageLine} key={line}>{line}</span>)}</p>;
}

function MessageFlight() {
  return <div className={`${styles.messageFlight} ${chatUi.theme}`} data-phone-message aria-hidden="true"><CoachMessage role="user"><MessageText /></CoachMessage></div>;
}

function PhoneScreen() {
  return <div className={`${styles.screen} ${chatUi.theme}`} data-phone-screen aria-hidden="true">
    <div className={styles.statusBar}><b>9:41</b><i /><span><Signal /><Wifi /><BatteryFull /></span></div>
    <div className={styles.appHeader}><ChevronLeft /><div><strong>사업 기획</strong><span>오늘창업 AI 파트너</span></div><Ellipsis /></div>
    <div className={styles.appTabs}><span className={styles.chatTab}>대화</span><span className={styles.briefTab}>내 사업안</span></div>
    <div className={styles.chatView}>
      <div className={styles.greeting}><CoachWelcome /></div>
      <div className={styles.chatHistory}>
        <CoachMessage role="user" className={styles.userBubble}><MessageText /></CoachMessage>
        <div className={styles.reply}><CoachMessage role="assistant"><p>좋아하는 일에서 시작해 볼게요.<br />동네 가게의 메뉴 사진을 만드는<br />작은 사업은 어떨까요?</p></CoachMessage></div>
        <div className={styles.generatedBrief}><CoachResultCard label="함께 정리한 사업안" title={business} description="고객 · 상품 · 비용 · 시작 방법" /></div>
        <div className={styles.typingDots}><i /><i /><i /></div>
      </div>
      <div className={`${styles.composer} ${chatUi.composerShell}`}><Paperclip /><span><span className={styles.typedText}>{Array.from(message).map((letter, index) => <span key={index} style={{ "--letter": index } as React.CSSProperties}>{letter}</span>)}</span><span className={styles.composerPlaceholder}>메시지를 입력하세요</span></span><div className={`${styles.sendButton} ${chatUi.sendButton}`}><ArrowUp /><i className={styles.tapRing} /></div></div>
    </div>
    <div className={styles.briefView}>
      <div className={styles.briefScroll}><div className={styles.briefContent}>
      <span className={styles.eyebrow}>내 사업안</span><h3>동네 가게<br />메뉴 사진 제작</h3><p className={styles.subtle}>AI가 제안한 초안이에요.</p>
      <div className={styles.sectionTabs}><b>사업 소개</b><span>상품과 고객</span><span>비용과 운영</span></div>
      <section className={styles.briefIntro}><h4>이런 사업이에요</h4><p>가까운 음식점과 카페의 메뉴 사진과 소개문구를 함께 만드는 1인 서비스예요.</p></section>
      <div className={styles.conditions} data-phone-focus-target><h4>내 조건에 맞춰서</h4><dl><div><dt>시작 예산</dt><dd>100만원</dd></div><div><dt>투입 가능 시간</dt><dd>주 5시간</dd></div></dl></div>
      <div className={styles.firstStep}><span>첫 시작</span><strong>샘플 1세트로 제안하기</strong><p>먼저 반응을 확인하고, 가격과 작업 시간을 조정해요.</p></div>
      <div className={styles.editActions}><span><MessageCircle />AI와 다듬기</span><span><FileText />직접 수정</span></div>
      </div></div>
      <div className={styles.documentButton}><FileCheck2 /><span>계획서 보기</span><ChevronRight /><i className={styles.documentTap} /></div>
    </div>
    <div className={styles.documentView}>
      <div className={styles.documentTop}><span>사업계획서</span><span><Check />생성 완료</span></div>
      <div className={styles.paper}><div className={styles.paperBrand}>오늘창업<span>01</span></div><span className={styles.paperEyebrow}>BUSINESS PLAN</span><h3>작은 시작을 위한<br />내 사업계획서</h3><p>{business}</p><img src="/home-media/oneulstart-team.png" width="1942" height="809" alt="" /><dl><div><dt>01</dt><dd>사업 소개</dd><Check /></div><div><dt>02</dt><dd>고객과 상품</dd><Check /></div><div><dt>03</dt><dd>비용과 운영</dd><Check /></div><div><dt>04</dt><dd>시작 방법</dd><Check /></div></dl><small>확인하고 다듬어 사용할 수 있는 초안</small></div>
      <div className={styles.download}><ArrowDownToLine />내려받기</div>
      <div className={styles.saved}><FolderOpen /><div><strong>내 사업에 저장했어요</strong><span>대화와 문서를 한곳에서 이어가세요.</span></div><Check /></div>
    </div>
    <div className={styles.screenShade} /><div className={styles.homeIndicator} />
  </div>;
}

const chapters = [
  { number: "01", title: <>당신의 한마디가<br />사업의 시작이 되도록</>, text: <>좋아하는 일과 할 수 있는 만큼<br />편하게 이야기해 주세요</>, mobileText: "관심 있는 일부터 편하게 이야기하세요" },
  { number: "02", title: <>막연했던 생각을<br />시작할 수 있는 크기로</>, text: <>고객과 상품 그리고 필요한 비용까지<br />대화에서 나온 조건을 놓치지 않아요</>, mobileText: "고객과 상품 그리고 시작 조건을 함께 정리해요" },
  { number: "03", title: <>대화는 계획으로<br />계획은 다음 행동으로</>, text: <>읽고 고치고 꺼내 쓸 수 있도록<br />내 사업의 자료로 이어집니다</>, mobileText: "수정 가능한 계획서로 다음을 준비하세요" },
];

export function HomePhoneStory({ previewProgress }: { previewProgress?: number } = {}) {
  const root = useRef<HTMLDivElement>(null);
  const commands = useRef<{ pause: (value: boolean) => boolean; seek: (value: number) => void } | null>(null);
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void import("./home-phone-stage").then(({ createPhoneStage }) => {
        if (disposed) return;
        const stage = createPhoneStage(element, setActive, previewProgress);
        cleanup = stage.dispose;
        commands.current = stage;
        setReady(stage.ready);
      }).catch(() => { element.dataset.renderer = "fallback"; });
    }, { rootMargin: "500px" });
    observer.observe(element);
    return () => { disposed = true; observer.disconnect(); cleanup?.(); commands.current = null; };
  }, [previewProgress]);
  return <section className={styles.story} id="how" aria-label="대화에서 사업계획서까지">
    <div className={styles.track} ref={root} data-scroll-story data-active={active}>
      <div className={styles.stage} data-pin>
        <div className={styles.copyArea} data-story-copy>{chapters.map((chapter, index) => <header className={styles.copy} key={chapter.number} data-story-scene={index} aria-hidden={active !== index}><h2>{chapter.title}</h2><p><span className={styles.desktopCopy}>{chapter.text}</span><span className={styles.mobileCopy}>{chapter.mobileText}</span></p></header>)}<a className={styles.startLink} href="/plan/chat?new=1">내 이야기로 시작하기<ArrowUpRight size={18} /></a></div>
        <div className={styles.stageScene} data-phone-mount aria-hidden="true" />
        <div className={styles.source} data-phone-source><PhoneScreen /><MessageFlight /></div>
        <div className={styles.sceneFooter}><span>가상 사업의 이용 과정 예시</span><input className={styles.scrubber} data-phone-progress type="range" min="0" max="100" step="0.1" defaultValue="0" aria-label="이용 과정 재생 위치" disabled={!ready} onFocus={() => commands.current?.pause(true)} onBlur={() => commands.current?.pause(false)} onChange={event => commands.current?.seek(event.currentTarget.valueAsNumber / 100)} /></div>
      </div>
    </div>
  </section>;
}
