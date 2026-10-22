import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "../persistence";
import { customerSmsConfig, relayUnsupported, sendRelayV4, stableEventId, type CustomerSmsConfig } from "../notify/customer-sms";
import { dueTaxReminders, type TaxDeadlineKind } from "./tax-calendar";
import { projectReadTable } from "../plan-builder/quarantine-tables";
import { schemaFailureReason } from "../schema-readiness";

/*
 * 세금 신고 마감 문자 — 마감 7일 전·1일 전 오전 9시(한국 시간)부터, 홈페이지에 '문자 받을 휴대폰'을 등록하고
 * 리포트를 끄지 않은 사장님께 "[오늘창업] 종합소득세 신고 마감 D-7 (5/31)" 한 통. 사업 정보로 보아 해당 없는 마감은 빼고(taxReminderFit).
 *
 * 5분 예약 실행(sweepLeadNotifications)에서 부르지만 실제로 일하는 날은 한 해 여섯 번뿐이다(마감 3개 × 2).
 * tax_reminder_sends(번호 해시, 마감일, 며칠 전) 한 줄이 '맡았다' 표시라 같은 번호에는 한 번만 간다 — 홈페이지가
 * 여럿이어도 번호가 같으면 한 통. 표(0040)가 없으면 아무것도 보내지 않는다(주간 리포트와 같은 기준).
 * 밤(21시~9시)에는 보내지 않는다. 예전 중계(v4 모름)면 맡은 줄을 지우고 멈춘다 — 업그레이드 뒤 그날 안에 다시 보낸다.
 */

export const TAX_REMINDER_SEND_HOUR_KST = 9;
export const TAX_REMINDER_STOP_HOUR_KST = 21;

export type TaxReminderDependencies = { db: SupabaseClient | null; sms: CustomerSmsConfig | null; transport?: typeof fetch; now?: number };
/** notApplicable: 사업 정보로 보면 해당 없는 번호(안 보냄) · unconfirmed: 사업 정보가 없어 '해당 여부 모름'인데 보낸 번호 */
export type TaxReminderRun = { due: number; reason?: string; candidates: number; sent: number; failed: number; notApplicable: number; unconfirmed: number };

/*
 * 사업마다 이 마감이 해당하는지 — 마감 문자는 개인사업자 기준(종합소득세 5/31, 부가세 1/25·7/25)이다.
 * 쓰는 정보: 사업 설정의 사업자 형태(projects.business_setup.legalForm)와 '사업자 확인' 결과(business_checks — 국세청 상태·과세유형).
 *   - 국세청에 등록되지 않은 번호 · 고유번호 단체 → 둘 다 안 보냄
 *   - 법인(형태가 법인이거나 사업자번호 가운데 두 자리 81~88) → 종합소득세 안 보냄(부가세 1/25·7/25 확정신고는 법인도 한다)
 *   - 면세사업자 → 부가세 안 보냄
 *   - 간이과세자(세금계산서 발급사업자가 아닌) → 7월 부가세 안 보냄(1년에 한 번, 1월에 신고)
 * 아무 정보도 없으면 '모름' — 놓치는 것보다 낫게 그대로 보낸다. 문구(중계 relay.py)에 '개인사업자 해당 시'를 붙이는 것은 중계 쪽 일이다.
 */
export type TaxProfile = { legalForm?: string | null; businessNumber?: string | null; businessState?: string | null; taxType?: string | null };
export type TaxFit = "send" | "skip" | "unknown";

const corporateNumber = (number?: string | null) => /^\d{10}$/.test(number ?? "") ? /^8[1-8]$/.test(number!.slice(3, 5)) : null;
const individualNumber = (number?: string | null) => /^\d{10}$/.test(number ?? "") ? /^(?:[0-7]\d|9\d)$/.test(number!.slice(3, 5)) && number!.slice(3, 5) !== "00" : null;

export function taxReminderFit(profile: TaxProfile | null | undefined, deadline: { kind: TaxDeadlineKind; date: string }): TaxFit {
  if (!profile) return "unknown";
  const taxType = profile.taxType ?? "";
  if (profile.businessState === "unregistered" || /고유번호/.test(taxType)) return "skip";
  if (deadline.kind === "income") {
    if (profile.legalForm === "corporation" || corporateNumber(profile.businessNumber) === true) return "skip";
    return profile.legalForm === "sole_proprietor" || individualNumber(profile.businessNumber) === true ? "send" : "unknown";
  }
  if (/면세/.test(taxType)) return "skip";
  if (/간이과세/.test(taxType) && !/세금계산서/.test(taxType) && deadline.date.slice(5, 7) === "07") return "skip";
  return /과세/.test(taxType) ? "send" : "unknown";
}

/** 한 번호에 홈페이지가 여럿이면 하나라도 해당하면(또는 모르면) 보낸다 — 모두 '해당 없음'일 때만 뺀다 */
export function combineTaxFit(fits: TaxFit[]): TaxFit {
  if (!fits.length) return "unknown";
  if (fits.includes("send")) return "send";
  return fits.includes("unknown") ? "unknown" : "skip";
}

const chunks = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

