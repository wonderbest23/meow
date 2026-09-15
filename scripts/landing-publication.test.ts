import assert from "node:assert/strict";
import { ensureProjectForPlan } from "../lib/plan-builder/project-bridge";
import { createLandingDraft } from "../lib/landing/domain";
import { getLandingForProject, getPublishedLandingBySlug, publishLanding, rollbackLanding, saveLandingDraft } from "../lib/landing/repository";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory"; process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const owner = "publication-owner";
  const ids = await Promise.all(Array.from({ length: 3 }, () => ensureProjectForPlan({ id: "plan-publication", title: "Publication test" }, { hash: owner, userId: null })));
  assert.equal(new Set(ids).size, 1);
  const id = ids[0];
  let draft = createLandingDraft({ title: "Publication test", oneLiner: "Local publication test", customer: "Test only", model: "Test only", sector: "서비스" });
  draft = { ...draft, slug: "publication-original", leadCaptureEnabled: false };
  let site = await saveLandingDraft(id, owner, draft, { expectedUpdatedAt: null });
  const expected = site.updatedAt;
  const first = await Promise.all([publishLanding(id, owner, expected), publishLanding(id, owner, expected)]);
  assert(first.every(item => item.versions.length === 1 && item.publishedVersion === 1));
  site = first[0];
  site = await saveLandingDraft(id, owner, { ...site.draft, slug: "publication-new", headline: "Private changed draft" }, { expectedUpdatedAt: site.updatedAt });
  assert.equal((await getPublishedLandingBySlug("publication-original"))?.config.headline, draft.headline);
  assert.equal(await getPublishedLandingBySlug("publication-new"), null);
  assert.equal(site.publishedSlug, "publication-original");
  await assert.rejects(() => publishLanding(id, owner, expected), /LANDING_DRAFT_CONFLICT/);
  site = await publishLanding(id, owner, site.updatedAt);
  assert.equal(site.versions.length, 2); assert.equal(await getPublishedLandingBySlug("publication-original"), null);
  assert.equal((await getPublishedLandingBySlug("publication-new"))?.config.headline, "Private changed draft");
  const stale = site.updatedAt;
  site = await saveLandingDraft(id, owner, { ...site.draft, headline: "Third draft" }, { expectedUpdatedAt: site.updatedAt });
  await assert.rejects(() => rollbackLanding(id, owner, 1, stale), /LANDING_DRAFT_CONFLICT/);
  site = await rollbackLanding(id, owner, 1, site.updatedAt);
  assert.equal(site.publishedSlug, "publication-original"); assert.equal(site.versions.length, 2);
  assert.equal((await getPublishedLandingBySlug("publication-original"))?.config.headline, draft.headline);
  await assert.rejects(() => publishLanding(id, "wrong-owner", site.updatedAt), /PROJECT_NOT_FOUND/);
  assert.equal((await getLandingForProject(id, owner))?.draft.headline, draft.headline);
  console.log("landing publication: single project, version CAS, duplicate publish, private draft URL, republish, rollback and owner isolation passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
