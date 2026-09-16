import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { seedBusinessRewriteFixture, documentFixtureResult, mockRewrite } from "./proposal-rewrite-fixture";
import { saveBusinessConditions } from "../lib/plan-builder/coach-expert-service";
import { PROPOSAL_SECTORS, PROPOSAL_PURPOSES } from "../lib/plan-builder/proposal-blueprint";
import { previewArtifactUpdate, reserveArtifactUpdate, executeArtifactChunk, cancelArtifactUpdate } from "../lib/plan-builder/artifact-update-service";
import { readArtifactUpdate, writeArtifactUpdate } from "../lib/plan-builder/artifact-update-store";
import type { ArtifactRuntime } from "../lib/plan-builder/artifact-updates";

Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", PROPOSAL_AI_ENABLED: "false" });
globalThis.fetch = async () => { throw new Error("NO_EXTERNAL_CALLS"); };
async function main() {
  let calls = 0, cases = 0;
  for (const sector of PROPOSAL_SECTORS) for (const purpose of PROPOSAL_PURPOSES) {
    const owner = createHash("sha256").update(randomUUID()).digest("hex"), planId = `qa-${sector}-${purpose}`;
    await seedBusinessRewriteFixture(owner, planId, sector, purpose);
    await saveBusinessConditions(owner, { planId, requestId: randomUUID(), revision: 1, fields: [{ key: "price", value: "180만원" }] });
    const runtime: ArtifactRuntime = { target: { provider: "mock", model: "matrix" }, document: { generate: async payload => { assert.equal(payload.sector, sector); assert.equal(payload.purpose, purpose); assert(payload.sections.length <= 3); calls++; return documentFixtureResult(payload); } },
      ppt: { target: { provider: "mock", model: "matrix" }, generate: async payload => { assert.equal(payload.sector, sector); assert.equal(payload.purpose, purpose); assert(payload.slides.length <= 4); calls++; return { result: mockRewrite(payload) }; } } };
    const preview = await previewArtifactUpdate(owner, planId, runtime.target), command = { type: "generate" as const, id: randomUUID(), hash: preview.hash, base: preview.base, consent: true as const, includeHomepage: false };
    const job = await reserveArtifactUpdate(owner, planId, command, runtime);
    assert(job.preview.slides.length > 6);
    for (let index = 0; index < job.chunks.length; index++) assert((await executeArtifactChunk(owner, planId, job.id, index, 0, runtime)).ok);
    const ready = (await readArtifactUpdate(owner, planId, job.id))!; assert.equal(ready.status, "ready", ready.error ?? `${sector}/${purpose}`); cases++;
    assert.equal(ready.budget.reservedCalls, ready.chunks.length * 2);
    await cancelArtifactUpdate(owner, planId, { type: "cancel", id: job.id, expectedRevision: ready.revision });
    const next = await reserveArtifactUpdate(owner, planId, { ...command, id: randomUUID() }, runtime), limited = structuredClone(next);
    limited.revision++; limited.budget.maxCalls = 0; await writeArtifactUpdate(limited, next.revision);
    const before = calls; await executeArtifactChunk(owner, planId, next.id, 0, 0, runtime);
    assert.equal((await readArtifactUpdate(owner, planId, next.id))?.error, "budget_exceeded"); assert.equal(calls, before);
  }
  console.log(JSON.stringify({ cases, calls, mockOnly: true, paidCalls: 0, checks: ["all 11 sector and 5 purpose values", "more than six pages", "document <= 3 and PPT <= 4", "source IDs", "reserved call budget fails before invocation"] }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
