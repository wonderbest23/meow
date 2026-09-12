// 플랜 빌더 서버 저장 — Supabase 설정 시 plan_states 테이블, 아니면 프로세스 메모리(데모).
// 소유권은 owner_hash(guest_token_hash)로 앱 레벨 검증.
// 구조: 사업 1개 + 플랜 여러 개.

import { getServerSupabase } from "../persistence";
import { readCoach } from "./coach";
import { planAccountLinkingEnabled } from "./account-linking";

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
      coachRevision?: number;
      /** 사용자가 직접 고쳤는지 */
      edited?: boolean;
      /** 다시 생성이 덮어쓰지 못하게 잠금 */
      locked?: boolean;
      /** 되돌리기용 직전 본문 */
      previous?: { markdown: string; html: string };
    }
  >;
  answers: Record<string, Record<string, unknown>>;
  /** 답변 이어받기 출처 — 화면 안내용 */
  inheritedFrom?: { title: string; count: number };
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
const memoryClaims = new Map<string, string>();

export async function planGuestWasClaimed(ownerHash: string): Promise<boolean> {
  if (!planAccountLinkingEnabled()) return false;
  const supabase = getServerSupabase();
  if (!supabase) return memoryClaims.has(ownerHash);
  const { data, error } = await supabase.from("plan_owner_claims").select("guest_hash").eq("guest_hash", ownerHash).maybeSingle();
  if (error) throw new Error("PLAN_CLAIM_FAILED");
  return !!data;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/*
 * 저장 전 정규화 — 형태 보정과 문자열 길이 제한만 한다.
 *
 * 여기서 플랜을 개수로 잘라내면 안 된다. 예전에는 plans.slice(0, 30)이 있었고,
 * 이 함수는 읽기(loadPlanState)와 쓰기(savePlanState) 양쪽을 다 지난다.
 * mergeStates가 플랜을 createdAt 오름차순(오래된 것이 앞)으로 정렬하므로
 * slice(0, 30)은 '가장 최근에 만든 플랜'부터 버렸다 — 31번째를 만드는 순간
 * 사용자가 지우지도 않은 최신 플랜이 조용히 사라진다.
 *
 * 저장된 플랜은 사용자 데이터다. 삭제는 deletePlanById(사용자가 직접 지운 경우)로만 한다.
 * 화면에 몇 개를 보여줄지는 화면에서 정한다 — 저장 계층은 전부 보존한다.
 */
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
    plans: plans.map((p) => ({
      id: str(p?.id, 60) || `plan_${Math.random().toString(36).slice(2, 10)}`,
      title: str(p?.title, 120) || "새 플랜",
      planType: str(p?.planType, 120) || "창업 초기 · 사업계획서",
      createdAt: str(p?.createdAt, 40) || new Date().toISOString(),
      updatedAt: str(p?.updatedAt, 40) || new Date().toISOString(),
      sections: p?.sections && typeof p.sections === "object" ? p.sections : {},
      answers: p?.answers && typeof p.answers === "object" ? p.answers : {},
      ...(p?.inheritedFrom && typeof p.inheritedFrom === "object"
        ? { inheritedFrom: { title: str(p.inheritedFrom.title, 120), count: Number(p.inheritedFrom.count) || 0 } }
        : {}),
    })),
    activePlanId: typeof input?.activePlanId === "string" ? input.activePlanId.slice(0, 60) : null,
  };
}

export async function loadPlanState(ownerHash: string): Promise<ServerPlanState> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return structuredClone(memoryStore.get(ownerHash) ?? { ...EMPTY, business: { ...EMPTY_BUSINESS } });
  }
  const { data, error } = await supabase
    .from("plan_states")
    .select("data")
    .eq("owner_hash", ownerHash)
    .maybeSingle();
  if (error) throw new Error("PLAN_LOAD_FAILED");
  if (!data) return { ...EMPTY, business: { ...EMPTY_BUSINESS } };
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
    if (prev && (readCoach(prev.answers) || readCoach(p.answers))) {
      const previousRevision = readCoach(prev.answers)?.revision ?? 0;
      const incomingRevision = readCoach(p.answers)?.revision ?? 0;
      const newest = incomingRevision < previousRevision ? prev : incomingRevision > previousRevision ? p : (p.updatedAt || "") >= (prev.updatedAt || "") ? p : prev;
      const sections = { ...prev.sections };
      for (const [key, value] of Object.entries(p.sections)) {
        if (!sections[key] || value.generatedAt >= sections[key].generatedAt) sections[key] = value;
      }
      const previousJob = prev.answers.__coach_job;
      const incomingJob = p.answers.__coach_job;
      const job = !incomingJob ? previousJob : !previousJob ? incomingJob
        : String(incomingJob.updatedAt ?? "") >= String(previousJob.updatedAt ?? "") ? incomingJob : previousJob;
      const previousDeck = prev.answers.__deck_job;
      const incomingDeck = p.answers.__deck_job;
      const deck = !incomingDeck ? previousDeck : !previousDeck ? incomingDeck : String(incomingDeck.updatedAt ?? "") >= String(previousDeck.updatedAt ?? "") ? incomingDeck : previousDeck;
      byId.set(p.id, { ...newest, answers: { ...newest.answers, ...(job ? { __coach_job: job } : {}), ...(deck ? { __deck_job: deck } : {}) }, sections });
    } else if (!prev || (p.updatedAt || "") >= (prev.updatedAt || "")) {
      const previousDeck = prev?.answers.__deck_job;
      const incomingDeck = p.answers.__deck_job;
      const deck = !incomingDeck ? previousDeck : !previousDeck ? incomingDeck : String(incomingDeck.updatedAt ?? "") >= String(previousDeck.updatedAt ?? "") ? incomingDeck : previousDeck;
      byId.set(p.id, { ...p, answers: { ...p.answers, ...(deck ? { __deck_job: deck } : {}) } });
    }
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

