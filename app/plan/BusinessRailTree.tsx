"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { nativePlatform } from "../../lib/native-app";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, ChevronRight, FolderClosed } from "lucide-react";
import { isSamplePlan, loadState, locallyDeletedPlanIds, setActivePlan, subscribePlanState, subscribePlanTitle, type Plan, type PlanTitleNotice } from "../../lib/plan-builder/plan-store";
import { subscribeGeneration } from "../../lib/plan-builder/generation-queue";
import { journeySteps, JOURNEY_LABELS, JOURNEY_ORDER, OPERATING_LAUNCH_LABEL, WORKSPACE_TAB_EVENT, WORKSPACE_TAB_REQUEST, type JourneyStepId } from "../../lib/plan-builder/journey";
import { isStudioTab, stepForStudioTab, studioHref, studioTabForStep, STUDIO_PATH, STUDIO_REDIRECT } from "../../lib/plan-builder/studio";
import { shouldResumeBusinessChat } from "../../lib/plan-builder/business-hub";
import { planDisplayName } from "../../lib/plan-builder/business-name";
import { useHomepageStatus } from "./use-homepage";
import shell from "./PlanShell.module.css";
import menu from "./RailMenu.module.css";
import styles from "./BusinessRailTree.module.css";

/** 문서 화면이 왼쪽 메뉴에 넘겨 주는 자기 목차 — 누르면 그 장으로 넘어간다 */
export type DocumentToc = { planId: string; chapters: string[]; current: number | "all"; onSelect: (index: number | "all") => void };

const LIST_OPEN_KEY = "oneulstart:rail-plans-open";

/** 왼쪽 목록에서 표시할 수 있는 자리 — 다섯 단계(journey.ts 의 JOURNEY_ORDER) */
type RailHere = JourneyStepId;
/** 지금 화면이 어디인지(사업 관리 화면은 주소의 tab 으로) */
function stepFor(pathname: string, tab: string | null): RailHere | null {
  /* 작업실은 주소의 tab 이 지금 칸(작업실이 탭을 바꿀 때 WORKSPACE_TAB_EVENT 를 보낸다) */
  if (pathname.startsWith(STUDIO_PATH)) return isStudioTab(tab) ? stepForStudioTab(tab) : "chat";
  if (pathname.startsWith("/plan/chat")) return "chat";
  if (pathname.startsWith("/plan/document")) return "document";
  if (pathname.startsWith("/plan/homepage")) return "homepage";
  /* 사업 관리 화면은 탭이 여럿이다 — '유지보수' 탭일 때만 유지보수를 표시한다(예전엔 사업 요약·개업 준비에서도 유지보수가 켜졌다) */
  if (pathname.startsWith("/plan/workspace")) return tab === "operations" ? "care" : tab === "launch" || tab === "action" ? "launch" : null;
  return null;
}

