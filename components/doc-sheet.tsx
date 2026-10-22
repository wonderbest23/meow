"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { X } from "lucide-react";
import { nativePlatform } from "../lib/native-app";
import styles from "./doc-sheet.module.css";

/*
 * 약관·안내 문서 보기 — 웹에서는 새 창(새 탭)으로, 앱(아이폰·안드로이드) 안에서는 이 화면 위에 띄운다.
 * 앱 안에서 새 창 링크를 누르면 앱 밖(사파리)으로 나가거나 아무 일도 없어서, 결제 동의를 하던 화면을 잃었다(점검 2026-10-21).
 * 문서는 같은 사이트 주소라 화면 안 틀(iframe)로 그대로 연다.
 */
function DocSheet({ href, title, onDone }: { href: string; title: string; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={styles.sheet} aria-label={title} onCancel={event => { event.preventDefault(); onDone(); }}>
    <header className={styles.head}>
      <strong>{title}</strong>
      <button type="button" className={styles.close} onClick={onDone} aria-label="닫기"><X aria-hidden="true" /></button>
    </header>
    <iframe className={styles.frame} src={href} title={title} />
  </dialog>;
}

/** 문서를 화면 위에 띄운다 — 닫으면 끝난다 */
export function openDocSheet(href: string, title: string): Promise<void> {
  return new Promise(resolve => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const done = () => { root.unmount(); host.remove(); opener?.focus({ preventScroll: true }); resolve(); };
    root.render(<DocSheet href={href} title={title} onDone={done} />);
  });
}

/** 문서 링크 — 웹은 새 창, 앱 안은 화면 위 문서 보기 */
export function DocLink({ href, title, className, children, "aria-label": ariaLabel }: { href: string; title: string; className?: string; children: ReactNode; "aria-label"?: string }) {
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!nativePlatform() || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    void openDocSheet(href, title);
  };
  return <a href={href} target="_blank" rel="noreferrer" className={className} aria-label={ariaLabel} onClick={open}>{children}</a>;
}
