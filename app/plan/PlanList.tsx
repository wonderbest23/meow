"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { currentBusinessDesign } from "../../lib/plan-builder/coach";
import { hydrateFromServer, lastHydrationFailed, setActivePlan, deletePlan, renamePlan, loadState, isSamplePlan, type PlanState } from "../../lib/plan-builder/plan-store";
import { businessHubState, businessEntryHref } from "../../lib/plan-builder/business-hub";
import { STUDIO_REDIRECT, studioEntryHref } from "../../lib/plan-builder/studio";

/* 작업실을 켰으면 같은 자리(대화·계획서·사업 관리)를 작업실 탭으로 연다 — 작업실 탭이 없는 화면이면 예전 주소 그대로 */
/* 작업실이 켜져 있으면 바로 작업실로 — 예전 화면을 거쳐 다시 보내지 않게(새 대화 화면이 꺼져 있으면 작업실이 열리지 않아 예전 화면) */
const openHref = (plan: Parameters<typeof businessEntryHref>[0]) => { const href = businessEntryHref(plan); return (STUDIO_REDIRECT && studioEntryHref(href)) || href; };
import { LISTED_SAMPLE_IDS } from "../../lib/plan-builder/samples";
import BusinessAppChrome from "./BusinessAppChrome";
import BusinessEmptyState from "./BusinessEmptyState";
import { loadAuthSession } from "../../lib/client/auth-session";
import PlanLoading from "./PlanLoading";
import frame from "./chat/page.module.css";
import styles from "./BusinessHub.module.css";
import mine from "./MyBusinessList.module.css";
import { askConfirm } from "../../components/confirm-dialog";

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
  /* 삭제처럼 화면에서 사라지는 일을 짧게 알린다(role=status) */
  const [notice, setNotice] = useState("");
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    const failed = "최신 목록을 확인하지 못했어요. 이 기기에 저장된 내용을 보여 드려요.";
    // hydrateFromServer 는 실패해도 기기 저장본을 돌려준다 — 실패 여부는 따로 확인한다
    const refresh = () => { void hydrateFromServer().then(s => { if (alive) { setState(s); setError(lastHydrationFailed() ? failed : ""); } }).catch(() => { if (alive) { setState(loadState()); setError(failed); } }); };
    retry.current = refresh;
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
  /* 이름 바꾸기·삭제 창을 닫으면 그 사업의 '관리' 단추로 초점을 돌려준다 — 예전엔 문서 맨 앞(body)으로 떨어졌다 */
  function focusMenu(id: string) {
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-plan-menu="${CSS.escape(id)}"]`)?.focus());
  }
  function cancelRename(id: string) { setEditing(null); setError(""); focusMenu(id); }
  function rename(id: string) {
    if (!name.trim()) { setError("사업 이름을 입력해 주세요."); return; }
    renamePlan(id, name.trim()); setState(loadState()); setEditing(null); setError(""); focusMenu(id);
  }
  async function remove(id: string, title: string) {
    if (!await askConfirm({ title: `‘${title}’ 사업을 삭제할까요?`, message: "대화·사업계획서와 이 사업의 홈페이지(공개 중인 사이트·받은 문의 포함)도 함께 삭제되고 되돌릴 수 없어요.", confirmLabel: "삭제", danger: true })) { focusMenu(id); return; }
    /* 지운 뒤 초점은 다음 사업 카드로(없으면 앞 카드, 하나도 없으면 '시작하기') — 예전엔 초점이 문서 맨 앞으로 떨어졌다 */
    const order = plans.map(plan => plan.id);
    const at = order.indexOf(id);
    const next = order[at + 1] ?? order[at - 1] ?? null;
    deletePlan(id); setState(loadState()); setNotice("삭제했어요");
    window.requestAnimationFrame(() => {
      const target = next ? document.querySelector<HTMLElement>(`[data-plan-open="${CSS.escape(next)}"]`) : document.querySelector<HTMLElement>('[data-business-empty] a[href="/plan/chat?new=1"]');
      target?.focus();
    });
  }
  function sample(id: string) { setActivePlan(id); router.push(`/plan/document?planId=${encodeURIComponent(id)}`); }
  return <main className={frame.page} data-plan-view="plans"><BusinessAppChrome title="내 사업" active="plans" backHref="/">
    {!state ? <PlanLoading fill variant="compact" note="내 사업을 불러오고 있어요" onRetry={() => retry.current()} /> : <div className={styles.scroll}><div className={styles.content}>
        <p role="status" className={mine.status} data-empty={notice ? undefined : ""}>{notice}</p>
        {plans.length === 0 && error ? <div role="alert" className={styles.error}><p>사업 목록을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.</p><button type="button" className={styles.primary} onClick={() => { setError(""); setState(null); retry.current(); }}>다시 시도</button></div> : plans.length === 0 ? <BusinessEmptyState kind={signedIn === false ? "loggedOut" : "plans"} /> : <>
          {/*
            목록만 보여 준다(대표 요청 2026-10-14: '내 사업인데 새 대화 단추가 왜 있나', 꾸밈이 AI 같고 복잡하다).
            예전에 있던 것 — 머리말과 겹치던 '내 사업' 제목·한 줄 소개, 새 대화 단추(메뉴에 있음), 상태 필터 4개, 가짜 문서 그림.
          */}
          <div className={mine.list}>
            {plans.map(p => { const status=businessHubState(p); const introduction = (status.coach && currentBusinessDesign(status.coach)?.startingPlan.scope) || status.coach?.business.description || ""; return <article key={p.id} className={mine.row}>
              {editing===p.id ? <form className={`${styles.rename} ${mine.rename}`} onSubmit={e=>{e.preventDefault();rename(p.id);}}><input aria-label="사업 이름" aria-describedby={`rename-hint-${p.id}`} value={name} maxLength={100} autoFocus onFocus={e=>e.currentTarget.select()} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Escape")cancelRename(p.id);}} /><button className={styles.primary}>저장</button><button type="button" onClick={()=>cancelRename(p.id)}>취소</button>
                {/* 열면 기존 이름을 골라 둔다(바로 새로 쓰게). 100자에 닿으면 더 써지지 않는 이유를 알린다. 홈페이지 이름은 따로 바뀐다 */}
                <p id={`rename-hint-${p.id}`} className={mine.renameHint} aria-live="polite">{name.length >= 100 ? "이름은 100자까지 쓸 수 있어요. " : ""}홈페이지 이름은 홈페이지 화면에서 따로 바꿔요.</p></form> : <Link className={mine.open} href={openHref(p)} data-plan-open={p.id} aria-label={`${p.title} ${status.complete ? "사업계획서 보기" : status.coach || status.job ? "대화 이어가기" : "내 사업 화면 열기"}`}>
                <strong className={mine.title}>{p.title}</strong>
                {/* 소개가 사업 이름과 같으면(첫 답을 그대로 이름으로 쓴 사업) 같은 줄을 두 번 보이지 않는다 */}
                {introduction && introduction.trim() !== p.title.trim() && <span className={mine.desc}>{introduction}</span>}
                <span className={mine.meta}><span className={mine.stage}>{status.status}</span><time dateTime={p.updatedAt}>{new Date(p.updatedAt).toLocaleDateString("ko-KR")} 수정</time></span>
              </Link>}
              {editing!==p.id && <details className={`${styles.rowMenu} ${mine.menu}`} onClick={event => { if ((event.target as Element).closest("div button")) (event.currentTarget as HTMLDetailsElement).open = false; }} onKeyDown={event => {
                /* Esc로 닫고 ⋯ 단추로 초점을 돌려준다(접근성 점검 2026-10-22) */
                const menu = event.currentTarget as HTMLDetailsElement;
                if (event.key !== "Escape" || !menu.open) return;
                event.preventDefault(); menu.open = false; menu.querySelector("summary")?.focus();
              }}><summary aria-label={`${p.title} 관리`} data-plan-menu={p.id}><MoreHorizontal size={20} /></summary><div><button onClick={() => {setEditing(p.id);setName(p.title);setNotice("");}}>이름 변경</button><button onClick={() => remove(p.id,p.title)}>삭제</button></div></details>}
            </article>; })}
          </div>
        </>}
        {error && plans.length > 0 && <p role="alert" className={styles.error}>{error} <button type="button" className={styles.inlineRetry} onClick={() => retry.current()}>다시 시도</button></p>}
        {!!samples.length && <details className={styles.samples}><summary>완성 예시 보기</summary><p className={styles.muted}>예시 자료예요. 내 사업과는 별도로 볼 수 있어요.</p>{samples.map(p=><button className={styles.sampleRow} key={p.id} onClick={()=>sample(p.id)}><span>{p.title.replace(/^샘플 · /,"")}</span><ChevronRight size={18}/></button>)}</details>}
    </div></div>}
  </BusinessAppChrome></main>;
}