/* 홈페이지 화면 안의 칸 — 누르면 그 자리로 내려간다 */
/* 홈페이지 화면의 번호(1~5)와 같은 순서 */
const HOMEPAGE_PARTS: Array<[string, string]> = [["hk-preview", "미리보기·고치기"], ["hk-contact", "손님 연락 방법"], ["hk-business", "사업자 정보"], ["hk-domain", "내 도메인 연결"], ["hk-leads", "문의 알림"], ["hk-expert", "전문가 상담"]];
function jump(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/*
 * 아직 열리지 않은 단계를 누르면 왜 막혔는지와 갈 곳을 안내창으로 보여 준다 — 예전엔 마우스를 올려야 뜨는 말풍선뿐이라
 * 휴대폰에서는 눌러도 아무 일이 없었다(소유자 피드백 2026-10-09).
 */
export const LOCKED_GUIDE: Record<Exclude<JourneyStepId, "chat">, { message: string; back: number; label: string }> = {
  document: { message: "사업 방향 정리를 마쳐야 사업계획서를 만들 수 있어요.", back: 0, label: "대화로 가기" },
  homepage: { message: "사업계획서를 완성해야 홈페이지를 만들 수 있어요.", back: 1, label: "사업계획서로 가기" },
  /* 유지보수(실적 기록·홈페이지 관리)는 홈페이지가 없어도 쓸 수 있다 — 사업 관리 화면과 같은 규칙. 막히는 건 사업 방향을 정하기 전뿐 */
  care: { message: "사업 방향 정리를 마쳐야 유지보수를 쓸 수 있어요.", back: 0, label: "대화로 가기" },
  /* 단계 이름은 journey-steps.ts 한 곳에서 — 운영 중인 사업은 lockedGuide 가 '운영 개선'으로 바꾼다 */
  launch: { message: `사업 방향 정리를 마쳐야 ${JOURNEY_LABELS.launch}를 쓸 수 있어요.`, back: 0, label: "대화로 가기" },
};
/** 막힌 단계 안내 — 운영 중인 사업은 4단계 이름이 '운영 개선'이라 문구도 그 이름으로 */
export function lockedGuide(step: Exclude<JourneyStepId, "chat">, operating = false) {
  const guide = LOCKED_GUIDE[step];
  return step === "launch" && operating ? { ...guide, message: `사업 방향 정리를 마쳐야 ${OPERATING_LAUNCH_LABEL}을 쓸 수 있어요.` } : guide;
}

/** 사업 하나를 펼친 목차 — 대화 · 사업계획서 · 홈페이지 · 개업 준비 · 유지보수 */
function PlanBranch({ plan, here, documentToc, pathname }: { plan: Plan; here: RailHere | null; documentToc?: DocumentToc; pathname: string }) {
  const homepage = useHomepageStatus(plan.id);
  /*
   * 사업 관리 화면(사업 요약·개업 준비·유지보수)이 열리는지 — 대화가 끝나기 전에는 화면이 대화로 되돌려 보낸다.
   * 예전엔 '개업 준비'로 가는 길이 대화 화면의 링크 하나뿐이라 9단계 준비 과정과 홍보 키트를 다시 찾기 어려웠다.
   */
  const workspaceOpen = !shouldResumeBusinessChat(plan);
  /* 단계 목록은 journey.ts 한 곳에서 — '개업 준비'는 사업 관리 화면이 열릴 때만 보인다(번호는 보이는 순서대로) */
  const allSteps = useMemo(() => journeySteps(plan, homepage), [plan, homepage]);
  const steps = useMemo(() => allSteps.filter(step => step.id !== "launch" || workspaceOpen), [allSteps, workspaceOpen]);
  const [locked, setLocked] = useState<{ message: string; href: string; label: string } | null>(null);
  // 앱에서는 홈페이지 화면에 '내 도메인 연결' 칸이 없다(웹 전용 상품) — 목차에서도 뺀다
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(nativePlatform() !== null); }, []);
  const homepageParts = inApp ? HOMEPAGE_PARTS.filter(([id]) => id !== "hk-domain") : HOMEPAGE_PARTS;
  /*
   * 작업실 안이면 단계 링크도 작업실 주소로 — 같은 사업이면 작업실이 이동 대신 탭을 바꾸고, 다른 사업이면 그 사업의 작업실로.
   * 작업실이 켜져 있으면(STUDIO_REDIRECT) 작업실 밖(내 사업 · 예전 화면)에서도 작업실로 바로 — 예전 화면을 거쳐 다시 보내지 않게
   */
  const inStudio = pathname.startsWith(STUDIO_PATH);
  const toStudio = inStudio || STUDIO_REDIRECT;
  const stepHref = (id: JourneyStepId, href: string) => (toStudio ? studioHref(plan.id, studioTabForStep(id)) : href);
  const lockDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (locked && lockDialog.current && !lockDialog.current.open) lockDialog.current.showModal(); }, [locked]);
  const openLocked = (id: JourneyStepId) => {
    if (id === "chat") return;
    // 홈페이지 공개 여부를 아직 모르면(불러오는 중·실패) 막혔다고 말하지 않는다
    if (id === "care" && homepage === null) return;
    const guide = lockedGuide(id, allSteps.find(step => step.id === "launch")?.label === OPERATING_LAUNCH_LABEL);
    setLocked({ message: guide.message, href: stepHref(JOURNEY_ORDER[guide.back], allSteps[guide.back].href), label: guide.label });
  };
  return <><ol className={styles.steps}>
    {steps.map((step, index) => {
      const current = here === step.id;
      /* 개업 준비·유지보수는 홈페이지 없이도 쓸 수 있다(사업 관리 화면과 같은 규칙) */
      const reachable = step.id === "care" || step.id === "launch" ? workspaceOpen : step.state !== "todo" || index === 0 || steps[index - 1].state === "done";
      const body = <>
        <i aria-hidden="true" data-state={step.state}>{step.state === "done" ? <Check size={11} strokeWidth={3} /> : index + 1}</i>
        <span>{step.label}</span>
      </>;
      return <Fragment key={step.id}>
        <li>
        {reachable
          ? <Link className={styles.step} href={stepHref(step.id, step.href)} aria-current={current ? "page" : undefined} onClick={event => { setActivePlan(plan.id); if (toStudio) return; if (step.id === "care") sameWorkspaceTab(event, plan.id, "operations"); else if (step.id === "launch") sameWorkspaceTab(event, plan.id, "launch"); }}>{body}</Link>
          : <button type="button" className={styles.step} aria-disabled="true" title="앞 단계를 마치면 열려요" onClick={() => openLocked(step.id)}>{body}</button>}
        {/* 문서를 보고 있으면 그 문서의 목차를 바로 아래에 */}
        {step.id === "document" && current && documentToc?.planId === plan.id && documentToc.chapters.length > 0 && <ul className={styles.parts} aria-label="사업계획서 목차">
          {documentToc.chapters.map((name, chapter) => <li key={name}><button type="button" aria-current={documentToc.current === chapter ? "true" : undefined} onClick={() => documentToc.onSelect(chapter)}><b>{String(chapter + 1).padStart(2, "0")}</b>{name}</button></li>)}
          <li><button type="button" aria-current={documentToc.current === "all" ? "true" : undefined} onClick={() => documentToc.onSelect("all")}>전체 이어 읽기</button></li>
        </ul>}
        {step.id === "homepage" && current && (pathname.startsWith("/plan/homepage") || inStudio) && <ul className={styles.parts} aria-label="홈페이지 목차">
          {homepageParts.map(([id, name], part) => <li key={id}><button type="button" onClick={() => jump(id)}><b>{part + 1}</b>{name}</button></li>)}
        </ul>}
      </li></Fragment>;
    })}
  </ol>
  <dialog ref={lockDialog} className={styles.lockDialog} onClose={() => setLocked(null)}>
    <p>{locked?.message}</p>
    <div>
      <button type="button" onClick={() => lockDialog.current?.close()}>닫기</button>
      {locked && <Link href={locked.href} onClick={() => { lockDialog.current?.close(); setActivePlan(plan.id); }}>{locked.label}</Link>}
    </div>
  </dialog></>;
}

