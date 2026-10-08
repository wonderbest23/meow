import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * DB 준비 상태 — 운영 DB에 마이그레이션이 다 들어갔는지 마이그레이션 파일마다 확인한다.
 *
 * 예전 점검(/api/health/persistence)은 처음 만든 테이블 19개만 봤다. 그래서 상담 저장(0024)이
 * 운영 DB에 없어 상담 기록이 남지 않고 손님 하루 3번 제한도 걸리지 않는 동안 '준비됨'이라고 답했다.
 * 코드가 DB 오류를 기본값으로 바꾸는 곳이 많아 화면만 봐서는 알 수 없다 — 여기서 한곳에 모아 본다.
 *
 * 새 마이그레이션을 추가하면 아래 목록에도 넣어야 한다(scripts/schema-readiness.test.ts 가 빠뜨림을 잡는다).
 * 확인은 읽기 전용이다: Supabase REST 의 스키마 목록(OpenAPI) 한 번, 안 되면 테이블마다 0줄 읽기.
 * 함수(RPC)는 부르지 않는다 — 부르면 기록이 생기는 함수가 있다.
 */

export type MigrationCheck = {
  /** supabase/migrations 의 파일 이름 */
  file: string;
  /** 이 파일이 없으면 멈추거나 조용히 빠지는 기능 */
  feature: string;
  tables?: string[];
  columns?: Array<[table: string, column: string]>;
  functions?: string[];
  /** 읽기만으로는 확인할 수 없는 변경(데이터·기본값·함수 본문·트리거만 바꾸는 파일) */
  manual?: string;
  /** 이 설정이 켜져 있을 때만 필요하다 */
  onlyWhen?: { env: string; label: string };
};

