"use client";

import { ArrowRight, ImagePlus } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import { runBrainwaveButton } from "../lib/landing/brainwave/button-action";
import type { BrainwaveOverrides, BrainwavePick } from "./brainwave-page";
import { isPlaceholderPhoto } from "../lib/landing/domain";

/*
 * Figma 디자인을 흐름 배치로 옮긴 사업 템플릿들이 함께 쓰는 조각.
 * 글·사진·버튼은 킷과 같은 노드 id 로 읽고 쓴다 — 편집기에서 누르면 그 자리가 고쳐진다.
 */
export type BusinessDesignProps = {
  overrides: BrainwaveOverrides;
  hidden: Set<string>;
  sectionOrder: string[];
  onPick?: BrainwavePick;
  desktop?: boolean;
};

type Tag = "p" | "h1" | "h2" | "h3" | "strong" | "span";

/** 등장 순서 — 숫자는 같은 줄 안의 차례, "title" 은 큰 제목(더 크게 떠오른다) */
export type Reveal = number | { order: number; kind: "title" };
export function revealProps(reveal?: Reveal): { "data-reveal"?: string; style?: CSSProperties } {
  if (reveal === undefined) return {};
  const order = typeof reveal === "number" ? reveal : reveal.order;
  return { "data-reveal": typeof reveal === "number" ? "" : reveal.kind, style: { "--r": order } as CSSProperties };
}

/*
 * 애플식 스크롤 연출.
 *  - [data-reveal]: 화면에 들어오면 data-in 이 붙어 떠오른다(CSS 는 brainwave-business-motion.module.css).
 *  - [data-scroll]: 스크롤 진행을 CSS 변수로 준다. --pass 는 요소가 화면 위로 지나간 정도(0→1),
 *    --view 는 화면을 가로지른 정도(0→1). 첫 화면 사진 확대·마무리 사진 시차에 쓴다.
 * 편집 화면(enabled=false)과 '움직임 줄이기' 설정에서는 아무것도 하지 않는다.
 */
export function useKitMotion(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    /*
     * 홈페이지 관리 화면의 미리보기 상자는 스크롤되지 않는 축소 화면이다. 거기서 등장 효과를 켜면
     * 상자 아래쪽 섹션은 화면에 '들어오는' 일이 없어 빈 색 상자로 남았다 — 미리보기는 정지 화면으로 둔다.
     */
    if (root.closest(".hk-preview-body")) return;
    root.dataset.motion = "on";
    const reveals = [...root.querySelectorAll<HTMLElement>("[data-reveal]")];
    let observed = false;
    const io = new IntersectionObserver(entries => {
      observed = true;
      for (const entry of entries) if (entry.isIntersecting) { (entry.target as HTMLElement).dataset.in = ""; io.unobserve(entry.target); }
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach(el => io.observe(el));
    // 관찰자가 아예 동작하지 않는 환경(축소 미리보기 등)에서는 내용이 숨은 채 남지 않게 모두 연다
    const failsafe = window.setTimeout(() => { if (!observed) reveals.forEach(el => { el.dataset.in = ""; }); }, 1500);
    const scrolls = [...root.querySelectorAll<HTMLElement>("[data-scroll]")];
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight || 1;
      for (const el of scrolls) {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--pass", Math.min(1, Math.max(0, -r.top / Math.max(1, r.height))).toFixed(3));
        el.style.setProperty("--view", Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height))).toFixed(3));
      }
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    // capture — 미리보기 상자처럼 페이지 안에서 스크롤되는 곳도 잡는다
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.clearTimeout(failsafe);
      io.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      delete root.dataset.motion;
      reveals.forEach(el => { delete el.dataset.in; });
      scrolls.forEach(el => { el.style.removeProperty("--pass"); el.style.removeProperty("--view"); });
    };
  }, [enabled]);
  return ref;
}


