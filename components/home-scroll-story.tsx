"use client";

import { ArrowUp, Check, FileText } from "lucide-react";
import { useHomeChoreography } from "./use-home-choreography";
import styles from "./home-scroll-story.module.css";

const business = "동네 가게 메뉴 사진 제작";
const message = "사진 찍는 걸 좋아해요. 퇴근 후에 할 수 있는 사업이 있을까요?";

function Conversation() {
  return <div className={styles.conversation}>
    <div className={styles.windowBar}><span>오늘창업</span><span>사업 기획</span></div>
    <div className={styles.messages}>
      <p className={styles.user} aria-label={message}><span aria-hidden="true">{Array.from(message).map((letter, index) => <span className={styles.letter} key={index} style={{ "--letter": index } as React.CSSProperties}>{letter}</span>)}</span></p>
      <div className={styles.assistant}><span className={styles.aiLabel}>오늘창업</span><p>좋아하는 일에서 시작해 볼게요.<br /><strong>동네 가게의 메뉴 사진</strong>을<br />만들어 주는 건 어떨까요?</p></div>
      <p className={`${styles.user} ${styles.reply}`}>좋아요. 작게 시작하고 싶어요.</p>
    </div>
    <div className={styles.composer} aria-hidden="true"><span>생각을 편하게 이야기해 주세요</span><span className={styles.send}><ArrowUp /></span></div>
  </div>;
}

function Brief() {
  return <div className={styles.brief}>
    <div className={styles.windowBar}><span>내 사업안</span><span>AI 제안</span></div>
    <div className={styles.briefContent}>
      <span className={styles.briefLabel}>사업 소개</span>
      <h4>{business}</h4>
      <dl>{[["누구에게", "사진이 필요한 동네 음식점"], ["무엇을", "메뉴 사진과 짧은 소개문구"], ["첫 시작", "샘플 1세트로 먼저 제안하기"]].map(([label, value], index) => <div key={label} className={styles.briefRow} style={{ "--row": index } as React.CSSProperties}><dt>{label}</dt><dd>{value}<Check aria-hidden="true" /></dd></div>)}</dl>
      <p>가격과 작업 시간은 시험 운영으로 확인해요.</p>
    </div>
  </div>;
}

function Document() {
  return <div className={styles.documentScene}>
    <div className={styles.backPage} aria-hidden="true"><span>02 / 고객과 상품</span><div className={styles.rule} /><strong>사진이 필요한<br />동네 음식점</strong><div className={styles.lines} /><div className={styles.lines} /></div>
    <div className={styles.cover}>
      <div className={styles.coverTop}><span>오늘창업</span><FileText aria-hidden="true" /></div>
      <span className={styles.coverLabel}>BUSINESS PLAN</span>
      <h4>작은 시작을 위한<br />내 사업계획서</h4>
      <p>{business}</p>
      <img src="/home-media/oneulstart-team.png" width="1942" height="809" alt="함께 사업을 구체화하는 사람들" loading="lazy" />
      <div className={styles.coverBottom}><span>사업 소개 · 고객과 상품 · 실행 계획</span><span>01</span></div>
    </div>
    <span className={styles.documentBadge}><Check aria-hidden="true" />검토하고 다듬을 수 있는 문서로</span>
  </div>;
}

const details = [
  { label: "고객", value: "사진이 필요한 동네 음식점" },
  { label: "상품", value: "메뉴 사진과 짧은 소개문구" },
  { label: "첫 시작", value: "샘플 1세트로 먼저 제안하기" },
];

