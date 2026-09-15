import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { PRELAUNCH_REF, assertPrelaunchTarget } from "./prelaunch-db-safety";
import { prelaunchManagement } from "./prelaunch-management";

const mode = process.argv[2];
assert(["--inspect", "--apply-prelaunch-newapp"].includes(mode), "Choose --inspect or explicit --apply-prelaunch-newapp");
const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
assertPrelaunchTarget(env.SUPABASE_URL ?? "", "--allow-prelaunch-newapp");
const query = prelaunchManagement();
const root = new URL(`../artifacts/prelaunch-migration/${new Date().toISOString().replaceAll(":", "-")}/`, import.meta.url);
await mkdir(root, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) => writeFile(new URL(name, root), JSON.stringify(value, null, 2), { mode: 0o600 });
const names = ["0027_plan_account_linking", "0028_account_link_retry", "0029_generation_observability", "0030_homepage_lifecycle"];
const migrations = await Promise.all(names.map(async name => {
  const sql = await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
  return { name, version: name.slice(0, 4), sql, sha256: createHash("sha256").update(sql).digest("hex") };
}));
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const snapshotQuery = `select jsonb_build_object(
  'columns', (select jsonb_agg(to_jsonb(c) order by c.table_name,c.ordinal_position) from information_schema.columns c where c.table_schema='public' and c.table_name in ('plan_states','plan_owner_claims','landing_sites','landing_versions','llm_usage')),
  'functions', (select jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('commit_plan_state','claim_plan_state','admin_generation_jobs','ensure_plan_project','publish_landing_snapshot','rollback_landing_snapshot')),
  'indexes', (select jsonb_agg(to_jsonb(i)) from pg_indexes i where schemaname='public' and tablename in ('plan_states','plan_owner_claims','landing_sites','landing_versions','llm_usage')),
  'triggers', (select jsonb_agg(to_jsonb(t)) from information_schema.triggers t where trigger_schema='public' and event_object_table in ('plan_states','plan_owner_claims','landing_sites','landing_versions','llm_usage')),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public' and tablename in ('plan_states','plan_owner_claims','landing_sites','landing_versions','llm_usage')),
  'history', (select jsonb_agg(to_jsonb(m) order by version) from supabase_migrations.schema_migrations m),
  'sites', (select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]'::jsonb) from public.landing_sites s),
  'versions', (select coalesce(jsonb_agg(to_jsonb(v) order by id),'[]'::jsonb) from public.landing_versions v),
  'plan_manifest', (select jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by owner_hash),''))) from public.plan_states t),
  'project_manifest', (select jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),''))) from public.projects t),
  'usage_manifest', (select jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg(md5((to_jsonb(t)-'model'-'elapsed_ms'-'failure_code')::text),'' order by id),''))) from public.llm_usage t),
  'duplicate_slugs', (select count(*) from (select v.config->>'slug' from public.landing_sites s join public.landing_versions v on v.site_id=s.id and v.version=s.published_version where v.config->>'slug' is not null group by v.config->>'slug' having count(*)>1) d),
  'duplicate_plan_projects', (select count(*) from (select guest_token_hash,opportunity->>'planId' from public.projects where opportunity->>'planId' is not null group by guest_token_hash,opportunity->>'planId' having count(*)>1) d)
) as snapshot`;

try {
  const before = (await query(snapshotQuery))[0].snapshot;
  await save("before.json", before);
  const applied = new Set<string>((before.history ?? []).map((row: { version: string }) => row.version));
  const pending = migrations.filter(migration => !applied.has(migration.version));
  const summary = { projectRef: PRELAUNCH_REF, pending: pending.map(({ name, sha256 }) => ({ name, sha256 })), duplicateSlugs: before.duplicate_slugs, duplicatePlanProjects: before.duplicate_plan_projects, plans: before.plan_manifest.count, projects: before.project_manifest.count, sites: before.sites.length, versions: before.versions.length, backup: root.pathname };
  await save("preflight.json", summary); console.log(JSON.stringify(summary, null, 2));
  assert.equal(before.duplicate_slugs, 0, "Duplicate published slugs need explicit review before migration");
  assert.equal(before.duplicate_plan_projects, 0, "Duplicate plan/project links need explicit review before migration");
  if (mode === "--inspect" || !pending.length) {
    console.log(mode === "--inspect" ? "Read-only preflight complete; no schema changed" : "No pending migrations; no write executed");
  } else {
    const existingFunctions = new Set((before.functions ?? []).map((fn: { name: string }) => fn.name));
    assert.equal(existingFunctions.size, 0, "Unrecorded function definitions need review before replacement");
    assert(pending.length === migrations.length, "Partial migration history needs review before applying this bundle");
    // Hold short-lived locks so duplicate checks and data-preservation checks cannot race application writes.
    const statements = pending.map(migration => `${migration.sql}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values (${literal(migration.version)},${literal(migration.name.slice(5))},ARRAY[${literal(migration.sql)}]);`).join("\n");
    const locked = "set local lock_timeout='5s'; set local statement_timeout='45s'; lock table public.landing_sites,public.landing_versions in share row exclusive mode;";
    const preconditions = `do $$ begin
      if (select count(*) from public.landing_sites) <> ${before.sites.length} or (select count(*) from public.landing_versions) <> ${before.versions.length} then raise exception 'PREFLIGHT_DATA_CHANGED'; end if;
      if exists(select 1 from public.landing_sites s join public.landing_versions v on v.site_id=s.id and v.version=s.published_version where v.config->>'slug' is not null group by v.config->>'slug' having count(*)>1) then raise exception 'DUPLICATE_PUBLISHED_SLUG'; end if;
    end $$;`;
    await save("apply-started.json", { at: new Date().toISOString(), migrations: summary.pending, transaction: true, automaticRetry: false });
    await query(`begin; ${locked} ${preconditions} ${statements} commit;`, false);
    const after = (await query(snapshotQuery))[0].snapshot;
    await save("after.json", after);
    assert.deepEqual(after.plan_manifest, before.plan_manifest, "Plan data changed during migration");
    assert.deepEqual(after.project_manifest, before.project_manifest, "Project data changed during migration");
    assert.deepEqual(after.usage_manifest, before.usage_manifest, "Existing usage data changed during migration");
    assert.deepEqual(after.versions.map(({ source_updated_at: _, ...row }: Record<string, unknown>) => row), before.versions);
    assert.equal(after.sites.length, before.sites.length);
    for (let index = 0; index < before.sites.length; index++) {
      const old = before.sites[index], current = after.sites[index];
      const { published_slug: publishedSlug, updated_at: _updated, ...same } = current;
      const { updated_at: _oldUpdated, ...oldSame } = old;
      assert.deepEqual(same, oldSame, "Existing homepage content changed");
      const version = before.versions.find((item: any) => item.site_id === old.id && item.version === old.published_version);
      assert.equal(publishedSlug, version?.config?.slug ?? null);
    }
    for (const migration of pending) assert(after.history.some((row: { version: string }) => row.version === migration.version));
    const report = { applied: pending.map(item => item.name), existingPlansPreserved: true, existingProjectsPreserved: true, existingHomepageContentsPreserved: true, existingVersionsPreserved: true, existingUsagePreserved: true, homepageMetadataBackfill: true, completedAt: new Date().toISOString() };
    await save("report.json", report); console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Migration verification failed";
  await save("error.json", { message, automaticRetry: false, inspectHistoryBeforeRetry: true });
  console.error(message.slice(0, 1600)); process.exitCode = 1;
}
