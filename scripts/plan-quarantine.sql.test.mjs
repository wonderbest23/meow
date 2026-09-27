import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const database=process.env.QUARANTINE_TEST_DB;
assert.match(database??'',/^oneul_quarantine_test_[0-9a-z_]+$/);
const sql=(input,role)=>{
  const result=spawnSync('docker',['exec','-i','oneul-ledger-db-Gobauz','psql','-X','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1'],{input:(role?`set role ${role};\n`:'')+input,encoding:'utf8',timeout:15000});
  return {code:result.status,out:result.stdout.trim(),error:result.stderr.trim()};
};
const ok=input=>{const r=sql(input);assert.equal(r.code,0,r.error);return r.out;};
const results=[];
const check=(name,fn)=>{try{fn();results.push({name,status:'passed'});}catch(e){results.push({name,status:'failed',error:e.message});}};
if(process.argv.includes('--prepare')){
  assert.equal(ok('select current_database()'),database);
  assert.equal(ok("select count(*) from pg_tables where schemaname='public'"),'0','New dedicated DB must be empty');
  ok(`create table public.plan_states(owner_hash text primary key,title text,plan_type text,data jsonb not null,updated_at timestamptz not null default now());
      create table public.projects(id text primary key,guest_token_hash text,owner_id text,opportunity jsonb,metadata jsonb);
      create table public.project_stages(id text primary key,project_id text);
      create table public.landing_sites(id text primary key,project_id text,draft jsonb);
      create table public.landing_versions(id text primary key,site_id text,config jsonb);
      grant all on all tables in schema public to service_role;`);
  for(const file of ['0027_plan_account_linking.sql','0036_intake_account_claim.sql','20260922113638_plan_legacy_quarantine.sql']) ok(fs.readFileSync(path.join('supabase/migrations',file),'utf8'));
  ok(`insert into public.plan_states(owner_hash,data) values
   ('fixture-a','{"business":{"name":"unresolved context"},"plans":[{"id":"fixture-held","title":"do not expose","opaque":{"keep":true},"answers":{}},{"id":"fixture-safe","title":"safe","answers":{}}],"activePlanId":"fixture-held"}'),
   ('fixture-b','{"business":{},"plans":[{"id":"fixture-held","title":"different original","answers":{}}]}');
   insert into public.projects values('fixture-project','fixture-a',null,'{"planId":"fixture-held"}','{}');
   insert into public.project_stages values('fixture-stage','fixture-project');
   insert into public.landing_sites values('fixture-site','fixture-project','{}');
   insert into public.landing_versions values('fixture-version','fixture-site','{}');
   insert into oneul_quarantine.cases(plan_id,case_ref,batch) values('fixture-held','Q001','SYNTHETIC');
   insert into oneul_quarantine.snapshots(batch,owner_hash,original_row) select 'SYNTHETIC',owner_hash,to_jsonb(s) from public.plan_states s;
   insert into oneul_quarantine.copies select 'fixture-held',owner_hash,p,md5(p::text) from public.plan_states,jsonb_array_elements(data->'plans') p where p->>'id'='fixture-held';
   insert into oneul_quarantine.projects select id,'fixture-held',to_jsonb(p) from public.projects p;
   update oneul_quarantine.cases set active=true;`);
}
check('filtered read omits protected plan and root context',()=>{
 const r=sql("select data from public.plan_states_accessible where owner_hash='fixture-a'",'service_role');assert.equal(r.code,0,r.error);const data=JSON.parse(r.out.split('\n').at(-1));assert.deepEqual(data.plans.map(p=>p.id),['fixture-safe']);assert.deepEqual(data.business,{});assert.equal(data.activePlanId,null);
});
check('metadata is service-only, owner-bound and has no content',()=>{
 const r=sql("select public.plan_quarantine_status('fixture-a')",'service_role');assert.equal(r.code,0,r.error);const q=JSON.parse(r.out.split('\n').at(-1));assert.deepEqual(q.blockedPlanIds,['fixture-held']);assert.equal(q.profileBlocked,true);assert(!JSON.stringify(q).includes('do not expose'));
});
for(const role of ['anon','authenticated'])for(const [kind,query] of [['view','select * from public.plan_states_accessible'],['rpc',"select public.plan_quarantine_status('fixture-a')"],['backup','select * from oneul_quarantine.snapshots']])check(role+' denied '+kind,()=>{const r=sql(query,role);assert.notEqual(r.code,0);assert.match(r.error,/permission denied/);});
check('safe CAS save retains hidden original and original business',()=>{
 ok(`select public.commit_plan_state(owner_hash,updated_at,jsonb_set(data,'{plans,0,title}','"safe updated"'),'safe','test') from public.plan_states_accessible where owner_hash='fixture-a';`);
 assert.equal(ok("select bool_and(p=cp.original_plan) from public.plan_states s cross join lateral jsonb_array_elements(data->'plans') p join oneul_quarantine.copies cp on cp.owner_hash=s.owner_hash and cp.plan_id=p->>'id'"),'t');
 assert.equal(ok("select data#>>'{business,name}' from public.plan_states where owner_hash='fixture-a'"),'unresolved context');
});
for(const [name,query] of [
 ['direct mutation',"update public.plan_states set data=jsonb_set(data,'{plans,0,title}','\"changed\"') where owner_hash='fixture-a'"],
 ['direct owner delete',"delete from public.plan_states where owner_hash='fixture-a'"],
 ['foreign same-id copy',`insert into public.plan_states(owner_hash,data) values('fixture-c','{"plans":[{"id":"fixture-held"}]}')`],
 ['project edit',"update public.projects set metadata='{}' where id='fixture-project'"],
 ['derived draft edit',"update public.landing_sites set draft='{}' where id='fixture-site'"],
 ['derived version edit',"update public.landing_versions set config='{}' where id='fixture-version'"],
 ['claim record',"insert into public.plan_owner_claims(guest_hash,account_hash) values('fixture-a','fixture-c')"],
 ])check(name+' blocked',()=>{const r=sql(query);assert.notEqual(r.code,0);assert.match(r.error,/PLAN_QUARANTINED/);});
