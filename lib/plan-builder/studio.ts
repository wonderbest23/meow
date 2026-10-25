/*
 * 사업 작업실(/plan/studio) — 왼쪽은 대화, 오른쪽은 [사업계획서 | 홈페이지 | 개업 준비 | 유지보수] 탭.
 * 예전 화면 주소(/plan/chat · /plan/document · /plan/homepage · /plan/workspace)는 그대로 두고,
 * 작업실 안에서 그 주소로 가는 링크는 이동 대신 탭 바꾸기로 바꾼다(studioTarget).
 * 화면 코드에 기대지 않는 순수 함수만 둔다 — 테스트: scripts/studio-navigation.test.ts
 */
import { JOURNEY_LABELS, journeyLabel, journeyShortLabel, type JourneyStepId } from "./journey-steps";
import type { HomepageStatus, JourneyState } from "./journey";

export const STUDIO_TABS = ["chat", "plan", "homepage", "launch", "operations"] as const;
export type StudioTab = typeof STUDIO_TABS[number];

/** 작업실 입구를 여는 플래그 — 끄면 예전 화면 그대로(되돌리기는 플래그만 끄면 된다) */
export const STUDIO_ENABLED = process.env.NEXT_PUBLIC_STUDIO === "1";

export const STUDIO_PATH = "/plan/studio";

/*
 * 예전 화면(/plan/chat · /plan/document · /plan/homepage · /plan/workspace)을 작업실로 보내는지 — 플래그와 새 대화 화면(V2)이
 * 둘 다 켜졌을 때만. 새 대화 화면이 꺼져 있으면 작업실이 예전 대화로 되돌려 보내므로(Studio.tsx) 둘 다 봐야 서로 보내는 고리가 없다.
 */
export const STUDIO_REDIRECT = STUDIO_ENABLED && process.env.NEXT_PUBLIC_BUSINESS_INTAKE_V2 === "1";

/** 예전 화면 그대로 보기 — 주소에 ?classic=1 이 있으면 작업실로 보내지 않는다 */
export const STUDIO_CLASSIC_PARAM = "classic";

/** 탭 이름 — PC 오른쪽 탭과 칸 제목에 쓴다. 단계 이름(journey-steps.ts)을 그대로 쓴다(휴대폰 탭은 같은 이름의 짧은 꼴: Studio.tsx) */
export const STUDIO_TAB_LABELS: Record<StudioTab, string> = {
  chat: JOURNEY_LABELS.chat,
  plan: JOURNEY_LABELS.document,
  homepage: JOURNEY_LABELS.homepage,
  launch: JOURNEY_LABELS.launch,
  operations: JOURNEY_LABELS.care,
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
  /* classic(예전 화면 그대로 보기)은 작업실에서 뜻이 없어 싣지 않는다 */
  url.searchParams.forEach((value, key) => { if (key !== "planId" && key !== "tab" && key !== STUDIO_CLASSIC_PARAM) params[key] = value; });
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

/** 새 대화를 작업실에서 여는 주소 — 사업이 아직 없어 대화 칸만 열린다. extra 는 랜딩 아이디어(idea) · prompt · start 등 */
export function studioNewHref(extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ new: "1" });
  for (const [key, value] of Object.entries(extra)) if (key !== "planId" && key !== "tab" && key !== "new" && value) params.set(key, value);
  return `${STUDIO_PATH}?${params.toString()}`;
}

/** 새 대화 주소 — 작업실이 켜져 있으면 작업실의 새 대화, 아니면 예전 대화 화면(랜딩 입력칸 · '대화로 시작하기') */
export function newChatHref(idea = "", studio = STUDIO_REDIRECT): string {
  if (studio) return studioNewHref(idea ? { idea } : {});
  return idea ? `/plan/chat?new=1&idea=${encodeURIComponent(idea)}` : "/plan/chat?new=1";
}

