// 플랜 빌더 서버 저장 — Supabase 설정 시 plan_states 테이블, 아니면 프로세스 메모리(데모).
// 소유권은 owner_hash(guest_token_hash)로 앱 레벨 검증.
// 구조: 사업 1개 + 플랜 여러 개.

import { getServerSupabase } from "../persistence";

export interface ServerBusinessProfile {
  name: string;
  description: string;
  role: string;
  industry: string;
  region: string;
  stage: string;
}

export interface ServerPlan {
  id: string;
  title: string;
  planType: string;
  createdAt: string;
  updatedAt: string;
  sections: Record<string, { markdown: string; html: string; generatedAt: string }>;
  answers: Record<string, Record<string, unknown>>;
}

export interface ServerPlanState {
  business: ServerBusinessProfile;
  plans: ServerPlan[];
  activePlanId: string | null;
}

const EMPTY_BUSINESS: ServerBusinessProfile = { name: "", description: "", role: "", industry: "", region: "", stage: "" };

const EMPTY: ServerPlanState = {
  business: { ...EMPTY_BUSINESS },
  plans: [],
  activePlanId: null,
};

// dev/데모용 인메모리 폴백(서버 프로세스 생존 동안 유지)
const memoryStore = new Map<string, ServerPlanState>();

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** 저장 전 정규화 — 길이 제한, 형태 보정 */
export function normalizeState(input: Partial<ServerPlanState> | null | undefined): ServerPlanState {
  const b = (input?.business ?? {}) as Partial<ServerBusinessProfile>;
  const plans = Array.isArray(input?.plans) ? input!.plans! : [];
  return {
    business: {
      name: str(b.name, 120),
      description: str(b.description, 1000),
      role: str(b.role, 60),
      industry: str(b.industry, 60),
      region: str(b.region, 80),
      stage: str(b.stage, 60),
    },
    plans: plans.slice(0, 30).map((p) => ({
      id: str(p?.id, 60) || `plan_${Math.random().toString(36).slice(2, 10)}`,
      title: str(p?.title, 120) || "새 플랜",
      planType: str(p?.planType, 120) || "창업 초기 · 사업계획서",
      createdAt: str(p?.createdAt, 40) || new Date().toISOString(),
      updatedAt: str(p?.updatedAt, 40) || new Date().toISOString(),
      sections: p?.sections && typeof p.sections === "object" ? p.sections : {},
      answers: p?.answers && typeof p.answers === "object" ? p.answers : {},
    })),
    activePlanId: typeof input?.activePlanId === "string" ? input.activePlanId.slice(0, 60) : null,
  };
}

export async function loadPlanState(ownerHash: string): Promise<ServerPlanState> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return memoryStore.get(ownerHash) ?? { ...EMPTY, business: { ...EMPTY_BUSINESS } };
  }
  const { data, error } = await supabase
    .from("plan_states")
    .select("data")
    .eq("owner_hash", ownerHash)
    .maybeSingle();
  if (error || !data) return { ...EMPTY, business: { ...EMPTY_BUSINESS } };
  return normalizeState(data.data as Partial<ServerPlanState>);
}

export async function savePlanState(ownerHash: string, state: ServerPlanState): Promise<void> {
  const clean = normalizeState(state);
  const supabase = getServerSupabase();
  if (!supabase) {
    memoryStore.set(ownerHash, clean);
    return;
  }
  const active = clean.plans.find((p) => p.id === clean.activePlanId) ?? clean.plans[0];
  await supabase.from("plan_states").upsert(
    {
      owner_hash: ownerHash,
      // 목록 조회 편의를 위해 대표값은 컬럼에도 보관
      title: clean.business.name || active?.title || "새 플랜",
      plan_type: active?.planType || "창업 초기 · 사업계획서",
      data: clean,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_hash" },
  );
}
