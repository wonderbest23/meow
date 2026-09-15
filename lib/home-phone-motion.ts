const clampProgress = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export function phoneStoryPins(width: number, height: number, reduced = false) {
  return !reduced && height >= (width > 700 ? 520 : 680);
}

export function phoneStoryScrollDistance(width: number, height: number) {
  return width > 700 ? Math.max(7200, Math.min(10800, height * 10)) : 3000;
}

export function phoneStoryScrollPosition({ top, trackHeight, stageHeight, viewportHeight, pinned }: {
  top: number;
  trackHeight: number;
  stageHeight: number;
  viewportHeight: number;
  pinned: boolean;
}) {
  const viewport = Math.max(1, viewportHeight - 64);
  const distance = pinned ? trackHeight - stageHeight : trackHeight + viewport;
  const position = pinned ? 64 - top : viewport - top;
  return clampProgress(position / Math.max(1, distance));
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

export function phoneStoryCopy(value: number, entry = 1, exit = 0, reduced = false) {
  const progress = clampProgress(value);
  const chapter = progress < .45 ? 0 : progress < .875 ? 1 : 2;
  const phase = (position: number, start: number, end: number) => {
    const t = clampProgress((position - start) / (end - start));
    return t * t * (3 - 2 * t);
  };
  const entrances = [0, .445, .87];
  const exits = [.37, .795, 1];
  const scenes = entrances.map((start, index) => {
    const parts = [0, 1, 2].map(part => {
      if (reduced) return { opacity: index === chapter ? 1 : 0, y: 0 };
      const stagger = part * .012;
      const incoming = index === 0
        ? phase(clampProgress(entry), part * .12, .72 + part * .12)
        : phase(progress, start + stagger, start + stagger + .066);
      const outgoing = index === 2
        ? phase(clampProgress(exit), part * .08, .84 + part * .08)
        : phase(progress, exits[index] + stagger, exits[index] + stagger + .05);
      return { opacity: incoming * (1 - outgoing), y: (1 - incoming) * (part === 2 ? 20 : 32) - outgoing * 24 };
    });
    return { parts, visible: parts.some(part => part.opacity > .001) };
  });
  return { chapter, scenes };
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
