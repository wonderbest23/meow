import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EXTENSION_APPROVAL_ID, SyntheticAiBudget } from "./synthetic-ai-budget";

async function main() {
const root = mkdtempSync(join(tmpdir(), "oneul-budget-test-"));
const request = { method: "POST", body: JSON.stringify({ model: "gpt-6-astra", store: false, max_output_tokens: 4000, input: [{ role: "system", content: "Synthetic QA only" }, { role: "user", content: "가상 사업" }] }) };
const endpoint = "https://api.openai.com/v1/responses";
let sent = 0;
const fake: typeof fetch = async (_url, init) => {
  sent++;
  assert.equal(JSON.parse(init!.body as string).service_tier, "default");
  assert.equal(init!.redirect, "error");
  assert.equal(JSON.parse(readFileSync(join(root, "budget.json"), "utf8")).calls.at(-1).status, "reserved");
  return Response.json({ status: "completed", usage: { input_tokens: 100, output_tokens: 200 } });
};
try {
  assert.throws(() => new SyntheticAiBudget(root, 5.01), /approval/i);
  const budget = new SyntheticAiBudget(root, 1);
  assert.throws(() => new SyntheticAiBudget(root, 1), /lock/);
  const fetch = budget.wrap(fake);
  await assert.rejects(fetch("https://other.invalid", request), /Only/);
  await assert.rejects(fetch(endpoint, { ...request, body: JSON.stringify({ ...JSON.parse(request.body), tools: [] }) }), /Unexpected/);
  await assert.rejects(fetch(endpoint, { ...request, body: JSON.stringify({ ...JSON.parse(request.body), model: "toString" }) }), /pricing/);
  await fetch(endpoint, request);
  assert.equal(sent, 1);
  const reserved = budget.summary().reservedUpperBoundUsd;
  assert(reserved > 0.7 && reserved < 1);
  await assert.rejects(fetch(endpoint, request), /budget/);
  assert.equal(sent, 1); budget.close();
  const reopened = new SyntheticAiBudget(root, 5);
  assert.equal(reopened.summary().limitUsd, 1, "A new invocation cannot expand the original approval");
  assert.equal(reopened.summary().reservedUpperBoundUsd, reserved);
  await assert.rejects(reopened.wrap(fake)(endpoint, request), /budget/); reopened.close();
  const uncertain = new SyntheticAiBudget(join(root, "uncertain"), 5);
  const failing = uncertain.wrap(async () => { throw new Error("Timeout"); });
  await assert.rejects(failing(endpoint, request), /Timeout/);
  assert(uncertain.summary().reservedUpperBoundUsd > 0);
  assert.equal(uncertain.summary().calls[0].status, "uncertain");
  await assert.rejects(failing(endpoint, request), /stopped/); uncertain.close();
  const corrupt = join(root, "corrupt");
  const initial = new SyntheticAiBudget(corrupt, 5); initial.close();
  writeFileSync(join(corrupt, "budget.json"), "{}");
  assert.throws(() => new SyntheticAiBudget(corrupt, 5));
  const extended = new SyntheticAiBudget(root, 10, { id: EXTENSION_APPROVAL_ID, additionalUsd: 5 });
  assert.equal(extended.summary().limitUsd, 6);
  assert.equal(extended.summary().reservedUpperBoundUsd, reserved);
  assert.equal(extended.summary().extensions.length, 1); extended.close();
  const again = new SyntheticAiBudget(root, 10, { id: EXTENSION_APPROVAL_ID, additionalUsd: 5 });
  assert.equal(again.summary().limitUsd, 6, "Reusing the approval cannot add another five dollars"); again.close();
  const capped = new SyntheticAiBudget(root, 1); assert.equal(capped.summary().limitUsd, 1); capped.close();
  const resumed = new SyntheticAiBudget(root, 10, { id: EXTENSION_APPROVAL_ID, additionalUsd: 5 }); assert.equal(resumed.summary().limitUsd, 6); resumed.close();
  assert.throws(() => new SyntheticAiBudget(join(root, "missing-ledger"), 10, { id: EXTENSION_APPROVAL_ID, additionalUsd: 5 }), /original ledger/);
  console.log("synthetic AI budget: pre-call reservation, cumulative limit, lock, restart, timeout retention, endpoint/tier restrictions and corrupt-ledger refusal passed");
} finally { rmSync(root, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
