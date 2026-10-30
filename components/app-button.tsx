import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./app-button.module.css";

/** 버튼 종류 — 주 동작·보조 동작·글자만·지우기 같은 위험 동작 네 가지 */
export type AppButtonVariant = "primary" | "secondary" | "text" | "danger";
/** 크기 — 기본 44px, 목록 안 작은 동작용 36px(누르는 자리는 44px 로 넓힌다) */
export type AppButtonSize = "default" | "small";

type Shared = { variant?: AppButtonVariant; size?: AppButtonSize; className?: string; children: ReactNode };
type AsButton = Shared & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined; as?: undefined; loading?: boolean; ref?: Ref<HTMLButtonElement> };
type AsLink = Shared & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; as?: "link" | "a"; prefetch?: boolean; replace?: boolean; scroll?: boolean; loading?: undefined; ref?: Ref<HTMLAnchorElement> };
export type AppButtonProps = AsButton | AsLink;

/**
 * 앱 공통 버튼. 모양은 app-button.module.css 한 곳에서만 정한다.
 * className 은 자리(여백·너비·정렬)용이다 — 높이·색·글자를 덮어쓰지 않는다.
 * href 를 주면 링크로 그린다(기본은 next/link, 바깥 주소·내려받기는 as="a").
 * loading 이면 앞에 도는 표시를 두고 누르지 못하게 한다.
 */
export function AppButton(props: AppButtonProps) {
  const { variant = "primary", size = "default", className, children } = props;
  const classes = className ? `${styles.button} ${className}` : styles.button;
  if (props.href !== undefined) {
    const { variant: _variant, size: _size, className: _className, children: _children, as, href, prefetch, replace, scroll, loading: _loading, ...rest } = props;
    if (as === "a") return <a {...rest} href={href} className={classes} data-variant={variant} data-size={size}>{children}</a>;
    return <Link {...rest} href={href} prefetch={prefetch} replace={replace} scroll={scroll} className={classes} data-variant={variant} data-size={size}>{children}</Link>;
  }
  const { variant: _variant, size: _size, className: _className, children: _children, loading = false, disabled, type = "button", as: _as, href: _href, ...rest } = props;
  return <button {...rest} type={type} className={classes} data-variant={variant} data-size={size} disabled={disabled || loading} aria-busy={loading || undefined}>
    {loading && <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />}{children}
  </button>;
}
