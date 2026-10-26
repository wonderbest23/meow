/*
 * 나중에 받는 코드(상담 창·로그인 창)를 '누르기 전에' 미리 받는다.
 *
 * 처음 화면을 그릴 때는 받지 않는다(처음 받는 JS·그리기 지연을 줄이려고 나눈 것이다). 대신
 *  - 단추에 마우스를 올리거나 초점이 가면 그 단추의 코드를 바로 받고,
 *  - 사람이 화면을 처음 누르거나 키를 치면, 브라우저가 한가할 때 받아 둔다(폰은 마우스 올리기가 없어 누른 뒤 늦게 열리지 않게).
 * 받기만 하고 그리지는 않는다. 실패하면(망 끊김 등) 다음 기회에 다시 받는다.
 */
export function preloadOnce<T>(load: () => Promise<T>) {
  let started: Promise<T> | null = null;
  const get = () => {
    if (!started) started = load().catch((error: unknown) => { started = null; throw error; });
    return started;
  };
  /** 받기(실패하면 거절) · warm 은 받아 두기만(실패는 조용히) */
  return { get, warm: () => { get().catch(() => {}); } };
}

/** 첫 누르기·키 입력 뒤 한가할 때 한 번 preload 를 부른다. 정리 함수를 돌려준다 */
export function preloadAfterFirstInteraction(preload: () => unknown) {
  const events = ["pointerdown", "keydown", "touchstart"] as const;
  let idle = 0;
  let timer = 0;
  const run = () => {
    stop();
    const later = window.requestIdleCallback;
    if (later) idle = later(() => { idle = 0; preload(); }, { timeout: 2000 });
    else timer = window.setTimeout(() => { timer = 0; preload(); }, 200);
  };
  const stop = () => { for (const name of events) window.removeEventListener(name, run, true); };
  for (const name of events) window.addEventListener(name, run, { capture: true, passive: true });
  return () => {
    stop();
    if (idle) window.cancelIdleCallback?.(idle);
    if (timer) window.clearTimeout(timer);
  };
}
