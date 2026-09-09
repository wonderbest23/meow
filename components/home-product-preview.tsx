"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronRight, FileText, Pause, Play } from "lucide-react";
import styles from "./home-product-preview.module.css";

const stages = ["대화로 시작", "사업안 다듬기", "내 사업 관리"];

export function HomeProductPreview() {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPlaying(!motion.matches);
    sync(); motion.addEventListener("change", sync);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); motion.removeEventListener("change", sync); };
  }, []);
  useEffect(() => {
    if (!playing || !visible) return;
    const timer = window.setInterval(() => { if (!document.hidden) setStage(value => (value + 1) % stages.length); }, 6000);
    return () => window.clearInterval(timer);
  }, [playing, visible, stage]);

  return <section ref={root} className={styles.preview} aria-label="사업 기획 과정 미리보기">
    <div className={styles.controls}>
      <div className={styles.steps} aria-label="미리보기 장면 선택">
        {stages.map((label, index) => <button key={label} type="button" aria-pressed={stage === index} onClick={() => { setStage(index); setPlaying(false); }}><span>{index + 1}</span>{label}</button>)}
      </div>
      <button className={styles.play} type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? "미리보기 일시정지" : "미리보기 자동재생"} title={playing ? "일시정지" : "자동재생"}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
    </div>
    <div className={styles.window}>
      <header className={styles.windowHeader}><span className={styles.brand}>오늘창업</span><span>이용 과정 예시</span></header>
      <div className={styles.scene} key={stage}>
        {stage === 0 ? <div className={styles.chat}>
          <div className={styles.chatHeading}><small>사업 기획</small><h2>한마디에서 시작해요.</h2></div>
          <div className={styles.userBubble}>사진 찍는 걸 좋아해요.<br />퇴근 후 할 수 있는 사업이 있을까요?</div>
          <div className={styles.reply}><span className={styles.avatar}>오</span><div><strong>좋아하는 일부터 찾아볼게요.</strong><p>동네 가게의 메뉴 사진과 소개글을 만드는 일은 어떨까요?</p><div className={styles.tags}><span>사진 촬영</span><span>1인 시작</span></div></div></div>
          <div className={styles.composer} aria-hidden="true"><span>생각을 편하게 이야기해 주세요</span><ArrowUp size={20} /></div>
        </div> : stage === 1 ? <div className={styles.brief}>
          <small className={styles.badge}>내 사업안 · 예시</small><h2>동네 가게 메뉴 사진 제작</h2>
          <div className={styles.briefTabs}><b>사업 소개</b><span>상품과 고객</span><span>비용과 운영</span></div>
          <h3>이런 사업이에요</h3><p>음식점과 카페의 메뉴를 촬영하고, 가게 소개에 쓸 사진과 짧은 소개글을 함께 제공해요.</p>
          <div className={styles.facts}><div><small>첫 상품</small><strong>사진 2장 + 소개글</strong></div><div><small>시험 가격 · 가정</small><strong>메뉴 1개 6만 원</strong></div></div>
          <div className={styles.editRow} aria-hidden="true"><span>AI와 다듬기</span><span>직접 수정</span></div>
        </div> : <div className={styles.hub}>
          <small className={styles.badge}><Check size={13} /> 문서가 준비된 모습</small><h2>이제, 내 사업을 한곳에서.</h2>
          <div className={styles.hubTabs}><b>내 자료</b><span>사업 요약</span><span>사업 시작하기</span></div>
          <div className={styles.document}><div className={styles.paper}><FileText size={20}/><strong>사업계획서</strong><p>동네 가게<br />메뉴 사진 제작</p><i/><i/><i/></div><div><h3>내 사업계획서</h3><p>사업 소개부터 비용과 운영까지</p><span className={styles.fileTypes}>PDF · Word</span></div><ChevronRight size={22}/></div>
          <div className={styles.next}><span>다음 할 일</span><strong>첫 상품 구성 다듬기</strong><ChevronRight size={18}/></div>
        </div>}
      </div>
      <div className={styles.timeline} aria-hidden="true">{stages.map((label, index) => <i key={label} className={index === stage ? styles.current : ""} />)}</div>
    </div>
    <p className={styles.caption}>가상 사업으로 보여드리는 예시이며, 실제 내용은 대화에 따라 달라집니다.</p>
  </section>;
}
