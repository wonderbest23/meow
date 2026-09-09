"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BusinessAppChrome from "../BusinessAppChrome";
import PlanLoading from "../PlanLoading";
import { hydrateFromServer, loadState, saveAnswers, setActivePlan, pushToServer, type Plan } from "../../../lib/plan-builder/plan-store";
import { ACTION_KEY, actionStatus, businessChatHref, businessHubState } from "../../../lib/plan-builder/business-hub";
import { currentBusinessDesign } from "../../../lib/plan-builder/coach";
import { COACH_FIELD_LABELS } from "../../../lib/plan-builder/coach-presentation";
import frame from "../chat/page.module.css";
import styles from "../BusinessHub.module.css";
import LaunchWorkspace from "./LaunchWorkspace";
import ExpertEditor from "./ExpertEditor";
import launchStyles from "./LaunchWorkspace.module.css";

type View = "summary" | "documents" | "action" | "launch";
export default function BusinessWorkspace() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("summary");
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [expert, setExpert] = useState(false);
  const [expertDirty, setExpertDirty] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const id = query.get("planId");
    if (["summary","documents","action","launch"].includes(query.get("tab") ?? "")) setView(query.get("tab") as View);
    if (!id) { setLoaded(true); return; }
    let alive = true, inFlight = false;
    const refresh = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const state = await hydrateFromServer();
        const found = state.plans.find(p => p.id === id) ?? null;
        if (!alive) return;
        setPlan(found); setLoaded(true);
        if (found?.answers.__business_coach) {
          const response = await fetch(`/api/plan/chat?planId=${encodeURIComponent(id)}`, { cache:"no-store" });
          if (response.ok) { const data=await response.json(); if(alive)setRunStatus(data.runStatus ?? null); }
          else if(alive)setRunStatus(null);
        }
      } catch { if(alive){setRunStatus(null);setNotice("최신 상태를 확인하지 못했어요. 연결되면 다시 확인합니다.");} } finally { inFlight = false; }
    };
    void refresh(); const interval = window.setInterval(() => void refresh(),10000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange",visible);
    return () => { alive=false;window.clearInterval(interval);document.removeEventListener("visibilitychange",visible); };
  }, []);

  function tab(next: View) {
    if (next !== view && expertDirty && !window.confirm("저장하지 않은 수정안을 버리고 이동할까요?")) return;
    setView(next);
    const query=new URLSearchParams(window.location.search); query.set("tab",next);
    window.history.replaceState(null,"",`/plan/workspace?${query}`);
    window.requestAnimationFrame(() => heading.current?.focus());
  }
  function openDocument() { if(plan){setActivePlan(plan.id);router.push(`/plan/document?planId=${encodeURIComponent(plan.id)}`);} }
  function openLegacy() { if(plan){setActivePlan(plan.id);router.push("/plan/overview");} }
  const hub=plan ? businessHubState(plan,runStatus) : null;
  const design=hub?.coach ? currentBusinessDesign(hub.coach) : null;
  const action=design?.nextAction;
  const done=plan && action ? actionStatus(plan,action.action) : "pending";
  const chat=plan ? businessChatHref(plan.id) : "/plan/chat?new=1";
  async function mark(status: "done" | "skipped" | "pending") {
    if(!plan || !action || saving)return;
    setSaving(true);setNotice("");
    const ok=saveAnswers(ACTION_KEY,{revision:hub?.revision,action:action.action,status,updatedAt:new Date().toISOString()},plan.id);
    if(!ok){setNotice("기록하지 못했어요. 다시 시도해 주세요.");setSaving(false);return;}
    setPlan(loadState().plans.find(p=>p.id===plan.id) ?? plan);
    const synced=await pushToServer();
    setNotice(synced ? "기록을 저장했어요." : "기기에 기록했어요. 서버 저장은 연결을 확인한 뒤 다시 시도해 주세요.");setSaving(false);
  }
  return <main className={frame.page}><BusinessAppChrome title="내 사업 관리">
    <div className={styles.scroll}><div className={styles.content}>
      {!loaded ? <PlanLoading note="사업을 불러오고 있어요" /> : !plan || !hub ? <><h1>사업을 찾지 못했어요</h1><p>목록에서 이어갈 사업을 다시 선택해 주세요.</p><Link className={styles.primary} href="/plan">내 사업으로</Link></> : <>
        <div className={styles.workspaceTitle}><span className={styles.status}>{hub.status}</span><h1>{plan.title}</h1></div>
        <nav className={styles.tabs} aria-label="사업 관리 메뉴"><button aria-pressed={view==="summary"} onClick={()=>tab("summary")}>사업 요약</button><button aria-pressed={view==="documents"} onClick={()=>tab("documents")}>내 자료</button><button aria-pressed={view==="launch" || view==="action"} onClick={()=>tab("launch")}>사업 시작하기</button>{hub.coach ? <Link href={chat}>대화 이어가기</Link> : <button onClick={openLegacy}>기존 작업 열기</button>}</nav>
        {view==="summary" && hub.coach && <div className={launchStyles.mode} role="group" aria-label="사업 편집 모드"><button aria-pressed={!expert} onClick={()=>{ if (!expertDirty || window.confirm("저장하지 않은 수정안을 버리고 기본 모드로 돌아갈까요?")) setExpert(false); }}>기본</button><button aria-pressed={expert} onClick={()=>setExpert(true)}>전문가</button></div>}
        <section key={view} className={styles.section} aria-label={view==="summary" ? "사업 요약" : view==="documents" ? "내 자료" : view==="launch" ? "사업 시작하기" : "다음 할 일"}>
          {view==="summary" && expert && hub.coach && <ExpertEditor key={plan.id} plan={plan} onSaved={setPlan} onDirtyChange={setExpertDirty} />}
          {view==="summary" && (!expert || !hub.coach) && <>
            <h2 ref={heading} tabIndex={-1}>이런 사업이에요</h2>
            <p>{design?.startingPlan.scope || hub.coach?.business.description || "기존에 작성한 사업계획서를 이어서 확인할 수 있어요."}</p>
            {hub.stale && <div className={styles.notice}><p>대화에서 바꾼 내용이 기존 문서와 달라요. 내 자료에서 확인해 주세요.</p></div>}
            {hub.coach ? <><dl className={styles.keyFacts}>{hub.coach.fields.filter(f=>["customer","offer","price","budget","hoursPerWeek"].includes(f.key)).map(field=><div className={styles.fact} key={field.key}><dt>{COACH_FIELD_LABELS[field.key]}<span>{field.basis==="user" ? "내가 알려준 내용" : "AI 제안"}</span></dt><dd>{field.value}</dd></div>)}</dl><Link className={styles.primary} href={chat}>{hub.coach.ready ? "대화로 수정하기" : "이어서 이야기하기"}</Link>{design && <details><summary>이렇게 제안한 이유</summary><p>{design.startingPlan.whyThis}</p><p>{design.startingPlan.connectionToVision}</p></details>}</> : <button className={styles.primary} onClick={openLegacy}>기존 사업계획서 이어보기</button>}
          </>}
          {view==="documents" && <>
            <h2 ref={heading} tabIndex={-1}>내 사업 자료</h2>
            {hub.documents.length ? <>
              <div className={styles.documentState}><p>{hub.complete ? "사업계획서가 완성됐어요." : "사업계획서를 준비하고 있어요."}</p><span className={styles.count}>{hub.documents.length} / {hub.keys.length} 항목</span></div>
              {!hub.complete && <progress className={styles.progress} aria-label="준비된 문서 항목" value={hub.documents.length} max={hub.keys.length}/>}
              <ul className={styles.fileTypes} aria-label="내보내기 형식"><li>PDF</li><li>워드</li><li>발표자료 PPT</li></ul>
              {hub.stale && <div className={styles.notice}><h3>수정 내용 반영 필요</h3><p>현재 사업안과 다른 내용이 문서에 남아 있어요. 기존 문서는 유지되며, 대화에서 반영을 요청할 수 있어요.</p></div>}
              <button className={styles.primary} onClick={openDocument}>사업계획서 열기</button>
              <p className={styles.downloadNote}>내려받기는 문서에서 · 이용 권한에 따라 결제 필요</p>
            </> : <><p>사업안을 확인한 뒤 계획서를 만들 수 있어요. 지금까지의 대화는 그대로 사용합니다.</p>{hub.coach ? <Link className={styles.primary} href={chat}>사업안 확인하고 자료 만들기</Link> : <button className={styles.primary} onClick={openLegacy}>기존 작업 이어가기</button>}</>}
            {hub.coach && !!hub.documents.length && <Link className={styles.secondary} href={chat}>{hub.stale ? "수정 내용 반영하러 가기" : "자료를 더 다듬기"}</Link>}
            <details><summary>홈페이지도 필요하신가요?</summary><p>사업계획서로 고객에게 보여줄 홈페이지를 만들 수 있어요. 이용 권한에 따라 결제가 필요할 수 있어요.</p><button className={styles.secondary} onClick={() => { setActivePlan(plan.id); router.push("/plan/homepage"); }}>홈페이지 만들기</button></details>
          </>}
          {view==="launch" && <><LaunchWorkspace key={plan.id} plan={plan} onSaved={setPlan} />{action && <button className={styles.textButton} onClick={()=>tab("action")}>대화에서 정한 할 일 보기</button>}</>}
          {view==="action" && <>
            <h2 ref={heading} tabIndex={-1}>{done==="done" ? "하나를 마쳤어요" : done==="skipped" ? "이 일은 나중에 해요" : "지금은 이것 하나만"}</h2>
            <p className={styles.muted}>실행은 선택 사항이에요. 하지 않아도 사업안과 자료는 그대로 남아요.</p>
            {action ? <><h3>{action.action}</h3>{done==="pending" ? <><p>{action.doneWhen}</p>{action.usableText && <details><summary>바로 쓸 내용 보기</summary><blockquote>{action.usableText}</blockquote></details>}<div className={styles.actions}><button className={styles.primary} disabled={saving} onClick={()=>void mark("done")}>완료했어요</button><button className={styles.secondary} disabled={saving} onClick={()=>void mark("skipped")}>지금은 건너뛰기</button></div><Link className={styles.textButton} href={businessChatHref(plan.id,`현재 할 일 ‘${action.action}’이 어려워요. 더 쉬운 행동 하나로 바꿔 주세요.`)}>더 쉬운 방법 물어보기</Link></> : <><Link className={styles.primary} href={businessChatHref(plan.id,`‘${action.action}’을 ${done==="done" ? "완료했어요" : "지금은 건너뛰고 싶어요"}. 현재 사업안에 맞게 다음 할 일 하나를 제안해 주세요.`)}>다음 할 일 정하기</Link><button className={styles.textButton} disabled={saving} onClick={()=>void mark("pending")}>이전 할 일 다시 보기</button></>}</> : hub.coach ? <><p>아직 정해진 할 일이 없어요. 사업을 조금 더 이야기한 뒤 필요한 행동 하나를 정해볼까요?</p><Link className={styles.primary} href={businessChatHref(plan.id,"현재 사업에서 가장 먼저 할 수 있는 일 하나만 정해 주세요.")}>대화로 정하기</Link></> : <><p>기존 방식으로 작성한 사업이에요. 저장된 계획서의 실행 내용을 확인할 수 있어요.</p><button className={styles.primary} onClick={openLegacy}>기존 작업 이어가기</button></>}
            {notice && <p role="status" className={styles.muted}>{notice}</p>}
          </>}
        </section>
      </>}
    </div></div>
  </BusinessAppChrome></main>;
}
