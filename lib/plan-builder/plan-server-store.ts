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
  sections: Record<
    string,
    {
      markdown: string;
      html: string;
      generatedAt: string;
      /** 사용자가 직접 고쳤는지 */
      edited?: boolean;
      /** 다시 생성이 덮어쓰지 못하게 잠금 */
      locked?: boolean;
      /** 되돌리기용 직전 본문 */
      previous?: { markdown: string; html: string };
    }
  >;
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

/*
 * 병합 저장.
 *
 * 예전에는 클라이언트가 보낸 상태로 서버를 통째로 갈아끼웠다. 그러면
 * 오래된 로컬 캐시를 든 브라우저(다른 기기, 오래 열린 탭)가 저장할 때마다
 * 최신 서버 플랜이 조용히 사라진다 — 실측에서 검증 플랜 5개가 이렇게 지워졌다.
 *
 * 플랜은 id 기준으로 합치고, 같은 id면 updatedAt이 최신인 쪽을 남긴다.
 * 페이로드에 없는 서버 플랜은 지우지 않는다 — 삭제는 deletePlanById로만 한다.
 */
function mergeStates(stored: ServerPlanState, incoming: ServerPlanState): ServerPlanState {
  const byId = new Map(stored.plans.map((p) => [p.id, p]));
  for (const p of incoming.plans) {
    const prev = byId.get(p.id);
    if (!prev || (p.updatedAt || "") >= (prev.updatedAt || "")) byId.set(p.id, p);
  }
  const plans = [...byId.values()].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return {
    // 사업 정보는 이름이 있는 쪽 우선(수정 화면에서 온 값), 둘 다 있으면 들어온 값
    business: incoming.business.name ? incoming.business : stored.business.name ? stored.business : incoming.business,
    plans,
    activePlanId:
      incoming.activePlanId && byId.has(incoming.activePlanId)
        ? incoming.activePlanId
        : stored.activePlanId && byId.has(stored.activePlanId)
          ? stored.activePlanId
          : plans[0]?.id ?? null,
  };
}

export async function savePlanState(ownerHash: string, state: ServerPlanState): Promise<void> {
  const stored = await loadPlanState(ownerHash);
  const clean = mergeStates(stored, normalizeState(state));
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

/** 플랜 삭제 — 병합 저장에서는 페이로드 누락이 삭제가 아니므로, 삭제는 이 경로로만 한다. */
export async function deletePlanById(ownerHash: string, planId: string): Promise<void> {
  const stored = await loadPlanState(ownerHash);
  const plans = stored.plans.filter((p) => p.id !== planId);
  if (plans.length === stored.plans.length) return;
  const next: ServerPlanState = {
    business: stored.business,
    plans,
    activePlanId: stored.activePlanId === planId ? plans[0]?.id ?? null : stored.activePlanId,
  };
  const supabase = getServerSupabase();
  if (!supabase) {
    memoryStore.set(ownerHash, next);
    return;
  }
  const active = next.plans.find((p) => p.id === next.activePlanId) ?? next.plans[0];
  await supabase.from("plan_states").upsert(
    {
      owner_hash: ownerHash,
      title: next.business.name || active?.title || "새 플랜",
      plan_type: active?.planType || "창업 초기 · 사업계획서",
      data: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_hash" },
  );
}
