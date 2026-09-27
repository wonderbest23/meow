import assert from "node:assert/strict";
import { needsEntryConfirmation, typedEntryCommand, entrySubmission, confirmedEntryCommand, emptyDraft, parseDraft } from "../app/plan/chat/intake-ui/model";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { saveIntakeCommand } from "../lib/plan-builder/intake-service";

export const entryCases = [
  ["카페를 운영하고 있지는 않아요", true],
  ["카페를 운영 중이지는 않아요", true],
  ["카페를 운영하고 있는 것은 아니에요", true],
  ["카페를 운영 중인데 아직 적자예요", false],
  ["카페를 운영 중이며 2호점도 계획하고 있어요", false],
  ["예전에 카페를 운영했지만 지금은 폐업했어요", true],
  ["친구가 카페를 운영하고 저는 다른 사업을 찾고 있어요", true],
  ["운영하지 않는 건 아니에요", true],
] as const;

let failures = 0;
for (const [text, confirm] of entryCases) {
  try {
    assert.equal(needsEntryConfirmation(text), confirm, text);
    if (!confirm) { assert.equal(typedEntryCommand(text).mode, "operating"); assert.equal(typedEntryCommand(text).value, text); }
    else if (text.includes("있지는") || text.includes("중이지는") || text.includes("있는 것은")) assert.notEqual(typedEntryCommand(text).mode, "operating");
    console.log(`PASS ${text}`);
  } catch (error) { failures++; console.error(`FAIL ${text}: ${error instanceof Error ? error.message : error}`); }
}
if (failures) process.exitCode = 1;

async function confirmationFlow() {
  const screen = readFileSync(new URL("../app/plan/chat/BusinessIntake.tsx", import.meta.url), "utf8");
  assert(screen.includes("const entry = entrySubmission(text)"));
  assert(screen.includes("send(confirmedEntryCommand(mode, text)"));
  assert(screen.includes("initialMessage={draft.introMessage} onStart={startFromCard}"));
  for (const [text, confirm] of entryCases) {
    const route = entrySubmission(text);
    assert.equal(route.kind, confirm ? "confirm" : "send");
    if (route.kind !== "confirm") continue;
    assert.equal("command" in route, false, "no request before user confirmation");
    const owner = `negation-${randomUUID()}`;
    const draft = { ...emptyDraft(), ownerScope: owner, introMessage: route.text };
    const restored = parseDraft(JSON.stringify(draft), null, owner);
    assert.equal(restored.introMessage, text);
    for (const mode of ["exploring", "startup", "operating"] as const) {
      const command = confirmedEntryCommand(mode, restored.introMessage!);
      assert.equal("value" in command, false, "stage confirmation must not confirm a business name");
      const saved = await saveIntakeCommand(`${owner}-${mode}`, { ...command, requestId: randomUUID(), revision: 0 });
      assert.equal(saved.snapshot.coach.stage, mode);
      assert.equal(saved.snapshot.coach.fields.some(field => field.key === "business"), false);
      assert(saved.snapshot.intake.notes.some(note => note.text === text));
      assert(saved.snapshot.nextQuestion);
    }
  }
  console.log("PASS production entry routing, draft restore, explicit stage request and actual service persistence (not browser E2E)");
}
confirmationFlow().catch(error => { console.error(error); process.exitCode = 1; });
