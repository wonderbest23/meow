import assert from "node:assert/strict";
import { PHONE_SCROLL_MIN_SECONDS, PHONE_STORY_DURATION_SECONDS, advancePhoneScroll, phoneMotion, phoneScrollProgress, phoneStoryPins, phoneStoryScrollDistance } from "../lib/home-phone-motion";

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
assert.equal(phoneStoryPins(840, 692), true);
assert.equal(phoneStoryPins(1440, 600), true, "Short desktop windows retain the pinned story");
assert.equal(phoneStoryPins(1440, 519), false);
assert.equal(phoneStoryPins(390, 844), true);
assert.equal(phoneStoryPins(390, 600), false);
assert.equal(phoneStoryPins(1440, 900, true), false);
assert.equal(phoneStoryScrollDistance(840, 692), 7200);
assert.equal(phoneStoryScrollDistance(1440, 900), 9000);
assert.equal(phoneStoryScrollDistance(2560, 1440), 10800);
assert.equal(phoneStoryScrollDistance(390, 844), 3000, "Mobile scroll distance stays unchanged");
assert.equal(phoneScrollProgress(-1), 0);
assert.equal(phoneScrollProgress(NaN), 0);
assert.equal(phoneScrollProgress(2), 1);
for (const [start, end, held] of [[.11, .25, .2], [.49, .63, .67], [.79, .94, .98]]) {
  for (let p = start; p < end; p += .001) assert.equal(phoneScrollProgress(p), held);
  assert.ok((end - start) * phoneStoryScrollDistance(840, 692) >= 1000, "Each reading hold spans more than one desktop viewport");
}
for (let index = 1; index <= 1000; index++) {
  const previous = phoneScrollProgress((index - 1) / 1000), next = phoneScrollProgress(index / 1000);
  assert.ok(next >= previous && next - previous < .003, "Scroll choreography stays continuous and reversible");
}
assert.equal(advancePhoneScroll(.2, .8, 0), .2);
assert.equal(advancePhoneScroll(.2, .8, NaN), .2);
assert.equal(advancePhoneScroll(.2, .8, -1), .2);
for (const fps of [30, 60, 120]) {
  let forward = 0, reverse = 1;
  for (let frame = 0; frame < fps; frame++) {
    forward = advancePhoneScroll(forward, 1, 1 / fps);
    reverse = advancePhoneScroll(reverse, 0, 1 / fps);
  }
  assert.ok(forward <= 1 / PHONE_SCROLL_MIN_SECONDS + .00001, "One fast wheel burst cannot consume the story in one second");
  assert.ok(reverse >= 1 - 1 / PHONE_SCROLL_MIN_SECONDS - .00001);
}
let settled = 0;
for (let frame = 0; frame < 60 * 20; frame++) settled = advancePhoneScroll(settled, .67, 1 / 60);
assert.equal(settled, .67, "The animation settles exactly at its scroll target");
assert.ok(advancePhoneScroll(.2, .8, 120) < .204, "Returning from a background tab cannot jump the timeline");
console.log("Phone motion: ordering, reading holds, desktop scroll distance, speed limits and reverse determinism passed");
