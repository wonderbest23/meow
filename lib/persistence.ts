import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type PersistenceMode = "supabase" | "demo-memory";

const expectedTables = [
  "projects",
  "project_stages",
  "stage_artifacts",
  "generation_jobs",
  "revision_requests",
  "landing_sites",
  "landing_versions",
  "landing_leads",
  "landing_events",
  "legal_source_snapshots",
  "payment_orders",
  "payment_events",
  "service_audit_logs",
  "support_conversations",
  "support_messages",
  "platform_legal_settings",
  "account_consents",
] as const;

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

export async function checkPersistenceHealth() {
  try {
    const supabase = getServerSupabase();
    if (!supabase) {
      return {
        status: "degraded" as const,
        mode: "demo-memory" as const,
        durable: false,
        checkedTables: 0,
        missingTables: [...expectedTables],
        message: "Demo memory is active. Data will be lost when the server process stops.",
      };
    }

    const checks = await Promise.all(
      expectedTables.map(async (table) => {
        const { error } = await supabase.from(table).select("*").limit(1);
        return { table, error };
      }),
    );
    const missingTables = checks.filter((check) => check.error).map((check) => check.table);

    return {
      status: missingTables.length ? ("degraded" as const) : ("ready" as const),
      mode: "supabase" as const,
      durable: missingTables.length === 0,
      checkedTables: expectedTables.length,
      missingTables,
      message: missingTables.length
        ? "Supabase is reachable, but one or more migrations are missing."
        : "Supabase is reachable and the persistence schema is ready.",
    };
  } catch (error) {
    return {
      status: "misconfigured" as const,
      mode: "unknown" as const,
      durable: false,
      checkedTables: 0,
      missingTables: [...expectedTables],
      message: error instanceof Error ? error.message : "Persistence configuration is invalid.",
    };
  }
}
