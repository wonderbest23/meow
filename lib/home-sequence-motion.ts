const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const ease = (value: number) => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };
const between = (start: number, end: number, value: number) => ease((value - start) / (end - start));

export function openingHandoff(top: number, viewportHeight: number, mobile: boolean, reduced = false) {
  const progress = reduced ? 0 : between(viewportHeight * .88, 120, top);
  return {
    inset: progress * (mobile ? 3 : 6),
    radius: 28 + progress * 24,
    phoneY: reduced || mobile ? 0 : -200 * (1 - progress),
  };
}

export function websiteSceneFrame(value: number, reduced = false) {
  const progress = reduced ? 1 : clamp(value);
  const reveal = between(.06, .26, progress);
  const inspector = between(.37, .45, progress) * (1 - between(.73, .81, progress));
  const edited = progress >= .59;
  return {
    progress,
    step: progress < .35 ? 0 : progress < .81 ? 1 : 2,
    reveal,
    record: 1 - between(.2, .31, progress),
    inspector,
    edited,
    highlight: between(.44, .49, progress) * (1 - between(.7, .78, progress)),
    saved: between(.81, .88, progress),
    turn: (1 - reveal) * 5,
  };
}
