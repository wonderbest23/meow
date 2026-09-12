"use client";

import { useEffect, useRef } from "react";

/** A continuous scroll timeline. Native scrolling and the static layout remain intact. */
export function useHomeScroll(mode: "pass" | "pin" | "scene" = "pass") {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      frame = 0;
      const pinned = mode !== "pass";
      const enabled = !reduced.matches && (mode === "scene" ? innerHeight >= 680 : mode !== "pin" || (innerWidth >= 960 && innerHeight >= 620));
      root.dataset.motion = enabled ? "on" : "off";
      const rect = root.getBoundingClientRect();
      const pin = root.querySelector<HTMLElement>("[data-pin]");
      const distance = pinned && pin ? root.offsetHeight - pin.offsetHeight : innerHeight + rect.height;
      const position = pinned ? 64 - rect.top : innerHeight - rect.top;
      const progress = Math.max(0, Math.min(1, position / Math.max(1, distance)));
      root.style.setProperty("--progress", enabled ? progress.toFixed(5) : "0");
      root.dataset.progress = progress.toFixed(3);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [mode]);
  return ref;
}
