import { getServerSupabase } from "../persistence";
import { projectReadTable } from "../plan-builder/quarantine-tables";
import { getLandingForProject } from "./repository";
import { buildLandingLeadEmail, landingEmailConfiguration, sendLandingLeadEmail, type LeadEmailPayload } from "./lead-email";
import { LEAD_NOTIFICATION_MAX_ATTEMPTS, type LeadNotificationError, type LeadNotificationStatus, type LeadNotificationSummary } from "./lead-notification-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { customerSmsConfig, sendCustomerSms, type CustomerSmsConfig } from "../notify/customer-sms";

type OutboxRow = {
  lead_id: string; site_id: string; status: LeadNotificationStatus; attempts: number;
  next_attempt_at: string | null; accepted_at: string | null; error_code: LeadNotificationError | null;
  payload: LeadEmailPayload | null; first_attempt_at: string | null; delivery_uncertain: boolean;
};
const summary = (row: OutboxRow): LeadNotificationSummary => ({ leadId: row.lead_id, status: row.status, attempts: row.attempts, nextAttemptAt: row.next_attempt_at, acceptedAt: row.accepted_at, errorCode: row.error_code });

export function notificationRetryDelay(attempts: number) { return [60_000, 300_000, 1_800_000, 7_200_000][Math.min(Math.max(attempts - 1, 0), 3)]; }
export function notificationIdempotencyExpired(firstAttempt: string | null, uncertain: boolean, now = Date.now()) {
  return uncertain && firstAttempt !== null && now - Date.parse(firstAttempt) >= 23 * 60 * 60_000;
}

export async function listLandingLeadNotifications(projectId: string, ownerHash: string): Promise<LeadNotificationSummary[]> {
  const site = await getLandingForProject(projectId, ownerHash);
  if (!site) return [];
  const db = getServerSupabase();
  if (!db) return []; // Demo storage never pretends that email was delivered.
  const { data, error } = await db.from("landing_lead_notifications").select("lead_id,status,attempts,next_attempt_at,accepted_at,error_code").eq("site_id", site.id).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("LANDING_NOTIFICATIONS_UNAVAILABLE");
  return (data ?? []).map(row => summary(row as OutboxRow));
}

/*
 * A lease and provider idempotency key protect retries after response loss or process termination.
 * 알림 수단: 사장님이 '문자 받을 휴대폰'을 등록했고 문자가 켜져 있으면 문자(알리고 중계), 아니면 메일 설정이 있을 때 메일.
 * 문자는 문의 id 가 중계의 eventId 라서, 응답을 놓쳐 다시 보내도 중계가 앞선 결과를 돌려준다(두 번 가지 않는다).
 */
export async function processLandingLeadNotification(leadId: string, force = false, dependencies?: { db: SupabaseClient | null; config: ReturnType<typeof landingEmailConfiguration>; transport: typeof fetch; sms?: CustomerSmsConfig | null; smsTransport?: typeof fetch }): Promise<void> {
  const db = dependencies ? dependencies.db : getServerSupabase();
  if (!db) return;
  const token = crypto.randomUUID();
  const claim = await db.rpc("claim_landing_lead_notification", { p_lead_id: leadId, p_token: token, p_force: force });
  if (claim.error) throw new Error("LANDING_NOTIFICATION_CLAIM_FAILED");
  const row = (claim.data as OutboxRow[] | null)?.[0];
  if (!row) return;
  const finish = async (patch: Record<string, unknown>) => {
    const { error, data } = await db.from("landing_lead_notifications").update({ ...patch, lease_token: null, lease_until: null, updated_at: new Date().toISOString() }).eq("lead_id", leadId).eq("lease_token", token).select("lead_id");
    if (error || !data?.length) throw new Error("LANDING_NOTIFICATION_SAVE_FAILED");
  };
  const sms = dependencies ? dependencies.sms ?? null : customerSmsConfig();
  if (sms) {
    const site = await db.from("landing_sites").select("alert_phone").eq("id", row.site_id).maybeSingle();
    const phone = site.error ? null : (site.data?.alert_phone as string | null | undefined) ?? null;
    if (phone) {
      const attempts = row.attempts + 1;
      const prepared = await db.from("landing_lead_notifications").update({ attempts, first_attempt_at: row.first_attempt_at ?? new Date().toISOString(), delivery_uncertain: true }).eq("lead_id", leadId).eq("lease_token", token).select("lead_id");
      if (prepared.error || !prepared.data?.length) throw new Error("LANDING_NOTIFICATION_SAVE_FAILED");
      const sent = await sendCustomerSms(sms, { eventId: leadId, eventType: "homepage-lead", recipient: phone, params: {} }, dependencies?.smsTransport);
      if (sent.status === "accepted" || sent.status === "test_accepted") {
        await finish({ status: "sent", provider_id: `sms:${sent.code}`.slice(0, 200), accepted_at: new Date().toISOString(), error_code: null, delivery_uncertain: false, next_attempt_at: null });
        return;
      }
      // 한도·꺼짐(blocked)과 거절은 다시 보내도 같다 — 멈춘다. 확인 불가는 같은 eventId 로 다시 물어본다
      const retry = sent.status === "uncertain" && attempts < LEAD_NOTIFICATION_MAX_ATTEMPTS;
      await finish({ status: retry ? "retry" : sent.status === "uncertain" ? "failed" : "blocked",
        error_code: sent.status === "rejected" ? "provider_rejected" : sent.status === "blocked" ? "provider_unavailable" : "delivery_unknown",
        delivery_uncertain: sent.status === "uncertain", next_attempt_at: retry ? new Date(Date.now() + notificationRetryDelay(attempts)).toISOString() : null });
      return;
    }
  }
  const config = dependencies ? dependencies.config : landingEmailConfiguration();
  // 문자는 켜져 있는데 번호가 없으면 '받을 곳 없음', 둘 다 없으면 '발송 설정 없음'
  if (!config) { await finish({ status: "blocked", error_code: sms ? "recipient_missing" : "missing_email_config", next_attempt_at: null }); return; }
  if (notificationIdempotencyExpired(row.first_attempt_at, row.delivery_uncertain)) {
    await finish({ status: "failed", error_code: "delivery_unknown", next_attempt_at: null }); return;
  }
  let payload = row.payload;
  if (!payload) {
    const site = await db.from("landing_sites").select("project_id").eq("id", row.site_id).maybeSingle();
    if (site.error) throw new Error("LANDING_NOTIFICATION_OWNER_READ_FAILED");
    const project = site.data ? await db.from(projectReadTable()).select("owner_id").eq("id", site.data.project_id).maybeSingle() : null;
    if (project?.error) throw new Error("LANDING_NOTIFICATION_OWNER_READ_FAILED");
    const owner = project?.data?.owner_id ? await db.auth.admin.getUserById(project.data.owner_id) : null;
    if (owner?.error) throw new Error("LANDING_NOTIFICATION_OWNER_READ_FAILED");
    const recipient = owner?.data?.user?.email;
    if (!recipient || !owner?.data?.user?.email_confirmed_at) { await finish({ status: "blocked", error_code: "recipient_missing", next_attempt_at: null }); return; }
    payload = buildLandingLeadEmail(config.from, recipient);
  }
  const attempts = row.attempts + 1;
  // Persist the immutable request before sending, so every retry uses exactly the same content.
  const prepared = await db.from("landing_lead_notifications").update({ payload, attempts, first_attempt_at: row.first_attempt_at ?? new Date().toISOString(), delivery_uncertain: true }).eq("lead_id", leadId).eq("lease_token", token).select("lead_id");
  if (prepared.error || !prepared.data?.length) throw new Error("LANDING_NOTIFICATION_SAVE_FAILED");
  const result = await sendLandingLeadEmail(payload, config.key, `landing-lead/${leadId}`, dependencies?.transport);
  if (result.ok) {
    await finish({ status: "sent", provider_id: result.providerId, accepted_at: new Date().toISOString(), error_code: null, delivery_uncertain: false, next_attempt_at: null });
    return;
  }
  const retry = result.retryable && attempts < LEAD_NOTIFICATION_MAX_ATTEMPTS;
  await finish({ status: retry ? "retry" : result.retryable ? "failed" : "blocked", error_code: result.code, delivery_uncertain: row.delivery_uncertain || result.ambiguous,
    next_attempt_at: retry ? new Date(Date.now() + notificationRetryDelay(attempts)).toISOString() : null });
}

