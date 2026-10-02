import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { snsWeekFor } from "../lib/marketing/kit";
import { buildWeeklyReportEmail, reportWeek, runWeeklyReports, verifyWeeklyReportUnsubscribe, weeklyReportInactive, weeklyReportUnsubscribeToken, weeklyReportUnsubscribeUrl, weeklyTip, type WeeklyStats } from "../lib/landing/weekly-report";
import { operatingRecordedSince } from "../lib/landing/weekly-report-runner";

const at = (iso: string) => Date.parse(iso);

// 보낼 주: 월요일 9시(한국)부터 지난주 월~일
let week = reportWeek(at("2026-10-05T08:59:00+09:00"));
assert.equal(week.due, false, "월요일 9시 전");
assert.equal(week.weekStart, "2026-09-28");
week = reportWeek(at("2026-10-05T09:00:00+09:00"));
assert.deepEqual(week, { weekStart: "2026-09-28", weekEnd: "2026-10-04", from: "2026-09-27T15:00:00.000Z", to: "2026-10-04T15:00:00.000Z", prevFrom: "2026-09-20T15:00:00.000Z", due: true });
week = reportWeek(at("2026-10-04T23:30:00+09:00"));
assert.equal(week.weekStart, "2026-09-21", "일요일 밤에는 그 전 주가 보낼 주");
assert.equal(reportWeek(at("2026-10-01T12:00:00+09:00")).weekStart, "2026-09-21", "수요일");

// 이번 주 해 볼 일
const base: WeeklyStats = { leads: 0, prevLeads: 0, views: 0, prevViews: 0, clicks: 0, prevClicks: 0 };
assert.match(weeklyTip({ ...base, leads: 3, prevLeads: 1, views: 40 }), /늘었어요/);
assert.match(weeklyTip({ ...base, views: 25 }), /문의 버튼 문구/);
assert.match(weeklyTip({ ...base, views: 3 }), /인스타그램/);
assert.match(weeklyTip({ ...base, leads: 1, prevLeads: 2, views: 30 }), /사진 한 장/);

