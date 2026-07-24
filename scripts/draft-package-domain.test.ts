import assert from "node:assert/strict";
import {
  createDraftPackageRun,
  startDraftPackageStep,
  waitForDraftPackageAI,
} from "../lib/draft-package/domain";

const run = createDraftPackageRun("draft-test", "initial", "2026-07-15T00:00:00.000Z");
const started = startDraftPackageStep(run, 1, "2026-07-15T00:01:00.000Z");
assert.equal(started.status, "running");
assert.equal(started.steps[1].status, "running");

const waiting = waitForDraftPackageAI(started, 1, "2026-07-15T00:02:00.000Z");
assert.equal(waiting.status, "waiting");
assert.equal(waiting.currentStep, 1);
assert.equal(waiting.steps[1].status, "running");
assert.match(waiting.message, /다시 누르지 않아도/);

const resumed = startDraftPackageStep(waiting, 1, "2026-07-15T00:07:00.000Z");
assert.equal(resumed.status, "running");
assert.match(resumed.message, /현재 만드는 자료/);

console.log("draft-package-domain.test.ts passed");
