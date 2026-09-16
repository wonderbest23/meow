import assert from "node:assert/strict";
import { deckExportState, proposalEntryState } from "../lib/plan-builder/deck-export-state";
import type { PublicDeckJob } from "../lib/plan-builder/deck-job-types";

const failed: PublicDeckJob = { token: "727ee46b-fixture", runId: "fixture", fingerprint: "fixture", status: "failed", phase: "failed", updatedAt: "2026-09-11T00:00:00Z", attempt: 1, code: "review_response_invalid", resumable: true, ready: false };
const closed = { job: failed, stale: false, loaded: true, statusError: false, generationEnabled: false };
const waiting = deckExportState(closed);
assert.equal(waiting.action, "refresh");
assert.equal(waiting.label, "PPT 제공 상태 확인");
assert.match(waiting.message, /보관/);
assert.match(waiting.message, /재시도는 현재 중지/);
assert.match(waiting.message, /727ee46b/);
assert.doesNotMatch(waiting.message, /다시 시도하면|검토부터 이어갑니다/);
assert.equal(deckExportState({ ...closed, job: null }).action, "refresh");
assert.equal(deckExportState({ ...closed, job: { ...failed, status: "complete", phase: "ready", ready: true } }).action, "download");
assert.equal(deckExportState({ ...closed, job: { ...failed, status: "complete", phase: "ready", ready: true }, stale: true }).action, "refresh");
for (const state of [{ ...closed, loaded: false }, { ...closed, statusError: true }]) {
  assert.equal(deckExportState(state).action, "refresh");
  assert.equal(deckExportState(state).label, "PPT 상태 다시 확인");
}
const resumed = deckExportState({ ...closed, generationEnabled: true });
assert.equal(resumed.action, "generate");
assert.equal(resumed.label, "발표자료 다시 시도");
assert.match(resumed.message, /검토부터 이어갑니다/);
const invalid = deckExportState({ ...closed, generationEnabled: true, job: { ...failed, code: "review_json_invalid" } });
assert.match(invalid.message, /슬라이드 구성부터 시작/);
const stale = deckExportState({ ...closed, generationEnabled: true, stale: true });
assert.equal(stale.label, "최신 내용으로 PPT 만들기");
assert.doesNotMatch(stale.message, /검토부터 이어갑니다/);
const failedEntry = proposalEntryState({ job: failed, editable: false, generationEnabled: false });
assert.equal(failedEntry.action, "blocked");
assert.match(failedEntry.message, /보관.*재시도는 현재 중지.*727ee46b/);
assert.doesNotMatch(failedEntry.message, /다시 시도하면|검토부터 이어갑니다/);
assert.equal(proposalEntryState({ job: null, editable: false, generationEnabled: false }).action, "blocked");
const ready = { ...failed, status: "complete" as const, phase: "ready" as const, ready: true };
assert.equal(proposalEntryState({ job: ready, editable: true, generationEnabled: false }).action, "initialize", "Existing verified editor results remain usable when generation is closed");
assert.equal(proposalEntryState({ job: ready, editable: false, generationEnabled: false }).action, "blocked", "Legacy PPT is not an editable v2 proposal");
assert.match(proposalEntryState({ job: ready, editable: false, generationEnabled: true }).label, /새 형식/);
for (const status of ["queued", "running"] as const) {
  const active = proposalEntryState({ job: { ...failed, status, phase: "reviewing" }, editable: false, generationEnabled: false });
  assert.equal(active.action, "wait");
  assert.match(active.message, /계획서와 내용/);
}
assert.equal(proposalEntryState({ job: failed, editable: false, generationEnabled: true }).action, "generate");
console.log("deck export state: closed generation, read-only refresh, saved downloads, stale source and conditional retry passed");
