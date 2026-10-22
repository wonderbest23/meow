"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { nativePlatform } from "../../lib/native-app";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronRight, FolderClosed } from "lucide-react";
import { isSamplePlan, loadState, setActivePlan, subscribePlanState, type Plan } from "../../lib/plan-builder/plan-store";
import { subscribeGeneration } from "../../lib/plan-builder/generation-queue";
import { journeySteps, launchHref, WORKSPACE_TAB_EVENT, WORKSPACE_TAB_REQUEST, type JourneyStepId } from "../../lib/plan-builder/journey";
import { shouldResumeBusinessChat } from "../../lib/plan-builder/business-hub";
import { launchStatus, launchSteps, readLaunch } from "../../lib/plan-builder/business-launch";
import { readCoach } from "../../lib/plan-builder/coach";
import { useHomepageStatus } from "./use-homepage";
import shell from "./PlanShell.module.css";
import menu from "./RailMenu.module.css";
import styles from "./BusinessRailTree.module.css";

/** 문서 화면이 왼쪽 메뉴에 넘겨 주는 자기 목차 — 누르면 그 장으로 넘어간다 */
export type DocumentToc = { planId: string; chapters: string[]; current: number | "all"; onSelect: (index: number | "all") => void };

const LIST_OPEN_KEY = "oneulstart:rail-plans-open";

