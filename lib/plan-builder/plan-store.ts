// 플랜 빌더 클라이언트 스토어 — 사업 1개 + 플랜 여러 개 구조.
// 로컬(localStorage) 캐시 + 서버(plan_states) 동기화.

import { chaptersForType, sectionKey, type PlanSectionStatus } from "./blueprint";
import { SAMPLE_DOCS, isSampleId } from "./samples";

export function isSamplePlan(planId: string | null | undefined): boolean {
  return isSampleId(planId ?? null);
}

const KEY = "oneul-plan-demo-v1";

export interface StoredSection {
  markdown: string;
  html: string;
  generatedAt: string;
  /** 사용자가 직접 손댄 본문인지 — 다시 생성할 때 경고한다 */
  edited?: boolean;
  /** 잠금. 켜져 있으면 다시 생성이 덮어쓰지 못한다 */
  locked?: boolean;
  /** 덮어쓰기 직전 본문 — 한 번은 되돌릴 수 있게 */
  previous?: { markdown: string; html: string };
}

/** 사업 정보 — 모든 플랜·섹션의 공통 맥락. 사업은 하나만 유지한다. */
export interface BusinessProfile {
  name: string;
  description: string;
  role: string;
  industry: string;
  region: string;
  stage: string;
}

export const EMPTY_BUSINESS: BusinessProfile = {
  name: "",
  description: "",
  role: "",
  industry: "",
  region: "",
  stage: "",
};

/** 개별 플랜 — 하나의 사업 아래 여러 개 만들 수 있다. */
export interface Plan {
  id: string;
  title: string;
  planType: string;
  createdAt: string;
  updatedAt: string;
  sections: Record<string, StoredSection>; // key = `${chapterId}/${sectionId}`
  /** 섹션별 질문 답변 (생성 전에도 보존) */
  answers: Record<string, Record<string, unknown>>;
  /** 답변을 이어받아 만든 플랜이면 출처 — 화면이 "왜 미리 채워져 있는지" 설명하는 데 쓴다 */
  inheritedFrom?: { title: string; count: number };
}

export interface PlanState {
  business: BusinessProfile;
  plans: Plan[];
  /** 현재 작업 중인 플랜 id */
  activePlanId: string | null;
}

const EMPTY_STATE: PlanState = {
  business: { ...EMPTY_BUSINESS },
  plans: [],
  activePlanId: null,
};

