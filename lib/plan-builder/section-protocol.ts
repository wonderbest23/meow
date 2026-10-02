export const PLAN_SECTION_INTERNAL_PATH = "/__internal/plan-section";
export const PLAN_SECTION_API_PATH = "/api/internal/plan-section";
export interface PlanSectionJob { ownerHash: string; planId: string; chapterId: string; sectionId: string; outline?: string }
/** 섹션을 동시에 쓰기 전에 문서 설계도를 만든다(lib/plan-builder/section-outline.ts) */
export interface PlanOutlineJob { ownerHash: string; planId: string; sections: Array<{ chapterId: string; sectionId: string }> }
