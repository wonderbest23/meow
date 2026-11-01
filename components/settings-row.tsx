import Link from "next/link";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import type { FormEventHandler, ReactNode } from "react";
import styles from "./settings-row.module.css";

/*
 * 설정 화면 공용 부품(lovable 구조 3단계) — 내 계정 · 고객센터 · 환경설정 · 보안 · 기기 및 앱 · 약관이 같은 것을 쓴다.
 * 시안: docs/design/settings-mock/Main.dc.html · Support.dc.html(PC), Mobile.dc.html(휴대폰 행 카드),
 *       docs/design/lovable-mock/MPref.dc.html(휴대폰 흰 띠).
 *
 * PC: 제목 20/500(행간 25 · 자간 -0.2) + 설명 14 회색 4px 아래 + 오른쪽 도움말 링크 →
 *     소제목 16/500(위 24 · 카드까지 16 · 카드 뒤 32) → 행 카드 r16 안쪽 20×24, 행 위아래 20, 1px 구분선,
 *     행 제목 14/500 + 설명 14 회색 왼쪽, 오른쪽에 단추(AppButton compact) · 입력칸(AppField compact 288) · 배지(StatusBadge 24).
 * 휴대폰: mobile="card" — 안쪽 16 · 행 16(Mobile.dc) / mobile="band" — 흰 띠, 제목 17/500 + 설명 15, 항목 위아래 24(MPref).
 * 색은 --app-* 토큰만(settings-row.module.css). 단추·입력칸·배지 모양은 각 공용 부품이 정한다 — 여기서는 자리만.
 */
export type SettingsMobile = "card" | "band";

/**
 * 화면 제목 줄 — h1 + 설명, 오른쪽(aside)에 도움말 링크·전환 단추.
 * 휴대폰에서 mobile="hidden" 이면 위 56px 머리의 제목이 대신하므로 화면에서 감추고 읽기 프로그램에만 남긴다(Mobile.dc)
 */
export function SettingsHeader({ title, description, aside, mobile = "card", id }: { title: ReactNode; description?: ReactNode; aside?: ReactNode; mobile?: SettingsMobile | "hidden"; id?: string }) {
  return <header className={styles.top} data-mobile={mobile}>
    <div className={styles.topText}>
      <h1 id={id} className={styles.title}>{title}</h1>
      {description && <p className={styles.lead}>{description}</p>}
    </div>
    {aside && <div className={styles.topAside}>{aside}</div>}
  </header>;
}

/** 제목 줄 오른쪽 '도움말'·'이용 안내' 링크 */
export function SettingsHelpLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className={styles.doc}><BookOpen size={16} strokeWidth={1.8} aria-hidden="true" />{children}</Link>;
}

/** 소제목 + 설명 + (오른쪽 동작) + 행 카드 */
export function SettingsSection({ id, title, description, aside, children, label }: { id?: string; title?: ReactNode; description?: ReactNode; aside?: ReactNode; children: ReactNode; label?: string }) {
  const headingId = id ? `${id}-title` : undefined;
  return <section id={id} className={styles.section} aria-labelledby={title ? headingId : undefined} aria-label={title ? undefined : label}>
    {(title || aside) && <div className={styles.sechead}>
      <div className={styles.secText}>
        {title && <h2 id={headingId} className={styles.h2}>{title}</h2>}
        {description && <p className={styles.sub}>{description}</p>}
      </div>
      {aside && <div className={styles.secAside}>{aside}</div>}
    </div>}
    {children}
  </section>;
}

/** 행 카드 — 휴대폰에서 card(Mobile.dc) 또는 band(MPref 흰 띠) */
export function SettingsCard({ children, mobile = "card", as = "div", onSubmit, ...rest }: { children: ReactNode; mobile?: SettingsMobile; as?: "div" | "form"; onSubmit?: FormEventHandler<HTMLFormElement>; "aria-busy"?: boolean; "aria-label"?: string }) {
  if (as === "form") return <form {...rest} onSubmit={onSubmit} className={styles.card} data-mobile={mobile} data-settings-card="">{children}</form>;
  return <div {...rest} className={styles.card} data-mobile={mobile} data-settings-card="">{children}</div>;
}

