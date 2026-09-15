import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { assertPrelaunchTarget, PRELAUNCH_REF } from "./prelaunch-db-safety";
import { prelaunchManagement } from "./prelaunch-management";

const mode = process.argv[2];
assert(["--inspect", "--apply-prelaunch-newapp"].includes(mode), "Explicit inspection or prelaunch application required");
const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
assertPrelaunchTarget(env.SUPABASE_URL ?? "", "--allow-prelaunch-newapp");
const query = prelaunchManagement();
const sql = await readFile(new URL("../supabase/migrations/0031_nicepay_reconciliation.sql", import.meta.url), "utf8");
const sha256 = createHash("sha256").update(sql).digest("hex");
const directory = new URL(`../artifacts/prelaunch-payment-migration/${new Date().toISOString().replaceAll(":", "-")}/`, import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) => writeFile(new URL(name, directory), JSON.stringify(value, null, 2), { mode: 0o600 });
const manifest = `select jsonb_build_object('orders', (select jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),''))) from public.payment_orders t), 'packs',(select jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by id),''))) from public.plan_regen_packs t)) as snapshot`;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
try {
  const history = await query("select version,name,statements from supabase_migrations.schema_migrations where version='0031'");
  if (history.length) {
    assert.deepEqual(history[0].statements, [sql], "Existing 0031 differs; manual review required");
    console.log("0031 already applied; no changes");
  } else {
    const functions = await query("select proname from pg_proc join pg_namespace on pg_namespace.oid=pronamespace where nspname='public' and proname in ('claim_nicepay_plan_order','settle_nicepay_plan_order')");
    assert.equal(functions.length, 0, "Unrecorded function definitions require review");
    const before = (await query(manifest))[0].snapshot;
    await save("before.json", { projectRef: PRELAUNCH_REF, sha256, before });
    console.log(JSON.stringify({ projectRef: PRELAUNCH_REF, sha256, before, mode, artifact: directory.pathname }));
    if (mode === "--apply-prelaunch-newapp") {
      const preservation = `do $$ declare current_snapshot jsonb; begin select snapshot into current_snapshot from (${manifest}) m; if current_snapshot is distinct from ${literal(JSON.stringify(before))}::jsonb then raise exception 'PAYMENT_DATA_CHANGED'; end if; end $$;`;
      await query(`begin; set local lock_timeout='5s'; set local statement_timeout='30s'; lock table public.payment_orders,public.plan_regen_packs in share mode; ${preservation} ${sql} ${preservation} insert into supabase_migrations.schema_migrations(version,name,statements) values('0031','nicepay_reconciliation',ARRAY[${literal(sql)}]); commit;`, false);
      const after = (await query(manifest))[0].snapshot;
      assert.deepEqual(after, before, "Existing payment data changed during verification");
      const permissions = await query("select proname,has_function_privilege('anon',p.oid,'execute') as anon,has_function_privilege('authenticated',p.oid,'execute') as authenticated,has_function_privilege('service_role',p.oid,'execute') as service_role from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('claim_nicepay_plan_order','settle_nicepay_plan_order')");
      assert.equal(permissions.length, 2);
      assert(permissions.every(row => !row.anon && !row.authenticated && row.service_role));
      const report = { projectRef: PRELAUNCH_REF, migration: "0031", sha256, existingPaymentDataPreserved: true, before, after, permissions, pgCalls: 0, applicationDeployed: false };
      await save("report.json", report); console.log(JSON.stringify(report, null, 2));
    }
  }
} catch (error) {
  await save("error.json", { message: error instanceof Error ? error.message : "Migration failed", automaticRetry: false });
  throw error;
}
