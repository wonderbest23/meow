import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const LAB = "/private/tmp/oneul-account-lab-20260912";
const PROJECT = "oneul-account-lab-20260912";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(REPO, "supabase/migrations/0036_intake_account_claim.sql");
const SIGNATURE = "public.claim_plan_state(text,text,timestamptz,timestamptz,jsonb,text,text)";
const AT = "2026-09-16T00:00:00.000Z";
const exec = promisify(execFile);
const childEnv = { PATH: process.env.PATH, HOME: process.env.HOME };
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const json = (value: unknown) => `${literal(JSON.stringify(value))}::jsonb`;
const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = () => { fetchCalls++; throw new Error("This test uses only the verified local PostgreSQL container"); };

async function main() {
  assert.ok(process.argv.slice(2).every(argument => argument === "--apply-migration"), "Only --apply-migration is supported");
  assert.equal(await realpath(LAB), LAB, "Refuse a redirected lab directory");
  assert.equal(await readFile(join(LAB, "lab-marker"), "utf8"), "oneul-local-account-lab-v1");
  await assert.rejects(access(join(LAB, "supabase/.temp/project-ref")), { code: "ENOENT" }, "Refuse a cloud-linked lab");
  const { stdout: context } = await exec("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { env: childEnv });
  const dockerHost = context.trim();
  assert.ok(/^unix:\/\/\//.test(dockerHost), "Docker must use a local Unix socket, never TCP or SSH");
  async function container(name: string, internalPort: string, approvedPort: string) {
    const { stdout } = await exec("docker", ["--host", dockerHost, "inspect", "--format",
      '{{json .Id}} {{json .Name}} {{json .State.Running}} {{json .NetworkSettings.Ports}}', name], { env: childEnv });
    const match = stdout.trim().match(/^("[a-f0-9]+") ("[^\"]+") (true|false) (\{.*\})$/);
    assert.ok(match, "Unexpected local container metadata");
    const id: string = JSON.parse(match[1]);
    assert.equal(JSON.parse(match[2]), `/${name}`);
    assert.equal(match[3], "true", "The existing lab must already be running");
    const ports: Record<string, Array<{ HostPort: string }> | null> = JSON.parse(match[4]);
    assert.ok(ports[internalPort]?.length);
    assert.ok(Object.entries(ports).every(([key, bindings]) => !bindings?.length || key === internalPort && bindings.every(binding => binding.HostPort === approvedPort)), "Unexpected published lab port");
    return id;
  }
  const database = await container(`supabase_db_${PROJECT}`, "5432/tcp", "55432");
  await container(`supabase_kong_${PROJECT}`, "8000/tcp", "55431");

  // Pin the verified container ID; local socket authentication needs no credentials or env files.
  async function sql(source: string): Promise<string> {
    return new Promise((resolveResult, reject) => {
      const child = spawn("docker", ["--host", dockerHost, "exec", "--user", "postgres", "-i", database,
        "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], { env: childEnv, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      const timer = setTimeout(() => { child.kill(); reject(new Error("Isolated PostgreSQL test timed out")); }, 60_000);
      child.stdout.on("data", chunk => { stdout += String(chunk); });
      child.stderr.on("data", chunk => { stderr += String(chunk); });
      child.once("error", () => { clearTimeout(timer); reject(new Error("Unable to execute the verified local PostgreSQL client")); });
      child.once("close", code => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error(`Local PostgreSQL failed: ${stderr.match(/ERROR:\s*([^\n]+)/)?.[1] ?? "client error"}`));
        else resolveResult(stdout.trim());
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(`set statement_timeout = '20s'; set lock_timeout = '5s';\n${source}\n`);
    });
  }
  async function metadata() {
    return JSON.parse(await sql(`select json_build_object(
      'versions', (select json_agg(version order by version) from supabase_migrations.schema_migrations),
      'claimSource', (select prosrc from pg_proc where oid = ${literal(SIGNATURE)}::regprocedure),
      'commitDefinition', pg_get_functiondef('public.commit_plan_state(text,timestamptz,jsonb,text,text,boolean)'::regprocedure),
      'artifactTrigger', exists(select 1 from pg_trigger where tgname = 'artifact_owner_transfer' and not tgisinternal)
    );`)) as { versions: string[]; claimSource: string; commitDefinition: string; artifactTrigger: boolean };
  }
  const before = await metadata();
  for (const prerequisite of ["0019", "0027", "0028", "0032"]) assert.ok(before.versions.includes(prerequisite), `Missing existing lab prerequisite ${prerequisite}`);
  assert.equal(before.artifactTrigger, true, "Existing artifact ownership guard must be present");
  const migration = await readFile(MIGRATION, "utf8");
  const expectedBody = migration.match(/as \$\$([\s\S]*?)\$\$;/)?.[1].trim();
  assert.ok(expectedBody?.includes("__business_intake"), "0036 must contain the intake claim guard");
  let migrationApplied = false;
  if (!before.versions.includes("0036")) {
    assert.ok(process.argv.includes("--apply-migration"), "Migration 0036 is absent; rerun with --apply-migration for this isolated lab only");
    await sql(`begin;
      ${migration}
      insert into supabase_migrations.schema_migrations(version, name, statements)
      values ('0036', 'intake_account_claim', array[${literal(migration)}]);
      commit;`);
    migrationApplied = true;
  }
  const installed = await metadata();
  assert.deepEqual(installed.versions, [...new Set([...before.versions, "0036"])].sort(), "Do not apply any other pending migration");
  assert.equal(installed.claimSource.trim(), expectedBody, "Installed 0036 differs from the repo migration");
  assert.equal(installed.commitDefinition, before.commitDefinition, "Existing writer protection must not change");
  assert.equal(installed.artifactTrigger, true);

  const run = randomUUID();
  const owners: string[] = [];
  const owner = (name: string) => {
    const value = createHash("sha256").update(`intake-claim-test:${run}:${name}`).digest("hex");
    owners.push(value); return value;
  };
  const fixture = (id: string, status: string | null = "complete", kind = "extract") => ({
    business: { name: "Isolated intake fixture", description: "No real account", industry: "software", role: "", region: "", stage: "운영 중" },
    activePlanId: id,
    plans: [{ id, title: "Isolated intake fixture", planType: "사업 운영·개선 계획서", createdAt: AT, updatedAt: AT,
      sections: { summary: { markdown: "User-edited body", html: "<p>User-edited body</p>", generatedAt: AT, edited: true, locked: true } },
      answers: {
        __business_coach: { state: { version: "fixture", revision: 8, documentRevision: 4, stage: "operating", ready: true,
          fields: [{ key: "business", value: "Original idea", basis: "user", messageId: "source", quote: "Original idea" }],
          messages: [{ id: "source", role: "user", text: "Original idea", at: AT }], ideaOrigin: { text: "Original idea", messageId: "source" } } },
        __business_intake: { state: { version: 1, packVersion: "2026-09-16.1", mode: "operating", sector: "software", detailsRequested: true,
          answers: { business: { status: "answered", value: "Original idea", messageId: "source", at: AT, quote: "Original idea" },
            sales: { status: "answered", value: 0, messageId: "zero", at: AT, quote: "0원" },
            cost: { status: "unknown", value: null, messageId: "unknown", at: AT, quote: "" },
            "food_beverage.peakOrders": { status: "answered", value: 3, messageId: "audit", at: AT, quote: "3건" } },
          notes: [{ id: "note", text: "customer: Confirm me", at: AT, status: "review" }, { id: "stored", text: "Original unparsed note", at: AT, status: "stored" }],
          candidates: [{ id: "candidate", fieldKey: "customer", value: "Confirm me", quote: "customer: Confirm me", noteId: "note", baseValue: null, status: "pending" }],
          job: status === null ? null : { id: "job", runId: "run-job", kind, status, noteIds: ["note"], baseValues: { customer: "Before" }, baseDocumentRevision: 4, updatedAt: AT },
          receipts: [{ id: "receipt", signature: "fixture-signature" }], legacyImported: true } },
        "intake/period": { value: "2026-09-01 / 2026-09-15", basis: "user", messageId: "period" },
        "intake/details": { "software.supportMinutes": { value: 0, unit: "분", period: "고객 1곳 최초 설정", messageId: "detail", quote: "0분" } },
        __intake_legacy_job: { token: "legacy-fixture", status: "failed", draft: { retained: true } },
      },
    }],
  });
  type State = ReturnType<typeof fixture>;
  const seed = (hash: string, state: State) => `insert into public.plan_states(owner_hash,title,plan_type,data,updated_at) values (${literal(hash)},'fixture','fixture',${json(state)},${literal(AT)});`;
  const rowAt = (hash: string) => `(select updated_at from public.plan_states where owner_hash=${literal(hash)})`;
  const rowData = (hash: string) => `(select data from public.plan_states where owner_hash=${literal(hash)})`;
  const claim = (guest: string, account: string, state: State, guestAt = rowAt(guest), accountAt = rowAt(account)) => `public.claim_plan_state(${literal(guest)},${literal(account)},${guestAt},${accountAt},${json(state)},'fixture','fixture')`;
  const record = (name: string, condition: string) => `select pg_temp.record_check(${literal(name)},${condition});`;
  const service = (source: string) => `set local role service_role;\n${source}\nreset role;`;
  const unchanged = (name: string, hash: string, state: State) => record(name, `${rowData(hash)} = ${json(state)} and ${rowAt(hash)} = ${literal(AT)}::timestamptz`);
  const noLedger = (name: string, guest: string) => record(name, `not exists(select 1 from public.plan_owner_claims where guest_hash=${literal(guest)})`);
  const statements: string[] = [
    `begin;
     create temporary table intake_account_checks(name text, passed boolean not null);
     create function pg_temp.record_check(p_name text, p_passed boolean) returns void
     language sql security definer set search_path = pg_temp as $$
       insert into intake_account_checks values(p_name,coalesce(p_passed,false));
     $$;
     grant execute on function pg_temp.record_check(text,boolean) to service_role,anon,authenticated;`,
    record("claim RPC remains SECURITY DEFINER with fixed search_path", `(select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid=${literal(SIGNATURE)}::regprocedure)`),
    record("service role retains claim permission", `has_function_privilege('service_role',${literal(SIGNATURE)},'EXECUTE')`),
    record("PUBLIC has no claim RPC grant", `not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=${literal(SIGNATURE)}::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')`),
  ];
  for (const table of ["plan_states", "plan_owner_claims", "plan_artifact_updates"]) statements.push(record(`${table} RLS remains enabled`, `(select relrowsecurity from pg_class where oid=${literal(`public.${table}`)}::regclass)`));

  for (const kind of ["extract", "help", "design"]) for (const status of ["queued", "running"]) {
    const label = `${kind}/${status}`, guest = owner(`${label}:guest`), account = owner(`${label}:account`);
    const source = fixture(`source-${kind}-${status}`, status, kind), destination = fixture(`account-${kind}-${status}`, null);
    const merged = { ...source, plans: [...destination.plans, ...source.plans] };
    statements.push(seed(guest, source), seed(account, destination), service(record(`${label} intake job blocks claim`, `${claim(guest, account, merged)} = 'busy'`)),
      unchanged(`${label} source intact`, guest, source), unchanged(`${label} destination intact`, account, destination), noLedger(`${label} not consumed`, guest));
  }

  for (const status of ["complete", "failed", null]) {
    const label = status ?? "no-job", guest = owner(`${label}:guest`), account = owner(`${label}:account`), other = owner(`${label}:other`);
    const source = fixture(`source-${label}`, status), destination = fixture(`account-${label}`, null);
    const merged = { ...source, plans: [...destination.plans, ...source.plans] };
    statements.push(seed(guest, source), seed(account, destination), service(record(`${label} intake may transfer`, `${claim(guest, account, merged)} = 'claimed'`)),
      record(`${label} complete merged JSON survives`, `${rowData(account)} = ${json(merged)}`),
      record(`${label} full answers notes candidates and audit survive`, `${rowData(account)}#>'{plans,1,answers}' = ${json(source.plans[0].answers)}`),
      record(`${label} zero and unknown stay distinct`, `${rowData(account)}#>'{plans,1,answers,__business_intake,state,answers,sales,value}' = '0'::jsonb and ${rowData(account)}#>'{plans,1,answers,__business_intake,state,answers,cost,value}' = 'null'::jsonb`),
      record(`${label} guest row removed`, `not exists(select 1 from public.plan_states where owner_hash=${literal(guest)})`),
      record(`${label} destination timestamp advances`, `${rowAt(account)} > ${literal(AT)}::timestamptz`),
      record(`${label} ownership ledger correct`, `(select account_hash from public.plan_owner_claims where guest_hash=${literal(guest)})=${literal(account)}`),
      service(record(`${label} response retry is idempotent`, `${claim(guest, account, source, `${literal(AT)}::timestamptz`, `${literal(AT)}::timestamptz`)}='claimed'`)),
      record(`${label} retry does not replace merged state`, `${rowData(account)}=${json(merged)}`),
      service(record(`${label} second account cannot consume source`, `${claim(guest, other, source)}='consumed'`)),
      record(`${label} second account receives nothing`, `not exists(select 1 from public.plan_states where owner_hash=${literal(other)})`),
      service(record(`${label} stale guest writer is fenced`, `public.commit_plan_state(${literal(guest)},null,${json(source)},'stale','stale',false)='transferred'`)),
      record(`${label} stale write cannot recreate guest`, `not exists(select 1 from public.plan_states where owner_hash=${literal(guest)})`));
  }

  const casGuest = owner("cas:guest"), casAccount = owner("cas:account"), casSource = fixture("cas-source"), casDestination = fixture("cas-account");
  statements.push(seed(casGuest, casSource), seed(casAccount, casDestination),
    service(record("stale guest timestamp rejects claim", `${claim(casGuest, casAccount, casSource, "'2026-09-15'::timestamptz")}='conflict'`)),
    service(record("stale account timestamp rejects claim", `${claim(casGuest, casAccount, casSource, rowAt(casGuest), "'2026-09-15'::timestamptz")}='conflict'`)),
    unchanged("CAS source intact", casGuest, casSource), unchanged("CAS destination intact", casAccount, casDestination), noLedger("CAS source not consumed", casGuest));

  for (const key of ["__coach_job", "__deck_job"]) for (const status of ["queued", "running"]) {
    const guest = owner(`${key}:${status}:guest`), account = owner(`${key}:${status}:account`), source = fixture(`legacy-${key}-${status}`);
    const answers: Record<string, unknown> = source.plans[0].answers;
    answers[key] = { status };
    statements.push(seed(guest, source), service(record(`${key}/${status} existing guard preserved`, `${claim(guest, account, source)}='busy'`)), unchanged(`${key}/${status} source intact`, guest, source), noLedger(`${key}/${status} not consumed`, guest));
  }

  for (const role of ["anon", "authenticated"]) {
    const unauthorized = owner(`${role}:unauthorized`);
    statements.push(record(`${role} lacks RPC permission`, `not has_function_privilege(${literal(role)},${literal(SIGNATURE)},'EXECUTE')`), `set local role ${role};
      do $permissions$ declare visible integer; begin
        begin
          perform ${claim(casGuest, casAccount, casSource, "null", "null")};
          perform pg_temp.record_check('${role} RPC execution denied',false);
        exception when insufficient_privilege then perform pg_temp.record_check('${role} RPC execution denied',true); end;
        begin
          select count(*) into visible from public.plan_states where owner_hash=${literal(casGuest)};
          perform pg_temp.record_check('${role} cannot read guest state',visible=0);
        exception when insufficient_privilege then perform pg_temp.record_check('${role} cannot read guest state',true); end;
        begin
          select count(*) into visible from public.plan_owner_claims;
          perform pg_temp.record_check('${role} cannot read claim ledger',visible=0);
        exception when insufficient_privilege then perform pg_temp.record_check('${role} cannot read claim ledger',true); end;
        begin
          insert into public.plan_states(owner_hash,data) values(${literal(unauthorized)},'{}');
          perform pg_temp.record_check('${role} cannot forge plan state',false);
        exception when insufficient_privilege then perform pg_temp.record_check('${role} cannot forge plan state',true); end;
        begin
          insert into public.plan_owner_claims(guest_hash,account_hash) values(${literal(unauthorized)},${literal(casAccount)});
          perform pg_temp.record_check('${role} cannot forge ownership',false);
        exception when insufficient_privilege then perform pg_temp.record_check('${role} cannot forge ownership',true); end;
      end $permissions$;
      reset role;`);
  }

  const artifactGuest = owner("artifact:guest"), artifactAccount = owner("artifact:account"), artifactId = randomUUID();
  const artifactSource = fixture("artifact-source"), artifactDestination = fixture("artifact-account");
  const artifactMerged = { ...artifactSource, plans: [...artifactDestination.plans, ...artifactSource.plans] };
  statements.push(seed(artifactGuest, artifactSource), seed(artifactAccount, artifactDestination),
    `insert into public.plan_artifact_updates(id,owner_hash,plan_id,revision,status,data) values(${literal(artifactId)},${literal(artifactGuest)},'artifact-source',1,'ready',${json({ id: artifactId, ownerHash: artifactGuest, planId: "artifact-source", revision: 1, status: "ready" })});`,
    `set local role service_role;
     do $artifact$ begin
       begin
         perform ${claim(artifactGuest, artifactAccount, artifactMerged)};
         perform pg_temp.record_check('existing active artifact guard still blocks claim',false);
       exception when raise_exception then
         if sqlerrm <> 'PLAN_CLAIM_BUSY' then raise; end if;
         perform pg_temp.record_check('existing active artifact guard still blocks claim',true);
       end;
     end $artifact$;
     reset role;`,
    unchanged("late artifact trigger rolls back source deletion", artifactGuest, artifactSource),
    unchanged("late artifact trigger rolls back destination write", artifactAccount, artifactDestination),
    noLedger("late artifact trigger leaves no claim ledger", artifactGuest),
    `update public.plan_artifact_updates set status='applied', data=jsonb_set(data,'{status}','"applied"') where id=${literal(artifactId)};`,
    service(record("completed artifact and intake may transfer together", `${claim(artifactGuest, artifactAccount, artifactMerged)}='claimed'`)),
    record("existing artifact ownership migration preserved", `(select owner_hash=${literal(artifactAccount)} and data->>'ownerHash'=${literal(artifactAccount)} from public.plan_artifact_updates where id=${literal(artifactId)})`),
    record("artifact transfer retains full intake JSON", `${rowData(artifactAccount)}=${json(artifactMerged)}`),
    `select json_build_object('checks',(select json_agg(json_build_object('name',name,'passed',passed) order by name) from intake_account_checks));
     rollback;`);

  const output = await sql(statements.join("\n"));
  const report = JSON.parse(output.split("\n").findLast(line => line.startsWith("{")) ?? "null") as { checks: Array<{ name: string; passed: boolean }> };
  assert.ok(report?.checks.length);
  const ownerList = [...new Set(owners)].map(literal).join(",");
  const remaining = JSON.parse(await sql(`select json_build_object(
    'states',(select count(*) from public.plan_states where owner_hash in (${ownerList})),
    'claims',(select count(*) from public.plan_owner_claims where guest_hash in (${ownerList}) or account_hash in (${ownerList})),
    'artifacts',(select count(*) from public.plan_artifact_updates where id=${literal(artifactId)})
  );`));
  assert.deepEqual(remaining, { states: 0, claims: 0, artifacts: 0 }, "All fixture writes must roll back");
  assert.equal(fetchCalls, 0);
  const failed = report.checks.filter(check => !check.passed).map(check => check.name);
  console.log(JSON.stringify({ suite: "business-intake-account", lab: PROJECT, approvedPorts: [55431, 55432], migration: "0036", migrationApplied,
    passed: report.checks.length - failed.length, failed: failed.length, failures: failed, fixturesRolledBack: true, fetchCalls,
    scope: "Real local PostgreSQL RPC and RLS; no app HTTP, external services, credentials or env files" }, null, 2));
  if (failed.length) process.exitCode = 1;
}

try { await main(); }
catch (error) { console.error(error instanceof Error ? error.message : "Isolated intake account test failed"); process.exitCode = 1; }
finally { globalThis.fetch = originalFetch; }
