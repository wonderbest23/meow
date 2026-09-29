"use client";

import { ArrowRight, ImagePlus } from "lucide-react";
import { runBrainwaveButton } from "../lib/landing/brainwave/button-action";
import type { BrainwaveOverrides, BrainwavePick } from "./brainwave-page";

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

export const isKitSamplePhoto = (url: string) => url.startsWith("/brainwave/");

export function kitPieces({ overrides, hidden, onPick }: BusinessDesignProps, classes: { button: string; photoSlot: string }) {
  const text = (id: string) => (hidden.has(id) ? "" : overrides.texts?.[id] ?? "");
  /*
   * 킷 견본 사진(/brainwave/…)은 사업 페이지에 쓰지 않는다. 예전에 만든 페이지에는
   * 견본 사진이 그대로 남아 있어, 반찬가게 첫 화면에 손목시계가 깔렸다. 비워 두면
   * 편집 화면에서는 '사진 넣기' 자리가 대신 나온다.
   */
  const image = (id: string) => {
    const url = hidden.has(id) ? "" : overrides.images?.[id] ?? "";
    return isKitSamplePhoto(url) ? "" : url;
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
  const Text = ({ id, as: Element = "p", className }: { id: string; as?: Tag; className?: string }) => {
    const value = text(id);
    if (!value) return null;
    return <Element className={className} data-bw-text={onPick ? id : undefined} onClick={onPick ? event => { event.stopPropagation(); onPick("text", id, event.currentTarget as HTMLElement); } : undefined}>{value}</Element>;
  };
  const Button = ({ buttonId, textId, className }: { buttonId: string; textId: string; className?: string }) => {
    const label = text(textId);
    if (!label || hidden.has(buttonId)) return null;
    return <button type="button" className={className ?? classes.button} data-bw-btn={buttonId} onClick={event => {
      event.stopPropagation();
      if (onPick) onPick("button", buttonId, event.currentTarget);
      else runBrainwaveButton(overrides.links, buttonId);
    }}><span>{label}</span><ArrowRight size={18} aria-hidden /></button>;
  };
  const Photo = ({ id, url, className }: { id: string; url: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={url} alt="" loading="lazy" data-bw-image={onPick ? id : undefined} onClick={onPick ? event => { event.stopPropagation(); onPick("image", id, event.currentTarget); } : undefined} />
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
  return { text, photo, Text, Button, Photo, PhotoSlot, ordered };
}
