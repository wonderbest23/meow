"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowUp, ChevronDown, Mic, MoreHorizontal, Plus, Search, Sparkles } from "lucide-react";
import { currentBusinessDesign } from "../../lib/plan-builder/coach";
import { hydrateFromServer, lastHydrationFailed, setActivePlan, deletePlan, renamePlan, loadState, isSamplePlan, type Plan, type PlanState } from "../../lib/plan-builder/plan-store";
import { businessHubState, businessEntryHref } from "../../lib/plan-builder/business-hub";
import { isUnnamedBusiness, planDisplayName } from "../../lib/plan-builder/business-name";
import { journeyNext, launchProgress } from "../../lib/plan-builder/journey";
import { normalizeLandingIdea, stashLandingIdea, LANDING_IDEA_MAX } from "../../lib/plan-builder/landing-idea";
import { ENTRY_MODES, newChatEntryHref, newChatHref, STUDIO_REDIRECT, studioEntryHref, type EntryMode } from "../../lib/plan-builder/studio";

/* 작업실을 켰으면 같은 자리(대화·계획서·사업 관리)를 작업실 탭으로 연다 — 작업실 탭이 없는 화면이면 예전 주소 그대로 */
/* 작업실이 켜져 있으면 바로 작업실로 — 예전 화면을 거쳐 다시 보내지 않게(새 대화 화면이 꺼져 있으면 작업실이 열리지 않아 예전 화면) */
const openHref = (plan: Parameters<typeof businessEntryHref>[0]) => { const href = businessEntryHref(plan); return (STUDIO_REDIRECT && studioEntryHref(href)) || href; };
const stepHref = (href: string) => (STUDIO_REDIRECT && studioEntryHref(href)) || href;
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
import { AppButton } from "../../components/app-button";
import { TextArea, TextField } from "../../components/app-field";
import { loadAuthSession } from "../../lib/client/auth-session";
import { PLAN_VIEW_ALL } from "./MobileTabBar";

/*
 * 로그인 뒤 첫 화면(/plan) — 시안 Main.dc.html(PC 1440) · MHome.dc.html(휴대폰 390).
 * 위 안내 알약(오늘 할 일) → 인사말 → 큰 입력칸(보내면 새 대화 — 첫 화면 입력칸과 같은 길: newChatHref + idea 보관)
 * → 아래 목록 카드(검색 · 내 사업 · 최근 본 항목 · 예시) + 사업 카드(316px).
 * ?view=all 이면 입력칸 없이 사업 카드만(왼쪽 메뉴·아래 탭의 '내 사업'). 목록의 데이터·상태(불러오기 실패·빈 화면·이름 변경·삭제 안내)는 예전 그대로.
 */
