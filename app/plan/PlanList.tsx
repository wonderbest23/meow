"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChevronRight, ArrowUp, MoreHorizontal, Plus, Search } from "lucide-react";
import { hydrateFromServer, lastHydrationFailed, setActivePlan, deletePlan, renamePlan, loadState, isSamplePlan, readAuthFlag, type Plan, type PlanState } from "../../lib/plan-builder/plan-store";
import { businessHubState, planOpenHref } from "../../lib/plan-builder/business-hub";
import { isUnnamedBusiness, planDisplayName } from "../../lib/plan-builder/business-name";
import { clearLandingDraft, normalizeLandingIdea, readLandingDraft, readLandingIdea, saveLandingDraft, stashLandingIdea, LANDING_IDEA_MAX } from "../../lib/plan-builder/landing-idea";
import { navigateWithTransition } from "../../lib/client/view-transition";
import { DEPTH_PARAM, newChatEntryHref, newChatHref, STUDIO_REDIRECT, studioEntryHref } from "../../lib/plan-builder/studio";

/* 작업실을 켰으면 같은 자리(대화·계획서·사업 관리)를 작업실 탭으로 연다 — 작업실 탭이 없는 화면이면 예전 주소 그대로 */
/* 작업실이 켜져 있으면 바로 작업실로 — 예전 화면을 거쳐 다시 보내지 않게(새 대화 화면이 꺼져 있으면 작업실이 열리지 않아 예전 화면) */
const openHref = planOpenHref;
import { openLogin } from "../../components/login-dialog";
import { GUEST_NEXT_KEY } from "./studio/StudioContext";
import { LISTED_SAMPLE_IDS } from "../../lib/plan-builder/samples";
import BusinessAppChrome from "./BusinessAppChrome";
import BusinessEmptyState from "./BusinessEmptyState";
import PlanLoading from "./PlanLoading";
import frame from "./chat/page.module.css";
import styles from "./BusinessHub.module.css";
import mine from "./MyBusinessList.module.css";
import home from "./PlanHome.module.css";
import { StatusBadge } from "../../components/status-badge";
import { askConfirm } from "../../components/confirm-dialog";
import { useHomepageStatus } from "./use-homepage";
import { readOperatingState } from "../../lib/plan-builder/operating-records";
import { AppButton } from "../../components/app-button";
import { TextArea, TextField } from "../../components/app-field";
import { loadAuthSession } from "../../lib/client/auth-session";
import { PLAN_VIEW_ALL } from "./MobileTabBar";

/*
 * 로그인 뒤 첫 화면(/plan) — 시안 Main.dc.html(PC 1440) · MHome.dc.html(휴대폰 390).
 * 인사말 → 큰 입력칸(보내면 새 대화 — 첫 화면 입력칸과 같은 길: newChatHref + idea 보관)
 * → 아래 목록 카드(검색 · 내 사업 · 최근 본 항목 · 예시) + 사업 카드(316px). 휴대폰 첫 화면은 인사말·입력칸만(목록은 아래 탭 '내 사업') — lovable 휴대폰 홈과 같다(2026-11-02).
 * ?view=all 이면 입력칸 없이 사업 카드만(왼쪽 메뉴·아래 탭의 '내 사업').
 * 로그인해야 열린다 — 아니면 로그인 화면으로(2026-11-02 사장님: 로그인 없이 들어와졌다). 목록의 데이터·상태(불러오기 실패·빈 화면·이름 변경·삭제 안내)는 예전 그대로.
 */
type Filter = "search" | "mine" | "recent" | "samples";
/* 검색 알약은 뺐다(2026-11-15 사장님) — 사업이 몇 개뿐이라 찾을 일이 없다 */
/* 최근 본 항목 알약은 뺐다(2026-11-15 사장님) — 내 사업과 같은 목록을 순서만 바꿔 보여 줬다 */
const FILTERS: Array<[Filter, string]> = [["mine", "내 사업"], ["samples", "예시"]];
const EXAMPLE_IDEA = "성수동에 작은 쿠키 공방을 열고 싶어요";

