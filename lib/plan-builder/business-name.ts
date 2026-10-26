/*
 * 사업 이름을 화면에 보일 때의 규칙(대표 결정 r41).
 *
 * 이름이 비면 화면마다 저장소 기본값 '새 플랜'이나 '이름 없는 사업'이 섞여 보였다 — 모든 화면에서 '이름 없는 사업'으로 부른다.
 * 저장된 값은 바꾸지 않는다(저장소는 이름이 비면 '새 플랜'을 적어 두므로, 그 값도 이름이 빈 것으로 본다). 표시만 바꾼다.
 */
import { readCoach } from "./coach";

export const UNNAMED_BUSINESS = "이름 없는 사업";

/* 저장소가 이름이 빌 때 적어 두는 기본값 — 사용자가 정한 이름이 아니다 */
const STORE_DEFAULT_TITLES = new Set(["새 플랜"]);

export function isUnnamedBusiness(title: string | null | undefined): boolean {
  const text = (title ?? "").trim();
  return !text || STORE_DEFAULT_TITLES.has(text);
}

/**
 * 화면에 보일 사업 이름 — 비었거나 저장소 기본값이면 '이름 없는 사업'.
 * 운영 중(operating)인 사업의 대화 임시 이름은 '내 사업 개선' — 머리줄과 목록이 같은 규칙(대표 결정 r41-2).
 */
export function businessDisplayName(title: string | null | undefined, options: { operating?: boolean } = {}): string {
  if (isUnnamedBusiness(title)) return UNNAMED_BUSINESS;
  return draftBusinessTitle((title ?? "").trim(), !!options.operating);
}

/** 목록(왼쪽 목록·내 사업·내 계정·고객센터)에 보일 사업 이름 — '이미 사업 중이에요'로 시작한 사업인지는 저장된 대화(coach)로 본다 */
export function planDisplayName(plan: { title: string | null | undefined; answers?: Record<string, Record<string, unknown>> | null }): string {
  return businessDisplayName(plan.title, { operating: readCoach(plan.answers ?? {})?.stage === "operating" });
}

/*
 * 대화 시작 때 붙는 임시 이름 — '이미 사업 중이에요'(운영 중)로 시작한 대화는 머리줄에 '새 사업 구상' 대신 '내 사업 개선'(대표 결정 r41).
 * 저장된 이름은 그대로 두고 머리줄 표시만 바꾼다.
 */
export const OPERATING_DRAFT_TITLE = "내 사업 개선";
const DRAFT_TITLES = new Set(["새 사업 구상", "새 사업"]);

export function draftBusinessTitle(title: string, operating: boolean): string {
  return operating && DRAFT_TITLES.has(title.trim()) ? OPERATING_DRAFT_TITLE : title;
}