/*
 * 첫 화면 '어떤 사업이든' 카드가 고른 시작 방식 — 새 대화의 첫 선택지(아이디어를 찾고 있어요 · 생각한 사업이 있어요 · 사업을 운영 중이에요)를
 * 대신 골라 준다(BusinessIntake 가 한 번 읽고 주소에서 지운다). 이름이 start 가 아닌 건 start=1(결제 뒤 작성 시작)과 겹치지 않게.
 */
export const ENTRY_PARAM = "entry";
export const ENTRY_MODES = ["exploring", "startup", "operating"] as const;
export type EntryMode = typeof ENTRY_MODES[number];
export function isEntryMode(value: unknown): value is EntryMode {
  return typeof value === "string" && (ENTRY_MODES as readonly string[]).includes(value);
}
/** 시작 방식을 골라 둔 새 대화 주소 */
export function newChatEntryHref(entry: EntryMode, studio = STUDIO_REDIRECT): string {
  if (studio) return studioNewHref({ [ENTRY_PARAM]: entry });
  return `/plan/chat?new=1&${ENTRY_PARAM}=${entry}`;
}

/**
 * 예전 화면 주소 → 그 화면 감싸기가 router.replace 로 보낼 작업실 주소. 보내지 않을 주소면 null.
 * - ?classic=1 이면 예전 화면 그대로(null)
 * - 사업 없는 /plan/chat(새 대화 · 이어 하기 · 랜딩 아이디어)은 작업실 새 대화로 — idea · prompt · start 등은 그대로 싣는다
 * - /plan/workspace 는 개업 준비 · 유지보수(tab=launch|operations|action)만. 탭 없는 주소는 사업 요약이 기본이라 보내지 않는다
 * - 결제 · 결과 · 메일 링크(start=1 · step=marketing · edit=facts · #sec-)는 해당 탭으로 그대로 이어진다(studioEntryHref)
 */
export function studioRedirectHref(href: string, origin = "https://oneulstart.com"): string | null {
  let url: URL;
  try { url = new URL(href, origin); } catch { return null; }
  if (url.searchParams.get(STUDIO_CLASSIC_PARAM) === "1") return null;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  if (path === "/plan/chat" && !url.searchParams.get("planId")) {
    const params = new URLSearchParams();
    url.searchParams.forEach((value, key) => { if (key !== "tab" && key !== "planId" && key !== STUDIO_CLASSIC_PARAM) params.set(key, value); });
    const query = params.toString();
    return `${STUDIO_PATH}${query ? `?${query}` : ""}${url.hash}`;
  }
  if (path === "/plan/workspace" && !["launch", "operations", "action"].includes(url.searchParams.get("tab") ?? "")) return null;
  if (!["/plan/chat", "/plan/document", "/plan/homepage", "/plan/workspace"].includes(path)) return null;
  return studioEntryHref(url.href, origin);
}

/* ── 작업실의 대화 완료와 막힌 탭 ───────────────────────── */

export type StudioChatInput = {
  /** 사업안(coach.design)이 만들어졌다 */
  design: boolean;
  /** 써 둔 계획서 장 수 */
  documents: number;
  /** 계획서를 쓰는 중이다 */
  running?: boolean;
  /** 핵심 질문을 다 답했다(대화 칸의 coreComplete) — 모르면 undefined */
  coreComplete?: boolean;
  /** 사업 방향을 정리하는 중(대화 칸이 알려 온 것 · 질문 수 묻기의 정리 작업) */
  designRunning?: boolean;
};

/**
 * 작업실에서 대화 단계를 '끝남'으로 보는 기준 — 사업안이 만들어졌거나, 계획서 장이 있거나(쓰는 중 포함), 핵심 질문을 다 답했을 때.
 * coach.ready 는 첫 답(사업)만 와도 켜져서(intake-core) 그것만 보면 질문 1/14 에서 '사업 방향 정리됨'·대화 ✓·계획서 탭이 열렸다
 * (점검 2026-10-23). 사업 목록의 '사업안 준비됨'(business-hub)과 같은 생각이다. 왼쪽 메뉴·예전 화면(journeySteps)은 그대로 둔다.
 * 핵심 질문을 다 답했어도 사업 방향을 정리하는 중이면 아직 대화 단계다 — 대화 칸은 '정리하고 있어요'인데 칩은 '대화 ✓ · 계획서(지금)'였다.
 */