/** 결제한 사업을 지울 때 삭제 확인 문구 앞에 붙는 경고 */
const PAID_DELETE_WARNING = "결제한 문서예요. 지우면 다시 받을 수 없어요. ";

/** 이 사업을 따로 결제했는지 — 결제 확인(/api/plan/access)을 3초까지만 기다리고, 모르면 false */
async function paidPlan(plan: Plan): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`/api/plan/access?${new URLSearchParams({ planId: plan.id, planType: plan.planType }).toString()}`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return false;
    const access = await response.json() as { paid?: boolean; allAccess?: boolean };
    return !!access.paid && !access.allAccess;
  } catch { return false; }
  finally { window.clearTimeout(timer); }
}

/** 수정됨 n일 전 — 30일이 넘으면 날짜 */
function editedAgo(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(at)) / 86_400_000);
  if (days <= 0) return "수정됨 오늘";
  if (days === 1) return "수정됨 어제";
  if (days < 30) return `수정됨 ${days}일 전`;
  return `수정됨 ${at.toLocaleDateString("ko-KR")}`;
}

/* 주소의 view · search 를 따라간다 — useSearchParams 는 정적 빌드에서 Suspense 가 필요해 이 조각만 감싼다 */
function ParamsWatcher({ onChange }: { onChange: (view: string | null, search: boolean) => void }) {
  const params = useSearchParams();
  const view = params.get("view"), search = params.get("search") === "1";
  useEffect(() => { onChange(view, search); }, [view, search, onChange]);
  return null;
}

