"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BusinessAppChrome from "../BusinessAppChrome";
import PlanLoading from "../PlanLoading";
import { hydrateFromServer, isSamplePlan, lastHydrationFailed, loadState, saveAnswers, setActivePlan, pushToServer, type Plan } from "../../../lib/plan-builder/plan-store";
import { ACTION_KEY, actionStatus, businessChatHref, businessHubState, shouldResumeBusinessChat } from "../../../lib/plan-builder/business-hub";
import { isCoachJobActive, readCoachJob } from "../../../lib/plan-builder/coach-job-types";
import { journeyNext } from "../../../lib/plan-builder/journey";
import { currentBusinessDesign, currentNextAction } from "../../../lib/plan-builder/coach";
import frame from "../chat/page.module.css";
import styles from "../BusinessHub.module.css";
import LaunchWorkspace from "./LaunchWorkspace";
import ExpertEditor from "./ExpertEditor";
import launchStyles from "./LaunchWorkspace.module.css";
import OperatingWorkspace, { chatRecordFrom } from "./OperatingWorkspace";
import { useHomepage } from "../use-homepage";
import { NextServices } from "../../../components/next-services";
import { WorkspaceDocumentStatus, WorkspaceHomepageCare, WorkspaceIdentity, WorkspaceNavigation, WorkspaceSummary, type WorkspaceView } from "./WorkspaceContent";
import { loadAuthSession } from "../../../lib/client/auth-session";
import { fetchWithTimeout } from "../../../lib/client/user-error";
import { askConfirm } from "../../../components/confirm-dialog";
import { WORKSPACE_TAB_EVENT, WORKSPACE_TAB_REQUEST } from "../../../lib/plan-builder/journey";
import { useStudioDirty, useStudioNav, useStudioPane } from "../studio/StudioContext";
import { paneLinkCapture } from "../document/pane-link";

type View = WorkspaceView;
/*
 * view 를 주면(작업실 칸) 그 화면 하나만 그린다 — 탭 줄·사업명 줄을 숨기고, 주소를 /plan/workspace 로 덮어쓰지 않고,
 * 왼쪽 메뉴의 탭 신호도 받지 않는다. 작업실은 '사업 시작하기'·'유지보수' 칸을 따로 하나씩 띄운다.
 */
