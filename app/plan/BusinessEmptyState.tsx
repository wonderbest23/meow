import { ChevronRight, FolderOpen, LogIn, MessageSquareText, type LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import hub from "./BusinessHub.module.css";
import styles from "./BusinessEmptyState.module.css";
import { MISSING_BUSINESS_DETAIL, MISSING_BUSINESS_TITLE } from "../../lib/plan-builder/missing-business";
import { AppButton } from "../../components/app-button";

export type EmptyStateHeading = "h1" | "h2" | "h3" | "p";
export type EmptyStateProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  /** lucide 아이콘 — 28px · --app-muted 로 그린다 */
  icon?: LucideIcon;
  title: ReactNode;
  /** 제목 태그 — 화면 제목 순서에 맞춰 고른다(모양은 같다). 제목이 아닌 한 줄 안내면 "p" */
  heading?: EmptyStateHeading;
  description?: ReactNode;
  /** 동작 버튼 — AppButton(primary·secondary) 을 넣는다 */
  actions?: ReactNode;
  as?: "section" | "div";
};

/**
 * 앱 공통 빈 화면. 모양은 BusinessEmptyState.module.css 한 곳에서만 정한다.
 * className 은 자리(높이·너비·바깥 여백)용이다 — 여백·글자·색을 덮어쓰지 않는다.
 * children 은 버튼 아래 덧붙이는 짧은 안내(예: 기록 기간)용이다.
 */
export function EmptyState({ icon: Icon, title, heading: Title = "h2", description, actions, as: Tag = "div", className, children, ...rest }: EmptyStateProps) {
  return <Tag {...rest} className={className ? `${styles.root} ${className}` : styles.root} data-empty-state="">
    {Icon && <Icon className={styles.icon} size={28} strokeWidth={1.75} aria-hidden="true" data-empty-part="icon" />}
    <Title className={styles.title} data-empty-part="title">{title}</Title>
    {description && <p className={styles.description} data-empty-part="description">{description}</p>}
    {actions && <div className={styles.actions} data-empty-part="actions">{actions}</div>}
    {children}
  </Tag>;
}

/*
 * 내 사업·대화 화면의 빈 화면 — 공통 EmptyState 에 문구만 고른다.
 * heading="h2" — 머리줄에 이미 h1(예: '내 사업')이 있는 화면. 화면 읽기 제목이 h1 두 개가 되지 않게 한 단계 낮추고 모양은 그대로 둔다(점검 r41-A).
 */
export default function BusinessEmptyState({ kind = "planning", heading = "h1" }: { kind?: "planning" | "plans" | "missing" | "loggedOut"; heading?: "h1" | "h2" }) {
  /*
   * 로그인하지 않았으면(또는 로그인이 풀렸으면) '사업이 없어요'라고 하지 않는다 — 사업이 지워진 줄 알았다.
   * 로그인부터 안내하고, 처음이면 바로 시작할 수 있게 둔다.
   */
  if (kind === "loggedOut") return <EmptyState as="section" className={hub.emptyPlace} data-business-empty={kind} icon={LogIn} heading={heading} title="로그인하면 내 사업이 보여요" actions={<>
    <AppButton variant="primary" href="/account?next=%2Fplan">로그인<ChevronRight size={18} aria-hidden="true" /></AppButton>
    <AppButton variant="secondary" href="/plan/chat?new=1">처음이면 바로 시작하기</AppButton>
  </>} />;
  /* 설명은 찾지 못한 경우에만 — 비어 있을 땐 제목과 단추면 충분하다 */
  return <EmptyState as="section" className={hub.emptyPlace} data-business-empty={kind} icon={kind === "plans" ? FolderOpen : MessageSquareText} heading={heading}
    title={kind === "missing" ? MISSING_BUSINESS_TITLE : kind === "plans" ? "아직 등록된 사업이 없어요" : "아직 진행 중인 기획이 없어요"}
    description={kind === "missing" ? MISSING_BUSINESS_DETAIL : undefined}
    actions={<>
      <AppButton variant="primary" href="/plan/chat?new=1">시작하기<ChevronRight size={18} aria-hidden="true" /></AppButton>
      {kind === "missing" && <AppButton variant="secondary" href="/plan">내 사업 목록으로</AppButton>}
    </>} />;
}