/** 홈페이지(project_id) → 사업 정보. 읽지 못하면(표 없음·오류) 빈 것 — '모름'으로 보낸다(이 때문에 마감 문자를 멈추지 않는다) */
async function taxProfiles(db: SupabaseClient, projectIds: string[]): Promise<Map<string, TaxProfile>> {
  const profiles = new Map<string, TaxProfile>();
  try {
    const projects: Array<{ id: string; owner_id: string | null; opportunity: { planId?: unknown } | null; business_setup: { legalForm?: unknown } | null }> = [];
    for (const ids of chunks(projectIds, 100)) {
      const read = await db.from(projectReadTable()).select("id, owner_id, opportunity, business_setup").in("id", ids);
      if (read.error) return profiles;
      projects.push(...((read.data ?? []) as typeof projects));
    }
    const checks = new Map<string, { business_number?: string | null; business_state?: string | null; tax_type?: string | null }>();
    const owners = [...new Set(projects.map((row) => String(row.owner_id ?? "")).filter(Boolean))];
    for (const ids of chunks(owners, 100)) {
      const read = await db.from("business_checks").select("owner_id, plan_id, business_number, business_state, tax_type").in("owner_id", ids);
      if (read.error) break; // 표가 없으면 사업자 형태만으로
      for (const row of (read.data ?? []) as Array<{ owner_id: string; plan_id: string; business_number?: string | null; business_state?: string | null; tax_type?: string | null }>) checks.set(`${row.owner_id}\u0000${row.plan_id}`, row);
    }
    for (const project of projects) {
      const planId = typeof project.opportunity?.planId === "string" ? project.opportunity.planId : "";
      const check = planId ? checks.get(`${String(project.owner_id ?? "")}\u0000${planId}`) : undefined;
      const legalForm = typeof project.business_setup?.legalForm === "string" ? project.business_setup.legalForm : null;
      if (!check && (!legalForm || legalForm === "undecided")) continue;
      profiles.set(String(project.id), { legalForm, businessNumber: check?.business_number ?? null, businessState: check?.business_state ?? null, taxType: check?.tax_type ?? null });
    }
  } catch {
    // 사업 정보를 못 읽어도 마감 문자는 그대로(모름)
  }
  return profiles;
}

async function recipientKey(phone: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`oneulstart-tax:${phone}`));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function runTaxReminders(deps: TaxReminderDependencies, limit = 50): Promise<TaxReminderRun> {
  const now = deps.now ?? Date.now();
  const due = dueTaxReminders(now);
  const result: TaxReminderRun = { due: due.length, candidates: 0, sent: 0, failed: 0, notApplicable: 0, unconfirmed: 0 };
  const hour = new Date(now + 9 * 60 * 60_000).getUTCHours();
  if (!due.length || hour < TAX_REMINDER_SEND_HOUR_KST || hour >= TAX_REMINDER_STOP_HOUR_KST) return { ...result, reason: "not_due" };
  const { db, sms } = deps;
  if (!db) return { ...result, reason: "no_database" };
  if (!sms) return { ...result, reason: "sms_disabled" };

  const sites = await db.from("landing_sites").select("alert_phone, project_id").not("alert_phone", "is", null).not("published_version", "is", null).eq("status", "published").eq("weekly_report_opt_out", false).limit(5000);
  if (sites.error) return { ...result, reason: schemaFailureReason(sites.error) };
  const siteRows = ((sites.data ?? []) as Array<{ alert_phone: string | null; project_id?: string | null }>).filter((row) => /^010\d{8}$/.test(row.alert_phone ?? ""));
  const phones = [...new Set(siteRows.map((row) => row.alert_phone as string))];
  const profiles = await taxProfiles(db, [...new Set(siteRows.map((row) => String(row.project_id ?? "")).filter(Boolean))]);
  const sitesByPhone = new Map<string, Array<TaxProfile | null>>();
  for (const row of siteRows) sitesByPhone.set(row.alert_phone as string, [...(sitesByPhone.get(row.alert_phone as string) ?? []), profiles.get(String(row.project_id ?? "")) ?? null]);

  let budget = limit;
  for (const deadline of due) {
    const done = await db.from("tax_reminder_sends").select("recipient_key").eq("deadline", deadline.date).eq("days_before", deadline.daysBefore).limit(10000);
    if (done.error) return { ...result, reason: schemaFailureReason(done.error) };
    const taken = new Set(((done.data ?? []) as Array<{ recipient_key: string }>).map((row) => row.recipient_key));
    const fits = new Map(phones.map((phone) => [phone, combineTaxFit((sitesByPhone.get(phone) ?? []).map((profile) => taxReminderFit(profile, deadline)))]));
    const applicable = phones.filter((phone) => fits.get(phone) !== "skip");
    result.notApplicable += phones.length - applicable.length;
    const keyed = await Promise.all(applicable.map(async (phone) => ({ phone, key: await recipientKey(phone) })));
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
      if (ok) { result.sent += 1; if (fits.get(phone) === "unknown") result.unconfirmed += 1; } else result.failed += 1;
    }
  }
  return result;
}

/** 예약 실행에서 부른다 */
export async function runTaxRemindersNow(limit = 50) {
  return runTaxReminders({ db: getServerSupabase(), sms: customerSmsConfig() }, limit);
}
