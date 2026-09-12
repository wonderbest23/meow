export const PHONE_STORY_DURATION_SECONDS = 48;
export const PHONE_SCROLL_MIN_SECONDS = 14;

const clampProgress = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export function phoneStoryPins(width: number, height: number, reduced = false) {
  return !reduced && height >= (width > 700 ? 520 : 680);
}

export function phoneStoryScrollDistance(width: number, height: number) {
  return width > 700 ? Math.max(7200, Math.min(10800, height * 10)) : 3000;
}

// Reserve scroll distance for reading the lifted message, conditions and finished document.
const scrollStops = [
  [0, 0], [.055, .12], [.11, .2], [.25, .2], [.34, .415], [.42, .555],
  [.49, .67], [.63, .67], [.72, .845], [.79, .98], [.94, .98], [1, 1],
] as const;

export function phoneScrollProgress(value: number) {
  const progress = clampProgress(value);
  for (let index = 1; index < scrollStops.length; index++) {
    const [end, to] = scrollStops[index];
    const [start, from] = scrollStops[index - 1];
    if (progress <= end) return from + (to - from) * (progress - start) / (end - start);
  }
  return 1;
}

export function advancePhoneScroll(current: number, target: number, elapsed: number) {
  const from = clampProgress(current), to = clampProgress(target);
  const dt = Number.isFinite(elapsed) ? Math.max(0, Math.min(.05, elapsed)) : 0;
  if (!dt) return from;
  const difference = to - from;
  const eased = Math.abs(difference) * (1 - Math.exp(-dt / .22));
  const step = Math.min(eased, dt / PHONE_SCROLL_MIN_SECONDS);
  return Math.abs(difference) < .00003 ? to : from + Math.sign(difference) * step;
}

export function phoneMotion(value: number) {
  const progress = clampProgress(value);
  const phase = (start: number, end: number) => {
    const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
    return t * t * (3 - 2 * t);
  };
  return {
    progress,
    type: phase(0, .05),
    press: phase(.052, .062) * (1 - phase(.062, .072)),
    send: phase(.065, .085),
    answer: phase(.09, .12),
    messageDetach: phase(.125, .135) * (1 - phase(.355, .365)),
    messageLift: phase(.14, .185) * (1 - phase(.30, .35)),
    generate: phase(.385, .415),
    brief: phase(.445, .49),
    insideScroll: phase(.52, .55),
    focusDetach: phase(.565, .575) * (1 - phase(.805, .815)),
    focus: phase(.585, .635) * (1 - phase(.75, .795)),
    documentPress: phase(.825, .835) * (1 - phase(.835, .845)),
    document: phase(.865, .92),
    complete: phase(.95, .98),
  };
}
