function smoothRange(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function homeCopyFrame({ top, height, viewportHeight, headerHeight = 64, body = false, reduced = false }: {
  top: number;
  height: number;
  viewportHeight: number;
  headerHeight?: number;
  body?: boolean;
  reduced?: boolean;
}) {
  if (reduced || viewportHeight < 360) return { opacity: 1, y: 0 };

  const incoming = 1 - smoothRange(viewportHeight * .72, viewportHeight * .96, top);
  const exitEdge = headerHeight + Math.min(height, 64);
  const retained = smoothRange(exitEdge, exitEdge + 128, top + height);
  return {
    opacity: incoming * retained,
    y: (1 - incoming) * (body ? 16 : 24) - (1 - retained) * (body ? 12 : 18),
  };
}
