"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { currentBusinessDesign } from "../../lib/plan-builder/coach";
import { hydrateFromServer, lastHydrationFailed, setActivePlan, deletePlan, renamePlan, loadState, isSamplePlan, type PlanState } from "../../lib/plan-builder/plan-store";
import { businessHubState, businessEntryHref } from "../../lib/plan-builder/business-hub";
import { LISTED_SAMPLE_IDS } from "../../lib/plan-builder/samples";
import BusinessAppChrome from "./BusinessAppChrome";
import BusinessEmptyState from "./BusinessEmptyState";
import { loadAuthSession } from "../../lib/client/auth-session";
import PlanLoading from "./PlanLoading";
import frame from "./chat/page.module.css";
import styles from "./BusinessHub.module.css";
import mine from "./MyBusinessList.module.css";

/*
 * 내 사업 목록 하나. 예전엔 '사업 기획'(/plan/planning, 대화로 만든 사업만)과 '내 사업'(/plan, 전체)이
 * 같은 목록을 필터 이름만 바꿔 두 번 보여 줬다 — 사업은 새 대화로만 만들어져 두 목록이 사실상 같았다. 하나로 합쳤다.
 */

export default function PlanList() {
  const router = useRouter();
  const [state, setState] = useState<PlanState | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const failed = "최신 목록을 확인하지 못했어요. 기기에 저장된 내용을 표시합니다.";
    // hydrateFromServer 는 실패해도 기기 저장본을 돌려준다 — 실패 여부는 따로 확인한다
    const refresh = () => { void hydrateFromServer().then(s => { if (alive) { setState(s); setError(lastHydrationFailed() ? failed : ""); } }).catch(() => { if (alive) { setState(loadState()); setError(failed); } }); };
    refresh();
    const visible = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", visible);
    return () => { alive = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); };
  }, []);
  // 로그인 여부 — 확인하지 못했으면(null) 예전처럼 둔다
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => { let alive = true; loadAuthSession().then(d => { if (alive) setSignedIn(!!d.authenticated); }).catch(() => {}); return () => { alive = false; }; }, []);
  const allPlans = state?.plans.filter(p => !isSamplePlan(p.id)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) ?? [];
  const plans = allPlans;
  const samples = state?.plans.filter(p => isSamplePlan(p.id) && LISTED_SAMPLE_IDS.has(p.id)) ?? [];
  function rename(id: string) {
    if (!name.trim()) { setError("사업 이름을 입력해 주세요."); return; }
    renamePlan(id, name.trim()); setState(loadState()); setEditing(null); setError("");
  }
  function remove(id: string, title: string) {
    if (!window.confirm(`‘${title}’ 사업을 삭제할까요? 대화·사업계획서와 이 사업의 홈페이지(공개 중인 사이트·받은 문의 포함)도 함께 삭제되고 되돌릴 수 없어요.`)) return;
    deletePlan(id); setState(loadState());
  }
  function sample(id: string) { setActivePlan(id); router.push(`/plan/document?planId=${encodeURIComponent(id)}`); }
  return <main className={frame.page} data-plan-view="plans"><BusinessAppChrome title="내 사업" active="plans" backHref="/">
    {!state ? <PlanLoading fill variant="compact" note="내 사업을 불러오고 있어요" /> : <div className={styles.scroll}><div className={styles.content}>
        {plans.length === 0 && error ? <p role="alert" className={styles.error}>사업 목록을 불러오지 못했어요. 연결을 확인하고 새로고침해 주세요.</p> : plans.length === 0 ? <BusinessEmptyState kind={signedIn === false ? "loggedOut" : "plans"} /> : <>
          {/*
            목록만 보여 준다(대표 요청 2026-10-14: '내 사업인데 새 대화 단추가 왜 있나', 꾸밈이 AI 같고 복잡하다).
            예전에 있던 것 — 머리말과 겹치던 '내 사업' 제목·한 줄 소개, 새 대화 단추(메뉴에 있음), 상태 필터 4개, 가짜 문서 그림.
          */}
          <div className={mine.list}>
            {plans.map(p => { const status=businessHubState(p); const introduction = (status.coach && currentBusinessDesign(status.coach)?.startingPlan.scope) || status.coach?.business.description || ""; return <article key={p.id} className={mine.row}>
              {editing===p.id ? <form className={`${styles.rename} ${mine.rename}`} onSubmit={e=>{e.preventDefault();rename(p.id);}}><input aria-label="사업 이름" value={name} maxLength={100} autoFocus onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Escape")setEditing(null);}} /><button className={styles.secondary}>저장</button><button type="button" onClick={()=>{setEditing(null);setError("");}}>취소</button></form> : <Link className={mine.open} href={businessEntryHref(p)} aria-label={`${p.title} ${status.complete ? "사업계획서 보기" : status.coach || status.job ? "대화 이어가기" : "기존 사업 관리로 이동"}`}>
                <strong className={mine.title}>{p.title}</strong>
                {introduction && <span className={mine.desc}>{introduction}</span>}
                <span className={mine.meta}><span className={mine.stage}>{status.status}</span><time dateTime={p.updatedAt}>{new Date(p.updatedAt).toLocaleDateString("ko-KR")} 수정</time></span>
              </Link>}
              {editing!==p.id && <details className={`${styles.rowMenu} ${mine.menu}`} onClick={event => { if ((event.target as Element).closest("div button")) (event.currentTarget as HTMLDetailsElement).open = false; }}><summary aria-label={`${p.title} 관리`}><MoreHorizontal size={20} /></summary><div><button onClick={() => {setEditing(p.id);setName(p.title);}}>이름 변경</button><button onClick={() => remove(p.id,p.title)}>삭제</button></div></details>}
            </article>; })}
          </div>
        </>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {!!samples.length && <details className={styles.samples}><summary>완성 예시 보기</summary><p className={styles.muted}>예시 자료예요. 내 사업과는 별도로 볼 수 있어요.</p>{samples.map(p=><button className={styles.sampleRow} key={p.id} onClick={()=>sample(p.id)}><span>{p.title.replace(/^샘플 · /,"")}</span><ChevronRight size={18}/></button>)}</details>}
    </div></div>}
  </BusinessAppChrome></main>;
}
