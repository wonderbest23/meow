"use client";

import { Check, MessageSquarePlus, Sparkles } from "lucide-react";
import type { IntakeSnapshot } from "../../../../lib/plan-builder/intake-types";
import styles from "./idea-exploration.module.css";
import { chatTextPreview } from "./model";

export function IdeaExploration({snapshot,selectedDraftId,disabled,onRequest,onCompose,onSelect,rejected,onReject}:{snapshot:IntakeSnapshot;selectedDraftId?:string;disabled:boolean;onRequest:()=>void;onCompose:()=>void;onSelect:(id:string)=>void;rejected:string[];onReject:(ids:string[])=>void}) {
  if(snapshot.intake.mode!=="exploring") return null;
  const ideas=snapshot.intake.generatedIdeas??[];
  return <section className={styles.section} aria-label="새 사업 후보 탐색">
    <header><h3>다른 사업 방향도 찾아볼까요</h3><button type="button" disabled={disabled} onClick={ideas.length?onCompose:onRequest}><Sparkles size={16} aria-hidden="true" />{ideas.length?"후보 수정 대화":"새 사업 후보 제안"}</button></header>
    {!ideas.length&&<p>입력한 관심과 조건으로 아직 정하지 않은 사업을 제안받아요</p>}
    {ideas.length>0&&<p>AI의 미확정 제안이에요 · 독창성·수요·수익성은 검증되지 않았어요</p>}
    <div className={styles.list}>{ideas.map(idea=>{
      const selected=snapshot.intake.selectedCandidate?.id===idea.id;
      const stale=idea.baseInputRevision!==(snapshot.intake.ideaInputRevision??0);
      return <article key={idea.id} data-generated-idea={idea.id}>
        <span>{selected?"선택한 사업":selectedDraftId===idea.id?"선택 중 · 보내기로 확정":idea.rejected?"제외한 후보":stale?"이전 조건의 제안":"AI 후보 · 미확정"}</span>
        <h4>{idea.title}</h4><p>{chatTextPreview(idea.description) ?? idea.description}</p>
        <p>예산·시간은 아직 확인이 필요해요.</p>
        <details><summary>{idea.title} 자세히 보기</summary>
        <p>{idea.description}</p>
        <dl>{[["고객",idea.customer],["해결할 문제",idea.problem],["제공 항목",idea.offering],["제공 방식",idea.delivery],["수익 방식",idea.revenue],["다른 점",idea.differences]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <ul>{idea.unknowns.map((unknown,index)=><li key={index}>{unknown}</li>)}</ul>
        </details>
        {!selected&&<div className={styles.actions}><label><input type="checkbox" disabled={disabled||idea.rejected} checked={rejected.includes(idea.id)} onChange={e=>onReject(e.target.checked?[...rejected,idea.id]:rejected.filter(id=>id!==idea.id))} />다음 제안에서 제외</label><button type="button" disabled={disabled||stale||idea.rejected} onClick={()=>onSelect(idea.id)}><Check size={16} aria-hidden="true" />이 후보 선택</button></div>}
      </article>;
    })}</div>
    {ideas.length>0&&<button type="button" disabled={disabled} onClick={onCompose}><MessageSquarePlus size={16} aria-hidden="true" />다른 고객·방식으로 요청하기</button>}
  </section>;
}
