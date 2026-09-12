"use client";

import { useEffect, useRef } from "react";
import { homeScrollChoreography } from "../lib/home-scroll-choreography";

export function useHomeChoreography() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let progress = 0;
    let previous = 0;
    let target = 0;
    let enabled = false;
    const paint = () => {
      const phases = homeScrollChoreography(progress);
      for (const [key, value] of Object.entries(phases)) root.style.setProperty(`--${key}`, value.toFixed(5));
      root.dataset.progress = progress.toFixed(5);
      const active = progress < .42 ? 0 : progress < .68 ? 1 : 2;
      root.querySelectorAll<HTMLElement>("[data-story-scene]").forEach((element, index) => {
        element.setAttribute("aria-hidden", String(enabled && index !== active));
      });
    };
    const tick = (now: number) => {
      frame = 0;
      const dt = Math.min(50, previous ? now - previous : 16);
      previous = now;
      progress += (target - progress) * (1 - Math.exp(-dt / 65));
      if (Math.abs(target - progress) < .00005) progress = target;
      paint();
      if (progress !== target && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const measure = (snap = false) => {
      enabled = !reduced.matches && innerHeight >= 680;
      root.dataset.motion = enabled ? "on" : "off";
      const pin = root.querySelector<HTMLElement>("[data-pin]");
      const distance = root.offsetHeight - (pin?.offsetHeight ?? 0);
      target = enabled ? Math.max(0, Math.min(1, (64 - root.getBoundingClientRect().top) / Math.max(1, distance))) : 0;
      if (snap || !enabled) {
        cancelAnimationFrame(frame);
        frame = 0;
        progress = target;
        paint();
      } else if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const scroll = () => measure();
    const resize = () => measure(true);
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
      else { previous = 0; measure(true); }
    };
    measure(true);
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", resize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", resize);
    };
  }, []);
  return ref;
}
