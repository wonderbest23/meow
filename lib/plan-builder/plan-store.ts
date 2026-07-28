// 플랜 데모용 클라이언트 스토어 — 생성된 섹션 본문/상태를 localStorage에 보관.
// Phase 5에서 서버(projects.metadata / project_stages)로 승격 예정.

import { PLAN_BLUEPRINT, sectionKey, type PlanSectionStatus } from "./blueprint";

const KEY = "oneul-plan-demo-v1";

export interface StoredSection {
  markdown: string;
  html: string;
  generatedAt: string;
}

export interface PlanState {
  title: string;
  planType: string;
  sections: Record<string, StoredSection>; // key = `${chapterId}/${sectionId}`
}

const EMPTY: PlanState = { title: "새 플랜", planType: "창업 초기 · 사업계획서", sections: {} };

export function loadPlan(): PlanState {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<PlanState>;
    return {
      title: parsed.title || EMPTY.title,
      planType: parsed.planType || EMPTY.planType,
      sections: parsed.sections || {},
    };
  } catch {
    return { ...EMPTY };
  }
}

/** 플랜 유형(+제목) 설정 — 시작 플로우에서 새 플랜 시작 */
export function startNewPlan(title: string, planType: string) {
  persist({ title: title || EMPTY.title, planType, sections: {} });
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
}

export function setPlanTitle(title: string) {
  const state = loadPlan();
  state.title = title;
  persist(state);
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
