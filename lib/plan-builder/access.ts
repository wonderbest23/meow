// 플랜 빌더 접근 권한 — 로그인 여부와 결제 여부를 서버 한 곳에서 판정한다.
// 화면과 API가 같은 규칙을 보도록 판정 로직을 여기서만 정의한다.

import { sectionKey, chaptersForType } from "./blueprint";
import { getAuthenticatedUser } from "../account-auth";
import { getServerSupabase } from "../persistence";

/** 결제 없이 볼 수 있는 섹션 수 (앞에서부터) — 1.1, 1.2 */
export const FREE_SECTION_COUNT = 2;

export type AccessReason = "ok" | "login_required" | "payment_required";

export interface PlanAccess {
  authenticated: boolean;
  email: string | null;
  /** 결제를 마쳐 전체가 열려 있는지 */
  paid: boolean;
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
 * 이 사용자가 결제를 마쳤는지.
 * 완료(done) 상태의 주문이 하나라도 있으면 열린 것으로 본다.
 */
async function hasPaidOrder(userId: string): Promise<boolean> {
  const supabase = getServerSupabase();
  // Supabase가 없으면(로컬 데모) 결제 확인을 할 수 없으므로 잠그지 않는다.
  if (!supabase) return true;
  const { data, error } = await supabase
    .from("payment_orders")
    .select("order_id")
    .eq("owner_id", userId)
    .eq("status", "done")
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** 현재 요청자의 플랜 빌더 접근 권한 */
export async function resolvePlanAccess(planType?: string): Promise<PlanAccess> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { authenticated: false, email: null, paid: false, freeKeys: freeSectionKeys(planType) };
  }
  return {
    authenticated: true,
    email: user.email ?? null,
    paid: await hasPaidOrder(user.id),
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