// 메일 본문
const email = buildWeeklyReportEmail({ from: "알림 <alerts@oneulstart.com>", to: "owner@example.com", businessName: "퇴근길<script>", weekStart: "2026-09-28", weekEnd: "2026-10-04", stats: { ...base, leads: 2, prevLeads: 1, views: 12, prevViews: 20 }, homepageUrl: "https://oneulstart.com/launch/x", unsubscribeUrl: "https://oneulstart.com/u?x=1&y=2", recordUrl: "https://oneulstart.com/plan/workspace?planId=p&tab=operations" });
assert.equal(email.subject, "[오늘창업] 퇴근길<script> 지난주 문의 2건 · 주간 리포트");
assert.ok(email.text.includes("09/28~10/04") && email.text.includes("홈페이지 문의: 2건 (지난주보다 1건 늘었어요)") && email.text.includes("방문(동의한 손님): 12회 (지난주보다 8회 줄었어요)"));
assert.ok(email.text.includes("지난주 매출·주문을 아직 안 적으셨어요"));
assert.ok(email.html?.includes("퇴근길&lt;script&gt;") && !email.html.includes("<script>"), "사업 이름은 이스케이프");
assert.ok(email.html?.includes("u?x=1&amp;y=2"));
assert.deepEqual(email.headers, { "List-Unsubscribe": "<https://oneulstart.com/u?x=1&y=2>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
assert.ok(!buildWeeklyReportEmail({ ...{ from: "a", to: "b", businessName: "", weekStart: "2026-09-28", weekEnd: "2026-10-04", stats: base, homepageUrl: "h", unsubscribeUrl: "u", recordUrl: null } }).text.includes("아직 안 적으셨어요"));

// 이번 주 SNS 할 일: 홍보 키트를 만든 날부터 몇 주째인지로 고르고, 4주가 지나면 새 운영표를 안내한다
{
  const kitWeek = (n: number) => ({ week: n, theme: `주제${n}`, posts: [{ day: "월", format: "사진", idea: `아이디어${n}`, caption: "글" }, { day: "목", format: "글", idea: `둘째${n}`, caption: "글" }] });
  const saved = { generatedAt: "2026-09-01T00:00:00.000Z", kit: {
    placeIntro: "소개", openingMessage: "안내", flyer: { headline: "제목", body: "본문", cta: "행동" },
    posts: [1, 2, 3].map(() => ({ channel: "인스타그램", body: "게시물", hashtags: ["#빵"] })), reviewRequest: "리뷰 부탁", calendar: [1, 2, 3, 4].map(kitWeek),
  } };
  const day = 24 * 60 * 60_000, start = Date.parse(saved.generatedAt);
  assert.equal((snsWeekFor(saved, start + day) as { week: number }).week, 1);
  assert.equal((snsWeekFor(saved, start + 8 * day) as { week: number }).week, 2);
  assert.deepEqual(snsWeekFor(saved, start + 29 * day), { finished: true });
  assert.equal(snsWeekFor({ generatedAt: "x", kit: saved.kit }, start), null);
  assert.equal(snsWeekFor(null, start), null);
  const common = { from: "a", to: "b", businessName: "빵집", weekStart: "2026-09-28", weekEnd: "2026-10-04", stats: base, homepageUrl: "h", unsubscribeUrl: "u", recordUrl: null, snsUrl: "https://oneulstart.com/plan/workspace?planId=p" };
  const withSns = buildWeeklyReportEmail({ ...common, sns: snsWeekFor(saved, start + 8 * day) });
  assert.ok(withSns.text.includes("이번 주 SNS 할 일 (2주차 · 주제2)") && withSns.text.includes("월 사진: 아이디어2"), withSns.text);
  assert.ok(withSns.html?.includes("올릴 글 보기"));
  assert.ok(buildWeeklyReportEmail({ ...common, sns: { finished: true } }).html?.includes("새 운영표 만들기"));
  assert.ok(!buildWeeklyReportEmail({ ...common, sns: null }).text.includes("SNS"), "no kit → no SNS block");
}

// 오래 조용한 홈페이지는 쉰다
assert.equal(weeklyReportInactive(base, "2026-08-01T00:00:00Z", at("2026-10-05T09:00:00+09:00")), true);
assert.equal(weeklyReportInactive(base, "2026-09-20T00:00:00Z", at("2026-10-05T09:00:00+09:00")), false, "새로 만든 홈페이지는 0건이어도 보낸다");
assert.equal(weeklyReportInactive({ ...base, views: 1 }, "2026-08-01T00:00:00Z", at("2026-10-05T09:00:00+09:00")), false);

// 운영 기록 안내
assert.equal(operatingRecordedSince({}, "2026-09-28"), false);
assert.equal(operatingRecordedSince({ __business_operations: { version: 1, revision: 1, periods: [{ id: crypto.randomUUID(), revision: 1, start: "2026-09-28", end: "2026-10-04", metrics: { inquiries: 1, orders: null, revenue: null, expenses: null }, feedback: "", keep: "", change: "", nextAction: "", successCriterion: "", createdAt: "x", updatedAt: "x" }], reports: [], analyses: [] } }, "2026-09-28"), true);
assert.equal(operatingRecordedSince({ __business_operations: "broken" }, "2026-09-28"), null);

/* 저장소 흉내 — runWeeklyReports 가 쓰는 질의만 */
type Row = Record<string, any>;
function fakeDb(data: { sites: Row[]; leads: Row[]; events: Row[]; projects: Row[]; users: Record<string, { email: string; email_confirmed_at: string | null }> }) {
  const reports: Row[] = [];
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "select" | "insert" | "update" = "select";
    let patch: Row = {};
    let headCount = false;
    let single = false;
    const source = () => table === "landing_sites" ? data.sites : table === "landing_weekly_reports" ? reports : table === "landing_leads" ? data.leads : table === "landing_events" ? data.events : data.projects;
    const run = () => {
      if (mode === "insert") {
        if (reports.some((row) => row.site_id === patch.site_id && row.week_start === patch.week_start)) return { data: null, error: { code: "23505" } };
        const row: Row = { attempts: 0, lease_until: null, updated_at: new Date().toISOString(), ...patch };
        reports.push(row);
        return { data: [{ site_id: row.site_id }], error: null };
      }
      const rows = source().filter((row) => filters.every((f) => f(row)));
      if (mode === "update") { rows.forEach((row) => Object.assign(row, patch)); return { data: rows.map((row) => ({ site_id: row.site_id })), error: null }; }
      if (headCount) return { count: rows.length, error: null };
      if (single) return { data: rows[0] ?? null, error: null };
      return { data: rows.map((row) => ({ ...row })), error: null };
    };
    const chain: any = {
      select: (_cols?: string, opts?: { head?: boolean }) => { if (opts?.head) headCount = true; return chain; },
      insert: (values: Row) => { mode = "insert"; patch = values; return chain; },
      update: (values: Row) => { mode = "update"; patch = values; return chain; },
      eq: (key: string, value: unknown) => { filters.push((row) => key === "weekly_report_opt_out" ? Boolean(row[key]) === value : row[key] === value); return chain; },
      not: (key: string) => { filters.push((row) => row[key] !== null && row[key] !== undefined); return chain; },
      gte: (key: string, value: string) => { filters.push((row) => row[key] >= value); return chain; },
      lt: (key: string, value: string) => { filters.push((row) => row[key] < value); return chain; },
      order: () => chain, limit: () => chain,
      maybeSingle: () => { single = true; return Promise.resolve(run()); },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  };
  return { reports, db: { from, auth: { admin: { getUserById: async (id: string) => ({ data: { user: data.users[id] ? { ...data.users[id] } : null }, error: null }) } } } as unknown as SupabaseClient };
}

(async () => {
  const secret = "test-secret";
  const token = await weeklyReportUnsubscribeToken("site-a", secret);
  assert.equal(await verifyWeeklyReportUnsubscribe("site-a", token, secret), true);
  assert.equal(await verifyWeeklyReportUnsubscribe("site-b", token, secret), false, "다른 홈페이지");
  assert.equal(await verifyWeeklyReportUnsubscribe("site-a", token, "other"), false, "다른 비밀");
  assert.equal(await verifyWeeklyReportUnsubscribe("site-a", "", secret), false);
  assert.ok((await weeklyReportUnsubscribeUrl("site-a", secret)).startsWith("https://oneulstart.com/api/public/weekly-report/unsubscribe?site=site-a&token="));

  const now = at("2026-10-05T10:00:00+09:00");
  const site = (id: string, extra: Row = {}) => ({ id, project_id: `p-${id}`, slug: id, published_slug: id, custom_domain: null, created_at: "2026-09-01T00:00:00Z", published_version: 1, weekly_report_opt_out: false, businessName: `사업 ${id}`, ...extra });
  const fake = fakeDb({
    sites: [site("active"), site("quiet", { created_at: "2026-07-01T00:00:00Z" }), site("noemail"), site("off", { weekly_report_opt_out: true }), site("draft", { published_version: null })],
    leads: [{ site_id: "active", created_at: "2026-09-29T03:00:00Z" }, { site_id: "active", created_at: "2026-10-02T03:00:00Z" }, { site_id: "active", created_at: "2026-09-22T03:00:00Z" }, { site_id: "active", created_at: "2026-10-05T00:30:00Z" }],
    events: [{ site_id: "active", event_type: "page_view", created_at: "2026-09-30T03:00:00Z" }],
    projects: ["active", "quiet", "noemail", "off", "draft"].map((id) => ({ id: `p-${id}`, owner_id: `u-${id}`, guest_token_hash: `h-${id}`, opportunity: { planId: `plan-${id}` } })),
    users: { "u-active": { email: "active@example.com", email_confirmed_at: "2026-01-01" }, "u-quiet": { email: "quiet@example.com", email_confirmed_at: "2026-01-01" }, "u-noemail": { email: "x@example.com", email_confirmed_at: null } },
  });
  const sent: Array<{ headers: Headers; body: Row }> = [];
  const transport = (async (_url: unknown, init?: RequestInit) => { sent.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) }); return new Response(JSON.stringify({ id: `provider-${sent.length}` }), { status: 200 }); }) as typeof fetch;
  const config = { key: "fake-key", from: "알림 <alerts@oneulstart.com>" };
  const deps = { db: fake.db, config, secret, transport, now, operatingRecorded: async () => false };

  assert.deepEqual(await runWeeklyReports({ ...deps, now: at("2026-10-05T08:00:00+09:00") }), { due: false, reason: "not_due", candidates: 0, sent: 0, skipped: 0, failed: 0 });
  assert.equal((await runWeeklyReports({ ...deps, config: null })).reason, "missing_notification_config", "문자·메일 설정이 모두 없으면 아무것도 안 한다");
  assert.equal(fake.reports.length, 0);

  const first = await runWeeklyReports(deps);
  assert.deepEqual(first, { due: true, candidates: 3, sent: 1, skipped: 2, failed: 0 }, "공개·수신 중인 3곳: 1곳 발송, 조용한 곳·메일 미확인 쉼");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].headers.get("Idempotency-Key"), "weekly-report/active/2026-09-28");
  assert.deepEqual(sent[0].body.to, ["active@example.com"]);
  assert.match(String(sent[0].body.subject), /사업 active 지난주 문의 2건/, "지난주(9/28~10/4) 문의만 — 그 전 주·이번 주 월요일 새벽 문의는 빼고");
  assert.ok(String(sent[0].body.text).includes("지난주보다 1건 늘었어요"));
  assert.ok(String(sent[0].body.text).includes("plan/workspace?planId=plan-active&tab=operations"), "운영 기록 안내");
  assert.ok(String((sent[0].body.headers as Row)["List-Unsubscribe"]).includes("site=active&token="));
  assert.deepEqual(fake.reports.map((row) => [row.site_id, row.status, row.error_code ?? null]).sort(), [["active", "sent", null], ["noemail", "skipped", "recipient_missing"], ["quiet", "skipped", "inactive"]]);

  const again = await runWeeklyReports(deps);
  assert.equal(again.candidates, 0, "같은 주에는 다시 보내지 않는다");
  assert.equal(sent.length, 1);

  // 발송 서버가 잠깐 실패하면 30분 뒤 다시(최대 3번), 거절이면 그만
  const flaky = fakeDb({ sites: [site("active")], leads: [], events: [{ site_id: "active", event_type: "page_view", created_at: "2026-09-30T03:00:00Z" }], projects: [{ id: "p-active", owner_id: "u", guest_token_hash: "h", opportunity: {} }], users: { u: { email: "o@example.com", email_confirmed_at: "2026-01-01" } } });
  let status = 503;
  const flakyTransport = (async () => status === 200 ? new Response(JSON.stringify({ id: "ok" }), { status }) : new Response("{}", { status })) as typeof fetch;
  assert.equal((await runWeeklyReports({ ...deps, db: flaky.db, transport: flakyTransport })).failed, 1);
  assert.equal(flaky.reports[0].status, "failed");
  assert.equal((await runWeeklyReports({ ...deps, db: flaky.db, transport: flakyTransport })).candidates, 0, "30분 안에는 다시 안 보낸다");
  flaky.reports[0].updated_at = new Date(now - 31 * 60_000).toISOString();
  status = 200;
  assert.equal((await runWeeklyReports({ ...deps, db: flaky.db, transport: flakyTransport })).sent, 1, "30분 뒤 재시도");
  assert.equal(flaky.reports[0].attempts, 2);
  const rejected = fakeDb({ sites: [site("active")], leads: [], events: [{ site_id: "active", event_type: "page_view", created_at: "2026-09-30T03:00:00Z" }], projects: [{ id: "p-active", owner_id: "u", guest_token_hash: "h", opportunity: {} }], users: { u: { email: "o@example.com", email_confirmed_at: "2026-01-01" } } });
  await runWeeklyReports({ ...deps, db: rejected.db, transport: (async () => new Response("{}", { status: 422 })) as typeof fetch });
  rejected.reports[0].updated_at = new Date(now - 60 * 60_000).toISOString();
  assert.equal((await runWeeklyReports({ ...deps, db: rejected.db })).candidates, 0, "발송 거절은 다시 시도하지 않는다");

  // 문자: '문자 받을 휴대폰'이 있으면 메일 대신 짧은 문자(숫자만), 같은 주에는 같은 eventId
  const smsFake = fakeDb({
    sites: [site("phone", { alert_phone: "01012345678" }), site("nophone")],
    leads: [{ site_id: "phone", created_at: "2026-09-29T03:00:00Z" }], events: [{ site_id: "nophone", event_type: "page_view", created_at: "2026-09-30T03:00:00Z" }],
    projects: [{ id: "p-phone", owner_id: "u1", guest_token_hash: "h", opportunity: {} }, { id: "p-nophone", owner_id: "u2", guest_token_hash: "h", opportunity: {} }],
    users: { u1: { email: "a@example.com", email_confirmed_at: "2026-01-01" }, u2: { email: "b@example.com", email_confirmed_at: "2026-01-01" } },
  });
  const smsBodies: Row[] = [];
  const smsTransport = (async (_url: unknown, init?: RequestInit) => { const body = JSON.parse(String(init?.body)); smsBodies.push(body); return new Response(JSON.stringify({ eventId: body.eventId, mode: "live", status: "accepted", code: "PROVIDER_ACCEPTED" }), { status: 200 }); }) as typeof fetch;
  const sms = { endpoint: "https://api.example.com/_oneulstart/support-owner-sms", secret: "s".repeat(43), mode: "live" as const };
  const smsRun = await runWeeklyReports({ db: smsFake.db, config: null, secret, now, sms, smsTransport, transport: (async () => { throw new Error("no email"); }) as typeof fetch });
  assert.deepEqual([smsRun.sent, smsRun.skipped], [1, 1], "번호 있는 곳은 문자, 번호도 메일 설정도 없는 곳은 쉼");
  assert.equal(smsBodies.length, 1);
  assert.deepEqual([smsBodies[0].eventType, smsBodies[0].recipient, smsBodies[0].params], ["weekly-report", "01012345678", { leads: 1, prevLeads: 0, views: 0 }]);
  assert.match(String(smsBodies[0].eventId), /^[0-9a-f-]{36}$/);
  assert.deepEqual(smsFake.reports.map((row) => [row.site_id, row.status, row.error_code ?? null]).sort(), [["nophone", "skipped", "recipient_missing"], ["phone", "sent", null]]);

  console.log("weekly-report: week window, tips, email, unsubscribe token, inactive skip, send once per week, retry");
})().catch((error) => { console.error(error); process.exit(1); });
