import assert from "node:assert/strict";
import { PHONE_STORY_DURATION_SECONDS, phoneMotion } from "../lib/home-phone-motion";

assert.equal(phoneMotion(-1).progress, 0);
assert.equal(phoneMotion(2).progress, 1);
assert.equal(phoneMotion(NaN).progress, 0);
for (let p = 0; p <= 1; p += .001) {
  const state = phoneMotion(p);
  for (const value of Object.values(state)) assert.ok(value >= 0 && value <= 1);
  if (state.messageDetach > 0) {
    assert.equal(state.send, 1);
    assert.equal(state.answer, 1);
  }
  if (state.messageLift > 0) assert.equal(state.messageDetach, 1, "The bubble detaches at its exact in-phone pose before lifting");
  if (state.messageDetach > 0 && state.messageDetach < 1) assert.equal(state.messageLift, 0, "Crossfades only happen at the original screen position");
  if (state.send > 0) assert.equal(state.type, 1);
  if (state.answer > 0) {
    assert.equal(state.send, 1);
  }
  if (state.generate > 0) assert.equal(state.answer, 1);
  if (state.brief > 0) assert.equal(state.generate, 1);
  if (state.focus > 0) assert.equal(state.brief, 1);
  if (state.focus > 0) assert.equal(state.focusDetach, 1);
  if (state.focusDetach > 0) assert.equal(state.insideScroll, 1);
  if (state.focusDetach > 0 && state.focusDetach < 1) assert.equal(state.focus, 0);
  if (state.document > 0) assert.equal(state.focus, 0);
  if (state.document > 0) assert.equal(state.focusDetach, 0);
  if (state.complete > 0) assert.equal(state.document, 1);
}
assert.ok(phoneMotion(.61).focus > 0 && phoneMotion(.61).focus < 1);
assert.equal(phoneMotion(.67).focus, 1);
assert.equal(phoneMotion(.8).focus, 0);
assert.equal(phoneMotion(.10).messageDetach, 0, "The message first appears inside the phone");
assert.equal(phoneMotion(.10).send, 1);
assert.equal(phoneMotion(.20).messageLift, 1, "Hold the lifted UI card, not loose headline text");
assert.equal(phoneMotion(.355).messageLift, 0);
assert.equal(phoneMotion(.37).messageDetach, 0, "The lifted message returns before the business brief");
assert.equal(PHONE_STORY_DURATION_SECONDS, 48);
for (const key of ["messageLift", "focus"] as const) {
  const held = Array.from({ length: 1001 }, (_, index) => phoneMotion(index / 1000)[key] === 1).filter(Boolean).length;
  assert.ok(held / 1000 * PHONE_STORY_DURATION_SECONDS >= 5.5, `${key} needs at least 5.5 seconds of uninterrupted reading time`);
}
const forward = [.1,.2,.4,.54,.7,.85].map(phoneMotion);
const reverse = [.85,.7,.54,.4,.2,.1].map(phoneMotion).reverse();
assert.deepEqual(forward, reverse);
console.log("Phone motion: ordering, reading time, continuous emphasis, bounds and reverse determinism passed");
