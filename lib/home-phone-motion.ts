export const PHONE_STORY_DURATION_SECONDS = 48;

export function phoneMotion(value: number) {
  const progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
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
