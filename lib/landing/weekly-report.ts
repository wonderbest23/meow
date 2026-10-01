import type { SupabaseClient } from "@supabase/supabase-js";
import { projectReadTable } from "../plan-builder/quarantine-tables";
import { landingEmailConfiguration, sendLandingLeadEmail, type LeadEmailPayload } from "./lead-email";

/*
 * 주간 사장님 리포트 — 매주 월요일 오전 9시(한국 시간)부터, 공개한 홈페이지 주인에게 지난주(월~일) 성적표를 보낸다.
 *
 * 계획서와 홈페이지를 만든 뒤에도 오늘창업에 다시 들어올 이유를 만드는 장치다. 사장님이 아무것도 적지 않아도
 * 쌓이는 것(문의·동의한 방문·버튼 클릭)만 싣고, 지난주와 견주고, 이번 주에 할 일 하나를 붙인다. AI 를 부르지
 * 않는다(규칙으로 고른 한 줄) — 비용이 사업 수만큼 매주 늘지 않게.
 *
 * 5분마다 도는 예약 실행(cloudflare-worker.ts → sweepLeadNotifications)에서 한 번에 몇 곳씩 보낸다.
 * landing_weekly_reports(site_id, week_start) 한 줄이 '이번 주 이 홈페이지는 맡았다'는 표시라 두 번 보내지 않는다.
 * 표(마이그레이션 0038)가 없으면 아무것도 보내지 않는다 — 수신 거부를 지킬 곳이 없으니까.
 */

const DAY = 24 * 60 * 60_000;
const KST = 9 * 60 * 60_000;
export const WEEKLY_REPORT_SEND_HOUR_KST = 9;
export const WEEKLY_REPORT_MAX_ATTEMPTS = 3;

const kstDate = (time: number) => new Date(time + KST).toISOString().slice(0, 10);
const kstMidnight = (date: string) => Date.parse(`${date}T00:00:00+09:00`);

/** 지금 보낼 주 — 지난주 월요일(한국 시간)부터 이번 주 월요일 0시까지. 이번 주 월요일 9시 전이면 due=false */
export function reportWeek(now = Date.now()) {
  const today = kstDate(now);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 월=0 … 일=6
  const thisMonday = kstMidnight(today) - weekday * DAY;
  const from = thisMonday - 7 * DAY;
  return {
    weekStart: kstDate(from),
    weekEnd: kstDate(thisMonday - DAY),
    from: new Date(from).toISOString(),
    to: new Date(thisMonday).toISOString(),
    prevFrom: new Date(from - 7 * DAY).toISOString(),
    due: now >= thisMonday + WEEKLY_REPORT_SEND_HOUR_KST * 60 * 60_000,
  };
}

export type WeeklyStats = { leads: number; prevLeads: number; views: number; prevViews: number; clicks: number; prevClicks: number };

/** 이번 주에 해 볼 일 하나 — 숫자에 따라 고른다(약속하지 않는 말투로) */
export function weeklyTip(stats: WeeklyStats): string {
  if (stats.leads > 0 && stats.leads > stats.prevLeads) return "문의가 지난주보다 늘었어요. 연락 온 손님께 홈페이지에서 무엇을 보고 연락했는지 한 번 물어보세요. 다음 글을 고칠 때 가장 좋은 힌트가 돼요.";
  if (stats.leads === 0 && stats.views >= 10) return "방문은 있는데 문의가 없었어요. 문의 버튼 문구를 '가격 물어보기'·'자리 있는지 묻기'처럼 더 가볍게 바꿔 보세요.";
  if (stats.views < 10) return "아직 방문이 적어요. 홈페이지 주소를 인스타그램 소개란, 당근 비즈프로필, 카카오톡 채널, 네이버 플레이스에 걸어 보세요.";
  return "이번 주에는 사진 한 장만 최근 모습으로 바꿔 보세요. 지금 가게·작업 모습이 보이면 손님이 믿고 연락하기 쉬워요.";
}

const change = (now: number, before: number, unit: string) => now === before ? "지난주와 같아요" : now > before ? `지난주보다 ${now - before}${unit} 늘었어요` : `지난주보다 ${before - now}${unit} 줄었어요`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type WeeklyReportInput = {
  from: string; to: string; businessName: string; weekStart: string; weekEnd: string;
  stats: WeeklyStats; homepageUrl: string; unsubscribeUrl: string;
  /** 지난주 운영 기록을 아직 안 적었으면 적으러 가는 링크 */
  recordUrl: string | null;
};

