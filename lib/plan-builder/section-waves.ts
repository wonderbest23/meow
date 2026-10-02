/* 섹션을 동시에 만들 묶음(lib/plan-builder/section-workflow.ts) — 워크플로 밖에서 테스트할 수 있게 따로 둔다 */
export const SECTION_CONCURRENCY = 4;
const LAST_SECTIONS = new Set(["summary/executive"]);

/** 동시에 돌릴 묶음 — 전체를 정리하는 요약은 다른 섹션이 끝난 뒤 마지막 묶음으로 둔다 */
export function sectionWaves(keys: string[], concurrency: number): string[][] {
  const first = keys.filter(key => !LAST_SECTIONS.has(key));
  const last = keys.filter(key => LAST_SECTIONS.has(key));
  const size = Math.max(1, Math.floor(concurrency));
  const waves: string[][] = [];
  for (let i = 0; i < first.length; i += size) waves.push(first.slice(i, i + size));
  if (last.length) waves.push(last);
  return waves;
}