/**
 * 왼쪽 메뉴의 '내 사업' — 누르면 내가 진행한 사업이 바로 아래 펼쳐지고,
 * 사업을 누르면 그 사업의 목차(대화 → 사업계획서 → 홈페이지 → 유지보수)가 펼쳐진다.
 * 대화·문서·홈페이지·사업 관리 어느 화면에서든 같은 자리, 같은 모양이다.
 */
/*
 * 서버가 그린 첫 화면을 맞출 때만 '아직'으로 그리고, 화면을 옮겨 새로 그릴 때는 바로 그린다 — 예전엔 화면마다
 * 목록이 비었다가 다시 나타나 '유지보수' 체크가 풀렸다 돌아오는 것처럼 깜빡였다(소유자 지적 2026-10-07).
 * useSyncExternalStore 는 서버 화면을 맞출 때 getServerSnapshot 을, 그 밖에는 getSnapshot 을 쓴다.
 */
const noSubscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;
const readPlanId = () => new URLSearchParams(window.location.search).get("planId");
const noPlanId = () => null;
/*
 * 주소의 사업 번호를 따라간다 — 예전엔 화면 경로(pathname)가 바뀔 때만 다시 읽어, 같은 화면에서 사업만 바뀌면
 * (새 대화로 만든 사업, 다른 사업 고르기) 목록이 이전 사업을 표시했다(점검 2026-10-22).
 * useSearchParams 는 정적 빌드에서 Suspense 가 필요해 이 작은 조각만 감싼다(그동안은 아래 readPlanId 로 읽는다).
 */
