/*
 * 화면 전환(View Transitions API) — 홈 입력칸에서 보내면 대화 화면 전체가 홈에서 확대되며 입력칸이 대화 입력칸으로 이어진다(2026-11-04 사장님).
 * 브라우저가 못 하거나 움직임 줄이기면 그냥 이동한다. 새 화면이 그려졌다고 알려 주지 않으면 1.5초 뒤 알아서 끝낸다.
 */
let settle: (() => void) | null = null;

export function navigateWithTransition(go: () => void) {
  const doc = document as Document & { startViewTransition?: (update: () => Promise<void>) => unknown };
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { go(); return; }
  doc.startViewTransition(() => new Promise<void>(resolve => {
    const done = () => { settle = null; window.clearTimeout(timer); resolve(); };
    const timer = window.setTimeout(done, 1500);
    settle = done;
    go();
  }));
}

/** 새 화면(작업실)이 그려지면 부른다 — 그때 옛 화면에서 새 화면으로 바뀌는 그림이 돈다 */
export function settleTransition() { settle?.(); }
