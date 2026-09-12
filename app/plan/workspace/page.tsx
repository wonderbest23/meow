"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BusinessAppChrome from "../BusinessAppChrome";
import PlanLoading from "../PlanLoading";
import { hydrateFromServer, loadState, saveAnswers, setActivePlan, pushToServer, type Plan } from "../../../lib/plan-builder/plan-store";
import { ACTION_KEY, actionStatus, businessChatHref, businessHubState, businessNextStep } from "../../../lib/plan-builder/business-hub";
import { currentBusinessDesign, currentNextAction } from "../../../lib/plan-builder/coach";
import frame from "../chat/page.module.css";
import styles from "../BusinessHub.module.css";
import LaunchWorkspace from "./LaunchWorkspace";
import ExpertEditor from "./ExpertEditor";
import launchStyles from "./LaunchWorkspace.module.css";
import { WorkspaceDocumentStatus, WorkspaceIdentity, WorkspaceNavigation, WorkspaceSummary, type WorkspaceView } from "./WorkspaceContent";

type View = WorkspaceView;
export default function BusinessWorkspace() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
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
        setPlan(found); setLoaded(true); setLoadError(false);
        if (found?.answers.__business_coach) {
          const response = await fetch(`/api/plan/chat?planId=${encodeURIComponent(id)}`, { cache:"no-store" });
          if (response.ok) { const data=await response.json(); if(alive)setRunStatus(data.runStatus ?? null); }
          else if(alive)setRunStatus(null);
        }
      } catch { if(alive){setLoaded(true);setLoadError(true);setRunStatus(null);} } finally { inFlight = false; }
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
  const action=hub?.coach ? currentNextAction(hub.coach) : undefined;
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
    {!loaded ? <PlanLoading fill variant="compact" note="사업을 불러오고 있어요" /> : <div className={styles.scroll}><div className={styles.content}>
      {!plan || !hub ? <section className={styles.empty}><h1>{loadError ? "사업을 불러오지 못했어요" : "먼저 사업을 선택해 주세요"}</h1><p>{loadError ? "연결을 확인해 주세요. 저장한 사업은 목록에서 다시 열 수 있어요." : "내 사업에서 관리할 사업을 선택하거나 새 대화를 시작해 주세요."}</p><Link className={styles.primary} href="/plan">내 사업으로</Link><Link className={styles.textButton} href="/plan/chat?new=1">새 대화 시작하기</Link></section> : <>
        {loadError && <p role="status" className={styles.notice}>최신 상태를 확인하지 못했어요. 연결되면 다시 확인합니다.</p>}
        <WorkspaceIdentity title={plan.title} status={hub.status} />
        <WorkspaceNavigation view={view} onChange={tab}>{hub.coach ? <Link href={chat}>대화 이어가기</Link> : <button onClick={openLegacy}>기존 작업 열기</button>}</WorkspaceNavigation>
        {view==="summary" && hub.coach && <div className={launchStyles.mode} role="group" aria-label="사업 편집 모드"><button aria-pressed={!expert} onClick={()=>{ if (!expertDirty || window.confirm("저장하지 않은 수정안을 버리고 기본 모드로 돌아갈까요?")) setExpert(false); }}>기본</button><button aria-pressed={expert} onClick={()=>setExpert(true)}>전문가</button></div>}
        <section key={view} className={styles.section} aria-label={view==="summary" ? "사업 요약" : view==="documents" ? "내 자료" : view==="launch" ? "사업 시작하기" : "다음 할 일"}>
          {view==="summary" && expert && hub.coach && <ExpertEditor key={plan.id} plan={plan} onSaved={setPlan} onDirtyChange={setExpertDirty} />}
          {view==="summary" && (!expert || !hub.coach) && <WorkspaceSummary headingRef={heading} description={design?.startingPlan.scope || hub.coach?.business.description || "기존에 작성한 사업계획서를 이어서 확인할 수 있어요."} stale={hub.stale} fields={hub.coach?.fields}>
            {hub.coach ? <><Link className={styles.primary} href={chat}>{hub.coach.ready ? "대화로 수정하기" : "이어서 이야기하기"}</Link>{design && <details><summary>이렇게 제안한 이유</summary><p>{design.startingPlan.whyThis}</p><p>{design.startingPlan.connectionToVision}</p></details>}</> : <button className={styles.primary} onClick={openLegacy}>기존 사업계획서 이어보기</button>}
          </WorkspaceSummary>}
          {view==="documents" && <>
            <h2 ref={heading} tabIndex={-1}>내 사업 자료</h2>
            {hub.documents.length ? <>
              <WorkspaceDocumentStatus complete={hub.complete} count={hub.documents.length} total={hub.keys.length} stale={hub.stale} onOpen={openDocument} />
            </> : <><p>사업안을 확인한 뒤 계획서를 만들 수 있어요. 지금까지의 대화는 그대로 사용합니다.</p>{hub.coach ? <Link className={styles.primary} href={chat}>사업안 확인하고 자료 만들기</Link> : <button className={styles.primary} onClick={openLegacy}>기존 작업 이어가기</button>}</>}
            {hub.coach && !!hub.documents.length && <Link className={styles.secondary} href={chat}>{hub.stale ? "수정 내용 반영하러 가기" : "자료를 더 다듬기"}</Link>}
            {hub.complete && !hub.stale && <div className={styles.nextStep}><span>계획 다음 단계</span><h3>{businessNextStep(plan).title}</h3><p>지금 선택한 사업의 상품·운영·홈페이지 준비를 이어가요.</p><Link className={styles.secondary} href={businessNextStep(plan).href}>준비 과정 이어가기</Link></div>}
            <details><summary>홈페이지도 필요하신가요?</summary><p>사업계획서로 고객에게 보여줄 홈페이지를 만들 수 있어요. 이용 권한에 따라 결제가 필요할 수 있어요.</p><button className={styles.secondary} onClick={() => { setActivePlan(plan.id); router.push("/plan/homepage"); }}>홈페이지 만들기</button></details>
          </>}
          {view==="launch" && <>{action && <button className={styles.textButton} onClick={()=>tab("action")}>대화에서 정한 할 일 보기</button>}<LaunchWorkspace key={plan.id} plan={plan} onSaved={setPlan} /></>}
          {view==="action" && <>
            <h2 ref={heading} tabIndex={-1}>{done==="done" ? "하나를 마쳤어요" : done==="skipped" ? "이 일은 나중에 해요" : "지금은 이것 하나만"}</h2>
            <p className={styles.muted}>실행은 선택 사항이에요. 하지 않아도 사업안과 자료는 그대로 남아요.</p>
            {action ? <><h3>{action.action}</h3>{done==="pending" ? <><p>{action.doneWhen}</p>{action.usableText && <details><summary>바로 쓸 내용 보기</summary><blockquote>{action.usableText}</blockquote></details>}<div className={styles.actions}><button className={styles.primary} disabled={saving} onClick={()=>void mark("done")}>완료했어요</button><button className={styles.secondary} disabled={saving} onClick={()=>void mark("skipped")}>지금은 건너뛰기</button></div><Link className={styles.textButton} href={businessChatHref(plan.id,`현재 할 일 ‘${action.action}’이 어려워요. 더 쉬운 행동 하나로 바꿔 주세요.`)}>더 쉬운 방법 물어보기</Link></> : <><Link className={styles.primary} href={businessChatHref(plan.id,`‘${action.action}’을 ${done==="done" ? "완료했어요" : "지금은 건너뛰고 싶어요"}. 현재 사업안에 맞게 다음 할 일 하나를 제안해 주세요.`)}>다음 할 일 정하기</Link><button className={styles.textButton} disabled={saving} onClick={()=>void mark("pending")}>이전 할 일 다시 보기</button></>}</> : hub.coach ? <><p>아직 정해진 할 일이 없어요. 사업을 조금 더 이야기한 뒤 필요한 행동 하나를 정해볼까요?</p><Link className={styles.primary} href={businessChatHref(plan.id,"현재 사업에서 가장 먼저 할 수 있는 일 하나만 정해 주세요.")}>대화로 정하기</Link></> : <><p>기존 방식으로 작성한 사업이에요. 저장된 계획서의 실행 내용을 확인할 수 있어요.</p><button className={styles.primary} onClick={openLegacy}>기존 작업 이어가기</button></>}
            {notice && <p role="status" className={styles.muted}>{notice}</p>}
          </>}
        </section>
      </>}
    </div></div>}
  </BusinessAppChrome></main>;
}
