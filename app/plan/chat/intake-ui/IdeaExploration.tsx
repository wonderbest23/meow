"use client";

import { Check, MessageSquarePlus, MessageCircle } from "lucide-react";
import type { IntakeSnapshot } from "../../../../lib/plan-builder/intake-types";
import { candidateConditionFit, selectedStartConditions } from "../../../../lib/plan-builder/intake-candidate-constraints";
import styles from "./idea-exploration.module.css";
import { chatTextPreview } from "./model";

/*
 * AI가 이 사업을 위해 만든 새 사업 제안. 보이는 제안은 언제나 고를 수 있다(서버도 같은 제안을 보기로 받는다).
 * 고른 시작 조건과 다르면 카드에 한 줄로 알려 주고, 저장하지 못하면 고른 카드 바로 아래에 이유를 보여 준다.
 */
export function IdeaExploration({snapshot,selectedDraftId,disabled,onRequest,onCompose,onSelect,rejected,onReject,error}:{snapshot:IntakeSnapshot;selectedDraftId?:string;disabled:boolean;onRequest:()=>void;onCompose:()=>void;onSelect:(id:string)=>void;rejected:string[];onReject:(ids:string[])=>void;error?:string}) {
  if(snapshot.intake.mode!=="exploring") return null;
  const ideas=snapshot.intake.generatedIdeas??[];
  const conditions=selectedStartConditions(snapshot.intake.answers.conditions?.value);
  const errorShownOnCard=!!error&&ideas.some(idea=>idea.id===selectedDraftId);
  return <section className={styles.section} aria-label="새 사업 방향 찾기">
    <header><h3>다른 사업 방향도 찾아볼까요</h3><button type="button" disabled={disabled} onClick={ideas.length?onCompose:onRequest}><MessageCircle size={16} aria-hidden="true" />{ideas.length?"다르게 다시 제안받기":"AI에게 새 사업 제안받기"}</button></header>
    {!ideas.length&&<p>고르신 관심 분야와 조건으로, 목록에 없는 사업을 AI가 제안해 드려요.</p>}
    {ideas.length>0&&<p>AI가 제안한 예시예요. 실제로 찾는 사람이 있는지, 돈이 되는지는 아직 알 수 없어요. 예산·시간은 고른 뒤에 맞춰 봐요.</p>}
    {error&&!errorShownOnCard&&<p className={styles.error} role="alert">{error}</p>}
    <div className={styles.list}>{ideas.map(idea=>{
      const selected=snapshot.intake.selectedCandidate?.id===idea.id;
      const stale=idea.baseInputRevision!==(snapshot.intake.ideaInputRevision??0);
      const differs=!stale&&!idea.rejected&&conditions.length>0&&candidateConditionFit(idea.proposedStructure??{},conditions).conflict;
      return <article key={idea.id} data-generated-idea={idea.id}>
        <span>{selected?"고른 사업":selectedDraftId===idea.id?"고르는 중":idea.rejected?"다음 제안에서 뺀 사업":stale?"조건을 바꾸기 전 제안":"AI 제안"}</span>
        <h4>{idea.title}</h4><p>{chatTextPreview(idea.description) ?? idea.description}</p>
        {differs&&<p className={styles.note}>고르신 시작 조건과 다른 부분이 있어요. 그래도 고를 수 있어요.</p>}
        {stale&&!selected&&<p className={styles.note}>조건이 바뀌어서 고를 수 없어요. 위에서 다시 제안받아 주세요.</p>}
        <details><summary>{idea.title} 자세히 보기</summary>
        <p>{idea.description}</p>
        <dl>{[["고객",idea.customer],["해결할 문제",idea.problem],["제공 항목",idea.offering],["제공 방식",idea.delivery],["수익 방식",idea.revenue],["다른 점",idea.differences]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {idea.unknowns.length>0&&<><p>더 알아볼 점</p><ul>{idea.unknowns.map((unknown,index)=><li key={index}>{unknown}</li>)}</ul></>}
        </details>
        {!selected&&<div className={styles.actions}><label><input type="checkbox" disabled={disabled||idea.rejected} checked={rejected.includes(idea.id)} onChange={e=>onReject(e.target.checked?[...rejected,idea.id]:rejected.filter(id=>id!==idea.id))} />다음 제안에서 빼기</label><button type="button" disabled={disabled||stale||idea.rejected} onClick={()=>onSelect(idea.id)}><Check size={16} aria-hidden="true" />이 사업 고르기</button></div>}
        {error&&selectedDraftId===idea.id&&<p className={styles.error} role="alert">{error}</p>}
      </article>;
    })}</div>
    {ideas.length>0&&<button type="button" disabled={disabled} onClick={onCompose}><MessageSquarePlus size={16} aria-hidden="true" />다른 고객·방식으로 요청하기</button>}
  </section>;
}
