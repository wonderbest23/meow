import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "../persistence";

/*
 * 홈페이지 문의 보관 기간 — 기본 개인정보 안내문의 약속(상담 종료 후 3개월)을 실제로 지킨다.
 * '처리 완료'를 누른 문의는 그 뒤 3개월, 끝내 누르지 않은 문의는 접수 1년 뒤를 상담 종료로 보고 지운다.
 * 알림 기록(landing_lead_notifications)은 외래키 cascade 로 함께 지워진다.
 * 5분 예약 실행에서 부르며 한 번에 조금씩만 지운다. handled_at 칸이 없으면(마이그레이션 전) 접수 1년 기준만 쓴다.
 */

export const LEAD_RETENTION_AFTER_HANDLED_DAYS = 92;
export const LEAD_RETENTION_UNHANDLED_DAYS = 365;
const BATCH = 200;

export async function purgeExpiredLeads(db: SupabaseClient | null, now = Date.now()): Promise<{ deleted: number; reason?: string }> {
  if (!db) return { deleted: 0, reason: "no_database" };
  const iso = (days: number) => new Date(now - days * 86_400_000).toISOString();
  let deleted = 0;
  const handled = await db.from("landing_leads").select("id").lt("handled_at", iso(LEAD_RETENTION_AFTER_HANDLED_DAYS)).limit(BATCH);
  const stale = await db.from("landing_leads").select("id").lt("created_at", iso(LEAD_RETENTION_UNHANDLED_DAYS)).limit(BATCH);
  const ids = [...new Set([...(handled.error ? [] : handled.data ?? []), ...(stale.error ? [] : stale.data ?? [])].map((row) => String((row as { id: string }).id)))];
  if (handled.error && stale.error) return { deleted: 0, reason: `query_failed:${stale.error.code ?? "unknown"}` };
  if (ids.length) {
    const removed = await db.from("landing_leads").delete().in("id", ids).select("id");
    if (removed.error) return { deleted: 0, reason: `delete_failed:${removed.error.code ?? "unknown"}` };
    deleted = removed.data?.length ?? 0;
  }
  return { deleted };
}

export async function purgeExpiredLeadsNow() {
  return purgeExpiredLeads(getServerSupabase());
}
