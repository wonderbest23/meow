import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "../persistence";
import { customerSmsConfig, relayUnsupported, sendRelayV4, stableEventId, type CustomerSmsConfig } from "../notify/customer-sms";
import { dueTaxReminders } from "./tax-calendar";

/*
 * 세금 신고 마감 문자 — 마감 7일 전·1일 전 오전 9시(한국 시간)부터, 홈페이지에 '문자 받을 휴대폰'을 등록하고
 * 리포트를 끄지 않은 사장님께 "[오늘창업] 종합소득세 신고 마감 D-7 (5/31)" 한 통.
 *
 * 5분 예약 실행(sweepLeadNotifications)에서 부르지만 실제로 일하는 날은 한 해 여섯 번뿐이다(마감 3개 × 2).
 * tax_reminder_sends(번호 해시, 마감일, 며칠 전) 한 줄이 '맡았다' 표시라 같은 번호에는 한 번만 간다 — 홈페이지가
 * 여럿이어도 번호가 같으면 한 통. 표(0040)가 없으면 아무것도 보내지 않는다(주간 리포트와 같은 기준).
 * 밤(21시~9시)에는 보내지 않는다. 예전 중계(v4 모름)면 맡은 줄을 지우고 멈춘다 — 업그레이드 뒤 그날 안에 다시 보낸다.
 */

export const TAX_REMINDER_SEND_HOUR_KST = 9;
export const TAX_REMINDER_STOP_HOUR_KST = 21;

export type TaxReminderDependencies = { db: SupabaseClient | null; sms: CustomerSmsConfig | null; transport?: typeof fetch; now?: number };
export type TaxReminderRun = { due: number; reason?: string; candidates: number; sent: number; failed: number };

async function recipientKey(phone: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`oneulstart-tax:${phone}`));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function runTaxReminders(deps: TaxReminderDependencies, limit = 50): Promise<TaxReminderRun> {
  const now = deps.now ?? Date.now();
  const due = dueTaxReminders(now);
  const result: TaxReminderRun = { due: due.length, candidates: 0, sent: 0, failed: 0 };
  const hour = new Date(now + 9 * 60 * 60_000).getUTCHours();
  if (!due.length || hour < TAX_REMINDER_SEND_HOUR_KST || hour >= TAX_REMINDER_STOP_HOUR_KST) return { ...result, reason: "not_due" };
  const { db, sms } = deps;
  if (!db) return { ...result, reason: "no_database" };
  if (!sms) return { ...result, reason: "sms_disabled" };

  const sites = await db.from("landing_sites").select("alert_phone").not("alert_phone", "is", null).not("published_version", "is", null).eq("status", "published").eq("weekly_report_opt_out", false).limit(5000);
  if (sites.error) return { ...result, reason: "migration_required" };
  const phones = [...new Set(((sites.data ?? []) as Array<{ alert_phone: string | null }>).map((row) => row.alert_phone ?? "").filter((phone) => /^010\d{8}$/.test(phone)))];

  let budget = limit;
  for (const deadline of due) {
    const done = await db.from("tax_reminder_sends").select("recipient_key").eq("deadline", deadline.date).eq("days_before", deadline.daysBefore).limit(10000);
    if (done.error) return { ...result, reason: "migration_required" };
    const taken = new Set(((done.data ?? []) as Array<{ recipient_key: string }>).map((row) => row.recipient_key));
    const keyed = await Promise.all(phones.map(async (phone) => ({ phone, key: await recipientKey(phone) })));
    const todo = keyed.filter((item) => !taken.has(item.key));
    result.candidates += todo.length;
    for (const { phone, key } of todo) {
      if (budget-- <= 0) return result;
      // 맡기 — (번호, 마감, 며칠 전) 기본키가 동시에 돈 두 실행 중 하나만 통과시킨다
      const claim = await db.from("tax_reminder_sends").insert({ recipient_key: key, deadline: deadline.date, days_before: deadline.daysBefore, kind: deadline.kind, status: "processing" }).select("recipient_key");
      if (claim.error || !claim.data?.length) continue;
      const [month, day] = deadline.date.slice(5).split("-").map(Number);
      const sent = await sendRelayV4(sms, { eventId: await stableEventId(`tax:${key}:${deadline.date}:${deadline.daysBefore}`), eventType: "tax-deadline", recipient: phone, params: { kind: deadline.kind, days: deadline.daysBefore, month, day } }, deps.transport);
      const row = db.from("tax_reminder_sends");
      if (relayUnsupported(sent)) {
        await row.delete().eq("recipient_key", key).eq("deadline", deadline.date).eq("days_before", deadline.daysBefore);
        return { ...result, reason: "relay_upgrade_required" };
      }
      if (sent.status === "uncertain") {
        // 갔는지 모르면 맡은 줄을 풀어 다음 실행(5분 뒤)에 다시 — 같은 eventId 라 중계가 두 번 보내지 않는다. 그날 21시까지만.
        await row.delete().eq("recipient_key", key).eq("deadline", deadline.date).eq("days_before", deadline.daysBefore).eq("status", "processing");
        result.failed += 1;
        continue;
      }
      const ok = sent.status === "accepted" || sent.status === "test_accepted";
      await row.update({ status: ok ? "sent" : "failed", error_code: ok ? null : sent.code.slice(0, 80), updated_at: new Date(now).toISOString() })
        .eq("recipient_key", key).eq("deadline", deadline.date).eq("days_before", deadline.daysBefore);
      if (ok) result.sent += 1; else result.failed += 1;
    }
  }
  return result;
}

/** 예약 실행에서 부른다 */
export async function runTaxRemindersNow(limit = 50) {
  return runTaxReminders({ db: getServerSupabase(), sms: customerSmsConfig() }, limit);
}
