export type EditorOverrides = {
  texts: Record<string, string>;
  images: Record<string, string>;
  links: Record<string, string>;
  sizes: Record<string, number>;
  hidden: string[];
  order: string[];
};

export type EditorAsyncPatch = {
  session: number;
  kind: "texts" | "images";
  before: Record<string, string>;
  changes: Record<string, string>;
  versions?: Record<string, number>;
};

/** Merge only requested elements; an async response must never restore a whole snapshot. */
export function mergeEditorAsyncPatch(current: EditorOverrides, session: number, patch: EditorAsyncPatch, versions: Record<string, number> = {}) {
  if (session !== patch.session) return { state: current, applied: [] as string[], conflicts: [] as string[], stale: true };
  const values = { ...current[patch.kind] };
  const applied: string[] = [], conflicts: string[] = [];
  for (const [id, value] of Object.entries(patch.changes)) {
    if (values[id] === value) continue;
    if (values[id] !== patch.before[id] || (patch.versions && (versions[`${patch.kind}:${id}`] ?? 0) !== (patch.versions[`${patch.kind}:${id}`] ?? 0))) { conflicts.push(id); continue; }
    values[id] = value;
    applied.push(id);
  }
  return { state: applied.length ? { ...current, [patch.kind]: values } : current, applied, conflicts, stale: false };
}
