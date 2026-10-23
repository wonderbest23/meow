/*
 * 사업 작업실(/plan/studio) — 왼쪽은 대화, 오른쪽은 [사업계획서 | 홈페이지 | 사업 시작하기 | 유지보수] 탭.
 * 예전 화면 주소(/plan/chat · /plan/document · /plan/homepage · /plan/workspace)는 그대로 두고,
 * 작업실 안에서 그 주소로 가는 링크는 이동 대신 탭 바꾸기로 바꾼다(studioTarget).
 * 화면 코드에 기대지 않는 순수 함수만 둔다 — 테스트: scripts/studio-navigation.test.ts
 */
import type { JourneyStepId } from "./journey-steps";

export const STUDIO_TABS = ["chat", "plan", "homepage", "launch", "operations"] as const;
export type StudioTab = typeof STUDIO_TABS[number];

/** 작업실 입구를 여는 플래그 — 끄면 예전 화면 그대로(되돌리기는 플래그만 끄면 된다) */
export const STUDIO_ENABLED = process.env.NEXT_PUBLIC_STUDIO === "1";

export const STUDIO_PATH = "/plan/studio";

/** 탭 이름 — PC 오른쪽 탭과 칸 제목에 쓴다(휴대폰 탭은 더 짧게: Studio.tsx) */
export const STUDIO_TAB_LABELS: Record<StudioTab, string> = {
  chat: "대화",
  plan: "사업계획서",
  homepage: "홈페이지",
  launch: "사업 시작하기",
  operations: "유지보수",
};

export function isStudioTab(value: unknown): value is StudioTab {
  return typeof value === "string" && (STUDIO_TABS as readonly string[]).includes(value);
}

/** 왼쪽 메뉴의 단계(journey) ↔ 작업실 탭 */
const STEP_TAB: Record<JourneyStepId, StudioTab> = { chat: "chat", document: "plan", homepage: "homepage", launch: "launch", care: "operations" };
export function studioTabForStep(step: JourneyStepId): StudioTab { return STEP_TAB[step]; }
export function stepForStudioTab(tab: StudioTab): JourneyStepId {
  return (Object.keys(STEP_TAB) as JourneyStepId[]).find(step => STEP_TAB[step] === tab) ?? "chat";
}

/** 작업실 주소 — extra 는 각 칸이 읽는 값(edit · start · step 등)을 그대로 실어 나른다 */
export function studioHref(planId: string, tab: StudioTab = "chat", extra: Record<string, string> = {}, hash = ""): string {
  const params = new URLSearchParams({ planId, tab });
  for (const [key, value] of Object.entries(extra)) if (key !== "planId" && key !== "tab") params.set(key, value);
  return `${STUDIO_PATH}?${params.toString()}${hash && !hash.startsWith("#") ? `#${hash}` : hash}`;
}

export type StudioTarget = { tab: StudioTab; params: Record<string, string>; hash: string };

/** 사업 관리 화면의 탭 중 작업실 탭이 있는 것 — 사업 요약·문서 탭(summary · documents)은 작업실에 없어 예전 화면으로 간다 */
function workspaceTab(tab: string | null): StudioTab | null {
  if (tab === "operations") return "operations";
  if (tab === "launch" || tab === "action" || tab === null || tab === "") return "launch";
  return null;
}

/**
 * 같은 사업의 예전 화면 주소면 작업실 탭으로 바꾼다. 다른 사업 · 결제 · 계정 · 바깥 주소면 null(실제로 이동).
 * planId 가 없는 /plan/chat?new=1 처럼 새 사업을 여는 주소도 null 이다.
 */
export function studioTarget(href: string, planId: string, origin = "https://oneulstart.com"): StudioTarget | null {
  let url: URL;
  try { url = new URL(href, origin); } catch { return null; }
  if (url.origin !== new URL(origin).origin) return null;
  const target = url.searchParams.get("planId");
  if (!target || !planId || target !== planId) return null;
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => { if (key !== "planId" && key !== "tab") params[key] = value; });
  const hash = url.hash;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  switch (path) {
    case "/plan/chat": return { tab: "chat", params, hash };
    case "/plan/document": return { tab: "plan", params, hash };
    case "/plan/homepage": return { tab: "homepage", params, hash };
    case "/plan/workspace": {
      const tab = workspaceTab(url.searchParams.get("tab"));
      return tab ? { tab, params, hash } : null;
    }
    case STUDIO_PATH: {
      const tab = url.searchParams.get("tab");
      return { tab: isStudioTab(tab) ? tab : "chat", params, hash };
    }
    default: return null;
  }
}

/** 링크가 실어 오는 한 번용 값 — 탭을 바꿀 때 앞 링크의 것이 남지 않게 지운다(해시도) */
export const STUDIO_LINK_PARAMS = ["edit", "step", "start", "prompt"] as const;

/**
 * 탭을 바꾼 뒤의 작업실 주소(경로 + 쿼리 + 해시). 앞 링크가 실어 온 값(edit · step · start · prompt)과 해시는 지우고
 * 이번 링크의 값과 해시만 싣는다 — 탭을 그냥 누른 것(link 없음)이면 모두 지운다.
 * 단 대화 수정 모드(edit=chat)는 대화 칸이 계속 살아 있는 상태라, 이번 링크가 edit 를 새로 주지 않으면 그대로 둔다.
 */
export function studioSwitchUrl(current: string, tab: StudioTab, link?: { params?: Record<string, string>; hash?: string }): string {
  const url = new URL(current, "https://oneulstart.com");
  const chatEdit = url.searchParams.get("edit") === "chat";
  for (const key of STUDIO_LINK_PARAMS) url.searchParams.delete(key);
  url.searchParams.set("tab", tab);
  const params = link?.params ?? {};
  if (chatEdit && !("edit" in params)) url.searchParams.set("edit", "chat");
  for (const [key, value] of Object.entries(params)) if (key !== "planId" && key !== "tab") url.searchParams.set(key, value);
  url.hash = link?.hash ?? "";
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * 예전 화면 주소 → 같은 사업의 작업실 주소(입구 링크용). 주소에 사업이 없거나 작업실 탭이 없는 화면이면 null.
 * 예: /plan/document?planId=a&edit=facts#sec-2 → /plan/studio?planId=a&tab=plan&edit=facts#sec-2
 */
export function studioEntryHref(href: string, origin = "https://oneulstart.com"): string | null {
  let planId: string | null = null;
  try { planId = new URL(href, origin).searchParams.get("planId"); } catch { return null; }
  if (!planId) return null;
  const target = studioTarget(href, planId, origin);
  return target ? studioHref(planId, target.tab, target.params, target.hash) : null;
}
