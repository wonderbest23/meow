import { getServerSupabase } from "../persistence";
import type {
  OpportunityPreferenceRecord,
  OpportunityPreferenceState,
} from "./domain";
import type { RankedOpportunity } from "../opportunity-engine";
import { normalizeGeneratedOpportunity } from "../idea-generator";

type StoredPreference = OpportunityPreferenceRecord & {
  ownerId: string | null;
  guestTokenHash: string;
};

const globalPreferenceMemory = globalThis as typeof globalThis & {
  __todayStartupOpportunityPreferences?: Map<string, StoredPreference>;
};

function memoryStore() {
  if (!globalPreferenceMemory.__todayStartupOpportunityPreferences) {
    globalPreferenceMemory.__todayStartupOpportunityPreferences = new Map();
  }
  return globalPreferenceMemory.__todayStartupOpportunityPreferences;
}

function memoryKey(identityHash: string, opportunityKey: string) {
  return `${identityHash}:${opportunityKey}`;
}

function mapRow(row: Record<string, unknown>): OpportunityPreferenceRecord {
  return {
    opportunityKey: row.opportunity_key as string,
    state: row.preference as OpportunityPreferenceState,
    opportunity: normalizeGeneratedOpportunity(row.opportunity as RankedOpportunity),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listOpportunityPreferences(identityHash: string) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return [...memoryStore().values()]
      .filter((record) => record.guestTokenHash === identityHash)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ ownerId: _ownerId, guestTokenHash: _guestTokenHash, ...record }) => ({
        ...structuredClone(record),
        opportunity: normalizeGeneratedOpportunity(structuredClone(record.opportunity)),
      }));
  }

  const { data, error } = await supabase
    .from("opportunity_preferences")
    .select("opportunity_key,preference,opportunity,created_at,updated_at")
    .eq("guest_token_hash", identityHash)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function saveOpportunityPreference(input: {
  identityHash: string;
  ownerId: string | null;
  state: OpportunityPreferenceState;
  opportunity: RankedOpportunity;
}) {
  const now = new Date().toISOString();
  const supabase = getServerSupabase();
  if (!supabase) {
    const key = memoryKey(input.identityHash, input.opportunity.id);
    const existing = memoryStore().get(key);
    const record: StoredPreference = {
      opportunityKey: input.opportunity.id,
      state: input.state,
      opportunity: structuredClone(input.opportunity),
      ownerId: input.ownerId,
      guestTokenHash: input.identityHash,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    memoryStore().set(key, record);
    const { ownerId: _ownerId, guestTokenHash: _guestTokenHash, ...result } = record;
    return structuredClone(result);
  }

  const { data, error } = await supabase
    .from("opportunity_preferences")
    .upsert(
      {
        owner_id: input.ownerId,
        guest_token_hash: input.identityHash,
        opportunity_key: input.opportunity.id,
        preference: input.state,
        opportunity: input.opportunity,
      },
      { onConflict: "guest_token_hash,opportunity_key" },
    )
    .select("opportunity_key,preference,opportunity,created_at,updated_at")
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

export async function deleteOpportunityPreference(
  identityHash: string,
  opportunityKey: string,
) {
  const supabase = getServerSupabase();
  if (!supabase) {
    memoryStore().delete(memoryKey(identityHash, opportunityKey));
    return;
  }
  const { error } = await supabase
    .from("opportunity_preferences")
    .delete()
    .eq("guest_token_hash", identityHash)
    .eq("opportunity_key", opportunityKey);
  if (error) throw error;
}

export async function deleteOpportunityPreferencesByState(
  identityHash: string,
  state: OpportunityPreferenceState,
) {
  const supabase = getServerSupabase();
  if (!supabase) {
    for (const [key, preference] of memoryStore()) {
      if (preference.guestTokenHash === identityHash && preference.state === state) {
        memoryStore().delete(key);
      }
    }
    return;
  }
  const { error } = await supabase
    .from("opportunity_preferences")
    .delete()
    .eq("guest_token_hash", identityHash)
    .eq("preference", state);
  if (error) throw error;
}