check('whole account claim transaction rolls back',()=>{
 const before=ok("select md5(string_agg(data::text,'|' order by owner_hash)) from public.plan_states");
 const r=sql("select public.claim_plan_state('fixture-a','fixture-c',updated_at,null,data,'x','x') from public.plan_states where owner_hash='fixture-a'");assert.notEqual(r.code,0);assert.match(r.error,/PLAN_QUARANTINED/);assert.equal(ok("select md5(string_agg(data::text,'|' order by owner_hash)) from public.plan_states"),before);
});
check('safe records can still be created and read',()=>{ok(`insert into public.plan_states(owner_hash,data) values('fixture-new','{"plans":[{"id":"fixture-new-safe"}],"business":{}}') on conflict(owner_hash) do nothing`);assert.equal(ok("select data#>>'{plans,0,id}' from public.plan_states_accessible where owner_hash='fixture-new'"),'fixture-new-safe');});
check('protected project hidden from account/public lookup',()=>assert.equal(ok('select count(*) from public.projects_accessible'),'0'));
check('independent process still sees original backups and active scope',()=>{assert.equal(ok('select count(*) from oneul_quarantine.snapshots'),'2');assert.equal(ok('select bool_and(active) from oneul_quarantine.cases'),'t');});
check('case release is reversible without deleting data or changing ownership',()=>{
 ok("update oneul_quarantine.cases set active=false,released_at=now(),release_evidence='synthetic release test' where plan_id='fixture-held'");
 try {assert.equal(ok("select jsonb_array_length(data->'plans') from public.plan_states_accessible where owner_hash='fixture-a'"),'2');}finally{ok("update oneul_quarantine.cases set active=true,released_at=null,release_evidence=null where plan_id='fixture-held'");}
});
console.log(JSON.stringify({database,results},null,2));
if(results.some(r=>r.status==='failed'))process.exitCode=1;
