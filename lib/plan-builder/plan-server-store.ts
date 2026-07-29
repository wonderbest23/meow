// 플랜 빌더 서버 저장 — Supabase 설정 시 plan_states 테이블, 아니면 프로세스 메모리(데모).
// 소유권은 owner_hash(guest_token_hash)로 앱 레벨 검증.

import { getServerSupabase } from "../persistence";

export interface ServerBusinessProfile {
  name: string;
  description: string;
  role: string;
  industry: string;
  region: string;
  stage: string;
}

export interface ServerPlanState {
  title: string;
  planType: string;
  business: ServerBusinessProfile;
  sections: Record<string, { markdown: string; html: string; generatedAt: string }>;
}

const EMPTY_BUSINESS: ServerBusinessProfile = { name: "", description: "", role: "", industry: "", region: "", stage: "" };

const EMPTY: ServerPlanState = {
  title: "새 플랜",
  planType: "창업 초기 · 사업계획서",
  business: { ...EMPTY_BUSINESS },
  sections: {},
};

// dev/데모용 인메모리 폴백(서버 프로세스 생존 동안 유지)
const memoryStore = new Map<string, ServerPlanState>();

export async function loadPlanState(ownerHash: string): Promise<ServerPlanState> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return memoryStore.get(ownerHash) ?? { ...EMPTY };
  }
  const { data, error } = await supabase
    .from("plan_states")
    .select("title, plan_type, data")
    .eq("owner_hash", ownerHash)
    .maybeSingle();
  if (error || !data) return { ...EMPTY, business: { ...EMPTY_BUSINESS } };
  const payload = data.data as { sections?: ServerPlanState["sections"]; business?: Partial<ServerBusinessProfile> } | null;
  return {
    title: data.title ?? EMPTY.title,
    planType: data.plan_type ?? EMPTY.planType,
    business: { ...EMPTY_BUSINESS, ...(payload?.business ?? {}) },
    sections: payload?.sections ?? {},
  };
}

export async function savePlanState(ownerHash: string, state: ServerPlanState): Promise<void> {
  const b = state.business ?? EMPTY_BUSINESS;
  const clean: ServerPlanState = {
    title: (state.title || EMPTY.title).slice(0, 120),
    planType: (state.planType || EMPTY.planType).slice(0, 120),
    business: {
      name: (b.name || "").slice(0, 120),
      description: (b.description || "").slice(0, 1000),
      role: (b.role || "").slice(0, 60),
      industry: (b.industry || "").slice(0, 60),
      region: (b.region || "").slice(0, 80),
      stage: (b.stage || "").slice(0, 60),
    },
    sections: state.sections ?? {},
  };
  const supabase = getServerSupabase();
  if (!supabase) {
    memoryStore.set(ownerHash, clean);
    return;
  }
  await supabase.from("plan_states").upsert(
    {
      owner_hash: ownerHash,
      title: clean.title,
      plan_type: clean.planType,
      data: { sections: clean.sections, business: clean.business },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_hash" },
  );
}
