import { landingPageDataSchema, type LandingPageData } from "./page-data";

export type EditorRecovery = { version: 1; base: string; draft: LandingPageData; savedAt: number };

export function readEditorRecovery(raw: string | null, now = Date.now()): EditorRecovery | null {
  if (!raw || raw.length > 4_500_000) return null;
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.base !== "string" || typeof value.savedAt !== "number" || value.savedAt > now || now - value.savedAt > 86_400_000) return null;
    const draft = landingPageDataSchema.safeParse(value.draft);
    return draft.success && draft.data.brainwave ? { version: 1, base: value.base, draft: draft.data, savedAt: value.savedAt } : null;
  } catch { return null; }
}
