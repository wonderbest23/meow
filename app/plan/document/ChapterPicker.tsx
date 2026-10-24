"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, FileText } from "lucide-react";
import styles from "./DocumentWorkspace.module.css";

/**
 * 작업실 PC 머리줄 가운데 알약 — '📄 1장 사업 개요 1 / 5 ⌄'. 누르면 장 목록(+ 전체 이어 읽기)이 열린다.
 * 예전 PC 작업실은 문서 왼쪽에 목차 칸(190px)이 있어 본문이 좁았다(작업실 새 화면 2026-10-24).
 * 키보드: 단추에서 Enter·Space·↓ 로 열고, 목록 안은 ↑↓·Home·End 로 옮기고 Enter 로 고른다. Esc·Tab·바깥 누르기로 닫고 초점은 단추로 돌아온다.
 * 목록은 문서 맨 위(body)에 띄운다 — 머리줄 안에 두면 아래 오른쪽 카드가 목록 윗부분을 덮었다.
 */
export type ChapterPick = number | "all";
export default function ChapterPicker({ chapters, current, onSelect }: { chapters: string[]; current: ChapterPick | "summary"; onSelect: (pick: ChapterPick) => void }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const total = chapters.length;
  const items = (): HTMLElement[] => [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
  /* 단추 바로 아래 가운데 — 화면 밖으로 나가지 않게 양옆 16px 안으로 */
  useLayoutEffect(() => {
    if (!open) { setPlace(null); return; }
    const measure = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const width = menu.current?.offsetWidth ?? 260;
      const center = rect.left + rect.width / 2;
      setPlace({ top: rect.bottom + 6, left: Math.max(16, Math.min(center - width / 2, innerWidth - width - 16)) });
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", close); };
  }, [open]);
  /* 열면 지금 보는 장에 초점 — 화면 낭독기도 어디에 있는지 바로 듣는다 */
  useEffect(() => {
    if (!open) return;
    const list = items();
    (list.find(item => item.getAttribute("aria-checked") === "true") ?? list[0])?.focus({ preventScroll: true });
    const close = (event: PointerEvent) => { const target = event.target as Node; if (!wrap.current?.contains(target) && !menu.current?.contains(target)) setOpen(false); };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
  const choose = (pick: ChapterPick) => { setOpen(false); button.current?.focus(); onSelect(pick); };
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (index: number) => { event.preventDefault(); list[(index + list.length) % list.length]?.focus(); };
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); }
    else if (event.key === "Tab") { event.preventDefault(); setOpen(false); button.current?.focus(); }
  };
  const label = current === "summary" ? "한 장 요약" : current === "all" ? "전체 이어 읽기" : `${current + 1}장 ${chapters[current] ?? ""}`;
  const count = current === "summary" ? "" : current === "all" ? `${total}장` : `${current + 1} / ${total}`;
  return <div ref={wrap} className={styles.picker}>
    <button ref={button} type="button" className={styles.pickerButton} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      aria-label={`지금 보는 곳: ${label}${count ? ` (${count})` : ""} — 장 고르기`} disabled={!total}
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true); } }}>
      <FileText size={14} aria-hidden="true" /><b>{label}</b>{count && <span className={styles.pickerCount}>{count}</span>}<ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menu} id={menuId} className={styles.pickerMenu} role="menu" aria-label="사업계획서 장 고르기" onKeyDown={onMenuKey}
      style={place ? { top: place.top, left: place.left } : { top: -9999, left: 0 }}>
      {chapters.map((name, index) => <button key={`${index}:${name}`} type="button" role="menuitemradio" aria-checked={current === index} tabIndex={-1} onClick={() => choose(index)}>
        <span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong>
      </button>)}
      <button type="button" role="menuitemradio" aria-checked={current === "all"} tabIndex={-1} className={styles.pickerAll} onClick={() => choose("all")}><strong>전체 이어 읽기</strong></button>
    </div>, document.body)}
  </div>;
}
