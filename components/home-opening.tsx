"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { HomeCinematicHero } from "./home-cinematic-hero";
import { HomePhoneStory } from "./home-phone-story";
import { openingHandoff } from "../lib/home-sequence-motion";
import styles from "./home-opening.module.css";

export function HomeOpening(props: ComponentProps<typeof HomeCinematicHero>) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    const story = element?.querySelector<HTMLElement>("#how");
    if (!element || !story) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    const draw = () => {
      raf = 0;
      const frame = openingHandoff(story.getBoundingClientRect().top, innerHeight, innerWidth <= 700, reduced.matches);
      element.dataset.openingMotion = reduced.matches ? "off" : "on";
      element.style.setProperty("--opening-inset", `${frame.inset.toFixed(3)}%`);
      element.style.setProperty("--opening-radius", `${frame.radius.toFixed(2)}px`);
      element.style.setProperty("--opening-phone-y", `${frame.phoneY.toFixed(2)}px`);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const resize = new ResizeObserver(schedule);
    resize.observe(story);
    resize.observe(element);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    draw();
    return () => {
      resize.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, []);
  return <div className={styles.opening} ref={root}>
    <HomeCinematicHero {...props} />
    <HomePhoneStory />
  </div>;
}
