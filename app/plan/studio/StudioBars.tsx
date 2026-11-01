"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, Lock, Pencil, Plus, LayoutGrid } from "lucide-react";
import { PopMenu, type PopMenuGroup, type PopMenuItem } from "./PopMenu";
import styles from "./Studio.module.css";
import { askText } from "../../../components/confirm-dialog";
import { isSamplePlan, loadState, renamePlan, subscribePlanState, type Plan } from "../../../lib/plan-builder/plan-store";
import { businessDisplayName } from "../../../lib/plan-builder/business-name";
import { newChatHref, studioHref, STUDIO_TAB_LABELS, type StudioTab } from "../../../lib/plan-builder/studio";

/*
 * 작업실 위 막대의 부품(lovable 구조 2단계 — 시안 PcStudio.dc.html · MChat.dc.html).
 * - BizMenu: 사업명 ▾ — 이름 바꾸기 · 다른 사업으로 옮기기 · 모든 사업 보기 · 새 대화
 * - PageSelect: 미리보기 판의 페이지 선택(사업계획서 · 홈페이지 · 개업 준비 · 유지보수) — 예전 네 칸 탭을 흡수, 진행은 작은 점/배지로
 * - ToolButton: 위 막대 아이콘 단추(28px 알약 · 이름은 aria-label · title)
 */

/** 이 기기에 저장된 다른 사업(예시 제외) — 최근 고친 순 6개 */
function otherPlans(planId: string): Plan[] {
  try {
    return loadState().plans.filter(item => item.id !== planId && !isSamplePlan(item.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  } catch { return []; }
}

export function BizMenu({ planId, title, canRename, onRenamed, className, label, align = "start" }: {
  planId: string; title: string; canRename: boolean; onRenamed: (title: string) => void; className: string;
  /** 단추 안 내용(PC: 이름 ▾ · 휴대폰: 이름 알약) */
  label: ReactNode; align?: "start" | "center";
}) {
  const [others, setOthers] = useState<Plan[]>([]);
  useEffect(() => { setOthers(otherPlans(planId)); return subscribePlanState(() => setOthers(otherPlans(planId))); }, [planId]);
  const rename = async () => {
    const next = await askText({ title: "사업 이름 바꾸기", message: "홈페이지 이름은 홈페이지 화면에서 따로 바꿔요.", label: "사업 이름", value: title, confirmLabel: "저장", cancelLabel: "취소" });
    const trimmed = next?.trim().slice(0, 100);
    if (!trimmed || trimmed === title) return;
    renamePlan(planId, trimmed);
    /* 이 기기 저장본에 없는 사업이면 renamePlan 이 아무것도 하지 않는다 — 그때는 머리줄 이름도 그대로 둔다 */
    if (loadState().plans.find(item => item.id === planId)?.title === trimmed) onRenamed(trimmed);
  };
  const groups: PopMenuGroup[] = [
    { key: "this", items: canRename ? [{ key: "rename", label: "이름 바꾸기", icon: <Pencil />, onSelect: () => void rename() }] : [] },
    { key: "others", heading: "다른 사업", items: others.map(item => ({ key: item.id, label: businessDisplayName(item.title), icon: <b className={styles.menuAvatar}>{businessDisplayName(item.title).slice(0, 1)}</b>, href: studioHref(item.id, "chat") })) },
    { key: "more", items: [
      { key: "all", label: "모든 사업 보기", icon: <LayoutGrid />, href: "/plan?view=all" },
      { key: "new", label: "새 대화", icon: <Plus />, href: newChatHref() },
    ] },
  ];
  return <PopMenu label={label} buttonClassName={className} buttonTitle={`${title} — 사업 전환 · 이름 바꾸기`} groups={groups} menuLabel="사업 메뉴" align={align} />;
}

export type PageOption = { id: Exclude<StudioTab, "chat">; label: string; done: boolean; current: boolean; locked: string | null; unread: boolean };

export function PageSelect({ options, value, status, live, onSelect, className, placement = "below", align = "center" }: {
  options: PageOption[]; value: Exclude<StudioTab, "chat">;
  /** 지금 보는 페이지의 진행(예: 작성 중 3/10) — 선택기 안 작은 글 */
  status?: string; live?: boolean;
  onSelect: (id: Exclude<StudioTab, "chat">) => void; className: string; placement?: "below" | "above"; align?: "center" | "start" | "end";
}) {
  const shown = options.find(item => item.id === value);
  const items: PopMenuItem[] = options.map(item => ({
    key: item.id,
    label: item.label,
    current: item.id === value,
    title: item.locked ?? undefined,
    ariaLabel: `${item.label}${item.done ? " (완료)" : item.current ? " (지금 단계)" : ""}${item.locked ? ` (${item.locked})` : ""}${item.unread ? " (새 소식)" : ""}`,
    trail: <>{item.unread && <i className={styles.newsDot} aria-hidden="true" />}{item.locked ? <Lock aria-hidden="true" /> : item.done ? <Check className={styles.doneMark} aria-hidden="true" /> : item.current ? <i className={styles.stepDot} aria-hidden="true" /> : null}</>,
    onSelect: () => onSelect(item.id),
  }));
  const unread = options.some(item => item.unread && item.id !== value);
  return <PopMenu wide placement={placement} align={align} buttonClassName={className} buttonLabel={`보는 페이지: ${shown?.label ?? STUDIO_TAB_LABELS[value]}${status ? ` · ${status}` : ""}${unread ? " (다른 페이지에 새 소식)" : ""} — 페이지 바꾸기`} menuLabel="페이지 선택" groups={[{ key: "pages", items }]}
    label={<>
      <i className={styles.selectDot} data-state={shown?.done ? "done" : shown?.locked ? "locked" : "current"} data-live={live || undefined} aria-hidden="true" />
      <span className={styles.selectName}>{shown?.label ?? STUDIO_TAB_LABELS[value]}</span>
      {status && <span className={styles.selectStatus} aria-hidden="true">{status}</span>}
      {unread && <i className={styles.newsDot} aria-hidden="true" />}
      <ChevronDown className={styles.selectChevron} aria-hidden="true" />
    </>} />;
}

export function ToolButton({ label, icon, onClick, disabled, title, className, pressed }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; title?: string; className?: string; pressed?: boolean }) {
  return <button type="button" className={className ?? styles.tool} aria-label={label} title={title ?? label} disabled={disabled} aria-pressed={pressed} onClick={onClick}>{icon}</button>;
}
