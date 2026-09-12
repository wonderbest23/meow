"use client";

import { useEffect, type RefObject } from "react";
import { heroExpansionFrame } from "../lib/home-hero-motion";

export function useHeroExpansion(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = ref.current;
    const stage = root?.querySelector<HTMLElement>("[data-hero-stage]");
    if (!root || !stage) return;

    const mobile = matchMedia("(max-width: 700px)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previousTime = 0;
    let current = 0;
    let enabled = false;

    const render = (time: number) => {
      frame = 0;
      if (!enabled || document.hidden) return;
      const top = root.getBoundingClientRect().top;
      const distance = Math.max(1, root.offsetHeight - stage.offsetHeight);
      const scroll = Math.max(0, 60 - top);
      const target = Math.min(1, scroll / distance);
      const elapsed = previousTime ? Math.min(time - previousTime, 64) : 16;
      previousTime = time;
      current += (target - current) * (1 - Math.exp(-elapsed / 95));
      if (Math.abs(target - current) < 0.0001) current = target;

      const value = heroExpansionFrame(current);
      root.style.setProperty("--hero-inset", `${value.inset.toFixed(3)}px`);
      root.style.setProperty("--hero-radius", `${value.radius.toFixed(3)}px`);
      root.style.setProperty("--hero-image-height", `${value.imageHeight.toFixed(3)}%`);
      root.style.setProperty("--hero-image-feather", `${value.feather.toFixed(3)}px`);
      root.style.setProperty("--hero-image-scale", value.scale.toFixed(5));
      // The light veil travels with the copy, which remains in native page flow.
      root.style.setProperty("--hero-veil-y", `${-Math.min(scroll, stage.offsetHeight)}px`);
      root.dataset.heroExpansion = value.progress.toFixed(3);
      if (current !== target) frame = requestAnimationFrame(render);
      else previousTime = 0;
    };

    const schedule = () => {
      if (!frame && enabled && !document.hidden) frame = requestAnimationFrame(render);
    };
    const configure = () => {
      enabled = mobile.matches && !reduced.matches;
      root.dataset.mobileExpansion = enabled ? "on" : "off";
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      current = 0;
      schedule();
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      schedule();
    };

    configure();
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    observer.observe(stage);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", visibility);
    mobile.addEventListener("change", configure);
    reduced.addEventListener("change", configure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", visibility);
      mobile.removeEventListener("change", configure);
      reduced.removeEventListener("change", configure);
      delete root.dataset.mobileExpansion;
    };
  }, [ref]);
}