/*
 * 예약 실행(5분마다): 재시도 시각이 된 알림과, 보내는 도중 작업이 끊겨 임대가 만료된 알림을 다시 처리한다.
 * 예전에는 자동 재시도를 맡은 곳이 없어서, 발송 서버가 잠깐 실패하면 사장님이 '다시 보내기'를 누르기 전까지
 * '재시도 대기'로 멈춰 있었다. 처리 순서·임대·중복 발송 방지는 processLandingLeadNotification 이 그대로 맡는다.
 */
export async function sweepDueLeadNotifications(limit = 20, dependencies?: { db: SupabaseClient | null; process: (leadId: string) => Promise<void>; now?: Date }) {
  const db = dependencies ? dependencies.db : getServerSupabase();
  if (!db) return { due: 0, processed: 0, failed: 0 };
  const now = (dependencies?.now ?? new Date()).toISOString();
  const { data, error } = await db.from("landing_lead_notifications").select("lead_id")
    .or(`and(status.in.(pending,retry),next_attempt_at.lte.${now}),and(status.eq.processing,lease_until.lt.${now})`)
    .order("next_attempt_at", { ascending: true }).limit(limit);
  if (error) throw new Error("LANDING_NOTIFICATIONS_UNAVAILABLE");
  const run = dependencies?.process ?? ((leadId: string) => processLandingLeadNotification(leadId));
  let processed = 0, failed = 0;
  for (const row of (data ?? []) as Array<{ lead_id: string }>) {
    try { await run(row.lead_id); processed += 1; } catch { failed += 1; }
  }
  return { due: data?.length ?? 0, processed, failed };
}

export async function retryLandingLeadNotification(projectId: string, ownerHash: string, leadId: string) {
  const site = await getLandingForProject(projectId, ownerHash);
  if (!site) throw new Error("LANDING_NOT_FOUND");
  const db = getServerSupabase();
  if (!db) throw new Error("LANDING_NOTIFICATIONS_UNAVAILABLE");
  const { data, error } = await db.from("landing_lead_notifications").select("site_id").eq("lead_id", leadId).maybeSingle();
  if (error) throw new Error("LANDING_NOTIFICATIONS_UNAVAILABLE");
  if (!data || data.site_id !== site.id) throw new Error("LANDING_LEAD_NOT_FOUND");
  await processLandingLeadNotification(leadId, true);
}

/** Manually invoked operator drain. No scheduled handler is installed. */
export async function drainLandingLeadNotifications(limit = 20) {
  const db = getServerSupabase();
  if (!db) return { checked: 0, failed: 0 };
  const { data, error } = await db.from("landing_lead_notifications").select("lead_id").in("status", ["pending", "retry", "processing"]).lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(Math.min(Math.max(limit, 1), 20));
  if (error) throw new Error("LANDING_NOTIFICATIONS_UNAVAILABLE");
  let failed = 0;
  for (const row of data ?? []) {
    try { await processLandingLeadNotification(row.lead_id); } catch { failed++; }
  }
  return { checked: data?.length ?? 0, failed };
}
