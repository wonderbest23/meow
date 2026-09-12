import assert from "node:assert/strict";
import { heroExpansionFrame } from "../lib/home-hero-motion";

assert.deepEqual(heroExpansionFrame(0), { progress: 0, inset: 12, radius: 22, imageHeight: 65, feather: 120, scale: 1 });
assert.deepEqual(heroExpansionFrame(1), { progress: 1, inset: 0, radius: 0, imageHeight: 100, feather: 0, scale: 1.035 });
assert.deepEqual(heroExpansionFrame(-1), heroExpansionFrame(0));
assert.deepEqual(heroExpansionFrame(Number.NaN), heroExpansionFrame(0));
assert.deepEqual(heroExpansionFrame(2), heroExpansionFrame(1));

let previous = heroExpansionFrame(0);
for (let step = 1; step <= 100; step++) {
  const value = heroExpansionFrame(step / 100);
  assert(value.inset <= previous.inset);
  assert(value.radius <= previous.radius);
  assert(value.feather <= previous.feather);
  assert(value.imageHeight >= previous.imageHeight);
  assert(value.scale >= previous.scale && value.scale <= 1.035);
  previous = value;
}
for (const progress of [0.78, 0.85, 0.95, 1]) {
  const value = heroExpansionFrame(progress);
  assert.equal(value.inset, 0);
  assert.equal(value.imageHeight, 100);
}
const midpoint = heroExpansionFrame(0.39);
assert.equal(midpoint.inset, 6);
assert.equal(midpoint.imageHeight, 82.5);
assert.deepEqual(heroExpansionFrame(0.39), midpoint);
console.log("Hero expansion: smooth opening, full-photo hold and reverse-scroll frames passed");