function newId(): string {
  return `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 구버전(플랜 1개) 데이터를 새 구조로 옮긴다. */
function migrate(parsed: Record<string, unknown>): PlanState {
  // 이미 새 구조
  if (Array.isArray(parsed.plans)) {
    const plans = (parsed.plans as Plan[]).map((p) => ({
      id: p.id || newId(),
      title: p.title || "새 플랜",
      planType: p.planType || "창업 초기 · 사업계획서",
      createdAt: p.createdAt || new Date().toISOString(),
      updatedAt: p.updatedAt || new Date().toISOString(),
      sections: p.sections || {},
      answers: p.answers || {},
      ...(p.inheritedFrom ? { inheritedFrom: p.inheritedFrom } : {}),
    }));
    return {
      business: { ...EMPTY_BUSINESS, ...((parsed.business as Partial<BusinessProfile>) || {}) },
      plans,
      activePlanId: (parsed.activePlanId as string) || plans[0]?.id || null,
    };
  }
  // 구버전: title/planType/sections가 최상위에 있던 형태
  const hasOld = parsed.title || parsed.sections;
  if (!hasOld) return { ...EMPTY_STATE, business: { ...EMPTY_BUSINESS } };
  const now = new Date().toISOString();
  const plan: Plan = {
    id: newId(),
    title: (parsed.title as string) || "새 플랜",
    planType: (parsed.planType as string) || "창업 초기 · 사업계획서",
    createdAt: now,
    updatedAt: now,
    sections: (parsed.sections as Record<string, StoredSection>) || {},
    answers: {},
  };
  return {
    business: { ...EMPTY_BUSINESS, ...((parsed.business as Partial<BusinessProfile>) || {}) },
    plans: [plan],
    activePlanId: plan.id,
  };
}

/** 샘플 3종을 Plan 모양으로 — 항상 목록 뒤에 붙는 읽기 전용 문서 */
function samplePlans(): Plan[] {
  return SAMPLE_DOCS.map((d) => ({
    id: d.id,
    title: d.title,
    planType: d.planType,
    createdAt: "2026-01-15T09:00:00.000Z",
    updatedAt: "2026-01-15T09:00:00.000Z",
    sections: Object.fromEntries(
      Object.entries(d.sections).map(([k, v]) => [k, { markdown: v.markdown, html: v.html, generatedAt: "2026-01-15T09:00:00.000Z", locked: true }]),
    ),
    answers: d.answers,
  }));
}

function withSamples(state: PlanState): PlanState {
  const own = state.plans.filter((p) => !isSamplePlan(p.id));
  return { ...state, plans: [...own, ...samplePlans()] };
}

export function loadState(): PlanState {
  if (typeof window === "undefined") return withSamples({ ...EMPTY_STATE, business: { ...EMPTY_BUSINESS } });
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return withSamples({ ...EMPTY_STATE, business: { ...EMPTY_BUSINESS } });
    return withSamples(migrate(JSON.parse(raw) as Record<string, unknown>));
  } catch {
    return withSamples({ ...EMPTY_STATE, business: { ...EMPTY_BUSINESS } });
  }
}

function persist(state: PlanState) {
  if (typeof window === "undefined") return;
  try {
    // 샘플은 화면에만 존재한다 — 저장소에 남기지 않는다
    const clean = { ...state, plans: state.plans.filter((p) => !isSamplePlan(p.id)) };
    window.localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // ignore quota errors
  }
}

/**
 * 현재 활성 플랜 (없으면 null).
 *
 * 활성 id를 잃었을 때 예시 플랜으로 넘어가면 안 된다 — 남의 사업 내용이
 * AI 추천과 본문 생성의 맥락으로 들어간다(꽃집 답변이 싱크대 사업에 나왔다).
 * 내 플랜 중에서만 고르고, 하나도 없을 때만 예시를 본다.
 */
export function activePlan(state?: PlanState): Plan | null {
  const s = state ?? loadState();
  const own = s.plans.filter((p) => !isSamplePlan(p.id));
  const byId = s.activePlanId ? s.plans.find((p) => p.id === s.activePlanId) : undefined;
  if (byId) return byId;
  return own[0] ?? s.plans[0] ?? null;
}

/*
 * 직전에 로그인 상태였는지 기억한다.
 * 로컬 캐시를 지울지 판단하는 유일한 근거 — '로그인했다가 풀린 경우'와
 * '처음부터 로그인하지 않은 경우'를 구분하지 못하면 남의 글을 지우게 된다.
 */
const AUTH_FLAG = "oneul-plan-authed";

function readAuthFlag(): boolean {
  try {
    return localStorage.getItem(AUTH_FLAG) === "1";
  } catch {
    return false;
  }
}

function writeAuthFlag(value: boolean) {
  try {
    localStorage.setItem(AUTH_FLAG, value ? "1" : "0");
  } catch {
    /* 무해 */
  }
}

/** 로그아웃 시 로컬 캐시 제거 — 다음 사용자에게 이전 계정의 플랜이 보이면 안 된다 */
export function clearLocalState() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/** 사업 정보 저장 (플랜은 유지) */
export function saveBusiness(business: BusinessProfile) {
  const s = loadState();
  s.business = business;
  persist(s);
  void pushToServer();
}

/**
 * 새 플랜 추가 후 활성화 → 생성된 id 반환.
 *
 * 답변은 가장 최근에 손댄 플랜에서 물려받는다. 같은 사업으로 유형만 바꿔
 * 두 번째 플랜을 만들 때, 판매가·고정비·고객 같은 사실 답변을 처음부터
 * 다시 묻지 않기 위해서다. 생성된 본문(sections)은 물려받지 않는다 —
 * 유형이 다르면 같은 답이라도 글이 달라야 하므로 새로 생성한다.
 */
/** 실제로 채워진 답변 수 — 빈 문자열·빈 배열·초기화로 남은 빈 섹션은 세지 않는다 */
function realAnswerCount(p: Plan): number {
  return Object.values(p.answers ?? {}).reduce((n, sec) => {
    return (
      n +
      Object.values(sec ?? {}).filter(
        (v) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0),
      ).length
    );
  }, 0);
}

/** 답변을 물려줄 플랜 — 진짜 답변이 1개 이상 있는 것 중 가장 최근 */
function pickDonor(s: PlanState): Plan | undefined {
  return s.plans
    .filter((p) => !isSamplePlan(p.id) && realAnswerCount(p) > 0)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0];
}

export function createPlan(planType: string, title?: string, opts?: { inheritAnswers?: boolean }): string {
  const s = loadState();
  const now = new Date().toISOString();
  const donor = opts?.inheritAnswers === false ? undefined : pickDonor(s);
  const inherited: Plan["answers"] = donor ? JSON.parse(JSON.stringify(donor.answers)) : {};
  const plan: Plan = {
    id: newId(),
    title: title || s.business.name || "새 플랜",
    planType,
    createdAt: now,
    updatedAt: now,
    sections: {},
    answers: inherited,
    ...(donor ? { inheritedFrom: { title: donor.title, count: realAnswerCount(donor) } } : {}),
  };
  s.plans.push(plan);
  s.activePlanId = plan.id;
  persist(s);
  void pushToServer();
  return plan.id;
}

/** 답변을 물려줄 수 있는 기존 플랜(가장 최근) — 새 플랜 만들 때 선택지를 보여줄지 판단용 */
export function answerDonor(): { title: string; planType: string; count: number } | null {
  const donor = pickDonor(loadState());
  if (!donor) return null;
  return { title: donor.title, planType: donor.planType, count: realAnswerCount(donor) };
}

/**
 * 예시(샘플) 플랜은 저장 대상이 아니다.
 * 모든 쓰기 함수(답변·본문·잠금·되돌리기·이름·복제·삭제)가 여기서 먼저 걸러진다 —
 * 화면에서 버튼을 감추는 것과 별개로, 저장 계층에서 한 번 더 막는다.
 */
function readOnlyPlan(planId: string | null | undefined): boolean {
  return isSamplePlan(planId);
}

/** 작업할 플랜 전환 — 샘플도 열람은 가능하다(저장·전송에서는 걷어낸다) */
export function setActivePlan(planId: string) {
  const s = loadState();
  if (!s.plans.some((p) => p.id === planId)) return;
  s.activePlanId = planId;
  persist(s);
  if (!isSamplePlan(planId)) void pushToServer();
}

/** 플랜 삭제 — 서버는 병합 저장이라, 삭제는 명시적 DELETE로 알려야 지워진다. */
export function deletePlan(planId: string) {
  if (readOnlyPlan(planId)) return;
  const s = loadState();
  s.plans = s.plans.filter((p) => p.id !== planId);
  if (s.activePlanId === planId) s.activePlanId = s.plans[0]?.id ?? null;
  persist(s);
  void fetch(`/api/plan/state?planId=${encodeURIComponent(planId)}`, { method: "DELETE" }).catch(() => {});
  void pushToServer();
}

/**
 * 플랜 복제 — 답변과 생성 결과를 그대로 가진 사본을 만든다.
 * 유형만 바꿔 다른 형태의 계획서를 만들 때 쓴다.
 */
export function duplicatePlan(planId: string, options?: { title?: string; planType?: string }): string | null {
  if (readOnlyPlan(planId)) return null;
  const s = loadState();
  const src = s.plans.find((p) => p.id === planId);
  if (!src) return null;
  const now = new Date().toISOString();
  const copy: Plan = {
    id: newId(),
    title: options?.title || `${src.title} (사본)`,
    planType: options?.planType || src.planType,
    createdAt: now,
    updatedAt: now,
    sections: JSON.parse(JSON.stringify(src.sections ?? {})),
    answers: JSON.parse(JSON.stringify(src.answers ?? {})),
  };
  s.plans.push(copy);
  s.activePlanId = copy.id;
  persist(s);
  void pushToServer();
  return copy.id;
}

/** 플랜 이름 변경 */
export function renamePlan(planId: string, title: string) {
  if (readOnlyPlan(planId)) return;
  const s = loadState();
  const p = s.plans.find((x) => x.id === planId);
  if (!p) return;
  p.title = title;
  p.updatedAt = new Date().toISOString();
  persist(s);
  void pushToServer();
}

/** 활성 플랜의 섹션 답변 불러오기 */
export function loadAnswers(key: string, state?: PlanState): Record<string, unknown> {
  const p = activePlan(state);
  return p?.answers?.[key] ?? {};
}

/*
 * 저장 대상 플랜을 정한다.
 *
 * planId를 준 호출은 '그 플랜'에만 쓴다. 비동기로 끝나는 일(본문 생성)은
 * 시작할 때와 끝날 때의 활성 플랜이 다를 수 있고, 그때 활성 플랜에 쓰면
 * 다른 사업의 문서에 남의 본문이 들어간다. 못 찾으면 쓰지 않는다.
 */
function targetPlan(state: PlanState, planId?: string): Plan | null {
  if (planId) return state.plans.find((p) => p.id === planId) ?? null;
  return activePlan(state);
}

/**
 * 섹션 답변 저장 (생성 전에도 보존).
 * 저장하지 못하면 false — 호출부가 '저장됨'이라고 잘못 알리지 않도록.
 */
export function saveAnswers(key: string, answers: Record<string, unknown>, planId?: string): boolean {
  const s = loadState();
  const p = targetPlan(s, planId);
  if (!p || readOnlyPlan(p.id)) return false;
  if (!p.answers) p.answers = {};
  p.answers[key] = answers;
  p.updatedAt = new Date().toISOString();
  persist(s);
  void pushToServer();
  return true;
}

/** 답변이 하나라도 있는 섹션 키 목록 (작성 중 표시용) */
export function answeredSectionKeys(state?: PlanState): string[] {
  const p = activePlan(state);
  if (!p?.answers) return [];
  return Object.entries(p.answers)
    .filter(([, a]) => a && Object.values(a).some((v) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0)))
    .map(([k]) => k);
}

/** 활성 플랜에 섹션 생성 결과 저장 */
/**
 * 섹션 본문을 저장한다.
 * 활성 플랜이 없으면 저장할 곳이 없으므로 false를 돌려준다 —
 * 호출부가 '저장됨'이라고 잘못 알리지 않도록.
 */
export function saveSection(
  key: string,
  markdown: string,
  html: string,
  options?: {
    /** 사용자가 직접 고친 저장인지 (AI 생성이면 false) */
    edited?: boolean;
    /** 덮어쓰기 전 본문을 되돌리기용으로 남길지 */
    keepPrevious?: boolean;
    /** 이 플랜에만 저장한다 — 생성이 끝날 때 활성 플랜이 바뀌어 있을 수 있다 */
    planId?: string;
  },
): boolean {
  const s = loadState();
  const p = targetPlan(s, options?.planId);
  // 예시 플랜은 저장 대상이 아니다 — 조용히 사라지는 대신 실패를 알린다
  if (!p || readOnlyPlan(p.id)) return false;
  const before = p.sections[key];
  p.sections[key] = {
    markdown,
    html,
    generatedAt: new Date().toISOString(),
    edited: options?.edited ?? false,
    // 잠금은 본문을 갈아끼워도 유지된다
    locked: before?.locked,
    previous:
      options?.keepPrevious && before
        ? { markdown: before.markdown, html: before.html }
        : before?.previous,
  };
  p.updatedAt = new Date().toISOString();
  persist(s);
  void pushToServer();
  return true;
}

/** 섹션 잠금 토글. 잠긴 섹션은 다시 생성이 덮어쓰지 못한다. */
export function toggleSectionLock(key: string): boolean {
  const s = loadState();
  const p = activePlan(s);
  const sec = p?.sections[key];
  if (!p || readOnlyPlan(p.id) || !sec) return false;
  sec.locked = !sec.locked;
  p.updatedAt = new Date().toISOString();
  persist(s);
  void pushToServer();
  return sec.locked;
}

/** 직전 본문으로 한 번 되돌린다. 되돌릴 게 없으면 null. */
export function restorePreviousSection(key: string): StoredSection | null {
  const s = loadState();
  const p = activePlan(s);
  const sec = p?.sections[key];
  if (!p || readOnlyPlan(p.id) || !sec?.previous) return null;
  const restored: StoredSection = {
    markdown: sec.previous.markdown,
    html: sec.previous.html,
    generatedAt: new Date().toISOString(),
    edited: true,
    locked: sec.locked,
  };
  p.sections[key] = restored;
  p.updatedAt = new Date().toISOString();
  persist(s);
  void pushToServer();
  return restored;
}

/**
 * 앞선 섹션들의 생성 결과 요약 — 뒤 섹션 생성 시 일관성 유지용.
 * blueprint 순서상 현재 섹션보다 앞에 있는 것만, 각 400자로 잘라 최대 6개.
 */
export function priorSectionsSummary(currentKey: string, state?: PlanState): string {
  const p = activePlan(state);
  if (!p) return "";
  const ordered: Array<{ key: string; title: string }> = [];
  for (const ch of chaptersForType(p.planType)) {
    for (const sec of ch.sections) {
      ordered.push({ key: sectionKey(ch.id, sec.id), title: `${ch.title} · ${sec.title}` });
    }
  }
  const idx = ordered.findIndex((o) => o.key === currentKey);
  if (idx <= 0) return "";
  const prior = ordered
    .slice(0, idx)
    .filter((o) => p.sections[o.key])
    .slice(-6); // 가장 가까운 앞 섹션 6개
  if (!prior.length) return "";
  return prior
    .map((o) => {
      const md = p.sections[o.key].markdown
        .replace(/^#+\s*/gm, "")
        .replace(/\|/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim()
        .slice(0, 400);
      return `▸ ${o.title}\n${md}`;
    })
    .join("\n\n");
}

/** AI 프롬프트에 넣을 사업 맥락 문자열 */
export function businessContext(business?: BusinessProfile): string {
  const b = business ?? loadState().business;
  const lines: string[] = [];
  if (b.name) lines.push(`사업명: ${b.name}`);
  if (b.description) lines.push(`사업 설명: ${b.description}`);
  if (b.industry) lines.push(`업종: ${b.industry}`);
  if (b.region) lines.push(`지역: ${b.region}`);
  if (b.role) lines.push(`대표자 역할: ${b.role}`);
  if (b.stage) lines.push(`진행 단계: ${b.stage}`);
  return lines.join("\n");
}

/** 섹션 상태 맵 (활성 플랜 기준) */
export function planStatuses(state?: PlanState): Record<string, PlanSectionStatus> {
  const p = activePlan(state);
  const out: Record<string, PlanSectionStatus> = {};
  if (!p) return out;
  for (const key of Object.keys(p.sections)) out[key] = "done";
  return out;
}

/** 활성 플랜의 생성 섹션을 blueprint 순서로 조립 */
export function assembleSections(state?: PlanState): Array<{
  key: string;
  chapterTitle: string;
  sectionTitle: string;
  markdown: string;
  html: string;
}> {
  const p = activePlan(state);
  const out: Array<{ key: string; chapterTitle: string; sectionTitle: string; markdown: string; html: string }> = [];
  if (!p) return out;
  for (const chapter of chaptersForType(p.planType)) {
    for (const section of chapter.sections) {
      const key = sectionKey(chapter.id, section.id);
      const stored = p.sections[key];
      if (stored) {
        out.push({
          key,
          chapterTitle: chapter.title,
          sectionTitle: section.title,
          markdown: stored.markdown,
          html: stored.html,
        });
      }
    }
  }
  return out;
}

// ── 서버 동기화 ──

/** 현재 로컬 상태를 서버에 저장(fire-and-forget) */
export async function pushToServer(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const state = loadState();
    await fetch("/api/plan/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...state, plans: state.plans.filter((p) => !isSamplePlan(p.id)) }),
    });
  } catch {
    // 오프라인/실패 시 로컬만 유지
  }
}

/**
 * 같은 플랜의 서버본과 로컬본을 합친다.
 * 통째로 덮어쓰면 아직 업로드되지 않은 최신 섹션이 사라진다 —
 * 섹션은 키별 생성 시각으로, 답변은 섹션 키 단위로 최신 쪽을 남긴다.
 */
function mergePlan(serverPlan: Plan, localPlan: Plan): Plan {
  const localNewer = (localPlan.updatedAt || "") > (serverPlan.updatedAt || "");
  const base = localNewer ? localPlan : serverPlan;
  const other = localNewer ? serverPlan : localPlan;

  const sections: Record<string, StoredSection> = { ...(other.sections ?? {}) };
  for (const [key, sec] of Object.entries(base.sections ?? {})) {
    const prev = sections[key];
    // 어느 쪽에 있든 '나중에 만든 본문'이 이긴다
    if (!prev || (sec.generatedAt || "") >= (prev.generatedAt || "")) sections[key] = sec;
  }

  return {
    ...base,
    sections,
    answers: { ...(other.answers ?? {}), ...(base.answers ?? {}) },
    updatedAt: localNewer ? localPlan.updatedAt : serverPlan.updatedAt,
  };
}

/** 서버 상태와 로컬 상태를 합친 결과 */
function mergeStates(server: PlanState, local: PlanState): PlanState {
  const ownOf = (s: PlanState) => s.plans.filter((p) => !isSamplePlan(p.id));
  const byId = new Map<string, Plan>();
  for (const p of ownOf(server)) byId.set(p.id, p);
  for (const p of ownOf(local)) {
    const fromServer = byId.get(p.id);
    byId.set(p.id, fromServer ? mergePlan(fromServer, p) : p);
  }
  const plans = [...byId.values()].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

  // 지금 보고 있는 플랜(샘플 포함)을 그대로 유지한다 — 화면이 다른 문서로 튀지 않게
  const keepActive =
    local.activePlanId && (isSamplePlan(local.activePlanId) || byId.has(local.activePlanId))
      ? local.activePlanId
      : server.activePlanId && byId.has(server.activePlanId)
        ? server.activePlanId
        : plans[0]?.id ?? null;

  return {
    business: local.business.name ? local.business : server.business,
    plans,
    activePlanId: keepActive,
  };
}

/** 서버에 없는 로컬 내용이 남아 있는지 — 있으면 업로드해야 한다 */
function stateSignature(s: PlanState): string {
  return s.plans
    .filter((p) => !isSamplePlan(p.id))
    .map((p) => `${p.id}:${p.updatedAt}:${Object.keys(p.sections ?? {}).length}:${Object.keys(p.answers ?? {}).length}`)
    .sort()
    .join("|");
}

/** 서버에서 상태를 불러와 로컬과 병합한다(최신 것이 이긴다) */
export async function hydrateFromServer(): Promise<PlanState> {
  if (typeof window === "undefined") return loadState();
  try {
    const res = await fetch("/api/plan/state", { cache: "no-store" });
    if (res.ok) {
      const payload = (await res.json()) as Record<string, unknown>;
      /*
       * 로그아웃·세션 만료면 이전 계정의 로컬 캐시를 비운다.
       *
       * 단, '로그인한 적 있는 사람이 로그아웃된 경우'에만이다.
       * 예전에는 authenticated=false이기만 하면 지웠는데, 로그인하지 않고
       * 쓰던 사람의 작성 중인 답변까지 화면을 옮길 때마다 날아갔다.
       * (그러고 나면 활성 플랜을 잃어 예시 플랜으로 넘어가는 2차 피해까지 났다.)
       */
      const wasAuthenticated = readAuthFlag();
      if (payload.authenticated === false) {
        if (wasAuthenticated) {
          clearLocalState();
          writeAuthFlag(false);
          return loadState();
        }
        writeAuthFlag(false);
      } else if (payload.authenticated === true) {
        writeAuthFlag(true);
      }
      const server = migrate(payload);
      const local = loadState();
      /*
       * 예전에는 서버 응답으로 로컬을 통째로 덮어썼다.
       * 방금 생성한 섹션이 아직 업로드되지 않았으면 그 순간 화면에서 사라졌다가
       * (개요가 "1번부터 다시"라고 안내) 업로드가 끝난 뒤에야 되살아났다.
       * 이제는 플랜·섹션 단위로 최신 것을 남기고, 로컬에만 있는 내용은 올린다.
       */
      const merged = mergeStates(server, local);
      persist(merged);
      if (stateSignature(merged) !== stateSignature(server)) void pushToServer();
    }
  } catch {
    // 서버 실패 → 로컬 캐시 사용
  }
  return loadState();
}
