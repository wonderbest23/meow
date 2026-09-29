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
  /*
   * 새로 올린 사진은 보여야 한다. 사진이 없어 자동으로 숨겨 둔 자리에 올리면
   * 숨김이 그대로 남아, 올렸는데 화면에 안 나오는 것처럼 보였다.
   */
  const hidden = patch.kind === "images" && applied.length ? current.hidden.filter(id => !applied.includes(id)) : current.hidden;
  return { state: applied.length ? { ...current, [patch.kind]: values, hidden } : current, applied, conflicts, stale: false };
}
