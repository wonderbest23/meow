import type { HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import styles from "./app-field.module.css";

const join = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base);

/**
 * 앱 공통 입력칸. 모양은 app-field.module.css 한 곳에서만 정한다(높이 44px·모서리 8px·테두리 --app-line·포커스 링).
 * className 은 자리(너비·여백·정렬)용이다 — 높이·테두리·색·글자를 덮어쓰지 않는다.
 * 오류는 aria-invalid 로 테두리를 바꾸고, 오류·도움말 줄의 id 를 aria-describedby 로 잇는다.
 */
export function TextField({ className, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input {...rest} ref={ref} className={join(styles.control, className)} data-app-field="input" />;
}

/** 여러 줄 입력칸 — 높이는 min-height(88px)부터, 세로로만 늘린다 */
export function TextArea({ className, ref, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea {...rest} ref={ref} className={join(styles.control, className)} data-app-field="textarea" />;
}

export function Select({ className, ref, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return <select {...rest} ref={ref} className={join(styles.control, className)} data-app-field="select">{children}</select>;
}

/** 라벨 — 글자(.875rem/600) 아래에 입력칸을 둔다. 입력칸을 감싸거나 htmlFor 로 잇는다 */
export function FieldLabel({ className, children, ...rest }: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }) {
  return <label {...rest} className={join(styles.label, className)} data-app-field="label">{children}</label>;
}

/** 도움말 한 줄 — id 를 입력칸의 aria-describedby 에 넣는다 */
export function FieldHelp({ className, children, ...rest }: HTMLAttributes<HTMLParagraphElement> & { children: ReactNode }) {
  return <p {...rest} className={join(styles.help, className)} data-app-field="help">{children}</p>;
}

/** 오류 한 줄 — id 를 입력칸의 aria-describedby 에 넣고 입력칸에는 aria-invalid 를 단다 */
export function FieldError({ className, children, ...rest }: HTMLAttributes<HTMLParagraphElement> & { children: ReactNode }) {
  return <p {...rest} className={join(styles.error, className)} data-app-field="error">{children}</p>;
}

/**
 * 앞뒤에 단위·접두어가 붙는 입력칸(예: '/launch/' + 주소, 금액 + '원') — 겉 상자가 입력칸 모양과 포커스 링을 그린다.
 * 안쪽 <input> 은 테두리 없이 상자를 채운다. 라벨 안에 둘 때는 as="span", 상자 자체가 라벨이면 as="label".
 */
export function FieldGroup({ as: Tag = "div", className, children, ...rest }: HTMLAttributes<HTMLElement> & { as?: "div" | "label" | "span"; children: ReactNode }) {
  return <Tag {...rest} className={join(styles.group, className)} data-app-field="group">{children}</Tag>;
}