/** Authenticated server code only: the browser cannot submit a source owner or imported state. */
export async function claimGuestPlanState(guestHash: string, accountHash: string): Promise<"claimed" | "consumed"> {
  if (guestHash === accountHash) return "claimed";
  const supabase = getServerSupabase();
  if (!supabase) {
    const claimed = memoryClaims.get(guestHash);
    if (claimed) return claimed === accountHash ? "claimed" : "consumed";
    const guest = memoryStore.get(guestHash) ?? EMPTY;
    if (guest.plans.some(plan => ["__coach_job", "__deck_job"].some(key => ["queued", "running"].includes(String(plan.answers[key]?.status))))) throw new Error("PLAN_CLAIM_BUSY");
    const account = memoryStore.get(accountHash) ?? EMPTY;
    if (memoryStore.has(guestHash)) memoryStore.set(accountHash, structuredClone(mergeStates(account, guest)));
    memoryStore.delete(guestHash);
    memoryClaims.set(guestHash, accountHash);
    return "claimed";
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const guestResult = await supabase.from("plan_states").select("data,updated_at").eq("owner_hash", guestHash).maybeSingle();
    const accountResult = await supabase.from("plan_states").select("data,updated_at").eq("owner_hash", accountHash).maybeSingle();
    if (guestResult.error || accountResult.error) throw new Error("PLAN_CLAIM_FAILED");
    const merged = mergeStates(normalizeState(accountResult.data?.data), normalizeState(guestResult.data?.data));
    const active = merged.plans.find(plan => plan.id === merged.activePlanId) ?? merged.plans[0];
    const { data, error } = await supabase.rpc("claim_plan_state", {
      p_guest_hash: guestHash, p_account_hash: accountHash,
      p_guest_at: guestResult.data?.updated_at ?? null, p_account_at: accountResult.data?.updated_at ?? null,
      p_data: merged, p_title: merged.business.name || active?.title || "새 플랜", p_plan_type: active?.planType || "창업 초기 · 사업계획서",
    });
    if (error) throw new Error("PLAN_CLAIM_FAILED");
    if (data === "claimed" || data === "consumed") return data;
    if (data === "busy") throw new Error("PLAN_CLAIM_BUSY");
    if (data !== "conflict") throw new Error("PLAN_CLAIM_FAILED");
  }
  throw new Error("PLAN_VERSION_CONFLICT");
}

/** Browser autosaves may edit documents, but cannot create or replace server job/context records. */
export function preserveServerCoachRecords(incoming: ServerPlanState, stored: ServerPlanState): ServerPlanState {
  const keys = ["__business_coach", "__coach_job", "__coach_generation", "__business_edit_history", "__deck_job"];
  return { ...incoming, plans: incoming.plans.map(plan => {
    const saved = stored.plans.find(item => item.id === plan.id);
    const answers = { ...plan.answers };
    for (const key of keys) {
      if (saved?.answers[key]) answers[key] = saved.answers[key];
      else delete answers[key];
    }
    return { ...plan, answers };
  }) };
}

type PlanSaveGuard = { planId: string; coachRevision: number; jobToken?: string | null; jobStatus?: string; planUpdatedAt?: string | null };
function checkSaveGuard(stored: ServerPlanState, guard?: PlanSaveGuard) {
  if (!guard) return;
  const plan = stored.plans.find(p => p.id === guard.planId);
  if ((readCoach(plan?.answers ?? {})?.revision ?? 0) !== guard.coachRevision
    || (guard.jobToken !== undefined && (plan?.answers.__coach_job?.token ?? null) !== guard.jobToken)
    || (guard.jobStatus !== undefined && plan?.answers.__coach_job?.status !== guard.jobStatus)
    || (guard.planUpdatedAt !== undefined && (plan?.updatedAt ?? null) !== guard.planUpdatedAt)) throw new Error("PLAN_VERSION_CONFLICT");
}

