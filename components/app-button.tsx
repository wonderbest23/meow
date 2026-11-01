import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./app-button.module.css";

/**
 * 버튼 종류 — 주 동작·보조 동작(1px 테두리)·글자만·지우기 같은 위험 동작 네 가지,
 * 그리고 설정 행 카드(lovable 구조 3단계)의 회색 14% 채움(soft) · 빨간 테두리(dangerOutline, 탈퇴로 가는 첫 단추)
 */
export type AppButtonVariant = "primary" | "secondary" | "text" | "danger" | "soft" | "dangerOutline";
/**
 * 크기 — 기본 44px, 목록 안 작은 동작용 36px(누르는 자리는 44px 로 넓힌다).
 * 설정 화면: compact 32px(행 카드 단추) · mini 28px(안내 띠 단추) · adaptive(PC · 휴대폰 32px — 환경설정·보안의 흰 띠 항목, lovable 실측)
 * · large 48px r12(휴대폰 계정 설정 맨 아래)
 */
export type AppButtonSize = "default" | "small" | "compact" | "mini" | "adaptive" | "large";

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