export const MIGRATION_CHECKS: MigrationCheck[] = [
  { file: "0001_service_core.sql", feature: "사업·홈페이지를 잇는 기본 프로젝트 저장", tables: ["projects", "project_stages", "stage_artifacts", "generation_jobs", "revision_requests"] },
  { file: "0002_automated_review_only.sql", feature: "검수 상태 값 정리", manual: "기존 기록의 값과 제약만 바꾸는 파일이에요" },
  { file: "0003_business_setup_and_financials.sql", feature: "창업 준비·재무 기록", columns: [["projects", "business_setup"], ["projects", "business_assessment"]] },
  { file: "0004_market_location_business_plan.sql", feature: "상권·사업계획 기록", columns: [["projects", "market_workspace"], ["projects", "market_analysis"], ["projects", "business_plan"]] },
  { file: "0005_landing_publish_and_leads.sql", feature: "홈페이지 저장·공개와 손님 문의", tables: ["landing_sites", "landing_versions", "landing_leads", "landing_events"] },
  { file: "0006_operations_package.sql", feature: "운영 준비 기록", columns: [["projects", "operations_workspace"], ["projects", "operations_assessment"], ["projects", "operations_package"]] },
  { file: "0007_execution_data_loop.sql", feature: "실행 기록", columns: [["projects", "execution_workspace"], ["projects", "execution_analysis"]] },
  { file: "0008_quality_assurance.sql", feature: "법령 근거 검수", tables: ["legal_source_snapshots"], columns: [["projects", "quality_audit"]] },
  { file: "0009_payment_transaction_layer.sql", feature: "결제 주문", tables: ["payment_orders", "payment_events"], functions: ["complete_payment_order"] },
  { file: "0010_service_ops_foundation.sql", feature: "작업 기록(감사 로그)", tables: ["service_audit_logs"] },
  { file: "0011_grant_program_layer.sql", feature: "지원사업 기록", columns: [["projects", "grant_workspace"], ["projects", "grant_analysis"], ["projects", "grant_package"]] },
  { file: "0012_beginner_launch_missions.sql", feature: "창업 미션 기록", columns: [["projects", "launch_mission_workspace"]] },
  { file: "0013_support_chat.sql", feature: "1:1 상담", tables: ["support_conversations", "support_messages"] },
  { file: "0014_platform_legal_settings.sql", feature: "운영 설정·약관 동의 기록", tables: ["platform_legal_settings", "account_consents"] },
  { file: "0015_opportunity_preferences.sql", feature: "관심 분야 저장(로그인 연결)", tables: ["opportunity_preferences"] },
  { file: "0016_manual_bank_transfer.sql", feature: "계좌 입금 주문·현금영수증", columns: ["owner_id", "customer_email", "depositor_name", "customer_phone", "cash_receipt_type", "cash_receipt_identifier", "cash_receipt_status", "cash_receipt_issued_at", "deposit_reported_at", "admin_note"].map(column => ["payment_orders", column] as [string, string]) },
  { file: "0017_beta_package_price.sql", feature: "베타 가격 기본값", manual: "기본값과 함수 본문만 바꾸는 파일이에요" },
  { file: "0018_rate_limits.sql", feature: "서버끼리 함께 세는 사용량 제한(없으면 서버마다 따로 세서 제한이 느슨해지고, 운영자 문자 제한 확인이 막혀요)", tables: ["rate_limits"], functions: ["bump_rate_limit", "purge_expired_rate_limits"] },
  { file: "0019_plan_states.sql", feature: "사업 저장(전체)", tables: ["plan_states"] },
  { file: "0020_llm_usage.sql", feature: "AI 사용량·비용 기록", tables: ["llm_usage"] },
  { file: "0021_refund_requests.sql", feature: "환불 요청(없으면 관리자 환불 목록이 비어 보여요)", tables: ["refund_requests"] },
  { file: "0022_plan_regenerations.sql", feature: "문서 다시 만들기 횟수", tables: ["plan_regenerations", "plan_regen_packs"] },
  { file: "0023_llm_usage_tokens.sql", feature: "홈페이지 AI 글 채우기·AI 수정 토큰", columns: [["llm_usage", "plan_id"], ["llm_usage", "owner_hash"], ["llm_usage", "input_tokens"], ["llm_usage", "output_tokens"]] },
  { file: "0024_consult_sessions.sql", feature: "무료 창업 상담 기록과 하루 이용 횟수 제한(없으면 기록이 남지 않고 제한도 걸리지 않아요)", tables: ["consult_sessions"] },
  { file: "0025_site_copy.sql", feature: "홈 문구 관리", tables: ["site_copy"] },
  { file: "0026_funnel_events.sql", feature: "방문·전환 통계", tables: ["funnel_events"] },
  { file: "0027_plan_account_linking.sql", feature: "로그인 계정으로 사업 옮기기·결과물 함께 수정하기", tables: ["plan_owner_claims"], functions: ["commit_plan_state", "claim_plan_state"] },
  { file: "0028_account_link_retry.sql", feature: "계정 옮기기 다시 시도", columns: [["plan_owner_claims", "legacy_completed_at"]] },
  { file: "0029_generation_observability.sql", feature: "관리자 AI 비용·생성 작업 화면", columns: [["llm_usage", "model"], ["llm_usage", "elapsed_ms"], ["llm_usage", "failure_code"]], functions: ["admin_generation_jobs"] },
  { file: "0030_homepage_lifecycle.sql", feature: "홈페이지 만들기·공개·되돌리기와 공개 주소", columns: [["landing_sites", "published_slug"], ["landing_versions", "source_updated_at"]], functions: ["ensure_plan_project", "publish_landing_snapshot", "rollback_landing_snapshot"] },
  { file: "0031_nicepay_reconciliation.sql", feature: "카드 결제 확정(없으면 카드 결제가 '대기'로 남아요)", functions: ["claim_nicepay_plan_order", "settle_nicepay_plan_order"] },
  { file: "0032_artifact_updates.sql", feature: "결과물 함께 수정하기", tables: ["plan_artifact_updates"], functions: ["commit_artifact_update"] },
  { file: "0034_landing_lead_notifications.sql", feature: "새 문의 알림(문자·메일) — 없으면 손님 문의는 저장돼도 사장님께 알림이 가지 않아요", tables: ["landing_lead_notifications"], functions: ["claim_landing_lead_notification"] },
  { file: "0035_artifact_resume_limits.sql", feature: "결과물 수정 이어하기 횟수 제한", manual: "트리거만 추가하는 파일이에요" },
  { file: "0036_intake_account_claim.sql", feature: "AI 작업 중 계정 옮기기 보호", manual: "기존 함수 본문만 바꾸는 파일이에요(다시 실행해도 안전)" },
  { file: "0037_llm_usage_cache_tokens.sql", feature: "AI 캐시 토큰 기록", columns: [["llm_usage", "cache_read_tokens"], ["llm_usage", "cache_write_tokens"]] },
  { file: "0038_landing_weekly_reports.sql", feature: "주간 리포트 메일", tables: ["landing_weekly_reports"], columns: [["landing_sites", "weekly_report_opt_out"]] },
  { file: "0039_landing_alert_phone.sql", feature: "문의 알림 받을 휴대폰 번호", columns: [["landing_sites", "alert_phone"], ["landing_sites", "alert_phone_agreed_at"]] },
  { file: "0040_payment_notice_and_tax_reminders.sql", feature: "결제 완료 알림·세금 신고 알림 문자", tables: ["tax_reminder_sends"], columns: [["payment_orders", "paid_notified_at"]] },
  { file: "20260920100702_ai_service_cost_ledger.sql", feature: "AI 비용 한도 장부", functions: ["ai_budget_reserve", "ai_budget_transition", "ai_budget_lookup"], onlyWhen: { env: "AI_SERVICE_BUDGET_ID", label: "AI 비용 한도 장부를 켠 경우" } },
  { file: "20260922113638_plan_legacy_quarantine.sql", feature: "옛 사업 격리", tables: ["plan_states_accessible", "projects_accessible"], functions: ["plan_quarantine_status"], onlyWhen: { env: "PLAN_QUARANTINE_ENABLED", label: "옛 사업 격리를 켠 경우" } },
  { file: "20261006090000_landing_lead_handled.sql", feature: "문의 '처리 완료' 표시(없으면 버튼이 보이지 않아요)", columns: [["landing_leads", "handled_at"]] },
  { file: "20261006090100_service_requests.sql", feature: "다음 단계 서비스 신청(없으면 관리자 신청 목록이 비어 보여요)", tables: ["service_requests"] },
  { file: "20261006120000_business_checks.sql", feature: "사업자등록 확인 결과 저장", tables: ["business_checks"] },
];

