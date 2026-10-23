"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BusinessAppChrome from "../BusinessAppChrome";
import PlanLoading from "../PlanLoading";
import { MissingBusinessBody } from "../MissingBusiness";
import { LOCKED_GUIDE } from "../BusinessRailTree";
import BusinessIntake from "../chat/BusinessIntake";
import { PlanDocumentBody } from "../document/PlanDocumentBody";
import { HomepageScreen } from "../homepage/HomepageScreen";
import { BusinessWorkspace } from "../workspace/BusinessWorkspace";
import { useHomepageStatus } from "../use-homepage";
import frame from "../chat/page.module.css";
import hub from "../BusinessHub.module.css";
import styles from "./Studio.module.css";
import { StudioNavContext, StudioPaneContext, type StudioNav, type StudioPane } from "./StudioContext";
import { hydrateFromServer, isSamplePlan, lastHydrationFailed, loadState, setActivePlan, subscribePlanState, subscribePlanTitle, type Plan } from "../../../lib/plan-builder/plan-store";
import { journeySteps, JOURNEY_ORDER, WORKSPACE_TAB_EVENT, type HomepageStatus } from "../../../lib/plan-builder/journey";
import { businessChatHref, shouldResumeBusinessChat } from "../../../lib/plan-builder/business-hub";
import { isStudioTab, stepForStudioTab, studioSwitchUrl, studioTabForStep, studioTarget, STUDIO_TAB_LABELS, type StudioTab, type StudioTarget } from "../../../lib/plan-builder/studio";
import { askConfirm } from "../../../components/confirm-dialog";
import StudioLoading from "./loading";

/*
 * 사업 작업실 — PC(1024px 이상)는 왼쪽 대화 칸 + 오른쪽 [사업계획서 | 홈페이지 | 사업 시작하기 | 유지보수] 탭,
 * 휴대폰·태블릿은 [대화 | 계획서 | 홈페이지 | 준비] 탭으로 한 칸씩 바꿔 본다.
 *
 * 각 칸은 처음 열 때 만들고 그 뒤로는 지우지 않고 숨기기만 한다(visibility:hidden + inert, 같은 크기로 겹쳐 둠) —
 * 대화 입력이나 홈페이지에서 고치던 내용이 탭을 바꿔도 남는다. display:none 이면 크기가 0이 되어 홈페이지 편집기와
 * 대화 자동 스크롤(ResizeObserver)의 크기 계산이 깨진다.
 * 홈페이지 칸은 그 탭을 처음 열 때까지 만들지 않는다 — 열리는 순간 홈페이지를 만들고 AI 자동 채우기를 시작한다.
 */

type RightTab = Exclude<StudioTab, "chat">;
type PrepTab = "launch" | "operations";
type Lock = { message: string; back: StudioTab; label: string };
type SelectOptions = { focus?: "heading"; link?: { params: Record<string, string>; hash: string } };

const RIGHT_TABS: RightTab[] = ["plan", "homepage", "launch", "operations"];
/* 휴대폰 탭은 짧게 — '준비' 안에서 시작하기·유지보수를 고른다 */
const NARROW_TABS = ["chat", "plan", "homepage", "prep"] as const;
type NarrowTab = typeof NARROW_TABS[number];
const NARROW_LABELS: Record<NarrowTab, string> = { chat: "대화", plan: "계획서", homepage: "홈페이지", prep: "준비" };
const LEAVE_MESSAGE = "저장하지 않은 수정이 있어요. 이 화면을 나가면 고친 내용이 사라져요. 나갈까요?";

/* 화면 폭 — CSS 의 1024px 기준과 같다(칸을 만들고 inert 를 거는 판단에 쓴다) */
const WIDE_QUERY = "(min-width: 1024px)";
const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readWide = () => window.matchMedia(WIDE_QUERY).matches;
const serverWide = () => false;

/*
 * 아직 갈 수 없는 단계 — 왼쪽 메뉴(BusinessRailTree)와 같은 규칙·같은 문구. 막힌 탭은 칸을 만들지 않고 안내만 보인다
 * (막힌 홈페이지 칸을 만들면 쓰지도 않을 홈페이지와 AI 비용이 생긴다).
 */
