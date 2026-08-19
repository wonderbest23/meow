// 플랜 빌더 접근 권한 — 로그인 여부와 결제 여부를 서버 한 곳에서 판정한다.
// 화면과 API가 같은 규칙을 보도록 판정 로직을 여기서만 정의한다.

import { sectionKey, chaptersForType } from "./blueprint";
import { getAuthenticatedUser } from "../account-auth";
import { paidPlanEntitlement, planPrice } from "../payments/plan-orders";

/** 결제 없이 볼 수 있는 섹션 수 (앞에서부터) — 1.1, 1.2 */
export const FREE_SECTION_COUNT = 2;

/**
 * 결제 없이 AI 본문을 맛볼 수 있는 문서 수.
 *
 * 무료 2개 섹션은 '문서마다' 열린다. 그런데 문서는 몇 개든 만들 수 있어서,
 * 문서를 열 개 만들면 결제 없이 본문 스무 개가 나갔다 — 그만큼이 실비다.
 * 사업 아이템을 몇 개 견주어 보는 것은 정상적인 사용이라 문서 만들기 자체를
 * 막지는 않는다. 대신 '무료로 본문을 써 본 문서'를 세 개까지만 센다.
 * 계정당 무료 생성은 3 × 2 = 6회가 상한이 된다.
 */
export const FREE_PLAN_LIMIT = 3;

/**
 * 이 문서에서 무료 생성을 더 해도 되는지.
 *
 * '무료로 써 본 문서'는 결제되지 않았으면서 본문이 하나라도 만들어진 문서다.
 * 지금 문서가 이미 그중 하나면 계속 쓸 수 있다 — 두 번째 무료 섹션을 쓰다가
 * 갑자기 막히면 안 된다.
 */
export function freePlanLimitReached(
  planId: string | undefined,
  plans: Array<{ id: string; sections?: Record<string, { markdown?: string } | undefined> | null }>,
  paidPlanIds: Set<string>,
): boolean {
  const used = new Set<string>();
  for (const p of plans) {
    if (!p?.id || paidPlanIds.has(p.id)) continue;
    const hasBody = Object.values(p.sections ?? {}).some((sec) => Boolean(sec?.markdown));
    if (hasBody) used.add(p.id);
  }
  if (planId && used.has(planId)) return false;
  return used.size >= FREE_PLAN_LIMIT;
}

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
  /** 결제로 열린 문서 id — 무료 문서 수를 셀 때 제외한다 */
  paidPlanIds: Set<string>;
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
    return { authenticated: false, email: null, paid: false, allAccess: false, hasAnyPaid: false, price, freeKeys: freeSectionKeys(planType), paidPlanIds: new Set() };
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
    paidPlanIds: ent.planIds,
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
