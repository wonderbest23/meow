/*
 * '말하지 않은 것은 이렇게 채웠어요' 상자의 '생각하며 채우기' — 언제 재생하고 얼마나 걸리는지(2026-11-17 사장님:
 * "GPT나 클로드처럼 사고하는 것처럼 각각 채워지는 내용을 보여 주고, 그다음에 합쳐지는 게 좋지").
 *
 * 채운 값은 서버가 한 번에 채운 묶음이다 — 같은 묶음의 답은 메시지 번호가 '요청번호:estimate' 로 같다(intake-core applyIntakeEstimates).
 * 그래서 '이 화면에서 처음 보는 묶음 번호'가 생겼을 때만 재생한다:
 *  - 첫 채움(빈 새 대화에서 첫 문장을 보낸 직후, 아이디어 찾기에서 후보를 고른 직후)
 *  - 업종·사업 문장을 바꿔 다시 채울 때(새 묶음) — 짧게
 * 재생하지 않는 때:
 *  - 불러올 때 이미 있던 묶음(새로고침 · 다시 열기 · 이전 대화 다시 보기 · 다른 사업으로 옮김)
 *  - 읽은 값(:said)이 일부를 바꿔 같은 묶음의 개수만 줄어든 때, 같은 상자가 다시 그려질 때
 * 움직임 줄이기(prefers-reduced-motion)는 부르는 쪽(BusinessIntake)이 확인해 재생 없이 바로 접힌 요약 줄로 둔다.
 * AI를 부르지 않고 문구를 지어내지 않는다 — 보이는 줄은 채운 값(filledAnswers) 그대로다.
 */

export type FillSeen = { planId: string | null; batches: string[] };

/**
 * 이번 그림에서 본 묶음을 기록하고, 새로 생긴 묶음(재생할 것)을 돌려준다. 바뀐 것이 없으면 seen 을 그대로(같은 객체) 돌려준다.
 * planId 가 null 인 기록은 '사업이 아직 없는 새 대화'다 — 거기서 사업이 생기면 그 묶음은 이 화면에서 방금 채운 것이다.
 */
export function nextFillSeen(seen: FillSeen | null, loaded: boolean, planId: string | null, batches: string[]): { seen: FillSeen | null; fresh: string[]; refill: boolean } {
  // 불러오는 중(주소가 바뀌어 다른 사업을 여는 중 포함) — 기록을 비우고 다 불러온 첫 그림을 기준으로 삼는다
  if (!loaded) return { seen: null, fresh: [], refill: false };
  if (!seen) return { seen: { planId, batches: [...batches] }, fresh: [], refill: false };
  // 사업이 잠깐 비는 순간(다시 불러오는 중)은 건드리지 않는다 — 돌아오면 같은 묶음이라 재생하지 않는다
  if (!planId) return { seen, fresh: [], refill: false };
  // 다른 사업으로 옮겼다 — 그 사업의 지금 묶음을 기준으로(재생 없음)
  if (seen.planId !== null && seen.planId !== planId) return { seen: { planId, batches: [...batches] }, fresh: [], refill: false };
  const fresh = batches.filter(batch => !seen.batches.includes(batch));
  if (!fresh.length && seen.planId === planId) return { seen, fresh: [], refill: false };
  return { seen: { planId, batches: [...seen.batches, ...fresh] }, fresh, refill: fresh.length > 0 && seen.batches.length > 0 };
}

/**
 * 줄이 다 나왔는데 적은 글을 아직 읽는 중일 때(FillThinking hold) 머리줄 — 생각 표시를 채움 상자 하나로 이어 간다.
 * 그동안 아래의 '적은 글을 읽고 있어요'(회전 아이콘) 줄은 보이지 않는다(BusinessIntake).
 */
export const FILL_READING_HEAD = "적은 글을 읽고 있어요…";

/** 줄이 올라오는 데 걸리는 시간(WorkNarration 의 narration-in 과 같다) · 다 나온 뒤 멈춤 · 접히는 시간 */
export const FILL_LINE_MS = 320;
export const FILL_MERGE_MS = 360;

/**
 * 줄 간격 — 약 0.2~0.3초, 항목이 많으면 줄여 다 나오기까지 2~3초 안에. 다시 채울 때(refill)는 더 짧게.
 * first: 첫 줄이 나오는 때, step: 줄 간격, mergeAt: 접히기 시작하는 때, doneAt: 요약 줄만 남는 때(모두 밀리초).
 */
export function fillThinkingTiming(count: number, refill = false) {
  const lines = Math.max(1, count);
  const first = refill ? 150 : 250;
  const step = Math.round(refill ? Math.min(160, Math.max(40, 1000 / lines)) : Math.min(260, Math.max(60, 1800 / lines)));
  const shown = first + (lines - 1) * step + FILL_LINE_MS;
  const mergeAt = shown + (refill ? 300 : 420);
  return { first, step, shown, mergeAt, doneAt: mergeAt + FILL_MERGE_MS };
}