function UrlPlanWatcher({ onChange }: { onChange: (planId: string | null) => void }) {
  const planId = useSearchParams().get("planId");
  useEffect(() => { onChange(planId); }, [planId, onChange]);
  return null;
}
/* 사업 관리 화면의 탭 — 화면이 탭을 바꿀 때 보내는 신호와 뒤로 가기에 맞춰 다시 읽는다 */
const subscribeTab = (onChange: () => void) => {
  window.addEventListener(WORKSPACE_TAB_EVENT, onChange); window.addEventListener("popstate", onChange);
  return () => { window.removeEventListener(WORKSPACE_TAB_EVENT, onChange); window.removeEventListener("popstate", onChange); };
};
const readTab = () => new URLSearchParams(window.location.search).get("tab");
/* 이미 같은 사업의 사업 관리 화면이면 주소 이동 대신 화면에 탭을 바꿔 달라고 한다(화면이 주소·목록 표시도 맞춘다) */
const sameWorkspaceTab = (event: { preventDefault: () => void }, planId: string, tab: string) => {
  if (window.location.pathname !== "/plan/workspace" || new URLSearchParams(window.location.search).get("planId") !== planId) return;
  event.preventDefault();
  window.dispatchEvent(new CustomEvent(WORKSPACE_TAB_REQUEST, { detail: tab }));
};