/** 왼쪽 목록에서 표시할 수 있는 자리 — 네 단계 + 사업 관리의 '사업 시작하기' */
type RailHere = JourneyStepId | "launch";
/** 지금 화면이 어디인지(사업 관리 화면은 주소의 tab 으로) */
function stepFor(pathname: string, tab: string | null): RailHere | null {
  if (pathname.startsWith("/plan/chat")) return "chat";
  if (pathname.startsWith("/plan/document")) return "document";
  if (pathname.startsWith("/plan/homepage")) return "homepage";
  /* 사업 관리 화면은 탭이 여럿이다 — '유지보수' 탭일 때만 유지보수를 표시한다(예전엔 사업 요약·사업 시작하기에서도 유지보수가 켜졌다) */
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
const LOCKED_GUIDE: Record<Exclude<JourneyStepId, "chat">, { message: string; back: number; label: string }> = {
  document: { message: "사업 방향 정리를 마쳐야 사업계획서를 만들 수 있어요.", back: 0, label: "대화로 가기" },
  homepage: { message: "사업계획서를 완성해야 홈페이지를 만들 수 있어요.", back: 1, label: "사업계획서로 가기" },
  /* 유지보수(실적 기록·홈페이지 관리)는 홈페이지가 없어도 쓸 수 있다 — 사업 관리 화면과 같은 규칙. 막히는 건 사업 방향을 정하기 전뿐 */
  care: { message: "사업 방향 정리를 마쳐야 유지보수를 쓸 수 있어요.", back: 0, label: "대화로 가기" },
};

/** 사업 하나를 펼친 목차 — 대화 · 사업계획서 · 홈페이지 · 유지보수 */
function PlanBranch({ plan, here, documentToc, pathname }: { plan: Plan; here: RailHere | null; documentToc?: DocumentToc; pathname: string }) {
  const homepage = useHomepageStatus(plan.id);
  const steps = journeySteps(plan, homepage);
  /*
   * 사업 관리 화면(사업 요약·사업 시작하기·유지보수)이 열리는지 — 대화가 끝나기 전에는 화면이 대화로 되돌려 보낸다.
   * 예전엔 '사업 시작하기'로 가는 길이 대화 화면의 링크 하나뿐이라 9단계 준비 과정과 홍보 키트를 다시 찾기 어려웠다.
   */
  const workspaceOpen = !shouldResumeBusinessChat(plan);
  const launch = useMemo(() => {
    if (!workspaceOpen) return null;
    const state = readLaunch(plan);
    const all = launchSteps(plan, state);
    const finished = state.configured && all.every(step => ["done", "skipped"].includes(launchStatus(state, step)));
    return { label: readCoach(plan.answers)?.stage === "operating" ? "운영 개선하기" : "사업 시작하기", state: finished ? "done" : state.configured ? "active" : "todo" };
  }, [plan, workspaceOpen]);
  const [locked, setLocked] = useState<{ message: string; href: string; label: string } | null>(null);
  // 앱에서는 홈페이지 화면에 '내 도메인 연결' 칸이 없다(웹 전용 상품) — 목차에서도 뺀다
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(nativePlatform() !== null); }, []);
  const homepageParts = inApp ? HOMEPAGE_PARTS.filter(([id]) => id !== "hk-domain") : HOMEPAGE_PARTS;
  const lockDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (locked && lockDialog.current && !lockDialog.current.open) lockDialog.current.showModal(); }, [locked]);
  const openLocked = (id: JourneyStepId) => {
    if (id === "chat") return;
    // 홈페이지 공개 여부를 아직 모르면(불러오는 중·실패) 막혔다고 말하지 않는다
    if (id === "care" && homepage === null) return;
    const guide = LOCKED_GUIDE[id];
    setLocked({ message: guide.message, href: steps[guide.back].href, label: guide.label });
  };
  return <><ol className={styles.steps}>
    {steps.map((step, index) => {
      const current = here === step.id;
      const reachable = step.id === "care" ? workspaceOpen : step.state !== "todo" || index === 0 || steps[index - 1].state === "done";
      /* '사업 시작하기'를 홈페이지와 유지보수 사이에 끼우면 유지보수 번호가 하나 밀린다 */
      const number = step.id === "care" && launch ? index + 2 : index + 1;
      const body = <>
        <i aria-hidden="true" data-state={step.state}>{step.state === "done" ? <Check size={11} strokeWidth={3} /> : number}</i>
        <span>{step.label}</span>
      </>;
      return <Fragment key={step.id}>
        {step.id === "care" && launch && <li>
          <Link className={styles.step} href={launchHref(plan.id)} aria-current={here === "launch" ? "page" : undefined} onClick={event => { setActivePlan(plan.id); sameWorkspaceTab(event, plan.id, "launch"); }}>
            <i aria-hidden="true" data-state={launch.state}>{launch.state === "done" ? <Check size={11} strokeWidth={3} /> : index + 1}</i>
            <span>{launch.label}</span>
          </Link>
        </li>}
        <li>
        {reachable
          ? <Link className={styles.step} href={step.href} aria-current={current ? "page" : undefined} onClick={event => { setActivePlan(plan.id); if (step.id === "care") sameWorkspaceTab(event, plan.id, "operations"); }}>{body}</Link>
          : <button type="button" className={styles.step} aria-disabled="true" title="앞 단계를 마치면 열려요" onClick={() => openLocked(step.id)}>{body}</button>}
        {/* 문서를 보고 있으면 그 문서의 목차를 바로 아래에 */}
        {step.id === "document" && current && documentToc?.planId === plan.id && documentToc.chapters.length > 0 && <ul className={styles.parts} aria-label="사업계획서 목차">
          {documentToc.chapters.map((name, chapter) => <li key={name}><button type="button" aria-current={documentToc.current === chapter ? "true" : undefined} onClick={() => documentToc.onSelect(chapter)}><b>{String(chapter + 1).padStart(2, "0")}</b>{name}</button></li>)}
          <li><button type="button" aria-current={documentToc.current === "all" ? "true" : undefined} onClick={() => documentToc.onSelect("all")}>전체 이어 읽기</button></li>
        </ul>}
        {step.id === "homepage" && current && pathname.startsWith("/plan/homepage") && <ul className={styles.parts} aria-label="홈페이지 목차">
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
  const [tickPlanId, setUrlPlanId] = useState<string | null>(null);
  const livePlanId = useSyncExternalStore(noSubscribe, readPlanId, noPlanId);
  const urlPlanId = tickPlanId ?? livePlanId;
  const workspaceTab = useSyncExternalStore(subscribeTab, readTab, noPlanId);
  useEffect(() => {
    try { if (localStorage.getItem(LIST_OPEN_KEY) === "0") setListOpen(false); } catch { /* 기본은 펼침 */ }
    const refresh = () => setTick(n => n + 1);
    const offState = subscribePlanState(refresh), offGeneration = subscribeGeneration(refresh);
    return () => { offState(); offGeneration(); };
  }, []);
  useEffect(() => { setUrlPlanId(new URLSearchParams(window.location.search).get("planId")); }, [pathname, tick]);

  const state = useMemo(() => (mounted ? loadState() : null), [mounted, tick, pathname]);
  const local = useMemo(() => (state?.plans ?? []).filter(plan => !isSamplePlan(plan.id)), [state]);
  /*
   * 서버 목록도 읽어 이 기기 저장본과 합친다(읽기만) — 예전엔 이 기기에 사업이 하나라도 있으면 서버를 보지 않아
   * 휴대폰에서 만든 사업이 PC 왼쪽 목록에 없었다. 처음 한 번, 그리고 지금 보는 사업이 목록에 없을 때 다시 읽는다.
   * hydrateFromServer 는 쓰지 않는다 — 화면이 부른 것과 겹치면 먼저 부른 쪽이 옛 상태를 받는다.
   * 못 불러오면 '사업 없음' 대신 안내를 보이고, 다음 화면 이동 때 다시 읽는다.
   */
  const [remote, setRemote] = useState<Plan[] | null>(null);
  const [remoteFailed, setRemoteFailed] = useState(false);
  /* 로그인하지 않았으면 '사업이 없어요' 대신 로그인 안내 — 본문은 '로그인하면 내 사업이 보여요'라고 하는데 왼쪽만 달랐다(2026-10-21 점검) */
  const [signedOut, setSignedOut] = useState(false);
  const [remoteTick, setRemoteTick] = useState(0);
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    fetch("/api/plan/state", { cache: "no-store" })
      .then(response => { if (!response.ok) throw new Error("PLAN_STATE_UNAVAILABLE"); return response.json(); })
      .then((data: { plans?: Plan[]; authenticated?: boolean }) => { if (!alive) return; setRemote((data?.plans ?? []).filter(plan => !isSamplePlan(plan.id))); setSignedOut(data?.authenticated === false); setRemoteFailed(false); })
      .catch(() => { if (alive) setRemoteFailed(true); });
    return () => { alive = false; };
  }, [mounted, remoteTick]);
  const plans = useMemo(() => {
    const byId = new Map<string, Plan>();
    for (const plan of [...(remote ?? []), ...local]) {
      const held = byId.get(plan.id);
      if (!held || plan.updatedAt.localeCompare(held.updatedAt) > 0) byId.set(plan.id, plan);
    }
    return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [local, remote]);
  const checked = remote !== null || (remoteFailed && local.length > 0);
  useEffect(() => { if (checked) onPlanCount?.(plans.length); }, [checked, plans.length, onPlanCount]);
  const step = stepFor(pathname, workspaceTab);
  /* 지금 화면이 보여 주는 사업 — 주소에 있으면 그것, 홈페이지처럼 주소에 없으면 작업 중인 사업 */
  const currentId = urlPlanId ?? (step ? state?.activePlanId ?? null : null);
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
      {remoteFailed && plans.length === 0 ? <p className={styles.empty}>사업 목록을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p>
        : checked && plans.length === 0 && <p className={styles.empty}>{signedOut ? "로그인하면 내 사업이 보여요." : "아직 사업이 없어요. 새 대화로 시작해 보세요."}</p>}
      {plans.map(plan => {
        const isCurrent = plan.id === currentId;
        const open = openId === undefined ? isCurrent : openId === plan.id;
        return <div key={plan.id} className={styles.plan}>
          <button type="button" className={styles.planRow} data-current={isCurrent || undefined} aria-expanded={open} title={plan.title} onClick={() => setOpenId(open ? null : plan.id)}>
            <ChevronRight className={styles.caret} data-open={open || undefined} aria-hidden="true" />
            <span>{plan.title || "이름 없는 사업"}</span>
          </button>
          {open && <PlanBranch plan={plan} here={isCurrent ? step : null} documentToc={documentToc} pathname={pathname} />}
        </div>;
      })}
    </div>}
  </div>;
}
