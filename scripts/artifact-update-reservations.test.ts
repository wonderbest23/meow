import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { seedBusinessRewriteFixture } from "./proposal-rewrite-fixture";
import { loadPlanState, savePlanState } from "../lib/plan-builder/plan-server-store";
import { previewArtifactUpdate, reserveArtifactUpdate, resumeArtifactUpdate, cancelArtifactUpdate } from "../lib/plan-builder/artifact-update-service";
import { readArtifactUpdate, writeArtifactUpdate } from "../lib/plan-builder/artifact-update-store";
import { ProposalError } from "../lib/plan-builder/proposal-editor";
import type { ArtifactRuntime, ArtifactUpdate } from "../lib/plan-builder/artifact-updates";

export async function runArtifactReservationTests() {
  const owner = createHash("sha256").update(randomUUID()).digest("hex"), first = `qa-reserve-${randomUUID().slice(0, 8)}`;
  await seedBusinessRewriteFixture(owner, first);
  const state = await loadPlanState(owner), original = state.plans[0];
  const ids = [first, `${first}-b`, `${first}-c`];
  state.plans = ids.map(id => ({ ...structuredClone(original), id }));
  await savePlanState(owner, state);
  const noCall = async (): Promise<never> => { throw new Error("RESERVATIONS_MUST_NOT_CALL_AI"); };
  const runtime: ArtifactRuntime = { target: { provider: "mock", model: "reservation-only" }, document: { generate: noCall }, ppt: { target: { provider: "mock", model: "reservation-only" }, generate: noCall } };
  const reserve = async (planId: string) => {
    const preview = await previewArtifactUpdate(owner, planId, runtime.target);
    return reserveArtifactUpdate(owner, planId, { type: "generate", id: randomUUID(), hash: preview.hash, base: preview.base, consent: true, includeHomepage: false }, runtime);
  };
  const cancel = (job: ArtifactUpdate) => cancelArtifactUpdate(owner, job.planId, { type: "cancel", id: job.id, expectedRevision: job.revision });
  const blocked = (code: string) => (error: unknown) => error instanceof ProposalError && error.code === code;
  const firstJob = await reserve(first), failed = structuredClone(firstJob);
  failed.revision++; failed.status = "failed"; failed.error = "review_failed";
  await writeArtifactUpdate(failed, firstJob.revision);
  const resume = () => resumeArtifactUpdate(owner, first, { type: "resume", id: failed.id, expectedRevision: failed.revision, consent: true }, runtime);

  const replacement = await reserve(first);
  await assert.rejects(resume, blocked("review_pending"));
  await cancel(replacement);
  const second = await reserve(ids[1]), third = await reserve(ids[2]);
  await assert.rejects(() => reserve(first), blocked("limit_reached"));
  await assert.rejects(resume, blocked("limit_reached"));
  assert.equal((await readArtifactUpdate(owner, first, failed.id))?.revision, failed.revision, "Rejected resume does not mutate job/checkpoint/budget");
  await cancel(second);
  const resumed = await resume(); assert.equal(resumed.dispatchAttempt, 1); assert.equal(resumed.status, "queued");
  assert.deepEqual(resumed.budget, failed.budget, "Resuming does not reset the reserved budget");
  await cancel(resumed); await cancel(third);

  for (let i = 0; i < 4; i++) await cancel(await reserve(first));
  await assert.rejects(() => reserve(first), blocked("limit_reached"));
  for (let i = 0; i < 4; i++) await cancel(await reserve(ids[1]));
  await assert.rejects(() => reserve(ids[2]), blocked("limit_reached"));
  return ["new job owner concurrency", "resume owner concurrency", "resume plan review exclusion", "rejected resume atomicity", "resumed budget preserved", "six reservations per plan/day", "twelve reservations per owner/day"];
}

if (process.argv[1]?.endsWith("artifact-update-reservations.test.ts")) {
  void (async () => {
    Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", PROPOSAL_AI_ENABLED: "false", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
    let allowed: string | undefined;
    if (process.argv.includes("--local")) {
      const { localCredentials } = await import(new URL("./local-account-lab.mts", import.meta.url).href);
      const credentials = await localCredentials(); assert.equal(credentials.apiUrl, "http://127.0.0.1:55431");
      Object.assign(process.env, { PERSISTENCE_MODE: "supabase", SUPABASE_URL: credentials.apiUrl, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey });
      allowed = credentials.apiUrl;
    }
    const transport = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      assert(allowed && url.origin === allowed, "Only isolated local Supabase is allowed");
      return transport(input, init);
    };
    console.log(JSON.stringify({ passed: await runArtifactReservationTests(), localSql: !!allowed, paidCalls: 0 }));
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
