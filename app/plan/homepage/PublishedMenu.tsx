"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Copy, ExternalLink, EyeOff } from "lucide-react";
import { showCopyText } from "../../../components/confirm-dialog";
import styles from "./PublishedMenu.module.css";
import { AppButton } from "../../../components/app-button";

/**
 * 머리줄 '✓ 공개됨' — 누르면 작은 메뉴(주소 복사 · 새 창으로 보기 · 공개 멈추기). 예전엔 공개 뒤 이 단추가 잠겨 아무 일도 하지 않았다.
 * 공개 멈추기는 홈페이지 화면의 기존 기능(확인창 포함)을 그대로 부른다.
 * 키보드: Enter·Space·↓ 로 열고 ↑↓·Home·End 로 옮긴다. Esc·Tab·바깥 누르기로 닫고 초점은 단추로 돌아온다.
 * 메뉴는 body 에 띄운다 — 머리줄 안에 두면 아래 칸이 메뉴를 덮는다. body 는 /plan 틀 밖이라 plan-ui 를 붙여 전역 버튼 정규화(아이콘 숨김·44px)에서 뺀다.
 */
export default function PublishedMenu({ className, publicPath, disabled, onUnpublish, onCopied, children }: {
  className: string;
  publicPath: string;
  disabled?: boolean;
  onUnpublish: () => void;
  onCopied?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const items = (): HTMLElement[] => [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
  /* 단추 바로 아래, 오른쪽 끝을 단추에 맞춘다 — 화면 밖으로 나가지 않게 양옆 16px 안으로 */
  useLayoutEffect(() => {
    if (!open) { setPlace(null); return; }
    const measure = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const width = menu.current?.offsetWidth ?? 200;
      setPlace({ top: rect.bottom + 6, left: Math.max(16, Math.min(rect.right - width, innerWidth - width - 16)) });
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", close); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus({ preventScroll: true });
    const close = (event: PointerEvent) => { const target = event.target as Node; if (!button.current?.contains(target) && !menu.current?.contains(target)) setOpen(false); };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const finish = () => { setOpen(false); button.current?.focus(); };
  const url = () => `${window.location.origin}${publicPath}`;
  const copy = async () => {
    finish();
    try { await navigator.clipboard.writeText(url()); onCopied?.(); } catch { void showCopyText(url()); }
  };
  const view = () => { finish(); window.open(publicPath, "_blank", "noopener"); };
  const stop = () => { finish(); onUnpublish(); };
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (index: number) => { event.preventDefault(); list[(index + list.length) % list.length]?.focus(); };
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(); }
    else if (event.key === "Tab") { event.preventDefault(); finish(); }
  };
  return <>
    <AppButton ref={button} variant="secondary" size="small" className={className} data-done="" disabled={disabled}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true); } }}>
      {children}<ChevronDown size={14} aria-hidden="true" />
    </AppButton>
    {open && createPortal(<div ref={menu} id={menuId} className={`plan-ui ${styles.menu}`} role="menu" aria-label="공개한 홈페이지" onKeyDown={onMenuKey}
      style={place ? { top: place.top, left: place.left } : { top: -9999, left: 0 }}>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => void copy()}><Copy size={15} aria-hidden="true" />주소 복사</button>
      <button type="button" role="menuitem" tabIndex={-1} onClick={view}><ExternalLink size={15} aria-hidden="true" />새 창으로 보기</button>
      <button type="button" role="menuitem" tabIndex={-1} className={styles.danger} onClick={stop}><EyeOff size={15} aria-hidden="true" />공개 멈추기</button>
    </div>, document.body)}
  </>;
}