export async function savePlanState(ownerHash: string, state: ServerPlanState, guard?: PlanSaveGuard): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) {
    if (planAccountLinkingEnabled() && memoryClaims.has(ownerHash)) throw new Error("PLAN_OWNER_CHANGED");
    const stored = structuredClone(memoryStore.get(ownerHash) ?? EMPTY);
    checkSaveGuard(stored, guard);
    memoryStore.set(ownerHash, structuredClone(mergeStates(stored, normalizeState(state))));
    return;
  }
  // Compare-and-swap prevents simultaneous tabs/workers replacing an owner's whole document collection.
  for (let attempt = 0; attempt < 5; attempt++) {
  const { data: row, error: readError } = await supabase.from("plan_states").select("data,updated_at").eq("owner_hash", ownerHash).maybeSingle();
  if (readError) throw new Error("PLAN_LOAD_FAILED");
  const stored = normalizeState(row?.data as Partial<ServerPlanState> | undefined);
  checkSaveGuard(stored, guard);
  const clean = mergeStates(stored, normalizeState(state));
  const active = clean.plans.find((p) => p.id === clean.activePlanId) ?? clean.plans[0];
  const payload = {
      owner_hash: ownerHash,
      // 목록 조회 편의를 위해 대표값은 컬럼에도 보관
      title: clean.business.name || active?.title || "새 플랜",
      plan_type: active?.planType || "창업 초기 · 사업계획서",
      data: clean,
      updated_at: new Date(Math.max(Date.now(), Date.parse(row?.updated_at ?? "") + 1 || 0)).toISOString(),
    };
  if (planAccountLinkingEnabled()) {
    const { data, error } = await supabase.rpc("commit_plan_state", {
      p_owner_hash: ownerHash, p_expected_at: row?.updated_at ?? null, p_data: clean,
      p_title: payload.title, p_plan_type: payload.plan_type,
    });
    if (error) throw new Error("PLAN_SAVE_FAILED");
    if (data === "saved") return;
    if (data === "transferred") throw new Error("PLAN_OWNER_CHANGED");
    if (data === "conflict") continue;
    throw new Error("PLAN_SAVE_FAILED");
  }
  if (!row) {
    const { error } = await supabase.from("plan_states").insert(payload);
    if (!error) return;
    if (error.code === "23505") continue;
    throw new Error("PLAN_SAVE_FAILED");
  }
  const { data, error } = await supabase.from("plan_states").update(payload).eq("owner_hash", ownerHash).eq("updated_at", row.updated_at).select("owner_hash");
  if (error) throw new Error("PLAN_SAVE_FAILED");
  if (data?.length) return;
  }
  throw new Error("PLAN_VERSION_CONFLICT");
}

/** 플랜 삭제 — 병합 저장에서는 페이로드 누락이 삭제가 아니므로, 삭제는 이 경로로만 한다. */
export async function deletePlanById(ownerHash: string, planId: string): Promise<void> {
  if (planAccountLinkingEnabled() && getServerSupabase()) {
    const supabase = getServerSupabase()!;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: row, error } = await supabase.from("plan_states").select("data,updated_at").eq("owner_hash", ownerHash).maybeSingle();
      if (error) throw new Error("PLAN_LOAD_FAILED");
      const stored = normalizeState(row?.data);
      const plans = stored.plans.filter(plan => plan.id !== planId);
      if (plans.length === stored.plans.length) return;
      const next = { ...stored, plans, activePlanId: stored.activePlanId === planId ? plans[0]?.id ?? null : stored.activePlanId };
      const active = plans.find(plan => plan.id === next.activePlanId) ?? plans[0];
      const result = await supabase.rpc("commit_plan_state", {
        p_owner_hash: ownerHash, p_expected_at: row?.updated_at ?? null, p_data: next,
        p_title: next.business.name || active?.title || "새 플랜", p_plan_type: active?.planType || "창업 초기 · 사업계획서",
      });
      if (result.error) throw new Error("PLAN_SAVE_FAILED");
      if (result.data === "saved") return;
      if (result.data === "transferred") throw new Error("PLAN_OWNER_CHANGED");
      if (result.data !== "conflict") throw new Error("PLAN_SAVE_FAILED");
    }
    throw new Error("PLAN_VERSION_CONFLICT");
  }
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
