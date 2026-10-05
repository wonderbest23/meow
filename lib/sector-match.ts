/*
 * 업종 글(업종·상호·대표 상품)에서 업종 규칙 하나를 고른다 — 글에서 가장 먼저 나온 말이 이긴다.
 *
 * 예전엔 규칙 목록 순서대로 '글 어딘가에 있으면' 골랐다. 카페 규칙이 맨 앞이라
 * "플로라 꽃집 — 카페·식당에 납품하는 꽃 장식", "헤어온 미용실 — 카페 같은 분위기"처럼
 * 대표 상품 설명에 '카페'가 한 번만 나와도 카페 사진·색·계획서 관점을 받았다.
 * 업종·상호가 글 앞에 오므로 먼저 나온 말이 그 사업 자신을 가리킨다.
 * 같은 자리에서 둘이 맞으면(피부과 → 의료·미용) 목록 순서(더 구체적인 쪽)를 따른다.
 */
export function firstSectorMatch<T>(entries: readonly T[], text: string, testOf: (entry: T) => RegExp): T | undefined {
  let best: T | undefined;
  let bestAt = Infinity;
  for (const entry of entries) {
    const at = text.search(testOf(entry));
    if (at >= 0 && at < bestAt) { best = entry; bestAt = at; }
  }
  return best;
}
