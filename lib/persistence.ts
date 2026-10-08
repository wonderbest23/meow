import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkSchemaReadiness } from "./schema-readiness";

export type PersistenceMode = "supabase" | "demo-memory";

let cachedClient: SupabaseClient | null | undefined;

function configuration() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const requestedMode = process.env.PERSISTENCE_MODE?.trim();

  if (requestedMode && requestedMode !== "supabase" && requestedMode !== "demo-memory") {
    throw new Error("PERSISTENCE_MODE must be either supabase or demo-memory.");
  }
  if (Boolean(url) !== Boolean(key)) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together.");
  }
  if (requestedMode === "supabase" && (!url || !key)) {
    throw new Error("Supabase persistence was requested, but its server credentials are missing.");
  }
  if (process.env.NODE_ENV === "production" && (!url || !key || requestedMode === "demo-memory")) {
    throw new Error("Production requires Supabase persistence. Demo memory is not durable.");
  }

  return {
    mode: requestedMode === "demo-memory" || !url || !key ? "demo-memory" : "supabase",
    url,
    key,
  } satisfies { mode: PersistenceMode; url?: string; key?: string };
}

export function serverPersistenceMode(): PersistenceMode {
  return configuration().mode;
}

export function getServerSupabase(): SupabaseClient | null {
  const config = configuration();
  if (config.mode === "demo-memory") return null;
  if (cachedClient !== undefined) return cachedClient;

  cachedClient = createClient(config.url!, config.key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

/*
 * 공개 점검 — 마이그레이션 파일마다 확인한 결과(lib/schema-readiness.ts)를 숫자로만 알린다.
 * 예전엔 처음 만든 테이블 19개만 봐서 상담 저장(0024)이 운영 DB에 없어도 'ready'였다.
 * 무엇이 빠졌는지는 관리자 화면(DB 준비 상태)에서만 보인다. 1분 동안은 같은 답을 쓴다(공개 주소라 DB를 아낀다).
 */
type PersistenceHealth = { status: "ready" | "degraded" | "misconfigured"; mode: "supabase" | "demo-memory" | "unknown"; durable: boolean; checkedMigrations: number; missingMigrations: number; uncheckedMigrations: number; message: string };
let cachedHealth: { at: number; value: PersistenceHealth } | null = null;

export async function checkPersistenceHealth(): Promise<PersistenceHealth> {
  try {
    const supabase = getServerSupabase();
    if (!supabase) {
      return { status: "degraded", mode: "demo-memory", durable: false, checkedMigrations: 0, missingMigrations: 0, uncheckedMigrations: 0, message: "Demo memory is active. Data will be lost when the server process stops." };
    }
    if (cachedHealth && Date.now() - cachedHealth.at < 60_000) return cachedHealth.value;
    const report = await checkSchemaReadiness(supabase);
    const missing = report.summary.missing + report.summary.partial;
    const value: PersistenceHealth = {
      status: report.ready ? "ready" : "degraded",
      mode: "supabase",
      durable: missing === 0,
      checkedMigrations: report.migrations.length,
      missingMigrations: missing,
      uncheckedMigrations: report.summary.unknown,
      message: report.ready
        ? "Supabase is reachable and every migration the app uses is applied."
        : "Supabase is reachable, but some migrations are missing or could not be checked. See /admin/schema.",
    };
    cachedHealth = { at: Date.now(), value };
    return value;
  } catch (error) {
    return { status: "misconfigured", mode: "unknown", durable: false, checkedMigrations: 0, missingMigrations: 0, uncheckedMigrations: 0, message: error instanceof Error ? error.message : "Persistence configuration is invalid." };
  }
}