function lockFor(tab: StudioTab, plan: Plan | null, homepage: HomepageStatus): Lock | null {
  if (tab === "chat" || !plan || isSamplePlan(plan.id)) return null;
  const step = stepForStudioTab(tab);
  if (step === "chat") return null;
  const steps = journeySteps(plan, homepage);
  const index = steps.findIndex(item => item.id === step);
  const reachable = step === "care" || step === "launch"
    ? !shouldResumeBusinessChat(plan)
    : steps[index].state !== "todo" || index === 0 || steps[index - 1].state === "done";
  if (reachable) return null;
  const guide = LOCKED_GUIDE[step];
  return { message: guide.message, back: studioTabForStep(JOURNEY_ORDER[guide.back]), label: guide.label };
}

/* 이 기기 저장본과 서버 것 중 나중에 저장한 쪽 — 대화는 서버에만 저장해 이 기기 저장본이 늦을 수 있다 */
function newer(a: Plan | null, b: Plan | null): Plan | null {
  if (!a) return b;
  if (!b) return a;
  return (b.updatedAt || "").localeCompare(a.updatedAt || "") > 0 ? b : a;
}

export default function Studio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId") ?? "";
  const urlTab = searchParams.get("tab");
  const intakeV2 = process.env.NEXT_PUBLIC_BUSINESS_INTAKE_V2 === "1";

  /* 주소에 사업이 없으면 새 대화로(새 대화를 작업실에서 시작하는 것은 2단계), 새 대화 화면이 꺼져 있으면 예전 대화로 */
  useEffect(() => {
    if (!intakeV2) router.replace(planId ? businessChatHref(planId) : "/plan/chat");
    else if (!planId) router.replace("/plan/chat?new=1");
  }, [intakeV2, planId, router]);

  /* ── 탭 ─────────────────────────────────────────────── */
  const [tab, setTab] = useState<StudioTab>(() => (isStudioTab(urlTab) ? urlTab : "chat"));
  /* 주소의 탭이 바뀌면(뒤로 가기·다른 곳의 replaceState) 따라간다 — 탭이 빠진 주소는 지금 탭 그대로 */
  const seenUrlTab = useRef(urlTab);
  useEffect(() => {
    if (seenUrlTab.current === urlTab) return;
    seenUrlTab.current = urlTab;
    if (isStudioTab(urlTab)) setTab(urlTab);
  }, [urlTab]);
  /* PC 에서 주소 탭이 '대화'일 때 오른쪽에 보일 칸 — 마지막으로 연 오른쪽 탭(처음엔 사업계획서) */
  const [lastRight, setLastRight] = useState<RightTab>(() => (isStudioTab(urlTab) && urlTab !== "chat" ? urlTab : "plan"));
  const [lastPrep, setLastPrep] = useState<PrepTab>(() => (urlTab === "operations" ? "operations" : "launch"));
  useEffect(() => {
    if (tab !== "chat") setLastRight(tab);
    if (tab === "launch" || tab === "operations") setLastPrep(tab);
  }, [tab]);
  const rightTab: RightTab = tab === "chat" ? lastRight : tab;
  const wide = useSyncExternalStore(subscribeWide, readWide, serverWide);

  const headings = useRef<Partial<Record<StudioTab, HTMLHeadingElement | null>>>({});
  const tabButtons = useRef<Record<string, HTMLButtonElement | null>>({});

  /* 링크로 칸을 열 때마다 그 칸의 이동 번호를 올린다 — 이미 보이는 칸도 주소의 edit · #sec- 를 다시 읽는다(useStudioPane().nav) */
  const [navSeq, setNavSeq] = useState<Partial<Record<StudioTab, number>>>({});

  const selectTab = useCallback((next: StudioTab, options: SelectOptions = {}) => {
    /*
     * 주소는 replaceState 로(기록을 쌓지 않음). 앞 링크가 실어 온 값(edit · step · start)과 해시는 지우고,
     * 링크로 온 것이면 그 링크의 값과 해시만 싣는다 — 탭을 그냥 누르면 모두 지운다(studioSwitchUrl).
     */
    const nextUrl = studioSwitchUrl(window.location.href, next, options.link);
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      seenUrlTab.current = next;
      window.history.replaceState(null, "", nextUrl);
      if (options.link?.hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
    if (options.link) setNavSeq(seq => ({ ...seq, [next]: (seq[next] ?? 0) + 1 }));
    setTab(next);
    /* 왼쪽 메뉴(서랍)가 지금 탭을 다시 표시한다 */
    window.dispatchEvent(new Event(WORKSPACE_TAB_EVENT));
    /*
     * 누른 것이면 칸 제목으로 초점을 옮긴다(칸 제목은 칸을 만들기 전에도 있다). 링크로 온 #자리가 이미 그려져 있으면 그리로 —
     * 계획서의 #sec- 는 그 장이 아직 안 그려졌을 수 있어 계획서 칸이 이동 번호(nav)를 보고 장을 바꾼 뒤 옮긴다.
     */
    if (options.focus === "heading") requestAnimationFrame(() => {
      headings.current[next]?.focus({ preventScroll: true });
      const hash = options.link?.hash.replace(/^#/, "");
      if (hash) document.getElementById(decodeURIComponent(hash))?.scrollIntoView({ block: "start" });
    });
  }, []);

  /* ── 사업 불러오기 — 작업실이 한 번 불러온 뒤에 오른쪽 칸을 만든다(동시에 부르면 먼저 부른 칸이 옛 저장본을 받는다) ── */
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState("");
  useEffect(() => {
    if (!planId || !intakeV2) return;
    let alive = true;
    hydrateFromServer().catch(() => loadState()).then(state => {
      if (!alive) return;
      const found = state.plans.find(item => item.id === planId) ?? null;
      if (found) setActivePlan(planId);
      setPlan(found);
      setTitle(found?.title ?? "");
      setMissing(!found && !lastHydrationFailed() && !isSamplePlan(planId));
      setReady(true);
    });
    return () => { alive = false; };
  }, [planId, intakeV2]);
  /* 다른 칸이 이 기기 저장본을 고치면 다시 읽는다(잠김 판단·제목) */
  useEffect(() => subscribePlanState(() => {
    const found = loadState().plans.find(item => item.id === planId) ?? null;
    if (found) setPlan(current => newer(current, found));
  }), [planId]);
  useEffect(() => subscribePlanTitle(notice => { if (notice.planId === planId) setTitle(notice.title); }), [planId]);
  /*
   * 대화가 끝나거나 작성을 시작하면, 또 막힌 탭을 누르면 서버 것을 읽기만 해서 잠김을 다시 판단한다 —
   * hydrateFromServer 를 또 부르면 칸들이 부른 것과 겹쳐 먼저 부른 쪽이 옛 저장본을 받는다.
   */
  const refreshing = useRef(false);
  const refreshPlan = useCallback(() => {
    if (!planId || refreshing.current) return;
    refreshing.current = true;
    fetch("/api/plan/state", { cache: "no-store" })
      .then(response => (response.ok ? response.json() : null))
      .then((data: { plans?: Plan[] } | null) => {
        const found = data?.plans?.find(item => item.id === planId) ?? null;
        if (!found) return;
        setPlan(current => newer(current, found));
        setMissing(false);
      })
      .catch(() => { /* 다음에 다시 확인한다 */ })
      .finally(() => { refreshing.current = false; });
  }, [planId]);

  const homepage = useHomepageStatus(planId || null);
  const locks = useMemo(() => {
    const result: Partial<Record<StudioTab, Lock | null>> = {};
    for (const id of RIGHT_TABS) result[id] = lockFor(id, plan, homepage);
    return result;
  }, [plan, homepage]);

  /* 막힌 탭을 보고 있으면 서버 것을 다시 확인한다(대화로 방향을 정한 직후 등) */
  const visibleRight: RightTab | null = wide || tab !== "chat" ? rightTab : null;
  const visibleLocked = !!(visibleRight && locks[visibleRight]);
  useEffect(() => { if (ready && visibleLocked) refreshPlan(); }, [ready, visibleLocked, visibleRight, refreshPlan]);

  /* 처음 보이는 칸만 만든다 — 한 번 만든 칸은 지우지 않는다(한 번에 한 칸씩 만들어져 사업 관리 칸 둘이 동시에 불러오지 않는다) */
  const [mounted, setMounted] = useState<RightTab[]>([]);
  if (ready && !missing && visibleRight && !locks[visibleRight] && !mounted.includes(visibleRight)) setMounted([...mounted, visibleRight]);

  /* ── 저장 안 한 수정과 이동 ───────────────────────────── */
  const dirty = useRef(new Map<string, string | undefined>());
  const confirmLeave = useCallback(async () => {
    if (!dirty.current.size) return true;
    const message = [...dirty.current.values()].find(Boolean) ?? LEAVE_MESSAGE;
    const ok = await askConfirm({ message, confirmLabel: "나가기", cancelLabel: "계속 고치기" });
    if (ok) dirty.current.clear();
    return ok;
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (!dirty.current.size) return; event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const openTarget = useCallback((target: StudioTarget) => {
    selectTab(target.tab, { focus: "heading", link: { params: target.params, hash: target.hash } });
  }, [selectTab]);
  const nav = useMemo<StudioNav>(() => {
    const go = (href: string, mode: "push" | "replace") => {
      const target = studioTarget(href, planId, window.location.origin);
      if (target) { openTarget(target); return; }
      void confirmLeave().then(ok => { if (ok) (mode === "push" ? router.push(href) : router.replace(href)); });
    };
    return {
      push: href => go(href, "push"),
      replace: href => go(href, "replace"),
      setDirty: (id, isDirty, message) => {
        if (isDirty) dirty.current.set(id, message);
        else dirty.current.delete(id);
      },
    };
  }, [planId, openTarget, confirmLeave, router]);

  /*
   * 이 사업의 다른 화면으로 가는 링크는 이동 대신 탭 바꾸기 — 대화·계획서 안의 고정 링크를 하나하나 고치지 않아도 된다.
   * 캡처 단계에서 기본 동작을 막으면 Next 의 Link 는 이동하지 않는다. 작업실 밖으로 나가는 링크(뒤로·서랍·내 사업)는
   * 저장 안 한 수정이 있으면 한 번만 묻는다.
   */
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
    let url: URL;
    try { url = new URL(anchor.href, window.location.href); } catch { return; }
    if (url.origin !== window.location.origin) return;
    const here = window.location;
    /* 같은 화면 안의 # 이동(목차 등)은 그대로 */
    if (url.pathname === here.pathname && url.search === here.search && url.hash) return;
    const target = studioTarget(url.href, planId, here.origin);
    if (target) { event.preventDefault(); openTarget(target); return; }
    if (!dirty.current.size) return;
    event.preventDefault();
    const href = `${url.pathname}${url.search}${url.hash}`;
    void confirmLeave().then(ok => { if (ok) router.push(href); });
  };

  /* ── 탭 줄 ─────────────────────────────────────────── */
  const narrowSelected: NarrowTab = tab === "launch" || tab === "operations" ? "prep" : tab;
  const narrowTarget = (item: NarrowTab): StudioTab => (item === "prep" ? lastPrep : item);
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>, items: readonly string[], current: string, toTab: (item: string) => StudioTab) => {
    const index = items.indexOf(current);
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % items.length
      : event.key === "ArrowLeft" ? (index - 1 + items.length) % items.length
      : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const item = items[nextIndex];
    selectTab(toTab(item));
    requestAnimationFrame(() => tabButtons.current[item]?.focus());
  };

  const panelId = (id: StudioTab) => `studio-panel-${id}`;
  const tabId = (id: string) => `studio-tab-${id}`;
  /* 칸을 가리키는 탭 — PC 는 칸마다 탭, 휴대폰은 시작하기·유지보수가 '준비' 하나 */
  const labelledBy = (id: StudioTab) => (wide ? (id === "chat" ? undefined : tabId(id)) : tabId(id === "launch" || id === "operations" ? "prep" : id));

  if (!intakeV2 || !planId) return <StudioLoading />;

  const chatVisible = wide || tab === "chat";
  const rightVisible = wide || tab !== "chat";
  const businessTitle = title || plan?.title || "사업 작업실";
  const headingRef = (id: StudioTab) => (node: HTMLHeadingElement | null) => { headings.current[id] = node; };

  const rightBody = (id: RightTab): ReactNode => {
    const lock = locks[id];
    if (!ready) return <PlanLoading variant="compact" note="사업을 불러오고 있어요" />;
    if (!mounted.includes(id)) {
      if (lock) return <div className={styles.locked}>
        <p>{lock.message}</p>
        <button type="button" onClick={() => selectTab(lock.back, { focus: "heading" })}>{lock.label}</button>
      </div>;
      return null;
    }
    if (id === "plan") return <PlanDocumentBody />;
    if (id === "homepage") return <HomepageScreen />;
    return <BusinessWorkspace view={id} />;
  };

  return <StudioNavContext.Provider value={nav}>
    <main className={`${frame.page} ${styles.page}`} onClickCapture={onClickCapture}>
      <BusinessAppChrome title={businessTitle} showRail={false} backHref="/plan" active="plans">
        {/* 주소의 사업을 찾지 못했으면 칸마다 따로 알리지 않고(왼쪽·오른쪽 두 번 보였다) 작업실에서 한 번만 */}
        {missing ? <div className={hub.scroll}><div className={hub.content}><MissingBusinessBody /></div></div> : <div className={styles.studio} data-wide={wide || undefined}>
          {!wide && <div className={styles.narrowTabs} role="tablist" aria-label="작업실 보기" onKeyDown={event => onTabKey(event, NARROW_TABS, narrowSelected, item => narrowTarget(item as NarrowTab))}>
            {NARROW_TABS.map(item => {
              const selected = narrowSelected === item;
              return <button key={item} ref={node => { tabButtons.current[item] = node; }} type="button" role="tab" id={tabId(item)} aria-selected={selected} aria-controls={panelId(narrowTarget(item))} tabIndex={selected ? 0 : -1} onClick={() => selectTab(narrowTarget(item), { focus: "heading" })}>{NARROW_LABELS[item]}</button>;
            })}
          </div>}

          <Pane id="chat" planId={planId} visible={chatVisible} nav={navSeq.chat ?? 0} className={styles.chatCol} role={wide ? undefined : "tabpanel"} labelledBy={labelledBy("chat")} headingRef={headingRef("chat")}>
            <BusinessIntake onPrepared={refreshPlan} onDesignComplete={refreshPlan} />
          </Pane>

          <div className={styles.rightCol} data-visible={rightVisible || undefined} inert={!rightVisible}>
            {wide && <div className={styles.wideTabs} role="tablist" aria-label="작업실 보기" onKeyDown={event => onTabKey(event, RIGHT_TABS, rightTab, item => item as RightTab)}>
              {RIGHT_TABS.map(item => {
                const selected = rightTab === item;
                return <button key={item} ref={node => { tabButtons.current[item] = node; }} type="button" role="tab" id={tabId(item)} aria-selected={selected} aria-controls={panelId(item)} tabIndex={selected ? 0 : -1} onClick={() => selectTab(item, { focus: "heading" })}>{item === "launch" && plan ? launchLabel(plan) : STUDIO_TAB_LABELS[item]}</button>;
              })}
            </div>}
            {!wide && (rightTab === "launch" || rightTab === "operations") && <div className={styles.prepSwitch} role="group" aria-label="준비 보기">
              {(["launch", "operations"] as const).map(item => <button key={item} type="button" aria-pressed={rightTab === item} onClick={() => selectTab(item, { focus: "heading" })}>{item === "launch" ? (plan ? launchLabel(plan) : "사업 시작하기") : "유지보수"}</button>)}
            </div>}
            <div className={styles.panes}>
              {RIGHT_TABS.map(id => <Pane key={id} id={id} planId={planId} visible={rightVisible && rightTab === id} nav={navSeq[id] ?? 0} className={styles.pane} role="tabpanel" labelledBy={labelledBy(id)} headingRef={headingRef(id)}>
                {rightBody(id)}
              </Pane>)}
            </div>
          </div>
        </div>}
      </BusinessAppChrome>
    </main>
  </StudioNavContext.Provider>;
}

/* 운영 중인 사업은 4단계 이름이 '운영 개선하기'(journeySteps 와 같은 이름) */
function launchLabel(plan: Plan): string {
  return journeySteps(plan, null).find(step => step.id === "launch")?.label ?? STUDIO_TAB_LABELS.launch;
}

/** 칸 하나 — 칸 제목(낭독기용, 탭을 바꾸면 초점이 온다)과 이 칸의 작업실 정보(useStudioPane) */
function Pane({ id, planId, visible, nav, className, role, labelledBy, headingRef, children }: {
  id: StudioTab; planId: string; visible: boolean; nav: number; className: string; role?: "tabpanel"; labelledBy?: string;
  headingRef: (node: HTMLHeadingElement | null) => void; children: ReactNode;
}) {
  const value = useMemo<StudioPane>(() => ({ planId, tab: id, active: visible, nav }), [planId, id, visible, nav]);
  return <section className={className} id={`studio-panel-${id}`} role={role} aria-labelledby={role ? labelledBy : undefined} aria-label={role ? undefined : STUDIO_TAB_LABELS[id]} data-visible={visible || undefined} inert={!visible}>
    <h2 ref={headingRef} className={styles.paneHeading} tabIndex={-1}>{STUDIO_TAB_LABELS[id]}</h2>
    {/* 칸 본문 자리 — 이것만 칸 높이를 채운다(안의 아무 요소나 늘리면 단추·안내가 칸 높이만큼 늘어났다) */}
    <div className={styles.paneBody}><StudioPaneContext.Provider value={value}>{children}</StudioPaneContext.Provider></div>
  </section>;
}
