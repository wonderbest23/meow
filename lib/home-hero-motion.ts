const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export function heroExpansionFrame(progress: number) {
  const position = clamp(progress);
  // Finish opening before the sticky scene ends, leaving time to see the photo.
  const opening = clamp(position / 0.78);
  const eased = opening * opening * (3 - 2 * opening);
  return {
    progress: position,
    inset: 12 * (1 - eased),
    radius: 22 * (1 - eased),
    imageHeight: 65 + 35 * eased,
    feather: 120 * (1 - eased),
    scale: 1 + 0.035 * eased,
  };
}
