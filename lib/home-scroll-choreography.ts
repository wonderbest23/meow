/** Deterministic phases keep the same visual state when scrolling backwards. */
export function homeScrollChoreography(value: number) {
  const progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const phase = (start: number, end: number) => {
    const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
    return t * t * (3 - 2 * t);
  };
  return {
    progress,
    type: phase(0, .1),
    send: phase(.1, .17),
    answer: phase(.18, .25),
    extract: phase(.27, .35),
    organize: phase(.35, .49),
    settle: phase(.49, .54),
    paper: phase(.61, .75),
    cover: phase(.77, .87),
    spread: phase(.87, .96),
    finish: phase(.94, 1),
  };
}
