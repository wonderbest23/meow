import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { phoneMotion, phoneScrollProgress, phoneStoryCopy, phoneStoryPins, phoneStoryScrollDistance, phoneStoryScrollPosition } from "../lib/home-phone-motion";

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
for (const key of ["messageLift", "focus"] as const) {
  const held = Array.from({ length: 1001 }, (_, index) => phoneMotion(index / 1000)[key] === 1).filter(Boolean).length;
  assert.ok(held >= 115, `${key} reserves a full reading interval in the scroll timeline`);
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
for (const [width, height] of [[454, 692], [1440, 900], [1440, 500], [390, 600]]) {
  const pinned = phoneStoryPins(width, height);
  const stageHeight = pinned ? height - 64 : 820;
  const trackHeight = pinned ? stageHeight + phoneStoryScrollDistance(width, height) : stageHeight;
  const distance = pinned ? trackHeight - stageHeight : trackHeight + height - 64;
  const start = pinned ? 64 : height - 64;
  const position = (value: number) => phoneStoryScrollPosition({ top: start - value * distance, trackHeight, stageHeight, viewportHeight: height, pinned });
  for (const value of [0, .18, .42, .67, 1]) {
    assert.ok(Math.abs(position(value) - value) < .00001);
    const initial = phoneMotion(phoneScrollProgress(position(value)));
    for (let frame = 0; frame < 600; frame++) assert.deepEqual(phoneMotion(phoneScrollProgress(position(value))), initial, "An unchanged scroll position cannot advance the story");
  }
  assert.deepEqual([.18, .67, .42].map(position), [.42, .67, .18].map(position).reverse());
  assert.equal(position(-1), 0);
  assert.equal(position(2), 1);
}
const stage = readFileSync("components/home-phone-stage.ts", "utf8");
const story = readFileSync("components/home-phone-story.tsx", "utf8");
const storyCss = readFileSync("components/home-phone-story.module.css", "utf8");
assert.doesNotMatch(stage, /PHONE_STORY_DURATION|advancePhoneScroll|seconds\s*\+=|auto\s*=/, "The live story has no time-based playback path");
assert.doesNotMatch(story, /onFocus=|onBlur=/, "Focusing or leaving the scrubber cannot start playback");
for (let index = 0; index <= 1000; index++) {
  const state = phoneStoryCopy(index / 1000);
  assert.ok(state.scenes.filter(scene => scene.visible).length <= 1, "Outgoing and incoming headings never overlap");
  for (const scene of state.scenes) for (const part of scene.parts) {
    assert.ok(part.opacity >= 0 && part.opacity <= 1);
    assert.ok(part.y >= -24 && part.y <= 32);
  }
}
for (const [index, progress] of [.2, .67, .98].entries()) {
  const state = phoneStoryCopy(progress);
  assert.equal(state.chapter, index);
  assert.deepEqual(state.scenes[index].parts, Array(3).fill({ opacity: 1, y: 0 }), "Every line stays sharp and still throughout the reading hold");
  for (let frame = 0; frame < 600; frame++) assert.deepEqual(phoneStoryCopy(progress), state);
}
const entering = phoneStoryCopy(.48).scenes[1].parts;
assert.ok(entering[0].opacity > entering[1].opacity && entering[1].opacity > entering[2].opacity, "Heading lines enter before the supporting text");
assert.ok(entering[0].y < entering[1].y);
assert.ok(entering[2].y <= 20, "Supporting text never enters the button's 28px spacing");
const leaving = phoneStoryCopy(.4).scenes[0].parts;
assert.ok(leaving[0].opacity < leaving[1].opacity && leaving[1].opacity < leaving[2].opacity);
assert.ok(leaving.every(part => part.y < 0), "Outgoing lines lift up as they fade");
assert.equal(phoneStoryCopy(0, 0).scenes[0].visible, false);
assert.equal(phoneStoryCopy(0, 1).scenes[0].visible, true);
assert.equal(phoneStoryCopy(1, 1, 1).scenes[2].visible, false, "The last heading leaves with the section");
assert.deepEqual(phoneStoryCopy(.555, 0, 1, true).scenes[1].parts, Array(3).fill({ opacity: 1, y: 0 }), "Reduced motion remains fully readable regardless of viewport entrance or exit");
assert.deepEqual([0, .4, .48, .67, .83, .9, 1].map(p => phoneStoryCopy(p)), [1, .9, .83, .67, .48, .4, 0].map(p => phoneStoryCopy(p)).reverse());
assert.doesNotMatch(storyCss, /transition: opacity \.16s|transition-delay: \.15s/, "Text frames cannot continue on a timer after scrolling stops");
assert.match(story, /data-copy-part/);
console.log("Phone motion: scroll-only progression, staggered text, reading holds, reduced motion and reverse determinism passed");
