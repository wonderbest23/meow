import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { localCredentials } from "./local-account-lab.mts";

const credentials = await localCredentials();
assert.equal(credentials.apiUrl, "http://127.0.0.1:55431");
Object.assign(process.env, { PERSISTENCE_MODE: "supabase", SUPABASE_URL: credentials.apiUrl, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey, PROPOSAL_AI_ENABLED: "false", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
const transport = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  assert.equal(url.origin, credentials.apiUrl, "Only the isolated local Supabase endpoint is allowed");
  return transport(input, init);
};

// Imports do not seed fixtures or override the local credentials/fetch guard.
const { runArtifactV3OperatingTests } = await import("./artifact-v3-operating.test.ts");
const { runArtifactReservationTests } = await import("./artifact-update-reservations.test.ts");
const { runProposalSourceStalenessTests } = await import("./proposal-source-staleness.test.ts");
assert.equal(process.env.PERSISTENCE_MODE, "supabase");
const result = await runArtifactV3OperatingTests();
const db = createClient(credentials.apiUrl, credentials.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const stored = await db.from("plan_artifact_updates").select("id,status,data").eq("owner_hash", result.owner).eq("plan_id", result.planId);
assert.equal(stored.error, null);
assert.equal(stored.data?.length, 1, "The harness executes one V3 fixture and one approval job");
assert.equal(stored.data![0].id, result.jobId);
assert.equal(stored.data![0].status, "applied");
assert(stored.data![0].data.staleItems.includes("slide:copied-page"));
const limits = await runArtifactReservationTests();
const staleness = await runProposalSourceStalenessTests();
console.log(JSON.stringify({ passed: true, v3: result.checks, reservations0035: limits, staleness, v3Jobs: stored.data!.length, localSql: true, mockOnly: true, paidCalls: 0 }));
