import { getServerSupabase } from "../persistence";
import type { ServiceAuditAction, ServiceAuditEntry } from "./domain";

type DemoAuditStore = ServiceAuditEntry[];

declare global {
  var __ventureAuditStore: DemoAuditStore | undefined;
}

const demoStore =
  globalThis.__ventureAuditStore ??
  (globalThis.__ventureAuditStore = []);

function mapRow(row: Record<string, unknown>): ServiceAuditEntry {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    guestTokenHash: row.guest_token_hash as string,
    action: row.action as ServiceAuditEntry["action"],
    stageIndex: (row.stage_index as number | null) ?? null,
    resourceType: (row.resource_type as string | null) ?? null,
    resourceId: (row.resource_id as string | null) ?? null,
    status: row.status as ServiceAuditEntry["status"],
    detail: row.detail as string,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at as string,
  };
}

export async function recordServiceAudit(input: {
  projectId: string;
  guestTokenHash: string;
  action: ServiceAuditAction;
  stageIndex?: number | null;
  resourceType?: string | null;
  resourceId?: string | null;
  status?: ServiceAuditEntry["status"];
  detail: string;
  metadata?: Record<string, unknown>;
}): Promise<ServiceAuditEntry> {
  const entry: ServiceAuditEntry = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    guestTokenHash: input.guestTokenHash,
    action: input.action,
    stageIndex: input.stageIndex ?? null,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    status: input.status ?? "info",
    detail: input.detail,
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString(),
  };
  const supabase = getServerSupabase();
  if (!supabase) {
    demoStore.unshift(structuredClone(entry));
    if (demoStore.length > 200) demoStore.length = 200;
    return entry;
  }
  const { data, error } = await supabase
    .from("service_audit_logs")
    .insert({
      id: entry.id,
      project_id: entry.projectId,
      guest_token_hash: entry.guestTokenHash,
      action: entry.action,
      stage_index: entry.stageIndex,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      status: entry.status,
      detail: entry.detail,
      metadata: entry.metadata,
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function listServiceAudit(
  projectId: string,
  guestTokenHash: string,
  limit = 30,
): Promise<ServiceAuditEntry[]> {
  const supabase = getServerSupabase();
  if (!supabase) {
    return demoStore
      .filter((item) => item.projectId === projectId && item.guestTokenHash === guestTokenHash)
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }
  const { data, error } = await supabase
    .from("service_audit_logs")
    .select("*")
    .eq("project_id", projectId)
    .eq("guest_token_hash", guestTokenHash)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row));
}
