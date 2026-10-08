"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronRight, FolderClosed } from "lucide-react";
import { isSamplePlan, loadState, setActivePlan, subscribePlanState, type Plan } from "../../lib/plan-builder/plan-store";
import { subscribeGeneration } from "../../lib/plan-builder/generation-queue";
import { journeySteps, type JourneyStepId } from "../../lib/plan-builder/journey";
import { useHomepageStatus } from "./use-homepage";
import shell from "./PlanShell.module.css";
import menu from "./RailMenu.module.css";
import styles from "./BusinessRailTree.module.css";

/** 문서 화면이 왼쪽 메뉴에 넘겨 주는 자기 목차 — 누르면 그 장으로 넘어간다 */
export type DocumentToc = { planId: string; chapters: string[]; current: number | "all"; onSelect: (index: number | "all") => void };

const LIST_OPEN_KEY = "oneulstart:rail-plans-open";

/** 지금 화면이 네 단계 중 어디인지 */
function stepFor(pathname: string): JourneyStepId | null {
  if (pathname.startsWith("/plan/chat")) return "chat";
  if (pathname.startsWith("/plan/document")) return "document";
  if (pathname.startsWith("/plan/homepage")) return "homepage";
  if (pathname.startsWith("/plan/workspace")) return "care";
  return null;
}

/* 홈페이지 화면 안의 칸 — 누르면 그 자리로 내려간다 */
/* 홈페이지 화면의 번호(1~5)와 같은 순서 */
const HOMEPAGE_PARTS: Array<[string, string]> = [["hk-preview", "미리보기·에디터"], ["hk-contact", "손님 연락 방법"], ["hk-business", "사업자 정보"], ["hk-domain", "내 도메인 연결"], ["hk-leads", "문의 알림"]];
function jump(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** 사업 하나를 펼친 목차 — 대화 · 사업계획서 · 홈페이지 · 유지보수 */
function PlanBranch({ plan, here, documentToc, pathname }: { plan: Plan; here: JourneyStepId | null; documentToc?: DocumentToc; pathname: string }) {
  const homepage = useHomepageStatus(plan.id);
  const steps = journeySteps(plan, homepage);
  return <ol className={styles.steps}>
    {steps.map((step, index) => {
      const current = here === step.id;
      const reachable = step.state !== "todo" || index === 0 || steps[index - 1].state === "done";
      const body = <>
        <i aria-hidden="true" data-state={step.state}>{step.state === "done" ? <Check size={11} strokeWidth={3} /> : index + 1}</i>
        <span>{step.label}</span>
      </>;
      return <li key={step.id}>
        {reachable
          ? <Link className={styles.step} href={step.href} aria-current={current ? "page" : undefined} onClick={() => setActivePlan(plan.id)}>{body}</Link>
          : <span className={styles.step} aria-disabled="true" title="앞 단계를 마치면 열려요">{body}</span>}
        {/* 문서를 보고 있으면 그 문서의 목차를 바로 아래에 */}
        {step.id === "document" && current && documentToc?.planId === plan.id && documentToc.chapters.length > 0 && <ul className={styles.parts} aria-label="사업계획서 목차">
          {documentToc.chapters.map((name, chapter) => <li key={name}><button type="button" aria-current={documentToc.current === chapter ? "true" : undefined} onClick={() => documentToc.onSelect(chapter)}><b>{String(chapter + 1).padStart(2, "0")}</b>{name}</button></li>)}
          <li><button type="button" aria-current={documentToc.current === "all" ? "true" : undefined} onClick={() => documentToc.onSelect("all")}>전체 이어 읽기</button></li>
        </ul>}
        {step.id === "homepage" && current && pathname.startsWith("/plan/homepage") && <ul className={styles.parts} aria-label="홈페이지 목차">
          {HOMEPAGE_PARTS.map(([id, name], part) => <li key={id}><button type="button" onClick={() => jump(id)}><b>{part + 1}</b>{name}</button></li>)}
        </ul>}
      </li>;
    })}
  </ol>;
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

export default function BusinessRailTree({ documentToc }: { documentToc?: DocumentToc }) {
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
   * 이 기기에 저장된 사업이 없으면(새 기기에서 대화 주소로 바로 들어온 경우) 서버 목록을 읽기만 한다.
   * hydrateFromServer 는 쓰지 않는다 — 화면이 부른 것과 겹치면 먼저 부른 쪽이 옛 상태를 받는다.
   */
  const [remote, setRemote] = useState<Plan[] | null>(null);
  useEffect(() => {
    if (!mounted || local.length || remote) return;
    let alive = true;
    fetch("/api/plan/state", { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then((data: { plans?: Plan[] } | null) => { if (alive) setRemote((data?.plans ?? []).filter(plan => !isSamplePlan(plan.id))); })
      .catch(() => { if (alive) setRemote([]); });
    return () => { alive = false; };
  }, [mounted, local.length, remote]);
  const plans = useMemo(() => [...(local.length ? local : remote ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [local, remote]);
  const checked = local.length > 0 || remote !== null;
  const step = stepFor(pathname);
  /* 지금 화면이 보여 주는 사업 — 주소에 있으면 그것, 홈페이지처럼 주소에 없으면 작업 중인 사업 */
  const currentId = urlPlanId ?? (step ? state?.activePlanId ?? null : null);
  // 다른 사업 화면으로 옮기면 그 사업만 펼친 상태로 돌아간다.
  useEffect(() => { setOpenId(undefined); }, [currentId]);

  function toggleList() {
    const next = !listOpen;
    setListOpen(next);
    try { localStorage.setItem(LIST_OPEN_KEY, next ? "1" : "0"); } catch { /* 이번 화면에서만 */ }
  }

  return <div className={styles.tree}>
    <button type="button" className={`${shell.railBtn} ${menu.item} ${styles.head}`} aria-expanded={listOpen} aria-current={pathname === "/plan" || pathname === "/plan/" ? "page" : undefined} onClick={toggleList} title="내 사업">
      <FolderClosed /><span className={shell.railLabel}>내 사업</span>
      <ChevronRight className={styles.caret} data-open={listOpen || undefined} aria-hidden="true" />
    </button>
    {listOpen && mounted && <div className={styles.list}>
      {checked && plans.length === 0 && <p className={styles.empty}>아직 사업이 없어요. 새 대화로 시작해 보세요.</p>}
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
      {plans.length > 0 && <Link className={styles.all} href="/plan" aria-current={pathname === "/plan" || pathname === "/plan/" ? "page" : undefined}>모든 사업 한눈에 보기</Link>}
    </div>}
  </div>;
}