type RowProps = {
  /** 행 제목(14/500) — titleFor 를 주면 그 입력칸의 <label> 이 된다 */
  title: ReactNode;
  description?: ReactNode;
  /** 오른쪽 — 단추·입력칸·배지·토글 */
  control?: ReactNode;
  /** 제목 앞 — 20px 글자 아바타 등 */
  leading?: ReactNode;
  /** 세로로 쌓는다(여러 줄 입력칸 · 확인 칸처럼 폭 전체가 필요한 행) */
  stack?: boolean;
  /** 휴대폰 흰 띠(band)에서도 오른쪽에 둔다(토글) — 단추·선택칸은 띠에서 설명 아래로 내려간다 */
  inline?: boolean;
  titleFor?: string;
  titleId?: string;
  descriptionId?: string;
  /** 제목 굵기 400(자주 묻는 질문처럼 제목만 있는 행) */
  plain?: boolean;
  /** 행 전체가 링크 — 오른쪽 끝에 › */
  href?: string;
  /** 행 전체가 단추(같은 화면 안 이동 — 예: 최근 문의 → 문의 내역) — 오른쪽 끝에 › */
  onSelect?: () => void;
  id?: string;
  children?: ReactNode;
};

/** 행 하나 — 제목 + 설명 왼쪽, 동작 오른쪽, 사이 1px 구분선 */
export function SettingsRow({ title, description, control, leading, stack = false, inline = false, titleFor, titleId, descriptionId, plain = false, href, onSelect, id, children }: RowProps) {
  const Title = titleFor ? "label" : onSelect ? "span" : "p";
  const text = <div className={styles.text}>
    <Title className={styles.t} id={titleId} htmlFor={titleFor} data-plain={plain || undefined}>{title}</Title>
    {description && (onSelect ? <span className={styles.d} id={descriptionId}>{description}</span> : <p className={styles.d} id={descriptionId}>{description}</p>)}
  </div>;
  const body = <>
    {leading ? <div className={styles.lead2}>{leading}{text}</div> : text}
    {control && <div className={styles.right}>{control}</div>}
    {(href || onSelect) && <ChevronRight className={styles.chev} size={16} aria-hidden="true" />}
    {children}
  </>;
  if (href) return <Link id={id} href={href} className={styles.row} data-link="" data-inline={inline || undefined}>{body}</Link>;
  if (onSelect) return <button id={id} type="button" className={styles.row} data-link="" data-inline={inline || undefined} onClick={onSelect}>{body}</button>;
  return <div id={id} className={styles.row} data-stack={stack || undefined} data-inline={inline || undefined}>{body}</div>;
}

/** 20px 글자 아바타(r6) — 내 사업 행 · 설정 메뉴 '내 계정' */
export function SettingsAvatar({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "soft" }) {
  return <span className={styles.ava} data-tone={tone} aria-hidden="true">{children}</span>;
}

/** 켜고 끄는 단추 46×28 — 실제 체크박스(role=switch) */
export function SettingsToggle({ checked, onChange, label, describedBy, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; describedBy?: string; disabled?: boolean }) {
  return <input type="checkbox" role="switch" className={styles.switch} checked={checked} disabled={disabled} aria-label={label} aria-describedby={describedBy} onChange={event => onChange(event.target.checked)} />;
}

/** 알약형 전환(문의하기 / 문의 내역 n) — 바깥 r999 테두리, 항목 32px */
export function SettingsSegment<T extends string>({ items, value, onChange, label }: { items: Array<{ value: T; label: ReactNode; count?: number }>; value: T; onChange: (value: T) => void; label: string }) {
  return <div className={styles.seg} role="group" aria-label={label}>
    {items.map(item => <button key={item.value} type="button" aria-pressed={item.value === value} onClick={() => onChange(item.value)}>
      {item.label}{item.count ? <span className={styles.segCount}>{item.count}</span> : null}
    </button>)}
  </div>;
}

/** 안내 띠 — r16 노란 바탕 + 오른쪽 작은 단추(28) */
export function SettingsNote({ icon, title, description, action }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <div className={styles.note} role="status">
    {icon}
    <div className={styles.noteText}><p className={styles.noteTitle}>{title}</p>{description && <p className={styles.noteDesc}>{description}</p>}</div>
    {action && <div className={styles.noteAction}>{action}</div>}
  </div>;
}

/** 펼치는 행(자주 묻는 질문 · 문의 내역) — 실제 <details>, 제목 줄은 행과 같은 모양 */
export function SettingsDisclosure({ title, description, control, open, onToggle, plain = false, children }: { title: ReactNode; description?: ReactNode; control?: ReactNode; open?: boolean; onToggle?: (open: boolean) => void; plain?: boolean; children: ReactNode }) {
  return <details className={styles.disclosure} open={open} onToggle={onToggle ? event => onToggle(event.currentTarget.open) : undefined}>
    <summary className={styles.summary}>
      <span className={styles.text}><span className={styles.t} data-plain={plain || undefined}>{title}</span>{description && <span className={styles.d}>{description}</span>}</span>
      {control && <span className={styles.right}>{control}</span>}
      <ChevronDown className={styles.chevDown} size={16} aria-hidden="true" />
    </summary>
    <div className={styles.panel}>{children}</div>
  </details>;
}