export default function BusinessRailTree({ documentToc, onPlanCount }: {
  documentToc?: DocumentToc;
  /** 사업이 몇 개인지 확인되면 알려 준다(못 불러왔으면 부르지 않는다) — 사업이 없으면 메뉴가 '내 문의'를 막는다 */
  onPlanCount?: (count: number) => void;
}) {
  const pathname = usePathname() || "";
  /* 저장된 사업은 브라우저에만 있다 — 서버가 그린 첫 화면과 어긋나지 않게 올라온 뒤에 그린다 */
  const mounted = useSyncExternalStore(noSubscribe, onClient, onServer);
  const [tick, setTick] = useState(0);
  const [listOpen, setListOpen] = useState(true);
  /* 한 번에 한 사업만 펼친다(소유자 피드백 2026-10-07: 여러 개가 열려 헷갈림). undefined = 지금 보는 사업 */
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const [watchedPlanId, setUrlPlanId] = useState<string | null | undefined>(undefined);
  const livePlanId = useSyncExternalStore(noSubscribe, readPlanId, noPlanId);
  const urlPlanId = watchedPlanId === undefined ? livePlanId : watchedPlanId;
  const workspaceTab = useSyncExternalStore(subscribeTab, readTab, noPlanId);
  useEffect(() => {
    try { if (localStorage.getItem(LIST_OPEN_KEY) === "0") setListOpen(false); } catch { /* 기본은 펼침 */ }
    const refresh = () => setTick(n => n + 1);
    const offState = subscribePlanState(refresh), offGeneration = subscribeGeneration(refresh);
    return () => { offState(); offGeneration(); };
  }, []);

  const state = useMemo(() => (mounted ? loadState() : null), [mounted, tick, pathname]);
  const local = useMemo(() => (state?.plans ?? []).filter(plan => !isSamplePlan(plan.id)), [state]);
  /*
   * 서버 목록도 읽어 이 기기 저장본과 합친다(읽기만) — 예전엔 이 기기에 사업이 하나라도 있으면 서버를 보지 않아
   * 휴대폰에서 만든 사업이 PC 왼쪽 목록에 없었다. 처음 한 번, 그리고 지금 보는 사업이 목록에 없을 때 다시 읽는다.
   * hydrateFromServer 는 쓰지 않는다 — 화면이 부른 것과 겹치면 먼저 부른 쪽이 옛 상태를 받는다.
   * 못 불러오면 '사업 없음' 대신 안내를 보이고, 다음 화면 이동 때 다시 읽는다.
   */
  const [remote, setRemote] = useState<Plan[] | null>(null);
  /* 서버가 지운 사업 번호 — 다른 기기·탭에서 지운 사업이 옛 서버 목록으로 되살아나지 않게 */
  const [remoteDeleted, setRemoteDeleted] = useState<string[]>([]);
  const [remoteFailed, setRemoteFailed] = useState(false);
  const [remoteTick, setRemoteTick] = useState(0);
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    fetch("/api/plan/state", { cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error("PLAN_STATE_UNAVAILABLE"); return response.json(); })
      .then((data: { plans?: Plan[]; authenticated?: boolean; deletedPlanIds?: unknown }) => { if (!alive) return; setRemote((data?.plans ?? []).filter(plan => !isSamplePlan(plan.id))); setRemoteDeleted(Array.isArray(data?.deletedPlanIds) ? data.deletedPlanIds.filter((id): id is string => typeof id === "string") : []); setRemoteFailed(false); })
      .catch(() => { if (alive) setRemoteFailed(true); });
    return () => { alive = false; };
  }, [mounted, remoteTick]);
  /*
   * 대화 화면이 알려 준 새 이름 — 대화는 서버에만 저장해 이 기기 저장본도, 처음 읽은 서버 목록도 옛 이름('새 사업 구상')이다.
   * 알림을 받으면 바로 이름을 바꿔 보이고 서버 목록도 다시 읽는다. 목록 쪽이 더 새 저장이면 그쪽 이름을 따른다.
   */
  const [titles, setTitles] = useState<Record<string, PlanTitleNotice>>({});
  const plans = useMemo(() => {
    /* 지운 사업은 서버 목록을 처음 읽은 뒤라도 뺀다 — 예전엔 지운 사업이 새로고침 전까지 남았고, 다 지워도 셋이 보였다 */
    const deleted = new Set([...remoteDeleted, ...(mounted ? locallyDeletedPlanIds() : [])]);
    const byId = new Map<string, Plan>();
    for (const plan of [...(remote ?? []), ...local]) {
      if (deleted.has(plan.id)) continue;
      const held = byId.get(plan.id);
      if (!held || plan.updatedAt.localeCompare(held.updatedAt) > 0) byId.set(plan.id, plan);
    }
    for (const notice of Object.values(titles)) {
      const plan = byId.get(notice.planId);
      if (plan && plan.title !== notice.title && notice.updatedAt.localeCompare(plan.updatedAt) >= 0) byId.set(plan.id, { ...plan, title: notice.title, updatedAt: notice.updatedAt });
    }
    return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [local, remote, remoteDeleted, mounted, titles]);
  const shownTitles = useRef(new Map<string, string>());
  shownTitles.current = new Map(plans.map(plan => [plan.id, plan.title]));
  useEffect(() => subscribePlanTitle(notice => {
    // 이미 같은 이름으로 보이고 있으면 서버를 다시 읽지 않는다(대화 화면은 저장할 때마다 알린다)
    if (shownTitles.current.get(notice.planId) === notice.title) return;
    setTitles(previous => ({ ...previous, [notice.planId]: notice }));
    setRemoteTick(n => n + 1);
  }), []);
  /* 이 기기의 사업 구성이 바뀌면(새로 만들거나 지움) 서버 목록도 다시 읽어 맞춘다 — 저장 때마다가 아니라 사업 번호가 바뀔 때만 */
  const localIds = useMemo(() => local.map(plan => plan.id).sort().join("|"), [local]);
  const firstLocalIds = useRef<string | null>(null);
  useEffect(() => {
    if (!mounted) return;
    if (firstLocalIds.current === null) { firstLocalIds.current = localIds; return; }
    if (firstLocalIds.current === localIds) return;
    firstLocalIds.current = localIds;
    setRemoteTick(n => n + 1);
  }, [mounted, localIds]);
  const checked = remote !== null || (remoteFailed && local.length > 0);
  useEffect(() => { if (checked) onPlanCount?.(plans.length); }, [checked, plans.length, onPlanCount]);
  const step = stepFor(pathname, workspaceTab);
  /*
   * 지금 화면이 보여 주는 사업 — 주소에 있으면 그것, 홈페이지처럼 주소에 없으면 작업 중인 사업.
   * 대화 화면은 주소에 사업이 없으면 새 대화다 — 작업 중이던 다른 사업의 '대화'를 표시하지 않는다(사업이 만들어지면 주소에 붙는다).
   */
  const currentId = urlPlanId ?? (step && step !== "chat" ? state?.activePlanId ?? null : null);
  // 지금 보는 사업이 목록에 없으면(다른 기기·방금 대화에서 만든 사업) 서버 목록을 한 번 더 읽는다
  useEffect(() => {
    if (!mounted || !currentId || isSamplePlan(currentId) || plans.some(plan => plan.id === currentId) || askedFor.current === currentId) return;
    askedFor.current = currentId;
    setRemoteTick(n => n + 1);
  }, [mounted, currentId, plans]);
  // 못 불러왔으면 화면을 옮길 때 다시 읽는다
  useEffect(() => { if (remoteFailed) setRemoteTick(n => n + 1); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  // 다른 사업 화면으로 옮기면 그 사업만 펼친 상태로 돌아간다.
  useEffect(() => { setOpenId(undefined); }, [currentId]);

  function toggleList() {
    const next = !listOpen;
    setListOpen(next);
    try { localStorage.setItem(LIST_OPEN_KEY, next ? "1" : "0"); } catch { /* 이번 화면에서만 */ }
  }

  return <div className={styles.tree}>
    <Suspense fallback={null}><UrlPlanWatcher onChange={setUrlPlanId} /></Suspense>
    {/*
      '내 사업'은 누르면 사업 목록 화면으로 간다. 펼치기·접기는 오른쪽 화살표로만(대표 요청 2026-10-14) —
      예전엔 '내 사업'이 펼치기 단추여서 목록 화면으로 가는 '모든 사업 한눈에 보기' 링크가 따로 있었고, 둘이 겹쳐 보였다.
    */}
    <div className={styles.headRow}>
      <Link href="/plan" className={`${shell.railBtn} ${menu.item} ${menu.main} ${styles.head}`} aria-current={pathname === "/plan" || pathname === "/plan/" ? "page" : undefined} title="내 사업">
        <FolderClosed /><span className={shell.railLabel}>내 사업</span>
      </Link>
      <button type="button" className={styles.toggle} aria-expanded={listOpen} aria-label={listOpen ? "사업 목록 접기" : "사업 목록 펼치기"} onClick={toggleList}>
        <ChevronRight className={styles.caret} data-open={listOpen || undefined} aria-hidden="true" />
      </button>
    </div>
    {listOpen && mounted && <div className={styles.list}>
      {/* 비어 있을 때 안내는 걷었다 — 바로 위 '내 사업'·'새 대화'가 할 일을 말한다(군더더기 점검 r37). 불러오기 실패만 알린다 */}
      {remoteFailed && plans.length === 0 && <p className={styles.empty}>사업 목록을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p>}
      {plans.map(plan => {
        const isCurrent = plan.id === currentId;
        const open = openId === undefined ? isCurrent : openId === plan.id;
        return <div key={plan.id} className={styles.plan}>
          <button type="button" className={styles.planRow} data-current={isCurrent || undefined} aria-expanded={open} title={planDisplayName(plan)} onClick={() => setOpenId(open ? null : plan.id)}>
            <ChevronRight className={styles.caret} data-open={open || undefined} aria-hidden="true" />
            <span>{planDisplayName(plan)}</span>
          </button>
          {open && <PlanBranch plan={plan} here={isCurrent ? step : null} documentToc={documentToc} pathname={pathname} />}
        </div>;
      })}
    </div>}
  </div>;
}
