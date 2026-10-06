import { getServerSupabase } from "../persistence";
import type { BusinessCheck, BusinessState, MailOrderState } from "./business-check";

/*
 * 사업자 확인 결과 저장 — business_checks(마이그레이션 20261006120000), 없으면 프로세스 메모리(데모·테스트).
 * 사업마다 마지막 결과 한 줄. 표가 없으면(마이그레이션 전) 저장만 건너뛰고 조회 결과는 그대로 보여 준다.
 */

declare global {
  var __oneulBusinessChecks: Map<string, BusinessCheck> | undefined;
}
const memory = globalThis.__oneulBusinessChecks ?? (globalThis.__oneulBusinessChecks = new Map());
const keyOf = (ownerId: string, planId: string) => `${ownerId}\u0000${planId}`;

const missingTable = (error: { code?: string; message?: string } | null) =>
  Boolean(error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("business_checks"));

export async function loadBusinessCheck(ownerId: string, planId: string): Promise<BusinessCheck | null> {
  const supabase = getServerSupabase();
  if (!supabase) return memory.get(keyOf(ownerId, planId)) ?? null;
  const { data, error } = await supabase.from("business_checks").select("*").eq("owner_id", ownerId).eq("plan_id", planId).maybeSingle();
  if (error) { if (missingTable(error)) return null; throw error; }
  if (!data) return null;
  return {
    businessNumber: String(data.business_number),
    business: data.business_state ? { state: data.business_state as BusinessState, taxType: String(data.tax_type ?? ""), closedAt: String(data.closed_at ?? "") } : null,
    mailOrder: data.mail_order_state ? { state: data.mail_order_state as MailOrderState, reportNo: String(data.mail_order_no ?? ""), reportedAt: String(data.mail_order_reported_at ?? ""), operStatus: "", domain: "" } : null,
    checkedAt: new Date(String(data.checked_at)).toISOString(),
  };
}

export async function saveBusinessCheck(ownerId: string, planId: string, check: BusinessCheck): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) { memory.set(keyOf(ownerId, planId), check); return; }
  const { error } = await supabase.from("business_checks").upsert({
    owner_id: ownerId, plan_id: planId, business_number: check.businessNumber,
    business_state: check.business?.state ?? null, tax_type: check.business?.taxType ?? "", closed_at: check.business?.closedAt ?? "",
    mail_order_state: check.mailOrder?.state ?? null, mail_order_no: check.mailOrder?.reportNo ?? "", mail_order_reported_at: check.mailOrder?.reportedAt ?? "",
    checked_at: check.checkedAt,
  }, { onConflict: "owner_id,plan_id" });
  if (error && !missingTable(error)) throw error;
}