export function studioChatComplete(input: StudioChatInput): boolean {
  return input.design || input.documents > 0 || !!input.running || !!input.coreComplete && !input.designRunning;
}

/** journeySteps 에 작업실의 대화 완료를 얹는다 — 끝났으면 대화 done(쓰는 중이면 계획서 active), 아니면 대화 active */
export function studioSteps<T extends { id: JourneyStepId; state: JourneyState }>(steps: readonly T[], chatComplete: boolean, running = false): T[] {
  return steps.map(step => {
    if (step.id === "chat") return { ...step, state: chatComplete ? "done" : "active" };
    if (running && step.id === "document" && step.state !== "done") return { ...step, state: "active" };
    return step;
  });
}

/**
 * 작업실 오른쪽 탭이 아직 막혔는지 — 막혔으면 안내할 단계(왼쪽 메뉴 LOCKED_GUIDE 의 키), 열렸으면 null.
 * 계획서·홈페이지는 앞 단계를 마쳐야(왼쪽 메뉴와 같은 규칙, steps 는 studioSteps 를 얹은 것), 개업 준비·유지보수는
 * 사업 관리 화면이 열려야(workspaceOpen — 작업실은 대화를 마쳤는지까지 함께 본다) 열린다.
 */
export function studioLockedStep(tab: StudioTab, steps: ReadonlyArray<{ id: JourneyStepId; state: JourneyState }>, workspaceOpen: boolean): Exclude<JourneyStepId, "chat"> | null {
  const step = stepForStudioTab(tab);
  if (step === "chat") return null;
  if (step === "care" || step === "launch") return workspaceOpen ? null : step;
  const index = steps.findIndex(item => item.id === step);
  if (index <= 0) return null;
  return steps[index].state !== "todo" || steps[index - 1].state === "done" ? null : step;
}

/* ── 머리줄 진행 단계와 부제 ───────────────────────────── */

/** 머리줄 진행 단계 — 대화 → 계획서 → 홈페이지 → 개업 준비(운영 중이면 운영 개선). 유지보수는 끝나는 단계가 아니라 넣지 않는다 */
export const STUDIO_PROGRESS_STEPS = ["chat", "document", "homepage", "launch"] as const satisfies readonly JourneyStepId[];
export type StudioProgressStep = typeof STUDIO_PROGRESS_STEPS[number];
export type StudioChip = { step: StudioProgressStep; tab: StudioTab; label: string; state: "done" | "current" | "upcoming" };

/**
 * 단계 칩 — 끝난 단계는 done, 지금 하는 단계(진행 중인 첫 단계, 없으면 아직 안 한 첫 단계)는 current, 나머지는 upcoming.
 * steps 가 없으면(새 대화 · 사업을 아직 못 불러옴) 대화가 지금 단계다.
 */
export function studioChips(steps: ReadonlyArray<{ id: JourneyStepId; state: JourneyState }> | null, operating = false): StudioChip[] {
  const state = (step: StudioProgressStep): JourneyState => steps?.find(item => item.id === step)?.state ?? (step === "chat" ? "active" : "todo");
  const current = STUDIO_PROGRESS_STEPS.find(step => state(step) === "active") ?? STUDIO_PROGRESS_STEPS.find(step => state(step) === "todo") ?? null;
  /* 머리줄은 자리가 좁아 같은 단계의 짧은 이름(계획서)을 쓴다 — journey-steps.ts */
  return STUDIO_PROGRESS_STEPS.map(step => ({ step, tab: studioTabForStep(step), label: journeyShortLabel(step, operating), state: state(step) === "done" ? "done" : step === current ? "current" : "upcoming" }));
}

