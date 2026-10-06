import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { purgeExpiredLeads, LEAD_RETENTION_AFTER_HANDLED_DAYS, LEAD_RETENTION_UNHANDLED_DAYS } from "../lib/landing/lead-retention";

type Lead = { id: string; created_at: string; handled_at: string | null };

/* 보관 기간: 처리 완료 뒤 3개월, 처리 표시가 없으면 접수 1년 */
function fakeDb(rows: Lead[]) {
  const query = (filters: Array<(row: Lead) => boolean> = []) => ({
    select() { return this; },
    lt(column: keyof Lead, value: string) { filters.push((row) => row[column] !== null && String(row[column]) < value); return this; },
    in(_column: string, ids: string[]) { filters.push((row) => ids.includes(row.id)); return this; },
    limit() { return this; },
    delete() { deleting = true; return this; },
    then(resolve: (value: unknown) => void) {
      const hit = rows.filter((row) => filters.every((filter) => filter(row)));
      if (deleting) { for (const row of hit) rows.splice(rows.indexOf(row), 1); deleting = false; }
      resolve({ data: hit.map((row) => ({ id: row.id })), error: null });
    },
  });
  let deleting = false;
  return { from: () => query([]) } as unknown as SupabaseClient;
}

(async () => {
  const now = Date.parse("2026-10-06T00:00:00Z");
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
  const rows: Lead[] = [
    { id: "handled-old", created_at: ago(200), handled_at: ago(LEAD_RETENTION_AFTER_HANDLED_DAYS + 1) },
    { id: "handled-recent", created_at: ago(200), handled_at: ago(10) },
    { id: "open-old", created_at: ago(LEAD_RETENTION_UNHANDLED_DAYS + 1), handled_at: null },
    { id: "open-recent", created_at: ago(30), handled_at: null },
  ];
  const result = await purgeExpiredLeads(fakeDb(rows), now);
  assert.equal(result.deleted, 2);
  assert.deepEqual(rows.map((row) => row.id).sort(), ["handled-recent", "open-recent"]);
  assert.equal((await purgeExpiredLeads(null, now)).reason, "no_database");
  console.log("lead-retention: handled +3mo, unhandled +1y");
})().catch((error) => { console.error(error); process.exit(1); });
