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

/** 공개 중인 홈페이지에 아직 '새 버전 공개'를 안 한 고친 내용이 있는지 — draft 를 주면 화면에서 고치는 중인 것까지 본다 */
export function hasUnpublishedEdits(site: { status: string; publishedVersion: number | null; draft: LandingDraft; versions?: Array<{ version: number; config: LandingDraft }> } | null | undefined, draft?: LandingDraft): boolean {
  if (!site || site.status !== "published") return false;
  const live = site.versions?.find(version => version.version === site.publishedVersion)?.config;
  return Boolean(live && landingDraftFingerprint(live) !== landingDraftFingerprint(draft ?? site.draft));
}
