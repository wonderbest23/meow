import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MIGRATION_CHECKS, evaluateMigrations, isMissingSchemaError, lookupByProbing, lookupFromOpenApi, schemaFailureReason } from "../lib/schema-readiness";

/*
 * DB 준비 상태 점검 — 마이그레이션 파일을 하나도 빠뜨리지 않는지, 확인 결과를 올바르게 묶는지.
 * (상담 저장 0024 가 운영 DB에 없는데도 예전 점검은 'ready' 였다)
 */
const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter(name => name.endsWith(".sql")).sort();
const sql = Object.fromEntries(files.map(name => [name, readFileSync(new URL(name, dir), "utf8").toLowerCase()]));

// 1) 파일마다 하나씩, 없는 파일은 없다
assert.deepEqual([...MIGRATION_CHECKS.map(check => check.file)].sort(), files, "supabase/migrations 의 모든 파일이 점검 목록에 있어야 한다(새 마이그레이션을 추가하면 lib/schema-readiness.ts 에도)");

const checkOf = (file: string) => MIGRATION_CHECKS.find(check => check.file === file)!;
for (const file of files) {
  const check = checkOf(file), text = sql[file];
  // 2) 그 파일이 만드는 public 표·뷰는 같은 파일의 점검에 있다
  for (const [, name] of text.matchAll(/create (?:table|view) (?:if not exists )?public\.([a-z_]+)/g)) {
    assert.ok(check.tables?.includes(name), `${file}: 표·뷰 ${name} 점검 누락`);
  }
  // 3) 그 파일이 public 표에 더하는 칸도 같은 파일의 점검에 있다
  for (const statement of text.split(";")) {
    const table = statement.match(/alter table (?:if exists )?(?:only )?public\.([a-z_]+)/)?.[1];
    if (!table) continue;
    for (const [, column] of statement.matchAll(/add column (?:if not exists )?([a-z_]+)/g)) {
      assert.ok(check.columns?.some(([t, c]) => t === table && c === column), `${file}: 칸 ${table}.${column} 점검 누락`);
    }
  }
  // 4) 앱이 부르는 public 함수(트리거 함수 제외)도 같은 파일의 점검에 있다 — 본문만 바꾸는 파일은 '직접 확인'
  for (const [, name, returns] of text.matchAll(/create (?:or replace )?function public\.([a-z_]+)\s*\([\s\S]*?\)\s*returns\s+([a-z_]+)/g)) {
    if (returns === "trigger" || name === "touch_updated_at") continue;
    // 앞 파일이 만든 함수를 다시 정의하는 것은 본문 교체 — 읽기로는 구분할 수 없어 앞 파일에서 확인한다
    const earlier = MIGRATION_CHECKS.slice(0, MIGRATION_CHECKS.indexOf(check)).some(item => item.functions?.includes(name));
    assert.ok(check.functions?.includes(name) || check.manual || earlier, `${file}: 함수 ${name} 점검 누락`);
  }
  assert.ok(check.manual || (check.tables?.length ?? 0) + (check.columns?.length ?? 0) + (check.functions?.length ?? 0) > 0, `${file}: 확인할 것이 없으면 manual 사유를 적는다`);
}

// 5) OpenAPI 결과를 파일마다 묶는다
const everything = { paths: {} as Record<string, unknown>, definitions: {} as Record<string, { properties: Record<string, unknown> }> };
for (const check of MIGRATION_CHECKS) {
  for (const table of check.tables ?? []) everything.paths[`/${table}`] = {};
  for (const [table, column] of check.columns ?? []) { everything.paths[`/${table}`] = {}; (everything.definitions[table] ??= { properties: {} }).properties[column] = {}; }
  for (const fn of check.functions ?? []) everything.paths[`/rpc/${fn}`] = {};
}
const all = evaluateMigrations(lookupFromOpenApi(everything), { AI_SERVICE_BUDGET_ID: "x", PLAN_QUARANTINE_ENABLED: "1" });
assert.ok(all.every(item => item.status === "ok" || item.status === "manual"), "모두 있으면 '있음'(본문만 바꾸는 파일은 '직접 확인')");

const withoutConsult = structuredClone(everything);
delete withoutConsult.paths["/consult_sessions"];
const consult = evaluateMigrations(lookupFromOpenApi(withoutConsult)).find(item => item.file === "0024_consult_sessions.sql")!;
assert.deepEqual([consult.status, consult.missing], ["missing", ["테이블 consult_sessions"]], "상담 저장 표가 없으면 0024 가 '없음'");

const halfManual = structuredClone(everything);
delete halfManual.definitions.payment_orders.properties.admin_note;
assert.equal(evaluateMigrations(lookupFromOpenApi(halfManual)).find(item => item.file === "0016_manual_bank_transfer.sql")!.status, "partial", "일부 칸만 있으면 '일부만 있음'(그대로 다시 실행하면 안 될 수 있다)");