/* 열린 ⋯ 메뉴를 닫는다 — except 하나만 남긴다. 바깥 누름은 문서에서 한 번 듣는다 */
function closeOtherRowMenus(except?: Element | null) {
  document.querySelectorAll<HTMLDetailsElement>("details[open][class*=rowMenu]").forEach(menu => { if (menu !== except) menu.open = false; });
}
if (typeof document !== "undefined") document.addEventListener("pointerdown", event => { closeOtherRowMenus((event.target as Element).closest("details[class*=rowMenu]")); });

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
    /* 이 기기에 저장된 목록이 있으면 먼저 보여 주고 서버 것으로 바꾼다 — 들어올 때마다 '내 사업을 불러오고 있어요'를 기다렸다. 비어 있으면 서버 답을 기다린다(다른 기기에서 만든 사업을 '없음'으로 보이지 않게) */
    const cached = loadState();
    if (readAuthFlag() && cached.plans.some(p => !isSamplePlan(p.id))) setState(cached);
    refresh();
    const visible = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", visible);
    return () => { alive = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); };
  }, []);
  // 로그인 여부 — 모르면(null) 로딩, 아니면(false) 로그인 화면으로. 확인에 실패하면 로딩이 '늦어지고 있어요'로 바뀌고 다시 시도가 새로 불러온다
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => { let alive = true; if (readAuthFlag()) setSignedIn(true); /* 직전에 로그인돼 있던 기기는 확인을 기다리지 않고 화면부터 그린다 — 풀렸으면 아래 확인이 로그인 화면으로 보낸다 */ loadAuthSession().then(d => { if (alive) setSignedIn(!!d.authenticated); }).catch(() => {}); return () => { alive = false; }; }, []);
  // 로그인 전에도 대화 입력 화면을 먼저 보여 준다(대표 결정 2026-11-14) — 예시 작업실로 바로 보내던 것을 바꿨다. 예시 두 개는 입력칸 아래 샘플 링크로, 보내면 로그인을 거쳐 그 문장으로 대화가 시작된다
  useEffect(() => { if (signedIn !== false) return; try { sessionStorage.setItem(GUEST_NEXT_KEY, "/plan"); } catch { /* 못 적으면 새 대화로 */ } }, [signedIn]);
  const allPlans = state?.plans.filter(p => !isSamplePlan(p.id)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) ?? [];
  const plans = allPlans;
  const samples = state?.plans.filter(p => isSamplePlan(p.id) && LISTED_SAMPLE_IDS.has(p.id)) ?? [];

  /* 보기 — 첫 화면 / 사업 카드만(view=all), 목록 거르기 */
  const [view, setView] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("mine");
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  /* 검색칸에 초점을 옮겨 달라는 요청 — 칸이 그려진 뒤(effect)에 옮긴다 */
  const [searchFocus, setSearchFocus] = useState(0);
  useEffect(() => { if (searchFocus) searchInput.current?.focus(); }, [searchFocus]);
  const toggleSearch = () => { if (filter === "search") { setFilter("mine"); setQuery(""); } else { setFilter("search"); setSearchFocus(n => n + 1); } };
  const onParams = useMemo(() => (nextView: string | null, search: boolean) => {
    setView(nextView);
  }, []);
  const listOnly = view === PLAN_VIEW_ALL;
  const recent = useMemo(() => {
    const active = plans.find(plan => plan.id === state?.activePlanId);
    return (active ? [active, ...plans.filter(plan => plan.id !== active.id)] : plans).slice(0, 4);
  }, [plans, state?.activePlanId]);
  const needle = query.trim().toLowerCase();
  const shown = filter === "recent" ? recent : filter === "search" && needle ? plans.filter(plan => planDisplayName(plan).toLowerCase().includes(needle)) : plans;

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
    /* 이 사업만 따로 결제했으면 지우기 전에 한 번 더 알린다(전체 이용권은 다른 사업에도 남으니 빼고) — 확인을 못 하면 평소 문구 */
    const plan = plans.find(item => item.id === id);
    const paid = plan ? await paidPlan(plan) : false;
    if (!await askConfirm({ title: `‘${title}’ 사업을 삭제할까요?`, message: `${paid ? PAID_DELETE_WARNING : ""}대화·사업계획서와 이 사업의 홈페이지(공개 중인 사이트·받은 문의 포함)도 함께 삭제되고 되돌릴 수 없어요.`, confirmLabel: "삭제", danger: true })) { focusMenu(id); return; }
    /* 지운 뒤 초점은 다음 사업 카드로(없으면 앞 카드, 하나도 없으면 '시작하기') — 예전엔 초점이 문서 맨 앞으로 떨어졌다 */
    const order = shown.map(plan => plan.id);
    const at = order.indexOf(id);
    const next = order[at + 1] ?? order[at - 1] ?? null;
    deletePlan(id); setState(loadState()); setNotice("삭제했어요");
    window.requestAnimationFrame(() => {
      const target = next ? document.querySelector<HTMLElement>(`[data-plan-open="${CSS.escape(next)}"]`) : document.querySelector<HTMLElement>('[data-business-empty] a[href="/plan/chat?new=1"]');
      target?.focus();
    });
  }
  function sample(id: string) { setActivePlan(id); router.push(`/plan/document?planId=${encodeURIComponent(id)}`); }

  /* 로그인 확인 전 — 같은 틀 안에 로딩만(화면이 바뀌며 흔들리지 않게) */
  if (signedIn === null) return <main className={frame.page} data-plan-view="plans"><BusinessAppChrome title="내 사업" active="new" backHref="/" home>
    <PlanLoading fill variant="compact" note="화면을 불러오고 있어요" />
  </BusinessAppChrome></main>;
  const guest = signedIn === false;
  /* 로그인 전에 쓰던 사업 중 가장 최근 것(예시 제외) — 첫 화면에서 '이어서 하기'로 연다 */
  const resume = guest ? allPlans[0] ?? null : null;

  const card = (p: Plan) => { const status=businessHubState(p); const display = planDisplayName(p); return <article key={p.id} className={`${mine.row} ${home.card}`}>
    {/* 썸네일 16:9 r8 — 문서 모양 자리 + 왼쪽 아래 상태 배지. 소개 글은 쓰지 않는다 — 글이 많아 번잡했고 제목·상태면 충분하다(2026-11-02 사장님) */}
    <Link className={mine.open} href={openHref(p)} data-plan-open={p.id} aria-label={`${display} ${status.complete ? "사업계획서 보기" : status.coach || status.job ? "대화 이어가기" : "내 사업 화면 열기"}`}>
      <span className={home.thumb}>
        <StageArt plan={p} status={status} />
      </span>
      <span className={home.meta}>
        <span className={home.avatar} aria-hidden="true">{display.trim().charAt(0) || "사"}</span>
        <span className={home.metaText}>
          <strong className={mine.title}>{planDisplayName(p)}</strong>
          <span className={mine.meta}><time dateTime={p.updatedAt}>{editedAgo(p.updatedAt)}</time><StageBadge plan={p} status={status} className={home.metaStage} /></span>
        </span>
      </span>
    </Link>
    {editing===p.id && <form className={`${styles.rename} ${mine.rename}`} onSubmit={e=>{e.preventDefault();rename(p.id);}}><TextField aria-label="사업 이름" aria-describedby={`rename-hint-${p.id}`} value={name} maxLength={100} autoFocus onFocus={e=>e.currentTarget.select()} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Escape")cancelRename(p.id);}} /><AppButton type="submit" variant="primary" className={styles.primary}>저장</AppButton><AppButton variant="text" onClick={()=>cancelRename(p.id)}>취소</AppButton>
      {/* 열면 기존 이름을 골라 둔다(바로 새로 쓰게). 100자에 닿으면 더 써지지 않는 이유를 알린다. 홈페이지 이름은 따로 바뀐다 */}
      <p id={`rename-hint-${p.id}`} className={mine.renameHint} aria-live="polite">{name.length >= 100 ? "이름은 100자까지 쓸 수 있어요. " : ""}홈페이지 이름은 홈페이지 화면에서 따로 바꿔요.</p></form>}
    {/* 한 번에 하나만 — 다른 행 ⋯을 누르거나 바깥을 누르면 열린 메뉴를 닫는다(네 개가 같이 열렸다, 2026-11-05 사장님) */}
    {editing!==p.id && <details className={`${styles.rowMenu} ${mine.menu}`} onToggle={event => { if (event.currentTarget.open) closeOtherRowMenus(event.currentTarget); }} onClick={event => { if ((event.target as Element).closest("div button")) (event.currentTarget as HTMLDetailsElement).open = false; }} onKeyDown={event => {
      /* Esc로 닫고 ⋯ 단추로 초점을 돌려준다(접근성 점검 2026-10-22) */
      const menu = event.currentTarget as HTMLDetailsElement;
      if (event.key !== "Escape" || !menu.open) return;
      event.preventDefault(); menu.open = false; menu.querySelector("summary")?.focus();
    }}><summary aria-label={`${display} 관리`} data-plan-menu={p.id}><MoreHorizontal size={20} /></summary><div><button onClick={() => {setEditing(p.id);setName(isUnnamedBusiness(p.title) ? "" : p.title);setNotice("");}}>이름 변경</button><button onClick={() => remove(p.id,display)}>삭제</button></div></details>}
  </article>; };

  /* 목록 로딩은 목록 카드 안에서 — 화면 한가운데 떠 있으면 인사말·입력칸 위에 겹쳐 무엇이 로딩 중인지 알 수 없었다(2026-11-02 사장님) */
  const list = !state ? <PlanLoading variant="compact" note="내 사업을 불러오고 있어요" onRetry={() => retry.current()} /> : <div className={home.listBody} data-empty-list={plans.length === 0 && !error ? "" : undefined}>
    <p role="status" className={mine.status} data-empty={notice ? undefined : ""}>{notice}</p>
    {filter === "samples" ? (samples.length ? <div className={home.grid}>{samples.map(p => <button type="button" className={home.sampleCard} key={p.id} onClick={() => sample(p.id)}>
      <span className={home.thumb}><span className={home.skeleton} aria-hidden="true"><i /><i /><i /><span><i /><i /><i /></span><i /></span><StatusBadge tone="info" className={home.thumbBadge}>완성 예시</StatusBadge></span>
      <span className={home.meta}><span className={home.avatar} aria-hidden="true">예</span><span className={home.metaText}><strong>{p.title.replace(/^샘플 · /,"")}</strong><span className={mine.meta}>사업계획서 예시 보기</span></span></span>
    </button>)}</div> : <p className={home.quiet}>지금 보여 드릴 예시가 없어요.</p>)
    : plans.length === 0 && error ? <div role="alert" className={styles.error}><p>사업 목록을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.</p><AppButton type="button" variant="primary" className={styles.primary} onClick={() => { setError(""); setState(null); retry.current(); }}>다시 시도</AppButton></div> : plans.length === 0 ? <BusinessEmptyState heading="h2" kind="plans" />
    : shown.length === 0 ? <p className={home.quiet}>‘{query.trim()}’ 이름의 사업이 없어요.</p> : <div className={`${mine.list} ${home.grid}`}>{shown.map(card)}</div>}
    {error && plans.length > 0 && <p role="alert" className={styles.error}>{error} <button type="button" className={styles.inlineRetry} onClick={() => retry.current()}>다시 시도</button></p>}
  </div>;

  return <main className={frame.page} data-plan-view="plans" data-list-only={listOnly || undefined}><BusinessAppChrome title="내 사업" active={listOnly ? "plans" : "new"} backHref="/" home>
    <Suspense fallback={null}><ParamsWatcher onChange={onParams} /></Suspense>
    <div className={home.scroll}>
      {!listOnly && <section className={home.hero} aria-labelledby="plan-home-greeting">
        {/* 인사말에 이름을 붙이지 않는다 — 계정에 이름이 없어 이메일 앞부분(rena35200+review님)이 그대로 보였다(운영 점검 2026-11-02). 동그라미 머리글자는 그대로 */}
        <h1 id="plan-home-greeting" className={home.greeting}>오늘은 어떤 사업을 시작해볼까요?</h1>
        {/* 로그인 전에 하던 사업 — 대화 화면에서 X를 누르면 새로 시작 화면만 보여 다시 열 길이 뒤로 가기뿐이었다(점검 2026-11-16). 자료는 이 브라우저에 있다 */}
        {guest && resume && <div className={home.resume} data-guest-resume>
          <Link href={openHref(resume)} className={home.resumeLink}><span>이어서 하기</span><strong>{planDisplayName(resume)}</strong><ChevronRight size={16} aria-hidden="true" /></Link>
          <p className={home.resumeNote}>로그인하면 저장돼요. <button type="button" onClick={() => openLogin(openHref(resume))}>로그인</button></p>
        </div>}
        <Composer guest={guest} />
        {/* 적는 것이 기본, 다른 길 세 개는 입력칸 아래 작은 글로(2026-11-15 사장님: 새 대화도 이 화면 하나로). 일반/전문가 전환은 입력칸에서 빼고 '하나씩 자세히'로 옮겼다 */}
        <nav className={home.alt} aria-label="다른 시작">
          {([["아직 정한 사업이 없어요", newChatEntryHref("exploring")], ["이미 운영 중이에요", newChatEntryHref("operating")], ["하나씩 자세히 정할게요", `${newChatHref()}&${DEPTH_PARAM}=expert`]] as const).map(([label, href]) =>
            <Link key={label} href={href} onClick={event => { if (guest) { event.preventDefault(); openLogin(href); } }}>{label}</Link>)}
        </nav>
        {/* 휴대폰 첫 화면의 최근 사업 3개는 뺐다(2026-11-15 사장님) — 첫 화면은 입력칸만, 사업은 아래 탭 '내 사업'에서 */}
        {/* 완성 예시 두 개 — 아직 사업이 없는 사람(로그인 전 포함)만. 필요하면 눌러 본다 */}
        {guest && <nav className={home.samples} aria-label="완성 예시">
          <Link href="/plan/studio?planId=sample_banchan_easy">일반 (샘플)<ArrowRight size={14} aria-hidden="true" /></Link>
          <Link href="/plan/studio?planId=sample_banchan_expert">전문가 (샘플)<ArrowRight size={14} aria-hidden="true" /></Link>
        </nav>}
      </section>}
      {/* 첫 화면에는 입력칸만 — 사업 목록은 '내 사업'에서만 본다(2026-11-15 사장님: 새 대화 · 내 사업 둘만). 전에는 PC 첫 화면 아래에 같은 목록이 또 있었다 */}
      {!guest && listOnly && <section className={home.listCard} data-list-only={listOnly || undefined} aria-label="내 사업 목록" id="businesses">
        {/* 사업 카드만 보는 화면 — 제목(휴대폰은 lovable Projects 탭처럼 30/600 + 오른쪽 44 원 검색 단추) */}
        {listOnly && <div className={home.listHead}>
          <h1 className={home.listTitle}>내 사업</h1>
        </div>}
        <div className={home.filterRow}>
          <div className={home.filters} role="group" aria-label="목록 보기">
            {/* 검색을 켜면 다른 알약은 접고 검색칸이 막대를 채운다 — 예전엔 알약 옆에 칸이 붙어 막대 밖으로 밀려 나갔다(2026-11-02 사장님). 검색 알약을 다시 누르거나 Esc 로 닫는다 */}
            {FILTERS.filter(([key]) => filter !== "search" || key === "search").map(([key, label]) => <button key={key} type="button" className={home.filterPill} aria-pressed={filter === key} onClick={() => { if (key === "search") toggleSearch(); else setFilter(key); }}>{key === "search" && <Search size={16} aria-hidden="true" />}{label}</button>)}
            {filter === "search" && <TextField ref={searchInput} type="search" className={home.search} aria-label="사업 이름으로 찾기" placeholder="사업 이름으로 찾기" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") toggleSearch(); }} />}
          </div>
        </div>
        {list}
      </section>}
      {/* 휴대폰 '내 사업' — 아래 탭 막대 위에 떠 있는 '새 사업' 알약(lovable '새 프로젝트' 142×44) */}
      {listOnly && <Link href="/plan" className={home.newFloat}><Plus size={20} aria-hidden="true" />새 사업</Link>}
    </div>
  </BusinessAppChrome></main>;
}

