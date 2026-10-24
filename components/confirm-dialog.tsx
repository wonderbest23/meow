"use client";

import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import styles from "./confirm-dialog.module.css";

/*
 * 확인창 — window.confirm / alert 대신 쓴다.
 * 앱(iOS)에서 window.confirm 은 Capacitor 가 띄우는 기본 창이라 단추가 영어("Cancel", "Ok")로 나왔고(2026-10-17 점검),
 * 웹에서도 "oneulstart.com 내용:" 같은 브라우저 창이 떠 화면과 어울리지 않았다. 같은 모양의 한국어 창으로 바꾼다.
 */
type ConfirmOptions = {
  message: string;
  title?: string;
  confirmLabel?: string;
  /** 없으면 단추가 하나뿐인 안내창 */
  cancelLabel?: string | null;
  /** 지우기·탈퇴처럼 되돌릴 수 없는 일 — 확인 단추를 빨갛게 */
  danger?: boolean;
  /** 단추 글이 긴 안내(예: '결제하고 홈페이지 고치기') — 넓은 화면에서 창을 넓히고 단추 글을 한 줄로 */
  wide?: boolean;
  /** 글 입력칸(링크 주소 입력, 복사할 주소 보여 주기) — window.prompt 대신 */
  input?: { label: string; value: string; readOnly?: boolean; type?: "text" | "url" };
};

function ConfirmSheet({ options, onDone }: { options: ConfirmOptions; onDone: (ok: boolean, text?: string) => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    ref.current?.showModal();
    // 입력칸이 있으면 글자를 모두 골라 둔다 — 복사할 주소는 바로 복사하고, 링크 주소는 바로 고쳐 쓸 수 있게
    if (field.current) { field.current.focus(); field.current.select(); }
  }, []);
  const finish = (ok: boolean) => onDone(ok, ok ? field.current?.value : undefined);
  const cancelLabel = options.cancelLabel === undefined ? "취소" : options.cancelLabel;
  return <dialog ref={ref} className={styles.dialog} data-wide={options.wide || undefined} aria-labelledby={options.title ? "confirm-dialog-title" : undefined} aria-describedby="confirm-dialog-message"
    onCancel={event => { event.preventDefault(); finish(false); }}
    onClick={event => { if (event.target === event.currentTarget) finish(false); }}>
    <form method="dialog" onSubmit={event => { event.preventDefault(); finish(true); }}>
      <div className={styles.body}>
        {options.title && <h2 id="confirm-dialog-title">{options.title}</h2>}
        <p id="confirm-dialog-message">{options.message}</p>
        {options.input && <input ref={field} className={styles.field} aria-label={options.input.label} type={options.input.type ?? "text"} defaultValue={options.input.value} readOnly={options.input.readOnly} autoComplete="off" autoCapitalize="off" spellCheck={false} onFocus={event => { if (options.input?.readOnly) event.currentTarget.select(); }} />}
      </div>
      <div className={styles.actions} data-single={cancelLabel ? undefined : ""}>
        {cancelLabel && <button type="button" className={styles.cancel} autoFocus={!options.input} onClick={() => finish(false)}>{cancelLabel}</button>}
        <button type="submit" className={styles.confirm} data-danger={options.danger || undefined} autoFocus={!cancelLabel && !options.input}>{options.confirmLabel ?? "확인"}</button>
      </div>
    </form>
  </dialog>;
}

/** 예/아니오를 묻는다 — 확인을 누르면 true */
export async function askConfirm(options: ConfirmOptions | string): Promise<boolean> {
  return (await openSheet(typeof options === "string" ? { message: options } : options)).ok;
}

/** 글을 받는다 — 취소하면 null (window.prompt 대신) */
export async function askText(options: Omit<ConfirmOptions, "input" | "danger"> & { label: string; value?: string; type?: "text" | "url" }): Promise<string | null> {
  const { label, value, type, ...rest } = options;
  const result = await openSheet({ ...rest, input: { label, value: value ?? "", type } });
  return result.ok ? result.text ?? "" : null;
}

/** 복사가 막혔을 때 — 주소를 골라 둔 칸을 보여 주고 직접 복사하게 한다 */
export async function showCopyText(text: string, message = "아래 주소를 길게 눌러 복사해 주세요.") {
  await openSheet({ title: "주소 복사", message, cancelLabel: null, confirmLabel: "닫기", input: { label: "복사할 주소", value: text, readOnly: true } });
}

function openSheet(opts: ConfirmOptions): Promise<{ ok: boolean; text?: string }> {
  return new Promise(resolve => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let settled = false;
    const done = (ok: boolean, text?: string) => {
      if (settled) return; settled = true;
      root.unmount(); host.remove();
      opener?.focus({ preventScroll: true });
      resolve({ ok, text });
    };
    root.render(<ConfirmSheet options={opts} onDone={done} />);
  });
}

/** 알리기만 한다 — 단추 하나 */
export async function showNotice(message: string, options: { title?: string; confirmLabel?: string } = {}) {
  await askConfirm({ message, ...options, cancelLabel: null });
}
