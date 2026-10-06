import { getServerSupabase } from "../persistence";
import { loadPlanState } from "../plan-builder/plan-server-store";
import { findProjectIdByPlan } from "../project-repository";
import { getLandingAlertPhone, landingSiteSummaryForProject } from "../landing/repository";
import { findService } from "./catalog";
import {
  canMoveServiceRequest,
  type MyServiceRequest,
  type ServiceRequestInput,
  type ServiceRequestRecord,
  type ServiceRequestStatus,
} from "./requests";

/*
 * 서비스 신청 저장소 — service_requests 테이블(마이그레이션 20261006090100), 없으면 프로세스 메모리(데모·테스트).
 *
 * 주인 확인은 앱에서 한다: 로그인한 계정의 owner_hash 로 사업 목록(plan_states)을 읽어 그 사업이 있을 때만 받는다.
 * 화면에서 남의 planId 를 넣어 보내도 자기 사업 목록에 없으면 PLAN_NOT_FOUND 다.
 * 테이블이 아직 없으면(마이그레이션 전) 목록은 빈 칸, 신청은 SERVICE_STORE_UNAVAILABLE — 화면이 1:1 문의로 안내한다.
 */

declare global {
  var __oneulServiceRequests: ServiceRequestRecord[] | undefined;
}
const memory: ServiceRequestRecord[] = globalThis.__oneulServiceRequests ?? (globalThis.__oneulServiceRequests = []);

const OPEN: ServiceRequestStatus[] = ["received", "contacted"];

function mapRow(row: Record<string, unknown>): ServiceRequestRecord {
  return {
    id: String(row.id ?? ""),
    ownerId: String(row.owner_id ?? ""),
    planId: String(row.plan_id ?? ""),
    planTitle: String(row.plan_title ?? ""),
    customerEmail: String(row.customer_email ?? ""),
    serviceId: String(row.service_id ?? ""),
    phone: String(row.phone ?? ""),
    memo: String(row.memo ?? ""),
    preferredTime: String(row.preferred_time ?? ""),
    status: String(row.status ?? "received") as ServiceRequestStatus,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mine({ ownerId: _ownerId, customerEmail: _email, ...rest }: ServiceRequestRecord): MyServiceRequest {
  void _ownerId; void _email;
  return rest;
}

/** 테이블 미생성(마이그레이션 전) 오류인지 */
function isMissingTable(error: { message?: string; code?: string } | null): boolean {
  return Boolean(error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("service_requests"));
}

export class ServiceRequestError extends Error {
  constructor(public code: "PLAN_NOT_FOUND" | "SERVICE_NOT_FOUND" | "ALREADY_REQUESTED" | "SERVICE_STORE_UNAVAILABLE" | "STATUS_CONFLICT" | "NOT_FOUND", public status: number) {
    super(code);
  }
}

/** 이 계정의 사업인지 — 사업 목록에 있을 때만 그 사업을 돌려준다 */
export async function ownedPlan(ownerHash: string, planId: string) {
  const state = await loadPlanState(ownerHash);
  return state.plans.find((plan) => plan.id === planId) ?? null;
}

export async function listMyServiceRequests(ownerId: string, planId: string): Promise<MyServiceRequest[]> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return memory.filter((row) => row.ownerId === ownerId && row.planId === planId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(mine);
  }
  const { data, error } = await supabase.from("service_requests").select("*").eq("owner_id", ownerId).eq("plan_id", planId).order("created_at", { ascending: false }).limit(50);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => mine(mapRow(row)));
}

/**
 * 연락받을 번호 미리 채우기 — 지난 신청에 적은 번호가 먼저, 없으면 홈페이지 문자 알림 번호.
 * 둘 다 없으면 빈 칸(계정에는 휴대폰을 따로 저장하지 않는다).
 */
export async function suggestedServicePhone(ownerHash: string, planId: string, previous: MyServiceRequest[]): Promise<string> {
  if (previous[0]?.phone) return previous[0].phone;
  try {
    const projectId = await findProjectIdByPlan(planId, ownerHash);
    const site = projectId ? await landingSiteSummaryForProject(projectId) : null;
    return (site ? await getLandingAlertPhone(site.id) : null) ?? "";
  } catch {
    return "";
  }
}

