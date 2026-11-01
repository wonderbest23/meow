"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import styles from "./PopMenu.module.css";

/*
 * 작업실 위 막대 · 휴대폰 아래 막대의 작은 메뉴(사업명 ▾ · 페이지 선택 · … · ＋) — 단추를 누르면 바로 아래(또는 위)에 목록이 열린다.
 * 키보드: 열면 첫 항목(고른 항목이 있으면 그것)에 초점, ↑↓·Home·End 로 옮기고 Enter 로 고른다. Esc · Tab · 바깥 누르기로 닫고
 * 초점은 단추로 돌아온다(대화 칸 '고칠 곳 고르기'와 같은 방식).
 */
export type PopMenuItem = {
  key: string;
  label: ReactNode;
  /** 낭독기용 이름 — label 에 그림·배지가 섞였을 때 */
  ariaLabel?: string;
  icon?: ReactNode;
  /** 오른쪽 끝 작은 표시(✓ · 점 · 자물쇠) */
  trail?: ReactNode;
  /** 고른 항목(페이지 선택) */
  current?: boolean;
  disabled?: boolean;
  title?: string;
  href?: string;
  external?: boolean;
  onSelect?: () => void;
};
export type PopMenuGroup = { key: string; heading?: string; items: PopMenuItem[] };

export function PopMenu({ label, buttonClassName, buttonLabel, buttonTitle, groups, align = "start", placement = "below", menuLabel, wide = false, disabled = false, children }: {
  /** 단추 안 내용 */
  label: ReactNode;
  buttonClassName: string;
  /** 단추의 낭독기 이름(아이콘 단추) */
  buttonLabel?: string;
  buttonTitle?: string;
  groups: PopMenuGroup[];
  align?: "start" | "end" | "center";
  placement?: "below" | "above";
  menuLabel: string;
  /** 목록 폭을 단추 폭에 맞춘다(페이지 선택 260) */
  wide?: boolean;
  disabled?: boolean;
  /** 목록 맨 위에 덧붙일 것(이름 바꾸기 입력칸 등) — 있으면 첫 초점은 그 안의 입력칸 */
  children?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const items = () => [...(wrap.current?.querySelectorAll<HTMLElement>("[data-pop-item]:not([aria-disabled=true])") ?? [])];
  const close = (focus = true) => { setOpen(false); if (focus) button.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    if (!open) return;
    const list = items();
    const field = wrap.current?.querySelector<HTMLElement>("[data-pop-extra] input, [data-pop-extra] textarea");
    (field ?? list.find(item => item.getAttribute("aria-checked") === "true") ?? list[0])?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- 열 때 한 번
  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if ((event.target as HTMLElement).closest("[data-pop-extra]")) return;
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (index: number) => { event.preventDefault(); list[(index + list.length) % list.length]?.focus(); };
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Tab") { event.preventDefault(); close(); }
  };
  const radio = groups.some(group => group.items.some(item => item.current !== undefined));
  return <div ref={wrap} className={styles.wrap} data-wide={wide || undefined}>
    <button ref={button} type="button" className={buttonClassName} aria-label={buttonLabel} title={buttonTitle} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={disabled} onClick={() => setOpen(value => !value)}>{label}</button>
    {open && <div id={menuId} className={styles.menu} role="menu" aria-label={menuLabel} data-align={align} data-placement={placement} onKeyDown={onKey}>
      {children && <div data-pop-extra className={styles.extra}>{children(() => close())}</div>}
      {groups.filter(group => group.items.length).map((group, index) => <div key={group.key} role="group" aria-label={group.heading} className={styles.group} data-first={index === 0 && !children || undefined}>
        {group.heading && <p className={styles.heading} aria-hidden="true">{group.heading}</p>}
        {group.items.map(item => {
          const body = <>{item.icon && <span className={styles.icon} aria-hidden="true">{item.icon}</span>}<span className={styles.text}>{item.label}</span>{item.trail && <span className={styles.trail}>{item.trail}</span>}</>;
          const common = { "data-pop-item": "", role: radio && item.current !== undefined ? "menuitemradio" : "menuitem", "aria-checked": radio && item.current !== undefined ? item.current : undefined, "aria-label": item.ariaLabel, title: item.title, tabIndex: -1, className: styles.item } as const;
          if (item.href && !item.disabled) return item.external
            ? <a key={item.key} {...common} href={item.href} target="_blank" rel="noreferrer" onClick={() => close(false)}>{body}</a>
            : <Link key={item.key} {...common} href={item.href} onClick={() => close(false)}>{body}</Link>;
          return <button key={item.key} type="button" {...common} aria-disabled={item.disabled || undefined} onClick={() => { if (item.disabled) return; close(); item.onSelect?.(); }}>{body}</button>;
        })}
      </div>)}
    </div>}
  </div>;
}