type Filter = "search" | "mine" | "recent" | "samples";
const FILTERS: Array<[Filter, string]> = [["search", "검색"], ["mine", "내 사업"], ["recent", "최근 본 항목"], ["samples", "예시"]];
/* 입력칸 '사업계획서 ▾' — 새 대화의 첫 선택지(아이디어 찾기 · 생각한 사업 · 운영 중)를 골라 바로 시작한다(첫 화면 '어떤 사업이든' 카드와 같은 길) */
const ENTRY_LABELS: Record<EntryMode, string> = { exploring: "아이디어부터 찾을래요", startup: "생각한 사업이 있어요", operating: "사업을 운영 중이에요" };
const EXAMPLE_IDEA = "성수동에 작은 쿠키 공방을 열고 싶어요";

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
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => { let alive = true; loadAuthSession().then(d => { if (alive) setSignedIn(!!d.authenticated); }).catch(() => {}).finally(() => { if (alive) setAuthChecked(true); }); return () => { alive = false; }; }, []);
  /* 인사말의 이름 — 이메일 앞부분 */
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
  const onParams = useMemo(() => (nextView: string | null, search: boolean) => {
    setView(nextView);
    if (search) { setFilter("search"); setSearchFocus(n => n + 1); }
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
    if (!await askConfirm({ title: `‘${title}’ 사업을 삭제할까요?`, message: "대화·사업계획서와 이 사업의 홈페이지(공개 중인 사이트·받은 문의 포함)도 함께 삭제되고 되돌릴 수 없어요.", confirmLabel: "삭제", danger: true })) { focusMenu(id); return; }
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

  const card = (p: Plan) => { const status=businessHubState(p); const introduction = (status.coach && currentBusinessDesign(status.coach)?.startingPlan.scope) || status.coach?.business.description || ""; const display = planDisplayName(p); return <article key={p.id} className={`${mine.row} ${home.card}`}>
    {/* 썸네일 16:9 r8 — 사업 소개 한 단락(없으면 문서 모양 자리), 왼쪽 아래 상태 배지 */}
    <Link className={mine.open} href={openHref(p)} data-plan-open={p.id} aria-label={`${display} ${status.complete ? "사업계획서 보기" : status.coach || status.job ? "대화 이어가기" : "내 사업 화면 열기"}`}>
      <span className={home.thumb}>
        {/* 소개가 사업 이름과 같으면(첫 답을 그대로 이름으로 쓴 사업) 같은 줄을 두 번 보이지 않는다 */}
        {introduction && introduction.trim() !== p.title.trim() ? <span className={mine.desc}>{introduction}</span> : <span className={home.skeleton} aria-hidden="true"><i /><i /><i /><span><i /><i /><i /></span><i /></span>}
        <StatusBadge tone={status.statusTone} className={home.thumbBadge}>{status.status}</StatusBadge>
      </span>
      <span className={home.meta}>
        <span className={home.avatar} aria-hidden="true">{display.trim().charAt(0) || "사"}</span>
        <span className={home.metaText}>
          <strong className={mine.title}>{planDisplayName(p)}</strong>
          <span className={mine.meta}><time dateTime={p.updatedAt}>{editedAgo(p.updatedAt)}</time><HomepageStage planId={p.id} /></span>
        </span>
      </span>
    </Link>
    {editing===p.id && <form className={`${styles.rename} ${mine.rename}`} onSubmit={e=>{e.preventDefault();rename(p.id);}}><TextField aria-label="사업 이름" aria-describedby={`rename-hint-${p.id}`} value={name} maxLength={100} autoFocus onFocus={e=>e.currentTarget.select()} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Escape")cancelRename(p.id);}} /><AppButton type="submit" variant="primary" className={styles.primary}>저장</AppButton><AppButton variant="text" onClick={()=>cancelRename(p.id)}>취소</AppButton>
      {/* 열면 기존 이름을 골라 둔다(바로 새로 쓰게). 100자에 닿으면 더 써지지 않는 이유를 알린다. 홈페이지 이름은 따로 바뀐다 */}
      <p id={`rename-hint-${p.id}`} className={mine.renameHint} aria-live="polite">{name.length >= 100 ? "이름은 100자까지 쓸 수 있어요. " : ""}홈페이지 이름은 홈페이지 화면에서 따로 바꿔요.</p></form>}
    {editing!==p.id && <details className={`${styles.rowMenu} ${mine.menu}`} onClick={event => { if ((event.target as Element).closest("div button")) (event.currentTarget as HTMLDetailsElement).open = false; }} onKeyDown={event => {
      /* Esc로 닫고 ⋯ 단추로 초점을 돌려준다(접근성 점검 2026-10-22) */
      const menu = event.currentTarget as HTMLDetailsElement;
      if (event.key !== "Escape" || !menu.open) return;
      event.preventDefault(); menu.open = false; menu.querySelector("summary")?.focus();
    }}><summary aria-label={`${display} 관리`} data-plan-menu={p.id}><MoreHorizontal size={20} /></summary><div><button onClick={() => {setEditing(p.id);setName(isUnnamedBusiness(p.title) ? "" : p.title);setNotice("");}}>이름 변경</button><button onClick={() => remove(p.id,display)}>삭제</button></div></details>}
  </article>; };

  const list = !state ? <PlanLoading fill variant="compact" note="내 사업을 불러오고 있어요" onRetry={() => retry.current()} /> : <div className={home.listBody} data-empty-list={plans.length === 0 && !error ? "" : undefined}>
    <p role="status" className={mine.status} data-empty={notice ? undefined : ""}>{notice}</p>
    {filter === "samples" ? (samples.length ? <div className={home.grid}>{samples.map(p => <button type="button" className={home.sampleCard} key={p.id} onClick={() => sample(p.id)}>
      <span className={home.thumb}><span className={home.skeleton} aria-hidden="true"><i /><i /><i /><span><i /><i /><i /></span><i /></span><StatusBadge tone="info" className={home.thumbBadge}>완성 예시</StatusBadge></span>
      <span className={home.meta}><span className={home.avatar} aria-hidden="true">예</span><span className={home.metaText}><strong>{p.title.replace(/^샘플 · /,"")}</strong><span className={mine.meta}>사업계획서 예시 보기</span></span></span>
    </button>)}</div> : <p className={home.quiet}>지금 보여 드릴 예시가 없어요.</p>)
    : plans.length === 0 && error ? <div role="alert" className={styles.error}><p>사업 목록을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.</p><AppButton type="button" variant="primary" className={styles.primary} onClick={() => { setError(""); setState(null); retry.current(); }}>다시 시도</AppButton></div> : plans.length === 0 ? (
      /* 로그인 여부를 아직 모르면 자리만 잡아 둔다 — '사업이 없어요'를 먼저 보였다가 '로그인하면…'으로 바뀌며 화면이 한 번 흔들렸다(점검 r38) */
      !authChecked ? <section className={styles.emptyPlace} aria-hidden="true" /> : <BusinessEmptyState heading="h2" kind={signedIn === false ? "loggedOut" : "plans"} />
    ) : shown.length === 0 ? <p className={home.quiet}>‘{query.trim()}’ 이름의 사업이 없어요.</p> : <div className={`${mine.list} ${home.grid}`}>{shown.map(card)}</div>}
    {error && plans.length > 0 && <p role="alert" className={styles.error}>{error} <button type="button" className={styles.inlineRetry} onClick={() => retry.current()}>다시 시도</button></p>}
  </div>;

  return <main className={frame.page} data-plan-view="plans" data-list-only={listOnly || undefined}><BusinessAppChrome title="내 사업" active={listOnly ? "plans" : "new"} backHref="/" home>
    <Suspense fallback={null}><ParamsWatcher onChange={onParams} /></Suspense>
    <div className={home.scroll}>
      {!listOnly && <section className={home.hero} aria-labelledby="plan-home-greeting">
        {state && <TodoPill plans={plans} />}
        {/* 인사말에 이름을 붙이지 않는다 — 계정에 이름이 없어 이메일 앞부분(rena35200+review님)이 그대로 보였다(운영 점검 2026-11-02). 동그라미 머리글자는 그대로 */}
        <h1 id="plan-home-greeting" className={home.greeting}>오늘은 어떤 사업을 시작해볼까요?</h1>
        <Composer />
      </section>}
      <section className={home.listCard} data-list-only={listOnly || undefined} aria-label="내 사업 목록" id="businesses">
        {/* 사업 카드만 보는 화면 — 제목(휴대폰은 lovable Projects 탭처럼 30/600 + 오른쪽 44 원 검색 단추) */}
        {listOnly && <div className={home.listHead}>
          <h1 className={home.listTitle}>내 사업</h1>
          <button type="button" className={home.headCircle} aria-label="사업 이름으로 찾기" aria-pressed={filter === "search"} onClick={() => { setFilter("search"); setSearchFocus(n => n + 1); }}><Search size={20} aria-hidden="true" /></button>
        </div>}
        <div className={home.filterRow}>
          <div className={home.filters} role="group" aria-label="목록 보기">
            {FILTERS.map(([key, label]) => <button key={key} type="button" className={home.filterPill} aria-pressed={filter === key} onClick={() => { setFilter(key); if (key === "search") setSearchFocus(n => n + 1); }}>{key === "search" && <Search size={16} aria-hidden="true" />}{label}</button>)}
            {/* 검색칸 — lovable 처럼 필터 막대 안에 펼친다 */}
            {filter === "search" && <TextField ref={searchInput} type="search" className={home.search} aria-label="사업 이름으로 찾기" placeholder="사업 이름으로 찾기" value={query} onChange={event => setQuery(event.target.value)} />}
          </div>
          {!listOnly && <Link href={`/plan?view=${PLAN_VIEW_ALL}`} className={home.browse}>전체 둘러보기<ArrowRight size={16} aria-hidden="true" /></Link>}
        </div>
        {list}
      </section>
      {/* 휴대폰 '내 사업' — 아래 탭 막대 위에 떠 있는 '새 사업' 알약(lovable '새 프로젝트' 142×44) */}
      {listOnly && <Link href="/plan/chat?new=1" className={home.newFloat}><Plus size={20} aria-hidden="true" />새 사업</Link>}
    </div>
  </BusinessAppChrome></main>;
}

/*
 * 위 안내 알약 — 오늘 할 일 n건 · 가장 최근 사업의 다음 할 일(계획서를 다 만들었으면 journeyNext, 아니면 이어서 하기).
 * 할 일 수 = 다음 단계가 남은 사업 수(계획서를 다 만들고 개업 준비까지 마친 사업은 유지보수만 남아 빼고 센다). 없으면 그리지 않는다.
 */
function TodoPill({ plans }: { plans: Plan[] }) {
  const latest = plans[0] ?? null;
  const homepage = useHomepageStatus(latest?.id ?? null);
  if (!latest) return null;
  const count = plans.filter(plan => !(businessHubState(plan).complete && launchProgress(plan) === "done")).length;
  if (!count) return null;
  const hub = businessHubState(latest);
  const next = hub.complete ? { title: journeyNext(latest, homepage).title, href: stepHref(journeyNext(latest, homepage).href) } : { title: hub.coach || hub.job ? "대화 이어가기" : "사업계획서 이어 쓰기", href: openHref(latest) };
  return <Link href={next.href} className={home.todo} onClick={() => setActivePlan(latest.id)}>
    <span className={home.todoIcon} aria-hidden="true"><Sparkles size={12} /></span>
    <span className={home.todoText}>오늘 할 일 {count}건<span className={home.todoDetail}> — {planDisplayName(latest)} · {next.title}</span></span>
    <ArrowRight size={16} aria-hidden="true" />
  </Link>;
}

type Recognition = { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void };
function speechRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/*
 * 큰 입력칸 672×97 r28 — 보내면 새 대화로(첫 화면 입력칸과 같은 길: newChatHref(idea) + 5분 보관본 — 로그인을 거쳐도 이어진다).
 * Enter 보내기 · Shift+Enter 줄바꿈 · 한글 조합 중에는 보내지 않는다. ＋ 는 예시 문장 넣기, 마이크는 브라우저가 받아쓰기를 지원할 때만.
 */
function Composer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => { setCanListen(!!speechRecognition()); return () => recognition.current?.stop(); }, []);
  const idea = normalizeLandingIdea(text);
  function send(event?: FormEvent) {
    event?.preventDefault();
    if (!idea) { field.current?.focus(); return; }
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* 저장소가 막혀 있으면 주소로만 넘어간다 */ }
    stashLandingIdea(storage, idea, Date.now());
    router.push(newChatHref(idea));
  }
  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
  }
  function listen() {
    if (listening) { recognition.current?.stop(); return; }
    const Speech = speechRecognition();
    if (!Speech) return;
    const r = new Speech();
    r.lang = "ko-KR"; r.interimResults = false;
    r.onresult = result => { const said = Array.from(result.results).map(item => item[0]?.transcript ?? "").join(" ").trim(); if (said) setText(value => (value ? `${value} ${said}` : said).slice(0, LANDING_IDEA_MAX)); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    recognition.current = r; setListening(true);
    try { r.start(); } catch { setListening(false); }
  }
  return <form className={home.composer} onSubmit={send}>
    <TextArea ref={field} className={home.composerField} aria-label="어떤 사업을 시작할지 적어 주세요" placeholder={`예: ${EXAMPLE_IDEA}`} rows={1} maxLength={LANDING_IDEA_MAX} value={text} onChange={event => setText(event.target.value)} onKeyDown={onKey} />
    <div className={home.composerBar}>
      <button type="button" className={home.circle} aria-label="예시 문장 넣기" title="예시 문장 넣기" onClick={() => { setText(EXAMPLE_IDEA); field.current?.focus(); }}><Plus size={18} aria-hidden="true" /></button>
      <span className={home.spacer} />
      <details className={home.mode} onKeyDown={event => { const menu = event.currentTarget; if (event.key === "Escape" && menu.open) { event.preventDefault(); menu.open = false; menu.querySelector("summary")?.focus(); } }}>
        <summary className={home.modePill} aria-label="시작 방식 고르기 — 지금: 사업계획서">사업계획서<ChevronDown size={14} aria-hidden="true" /></summary>
        <div className={home.modeMenu}>
          {ENTRY_MODES.map(mode => <Link key={mode} href={newChatEntryHref(mode)}>{ENTRY_LABELS[mode]}</Link>)}
        </div>
      </details>
      {canListen && <button type="button" className={home.circle} aria-label={listening ? "받아쓰기 멈추기" : "말로 입력하기"} aria-pressed={listening} onClick={listen}><Mic size={18} aria-hidden="true" /></button>}
      <button type="submit" className={`${home.circle} ${home.send}`} aria-label="보내기 — 새 대화 시작" disabled={!idea}><ArrowUp size={16} aria-hidden="true" /></button>
    </div>
  </form>;
}

/*
 * 카드의 홈페이지 상태 — 문서 상태('문서 완성')만 보여 홈페이지를 공개했는지 목록에서 알 수 없었다(감사 r36).
 * 공개 상태 확인은 사업마다 한 번(같은 사업은 요청을 나눠 쓴다 — use-homepage). 아직 모르거나 홈페이지가 없으면 아무것도 안 쓴다.
 */
function HomepageStage({ planId }: { planId: string }) {
  const status = useHomepageStatus(isSamplePlan(planId) ? null : planId);
  if (status !== "published" && status !== "draft") return null;
  return <StatusBadge tone={status === "published" ? "success" : "neutral"}>{status === "published" ? "홈페이지 공개 중" : "홈페이지 공개 전"}</StatusBadge>;
}