/*
 * 큰 입력칸 672×97 r28 — 보내면 새 대화로(첫 화면 입력칸과 같은 길: newChatHref(idea) + 5분 보관본 — 로그인을 거쳐도 이어진다).
 * Enter 보내기 · Shift+Enter 줄바꿈 · 한글 조합 중에는 보내지 않는다. 예시 문장 넣기(전구)는 뺐다 — 누를 때마다 같은 문장이고 입력칸에 이미 흐리게 보인다(대표 결정 2026-11-14). 말로 입력하기(마이크)는 뺐다(대표 결정 2026-11-14).
 */
function Composer({ guest = false }: { guest?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  /* 보내지 않은 글을 잠깐 맡겨 두고(sessionStorage) 다시 열면 채운다 — 로그인하고 돌아와도 적은 글이 남게 */
  const draftStorage = () => { try { return window.sessionStorage; } catch { return null; } };
  /* 보낸 뒤 로그인 창이 떠서 첫 화면으로 돌아온 경우: 보낼 때 맡긴 글(5분 보관본)로도 채운다 — 미리보기 점검 2026-11-17 */
  useEffect(() => { const storage = draftStorage(); const now = Date.now(); const saved = readLandingDraft(storage, now) || readLandingIdea("", storage, now)?.text || ""; if (saved) setText(current => current || saved); }, []);
  const edit = (value: string) => { setText(value); saveLandingDraft(draftStorage(), value, Date.now()); };
  /* 작업실 경로를 미리 받아 둔다 — 보낼 때 코드 묶음을 그제야 받아 버벅였다 */
  useEffect(() => { router.prefetch(newChatHref()); }, [router]);
  const idea = normalizeLandingIdea(text);
  function send(event?: FormEvent) {
    event?.preventDefault();
    if (!idea || sending) { field.current?.focus(); return; }
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* 저장소가 막혀 있으면 주소로만 넘어간다 */ }
    stashLandingIdea(storage, idea, Date.now());
    clearLandingDraft(storage);
    const href = newChatHref(idea);
    /* 로그인 전 — 예시 작업실로 튕기지 않고 그 자리에서 로그인 창을 띄운다. 로그인하면 적은 문장으로 대화가 시작된다 */
    if (guest) { openLogin(href); return; }
    setSending(true);
    /* 대화 화면이 홈에서 확대되며 열리고 입력칸이 대화 입력칸으로 이어진다(globals.css ::view-transition) */
    navigateWithTransition(() => router.push(href));
  }
  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
  }
  return <form className={home.composer} onSubmit={send} aria-busy={sending || undefined}>
    <TextArea ref={field} className={home.composerField} aria-label="어떤 사업을 시작할지 적어 주세요" placeholder={`예: ${EXAMPLE_IDEA}`} rows={1} maxLength={LANDING_IDEA_MAX} value={text} onChange={event => edit(event.target.value)} onKeyDown={onKey} />
    <div className={home.composerBar}>
      <span className={home.spacer} />
      <button type="submit" className={`${home.circle} ${home.send}`} aria-label="보내기 — 새 대화 시작" disabled={!idea}><ArrowUp size={16} aria-hidden="true" /></button>
    </div>
  </form>;
}

