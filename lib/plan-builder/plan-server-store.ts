// 플랜 빌더 서버 저장 — Supabase 설정 시 plan_states 테이블, 아니면 프로세스 메모리(데모).
// 소유권은 owner_hash(guest_token_hash)로 앱 레벨 검증.

import { getServerSupabase } from "../persistence";

export interface ServerPlanState {
  title: string;
  planType: string;
  sections: Record<string, { markdown: string; html: string; generatedAt: string }>;
}

const EMPTY: ServerPlanState = { title: "새 플랜", planType: "창업 초기 · 사업계획서", sections: {} };

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
  if (error || !data) return { ...EMPTY };
  const sections = (data.data as { sections?: ServerPlanState["sections"] })?.sections ?? {};
  return { title: data.title ?? EMPTY.title, planType: data.plan_type ?? EMPTY.planType, sections };
}

export async function savePlanState(ownerHash: string, state: ServerPlanState): Promise<void> {
  const clean: ServerPlanState = {
    title: (state.title || EMPTY.title).slice(0, 120),
    planType: (state.planType || EMPTY.planType).slice(0, 120),
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
      data: { sections: clean.sections },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_hash" },
  );
}