export function kitPieces({ overrides, hidden, onPick }: BusinessDesignProps, classes: { button: string; photoSlot: string }) {
  const text = (id: string) => (hidden.has(id) ? "" : overrides.texts?.[id] ?? "");
  /*
   * 킷 견본·템플릿 기본 사진은 사업 페이지에 쓰지 않는다(isPlaceholderPhoto).
   * 비워 두면 편집 화면에서는 '사진 넣기' 자리가 대신 나온다.
   */
  const image = (id: string) => {
    const url = hidden.has(id) ? "" : overrides.images?.[id] ?? "";
    return isPlaceholderPhoto(url) ? "" : url;
  };
  /* 같은 사진은 공개 화면에서 한 번만 — 편집 화면은 자리마다 보여 줘 바꿀 수 있게 */
  const shown = new Set<string>();
  const photo = (id: string) => {
    const url = image(id);
    if (!url || (!onPick && shown.has(url))) return "";
    shown.add(url);
    return url;
  };
  /*
   * 아래 조각들은 컴포넌트가 아니라 함수로 부른다. 렌더 안에서 만든 컴포넌트는
   * 매번 새 종류라 다시 그릴 때마다 요소가 새로 붙고, 편집 중인 글 칸이 날아간다.
   */
  const Text = ({ id, as: Element = "p", className, reveal }: { id: string; as?: Tag; className?: string; reveal?: Reveal }) => {
    const value = text(id);
    if (!value) return null;
    return <Element className={className} {...revealProps(reveal)} data-bw-text={onPick ? id : undefined} onClick={onPick ? event => { event.stopPropagation(); onPick("text", id, event.currentTarget as HTMLElement); } : undefined}>{value}</Element>;
  };
  const Button = ({ buttonId, textId, className, reveal }: { buttonId: string; textId: string; className?: string; reveal?: Reveal }) => {
    const label = text(textId);
    if (!label || hidden.has(buttonId)) return null;
    return <button type="button" className={className ?? classes.button} {...revealProps(reveal)} data-bw-btn={buttonId} onClick={event => {
      event.stopPropagation();
      if (onPick) onPick("button", buttonId, event.currentTarget);
      else runBrainwaveButton(overrides.links, buttonId);
    }}><span>{label}</span><ArrowRight size={18} aria-hidden /></button>;
  };
  const Photo = ({ id, url, className, kenburns }: { id: string; url: string; className?: string; kenburns?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={url} alt="" loading={kenburns ? "eager" : "lazy"} data-kenburns={kenburns ? "" : undefined} data-bw-image={onPick ? id : undefined} onClick={onPick ? event => { event.stopPropagation(); onPick("image", id, event.currentTarget); } : undefined} />
  );
  /* 편집 화면에만 — 사진이 없는 자리에 사진을 넣을 곳 */
  const PhotoSlot = ({ id, className }: { id: string; className?: string }) => onPick
    ? <button type="button" className={`${classes.photoSlot} ${className ?? ""}`} data-bw-image={id} onClick={event => { event.stopPropagation(); onPick("image", id, event.currentTarget); }}><ImagePlus size={20} aria-hidden /> 사진 넣기</button>
    : null;
  /*
   * 섹션 순서 — 사장님이 편집기에서 바꾼 순서가 있으면 그대로, 없으면 디자인 순서.
   * 킷 좌표 순서를 쓰면 첫 화면 위에 겹쳐 있던 머리글이 첫 화면 아래로 밀린다.
   */
  const ordered = (sectionOrder: string[], drawn: string[]) => (overrides.order?.length
    ? [...sectionOrder.filter(id => drawn.includes(id)), ...drawn.filter(id => !sectionOrder.includes(id))]
    : drawn).filter(id => !hidden.has(id));
  /* 여러 줄 글을 공개 화면에서는 한 줄씩 떠오르게 — 편집 화면에서는 한 덩어리로 두고 그 자리에서 고친다 */
  const lines = (id: string) => (onPick ? [] : text(id).split("\n").map(line => line.trim()).filter(Boolean));
  return { text, photo, lines, Text, Button, Photo, PhotoSlot, ordered };
}
