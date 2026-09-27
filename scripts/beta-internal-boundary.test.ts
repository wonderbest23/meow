import assert from "node:assert/strict";
import { betaApiBoundary } from "../lib/staging/beta-boundary";
import { handlePlanSectionServiceRequest } from "../lib/plan-builder/section-service";
import { POST } from "../app/api/internal/plan-section/route";
import { signBody } from "../lib/plan-builder/section-signature";

async function main() {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error("UNEXPECTED_NETWORK"); };
  process.env.INTAKE_BETA_SAFETY = "1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-internal-test-only";
  const body = JSON.stringify({ operation: "intake", job: { ownerHash: "synthetic", planId: "synthetic", jobId: "8f42cc0e-143c-47af-bb45-f7a087643503" } });
  const stamp = String(Date.now());
  const signature = await signBody(process.env.SUPABASE_SERVICE_ROLE_KEY, stamp, body);
  for (const path of ["/__internal/plan-section", "/api/internal/plan-section"]) {
    for (const signed of [false, true]) {
      const make = () => new Request("https://beta.invalid" + path, {
        method: "POST", body,
        headers: signed ? {"x-plan-timestamp": stamp, "x-plan-signature": signature} : {}
      });
      for (const response of [betaApiBoundary(make(), "1"), await handlePlanSectionServiceRequest(make(), {SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY}), await POST(make())]) {
        assert.equal(response?.status, 403, `${path} signed=${signed}`);
        assert.equal((await response!.json()).code, "beta_scope_restricted");
      }
      assert.equal(calls, 0);
    }
    delete process.env.INTAKE_BETA_SAFETY;
    assert.equal(betaApiBoundary(new Request("https://other.invalid" + path), undefined), null);
    const unsigned = new Request("https://other.invalid" + path, {method: "POST", body});
    assert.equal((await handlePlanSectionServiceRequest(unsigned, {SUPABASE_SERVICE_ROLE_KEY: "synthetic"}))?.status, 404);
    process.env.INTAKE_BETA_SAFETY = "1";
  }
  assert.equal(betaApiBoundary(new Request("https://beta.invalid/api/plan/chat", {method:"POST", headers:{"x-business-intake":"2"}}), "1"), null);
  assert.equal(calls, 0);
  console.log("PASS Worker boundary + direct Next receiver; signed/unsigned beta denied; non-beta signature guard unchanged; network calls=0");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
