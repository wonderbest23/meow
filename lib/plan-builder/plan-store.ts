// 플랜 데모용 클라이언트 스토어 — 생성된 섹션 본문/상태를 localStorage에 보관.
// Phase 5에서 서버(projects.metadata / project_stages)로 승격 예정.

import { PLAN_BLUEPRINT, sectionKey, type PlanSectionStatus } from "./blueprint";

const KEY = "oneul-plan-demo-v1";

export interface StoredSection {
  markdown: string;
  html: string;
  generatedAt: string;
}

/** 사업 정보 — 모든 섹션 질문·AI 생성의 공통 맥락이 된다. */
export interface BusinessProfile {
  /** 사업/브랜드 이름 */
  name: string;
  /** 한두 문장 사업 설명 (AI 맥락의 핵심) */
  description: string;
  /** 대표자 역할 */
  role: string;
  /** 업종 */
  industry: string;
  /** 지역 */
  region: string;
  /** 진행 단계 */
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

export interface PlanState {
  title: string;
  planType: string;
  business: BusinessProfile;
  sections: Record<string, StoredSection>; // key = `${chapterId}/${sectionId}`
}

const EMPTY: PlanState = {
  title: "새 플랜",
  planType: "창업 초기 · 사업계획서",
  business: { ...EMPTY_BUSINESS },
  sections: {},
};

export function loadPlan(): PlanState {
  if (typeof window === "undefined") return { ...EMPTY, business: { ...EMPTY_BUSINESS } };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, business: { ...EMPTY_BUSINESS } };
    const parsed = JSON.parse(raw) as Partial<PlanState>;
    return {
      title: parsed.title || EMPTY.title,
      planType: parsed.planType || EMPTY.planType,
      business: { ...EMPTY_BUSINESS, ...(parsed.business || {}) },
      sections: parsed.sections || {},
    };
  } catch {
    return { ...EMPTY, business: { ...EMPTY_BUSINESS } };
  }
}

/** 사업 정보 + 플랜 유형으로 새 플랜 시작 */
export function startNewPlan(business: BusinessProfile, planType: string) {
  persist({
    title: business.name || EMPTY.title,
    planType,
    business,
    sections: {},
  });
  void pushToServer();
}

/** 사업 정보만 갱신 (섹션 결과는 유지) */
export function updateBusiness(business: BusinessProfile) {
  const state = loadPlan();
  state.business = business;
  if (business.name) state.title = business.name;
  persist(state);
  void pushToServer();
}

/** AI 프롬프트에 넣을 사업 맥락 문자열 */
export function businessContext(business?: BusinessProfile): string {
  const b = business ?? loadPlan().business;
  const lines: string[] = [];
  if (b.name) lines.push(`사업명: ${b.name}`);
  if (b.description) lines.push(`사업 설명: ${b.description}`);
  if (b.industry) lines.push(`업종: ${b.industry}`);
  if (b.region) lines.push(`지역: ${b.region}`);
  if (b.role) lines.push(`대표자 역할: ${b.role}`);
  if (b.stage) lines.push(`진행 단계: ${b.stage}`);
  return lines.join("\n");
}

function persist(state: PlanState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function saveSection(key: string, markdown: string, html: string) {
  const state = loadPlan();
  state.sections[key] = { markdown, html, generatedAt: new Date().toISOString() };
  persist(state);
  void pushToServer();
}

export function setPlanTitle(title: string) {
  const state = loadPlan();
  state.title = title;
  persist(state);
  void pushToServer();
}

// ── 서버 동기화 (로컬 캐시 + 서버 저장; Supabase 미설정 시 서버는 메모리 폴백) ──

/** 현재 로컬 상태를 서버에 저장(fire-and-forget) */
export async function pushToServer(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/plan/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loadPlan()),
    });
  } catch {
    // 오프라인/실패 시 로컬만 유지
  }
}

/** 서버에서 상태를 불러와 로컬에 반영(서버 우선). 로그인/기기 전환 후 이어쓰기용. */
export async function hydrateFromServer(): Promise<PlanState> {
  if (typeof window === "undefined") return loadPlan();
  try {
    const res = await fetch("/api/plan/state", { cache: "no-store" });
    if (res.ok) {
      const server = (await res.json()) as PlanState;
      const hasServerData = server && (Object.keys(server.sections || {}).length > 0 || (server.title && server.title !== "새 플랜"));
      if (hasServerData) {
        persist({
          title: server.title,
          planType: server.planType || EMPTY.planType,
          business: { ...EMPTY_BUSINESS, ...(server.business || {}) },
          sections: server.sections || {},
        });
      }
    }
  } catch {
    // 서버 실패 → 로컬 캐시 사용
  }
  return loadPlan();
}

/** 섹션 상태 맵 (생성된 것 = done) */
export function planStatuses(state?: PlanState): Record<string, PlanSectionStatus> {
  const s = state ?? loadPlan();
  const out: Record<string, PlanSectionStatus> = {};
  for (const key of Object.keys(s.sections)) out[key] = "done";
  return out;
}

/** blueprint 순서대로 생성된 섹션을 조립 (문서 뷰 / 내보내기용) */
export function assembleSections(state?: PlanState): Array<{ key: string; chapterTitle: string; sectionTitle: string; markdown: string; html: string }> {
  const s = state ?? loadPlan();
  const out: Array<{ key: string; chapterTitle: string; sectionTitle: string; markdown: string; html: string }> = [];
  for (const chapter of PLAN_BLUEPRINT) {
    for (const section of chapter.sections) {
      const key = sectionKey(chapter.id, section.id);
      const stored = s.sections[key];
      if (stored) {
        out.push({ key, chapterTitle: chapter.title, sectionTitle: section.title, markdown: stored.markdown, html: stored.html });
      }
    }
  }
  return out;
}