/*
 * 카드의 홈페이지 상태 — 문서 상태('문서 완성')만 보여 홈페이지를 공개했는지 목록에서 알 수 없었다(감사 r36).
 * 공개 상태 확인은 사업마다 한 번(같은 사업은 요청을 나눠 쓴다 — use-homepage). 아직 모르거나 홈페이지가 없으면 아무것도 안 쓴다.
 */
/**
 * 카드 그림을 단계마다 다르게(2026-11-15 사장님 — 전부 같은 문서 그림이라 어디까지 왔는지 안 보였다).
 * 대화 중 = 말풍선 · 계획서 = 문서 · 홈페이지 = 브라우저 창 · 유지보수(공개했고 실적 기록이 있음) = 막대그래프
 */
type HubStatus = ReturnType<typeof businessHubState>;
/** 지금 진행 중인 일(만드는 중 · 다시 확인 필요 등)은 그 말을 그대로, 아니면 단계 이름 */
const BUSY_STATUS = ["수정 내용 반영 필요", "문서 제작 중", "답변 준비 중", "다시 확인 필요"];
function usePlanStage(plan: Plan, status: HubStatus) {
  const homepage = useHomepageStatus(isSamplePlan(plan.id) ? null : plan.id);
  let recorded = false;
  try { recorded = readOperatingState(plan.answers).periods.length > 0; } catch { /* 못 읽으면 기록 없음으로 */ }
  const stage = homepage === "published" && recorded ? "operations" : homepage === "published" || homepage === "draft" ? "homepage" : status.documents.length > 0 ? "plan" : "chat";
  if (BUSY_STATUS.includes(status.status)) return { stage, label: status.status, tone: status.statusTone };
  if (stage === "operations") return { stage, label: "유지보수", tone: "success" as const };
  if (stage === "homepage") return { stage, label: homepage === "published" ? "홈페이지 공개 중" : "홈페이지 공개 전", tone: homepage === "published" ? "success" as const : "neutral" as const };
  return { stage, label: status.complete ? "계획서 완성" : status.status, tone: status.statusTone };
}
function StageBadge({ plan, status, className }: { plan: Plan; status: HubStatus; className?: string }) {
  const { label, tone } = usePlanStage(plan, status);
  return <StatusBadge tone={tone} className={className}>{label}</StatusBadge>;
}
function StageArt({ plan, status }: { plan: Plan; status: HubStatus }) {
  const { stage } = usePlanStage(plan, status);
  return <><span className={home.skeleton} data-stage={stage} aria-hidden="true"><i /><i /><i /><span><i /><i /><i /></span><i /></span><StageBadge plan={plan} status={status} className={home.thumbBadge} /></>;
}