function MorphingProduct() {
  return <div className={styles.product} aria-hidden="true" data-morph-product>
    <div className={styles.paperRear}><span>03 / 실행 계획</span><h4>작게 시작하고,<br />직접 확인하기.</h4><div className={styles.paperTasks}>{["샘플 준비", "첫 고객 제안", "반응 기록"].map((item, i) => <div key={item}><b>0{i + 1}</b><span>{item}</span></div>)}</div></div>
    <div className={styles.surface}>
      <div className={styles.productBar}><img src="/icon.svg" alt="" width="22" height="22" /><span>오늘창업</span><span className={styles.productState}><span>사업 기획</span><span>내 사업안</span><span>사업계획서</span></span></div>
      <div className={styles.sentMessage}><span>사진 찍는 걸 좋아해요.<br />퇴근 후에 할 수 있는 사업이 있을까요?</span><Check /></div>
      <div className={styles.answerLead}><span>오늘창업 AI</span><p>좋아하는 일에서 시작해 볼게요.<br />이런 작은 사업은 어떨까요?</p></div>
      <h4 className={styles.sharedTitle}>동네 가게<br className={styles.mobileBreak} /> 메뉴 사진 제작</h4>
      <div className={styles.organizedHeading}>고객과 상품</div>
      <div className={styles.sharedDetails}>{details.map(({ label, value }, index) => <div className={styles.sharedDetail} key={label} style={{ "--item": index } as React.CSSProperties} data-shared-detail={index}><span className={styles.detailLabel}>{label}</span><span className={styles.detailValue}>{value}</span><Check className={styles.detailCheck} /></div>)}</div>
      <div className={styles.verifyNote}>가격과 작업 시간은 시험 운영으로 확인해요.</div>
      <div className={styles.typingComposer}><span className={styles.typingText}>{Array.from(message).map((letter, index) => <span key={index} style={{ "--character": index } as React.CSSProperties}>{letter}</span>)}</span><span className={styles.sendButton}><ArrowUp /></span></div>
      <div className={styles.paperFooter}><span>사업 소개 · 고객과 상품 · 실행 계획</span><span>02</span></div>
    </div>
    <div className={styles.frontCover}><div className={styles.frontInner}><div className={styles.frontLogo}><img src="/icon.svg" width="20" height="20" alt="" /><span>오늘창업</span></div><span className={styles.frontEyebrow}>BUSINESS PLAN</span><h4>작은 시작을 위한<br />내 사업계획서</h4><p>동네 가게 메뉴 사진 제작</p><img className={styles.frontPhoto} src="/home-media/oneulstart-team.png" width="1942" height="809" loading="lazy" alt="" /><div className={styles.frontBottom}><span>고객과 상품, 시작 방법까지.</span><span>01</span></div></div></div>
    <div className={styles.finishLabel}><Check /><span>이제, 꺼내 쓸 수 있는 계획으로.</span></div>
  </div>;
}

const scenes = [
  { label: "01 / 대화", title: <>시작은,<br /> 당신의 한마디.</>, text: "막연한 생각도 좋아요. 편하게 이야기하세요.", Component: Conversation },
  { label: "02 / 사업안", title: <>흩어진 생각이,<br /> 하나의 사업으로.</>, text: "고객과 상품, 처음 해볼 일까지 구체적으로.", Component: Brief },
  { label: "03 / 사업계획서", title: <>대화가 끝나도,<br /> 계획은 남으니까.</>, text: "다시 읽고 고치며, 다음 시작을 준비하세요.", Component: Document },
];

export function HomeScrollStory() {
  const ref = useHomeChoreography();
  return <section id="how" className={styles.story} aria-label="대화에서 사업계획서까지">
    <div className={styles.track} ref={ref} data-scroll-story>
      <div className={styles.stage} data-pin>
        {scenes.map(({ label, title, text, Component }, index) => <div className={`${styles.scene} ${styles[`scene${index}`]}`} key={label} data-story-scene={index}>
          <header className={styles.copy}><span>{label}</span><h2>{title}</h2><p>{text}</p></header>
          <div className={`${styles.visual} ${styles.staticVisual}`}><Component /></div>
        </div>)}
        <MorphingProduct />
        <div className={styles.stageFooter}><span>이용 과정을 보여주는 가상 사업 예시예요.</span><div className={styles.timeline} aria-hidden="true"><span /><span /><span /></div></div>
      </div>
    </div>
  </section>;
}