export function buildWeeklyReportEmail(input: WeeklyReportInput): LeadEmailPayload {
  const { stats } = input;
  const name = input.businessName || "내 사업";
  const range = `${input.weekStart.slice(5).replace("-", "/")}~${input.weekEnd.slice(5).replace("-", "/")}`;
  const rows: Array<[string, number, number, string]> = [["홈페이지 문의", stats.leads, stats.prevLeads, "건"], ["방문(동의한 손님)", stats.views, stats.prevViews, "회"], ["버튼 누름", stats.clicks, stats.prevClicks, "회"]];
  const tip = weeklyTip(stats);
  const text = [
    `${name} 지난주(${range}) 홈페이지 성적표`,
    "",
    ...rows.map(([label, now, before, unit]) => `· ${label}: ${now}${unit} (${change(now, before, unit)})`),
    "",
    `이번 주 해 볼 일: ${tip}`,
    ...(input.recordUrl ? ["", `지난주 매출·주문을 아직 안 적으셨어요. 한 칸만 적어 두면 다음 주부터 비교해 드려요: ${input.recordUrl}`] : []),
    "",
    `홈페이지 고치기·문의 보기: https://oneulstart.com/plan/homepage`,
    `내 홈페이지: ${input.homepageUrl}`,
    "",
    "방문 수는 방문 기록에 동의한 손님만 셉니다. 실제 방문은 이보다 많을 수 있어요.",
    `이 메일을 그만 받으려면: ${input.unsubscribeUrl}`,
  ].join("\n");
  const cell = "padding:10px 12px;border-bottom:1px solid #eef0f4;font-size:14px;";
  const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard','Malgun Gothic',sans-serif;color:#191f28;">
<div style="max-width:520px;margin:0 auto;padding:24px 16px;">
<p style="margin:0 0 4px;color:#6b7684;font-size:13px;">오늘창업 주간 리포트 · ${escapeHtml(range)}</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.4;">${escapeHtml(name)} 지난주 성적표</h1>
<table role="presentation" style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;">
${rows.map(([label, now, before, unit]) => `<tr><td style="${cell}color:#4e5968;">${escapeHtml(label)}</td><td style="${cell}text-align:right;"><strong style="font-size:18px;">${now}</strong>${unit}<br><span style="color:#8b95a1;font-size:12px;">${escapeHtml(change(now, before, unit))}</span></td></tr>`).join("\n")}
</table>
<div style="margin:16px 0;padding:14px 16px;background:#eef4ff;border-radius:12px;font-size:14px;line-height:1.6;"><strong>이번 주 해 볼 일</strong><br>${escapeHtml(tip)}</div>
${input.recordUrl ? `<div style="margin:0 0 16px;padding:14px 16px;background:#fff7e6;border-radius:12px;font-size:14px;line-height:1.6;">지난주 매출·주문을 아직 안 적으셨어요. 한 칸만 적어 두면 다음 주부터 비교해 드려요.<br><a href="${escapeHtml(input.recordUrl)}" style="color:#3272db;font-weight:700;">지난주 기록 적기 →</a></div>` : ""}
<p style="margin:0 0 20px;"><a href="https://oneulstart.com/plan/homepage" style="display:inline-block;padding:12px 18px;background:#3272db;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">홈페이지 고치기·문의 보기</a></p>
<p style="margin:0;color:#8b95a1;font-size:12px;line-height:1.6;">방문 수는 방문 기록에 동의한 손님만 셉니다. 실제 방문은 이보다 많을 수 있어요.<br>내 홈페이지: <a href="${escapeHtml(input.homepageUrl)}" style="color:#8b95a1;">${escapeHtml(input.homepageUrl)}</a><br><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#8b95a1;">이 메일 그만 받기</a></p>
</div></body></html>`;
  return {
    from: input.from, to: input.to,
    subject: `[오늘창업] ${name} 지난주 문의 ${stats.leads}건 · 주간 리포트`,
    text, html,
    // 메일 앱의 '구독 취소' 버튼(RFC 8058) — 누르면 바로 꺼진다
    headers: { "List-Unsubscribe": `<${input.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/* 수신 거부 링크 — 로그인 없이 누를 수 있게 홈페이지 id 에 서명을 붙인다 */
const toBase64Url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
export async function weeklyReportUnsubscribeToken(siteId: string, secret: string) { return hmac(secret, `weekly-report-unsubscribe:${siteId}`); }
export async function verifyWeeklyReportUnsubscribe(siteId: string, token: string, secret: string) {
  if (!siteId || !token || !secret) return false;
  const expected = await weeklyReportUnsubscribeToken(siteId, secret);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
export function weeklyReportSecret(env: Record<string, string | undefined> = process.env) {
  return env.WEEKLY_REPORT_SECRET?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}
export async function weeklyReportUnsubscribeUrl(siteId: string, secret: string, base = "https://oneulstart.com") {
  return `${base}/api/public/weekly-report/unsubscribe?site=${encodeURIComponent(siteId)}&token=${await weeklyReportUnsubscribeToken(siteId, secret)}`;
}

/** 오래 조용한 홈페이지에는 매주 0건 메일을 보내지 않는다 — 만든 지 5주가 넘었고 두 주 내내 아무 일이 없으면 쉰다 */
export function weeklyReportInactive(stats: WeeklyStats, siteCreatedAt: string, now = Date.now()) {
  const quiet = stats.leads + stats.prevLeads + stats.views + stats.prevViews + stats.clicks + stats.prevClicks === 0;
  const created = Date.parse(siteCreatedAt);
  return quiet && Number.isFinite(created) && now - created > 35 * DAY;
}

type SiteRow = { id: string; project_id: string; slug: string; published_slug: string | null; custom_domain: string | null; created_at: string; businessName: string | null };
type ReportRow = { site_id: string; status: string; attempts: number; updated_at: string; lease_until: string | null };

export type WeeklyReportDependencies = {
  db: SupabaseClient | null;
  config: ReturnType<typeof landingEmailConfiguration>;
  secret: string;
  transport?: typeof fetch;
  now?: number;
  /** 지난주를 덮는 운영 기록이 있는지 — 모르면 null(안내를 빼고 보낸다) */
  operatingRecorded?: (ownerHash: string, planId: string, weekStart: string) => Promise<boolean | null>;
};

export type WeeklyReportRun = { due: boolean; reason?: string; candidates: number; sent: number; skipped: number; failed: number };

/** 예약 실행 한 번 — 이번 주에 아직 안 보낸 홈페이지 몇 곳을 맡아 보낸다 */
export async function runWeeklyReports(deps: WeeklyReportDependencies, limit = 10): Promise<WeeklyReportRun> {
  const now = deps.now ?? Date.now();
  const week = reportWeek(now);
  const result: WeeklyReportRun = { due: week.due, candidates: 0, sent: 0, skipped: 0, failed: 0 };
  if (!week.due) return { ...result, reason: "not_due" };
  const { db, config } = deps;
  if (!db) return { ...result, reason: "no_database" };
  if (!config) return { ...result, reason: "missing_email_config" };
  if (!deps.secret) return { ...result, reason: "missing_secret" };

  const sites = await db.from("landing_sites")
    .select("id, project_id, slug, published_slug, custom_domain, created_at, businessName:draft->>businessName")
    .not("published_version", "is", null).eq("weekly_report_opt_out", false).order("id").limit(2000);
  if (sites.error) return { ...result, reason: "migration_required" };
  const reports = await db.from("landing_weekly_reports").select("site_id, status, attempts, updated_at, lease_until").eq("week_start", week.weekStart).limit(5000);
  if (reports.error) return { ...result, reason: "migration_required" };
  const byId = new Map(((reports.data ?? []) as ReportRow[]).map((row) => [row.site_id, row]));
  const retryable = (row: ReportRow) => (row.status === "failed" && row.attempts < WEEKLY_REPORT_MAX_ATTEMPTS && now - Date.parse(row.updated_at) > 30 * 60_000)
    || (row.status === "processing" && row.lease_until !== null && Date.parse(row.lease_until) < now && row.attempts < WEEKLY_REPORT_MAX_ATTEMPTS);
  const due = ((sites.data ?? []) as SiteRow[]).filter((site) => { const row = byId.get(site.id); return !row || retryable(row); });
  result.candidates = due.length;

  for (const site of due.slice(0, limit)) {
    const existing = byId.get(site.id);
    const lease = new Date(now + 10 * 60_000).toISOString();
    // 맡기: 새 줄은 (site_id, week_start) 기본키가, 재시도는 직전 상태 그대로인지가 중복을 막는다
    const claim = existing
      ? await db.from("landing_weekly_reports").update({ status: "processing", lease_until: lease, updated_at: new Date(now).toISOString() })
        .eq("site_id", site.id).eq("week_start", week.weekStart).eq("status", existing.status).eq("updated_at", existing.updated_at).select("site_id")
      : await db.from("landing_weekly_reports").insert({ site_id: site.id, week_start: week.weekStart, status: "processing", attempts: 0, lease_until: lease }).select("site_id");
    if (claim.error || !claim.data?.length) continue;
    const attempts = (existing?.attempts ?? 0) + 1;
    const finish = (patch: Record<string, unknown>) => db.from("landing_weekly_reports")
      .update({ attempts, ...patch, lease_until: null, updated_at: new Date(now).toISOString() }).eq("site_id", site.id).eq("week_start", week.weekStart);
    try {
      const project = await db.from(projectReadTable()).select("owner_id, guest_token_hash, opportunity").eq("id", site.project_id).maybeSingle();
      const ownerId = project.data?.owner_id as string | undefined;
      const owner = ownerId ? await db.auth.admin.getUserById(ownerId) : null;
      const recipient = owner?.data?.user?.email_confirmed_at ? owner.data.user.email : null;
      if (!recipient) { await finish({ status: "skipped", error_code: "recipient_missing" }); result.skipped += 1; continue; }

      const count = async (table: "landing_leads" | "landing_events", from: string, to: string, eventType?: string) => {
        let query = db.from(table).select("id", { count: "exact", head: true }).eq("site_id", site.id).gte("created_at", from).lt("created_at", to);
        if (eventType) query = query.eq("event_type", eventType);
        const { count: value, error } = await query;
        if (error) throw new Error("WEEKLY_REPORT_COUNT_FAILED");
        return value ?? 0;
      };
      const [leads, prevLeads, views, prevViews, clicks, prevClicks] = await Promise.all([
        count("landing_leads", week.from, week.to), count("landing_leads", week.prevFrom, week.from),
        count("landing_events", week.from, week.to, "page_view"), count("landing_events", week.prevFrom, week.from, "page_view"),
        count("landing_events", week.from, week.to, "cta_click"), count("landing_events", week.prevFrom, week.from, "cta_click"),
      ]);
      const stats = { leads, prevLeads, views, prevViews, clicks, prevClicks };
      if (weeklyReportInactive(stats, site.created_at, now)) { await finish({ status: "skipped", error_code: "inactive" }); result.skipped += 1; continue; }

      const planId = String((project.data?.opportunity as { planId?: unknown } | null)?.planId ?? "");
      const ownerHash = String(project.data?.guest_token_hash ?? "");
      const recorded = planId && ownerHash && deps.operatingRecorded ? await deps.operatingRecorded(ownerHash, planId, week.weekStart).catch(() => null) : null;
      const payload = buildWeeklyReportEmail({
        from: config.from, to: recipient, businessName: site.businessName ?? "", weekStart: week.weekStart, weekEnd: week.weekEnd, stats,
        homepageUrl: site.custom_domain ? `https://${site.custom_domain}` : `https://oneulstart.com/launch/${site.published_slug ?? site.slug}`,
        unsubscribeUrl: await weeklyReportUnsubscribeUrl(site.id, deps.secret),
        recordUrl: recorded === false ? `https://oneulstart.com/plan/workspace?planId=${encodeURIComponent(planId)}&tab=operations` : null,
      });
      const sent = await sendLandingLeadEmail(payload, config.key, `weekly-report/${site.id}/${week.weekStart}`, deps.transport);
      if (sent.ok) { await finish({ status: "sent", provider_id: sent.providerId, error_code: null }); result.sent += 1; }
      else { await finish({ status: "failed", error_code: sent.code, ...(sent.retryable ? {} : { attempts: WEEKLY_REPORT_MAX_ATTEMPTS }) }); result.failed += 1; }
    } catch {
      await finish({ status: "failed", error_code: "report_failed" });
      result.failed += 1;
    }
  }
  return result;
}
