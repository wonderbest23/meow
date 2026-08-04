// 플랜 빌더 접근 권한 — 로그인 여부와 결제 여부를 서버 한 곳에서 판정한다.
// 화면과 API가 같은 규칙을 보도록 판정 로직을 여기서만 정의한다.

import { sectionKey, chaptersForType } from "./blueprint";
import { getAuthenticatedUser } from "../account-auth";
import { paidPlanEntitlement, planPrice } from "../payments/plan-orders";

/** 결제 없이 볼 수 있는 섹션 수 (앞에서부터) — 1.1, 1.2 */
export const FREE_SECTION_COUNT = 2;

export type AccessReason = "ok" | "login_required" | "payment_required";

export interface PlanAccess {
  authenticated: boolean;
  email: string | null;
  /** 이 플랜(planId)이 결제로 열려 있는지 — 구 전체 이용권이면 항상 true */
  paid: boolean;
  /** 구 전체 이용권 보유 여부 */
  allAccess: boolean;
  /** 결제 이력이 하나라도 있는지 (샘플 노출 판단용) */
  hasAnyPaid: boolean;
  /** 이 유형의 가격 */
  price: number;
  /** 무료로 열리는 섹션 키 (플랜 유형 기준 앞 2개) */
  freeKeys: string[];
}

/** 유형에 맞는 순서에서 앞 N개 섹션 키 */
export function freeSectionKeys(planType?: string): string[] {
  const out: string[] = [];
  for (const ch of chaptersForType(planType)) {
    for (const s of ch.sections) {
      out.push(sectionKey(ch.id, s.id));
      if (out.length >= FREE_SECTION_COUNT) return out;
    }
  }
  return out;
}

/**
 * 현재 요청자의 플랜 빌더 접근 권한.
 * 결제는 문서(플랜) 단위다 — planId가 있어야 그 플랜의 결제 여부를 판정한다.
 * planId 없이 부르면 paid는 구 전체 이용권일 때만 true다.
 */
export async function resolvePlanAccess(planType?: string, planId?: string): Promise<PlanAccess> {
  const price = planPrice(planType);
  const user = await getAuthenticatedUser();
  if (!user) {
    return { authenticated: false, email: null, paid: false, allAccess: false, hasAnyPaid: false, price, freeKeys: freeSectionKeys(planType) };
  }
  const ent = await paidPlanEntitlement(user.id);
  return {
    authenticated: true,
    email: user.email ?? null,
    paid: ent.allAccess || (planId ? ent.planIds.has(planId) : false),
    allAccess: ent.allAccess,
    hasAnyPaid: ent.allAccess || ent.planIds.size > 0,
    price,
    freeKeys: freeSectionKeys(planType),
  };
}

/**
 * 이 섹션을 생성할 수 있는지 판정한다.
 * 로그인하지 않았으면 아무것도 못 하고, 결제 전에는 앞 2개만 된다.
 */
export function checkSectionAccess(access: PlanAccess, key: string): AccessReason {
  if (!access.authenticated) return "login_required";
  if (access.paid) return "ok";
  return access.freeKeys.includes(key) ? "ok" : "payment_required";
}

/** 전체 섹션 수 (안내 문구용) */
export function totalSectionsForType(planType?: string): number {
  return chaptersForType(planType).reduce((n, ch) => n + ch.sections.length, 0);
}

/** 청사진 전체에서의 무료 구간 라벨 (예: "1.1 한눈에 보기, 1.2 문제와 해결") */
export function freeSectionLabels(planType?: string): string[] {
  const keys = new Set(freeSectionKeys(planType));
  const out: string[] = [];
  const chapters = chaptersForType(planType);
  chapters.forEach((ch, ci) => {
    ch.sections.forEach((s, si) => {
      const k = sectionKey(ch.id, s.id);
      if (keys.has(k)) out.push(`${ci + 1}.${si + 1} ${s.title}`);
    });
  });
  return out;
}