const noBudget = structuredClone(everything);
delete noBudget.paths["/rpc/ai_budget_reserve"]; delete noBudget.paths["/rpc/ai_budget_transition"]; delete noBudget.paths["/rpc/ai_budget_lookup"];
assert.equal(evaluateMigrations(lookupFromOpenApi(noBudget), {}).find(item => item.file.startsWith("20260920"))!.status, "optional", "설정을 켜지 않은 기능은 '선택'");
assert.equal(evaluateMigrations(lookupFromOpenApi(noBudget), { AI_SERVICE_BUDGET_ID: "budget" }).find(item => item.file.startsWith("20260920"))!.status, "missing", "켰는데 없으면 '없음'");

// 6) 0줄 읽기 — 표 없음·칸 없음만 '없음', 그 밖의 오류는 '확인 못 함', 함수는 부르지 않는다
(async () => {
const calls: string[] = [];
const fakeDb = {
  rpc() { throw new Error("함수를 부르면 안 된다"); },
  from(table: string) {
    return { select(columns: string) {
      return { async limit() {
        calls.push(`${table}:${columns}`);
        if (table === "consult_sessions") return { error: { code: "PGRST205", message: "Could not find the table" } };
        if (table === "landing_sites" && columns === "alert_phone") return { error: { code: "42703", message: "column does not exist" } };
        if (table === "refund_requests") return { error: { code: "PGRST301", message: "timeout" } };
        return { error: null };
      } };
    } };
  },
} as unknown as SupabaseClient;
const probed = evaluateMigrations(await lookupByProbing(fakeDb));
const statusOf = (file: string) => probed.find(item => item.file === file)!.status;
assert.equal(statusOf("0024_consult_sessions.sql"), "missing");
assert.equal(statusOf("0039_landing_alert_phone.sql"), "partial", "번호 칸 하나가 없고 하나는 있으면 '일부만 있음'");
assert.equal(statusOf("0021_refund_requests.sql"), "unknown", "연결 오류를 '없음'으로 바꾸지 않는다");
assert.equal(statusOf("0018_rate_limits.sql"), "unknown", "0줄 읽기로는 함수를 확인할 수 없다");
assert.equal(statusOf("0019_plan_states.sql"), "ok");
assert.ok(calls.every(call => !call.startsWith("rpc")));

// 7) 예약 작업 사유 — 표·칸·함수가 없을 때만 '마이그레이션 필요'
assert.equal(isMissingSchemaError({ code: "PGRST205" }), true);
assert.equal(isMissingSchemaError({ code: "PGRST202" }), true);
assert.equal(isMissingSchemaError({ code: "57014" }), false);
assert.equal(schemaFailureReason({ code: "42P01" }), "migration_required:42P01");
assert.equal(schemaFailureReason({ code: "08006" }), "query_failed:08006");
assert.equal(schemaFailureReason(null), "query_failed:unknown");

console.log(`schema-readiness: 마이그레이션 ${files.length}개 모두 점검 목록에 있음, 묶기·0줄 읽기·사유 통과`);
})().catch(error => { console.error(error); process.exitCode = 1; });

// 8) 운영 설정 확인 — 있음/없음만, 값은 내보내지 않는다
import("../lib/ops-config-readiness").then(({ checkOpsConfig }) => {
  const secret = "sk-live-SECRET-VALUE-123";
  const empty = checkOpsConfig({});
  assert.ok(empty.filter(item => item.required).every(item => !item.ok), "아무것도 없으면 필수 설정이 모두 '없음'");
  const full = checkOpsConfig({ ANTHROPIC_API_KEY: secret, NICEPAY_CLIENT_KEY: secret, NICEPAY_SECRET_KEY: secret, RESEND_API_KEY: secret, NOTIFY_FROM_EMAIL: "a@b.c", CLOUDFLARE_SAAS_API_TOKEN: secret, CLOUDFLARE_ZONE_ID: "z", CUSTOMER_SMS_ENABLED: "1", OWNER_SMS_RELAY_URL: "https://relay.example.com/v1", OWNER_SMS_RELAY_SECRET: "x".repeat(40), OWNER_SMS_MODE: "live" });
  assert.ok(full.filter(item => item.required).every(item => item.ok), "필수 설정이 다 있으면 '있음'");
  assert.ok(!JSON.stringify(full).includes(secret), "비밀값을 내보내지 않는다");
  const sandbox = checkOpsConfig({ NICEPAY_CLIENT_KEY: "k", NICEPAY_SECRET_KEY: "s", NICEPAY_ENVIRONMENT: "sandbox" }).find(item => item.key === "payments")!;
  assert.equal(sandbox.ok, false, "시험 결제 환경은 '없음'으로(유료 기능이 공짜로 열린다)");
  const testSms = checkOpsConfig({ CUSTOMER_SMS_ENABLED: "1", OWNER_SMS_RELAY_URL: "https://relay.example.com/v1", OWNER_SMS_RELAY_SECRET: "x".repeat(40), OWNER_SMS_MODE: "test" }).find(item => item.key === "customer-sms")!;
  assert.equal(testSms.ok, false, "시험 문자 모드는 실제로 안 나가므로 '없음'");
  console.log("ops-config-readiness: 있음/없음만, 비밀값 숨김, 시험 결제·시험 문자 경고");
}).catch(error => { console.error(error); process.exitCode = 1; });
