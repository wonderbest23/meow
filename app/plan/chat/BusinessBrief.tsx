"use client";

import { useState, type ReactNode } from "react";
import { currentBusinessDesign, type CoachField, type CoachState } from "../../../lib/plan-builder/coach";
import { COACH_FIELD_LABELS } from "../../../lib/plan-builder/coach-presentation";
import styles from "./page.module.css";

export default function BusinessBrief({ coach, changed, onEdit, actions }: {
  coach: CoachState; changed: CoachField["key"][]; onEdit: (text: string) => void; actions: ReactNode;
}) {
  const [section, setSection] = useState("intro");
  const design = currentBusinessDesign(coach);
  const sections = [{ id: "intro", label: "사업 소개" }, { id: "product", label: "상품과 고객" }, { id: "money", label: "비용과 운영" }, { id: "action", label: "시작 방법" }];
  const fields = (keys: CoachField["key"][]) => keys.map(key => {
    const field = coach.fields.find(item => item.key === key);
    if (!field) return null;
    return <div key={key} className={`${styles.fact} ${changed.includes(key) ? styles.changed : ""}`}>
      <dt>{COACH_FIELD_LABELS[key]}<span className={styles.basis}>{field.basis === "user" ? "내가 알려준 내용" : "AI 제안"}</span></dt><dd>{field.value}</dd>
    </div>;
  });
  return <>
    <div className={styles.briefScroll}>
      <div className={styles.briefHeading}><span className={styles.eyebrow}>{coach.stage === "operating" ? "내 사업 개선안" : "내 사업안"}</span><h1 tabIndex={-1}>{coach.business.name}</h1><p>AI가 제안한 초안이에요. 대화로 바꿀 수 있어요.</p></div>
      <nav className={styles.sectionNav} aria-label="사업안 항목">{sections.map(item => <button key={item.id} aria-pressed={section === item.id} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav>
      <section className={styles.briefSection} key={section} aria-label={sections.find(item => item.id === section)?.label}>
        {section === "intro" && <><h2>이런 사업이에요</h2><p className={styles.lead}>{design?.startingPlan.scope ?? coach.business.description}</p><dl>{fields(["problem", "goal"])}</dl>
          {design && <details><summary>추천 이유와 다른 방법</summary><h3>이렇게 제안한 이유</h3><p>{design.startingPlan.whyThis}</p><h3>원래 아이디어와의 연결</h3><p>{design.startingPlan.connectionToVision}</p>{design.alternatives.map(item => <div key={item.name}><h3>{item.name}</h3><p>{item.scope}</p><p>고려할 점: {item.tradeoff}</p></div>)}</details>}
          {coach.ideaOrigin && <details><summary>처음 이야기한 아이디어</summary><p>{coach.ideaOrigin.text}</p></details>}
        </>}
        {section === "product" && <><h2>무엇을 누구에게 팔까요?</h2><dl>{fields(["customer", "offer", "price", "channel"])}</dl>{design?.startingPlan.notIncluded.length ? <details><summary>이번 상품에 포함하지 않는 것</summary><ul>{design.startingPlan.notIncluded.map(value => <li key={value}>{value}</li>)}</ul></details> : null}</>}
        {section === "money" && <><h2>얼마나 준비하면 될까요?</h2><dl>{fields(["budget", "setupCost", "cost", "unitCost", "hoursPerWeek", "minutesPerSale", "capacity", "sales", "volume"])}</dl><p className={styles.note}>아직 모르는 비용은 0원이 아니에요. 제안한 금액과 판매 목표는 실제 실적이 아닙니다.</p>{!coach.fields.some(item => ["budget", "cost", "setupCost"].includes(item.key)) && <p>예산이 아직 없어도 괜찮아요. 필요한 비용부터 함께 정리할 수 있어요.</p>}</>}
        {section === "action" && <><h2>먼저 이것 하나만 해보세요</h2>{design ? <><p className={styles.lead}>{design.nextAction.action}</p><h3>여기까지 하면 돼요</h3><p>{design.nextAction.doneWhen}</p><details><summary>바로 쓸 수 있는 작업안</summary><blockquote>{design.nextAction.usableText}</blockquote></details><p className={styles.note}>선택 사항이에요. 하지 않아도 계획서를 만들 수 있어요.</p><details><summary>아직 확인이 필요한 내용</summary>{design.assumptions.map(item => <div key={item.statement}><h3>{item.statement}</h3><p>{item.howToCheck}</p></div>)}</details></> : <p>원하는 시작 방법을 대화로 알려주세요. 할 일 하나부터 정리해드릴게요.</p>}</>}
        <button className={styles.editLink} onClick={() => onEdit(`${sections.find(item => item.id === section)?.label} 내용을 바꾸고 싶어요. `)}>이 내용 수정하기</button>
      </section>
    </div>
    <div className={styles.documentActions}>{actions}</div>
  </>;
}