export function BusinessWorkspace({ view: paneView }: { view?: "launch" | "operations" } = {}) {
  const router = useRouter();
  const pane = useStudioPane();
  const nav = useStudioNav();
  /* 작업실 칸인지 — view 를 받았을 때만(작업실 밖에서 view 없이 쓰면 예전 화면 그대로) */
  const embedded = !!paneView;
  /* 작업실 칸이면 이동은 작업실이 처리한다(같은 사업의 다른 단계는 탭 바꾸기, 나머지는 실제 이동) */
  const go = (href: string) => { if (embedded && nav) nav.push(href); else router.push(href); };
  const paneViewRef = useRef(paneView); const panePlanId = useRef(pane?.planId ?? null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<View>(paneView ?? "summary");
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [expert, setExpert] = useState(false);
  const [expertDirty, setExpertDirty] = useState(false);
  const [operatingDirty, setOperatingDirty] = useState(false);
  /* 주소에 사업이 있었는지 — 지운 사업 주소로 들어오면 '먼저 선택해 주세요'가 아니라 '찾지 못했어요' */
  const [requested, setRequested] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const navRef = useRef(nav); navRef.current = nav;
  const paneActive = pane?.active ?? false;
  const paneActiveRef = useRef(paneActive); paneActiveRef.current = paneActive;
  /*
   * 작업실 칸 — 대화가 덜 끝난 사업이면 처음 한 번만 대화 탭으로 바꾸고(sentToChat), 그 뒤로는 칸 안에 안내를 둔다.
   * 예전 화면처럼 매번 보내면 10초마다 대화 탭으로 끌려갔다. resumeChat 은 그 사업의 대화 주소.
   */
  const sentToChat = useRef(false);
  const [resumeChat, setResumeChat] = useState<string | null>(null);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const id = paneViewRef.current ? panePlanId.current ?? query.get("planId") : query.get("planId");
    /* 작업실 칸은 보여 줄 화면을 밖에서 정한다 — 작업실 주소의 tab(chat·plan 등)을 읽지 않는다 */
    if (!paneViewRef.current && ["summary","documents","action","launch","operations"].includes(query.get("tab") ?? "")) setView(query.get("tab") as View);
    if (!id) {
      /* 주소에 사업이 없으면 '먼저 선택해 주세요' 대신 가장 최근에 쓴 사업으로 연다(사업이 없을 때만 안내) */
      let alive = true;
      hydrateFromServer().catch(() => loadState()).then(state => {
        if (!alive) return;
        const own = state.plans.filter(p => !isSamplePlan(p.id));
        const recent = own.find(p => p.id === state.activePlanId) ?? [...own].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0];
        if (recent) { const tab = query.get("tab"); router.replace(`/plan/workspace?planId=${encodeURIComponent(recent.id)}${tab ? `&tab=${encodeURIComponent(tab)}` : ""}`); return; }
        setLoaded(true); setLoadError(lastHydrationFailed());
      });
      return () => { alive = false; };
    }
    setRequested(true);
    /*
     * 10초마다 다시 읽는 것은 문서를 만드는 중이거나 불러오지 못했을 때만 — 예전엔 화면을 열어 둔 내내
     * 10초마다 사업 전체를 서버에서 다시 읽었다. 화면으로 돌아오면(visibilitychange) 언제든 다시 읽는다.
     */
    let alive = true, inFlight = false, keepPolling = true;
    const refresh = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const state = await hydrateFromServer();
        const found = state.plans.find(p => p.id === id) ?? null;
        if (!alive) return;
        if (found && shouldResumeBusinessChat(found)) {
          /* 작업실 칸이면 작업실 밖으로 나가지 않고 대화 탭으로 바꾼다 — 한 번만, 그 뒤로는 칸 안 안내(아래) */
          if (paneViewRef.current) {
            if (!sentToChat.current && paneActiveRef.current && navRef.current) { sentToChat.current = true; navRef.current.replace(businessChatHref(found.id)); }
            keepPolling = false; setResumeChat(businessChatHref(found.id)); setLoaded(true);
            return;
          }
          router.replace(businessChatHref(found.id));
          return;
        }
        if (paneViewRef.current) setResumeChat(null);
        // 서버 목록을 못 불러왔는데 이 사업도 없으면 '선택해 주세요'가 아니라 '불러오지 못했어요'
        // 전문가 저장 직후 먼저 출발한 새로고침이 늦게 오면 옛 사업으로 되돌리지 않는다
        setPlan(current => current && found && current.id === found.id && found.updatedAt.localeCompare(current.updatedAt) < 0 ? current : found);
        setLoaded(true); setLoadError(lastHydrationFailed());
        let status: string | null = null;
        if (found?.answers.__business_coach) {
          const response = await fetchWithTimeout(`/api/plan/chat?planId=${encodeURIComponent(id)}`, { cache:"no-store" });
          if (response.ok) { const data=await response.json(); status = data.runStatus ?? null; }
          if(alive)setRunStatus(status);
        }
        keepPolling = lastHydrationFailed() || (!!found && (isCoachJobActive(readCoachJob(found.answers)) || businessHubState(found, status).running));
      } catch { keepPolling = true; if(alive){setLoaded(true);setLoadError(true);setRunStatus(null);} } finally { inFlight = false; }
    };
    refreshRef.current = refresh;
    void refresh(); const interval = window.setInterval(() => { if (keepPolling) void refresh(); },10000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange",visible);
    return () => { alive=false;window.clearInterval(interval);document.removeEventListener("visibilitychange",visible); };
  }, [router]);

  /* 작업실 칸이 다시 보이면 대화를 마쳤는지 한 번 더 확인한다(기다리는 동안은 10초마다 묻지 않는다) */
  const wasActive = useRef(paneActive);
  useEffect(() => {
    const was = wasActive.current; wasActive.current = paneActive;
    if (!was && paneActive && resumeChat) void refreshRef.current?.();
  }, [paneActive, resumeChat]);

  /* 저장하지 않고 떠날 때 묻는 창 — 유지보수 기록·전문가 수정안 모두 같은 모양으로(예전엔 세 가지 모양이었다) */
  const confirmLeave = (message: string) => askConfirm({ title: "저장하지 않고 이동할까요?", message, cancelLabel: "계속 작성", confirmLabel: "저장하지 않고 이동" });
  const OPERATING_LEAVE = "입력 중인 기록이 사라져요. 저장 중이라면 끝날 때까지 기다려 주세요.";
  const EXPERT_LEAVE = "저장하지 않은 수정안이 사라져요.";
  /* 작업실 칸 — 링크마다 묻는 대신(onClickCapture) 작업실에 알리고, 작업실 밖으로 나갈 때 작업실이 한 번 묻는다 */
  useStudioDirty(`workspace-${paneView ?? "page"}`, embedded && (operatingDirty || expertDirty), operatingDirty ? OPERATING_LEAVE : EXPERT_LEAVE);

  const leavingExpert = useRef(false);
  async function tab(next: View) {
    if (next !== view && operatingDirty) { if (!await confirmLeave(OPERATING_LEAVE)) return; setOperatingDirty(false); }
    else if (next !== view && expertDirty && !await confirmLeave(EXPERT_LEAVE)) return;
    setView(next);
    /* 작업실 칸에서는 주소를 /plan/workspace 로 덮어쓰지 않는다(작업실 주소가 망가진다) — 칸 안에서만 바꾼다 */
    if (!embedded) {
      const query=new URLSearchParams(window.location.search); query.set("tab",next);
      window.history.replaceState(null,"",`/plan/workspace?${query}`);
      /* 왼쪽 목록이 지금 탭(사업 시작하기·유지보수)을 표시하도록 알린다 — 주소만 바꿔서는 목록이 다시 그려지지 않는다 */
      window.dispatchEvent(new Event(WORKSPACE_TAB_EVENT));
    }
    window.requestAnimationFrame(() => heading.current?.focus());
  }
  /* 왼쪽 목록의 '사업 시작하기'·'유지보수'를 이 화면에서 누르면 링크 대신 이 신호가 온다 — 탭 바꾸기와 같은 길로 */
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; });
  useEffect(() => {
    /* 작업실 칸은 왼쪽 메뉴의 탭 신호를 받지 않는다 — 작업실이 탭을 바꾼다 */
    if (paneViewRef.current) return;
    const onRequest = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (["summary","documents","action","launch","operations"].includes(next)) void tabRef.current(next as View);
    };
    window.addEventListener(WORKSPACE_TAB_REQUEST, onRequest);
    return () => window.removeEventListener(WORKSPACE_TAB_REQUEST, onRequest);
  }, []);
  function openDocument() { if(plan){setActivePlan(plan.id);go(`/plan/document?planId=${encodeURIComponent(plan.id)}`);} }
  const hub=plan ? businessHubState(plan,runStatus) : null;
  /* 대화 없이 쓴 예전 사업 — 써 둔 계획서가 있으면 그 문서로, 하나도 없을 때만 예전 작성 화면으로 */
  function openLegacy() { if(!plan)return; if(hub?.documents.length){openDocument();return;} setActivePlan(plan.id);go("/plan/overview"); }
  const homepage=useHomepage(plan?.id);
  const design=hub?.coach ? currentBusinessDesign(hub.coach) : null;
  const action=hub?.coach ? currentNextAction(hub.coach) : undefined;
  const done=plan && action ? actionStatus(plan,action.action) : "pending";
  const chat=plan ? businessChatHref(plan.id) : "/plan/chat?new=1";
  /*
   * 메일·문자 링크를 다른 기기에서 열면 사업을 찾지 못한다 — 로그인하지 않은 경우면 로그인 후 이 화면으로 돌아오게 한다.
   * (예전엔 '먼저 사업을 선택해 주세요'만 있어 로그인할 길이 없었다)
   */
  const [signedOut, setSignedOut] = useState(false);
  const [currentPath, setCurrentPath] = useState("/plan");
  useEffect(() => {
    if (!loaded || plan) return;
    setCurrentPath(`${window.location.pathname}${window.location.search}`);
    let alive = true;
    loadAuthSession().then(d => { if (alive) setSignedOut(!d.authenticated); }).catch(() => {});
    return () => { alive = false; };
  }, [loaded, plan]);
  async function mark(status: "done" | "skipped" | "pending") {
    if(!plan || !action || saving)return;
    setSaving(true);setNotice("");
    const ok=saveAnswers(ACTION_KEY,{revision:hub?.revision,action:action.action,status,updatedAt:new Date().toISOString()},plan.id);
    if(!ok){setNotice("기록하지 못했어요. 다시 시도해 주세요.");setSaving(false);return;}
    setPlan(loadState().plans.find(p=>p.id===plan.id) ?? plan);
    const synced=await pushToServer();
    setNotice(synced ? "기록을 저장했어요." : "기기에 기록했어요. 서버 저장은 연결을 확인한 뒤 다시 시도해 주세요.");setSaving(false);
  }
  /* 작업실 칸이면 main 대신 칸 본문(div) — 작업실 루트가 페이지의 유일한 main 이다 */
  const Root = embedded ? "div" : "main";
  return <Root className={embedded ? `${frame.page} ${styles.embeddedRoot}` : frame.page} data-embedded={embedded ? "" : undefined} onClickCapture={embedded ? paneLinkCapture(nav, plan?.id) : event => {
    if (!operatingDirty && !expertDirty) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.hasAttribute("download") || anchor.target === "_blank") return;
    if (leavingExpert.current) { leavingExpert.current = false; return; }
    /* 왼쪽 목록의 같은 사업 탭 링크(사업 시작하기·유지보수)는 탭 바꾸기 신호로 오고, tab() 이 한 번만 묻는다 — 여기서 또 물으면 두 번 떴다 */
    const target = new URL(anchor.href);
    if (target.pathname === "/plan/workspace" && target.searchParams.get("planId") === new URLSearchParams(window.location.search).get("planId")) return;
    event.preventDefault(); event.stopPropagation();
    const href = anchor.href;
    if (operatingDirty) { void confirmLeave(OPERATING_LEAVE).then(ok => { if (ok) { setOperatingDirty(false); router.push(href); } }); return; }
    /* 전문가 모드 수정안 — 탭 이동·'기본'에서는 물었지만 '대화 이어가기'·메뉴·뒤로 링크로는 그냥 사라졌다 */
    void confirmLeave(EXPERT_LEAVE).then(ok => { if (ok) { leavingExpert.current = true; anchor.click(); } });
  }}><BusinessAppChrome title="내 사업 관리" titleHeading={false}>
    {!loaded ? <PlanLoading fill variant="compact" note="사업을 불러오고 있어요" /> : embedded && resumeChat ? <div className={styles.scroll}><div className={styles.content}>
      <section className={styles.empty}><h2>사업 이야기를 먼저 마쳐 주세요</h2><p>대화에서 사업안을 정하면 여기서 이어서 준비할 수 있어요.</p><Link className={styles.primary} href={resumeChat}>대화로 가기</Link></section>
    </div></div> : <div className={styles.scroll}><div className={styles.content}>
      {!plan || !hub ? <section className={styles.empty}><h1>{loadError ? "사업을 불러오지 못했어요" : requested ? "사업을 찾지 못했어요" : "먼저 사업을 선택해 주세요"}</h1><p>{loadError ? "연결을 확인해 주세요. 저장한 사업은 목록에서 다시 열 수 있어요." : requested ? "지웠거나 다른 계정에서 만든 사업일 수 있어요. 내 사업 목록에서 다시 골라 주세요." : "내 사업에서 관리할 사업을 선택하거나 새 대화를 시작해 주세요."}</p>{loadError && !signedOut ? <button type="button" className={styles.primary} onClick={() => window.location.reload()}>다시 시도</button> : signedOut ? <Link className={styles.primary} href={`/account?next=${encodeURIComponent(currentPath)}`}>로그인하고 이어서 보기</Link> : <Link className={styles.primary} href="/plan">내 사업으로</Link>}<Link className={styles.textButton} href="/plan/chat?new=1">새 대화 시작하기</Link></section> : <>
        {loadError && <p role="status" className={styles.notice}>최신 상태를 확인하지 못했어요. 연결되면 다시 확인할게요.</p>}
        {/* 유지보수 화면에는 유지보수만 — 사업 요약·내 자료 탭과 '대화 이어가기'는 헷갈린다(소유자 지적 2026-10-07). 대화는 왼쪽 목록의 '대화'로 */}
        {!embedded && <WorkspaceIdentity title={plan.title} status={hub.status} action={view === "operations" ? undefined : hub.coach ? <Link className={styles.titleAction} href={chat}>대화 이어가기</Link> : <button type="button" className={styles.titleAction} onClick={openLegacy}>기존 작업 열기</button>} />}
        {/* 탭 줄은 유지보수에서도 그대로 둔다 — 유지보수로 오면 탭 줄이 사라지고 제목까지 바뀌어 다른 화면으로 넘어간 줄 알았다(여정 점검 2026-10-22) */}
        {/* 작업실 칸에는 탭 줄·사업명 줄이 없다(작업실 탭이 대신한다) — 칸 안에서 다른 화면을 열었으면 돌아가는 단추 하나 */}
        {!embedded && <WorkspaceNavigation view={view} onChange={tab} operating={hub.coach?.stage === "operating"} />}
        {embedded && paneView && view !== paneView && <p className={styles.tabLink}><button type="button" className={styles.textButton} onClick={() => void tab(paneView)}>← {paneView === "operations" ? "유지보수" : hub.coach?.stage === "operating" ? "운영 개선하기" : "사업 시작하기"}로 돌아가기</button></p>}
        {view==="summary" && hub.coach && <div className={launchStyles.mode} role="group" aria-label="사업 편집 모드"><button aria-pressed={!expert} onClick={async ()=>{ if (!expertDirty || await askConfirm({ title: "기본 모드로 돌아갈까요?", message: EXPERT_LEAVE, cancelLabel: "계속 작성", confirmLabel: "저장하지 않고 돌아가기" })) setExpert(false); }}>기본</button><button aria-pressed={expert} onClick={()=>setExpert(true)}>전문가</button></div>}
        <section key={view} className={styles.section} aria-label={view==="summary" ? "사업 요약" : view==="documents" ? "내 자료" : view==="operations" ? "유지보수" : view==="launch" ? (hub.coach?.stage === "operating" ? "운영 개선하기" : "사업 시작하기") : "다음 할 일"}>
          {view==="operations" && <WorkspaceHomepageCare planId={plan.id} status={homepage.status} publicPath={homepage.publicPath} />}
          {/* 실적 기록이 먼저, 맡길 일(마케팅) 상담 신청은 그 아래 — 예전엔 서비스 판매 카드가 기록보다 위에 있었다 */}
          {view==="operations" && <OperatingWorkspace key={plan.id} planId={plan.id} onDirtyChange={setOperatingDirty} chatRecord={hub.coach?.stage === "operating" ? chatRecordFrom(plan.answers as Record<string, Record<string, unknown>>) : null} />}
          {view==="operations" && <NextServices key={`services-${plan.id}`} plan={plan} homepagePublished={homepage.status === "published"} hasHomepage={homepage.status === "draft" || homepage.status === "published"} />}
          {view==="summary" && expert && hub.coach && <ExpertEditor key={plan.id} plan={plan} onSaved={setPlan} onDirtyChange={setExpertDirty} />}
          {view==="summary" && (!expert || !hub.coach) && <WorkspaceSummary headingRef={heading} description={design?.startingPlan.scope || hub.coach?.business.description || "기존에 작성한 사업계획서를 이어서 확인할 수 있어요."} stale={hub.stale} fields={hub.coach?.fields}>
            {hub.coach ? <><Link className={styles.primary} href={chat}>{hub.coach.ready ? "대화로 수정하기" : "이어서 이야기하기"}</Link>{design && <details><summary>이렇게 제안한 이유</summary><p>{design.startingPlan.whyThis}</p><p>{design.startingPlan.connectionToVision}</p></details>}</> : <button className={styles.primary} onClick={openLegacy}>기존 사업계획서 이어보기</button>}
          </WorkspaceSummary>}
          {view==="documents" && <>
            <h2 ref={heading} tabIndex={-1}>내 사업 자료</h2>
            {hub.documents.length ? <>
              <WorkspaceDocumentStatus businessId={plan.id} complete={hub.complete} count={hub.documents.length} total={hub.keys.length} stale={hub.stale} onOpen={openDocument} />
            </> : <><p>사업안을 확인한 뒤 계획서를 만들 수 있어요. 지금까지 나눈 대화를 그대로 써요.</p>{hub.coach ? <Link className={styles.primary} href={chat}>사업안 확인하고 자료 만들기</Link> : <button className={styles.primary} onClick={openLegacy}>기존 작업 이어가기</button>}</>}
            {hub.coach && !!hub.documents.length && <Link className={styles.secondary} href={chat}>{hub.stale ? "수정 내용 반영하러 가기" : "자료를 더 다듬기"}</Link>}
            {/* 다음 단계는 계획서 화면과 같은 답 하나 — 홈페이지 만들기 → 다듬고 공개하기 → 유지보수 */}
            {hub.complete && !hub.stale && (() => {
              const next = journeyNext(plan, homepage.status);
              /* 같은 화면의 다른 탭(사업 시작하기·유지보수)이면 주소 이동 대신 탭을 바꾼다 — 링크로는 주소만 바뀌고 화면은 그대로였다 */
              const sameTab = (href: string): View | null => embedded ? null : href.includes(`planId=${encodeURIComponent(plan.id)}`) && href.startsWith("/plan/workspace") ? href.includes("tab=launch") ? "launch" : href.includes("tab=operations") ? "operations" : null : null;
              const go = (href: string, label: string, className: string) => { const target = sameTab(href); return target ? <button type="button" className={className} onClick={() => void tab(target)}>{label}</button> : <Link className={className} href={href} onClick={() => setActivePlan(plan.id)}>{label}</Link>; };
              return <div className={styles.nextStep}><span>다음 단계</span><h3>{next.title}</h3><p>{next.note}</p>{go(next.href, next.title, styles.secondary)}{next.secondary && go(next.secondary.href, `${next.secondary.title} →`, styles.textButton)}</div>;
            })()}
          </>}
          {/* '기간별 실적과 개선 리포트 보기'는 위 '유지보수' 탭과 같은 곳이라 뺐다 — 예전엔 두 링크가 띄어쓰기 없이 한 줄로 붙어 보였다(대표 요청 2026-10-15) */}
          {view==="launch" && <>{action && <p className={styles.tabLink}><button className={styles.textButton} onClick={()=>tab("action")}>대화에서 정한 할 일 보기</button></p>}<LaunchWorkspace key={plan.id} plan={plan} onSaved={setPlan} /></>}
          {view==="action" && <>
            <h2 ref={heading} tabIndex={-1}>{done==="done" ? "하나를 마쳤어요" : done==="skipped" ? "이 일은 나중에 해요" : "지금은 이것 하나만"}</h2>
            <p className={styles.muted}>실행은 선택 사항이에요. 하지 않아도 사업안과 자료는 그대로 남아요.</p>
            {action ? <><h3>{action.action}</h3>{done==="pending" ? <><p>{action.doneWhen}</p>{action.usableText && <details><summary>바로 쓸 내용 보기</summary><blockquote>{action.usableText}</blockquote></details>}<div className={styles.actions}><button className={styles.primary} disabled={saving} onClick={()=>void mark("done")}>완료했어요</button><button className={styles.secondary} disabled={saving} onClick={()=>void mark("skipped")}>지금은 건너뛰기</button></div><Link className={styles.textButton} href={businessChatHref(plan.id,`현재 할 일 ‘${action.action}’이 어려워요. 더 쉬운 행동 하나로 바꿔 주세요.`)}>더 쉬운 방법 물어보기</Link></> : <><Link className={styles.primary} href={businessChatHref(plan.id,`‘${action.action}’을 ${done==="done" ? "완료했어요" : "지금은 건너뛰고 싶어요"}. 현재 사업안에 맞게 다음 할 일 하나를 제안해 주세요.`)}>다음 할 일 정하기</Link><button className={styles.textButton} disabled={saving} onClick={()=>void mark("pending")}>이전 할 일 다시 보기</button></>}</> : hub.coach ? <><p>아직 정해진 할 일이 없어요. 사업을 조금 더 이야기한 뒤 필요한 행동 하나를 정해볼까요?</p><Link className={styles.primary} href={businessChatHref(plan.id,"현재 사업에서 가장 먼저 할 수 있는 일 하나만 정해 주세요.")}>대화로 정하기</Link></> : <><p>기존 방식으로 작성한 사업이에요. 저장된 계획서의 실행 내용을 확인할 수 있어요.</p><button className={styles.primary} onClick={openLegacy}>기존 작업 이어가기</button></>}
            {notice && <p role="status" className={styles.muted}>{notice}</p>}
          </>}
        </section>
      </>}
    </div></div>}
  </BusinessAppChrome></Root>;
}
