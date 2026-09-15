import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { landingDraftFromPlan, planLandingReadiness, resolvePlanLandingContent } from "../lib/landing/from-plan";
import { landingDraftSchema } from "../lib/landing/domain";
import { assertPrelaunchTarget } from "./prelaunch-db-safety";
import { prelaunchManagement } from "./prelaunch-management";

const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
assertPrelaunchTarget(env.SUPABASE_URL, process.argv[2]);
const query = prelaunchManagement();
const planId = "plan_114ab19e-c341-4723-a312-9984e1484493";
// Only this existing synthetic business is projected; no account identities or conversation text are fetched.
const scope = `from public.plan_states s cross join lateral jsonb_array_elements(s.data->'plans') p
  where p->>'id' = '${planId}' and p->>'title' = '[QA 0911] 가게 소개글 테스트'`;
const rows = await query(`select p->>'id' as id, p->>'title' as title, md5(p::text) as checksum,
  jsonb_build_object(
    'market/products', jsonb_build_object('main_offer', p#>'{answers,market/products,main_offer}', 'price_value', p#>'{answers,market/products,price_value}'),
    'market/segments', jsonb_build_object('first_target', p#>'{answers,market/segments,first_target}'),
    '__business_coach', jsonb_build_object('state', jsonb_build_object(
      'version', p#>'{answers,__business_coach,state,version}',
      'stage', p#>'{answers,__business_coach,state,stage}',
      'business', jsonb_build_object('name', p#>'{answers,__business_coach,state,business,name}', 'industry', p#>'{answers,__business_coach,state,business,industry}', 'region', p#>'{answers,__business_coach,state,business,region}'),
      'messages', '[]'::jsonb,
      'fields', (select coalesce(jsonb_agg(jsonb_build_object('key', f->'key', 'value', f->'value', 'basis', f->'basis')), '[]'::jsonb)
        from jsonb_array_elements(p#>'{answers,__business_coach,state,fields}') f where f->>'key' in ('offer', 'customer', 'price'))
    ))
  ) as answers,
  jsonb_build_object('status', p#>'{answers,__deck_job,status}', 'code', p#>'{answers,__deck_job,code}', 'reference', left(p#>>'{answers,__deck_job,token}', 8), 'hasDraft', p#>'{answers,__deck_job,draft}' is not null) as deck
  ${scope} limit 2`);
assert.equal(rows.length, 1, "Expected exactly one known synthetic QA business");
const row = rows[0];
const source = { planTitle: row.title, business: {}, answers: row.answers };
const legacyMissing = [
  !row.answers["market/products"].main_offer && "main_offer",
  !row.answers["market/segments"].first_target && "first_target",
].filter(Boolean);
assert.equal(legacyMissing.length, 2, "The live legacy-field failure must reproduce");
const readiness = planLandingReadiness(source);
assert.equal(readiness.ready, true);
const content = resolvePlanLandingContent(source);
assert(content.mainOffer && content.firstTarget && content.priceValue);
const draft = landingDraftFromPlan(source);
landingDraftSchema.parse(draft);
assert.equal(draft.offerDescription, content.mainOffer);
assert.equal(draft.priceLabel, content.priceValue);
assert(draft.pageData);
const after = await query(`select md5(p::text) as checksum ${scope} limit 2`);
assert.equal(after.length, 1);
assert.equal(after[0].checksum, row.checksum, "The QA business changed during this read-only test");
const report = {
  passed: true, planId, title: row.title, checkedAt: new Date().toISOString(),
  legacyMissing, correctedReadiness: readiness, mappedContent: content,
  draftSchemaValid: true, editablePageDataCreated: true, planUnchanged: true, deck: row.deck,
  databaseWrites: 0, paidAiCalls: 0, paymentCalls: 0, homepagePublished: false,
  remoteQueries: 2, deployed: false,
};
const output = new URL(`../artifacts/live-qa-handoff/${Date.now()}/`, import.meta.url);
await mkdir(output, { recursive: true, mode: 0o700 });
await writeFile(new URL("report.json", output), JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ output: output.pathname, ...report }, null, 2));
