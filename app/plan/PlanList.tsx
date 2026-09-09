"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { hydrateFromServer, setActivePlan, deletePlan, renamePlan, loadState, isSamplePlan, type PlanState } from "../../lib/plan-builder/plan-store";
import { businessHubState, workspaceHref } from "../../lib/plan-builder/business-hub";
import BusinessAppChrome from "./BusinessAppChrome";
import frame from "./chat/page.module.css";
import styles from "./BusinessHub.module.css";

export default function PlanList() {
  const router = useRouter();
  const [state, setState] = useState<PlanState | null>(null);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const refresh = () => { void hydrateFromServer().then(s => { if (alive) setState(s); }); };
    refresh();
    const visible = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", visible);
    return () => { alive = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); };
  }, []);
  const plans = state?.plans.filter(p => !isSamplePlan(p.id)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) ?? [];
  const samples = state?.plans.filter(p => isSamplePlan(p.id)) ?? [];
  const filtered = plans.filter(p => { const status=businessHubState(p); const current=status.complete && !status.stale; return filter === "all" || (filter === "complete" ? current : !current); });
  function rename(id: string) {
    if (!name.trim()) { setError("사업 이름을 입력해 주세요."); return; }
    renamePlan(id, name.trim()); setState(loadState()); setEditing(null); setError("");
  }
  function remove(id: string, title: string) {
    if (!window.confirm(`‘${title}’ 사업을 삭제할까요? 대화와 작성한 자료도 함께 삭제됩니다.`)) return;
    deletePlan(id); setState(loadState());
  }
  function sample(id: string) { setActivePlan(id); router.push("/plan/document"); }
  return <main className={frame.page}><BusinessAppChrome title="내 사업" backHref="/">
    <div className={styles.scroll}><div className={styles.content}>
      {!state ? <p role="status" className={styles.muted}>내 사업을 불러오고 있어요.</p> : <>
        {plans.length === 0 ? <section className={styles.empty}>
          <img src="/support-agent-avatar-2026.png" alt="" width="72" height="72" />
          <h1>어떤 사업을<br />함께 만들어볼까요?</h1>
          <p>아이디어가 없어도, 이미 운영 중이어도 좋아요.<br />이야기하면서 내 사업을 정리해 봐요.</p>
          <Link className={styles.primary} href="/plan/chat?new=1">사업 이야기 시작하기</Link>
        </section> : <>
          <div className={styles.heading}><div><span className={styles.eyebrow}>이어서 시작해요</span><h1>내 사업</h1></div><Link className={styles.secondary} href="/plan/chat?new=1">새 대화</Link></div>
          <nav className={styles.filters} aria-label="사업 필터">{[["all","전체"],["progress","진행 중"],["complete","문서 완성"]].map(([id,label]) => <button key={id} aria-pressed={filter===id} onClick={() => setFilter(id)}>{label}</button>)}</nav>
          <div className={styles.businessList}>
            {filtered.map(p => { const status=businessHubState(p); return <article key={p.id} className={styles.businessRow}>
              <div className={styles.rowTop}><span className={styles.status}>{status.status}</span><details className={styles.rowMenu}><summary aria-label={`${p.title} 관리`}><MoreHorizontal size={22} /></summary><div><button onClick={() => {setEditing(p.id);setName(p.title);}}>이름 변경</button><button onClick={() => remove(p.id,p.title)}>삭제</button></div></details></div>
              {editing===p.id ? <form className={styles.rename} onSubmit={e=>{e.preventDefault();rename(p.id);}}><input aria-label="사업 이름" value={name} maxLength={100} autoFocus onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Escape")setEditing(null);}} /><button className={styles.secondary}>저장</button><button type="button" onClick={()=>{setEditing(null);setError("");}}>취소</button></form> : <Link className={styles.businessOpen} href={workspaceHref(p.id)}><h2>{p.title}</h2><p>{status.coach?.business.description || p.planType}</p><span className={styles.rowBottom}><small>{new Date(p.updatedAt).toLocaleDateString("ko-KR")} 수정</small><span>사업 열기<ChevronRight size={18}/></span></span></Link>}
            </article>; })}
            {!filtered.length && <p className={styles.muted}>이 상태의 사업은 아직 없어요.</p>}
          </div>
        </>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {!!samples.length && <details className={styles.samples}><summary>완성 예시 보기</summary><p className={styles.muted}>예시 자료예요. 내 사업과는 별도로 볼 수 있어요.</p>{samples.map(p=><button className={styles.sampleRow} key={p.id} onClick={()=>sample(p.id)}><span>{p.title.replace(/^샘플 · /,"")}</span><ChevronRight size={18}/></button>)}</details>}
      </>}
    </div></div>
  </BusinessAppChrome></main>;
}
