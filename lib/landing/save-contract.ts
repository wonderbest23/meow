import type { LandingDraft } from "./domain";

export const LANDING_CONFLICT_MESSAGE = "다른 화면에서 홈페이지가 변경됐습니다. 현재 수정 내용은 유지했어요. 최신 내용을 확인한 뒤 다시 편집해주세요.";

export function landingDraftFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}

export type LandingSaveRequest = { draft: LandingDraft; expectedUpdatedAt: string | null };
