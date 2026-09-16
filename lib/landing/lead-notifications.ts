import { getServerSupabase } from "../persistence";
import { getLandingForProject } from "./repository";
import { buildLandingLeadEmail, landingEmailConfiguration, sendLandingLeadEmail, type LeadEmailPayload } from "./lead-email";
import { LEAD_NOTIFICATION_MAX_ATTEMPTS, type LeadNotificationError, type LeadNotificationStatus, type LeadNotificationSummary } from "./lead-notification-types";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/** A lease and provider idempotency key protect retries after response loss or process termination. */
export async function processLandingLeadNotification(leadId: string, force = false, dependencies?: { db: SupabaseClient | null; config: ReturnType<typeof landingEmailConfiguration>; transport: typeof fetch }): Promise<void> {
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
  const config = dependencies ? dependencies.config : landingEmailConfiguration();
  if (!config) { await finish({ status: "blocked", error_code: "missing_email_config", next_attempt_at: null }); return; }
  if (notificationIdempotencyExpired(row.first_attempt_at, row.delivery_uncertain)) {
    await finish({ status: "failed", error_code: "delivery_unknown", next_attempt_at: null }); return;
  }
  let payload = row.payload;
  if (!payload) {
    const site = await db.from("landing_sites").select("project_id").eq("id", row.site_id).maybeSingle();
    if (site.error) throw new Error("LANDING_NOTIFICATION_OWNER_READ_FAILED");
    const project = site.data ? await db.from("projects").select("owner_id").eq("id", site.data.project_id).maybeSingle() : null;
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