/** 코드가 쓰지만 마이그레이션이 만들지 않는 것 — 손으로 만들어야 한다 */
export const IMAGE_BUCKET = "landing-images";

export type ObjectState = "ok" | "missing" | "unknown";
export type MigrationStatus = "ok" | "missing" | "partial" | "unknown" | "manual" | "optional";
export type MigrationReport = { file: string; feature: string; status: MigrationStatus; missing: string[]; unknown: string[]; note?: string };
export type ReadinessReport = {
  checkedAt: string;
  source: "openapi" | "probe" | "none";
  migrations: MigrationReport[];
  bucket: { name: string; status: "ok" | "missing" | "private" | "unknown" };
  summary: Record<MigrationStatus, number>;
  ready: boolean;
};

type Lookup = { table(name: string): ObjectState; column(table: string, column: string): ObjectState; fn(name: string): ObjectState };

function objectsOf(check: MigrationCheck, lookup: Lookup): Array<{ label: string; state: ObjectState }> {
  return [
    ...(check.tables ?? []).map(name => ({ label: `테이블 ${name}`, state: lookup.table(name) })),
    ...(check.columns ?? []).map(([table, column]) => ({ label: `칸 ${table}.${column}`, state: lookup.column(table, column) })),
    ...(check.functions ?? []).map(name => ({ label: `함수 ${name}`, state: lookup.fn(name) })),
  ];
}

/** 확인 결과를 마이그레이션 파일마다 묶는다 — 모르는 것은 '없음'이나 '있음'으로 바꾸지 않는다 */
export function evaluateMigrations(lookup: Lookup, env: Record<string, string | undefined> = {}): MigrationReport[] {
  return MIGRATION_CHECKS.map(check => {
    const base = { file: check.file, feature: check.feature };
    if (check.manual) return { ...base, status: "manual" as const, missing: [], unknown: [], note: check.manual };
    const objects = objectsOf(check, lookup);
    const missing = objects.filter(item => item.state === "missing").map(item => item.label);
    const unknown = objects.filter(item => item.state === "unknown").map(item => item.label);
    const present = objects.length - missing.length - unknown.length;
    const enabled = !check.onlyWhen || Boolean(env[check.onlyWhen.env]?.trim() && env[check.onlyWhen.env] !== "0");
    const status: MigrationStatus = missing.length
      ? (!enabled ? "optional" : present > 0 ? "partial" : "missing")
      : unknown.length ? "unknown" : "ok";
    return { ...base, status, missing, unknown, ...(status === "optional" ? { note: `${check.onlyWhen!.label}에만 필요해요 — 지금은 꺼져 있어요` } : {}) };
  });
}

type OpenApi = { paths?: Record<string, unknown>; definitions?: Record<string, { properties?: Record<string, unknown> }> };

/** Supabase REST 의 스키마 목록(OpenAPI)으로 판단한다 — 목록에 없으면 '없음' */
export function lookupFromOpenApi(spec: OpenApi): Lookup {
  const paths = spec.paths ?? {}, definitions = spec.definitions ?? {};
  return {
    table: name => (paths[`/${name}`] ? "ok" : "missing"),
    column: (table, column) => (definitions[table]?.properties?.[column] ? "ok" : "missing"),
    fn: name => (paths[`/rpc/${name}`] ? "ok" : "missing"),
  };
}