export async function createServiceRequest(input: ServiceRequestInput & { ownerId: string; ownerHash: string; customerEmail: string }): Promise<{ request: MyServiceRequest; planTitle: string }> {
  if (!findService(input.serviceId)) throw new ServiceRequestError("SERVICE_NOT_FOUND", 400);
  const plan = await ownedPlan(input.ownerHash, input.planId);
  if (!plan) throw new ServiceRequestError("PLAN_NOT_FOUND", 404);
  const supabase = getServerSupabase();
  const now = new Date().toISOString();
  if (!supabase) {
    if (memory.some((row) => row.ownerId === input.ownerId && row.planId === input.planId && row.serviceId === input.serviceId && OPEN.includes(row.status))) throw new ServiceRequestError("ALREADY_REQUESTED", 409);
    const record: ServiceRequestRecord = { id: crypto.randomUUID(), ownerId: input.ownerId, planId: input.planId, planTitle: plan.title, customerEmail: input.customerEmail, serviceId: input.serviceId, phone: input.phone, memo: input.memo, preferredTime: input.preferredTime, status: "received", createdAt: now, updatedAt: now };
    memory.push(record);
    return { request: mine(structuredClone(record)), planTitle: plan.title };
  }
  const { data, error } = await supabase.from("service_requests").insert({
    owner_id: input.ownerId,
    plan_id: input.planId,
    plan_title: plan.title.slice(0, 200),
    customer_email: input.customerEmail,
    service_id: input.serviceId,
    phone: input.phone,
    memo: input.memo,
    preferred_time: input.preferredTime,
  }).select("*").single();
  if (error) {
    // 같은 사업·같은 서비스의 진행 중 신청은 하나만(부분 unique 색인) — 두 번 눌러도 한 건
    if (error.code === "23505") throw new ServiceRequestError("ALREADY_REQUESTED", 409);
    if (isMissingTable(error)) throw new ServiceRequestError("SERVICE_STORE_UNAVAILABLE", 503);
    throw error;
  }
  return { request: mine(mapRow(data as Record<string, unknown>)), planTitle: plan.title };
}

export async function listAllServiceRequests(): Promise<ServiceRequestRecord[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [...memory].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((row) => structuredClone(row));
  const { data, error } = await supabase.from("service_requests").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => mapRow(row));
}

/**
 * 어드민 상태 변경 — 조건부 갱신. 화면이 본 상태(expected)일 때만 바꾼다.
 * 두 사람이 같은 건을 동시에 눌러도 한 사람 것만 들어가고, 다른 사람은 STATUS_CONFLICT 로 새로고침을 안내받는다.
 */
export async function updateServiceRequestStatus(id: string, expected: ServiceRequestStatus, next: ServiceRequestStatus): Promise<ServiceRequestRecord> {
  if (!canMoveServiceRequest(expected, next)) throw new ServiceRequestError("STATUS_CONFLICT", 409);
  const supabase = getServerSupabase();
  const now = new Date().toISOString();
  if (!supabase) {
    const row = memory.find((item) => item.id === id);
    if (!row) throw new ServiceRequestError("NOT_FOUND", 404);
    if (row.status !== expected) throw new ServiceRequestError("STATUS_CONFLICT", 409);
    row.status = next; row.updatedAt = now;
    return structuredClone(row);
  }
  const { data, error } = await supabase.from("service_requests").update({ status: next, updated_at: now }).eq("id", id).eq("status", expected).select("*");
  if (error) {
    if (isMissingTable(error)) throw new ServiceRequestError("SERVICE_STORE_UNAVAILABLE", 503);
    throw error;
  }
  if (!data?.length) {
    const { data: existing } = await supabase.from("service_requests").select("id").eq("id", id).maybeSingle();
    throw new ServiceRequestError(existing ? "STATUS_CONFLICT" : "NOT_FOUND", existing ? 409 : 404);
  }
  return mapRow(data[0] as Record<string, unknown>);
}

/** 테스트용 — 메모리 저장소 비우기 */
export function resetServiceRequestMemory() {
  memory.length = 0;
}
