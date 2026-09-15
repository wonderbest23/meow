"use client";

import { useEffect, type RefObject } from "react";
import { homeCopyFrame } from "../lib/home-copy-motion";

export function useHomeCopyMotion(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const groups = Array.from(root.querySelectorAll<HTMLElement>("[data-home-copy]")).map(element => ({
      element,
      parts: Array.from(element.children).filter((part): part is HTMLElement => part instanceof HTMLElement && part.matches("h2, h3, p")),
    }));
    let frame = 0;
    const update = () => {
      frame = 0;
      root.dataset.copyMotion = reduced.matches ? "off" : "on";
      // Measure the stationary group and layout offsets, never the moving text.
      const changes = groups.flatMap(group => {
        const top = group.element.getBoundingClientRect().top;
        return group.parts.map(part => ({
          part,
          motion: homeCopyFrame({
            top: top + part.offsetTop,
            height: part.offsetHeight,
            viewportHeight: window.innerHeight,
            body: part.tagName === "P",
            reduced: reduced.matches,
          }),
        }));
      });
      for (const { part, motion } of changes) {
        part.style.setProperty("--home-copy-opacity", motion.opacity.toFixed(5));
        part.style.setProperty("--home-copy-y", `${motion.y.toFixed(3)}px`);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    groups.forEach(group => resize.observe(group.element));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
      delete root.dataset.copyMotion;
      groups.forEach(group => group.parts.forEach(part => {
        part.style.removeProperty("--home-copy-opacity");
        part.style.removeProperty("--home-copy-y");
      }));
    };
  }, [ref]);
}