export type StudioStatusInput = {
  /** 새 대화 — 아직 사업이 없다 */
  fresh?: boolean;
  /**
   * 주소의 사업을 아직 불러오는 중(steps 가 아직 없다) — 느린 연결에서 다 끝난 사업이 몇 초 동안 '대화 중'으로 보였다(점검 2026-10-23).
   * 그동안은 '불러오는 중'이라고만 한다. 새 대화(fresh)는 늘 '대화 중'.
   */
  loading?: boolean;
  steps: ReadonlyArray<{ id: JourneyStepId; state: JourneyState }> | null;
  /** 대화 질문 진행(핵심 질문 몇 개 중 몇 개) — 모르면 null */
  intake?: { answered: number; total: number; complete: boolean } | null;
  /** 대화 칸 맨 위 진행 줄이 질문 번호를 보이고 있다(작업실 PC) — 머리줄은 번호를 되풀이하지 않는다 */
  questionCount?: boolean;
  /** 대화 칸 작성 줄(PC)이나 계획서 칸 진행 카드가 작성한 항목 수를 보이고 있다 — 머리줄은 수를 되풀이하지 않는다 */
  generationCount?: boolean;
  /** 이번 계획서 작성 — active 는 아직 쓸 장이 남음, stalled 는 남은 채로 작업이 멈춤 */
  generation?: { done: number; total: number; active: boolean; stalled: boolean } | null;
  /** 이 기기 저장본의 계획서 장 수(작성 중이 아닐 때) */
  documents?: { done: number; total: number } | null;
  homepage: HomepageStatus;
  /** 개업 준비(운영 개선) — 진행 방식을 정했으면 configured */
  launch?: { done: number; total: number; configured: boolean } | null;
  operating?: boolean;
  /** 사업안(사업 방향 정리 결과)이 있는지 — 모르면 undefined(예전 문구 그대로) */
  design?: boolean;
  /** 사업 방향을 정리하는 중(대화 칸의 정리 작업이 도는 중) */
  designRunning?: boolean;
  /** 써 둔 계획서가 지금 답과 다르다(사업 목록의 '수정 내용 반영 필요'와 같은 기준) */
  stale?: boolean;
  /** 지금 보고 있는 칸(PC 는 오른쪽 칸) — 개업 준비 · 유지보수 칸에서는 그 진행을 말한다. 없으면 전체 진행 */
  tab?: StudioTab;
};

/**
 * 머리줄 부제(지금 무엇을 하고 있는지) — 예: '대화 중 · 질문 7/14'(지금 묻는 질문 번호), '사업 방향 정리 중', '사업계획서 만드는 중 · 6/10장',
 * '사업계획서 · 문서 완성', '홈페이지 · 공개 전', '개업 준비 · 3/9'. AI 를 부르지 않고 이미 있는 상태(journeySteps · 작성 진행 · 홈페이지 공개 여부)로만 정한다.
 * 여정 점검 2026-10-23: 사업 방향을 정리하는 중에 '사업 방향 정리됨', 다시 쓰는 중에 '완성', 개업 준비 칸에서 '홈페이지 · 공개 전'이 보였다 —
 * 사업안 유무 · 다시 쓰기 · 보고 있는 칸을 함께 본다. 계획서 상태 말은 사업 목록 카드와 같게('문서 완성' · '수정 내용 반영 필요').
 */