type DbError = { code?: string; message?: string } | null;
const MISSING_TABLE = new Set(["PGRST205", "42P01"]);
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);

/** 0줄 읽기로 판단한다(스키마 목록을 못 받을 때) — 함수는 부르지 않고 '확인 못 함'으로 둔다 */
export async function lookupByProbing(db: SupabaseClient): Promise<Lookup> {
  const tables = new Map<string, ObjectState>(), columns = new Map<string, ObjectState>();
  const wanted = new Map<string, Set<string>>();
  for (const check of MIGRATION_CHECKS) {
    for (const table of check.tables ?? []) if (!wanted.has(table)) wanted.set(table, new Set());
    for (const [table, column] of check.columns ?? []) (wanted.get(table) ?? wanted.set(table, new Set()).get(table)!).add(column);
  }
  const read = async (table: string, select: string): Promise<DbError> => {
    try { const { error } = await db.from(table).select(select).limit(0); return error as DbError; }
    catch (error) { return { message: error instanceof Error ? error.message : "probe failed" }; }
  };
  await Promise.all([...wanted].map(async ([table, wantedColumns]) => {
    const tableError = await read(table, "*");
    const tableState: ObjectState = !tableError ? "ok" : MISSING_TABLE.has(tableError.code ?? "") ? "missing" : "unknown";
    tables.set(table, tableState);
    await Promise.all([...wantedColumns].map(async column => {
      if (tableState !== "ok") { columns.set(`${table}.${column}`, tableState); return; }
      const error = await read(table, column);
      columns.set(`${table}.${column}`, !error ? "ok" : MISSING_COLUMN.has(error.code ?? "") ? "missing" : "unknown");
    }));
  }));
  return {
    table: name => tables.get(name) ?? "unknown",
    column: (table, column) => columns.get(`${table}.${column}`) ?? "unknown",
    fn: () => "unknown",
  };
}

function summarize(migrations: MigrationReport[]): Record<MigrationStatus, number> {
  const summary: Record<MigrationStatus, number> = { ok: 0, missing: 0, partial: 0, unknown: 0, manual: 0, optional: 0 };
  for (const item of migrations) summary[item.status] += 1;
  return summary;
}

async function fetchOpenApi(url: string, key: string): Promise<OpenApi | null> {
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const spec = await response.json() as OpenApi;
    return spec && typeof spec.paths === "object" ? spec : null;
  } catch { return null; }
}

async function bucketStatus(db: SupabaseClient): Promise<ReadinessReport["bucket"]["status"]> {
  try {
    const { data, error } = await db.storage.getBucket(IMAGE_BUCKET);
    if (error) return /not.?found/i.test(error.message) ? "missing" : "unknown";
    return data?.public ? "ok" : "private";
  } catch { return "unknown"; }
}

export async function checkSchemaReadiness(db: SupabaseClient | null, env: Record<string, string | undefined> = process.env): Promise<ReadinessReport> {
  const checkedAt = new Date().toISOString();
  if (!db) {
    const unknownLookup: Lookup = { table: () => "unknown", column: () => "unknown", fn: () => "unknown" };
    const migrations = evaluateMigrations(unknownLookup, env);
    return { checkedAt, source: "none", migrations, bucket: { name: IMAGE_BUCKET, status: "unknown" }, summary: summarize(migrations), ready: false };
  }
  const url = env.SUPABASE_URL?.trim(), key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const spec = url && key ? await fetchOpenApi(url, key) : null;
  const lookup = spec ? lookupFromOpenApi(spec) : await lookupByProbing(db);
  const migrations = evaluateMigrations(lookup, env);
  const bucket = { name: IMAGE_BUCKET, status: await bucketStatus(db) };
  const summary = summarize(migrations);
  return { checkedAt, source: spec ? "openapi" : "probe", migrations, bucket, summary, ready: summary.missing === 0 && summary.partial === 0 && summary.unknown === 0 && bucket.status === "ok" };
}

/** 표·칸·함수가 없다는 오류인지 — 이것만 '마이그레이션 필요'로 보고, 그 밖의 오류(연결·권한·제약)는 실패로 다룬다 */
export function isMissingSchemaError(error: { code?: string | null } | null | undefined): boolean {
  return ["PGRST205", "42P01", "42703", "PGRST204", "PGRST202", "42883"].includes(error?.code ?? "");
}

/** 예약 작업이 돌려줄 사유 — 오류 코드도 함께 남겨 로그에서 원인을 바로 본다 */
export function schemaFailureReason(error: { code?: string | null } | null | undefined): string {
  return `${isMissingSchemaError(error) ? "migration_required" : "query_failed"}:${error?.code ?? "unknown"}`;
}
