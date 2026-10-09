/*
 * 사업계획서 제작 진행 계산 — 이번 제작(__coach_generation)이 맡은 장 가운데 이번 기준(revision)으로 완성된 장을 센다.
 * 예전 기준으로 써 둔 장은 아직 다시 쓰는 중으로 본다.
 */
export type GenerationProgress = {
  total: number; done: number; active: boolean; startedAt: string | null;
  sections: Array<{ key: string; title: string; done: boolean }>;
};

export function generationProgress(
  generation: { keys?: string[]; revision?: number; dispatchAt?: string } | undefined,
  sections: Record<string, { markdown?: string; html?: string; coachRevision?: number; edited?: boolean; locked?: boolean } | undefined>,
  titles: Record<string, string>,
): GenerationProgress {
  const keys = Array.isArray(generation?.keys) ? generation!.keys : [];
  const list = keys.map(key => {
    const section = sections[key];
    const written = !!(section?.markdown?.trim() || section?.html?.trim());
    // 직접 고치거나 잠근 장은 작업이 다시 쓰지 않고 건너뛴다(section-service) — 끝난 것으로 세야 '다 됐다'에 닿는다
    return { key, title: titles[key] ?? key, done: written && (generation?.revision == null || section?.coachRevision === generation.revision || !!section?.edited || !!section?.locked) };
  });
  const done = list.filter(item => item.done).length;
  return { total: list.length, done, active: list.length > 0 && done < list.length, startedAt: generation?.dispatchAt ?? null, sections: list };
}