export function studioStatusText(input: StudioStatusInput): string {
  const { generation, intake, documents, homepage, launch, tab } = input;
  if (input.fresh) return "대화 중";
  if (!input.steps) return input.loading ? "불러오는 중" : "대화 중";
  /* 작성 단위는 장 안의 항목이다 — 대화 칸 '계획서 10개 항목을 썼어요' · 진행 카드와 같은 말(r37 점검: 머리줄만 '2/10장'이었다) */
  /* 같은 화면에 항목 수가 이미 보이면(PC 대화 칸 작성 줄 · 계획서 칸 진행 카드) 머리줄은 말만 — 768px 계획서 칸에서 '3/10'이 두 번 보였다(r40 점검) */
  if (generation?.active && !generation.stalled) return input.generationCount ? "사업계획서 만드는 중" : `사업계획서 만드는 중 · ${generation.done}/${generation.total} 항목`;
  if (generation?.active && generation.stalled) return `사업계획서 · ${generation.done}/${generation.total} 항목에서 멈춤`;
  const state = (id: JourneyStepId) => input.steps!.find(step => step.id === id)?.state ?? "todo";
  if (state("chat") !== "done") {
    /* 질문을 다 답해 정리를 시작했다 — 대화 단계는 정리가 끝날 때까지(studioChatComplete) 이어진다 */
    if (input.designRunning && !input.design) return "사업 방향 정리 중";
    if (!intake || intake.total <= 0) return "대화 중";
    /* 지금 묻는 질문 번호(답한 수 + 1) — 대화 칸의 '질문 11 / 14'와 같은 기준(10개 답했으면 11번째를 묻는 중) */
    if (intake.complete) return "대화 중 · 마무리";
    /* PC 는 바로 아래 대화 칸 진행 줄이 '10 / 14'를 보인다 — 머리줄까지 같은 번호가 두 번 보였다(PC 점검 2026-10-24) */
    return input.questionCount ? "대화 중" : `대화 중 · 질문 ${Math.min(intake.answered + 1, intake.total)}/${intake.total}`;
  }
  if (state("document") !== "done") {
    if (documents && documents.done > 0) return `사업계획서 · ${documents.done}/${documents.total} 항목`;
    /* 질문은 다 답했지만 사업안이 아직 없다 — 정리하는 중이거나(30~40초) 정리를 기다린다 */
    if (input.design === false) return input.designRunning ? "사업 방향 정리 중" : "대화 중 · 마무리";
    return "사업 방향 정리됨 · 계획서 만들 차례";
  }
  const launchName = journeyLabel("launch", !!input.operating);
  const launchDone = state("launch") === "done";
  const launchRunning = !!launch?.configured && !launchDone;
  const launchText = launchDone ? `${launchName} · 완료` : launchRunning ? `${launchName} · ${launch!.done}/${launch!.total}` : `${launchName} · 시작 전`;
  const documentText = input.stale ? "수정 내용 반영 필요" : "문서 완성";
  const homepageText = homepage === "draft" ? "홈페이지 · 공개 전" : homepage === "published" ? "홈페이지 · 공개 중" : "홈페이지 · 만들기 전";
  /*
   * 보고 있는 칸의 진행 — 유지보수 칸에서 '개업 준비 · 시작 전'이 보였다(감사 r36). 유지보수는 그 칸이 하는 일을 말한다.
   * 칸 안이 이미 말하는 상태는 머리줄에 되풀이하지 않는다(r37 글 점검) — 끝난 계획서('문서 완성'), 홈페이지 공개 여부(주소창 이름표),
   * 진행 중이거나 끝난 개업 준비(칸 안 '2 / 11')는 빈 글(머리줄 상태 줄을 숨긴다). 할 일이 남았을 때만 말한다.
   */
  if (tab === "operations") return `${JOURNEY_LABELS.care} · 실적과 개선 기록`;
  if (tab === "launch") return launchDone || launchRunning ? "" : launchText;
  if (tab === "homepage") return homepage === "draft" || homepage === "published" ? "" : homepageText;
  /* 칸 이름을 앞에 — '사업계획서 · 수정 내용 반영 필요'. 홈페이지 · 개업 준비 글은 이미 칸 이름으로 시작한다 */
  if (tab === "plan") return input.stale ? `${JOURNEY_LABELS.document} · ${documentText}` : "";
  /* 전체 진행(휴대폰 대화 탭 등) — 고칠 것이 남았으면 먼저, 그다음 지금 하는 단계 */
  if (input.stale) return documentText;
  if (homepage === "draft") return homepageText;
  if (launchRunning) return launchText;
  /* 공개한 뒤에는 진행 단계 칩의 '지금 단계'(개업 준비)와 같게 다음 할 일을 함께 말한다 */
  if (homepage === "published") return launchDone ? homepageText : `홈페이지 공개 중 · 다음은 ${launchName}`;
  return documentText;
}
