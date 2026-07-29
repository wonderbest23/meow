// 플랜 빌더 클라이언트 스토어 — 사업 1개 + 플랜 여러 개 구조.
// 로컬(localStorage) 캐시 + 서버(plan_states) 동기화.

import { PLAN_BLUEPRINT, sectionKey, type PlanSectionStatus } from "./blueprint";

const KEY = "oneul-plan-demo-v1";

export interface StoredSection {
  markdown: string;
  html: string;
  generatedAt: string;
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

export function loadState(): PlanState {
  if (typeof window === "undefined") return { ...EMPTY_STATE, business: { ...EMPTY_BUSINESS } };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_STATE, business: { ...EMPTY_BUSINESS } };
    return migrate(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return { ...EMPTY_STATE, business: { ...EMPTY_BUSINESS } };
  }
}

function persist(state: PlanState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

/** 현재 활성 플랜 (없으면 null) */
export function activePlan(state?: PlanState): Plan | null {
  const s = state ?? loadState();
  if (!s.activePlanId) return s.plans[0] ?? null;
  return s.plans.find((p) => p.id === s.activePlanId) ?? s.plans[0] ?? null;
}

/** 사업 정보 저장 (플랜은 유지) */
export function saveBusiness(business: BusinessProfile) {
  const s = loadState();
  s.business = business;
  persist(s);
  void pushToServer();
}

/** 새 플랜 추가 후 활성화 → 생성된 id 반환 */
export function createPlan(planType: string, title?: string): string {
  const s = loadState();
  const now = new Date().toISOString();
  const plan: Plan = {
    id: newId(),
    title: title || s.business.name || "새 플랜",
    planType,
    createdAt: now,
    updatedAt: now,
    sections: {},
    answers: {},
  };
  s.plans.push(plan);
  s.activePlanId = plan.id;
  persist(s);
  void pushToServer();
  return plan.id;
}

/** 작업할 플랜 전환 */
export function setActivePlan(planId: string) {
  const s = loadState();
  if (!s.plans.some((p) => p.id === planId)) return;
  s.activePlanId = planId;
  persist(s);
  void pushToServer();
}

/** 플랜 삭제 */
export function deletePlan(planId: string) {
  const s = loadState();
  s.plans = s.plans.filter((p) => p.id !== planId);
  if (s.activePlanId === planId) s.activePlanId = s.plans[0]?.id ?? null;
  persist(s);
  void pushToServer();
}

/** 플랜 이름 변경 */
export function renamePlan(planId: string, title: string) {
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

/** 활성 플랜에 섹션 답변 저장 (생성 전에도 보존) */
export function saveAnswers(key: string, answers: Record<string, unknown>) {
  const s = loadState();
  const p = activePlan(s);
  if (!p) return;
  if (!p.answers) p.answers = {};
  p.answers[key] = answers;
  p.updatedAt = new Date().toISOString();
  persist(s);
  void pushToServer();
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
export function saveSection(key: string, markdown: string, html: string) {
  const s = loadState();
  const p = activePlan(s);
  if (!p) return;
  p.sections[key] = { markdown, html, generatedAt: new Date().toISOString() };
  p.updatedAt = new Date().toISOString();
  persist(s);
  void pushToServer();
}

/**
 * 앞선 섹션들의 생성 결과 요약 — 뒤 섹션 생성 시 일관성 유지용.
 * blueprint 순서상 현재 섹션보다 앞에 있는 것만, 각 400자로 잘라 최대 6개.
 */
export function priorSectionsSummary(currentKey: string, state?: PlanState): string {
  const p = activePlan(state);
  if (!p) return "";
  const ordered: Array<{ key: string; title: string }> = [];
  for (const ch of PLAN_BLUEPRINT) {
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
  for (const chapter of PLAN_BLUEPRINT) {
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
    await fetch("/api/plan/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loadState()),
    });
  } catch {
    // 오프라인/실패 시 로컬만 유지
  }
}

/** 서버에서 상태를 불러와 로컬에 반영(서버 우선) */
export async function hydrateFromServer(): Promise<PlanState> {
  if (typeof window === "undefined") return loadState();
  try {
    const res = await fetch("/api/plan/state", { cache: "no-store" });
    if (res.ok) {
      const server = migrate((await res.json()) as Record<string, unknown>);
      const local = loadState();
      // 로컬에 더 많은 플랜이 있으면(방금 만든 경우) 서버로 덮어쓰지 않고 로컬을 올린다.
      if (local.plans.length > server.plans.length) {
        void pushToServer();
      } else if (server.plans.length > 0 || server.business.name) {
        persist(server);
      }
    }
  } catch {
    // 서버 실패 → 로컬 캐시 사용
  }
  return loadState();
}
