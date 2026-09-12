import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORKSPACE_DEMO_DURATION, WORKSPACE_DEMO_STEPS, workspaceDemoFrame } from "../lib/home-workspace-motion";
import { SAMPLE } from "../lib/plan-builder/samples/coffee";
import sample from "../public/home-media/results/workspace-sample.json";

assert.equal(WORKSPACE_DEMO_DURATION, 36_000);
assert.equal(WORKSPACE_DEMO_STEPS.length, 3);
for (const [progress, step] of [[0, 0], [.32, 0], [1 / 3, 1], [.65, 1], [2 / 3, 2], [1, 2]]) {
  assert.equal(workspaceDemoFrame(progress).step, step);
}
assert.equal(workspaceDemoFrame(NaN).progress, 0);
assert.equal(workspaceDemoFrame(-1).progress, 0);
assert.equal(workspaceDemoFrame(2).progress, 1);
assert.equal(workspaceDemoFrame(1).reportOpen, 1);
assert.equal(workspaceDemoFrame(1).cursorOpacity, 0);
for (let ms = 0; ms <= WORKSPACE_DEMO_DURATION; ms += 16) {
  const frame = workspaceDemoFrame(ms / WORKSPACE_DEMO_DURATION);
  for (const key of ["pan", "focus", "cursorMove", "cursorOpacity", "click", "entrance", "reportOpen", "reportPan"] as const) assert.ok(frame[key] >= 0 && frame[key] <= 1, key);
  assert.deepEqual(frame, workspaceDemoFrame(ms / WORKSPACE_DEMO_DURATION), "seeking is deterministic");
}
for (const second of [3, 6, 15, 18, 27, 33]) assert.equal(workspaceDemoFrame(second / 36).cursorOpacity, 0, "reading holds have no distracting cursor");
assert.equal(Object.keys(SAMPLE.sections).length, 25, "document count matches the public sample");
assert.equal(sample.count, Object.keys(SAMPLE.sections).length);
assert.equal(sample.html, SAMPLE.sections["overview/summary"].html, "reader shows actual sample text without fabricated content");
assert.equal(sample.planType, SAMPLE.planType);
assert.ok(!/<script|\bon\w+=|javascript:/i.test(sample.html), "baked trusted sample is static document markup");

const source = readFileSync("components/home-workspace-demo.tsx", "utf8");
const page = readFileSync("app/plan/workspace/page.tsx", "utf8");
for (const component of ["WorkspaceIdentity", "WorkspaceNavigation", "WorkspaceSummary", "WorkspaceDocumentStatus"]) {
  assert.ok(source.includes(`<${component}`) && page.includes(`<${component}`), `${component} is shared with the actual app`);
}
const document = readFileSync("app/plan/document/DocumentWorkspace.tsx", "utf8");
for (const component of ["DocumentReadHeading", "DocumentChapterHeading", "DocumentSectionHeading"]) assert.ok(source.includes(`<${component}`) && document.includes(`<${component}`), `${component} is shared with the document reader`);
assert.ok(source.includes("workspace-sample.json"), "the scene uses the baked public sample's information");
assert.ok(source.includes("aria-hidden=\"true\" inert"), "demo controls cannot navigate or modify user data");
assert.ok(!/fetch\(|localStorage|saveAnswers|pushToServer|hydrateFromServer/.test(source), "demo never accesses account data or generation APIs");
assert.ok(source.includes("IntersectionObserver") && source.includes("document.hidden") && source.includes("prefers-reduced-motion"));
assert.ok(source.includes("cancelAnimationFrame") && source.includes("resize.disconnect()"));
console.log("Workspace demo: shared app UI, public data, 36-second motion and isolated controls passed");
