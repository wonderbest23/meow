"use client";

import { useHomeScroll } from "./use-home-scroll";
import styles from "./home-scroll-story.module.css";

function Conversation() {
  return <div className={styles.conversation}>
    <div className={styles.windowBar}><span>오늘창업</span><span>사업 기획</span></div>
    <div className={styles.messages}>
      <p className={styles.user}>사진 찍는 걸 좋아해요.<br />퇴근 후에 할 수 있는 사업이 있을까요?</p>
      <p className={styles.assistant}>좋아하는 일에서 시작해 볼게요.<br /><strong>동네 가게의 메뉴 사진</strong>을<br />만들어 주는 건 어떨까요?</p>
      <p className={`${styles.user} ${styles.reply}`}>좋아요. 작게 시작하고 싶어요.</p>
    </div>
    <div className={styles.composer}><span>생각을 편하게 이야기해 주세요</span><b>보내기</b></div>
  </div>;
}

function Brief() {
  return <div className={styles.brief}>
    <div className={styles.windowBar}><span>내 사업안</span><span>AI 제안</span></div>
    <div className={styles.briefContent}>
      <span className={styles.briefLabel}>사업 소개</span>
      <h4>우리 동네 가게를 위한<br />메뉴 사진 제작</h4>
      <dl><div><dt>누구에게</dt><dd>사진이 필요한 동네 음식점</dd></div><div><dt>무엇을</dt><dd>메뉴 사진과 짧은 소개문구</dd></div><div><dt>어떻게 시작할까</dt><dd>샘플 1세트로 먼저 제안하기</dd></div></dl>
      <p>가격과 작업 시간은 시험 운영으로 확인해요.</p>
    </div>
  </div>;
}

const copy = [
  { label: "대화로 시작", title: <>잘 정리된 생각이<br />아니어도 괜찮아요.</>, text: "좋아하는 일부터 지금 사업의 고민까지. 하고 싶은 이야기 한마디면 돼요." },
  { label: "내 사업안 다듬기", title: <>흩어진 이야기가<br />구체적인 사업으로.</>, text: "누구에게, 무엇을, 어떻게 팔지. 대화를 사업에 필요한 항목으로 정리해요." },
];

export function HomeScrollStory() {
  const ref = useHomeScroll("pin");
  return <section id="how" className={styles.story} aria-labelledby="home-how-title">
    <header className={styles.intro}><span>시작은 한마디</span><h2 id="home-how-title">막연했던 내 생각이<br /><em>시작할 수 있는 계획으로.</em></h2></header>
    <div className={styles.track} ref={ref} data-scroll-story>
      <div className={styles.desktop} data-pin>
        <div className={styles.copyStack}><div className={styles.copy}><span>대화에서 내 사업안까지</span><h3>이야기는 편하게.<br />사업안은 구체적으로.</h3><p>막연한 생각을 상품과 고객,<br />처음 해볼 일로 정리해요.</p><ol className={styles.stageLabels}><li>대화로 가능성 찾기</li><li>내 사업안으로 다듬기</li></ol></div></div>
        <div className={styles.morph} aria-label="대화가 사업안으로 정리되는 예시">
          <div className={styles.chatLayer}><Conversation /></div>
          <div className={styles.briefLayer}><Brief /></div>
        </div>
        <span className={styles.example}>이용 과정을 보여주는 가상 사업 예시예요.</span>
        <div className={styles.timeline} aria-hidden="true"><span /></div>
      </div>
      <div className={styles.mobile}>{copy.map((item, index) => <article key={item.label} data-reveal>
        <div className={styles.copy}><span>{item.label}</span><h3>{item.title}</h3><p>{item.text}</p></div>
        <div className={styles.mobileVisual}>{index ? <Brief /> : <Conversation />}</div>
      </article>)}<p className={styles.example}>이용 과정을 보여주는 가상 사업 예시예요.</p></div>
    </div>
  </section>;
}
